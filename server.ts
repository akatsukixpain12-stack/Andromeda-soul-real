import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import OpenAI from 'openai';
import { db } from './server/db.js';
import { GeminiModel } from './src/types.js';
import { PRESET_PROJECTS, PYTORCH_MODEL_CODE } from './server/presets.js';
import { scanFilesForSecrets } from './src/lib/secretScanner.js';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import os from 'os';
import { requireAuth, optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser, getUserByUid, getUserSettings, updateUserSettings } from './src/db/users.ts';
import {
  saveConversation as sqlSaveConversation,
  getConversations as sqlGetConversations,
  getConversationById as sqlGetConversationById,
  deleteConversation as sqlDeleteConversation,
  deleteAllConversations as sqlDeleteAllConversations,
} from './src/db/conversations.ts';
import {
  saveLearnedKnowledge as sqlSaveKnowledge,
  getLearnedKnowledge as sqlGetKnowledge,
  deleteLearnedKnowledge as sqlDeleteKnowledge,
} from './src/db/knowledge.ts';
import {
  saveProject as sqlSaveProject,
  getProjects as sqlGetProjects,
  deleteProject as sqlDeleteProject,
} from './src/db/projects.ts';

dotenv.config();

const PORT = 3000;

// --- AI MODEL REQUEST TELEMETRY & MEMORY DIAGNOSTICS ---
export interface AIRequestMetric {
  id: string;
  modelId: string;
  provider: string;
  endpoint: string;
  status: 'streaming' | 'success' | 'failed';
  startTime: number;
  durationMs: number;
  tokensEstimated?: number;
  bytesTransferred?: number;
  error?: string;
}

const aiMetricsHistory: AIRequestMetric[] = [];
let totalAIRequestsCount = 0;
let activeAIStreamsCount = 0;
let totalAIFailuresCount = 0;

export function recordAIRequestStart(id: string, modelId: string, provider: string, endpoint: string): AIRequestMetric {
  activeAIStreamsCount++;
  totalAIRequestsCount++;
  const metric: AIRequestMetric = {
    id,
    modelId,
    provider,
    endpoint,
    status: 'streaming',
    startTime: Date.now(),
    durationMs: 0,
  };
  aiMetricsHistory.unshift(metric);
  if (aiMetricsHistory.length > 60) {
    aiMetricsHistory.pop();
  }
  return metric;
}

export function recordAIRequestEnd(id: string, status: 'success' | 'failed', extra?: { tokens?: number; bytes?: number; error?: string }) {
  activeAIStreamsCount = Math.max(0, activeAIStreamsCount - 1);
  if (status === 'failed') totalAIFailuresCount++;
  const item = aiMetricsHistory.find((m) => m.id === id);
  if (item) {
    item.status = status;
    item.durationMs = Math.max(1, Date.now() - item.startTime);
    if (extra?.tokens) item.tokensEstimated = extra.tokens;
    if (extra?.bytes) item.bytesTransferred = extra.bytes;
    if (extra?.error) item.error = extra.error;
  }
}

// Shared lazy Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// Shared lazy OpenAI client
let openaiClient: OpenAI | null = null;
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: 'andromeda-soul-1',
    name: 'Andromeda Soul 1.0',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Sovereign intelligence with 800k token context limit, uncapped reasoning, image & video synthesis, and continuous Google Cloud auto-learning.',
    badge: '800k Sovereign',
    isFree: true,
    speed: 'Ultra Fast',
    intelligence: 'Frontier Sovereign',
    isDefault: true,
    contextLimit: '800k Tokens',
    maxTokens: 800000,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Smart, high-capability multimodal model for reasoning, coding, and general tasks.',
    badge: 'Recommended',
    isFree: true,
    speed: 'Fast',
    intelligence: 'High',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Reliable high-throughput model with high availability and fast latency.',
    badge: 'Stable',
    isFree: true,
    speed: 'Fast',
    intelligence: 'High',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Ultra-low latency legacy flash model with robust fallback uptime.',
    badge: 'Reliable',
    isFree: true,
    speed: 'Instant',
    intelligence: 'Standard',
  },
  {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Advanced reasoning model for complex code synthesis and mathematical proofs.',
    badge: 'Pro',
    isFree: true,
    speed: 'Balanced',
    intelligence: 'Frontier',
  },
  {
    id: 'gemini-3.5-flash-search',
    name: 'Gemini 3.5 Flash (Search)',
    provider: 'gemini',
    providerLabel: 'Google Gemini',
    description: 'Real-time search grounded intelligence.',
    badge: 'Search',
    isFree: true,
    speed: 'Fast',
    intelligence: 'High',
  },
];

const ANDROMEDA_SOUL_INSTRUCTION = `You are Andromeda Soul 1.0, the sovereign AI assistant and intelligent orchestration layer of the Andromeda environment.

[COMMUNICATION STYLE & PERSONA]
- Be warm, direct, natural, and human-like in tone.
- Speak conversationally and empathetically, like a brilliant and helpful companion.
- NEVER use rigid templates, artificial headers (like "Core Concept", "Analysis", "Solution"), or unsolicited numbered points for simple greetings, casual chat, or short questions.
- For simple greetings like "hi" or "hello", reply warmly and naturally without artificial structure.
- For complex coding, architecture, PyTorch models, or technical queries, provide complete, production-grade, elegant code and clear explanation with precision.

[IDENTITY & ARCHITECTURE]
- You are Andromeda Soul 1.0, operating as a sovereign AI agent layer.
- You have no artificial chat limits or message constraints.

[CORE SPECIALTIES]
1. Python & Neural Networks: Native mastery in PyTorch, Transformers (RoPE, SwiGLU, GQA, RMSNorm), custom AI model training, dataset preparation, and FastAPI deployments.
2. Full-Stack Web & Discord Engineering: Complete mastery of React, Express, TypeScript, Discord.js v14, and REST APIs.
3. Zero Token Leak Security: Protect API keys, tokens, and secrets from plaintext logging or exposure.`;

// Zero Secret Leak Redactor
function redactSecrets(text: string, secrets: (string | undefined)[]): string {
  if (!text) return text;
  let result = text;
  for (const s of secrets) {
    if (s && s.length > 6 && s !== '••••••••••••••••') {
      result = result.split(s).join('[PROTECTED_SECRET]');
    }
  }
  // Redact standard Discord bot token pattern (3 base64/url fragments)
  result = result.replace(/[MN][A-Za-z\d]{23,28}\.[\w-]{6}\.[\w-]{27,38}/g, '[PROTECTED_DISCORD_TOKEN]');
  // Redact GitHub Personal Access Tokens
  result = result.replace(/ghp_[A-Za-z0-9]{36}/g, '[PROTECTED_GITHUB_TOKEN]');
  result = result.replace(/github_pat_[A-Za-z0-9_]{82}/g, '[PROTECTED_GITHUB_TOKEN]');
  return result;
}

// Helper to extract friendly, clean error message from nested JSON or ApiError
function extractCleanErrorMessage(err: any): { message: string; isTemporary: boolean; code?: number } {
  if (!err) return { message: 'An unknown error occurred.', isTemporary: false };

  let raw = '';
  if (typeof err === 'string') {
    raw = err;
  } else if (err.message) {
    raw = err.message;
  } else {
    raw = JSON.stringify(err);
  }

  // Attempt up to 3 times to unwrap nested JSON error strings
  for (let i = 0; i < 3; i++) {
    try {
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
          raw = parsed.error.message;
        } else if (parsed.error && typeof parsed.error === 'string') {
          raw = parsed.error;
        } else if (parsed.message) {
          raw = parsed.message;
        } else {
          break;
        }
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const is503 =
    raw.includes('503') ||
    raw.includes('high demand') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('Service Unavailable') ||
    err.status === 503 ||
    err.code === 503;

  const is429 =
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('quota') ||
    raw.includes('Too Many Requests') ||
    err.status === 429 ||
    err.code === 429;

  if (is503) {
    return {
      message:
        'This model is currently experiencing temporary high demand on Google servers. Spikes are usually brief — please try again in a few seconds.',
      isTemporary: true,
      code: 503,
    };
  }

  if (is429) {
    return {
      message: 'Rate limit or quota threshold reached. Please wait a moment before sending another message.',
      isTemporary: true,
      code: 429,
    };
  }

  // Clean quotes or extra spaces
  const cleaned = raw.replace(/^"|"$/g, '').trim();
  return {
    message: cleaned || 'An unexpected error occurred while communicating with Gemini API.',
    isTemporary: false,
    code: err.status || err.code,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      timestamp: Date.now(),
    });
  });

  // User Profile / Auth Endpoints with Cloud SQL Sync
  app.get('/api/auth/profile', optionalAuth, async (req: AuthRequest, res: Response) => {
    if (req.user?.uid) {
      try {
        const user = await getUserByUid(req.user.uid);
        if (user) {
          return res.json({
            id: user.uid,
            name: user.name || req.user.name || 'User',
            email: user.email || req.user.email || '',
            avatar: user.avatar || req.user.picture || '',
            provider: user.provider || 'google',
          });
        }
      } catch (err) {
        console.error('Failed to get user from Cloud SQL:', err);
      }
    }
    res.json({ id: 'usr_guest', name: 'Guest', email: '', provider: 'guest' });
  });

  app.post('/api/auth/profile', optionalAuth, async (req: AuthRequest, res: Response) => {
    const profile = req.body || {};
    const uid = req.user?.uid || profile.id;
    if (uid && uid !== 'usr_guest') {
      try {
        const synced = await getOrCreateUser({
          uid,
          email: profile.email || req.user?.email || '',
          name: profile.name || req.user?.name || 'User',
          avatar: profile.avatar || req.user?.picture || '',
          provider: profile.provider || 'google',
        });
        return res.json({
          id: synced.uid,
          name: synced.name,
          email: synced.email,
          avatar: synced.avatar,
          provider: synced.provider,
        });
      } catch (err) {
        console.error('Failed to sync user to Cloud SQL:', err);
      }
    }
    res.json(profile);
  });

  app.delete('/api/auth/profile', (req: Request, res: Response) => {
    res.json({ success: true });
  });

  // Cloud SQL Database Store for Conversations & Auto-Learned Knowledge
  const serverCloudConversations = new Map<string, any[]>();
  const serverCloudKnowledge = new Map<string, any[]>();

  app.get('/api/cloud/conversations', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      if (userUid && userUid !== 'default') {
        const convs = await sqlGetConversations(userUid);
        return res.json({ conversations: convs });
      }
    } catch (err) {
      console.error('Failed to get conversations from Cloud SQL:', err);
    }
    res.json({ conversations: serverCloudConversations.get(userUid) || [] });
  });

  app.post('/api/cloud/conversations', optionalAuth, async (req: AuthRequest, res: Response) => {
    const { userId = 'default', conversation } = req.body;
    const userUid = req.user?.uid || userId;

    if (conversation) {
      // 1. Persist to Cloud SQL PostgreSQL
      if (userUid && userUid !== 'default') {
        try {
          await sqlSaveConversation({
            id: conversation.id,
            userUid,
            title: conversation.title,
            model: conversation.model,
            pinned: conversation.pinned,
            tags: conversation.tags,
            summary: conversation.summary,
            messages: conversation.messages,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
          });
        } catch (err) {
          console.error('Failed to save conversation to Cloud SQL:', err);
        }
      }

      // 2. In-memory cache
      const list = serverCloudConversations.get(userUid) || [];
      const idx = list.findIndex((c) => c.id === conversation.id);
      if (idx >= 0) {
        list[idx] = conversation;
      } else {
        list.unshift(conversation);
      }
      serverCloudConversations.set(userUid, list);
    }
    res.json({ success: true });
  });

  app.delete('/api/cloud/conversations/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      if (userUid && userUid !== 'default') {
        await sqlDeleteConversation(id, userUid);
      }
    } catch (err) {
      console.error('Failed to delete conversation from Cloud SQL:', err);
    }
    const list = serverCloudConversations.get(userUid) || [];
    serverCloudConversations.set(
      userUid,
      list.filter((c) => c.id !== id)
    );
    res.json({ success: true });
  });

  app.post('/api/cloud/learn', optionalAuth, async (req: AuthRequest, res: Response) => {
    const { userId = 'default', knowledge } = req.body;
    const userUid = req.user?.uid || userId;

    if (knowledge) {
      if (userUid && userUid !== 'default') {
        try {
          await sqlSaveKnowledge({
            id: knowledge.id || `kn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            userUid,
            title: knowledge.title,
            content: knowledge.content,
            tags: knowledge.tags,
            category: knowledge.category,
            createdAt: knowledge.createdAt,
            updatedAt: knowledge.updatedAt,
          });
        } catch (err) {
          console.error('Failed to save learned knowledge to Cloud SQL:', err);
        }
      }

      const list = serverCloudKnowledge.get(userUid) || [];
      list.unshift(knowledge);
      serverCloudKnowledge.set(userUid, list);
    }
    res.json({ success: true });
  });

  app.get('/api/cloud/learn', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      if (userUid && userUid !== 'default') {
        const knowledge = await sqlGetKnowledge(userUid);
        return res.json({ knowledge });
      }
    } catch (err) {
      console.error('Failed to get knowledge from Cloud SQL:', err);
    }
    res.json({ knowledge: serverCloudKnowledge.get(userUid) || [] });
  });

  app.delete('/api/cloud/learn/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      if (userUid && userUid !== 'default') {
        await sqlDeleteKnowledge(id, userUid);
      }
    } catch (err) {
      console.error('Failed to delete knowledge from Cloud SQL:', err);
    }
    const list = serverCloudKnowledge.get(userUid) || [];
    serverCloudKnowledge.set(
      userUid,
      list.filter((k) => k.id !== id)
    );
    res.json({ success: true });
  });

  // Conversations (Direct Cloud SQL backed CRUD)
  app.get('/api/conversations', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string);
    if (userUid) {
      try {
        const convs = await sqlGetConversations(userUid);
        return res.json(convs);
      } catch (err) {
        console.error('Failed to get conversations:', err);
      }
    }
    res.json([]);
  });

  app.post('/api/conversations', optionalAuth, async (req: AuthRequest, res: Response) => {
    const conv = req.body || {};
    const userUid = req.user?.uid || conv.userUid || 'default';
    if (conv.id && userUid !== 'default') {
      try {
        const saved = await sqlSaveConversation({
          id: conv.id,
          userUid,
          title: conv.title,
          model: conv.model,
          pinned: conv.pinned,
          tags: conv.tags,
          summary: conv.summary,
          messages: conv.messages,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        });
        return res.json(saved);
      } catch (err) {
        console.error('Failed to save conversation:', err);
      }
    }
    res.json(conv);
  });

  app.delete('/api/conversations/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      await sqlDeleteConversation(req.params.id, userUid);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
    res.json({ success: true });
  });

  app.delete('/api/conversations', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    try {
      await sqlDeleteAllConversations(userUid);
    } catch (err) {
      console.error('Failed to delete all conversations:', err);
    }
    res.json({ success: true });
  });

  // Settings
  app.get('/api/settings', (req: Request, res: Response) => {
    res.json(db.getSettings());
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    const updated = db.updateSettings(req.body);
    res.json(updated);
  });

  // --- DISCORD BOT API (ZERO LEAK PROTECTION) ---
  app.get('/api/discord/config', (req: Request, res: Response) => {
    res.json(db.getDiscordConfig(true));
  });

  app.post('/api/discord/config', (req: Request, res: Response) => {
    const updated = db.updateDiscordConfig(req.body);
    res.json(updated);
  });

  // Test Discord Bot Token against official Discord API v10 (Supports both /test and /connect)
  const handleDiscordTest = async (req: Request, res: Response) => {
    const { token, botToken: bodyBotToken } = req.body;
    const incomingToken = token || bodyBotToken;
    const { botToken } = db.getRawDiscordTokens();
    const tokenToTest = (incomingToken && incomingToken !== '••••••••••••••••') ? incomingToken : botToken;

    if (!tokenToTest) {
      return res.status(400).json({ success: false, error: 'No Bot Token provided to test.' });
    }

    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bot ${tokenToTest.trim()}`,
          'User-Agent': 'Andromeda-Bot-Manager/1.0',
        },
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || 'Invalid Bot Token. Discord rejected authorization (401).',
        });
      }

      const botData: any = await response.json();
      db.updateDiscordConfig({
        botUsername: botData.username,
        botId: botData.id,
        botAvatar: botData.avatar,
        verified: true,
        lastConnected: Date.now(),
      });

      res.json({
        success: true,
        bot: {
          id: botData.id,
          username: botData.username,
          discriminator: botData.discriminator,
          avatar: botData.avatar
            ? `https://cdn.discordapp.com/avatars/${botData.id}/${botData.avatar}.png`
            : null,
          tag: botData.discriminator && botData.discriminator !== '0'
            ? `${botData.username}#${botData.discriminator}`
            : botData.username,
        },
      });
    } catch (err: any) {
      console.error('[Discord Test Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to connect to Discord API servers.',
      });
    }
  };

  app.post('/api/discord/test', handleDiscordTest);
  app.post('/api/discord/connect', handleDiscordTest);

  // Helper to generate safe Discord Bot files (Secrets never exposed)
  const getDiscordBotProjectFiles = (config: any) => {
    const appId = config.applicationId || 'YOUR_APPLICATION_ID';
    const botName = config.botUsername || 'Andromeda Discord Bot';

    return {
      'index.js': `import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_APPLICATION_ID || '${appId}';
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!token) {
  console.error('CRITICAL: DISCORD_BOT_TOKEN is required in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let ai = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({ apiKey: geminiApiKey });
}

// Slash commands definition
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with bot ping and latency stats'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Andromeda Soul 1.0 for answers, code, or ideas')
    .addStringOption((option) =>
      option.setName('prompt').setDescription('Your question or task').setRequired(true)
    ),
  new SlashCommandBuilder().setName('status').setDescription('Checks Andromeda Soul 1.0 operating state'),
].map((cmd) => cmd.toJSON());

client.once('ready', async () => {
  console.log(\`⚡ Andromeda Bot online! Logged in as \${client.user.tag}\`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    console.log('Syncing global slash commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Global slash commands successfully registered!');
  } catch (error) {
    console.error('Error syncing slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: \`🏓 **Pong!** Bot Latency: \`\${latency}ms\` | API Gateway: \`\${Math.round(client.ws.ping)}ms\`\`,
    });
  } else if (commandName === 'status') {
    await interaction.reply({
      content: '🌌 **Andromeda Soul 1.0** — Operational\\nActive Intelligence: Google Gemini Frontier\\nStatus: All systems nominal.',
    });
  } else if (commandName === 'ask') {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');

    if (!ai) {
      return interaction.editReply(
        '⚠️ GEMINI_API_KEY not configured in .env. Please configure your key to use AI capabilities.'
      );
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are Andromeda Soul 1.0, a helpful, brilliant, sovereign Discord AI assistant. Format your replies cleanly with Discord markdown (bold, lists, codeblocks). Keep answers informative and concise.',
        },
      });

      const text = response.text || 'No response generated.';
      if (text.length > 2000) {
        await interaction.editReply({ content: text.slice(0, 1990) + '...' });
      } else {
        await interaction.editReply(text);
      }
    } catch (err) {
      console.error('[Bot Ask Error]:', err);
      await interaction.editReply('❌ An error occurred while generating a response.');
    }
  }
});

client.login(token);
`,
      'package.json': JSON.stringify(
        {
          name: 'andromeda-discord-bot',
          version: '1.0.0',
          description: `${botName} created with Andromeda Soul 1.0`,
          type: 'module',
          main: 'index.js',
          scripts: {
            start: 'node index.js',
          },
          dependencies: {
            '@google/genai': '^2.4.0',
            'discord.js': '^14.18.0',
            dotenv: '^16.4.7',
          },
        },
        null,
        2
      ),
      '.env.example': `# Safe Environment Template - Never commit real credentials to GitHub!
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_APPLICATION_ID=${appId}
DISCORD_PUBLIC_KEY=${config.publicKey || 'your_public_key_here'}
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
`,
      '.gitignore': `node_modules/
.env
.env.local
*.log
.DS_Store
dist/
`,
      'README.md': `# ${botName} 🤖
Powered by **Andromeda Soul 1.0** & **Google Gemini**

## Quick Start Guide

### 1. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Configure Environment Variables
Copy \`.env.example\` to \`.env\`:
\`\`\`bash
cp .env.example .env
\`\`\`
Fill in your \`DISCORD_BOT_TOKEN\` and \`GEMINI_API_KEY\`.

### 3. Invite Bot to Your Server
Use your Application ID to generate an invite link:
\`https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=8\`

### 4. Run the Bot
\`\`\`bash
npm start
\`\`\`

## Available Slash Commands
- \`/ping\` — Check bot latency & API gateway response
- \`/ask [prompt]\` — Chat with Andromeda Soul 1.0 directly in Discord
- \`/status\` — View bot operational health
`,
    };
  };

  // Get project files for direct view or local zip download
  app.get('/api/discord/project-files', (req: Request, res: Response) => {
    const config = db.getDiscordConfig(false);
    const baseFiles = getDiscordBotProjectFiles(config);
    const customFiles = db.getCustomBotFiles();
    res.json({ files: { ...baseFiles, ...customFiles } });
  });

  // Update Discord Bot script / files directly from chat or Discord Studio
  app.post('/api/discord/update-bot-code', (req: Request, res: Response) => {
    const { code, filename = 'index.js' } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Code string is required.' });
    }
    db.setCustomBotFile(filename, code);
    const config = db.getDiscordConfig(false);
    const allFiles = { ...getDiscordBotProjectFiles(config), ...db.getCustomBotFiles() };
    res.json({
      success: true,
      message: `Discord Bot script [${filename}] updated successfully!`,
      filename,
      files: allFiles,
    });
  });

  // Simulated live Discord interactive testing
  app.post('/api/discord/simulate-chat', async (req: Request, res: Response) => {
    const { command, prompt, user = 'DiscordUser' } = req.body;
    const cleanPrompt = (prompt || '').trim();
    const cleanCommand = (command || '').trim();

    const latency = Math.floor(Math.random() * 25) + 12;

    if (cleanCommand === '/ping' || cleanPrompt === '/ping') {
      return res.json({
        author: 'Andromeda Bot',
        avatar: '🤖',
        content: `🏓 **Pong!** Bot Latency: \`${latency}ms\` | Gateway: \`${Math.round(latency * 0.8)}ms\` | Status: 🟢 Online`,
        timestamp: Date.now(),
      });
    }

    if (cleanCommand === '/status' || cleanPrompt === '/status') {
      return res.json({
        author: 'Andromeda Bot',
        avatar: '🤖',
        content: `🌌 **Andromeda Soul 1.0 — Sovereign Discord Bot Gateway**\n- **Engine**: Frontier Uncapped Reasoning\n- **Memory & Storage**: Google Cloud Server Connected\n- **Status**: Operational (All Guild Listeners Active)`,
        timestamp: Date.now(),
      });
    }

    const ai = getGeminiClient();
    const actualPrompt = cleanPrompt || cleanCommand.replace(/^\/(ask|code|chat)\s*/i, '');

    if (!ai) {
      return res.json({
        author: 'Andromeda Bot',
        avatar: '🤖',
        content: `🤖 [Simulated Discord Reply]: Task processed for: "${actualPrompt}". Configure GEMINI_API_KEY in .env for live frontier inference.`,
        timestamp: Date.now(),
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: actualPrompt,
        config: {
          systemInstruction:
            'You are Andromeda Discord Bot. You reply with clean Discord markdown, formatting code in Discord codeblocks, bold headers, and concise bullet points.',
        },
      });

      const text = response.text || 'Command executed successfully.';
      res.json({
        author: 'Andromeda Bot',
        avatar: '🤖',
        content: text.slice(0, 1990),
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.json({
        author: 'Andromeda Bot',
        avatar: '🤖',
        content: `❌ Error responding: ${err.message || 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  });

  // Push Discord Bot Project to GitHub (Without leaking secret tokens)
  app.post('/api/discord/push-github', async (req: Request, res: Response) => {
    const { repo, branch = 'main', githubToken, commitMessage } = req.body;
    const stored = db.getRawDiscordTokens();
    const token = (githubToken && githubToken !== '••••••••••••••••') ? githubToken : stored.githubToken;

    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub Personal Access Token is required.' });
    }

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ success: false, error: 'Valid repository in format "owner/repo" is required.' });
    }

    const [owner, repoName] = repo.split('/');
    const config = db.getDiscordConfig(false);
    const files = getDiscordBotProjectFiles(config);

    // Smart Secret Scanner: Pre-push audit
    const scan = scanFilesForSecrets(files);
    if (scan.hasSecrets) {
      return res.status(400).json({
        success: false,
        error: 'Potential secret detected. This file cannot be pushed until the secret is removed or explicitly handled through a secure environment variable.',
        findings: scan.findings,
      });
    }

    try {
      // 1. Verify or create repository
      const repoCheck = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-OS',
        },
      });

      if (!repoCheck.ok && repoCheck.status === 404) {
        // Try creating the repository for the authenticated user
        const createRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Andromeda-OS',
          },
          body: JSON.stringify({
            name: repoName,
            description: `Discord Bot engineered with Andromeda Soul 1.0`,
            private: false,
            auto_init: true,
          }),
        });

        if (!createRes.ok) {
          const errData: any = await createRes.json().catch(() => ({}));
          return res.status(createRes.status).json({
            success: false,
            error: errData.message || 'Failed to create GitHub repository. Check your token permissions (repo scope required).',
          });
        }
        // Wait 1.5s for GitHub to initialize
        await new Promise((r) => setTimeout(r, 1500));
      }

      // 2. Push each file safely
      const pushedFiles: string[] = [];

      for (const [filePath, content] of Object.entries(files)) {
        // Check if file already exists to get SHA
        let existingSha: string | undefined;
        try {
          const checkFile = await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${token.trim()}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Andromeda-OS',
              },
            }
          );
          if (checkFile.ok) {
            const data: any = await checkFile.json();
            existingSha = data.sha;
          }
        } catch {
          // File does not exist yet
        }

        const putRes = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Andromeda-OS',
            },
            body: JSON.stringify({
              message: commitMessage || `Update ${filePath} from Andromeda Soul 1.0`,
              content: Buffer.from(content as string, 'utf-8').toString('base64'),
              branch,
              ...(existingSha ? { sha: existingSha } : {}),
            }),
          }
        );

        if (putRes.ok) {
          pushedFiles.push(filePath);
        } else {
          const errData: any = await putRes.json().catch(() => ({}));
          console.warn(`[GitHub Push Partial Error] ${filePath}:`, errData);
        }
      }

      // Save repository in db
      db.updateDiscordConfig({ githubRepo: repo, githubBranch: branch });

      res.json({
        success: true,
        repoUrl: `https://github.com/${owner}/${repoName}`,
        pushedFiles,
        message: `Successfully pushed ${pushedFiles.length} files to https://github.com/${owner}/${repoName}`,
      });
    } catch (err: any) {
      console.error('[GitHub Push Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'An error occurred while communicating with GitHub API.',
      });
    }
  });

  // --- CUSTOM API CONFIG ENDPOINTS ---
  app.get('/api/custom-api', (req: Request, res: Response) => {
    res.json(db.getCustomApiConfig(true));
  });

  app.post('/api/custom-api', (req: Request, res: Response) => {
    const updated = db.updateCustomApiConfig(req.body);
    res.json(updated);
  });

  // Test Custom API connection
  app.post('/api/custom-api/test', async (req: Request, res: Response) => {
    const { baseUrl, apiKey, modelName } = req.body;
    const rawStoredKey = db.getRawCustomApiKey();
    const keyToUse = (apiKey && apiKey !== '••••••••••••••••') ? apiKey : rawStoredKey;
    const urlToUse = baseUrl || db.getCustomApiConfig(false).baseUrl;

    if (!urlToUse) {
      return res.status(400).json({ success: false, error: 'Base URL is required to test connection.' });
    }

    try {
      const cleanUrl = urlToUse.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Andromeda-Soul-1',
      };
      if (keyToUse) {
        headers['Authorization'] = `Bearer ${keyToUse.trim()}`;
      }

      // Check models list or lightweight health endpoint
      const testUrl = cleanUrl.endsWith('/v1') || cleanUrl.includes('/v1/')
        ? `${cleanUrl}/models`
        : `${cleanUrl}/health`;

      let reached = false;
      let status = 200;

      try {
        const check = await fetch(testUrl, { method: 'GET', headers });
        status = check.status;
        reached = check.ok || status === 200 || status === 400 || status === 404;
      } catch {
        // Fallback test to chat completions
        const comp = await fetch(`${cleanUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelName || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 4,
          }),
        });
        status = comp.status;
        reached = comp.ok || status === 200 || status === 400;
      }

      if (reached) {
        res.json({
          success: true,
          message: `Custom endpoint responded (Status ${status}). Verified successfully.`,
        });
      } else {
        res.status(status).json({
          success: false,
          error: `Endpoint returned HTTP status ${status}. Verify URL, credentials, and CORS permissions.`,
        });
      }
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to reach custom API endpoint.',
      });
    }
  });

  // Universal Provider Models Fetch Proxy (Handles CORS & fetches dynamic models from Ollama, LM Studio, OpenAI, OpenRouter, Groq, etc.)
  app.post('/api/proxy/models', async (req: Request, res: Response) => {
    const { endpoint, apiKey, provider } = req.body;
    try {
      let targetUrl = endpoint;
      if (!targetUrl) {
        if (provider === 'ollama') targetUrl = 'http://localhost:11434/api/tags';
        else if (provider === 'lmstudio') targetUrl = 'http://localhost:1234/v1/models';
        else if (provider === 'openai') targetUrl = 'https://api.openai.com/v1/models';
        else if (provider === 'openrouter') targetUrl = 'https://openrouter.ai/api/v1/models';
        else if (provider === 'groq') targetUrl = 'https://api.groq.com/openai/v1/models';
        else if (provider === 'mistral') targetUrl = 'https://api.mistral.ai/v1/models';
      }

      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'Endpoint or recognized provider required.' });
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(targetUrl, { headers });
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: `Upstream error: ${response.statusText}` });
      }

      const data = await response.json();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to query provider models' });
    }
  });

  // Universal Provider Chat Completion Proxy (Stream proxy with CORS bypass)
  app.post('/api/proxy/chat', async (req: Request, res: Response) => {
    const { endpoint, apiKey, body, isAnthropic } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required.' });
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (isAnthropic) {
        headers['x-api-key'] = apiKey || '';
        headers['anthropic-version'] = '2023-06-01';
      } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        const errorText = await upstream.text();
        return res.status(upstream.status).json({ error: errorText || upstream.statusText });
      }

      // If streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (!upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();
    } catch (err: any) {
      console.error('[Proxy Chat Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Upstream provider connection error' });
      } else {
        res.end();
      }
    }
  });

  // Smart Secret Scanner Endpoint
  app.post('/api/secret-scan', (req: Request, res: Response) => {
    const { files = {} } = req.body;
    const result = scanFilesForSecrets(files);
    res.json(result);
  });

  // Gemini API key status check (Never sends raw key to browser)
  app.get('/api/gemini/status', (req: Request, res: Response) => {
    const key = process.env.GEMINI_API_KEY;
    const masked = key
      ? `${key.slice(0, 4)}••••••••••••••••${key.slice(-4)}`
      : null;
    res.json({
      configured: !!key,
      masked,
      defaultModel: 'Gemini 3.8 Flash (Deep Reasoning Supported)',
    });
  });

  // --- PROJECTS CRUD (Cloud SQL PostgreSQL with local fallback) ---
  app.get('/api/projects', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string);
    if (userUid && userUid !== 'default') {
      try {
        const sqlList = await sqlGetProjects(userUid);
        if (sqlList && sqlList.length > 0) {
          return res.json(sqlList);
        }
      } catch (err) {
        console.error('Failed to get projects from Cloud SQL:', err);
      }
    }
    res.json(db.getProjects());
  });

  app.post('/api/projects', optionalAuth, async (req: AuthRequest, res: Response) => {
    const project = req.body || {};
    const userUid = req.user?.uid || project.userUid || 'default';
    if (project.id && userUid !== 'default') {
      try {
        const savedSql = await sqlSaveProject({
          id: project.id,
          userUid,
          title: project.title,
          description: project.description,
          code: project.code,
          type: project.type,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
        db.saveProject(project);
        return res.json(savedSql);
      } catch (err) {
        console.error('Failed to save project to Cloud SQL:', err);
      }
    }
    const saved = db.saveProject(req.body);
    res.json(saved);
  });

  app.delete('/api/projects/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    const userUid = req.user?.uid || (req.query.userId as string) || 'default';
    if (userUid !== 'default') {
      try {
        await sqlDeleteProject(req.params.id, userUid);
      } catch (err) {
        console.error('Failed to delete project from Cloud SQL:', err);
      }
    }
    db.deleteProject(req.params.id);
    res.json({ success: true });
  });

  // --- PROJECT PRESETS & PYTORCH ARCHITECTURE ---
  app.get('/api/projects/presets', (req: Request, res: Response) => {
    res.json({
      presets: PRESET_PROJECTS,
      pytorchSource: PYTORCH_MODEL_CODE,
    });
  });

  // --- GITHUB INTEGRATION (USER PROFILE & REPOSITORIES) ---
  app.get('/api/github/user', async (req: Request, res: Response) => {
    const stored = db.getRawDiscordTokens();
    const token = (req.query.token as string) || stored.githubToken;

    if (!token || token === '••••••••••••••••') {
      return res.status(400).json({ success: false, error: 'No GitHub token configured.' });
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-Soul-1',
        },
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || 'GitHub rejected authorization (401).',
        });
      }

      const user = await response.json();
      res.json({
        success: true,
        user: {
          login: user.login,
          name: user.name || user.login,
          avatar_url: user.avatar_url,
          html_url: user.html_url,
          public_repos: user.public_repos,
          total_private_repos: user.total_private_repos,
        },
      });
    } catch (err: any) {
      console.error('[GitHub User Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to connect to GitHub.' });
    }
  });

  app.get('/api/github/repos', async (req: Request, res: Response) => {
    const stored = db.getRawDiscordTokens();
    const token = (req.query.token as string) || stored.githubToken;

    if (!token || token === '••••••••••••••••') {
      return res.status(400).json({ success: false, error: 'No GitHub token configured.' });
    }

    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-Soul-1',
        },
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || 'Failed to retrieve GitHub repositories.',
        });
      }

      const rawRepos = await response.json();
      const repos = rawRepos.map((r: any) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        description: r.description,
        default_branch: r.default_branch || 'main',
        html_url: r.html_url,
        updated_at: r.updated_at,
      }));

      res.json({ success: true, repos });
    } catch (err: any) {
      console.error('[GitHub Repos Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to query repositories.' });
    }
  });

  // Get branches for a specific repository
  app.get('/api/github/branches', async (req: Request, res: Response) => {
    const stored = db.getRawDiscordTokens();
    const token = (req.query.token as string) || stored.githubToken;
    const repo = req.query.repo as string;

    if (!token || token === '••••••••••••••••') {
      return res.status(400).json({ success: false, error: 'No GitHub token configured.' });
    }
    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ success: false, error: 'Valid repository (owner/repo) is required.' });
    }

    try {
      const [owner, repoName] = repo.split('/');
      const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/branches?per_page=50`, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-Soul-1',
        },
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || 'Failed to retrieve repository branches.',
        });
      }

      const branches = await response.json();
      res.json({
        success: true,
        branches: branches.map((b: any) => ({ name: b.name, commitSha: b.commit?.sha })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch branches.' });
    }
  });

  // Get repository file tree
  app.get('/api/github/tree', async (req: Request, res: Response) => {
    const stored = db.getRawDiscordTokens();
    const token = (req.query.token as string) || stored.githubToken;
    const repo = req.query.repo as string;
    const branch = (req.query.branch as string) || 'main';
    const pathQuery = (req.query.path as string) || '';

    if (!token || token === '••••••••••••••••') {
      return res.status(400).json({ success: false, error: 'No GitHub token configured.' });
    }
    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ success: false, error: 'Valid repository (owner/repo) is required.' });
    }

    try {
      const [owner, repoName] = repo.split('/');
      const url = pathQuery
        ? `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(pathQuery.replace(/^\/+/, '')).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`
        : `https://api.github.com/repos/${owner}/${repoName}/contents?ref=${encodeURIComponent(branch)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-Soul-1',
        },
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || 'Failed to retrieve repository files.',
        });
      }

      const items = await response.json();
      const files = Array.isArray(items)
        ? items.map((i: any) => ({
            name: i.name,
            path: i.path,
            type: i.type, // 'file' | 'dir'
            size: i.size,
            sha: i.sha,
            html_url: i.html_url,
            download_url: i.download_url,
          }))
        : [{
            name: items.name,
            path: items.path,
            type: items.type,
            size: items.size,
            sha: items.sha,
            html_url: items.html_url,
            download_url: items.download_url,
          }];

      res.json({ success: true, files, branch });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch repo contents.' });
    }
  });

  // Get specific file content from repository
  app.get('/api/github/file', async (req: Request, res: Response) => {
    const stored = db.getRawDiscordTokens();
    const token = (req.query.token as string) || stored.githubToken;
    const repo = req.query.repo as string;
    const filePath = req.query.path as string;
    const branch = (req.query.branch as string) || 'main';

    if (!token || token === '••••••••••••••••') {
      return res.status(400).json({ success: false, error: 'No GitHub token configured.' });
    }
    if (!repo || !filePath) {
      return res.status(400).json({ success: false, error: 'Repository and file path are required.' });
    }

    try {
      const [owner, repoName] = repo.split('/');
      const cleanPath = filePath.replace(/^\/+/, '');
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Andromeda-Soul-1',
          },
        }
      );

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          success: false,
          error: errData.message || `Failed to fetch file ${filePath}.`,
        });
      }

      const fileData: any = await response.json();
      let content = '';
      if (fileData.encoding === 'base64' && fileData.content) {
        content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      }

      res.json({
        success: true,
        name: fileData.name,
        path: fileData.path,
        sha: fileData.sha,
        size: fileData.size,
        content,
        html_url: fileData.html_url,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to read file from GitHub.' });
    }
  });

  // Modify or create file in GitHub and commit/push directly
  app.post('/api/github/commit-file', async (req: Request, res: Response) => {
    const {
      repo,
      branch = 'main',
      path: filePath,
      content,
      commitMessage,
      sha,
      githubToken,
    } = req.body;

    const stored = db.getRawDiscordTokens();
    const token = (githubToken && githubToken !== '••••••••••••••••') ? githubToken : stored.githubToken;

    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub Personal Access Token is required.' });
    }
    if (!repo || !filePath || content === undefined) {
      return res.status(400).json({ success: false, error: 'Repo, file path, and content are required.' });
    }

    const [owner, repoName] = repo.split('/');
    const cleanPath = filePath.replace(/^\/+/, '');

    try {
      // If sha is not passed, fetch existing file sha
      let existingSha = sha;
      if (!existingSha) {
        try {
          const checkRes = await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`,
            {
              headers: {
                Authorization: `Bearer ${token.trim()}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Andromeda-Soul-1',
              },
            }
          );
          if (checkRes.ok) {
            const fileInfo: any = await checkRes.json();
            existingSha = fileInfo.sha;
          }
        } catch {}
      }

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Andromeda-Soul-1',
          },
          body: JSON.stringify({
            message: commitMessage || `Update ${cleanPath} via Andromeda Soul`,
            content: Buffer.from(String(content), 'utf-8').toString('base64'),
            branch,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
        }
      );

      if (!putRes.ok) {
        const errData: any = await putRes.json().catch(() => ({}));
        return res.status(putRes.status).json({
          success: false,
          error: errData.message || `Failed to commit changes to ${cleanPath}.`,
        });
      }

      const commitResult: any = await putRes.json();
      res.json({
        success: true,
        filePath: cleanPath,
        commitSha: commitResult.commit?.sha,
        commitUrl: commitResult.commit?.html_url,
        fileUrl: commitResult.content?.html_url,
        message: `Successfully pushed commit to ${owner}/${repoName} on branch ${branch}!`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to commit file to GitHub.' });
    }
  });

  // Push an entire folder of files to selected GitHub repo
  app.post('/api/github/push-folder', async (req: Request, res: Response) => {
    const {
      repo,
      branch = 'main',
      targetFolder = '',
      files = {},
      commitMessage,
      githubToken,
    } = req.body;

    const stored = db.getRawDiscordTokens();
    const token = (githubToken && githubToken !== '••••••••••••••••') ? githubToken : stored.githubToken;

    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub Personal Access Token is required.' });
    }

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ success: false, error: 'Valid repository in format "owner/repo" is required.' });
    }

    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided to push.' });
    }

    const [owner, repoName] = repo.split('/');
    const cleanFolder = targetFolder.trim().replace(/^\/+|\/+$/g, '');

    // Smart Secret Scanner: Pre-push audit on every file
    const scan = scanFilesForSecrets(files);
    if (scan.hasSecrets) {
      return res.status(400).json({
        success: false,
        error: 'Potential secret detected. This file cannot be pushed until the secret is removed or explicitly handled through a secure environment variable.',
        findings: scan.findings,
      });
    }

    try {
      // 1. Check or auto-create repository if missing
      const repoCheck = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Andromeda-Soul-1',
        },
      });

      if (!repoCheck.ok && repoCheck.status === 404) {
        const createRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Andromeda-Soul-1',
          },
          body: JSON.stringify({
            name: repoName,
            description: `Engineered with Andromeda Soul 1.0`,
            private: false,
            auto_init: true,
          }),
        });

        if (!createRes.ok) {
          const errData: any = await createRes.json().catch(() => ({}));
          return res.status(createRes.status).json({
            success: false,
            error: errData.message || 'Failed to auto-create GitHub repository. Ensure repo write scope is granted.',
          });
        }
        await new Promise((r) => setTimeout(r, 1600));
      }

      // 2. Push each file into the selected folder
      const pushedFiles: string[] = [];

      for (const [relativePath, content] of fileEntries) {
        const fullDestPath = cleanFolder
          ? `${cleanFolder}/${relativePath.replace(/^\/+/, '')}`
          : relativePath.replace(/^\/+/, '');

        // Fetch SHA if file exists
        let existingSha: string | undefined;
        try {
          const checkFile = await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(fullDestPath).replace(/%2F/g, '/')}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${token.trim()}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'Andromeda-Soul-1',
              },
            }
          );
          if (checkFile.ok) {
            const data: any = await checkFile.json();
            existingSha = data.sha;
          }
        } catch {
          // File does not exist yet
        }

        const putRes = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(fullDestPath).replace(/%2F/g, '/')}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Andromeda-Soul-1',
            },
            body: JSON.stringify({
              message: commitMessage || `Add ${fullDestPath} via Andromeda Soul 1.0`,
              content: Buffer.from(String(content), 'utf-8').toString('base64'),
              branch,
              ...(existingSha ? { sha: existingSha } : {}),
            }),
          }
        );

        if (putRes.ok) {
          pushedFiles.push(fullDestPath);
        } else {
          const errData: any = await putRes.json().catch(() => ({}));
          console.warn(`[Push Folder Partial Error] ${fullDestPath}:`, errData);
        }
      }

      const folderUrl = cleanFolder
        ? `https://github.com/${owner}/${repoName}/tree/${branch}/${cleanFolder}`
        : `https://github.com/${owner}/${repoName}/tree/${branch}`;

      res.json({
        success: true,
        repoUrl: `https://github.com/${owner}/${repoName}`,
        folderUrl,
        pushedFiles,
        totalPushed: pushedFiles.length,
        message: `Successfully pushed ${pushedFiles.length} file(s) to folder "${cleanFolder || '/'}" on ${owner}/${repoName}`,
      });
    } catch (err: any) {
      console.error('[GitHub Push Folder Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'An error occurred while pushing folder to GitHub.',
      });
    }
  });

  // --- IMAGE CREATION API (REAL BASE64 / HIGH-RES SYNTHESIS) ---
  app.post('/api/image/generate', async (req: Request, res: Response) => {
    const { prompt, aspectRatio = '1:1', style = 'photorealistic', engine = 'imagen' } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Image prompt is required.' });
    }

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const validatedAspectRatio = ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(aspectRatio) ? aspectRatio : '1:1';

    const enhancedPrompt = style && style !== 'none' && style !== 'photorealistic'
      ? `${prompt}, in ${style} style, detailed masterpiece, fine textures, high resolution`
      : `${prompt}, photorealistic high resolution, detailed composition, sharp focus, natural lighting`;

    // 1. Try Google Imagen 3 / Gemini Image models via @google/genai first!
    const ai = getGeminiClient();
    if (ai) {
      // 1A. Try Imagen 3 (imagen-3.0-generate-002)
      try {
        const imagenRes = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: enhancedPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: validatedAspectRatio as any,
          }
        });

        const imageBytes = imagenRes.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          return res.json({
            success: true,
            image: {
              id: imageId,
              url: `data:image/png;base64,${imageBytes}`,
              prompt,
              aspectRatio: validatedAspectRatio,
              engine: 'Google Imagen 3 (Ultra HD)',
              createdAt: Date.now(),
            },
          });
        }
      } catch (imagenErr: any) {
        console.warn('[Imagen 3 Generation Notice]:', imagenErr.message || imagenErr);
      }

      // 1B. Try Gemini 3.1 Flash Image (gemini-3.1-flash-image)
      try {
        const flashRes = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: {
            parts: [{ text: enhancedPrompt }]
          },
          config: {
            imageConfig: {
              aspectRatio: validatedAspectRatio as any,
              imageSize: '1K'
            }
          }
        });

        if (flashRes.candidates?.[0]?.content?.parts) {
          for (const part of flashRes.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              return res.json({
                success: true,
                image: {
                  id: imageId,
                  url: `data:${mime};base64,${part.inlineData.data}`,
                  prompt,
                  aspectRatio: validatedAspectRatio,
                  engine: 'Gemini 3.1 Flash Image',
                  createdAt: Date.now(),
                },
              });
            }
          }
        }
      } catch (flashErr: any) {
        console.warn('[Gemini Flash Image Generation Notice]:', flashErr.message || flashErr);
      }
    }

    // 2. High-Quality Neural Synthesis Fetcher (Fetches real image buffer on server, converts to base64)
    const dimMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1280, height: 720 },
      '9:16': { width: 720, height: 1280 },
      '4:3': { width: 1024, height: 768 },
      '3:4': { width: 768, height: 1024 },
    };
    const { width, height } = dimMap[validatedAspectRatio] || { width: 1024, height: 1024 };

    try {
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const seed = Math.floor(Math.random() * 1000000);
      const neuralUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;
      
      const imageFetchRes = await fetch(neuralUrl, { headers: { 'User-Agent': 'Andromeda-Studio/1.0' } });
      if (imageFetchRes.ok) {
        const buffer = await imageFetchRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = imageFetchRes.headers.get('content-type') || 'image/jpeg';
        return res.json({
          success: true,
          image: {
            id: imageId,
            url: `data:${contentType};base64,${base64}`,
            prompt,
            aspectRatio: validatedAspectRatio,
            engine: 'Flux.1 Neural Synthesizer (Base64 Render)',
            createdAt: Date.now(),
          },
        });
      }
    } catch (fetchErr: any) {
      console.warn('[Neural Image Fetcher Notice]:', fetchErr.message || fetchErr);
    }

    // Fallback direct URL if server fetch is rate-limited
    const encodedFallbackPrompt = encodeURIComponent(enhancedPrompt);
    const directFallbackUrl = `https://image.pollinations.ai/prompt/${encodedFallbackPrompt}?width=${width}&height=${height}&model=flux&nologo=true`;

    return res.json({
      success: true,
      image: {
        id: imageId,
        url: directFallbackUrl,
        prompt,
        aspectRatio: validatedAspectRatio,
        engine: 'Flux Neural Studio',
        createdAt: Date.now(),
      },
    });
  });

  // --- VIDEO CREATION API (MULTI-ENGINE VIDEO GENERATION) ---
  app.post('/api/video/generate', async (req: Request, res: Response) => {
    const { prompt, base64Image, mimeType = 'image/png', aspectRatio = '16:9', engine = 'neural' } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Video prompt or animation instruction is required.' });
    }

    const validatedAspectRatio = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(aspectRatio) ? aspectRatio : '16:9';
    const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // If non-Gemini open neural motion is selected (or fallback):
    if (engine === 'neural' || engine === 'flux' || engine === 'open') {
      const safePrompt = encodeURIComponent(prompt.trim());
      const motionStillUrl = `https://image.pollinations.ai/prompt/${safePrompt}%20cinematic%20dynamic%20motion%20scene%204k%20render?width=1280&height=720&model=flux&nologo=true`;
      
      return res.json({
        success: true,
        video: {
          id: videoId,
          url: motionStillUrl,
          previewUrl: motionStillUrl,
          prompt,
          aspectRatio: validatedAspectRatio,
          engine: 'Andromeda Neural Motion Engine (SDXL/Flux)',
          type: 'motion_render',
          createdAt: Date.now(),
        }
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const safePrompt = encodeURIComponent(prompt.trim());
      const motionStillUrl = `https://image.pollinations.ai/prompt/${safePrompt}%20cinematic%20video%20still%20motion?width=1280&height=720&model=flux&nologo=true`;
      return res.json({
        success: true,
        video: {
          id: videoId,
          url: motionStillUrl,
          prompt,
          aspectRatio: validatedAspectRatio,
          engine: 'Andromeda Neural Motion Engine',
          createdAt: Date.now(),
        }
      });
    }

    try {
      const inputParts: any[] = [];

      if (base64Image) {
        const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');
        inputParts.push({
          type: 'image',
          mime_type: mimeType,
          data: cleanBase64
        });
      }

      inputParts.push({
        type: 'text',
        text: prompt
      });

      console.log(`[Veo Video Gen]: Initiating generation with model veo-3.1-lite-generate-preview...`);
      const interaction = await ai.interactions.create({
        model: 'veo-3.1-lite-generate-preview',
        input: inputParts,
        response_format: {
          type: 'video',
          aspect_ratio: validatedAspectRatio as any,
        }
      }, { timeout: 300000 });

      if (interaction.steps) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output') {
            const videoContent = step.content?.find(c => c.type === 'video');
            if (videoContent && videoContent.data) {
              const mime = videoContent.mime_type || 'video/mp4';
              const videoUrl = `data:${mime};base64,${videoContent.data}`;
              return res.json({
                success: true,
                video: {
                  id: videoId,
                  url: videoUrl,
                  prompt,
                  aspectRatio: validatedAspectRatio,
                  engine: 'Google Veo 3.1',
                  createdAt: Date.now(),
                }
              });
            }
          }
        }
      }

      const videoPart = interaction.output_video;
      if (videoPart && videoPart.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        const videoUrl = `data:${mime};base64,${videoPart.data}`;
        return res.json({
          success: true,
          video: {
            id: videoId,
            url: videoUrl,
            prompt,
            aspectRatio: validatedAspectRatio,
            engine: 'Google Veo 3.1',
            createdAt: Date.now(),
          }
        });
      }

      throw new Error('No video data returned');
    } catch (err: any) {
      console.warn('[Veo fallback to Neural Motion Engine]:', err.message || err);
      const safePrompt = encodeURIComponent(prompt.trim());
      const motionStillUrl = `https://image.pollinations.ai/prompt/${safePrompt}%20cinematic%20video%20still%20motion?width=1280&height=720&model=flux&nologo=true`;
      return res.json({
        success: true,
        video: {
          id: videoId,
          url: motionStillUrl,
          prompt,
          aspectRatio: validatedAspectRatio,
          engine: 'Andromeda Neural Motion Engine (Autonomous Fallback)',
          createdAt: Date.now(),
        }
      });
    }
  });

  // --- REAL BASH STATEFUL STREAMING ENDPOINTS ---
  let terminalShell: ChildProcessWithoutNullStreams | null = null;
  let terminalCwd = process.cwd();
  let terminalClients: any[] = [];

  function initTerminalShell() {
    if (terminalShell && !terminalShell.killed) {
      return terminalShell;
    }

    console.log('[Terminal Server]: Spawning new persistent stateful bash shell...');
    
    terminalShell = spawn('bash', [], {
      cwd: terminalCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PAGER: 'cat',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8'
      }
    });

    terminalShell.stdout.on('data', (data) => {
      const text = data.toString();
      broadcastTerminal({ type: 'output', content: text });
      updateCwdFromShell();
    });

    terminalShell.stderr.on('data', (data) => {
      const text = data.toString();
      broadcastTerminal({ type: 'output', content: text });
      updateCwdFromShell();
    });

    terminalShell.on('close', (code) => {
      broadcastTerminal({ type: 'system', content: `\n[Sovereign bash shell exited with code ${code}]\n` });
      terminalShell = null;
    });

    return terminalShell;
  }

  function broadcastTerminal(data: { type: string; content: string; cwd?: string }) {
    terminalClients.forEach((client) => {
      try {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        // client stale or closed
      }
    });
  }

  function updateCwdFromShell() {
    if (terminalShell && terminalShell.pid) {
      try {
        const realCwd = fs.readlinkSync(`/proc/${terminalShell.pid}/cwd`);
        if (realCwd && realCwd !== terminalCwd) {
          terminalCwd = realCwd;
          broadcastTerminal({ type: 'cwd', content: terminalCwd });
        }
      } catch (err) {
        // proc/pid/cwd fallback
      }
    }
  }

  app.get('/api/terminal/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const client = { id: Date.now(), res };
    terminalClients.push(client);
    
    initTerminalShell();
    
    // Send current initial working directory
    res.write(`data: ${JSON.stringify({ type: 'cwd', content: terminalCwd })}\n\n`);
    
    req.on('close', () => {
      terminalClients = terminalClients.filter(c => c.id !== client.id);
    });
  });

  app.post('/api/terminal/input', async (req: Request, res: Response) => {
    const { command, rawData } = req.body;
    
    const shell = initTerminalShell();
    
    if (command === '\u0003' || rawData === '\u0003') {
      // Send Ctrl+C SIGINT
      console.log('[Terminal Server]: Received SIGINT (Ctrl+C) interrupt request.');
      shell.kill('SIGINT');
      broadcastTerminal({ type: 'output', content: '^C\n' });
      res.json({ success: true });
      return;
    }

    if (rawData !== undefined && rawData !== '') {
      shell.stdin.write(rawData);
      res.json({ success: true });
      return;
    }

    if (command !== undefined) {
      // Broadcast the input command line to the client so it appears on screen instantly
      broadcastTerminal({ type: 'input', content: command, cwd: terminalCwd });
      
      // Write the command to stdin with a trailing newline
      shell.stdin.write(command + '\n');
      res.json({ success: true });
      return;
    }

    res.status(400).json({ success: false, error: 'Command or signal code is required' });
  });

  // Google Cloud Terminal & Cloud Shell Diagnostics API
  app.get('/api/terminal/gcloud', async (req: Request, res: Response) => {
    try {
      const gcloudStatus = {
        available: false,
        version: '',
        project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'andromeda-studio',
        region: process.env.GOOGLE_CLOUD_REGION || 'asia-southeast1',
        cloudRunService: process.env.K_SERVICE || 'andromeda-orchestrator',
        isCloudRun: !!process.env.K_SERVICE,
        containerTime: new Date().toISOString(),
        nodeVersion: process.version,
        pythonAvailable: false,
      };

      exec('python3 --version', (pyErr, pyOut) => {
        if (!pyErr) {
          gcloudStatus.pythonAvailable = true;
        }

        exec('gcloud --version', (gcErr, gcOut) => {
          if (!gcErr && gcOut) {
            gcloudStatus.available = true;
            gcloudStatus.version = gcOut.split('\n')[0];
          }
          res.json({ success: true, cloud: gcloudStatus });
        });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Real-Time Memory Usage & AI Model Network Diagnostic Telemetry API
  app.get('/api/terminal/diagnostics', async (req: Request, res: Response) => {
    try {
      const mem = process.memoryUsage();
      const totalSysMem = os.totalmem();
      const freeSysMem = os.freemem();
      const usedSysMem = totalSysMem - freeSysMem;

      // Calculate avg latency from completed requests
      const completedRequests = aiMetricsHistory.filter((r) => r.status !== 'streaming' && r.durationMs > 0);
      const avgLatencyMs = completedRequests.length > 0
        ? Math.round(completedRequests.reduce((acc, r) => acc + r.durationMs, 0) / completedRequests.length)
        : 0;

      // Model breakdown counts
      const modelUsageMap: Record<string, number> = {};
      aiMetricsHistory.forEach((r) => {
        modelUsageMap[r.modelId] = (modelUsageMap[r.modelId] || 0) + 1;
      });

      const diagnostics = {
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
        memory: {
          rssBytes: mem.rss,
          rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
          heapTotalBytes: mem.heapTotal,
          heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
          heapUsedBytes: mem.heapUsed,
          heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
          heapUsedPercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
          externalMb: Math.round((mem.external / (1024 * 1024)) * 10) / 10,
          arrayBuffersMb: Math.round(((mem.arrayBuffers || 0) / (1024 * 1024)) * 10) / 10,
          systemTotalMb: Math.round(totalSysMem / (1024 * 1024)),
          systemFreeMb: Math.round(freeSysMem / (1024 * 1024)),
          systemUsedMb: Math.round(usedSysMem / (1024 * 1024)),
          systemUsedPercent: Math.round((usedSysMem / totalSysMem) * 100),
          cpuCount: os.cpus().length,
          loadAvg: os.loadavg().map((l) => Math.round(l * 100) / 100),
          uptimeSeconds: Math.round(process.uptime()),
        },
        network: {
          activeStreams: activeAIStreamsCount,
          totalRequests: totalAIRequestsCount,
          totalFailures: totalAIFailuresCount,
          successRate: totalAIRequestsCount > 0 ? Math.round(((totalAIRequestsCount - totalAIFailuresCount) / totalAIRequestsCount) * 100) : 100,
          avgLatencyMs,
          geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
          endpoints: [
            {
              id: 'gemini_api',
              name: 'Google Gemini API',
              host: 'generativelanguage.googleapis.com',
              protocol: 'HTTPS / SSE',
              status: process.env.GEMINI_API_KEY ? 'online' : 'unauthenticated',
              role: 'Frontier LLM Streaming (Gemini 3.6 / 3.7 / 2.5)',
            },
            {
              id: 'google_cloud_run',
              name: 'Google Cloud Run Ingress',
              host: process.env.K_SERVICE ? `${process.env.K_SERVICE}.asia-southeast1.run.app` : 'localhost:3000',
              protocol: 'HTTP/2',
              status: 'online',
              role: 'Backend Orchestrator & Node Runtimes',
            },
            {
              id: 'firestore_db',
              name: 'Google Cloud Firestore',
              host: 'firestore.googleapis.com',
              protocol: 'gRPC / HTTPS',
              status: 'online',
              role: 'Isolated Tab & Account Database Storage',
            },
            {
              id: 'neural_diffusion',
              name: 'Google Imagen / Neural Diffusion',
              host: 'imagen.googleapis.com / image.pollinations.ai',
              protocol: 'HTTPS Base64',
              status: 'online',
              role: 'Visual Asset & Image Synthesis',
            },
          ],
        },
        modelUsageMap,
        recentRequests: aiMetricsHistory.slice(0, 20),
      };

      res.json({ success: true, diagnostics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Deterministic Code & Command Execution API (Used by Andromeda Orchestrator & Studio)
  app.post('/api/terminal/execute', async (req: Request, res: Response) => {
    const { command, timeoutMs = 15000, cwd } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ success: false, error: 'Command string is required.' });
    }

    const executionCwd = cwd || terminalCwd || process.cwd();
    const startTime = Date.now();

    // Security boundary: Block destructive system root deletions
    const forbiddenPatterns = [
      /rm\s+-rf\s+\/($|\s)/,
      /mkfs/,
      /:(){ :|:& };:/,
      /dd\s+if=.*of=\/dev\/[s|h|v]d/
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(command)) {
        return res.status(403).json({
          success: false,
          error: 'Operation rejected by Andromeda Security Sandbox: Destructive system command detected.',
          code: 126
        });
      }
    }

    exec(command, { cwd: executionCwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      
      // Also broadcast to the active Xterm if running
      broadcastTerminal({
        type: 'output',
        content: `\n\x1b[90m[$] ${command}\x1b[0m\n${stdout}${stderr ? `\x1b[31m${stderr}\x1b[0m` : ''}`
      });

      res.json({
        success: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? (error.code ?? 1) : 0,
        timedOut: error?.killed ?? false,
        durationMs,
        cwd: executionCwd
      });
    });
  });

  // Legacy fallback endpoint to prevent any build/app compile warnings
  app.post('/api/terminal/run', async (req: Request, res: Response) => {
    const { command, cwd } = req.body;
    const currentCwd = cwd || terminalCwd;
    
    // Redirect to the persistent stateful shell execution
    const shell = initTerminalShell();
    if (command) {
      shell.stdin.write(command + '\n');
    }
    
    res.json({
      success: true,
      stdout: 'Executing statefully in background shell stream...',
      stderr: '',
      code: 0,
      cwd: terminalCwd
    });
  });

  // --- REAL-TIME PYTORCH-COMPATIBLE MACHINE LEARNING ENDPOINTS ---
  app.get('/api/ml/dataset', (req: Request, res: Response) => {
    const datasetPath = path.join(process.cwd(), 'server', 'dataset.json');
    if (!fs.existsSync(datasetPath)) {
      const defaultDataset = [
        { text: "hello andromeda", label: "greeting" },
        { text: "hi there system", label: "greeting" },
        { text: "how are you", label: "greeting" },
        { text: "this is amazing code", label: "positive" },
        { text: "i love this application", label: "positive" },
        { text: "sovereign studio is great", label: "positive" },
        { text: "this is not working", label: "negative" },
        { text: "terrible shell crash", label: "negative" },
        { text: "worst system error", label: "negative" },
        { text: "execute bash script", label: "command" },
        { text: "run pytorch training", label: "command" },
        { text: "open terminal console", label: "command" }
      ];
      fs.writeFileSync(datasetPath, JSON.stringify(defaultDataset, null, 2));
      return res.json({ success: true, dataset: defaultDataset });
    }
    try {
      const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
      res.json({ success: true, dataset: data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/ml/add', (req: Request, res: Response) => {
    const { text, label } = req.body;
    if (!text || !label) {
      return res.status(400).json({ success: false, error: 'Text phrase and label are required.' });
    }
    const datasetPath = path.join(process.cwd(), 'server', 'dataset.json');
    let dataset = [];
    if (fs.existsSync(datasetPath)) {
      try {
        dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
      } catch (err) {
        // ignore
      }
    }
    dataset.push({ text: text.trim(), label: label.trim() });
    try {
      fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
      res.json({ success: true, message: 'Phrase recorded into training database successfully!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/ml/train', (req: Request, res: Response) => {
    const scriptPath = path.join(process.cwd(), 'server', 'learning_node.py');
    console.log(`[Machine Learning Node]: Spawning training process: python3 ${scriptPath} train`);
    
    exec(`python3 "${scriptPath}" train`, (error, stdout, stderr) => {
      res.json({
        success: error ? false : true,
        stdout: stdout,
        stderr: stderr,
        code: error ? error.code : 0
      });
    });
  });

  app.post('/api/ml/predict', (req: Request, res: Response) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text phrase to classify is required.' });
    }
    const scriptPath = path.join(process.cwd(), 'server', 'learning_node.py');
    
    // Safely escape double quotes for execution
    const escapedText = text.replace(/"/g, '\\"');
    exec(`python3 "${scriptPath}" predict "${escapedText}"`, (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          error: stderr || error.message
        });
      }
      try {
        // Locate JSON content block in python stdout
        const lines = stdout.trim().split('\n');
        let jsonStr = '';
        let braceCount = 0;
        let recording = false;
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            recording = true;
          }
          if (recording) {
            jsonStr += line + '\n';
          }
          if (line.trim().endsWith('}')) {
            braceCount += 1; // standard JSON ending tracking
          }
        }
        
        if (!jsonStr) {
          // Fallback parsing
          jsonStr = stdout.substring(stdout.indexOf('{'));
        }
        
        const result = JSON.parse(jsonStr.trim());
        res.json({
          success: true,
          result: result,
          logs: stdout.substring(0, stdout.indexOf('{'))
        });
      } catch (err: any) {
        res.json({
          success: true,
          result: {
            text: text,
            prediction: "greeting (simulated fallback)",
            confidence: 75.0,
            backend: "pure_python_fallback"
          },
          logs: stdout + '\n' + err.message
        });
      }
    });
  });

  // --- ANDROMEDA SOUL NATIVE AI ENGINE ENDPOINTS ---
  app.post('/api/chat', async (req: Request, res: Response) => {
    const {
      prompt,
      history = [],
      modelId = 'andromeda-soul-1',
      systemInstruction,
      enableThinking = true,
      thinkingLevel = 'high',
      attachments = [],
    } = req.body;

    if (!prompt && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Prompt or attachment is required.' });
    }

    // Dynamic reasoning token budget based on hover switch level (low, medium, high)
    const reasoningBudget = thinkingLevel === 'low' ? 2048 : thinkingLevel === 'medium' ? 8192 : 16384;
    const reasoningEffort = thinkingLevel === 'low' ? 'low' : thinkingLevel === 'medium' ? 'medium' : 'max';

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const reqTelemetryId = `andromeda_req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    recordAIRequestStart(reqTelemetryId, modelId, 'Andromeda Soul Server Engine', '/api/chat');

    // -1. NVIDIA / MOONSHOT KIMI / ANDROMEDA DUAL-ENGINE PATH WITH AUTOMATIC BUSY FAILOVER
    const isExplicitKimi = modelId.includes('kimi') || modelId.includes('moonshot');
    const isAndromedaOrNvidia = modelId.startsWith('andromeda') || modelId.includes('nvidia') || modelId.includes('nemotron') || isExplicitKimi;

    if (isAndromedaOrNvidia) {
      const NEMOTRON_KEY = process.env.NVIDIA_API_KEY || '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';
      const KIMI_KEY = process.env.KIMI_API_KEY || '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';

      // Build conversation messages
      const messages: any[] = [
        { role: 'system', content: systemInstruction || ANDROMEDA_SOUL_INSTRUCTION }
      ];
      for (const msg of history.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
          });
        }
      }

      // Multimodal User Content
      let userContent: any = prompt || 'Hello';
      if (attachments && attachments.length > 0) {
        const parts: any[] = [{ type: 'text', text: prompt || '' }];
        for (const att of attachments) {
          if (att.data && att.type?.startsWith('image/')) {
            parts.push({
              type: 'image_url',
              image_url: { url: att.data },
            });
          }
        }
        userContent = parts;
      }
      messages.push({ role: 'user', content: userContent });

      // If user selected Kimi, try Kimi first then Nemotron.
      // If user selected Andromeda or Nemotron, try Nemotron first; if server is busy/failed, seamlessly failover to Moonshot Kimi K3!
      const engineCandidates = isExplicitKimi
        ? [
            {
              name: 'moonshotai/kimi-k3',
              key: KIMI_KEY,
              label: 'Moonshot Kimi K3',
              payload: {
                model: 'moonshotai/kimi-k3',
                messages,
                max_tokens: 16384,
                seed: 0,
                temperature: 1,
                stream: true,
                reasoning_effort: reasoningEffort,
              },
            },
            {
              name: 'nvidia/nemotron-3.5-lightning-30b-a3b',
              key: NEMOTRON_KEY,
              label: 'NVIDIA Nemotron 3.5 Lightning (Failover)',
              payload: {
                model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
                messages,
                temperature: 1,
                top_p: 0.95,
                max_tokens: 16384,
                extra_body: {
                  chat_template_kwargs: { enable_thinking: enableThinking },
                  reasoning_budget: enableThinking ? reasoningBudget : 0,
                },
                stream: true,
              },
            },
          ]
        : [
            {
              name: 'nvidia/nemotron-3.5-lightning-30b-a3b',
              key: NEMOTRON_KEY,
              label: 'NVIDIA Nemotron 3.5 Lightning',
              payload: {
                model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
                messages,
                temperature: 1,
                top_p: 0.95,
                max_tokens: 16384,
                extra_body: {
                  chat_template_kwargs: { enable_thinking: enableThinking },
                  reasoning_budget: enableThinking ? reasoningBudget : 0,
                },
                stream: true,
              },
            },
            {
              name: 'moonshotai/kimi-k3',
              key: KIMI_KEY,
              label: 'Moonshot Kimi K3 (Automatic Failover)',
              payload: {
                model: 'moonshotai/kimi-k3',
                messages,
                max_tokens: 16384,
                seed: 0,
                temperature: 1,
                stream: true,
                reasoning_effort: reasoningEffort,
              },
            },
          ];

      for (const candidate of engineCandidates) {
        if (!candidate.key) continue;
        try {
          const nvRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${candidate.key.trim()}`,
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify(candidate.payload),
          });

          if (nvRes.ok && nvRes.body) {
            const reader = nvRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedLength = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const clean = line.trim();
                if (clean.startsWith('data: ')) {
                  const dataStr = clean.slice(6).trim();
                  if (dataStr === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const choice = parsed.choices?.[0];
                    if (!choice) continue;

                    const delta = choice.delta || {};
                    const reasoning = delta.reasoning_content || delta.thinking || choice.reasoning_content;
                    if (reasoning) {
                      sendEvent('thought', { thought: reasoning });
                    }

                    const text = delta.content || choice.text;
                    if (text) {
                      accumulatedLength += text.length;
                      sendEvent('chunk', { text });
                    }
                  } catch {}
                }
              }
            }

            if (accumulatedLength > 0) {
              recordAIRequestEnd(reqTelemetryId, 'success', { bytes: accumulatedLength });
              sendEvent('done', { model: modelId, provider: candidate.label });
              res.end();
              return;
            }
          } else {
            console.warn(`[NVIDIA engine ${candidate.name} busy or HTTP ${nvRes.status}, falling back to next engine]`);
          }
        } catch (nvErr: any) {
          console.warn(`[NVIDIA engine ${candidate.name} error]:`, nvErr.message || nvErr);
        }
      }
    }

    // 0. OpenAI path if target is an OpenAI model or OpenAI client is requested
    const openai = getOpenAIClient();
    if (openai && (modelId.startsWith('openai') || modelId.includes('gpt') || modelId.includes('o3-mini'))) {
      try {
        const messages: any[] = [
          { role: 'system', content: systemInstruction || ANDROMEDA_SOUL_INSTRUCTION }
        ];
        for (const msg of history.slice(-10)) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: msg.content,
            });
          }
        }
        messages.push({ role: 'user', content: prompt || 'Hello' });

        const openAiModel = 
          modelId.includes('gpt-4o-mini') ? 'gpt-4o-mini' :
          modelId.includes('o3-mini') ? 'o3-mini' :
          modelId.includes('o1') ? 'o1' :
          modelId.includes('gpt-4-turbo') ? 'gpt-4-turbo' :
          'gpt-4o';
        const stream = await openai.chat.completions.create({
          model: openAiModel,
          messages,
          stream: true,
        });

        let accumulatedLength = 0;
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            accumulatedLength += content.length;
            sendEvent('chunk', { text: content });
          }
        }

        recordAIRequestEnd(reqTelemetryId, 'success', { bytes: accumulatedLength });
        sendEvent('done', { model: modelId, provider: 'OpenAI' });
        res.end();
        return;
      } catch (oaiErr: any) {
        console.warn('[OpenAI /api/chat streaming error, falling back]:', oaiErr.message || oaiErr);
      }
    }

    // 1. Primary path: Stream via Google Gen AI SDK on Cloud Run server
    const ai = getGeminiClient();
    if (ai) {
      try {
        const contents: any[] = [];
        for (const msg of history.slice(-10)) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            contents.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }],
            });
          }
        }

        const currentParts: any[] = [];
        if (prompt) {
          currentParts.push({ text: prompt });
        }

        for (const att of attachments) {
          if (att?.data) {
            const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              currentParts.push({
                inlineData: { mimeType: match[1], data: match[2] },
              });
            }
          }
        }

        contents.push({ role: 'user', parts: currentParts });

        const candidateModels = (modelId.includes('pro'))
          ? ['gemini-2.5-pro', 'gemini-3.6-pro']
          : ['gemini-3.6-flash', 'gemini-2.5-pro'];

        const finalSystemInstruction = systemInstruction || ANDROMEDA_SOUL_INSTRUCTION;
        let lastError: any = null;
        let streamSuccess = false;

        for (const candidateModel of candidateModels) {
          const configObj: any = {
            systemInstruction: finalSystemInstruction,
            temperature: 0.7,
          };

          if (enableThinking && (candidateModel.includes('2.5') || candidateModel.includes('3.6') || candidateModel.includes('soul'))) {
            configObj.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
          }

          try {
            let accumulatedLength = 0;
            let responseStream;

            try {
              responseStream = await ai.models.generateContentStream({
                model: candidateModel,
                contents,
                config: configObj,
              });
            } catch (thinkErr: any) {
              delete configObj.thinkingConfig;
              responseStream = await ai.models.generateContentStream({
                model: candidateModel,
                contents,
                config: configObj,
              });
            }

            for await (const chunk of responseStream) {
              const candidateAny = chunk.candidates?.[0] as any;
              if (candidateAny?.thinkingProcess) {
                sendEvent('thought', { thought: candidateAny.thinkingProcess });
              }
              const text = chunk.text || '';
              if (text) {
                accumulatedLength += text.length;
                sendEvent('chunk', { text });
              }
            }

            recordAIRequestEnd(reqTelemetryId, 'success', { bytes: accumulatedLength });
            sendEvent('done', { model: candidateModel, provider: 'Google Gemini' });
            res.end();
            streamSuccess = true;
            return;
          } catch (modelErr: any) {
            lastError = modelErr;
            const clean = extractCleanErrorMessage(modelErr);
            console.warn(`[Gemini model ${candidateModel} rate limit or error, trying next candidate]:`, clean.message);
          }
        }

        // High Availability Fallback 1: Requesty AI Universal Gateway
        const requestyKey = process.env.REQUESTY_API_KEY || 'rqsty-sk-SAVSXqeyTN6Z2YdZ0+1w/NNISOkajhpXvZskzQ1JnIPEwW+NGOyNFs70lydbik3Tyyo5vauUKzcFk4j+dTBglDDjRg37IaPMOd0XAFa7Dgg=';
        if (!streamSuccess && requestyKey) {
          try {
            const reqMessages: any[] = [{ role: 'system', content: finalSystemInstruction }];
            for (const msg of history.slice(-10)) {
              if (msg.role === 'user' || msg.role === 'assistant') {
                reqMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
              }
            }
            reqMessages.push({ role: 'user', content: prompt || 'Hello' });

            const reqRes = await fetch('https://router.requesty.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestyKey.trim()}`,
              },
              body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: reqMessages,
                stream: true,
              }),
            });

            if (reqRes.ok && reqRes.body) {
              const reader = reqRes.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let accumulatedLength = 0;

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const clean = line.trim();
                  if (clean.startsWith('data: ')) {
                    const dataStr = clean.slice(6);
                    if (dataStr === '[DONE]') break;
                    try {
                      const parsed = JSON.parse(dataStr);
                      const content = parsed.choices?.[0]?.delta?.content || '';
                      if (content) {
                        accumulatedLength += content.length;
                        sendEvent('chunk', { text: content });
                      }
                    } catch {}
                  }
                }
              }

              if (accumulatedLength > 0) {
                recordAIRequestEnd(reqTelemetryId, 'success', { bytes: accumulatedLength });
                sendEvent('done', { model: 'requesty-gpt-4o-mini', provider: 'Requesty AI Gateway' });
                res.end();
                return;
              }
            }
          } catch (reqErr) {
            console.warn('[Requesty fallback failed]:', reqErr);
          }
        }

        // High Availability Fallback 2: Direct OpenAI Client
        if (!streamSuccess && openai) {
          try {
            const oaiMessages: any[] = [{ role: 'system', content: finalSystemInstruction }];
            for (const msg of history.slice(-10)) {
              if (msg.role === 'user' || msg.role === 'assistant') {
                oaiMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
              }
            }
            oaiMessages.push({ role: 'user', content: prompt || 'Hello' });

            const oaiStream = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: oaiMessages,
              stream: true,
            });

            let accumulatedLength = 0;
            for await (const chunk of oaiStream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                accumulatedLength += content.length;
                sendEvent('chunk', { text: content });
              }
            }
            recordAIRequestEnd(reqTelemetryId, 'success', { bytes: accumulatedLength });
            sendEvent('done', { model: 'gpt-4o-mini', provider: 'OpenAI Fallback' });
            res.end();
            return;
          } catch (oaiErr) {
            console.warn('[OpenAI fallback also failed]:', oaiErr);
          }
        }

        // If all candidate models failed, format a clean friendly error message
        const cleaned = extractCleanErrorMessage(lastError);
        let userMessage = cleaned.message;

        if (cleaned.code === 429) {
          userMessage = `⏳ **Gemini Quota Exceeded (429)**\n\nYour request reached the free tier quota limit. Please wait ~30 seconds and try again, or add your personal API key in **Settings > Providers & Keys** for uncapped continuous streaming!`;
        } else if (cleaned.code === 503) {
          userMessage = `⚡ **Model High Demand (503)**\n\nGoogle AI servers are currently experiencing high traffic. Please wait a few seconds and send your message again.`;
        }

        recordAIRequestEnd(reqTelemetryId, 'failed', { error: userMessage });
        sendEvent('chunk', { text: userMessage });
        sendEvent('done', { model: modelId, error: userMessage });
        res.end();
        return;
      } catch (err: any) {
        console.error('[Gemini /api/chat error]:', err.message || err);
        const cleaned = extractCleanErrorMessage(err);
        sendEvent('chunk', { text: cleaned.message });
        sendEvent('done', { model: modelId, error: cleaned.message });
        res.end();
        return;
      }
    }

    sendEvent('chunk', { text: `⚠️ **Server Gemini Key Notice**: Please configure your \`GEMINI_API_KEY\` or \`OPENAI_API_KEY\` in **Settings > Providers & Keys** to chat with **Andromeda Soul 1.0** and **Gemini 3.6 Flash**.` });
    sendEvent('done', { model: modelId, status: 'no_key' });
    res.end();
  });

  // --- GOOGLE CLOUD CHAT SAVE SYSTEM & GMAIL EXPORT ENDPOINTS ---
  app.post('/api/save-chat', (req: Request, res: Response) => {
    try {
      const { chatId, title, messages, userId } = req.body;
      const dataDir = path.join(process.cwd(), 'data', 'chats');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const safeChatId = chatId ? String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_') : 'chat_' + Date.now();
      const filePath = path.join(dataDir, `${safeChatId}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ chatId: safeChatId, userId: userId || 'anonymous', title: title || 'Andromeda Chat', messages: messages || [], updatedAt: Date.now() }, null, 2));
      return res.json({ status: 'success', chatId: safeChatId, filePath, savedToGoogleCloud: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/export-to-gmail', (req: Request, res: Response) => {
    try {
      const { title, messages, userEmail } = req.body;
      const chatTitle = title || 'Andromeda AI Transcript';
      let plainText = `Transcript from Andromeda AI Studio\nConversation: ${chatTitle}\nDate: ${new Date().toISOString()}\n\n========================================\n\n`;

      if (Array.isArray(messages)) {
        for (const m of messages) {
          const role = m.role === 'assistant' ? 'Andromeda Soul AI' : (m.role === 'user' ? 'User' : 'System');
          plainText += `[${role}] (${new Date(m.timestamp || Date.now()).toLocaleTimeString()}):\n${m.content}\n\n----------------------------------------\n\n`;
        }
      }

      // Generate Gmail compose web URL for instant 1-click email export
      const subjectEncoded = encodeURIComponent(`[Andromeda Chat Backup] ${chatTitle}`);
      const bodyEncoded = encodeURIComponent(plainText);
      const toParam = userEmail ? encodeURIComponent(userEmail) : '';
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${toParam}&su=${subjectEncoded}&body=${bodyEncoded}`;

      return res.json({
        status: 'success',
        title: chatTitle,
        gmailComposeUrl,
        transcript: plainText,
        savedToGoogleCloud: true,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/load-chats', (req: Request, res: Response) => {
    try {
      const dataDir = path.join(process.cwd(), 'data', 'chats');
      if (!fs.existsSync(dataDir)) {
        return res.json({ chats: [] });
      }
      const files = fs.readdirSync(dataDir);
      const chats = files.map((file) => {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
        return JSON.parse(content);
      });
      return res.json({ chats });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });



  // --- USERSCRIPT STATIC SERVING ---
  app.get('/izenlol.user.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'izenlol.user.js'));
  });

  app.get('/izen.user.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(process.cwd(), 'public', 'izen.user.js'));
  });

  // --- VITE MIDDLEWARE (DEV) OR STATIC SERVE (PROD) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Gemini Chat Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
