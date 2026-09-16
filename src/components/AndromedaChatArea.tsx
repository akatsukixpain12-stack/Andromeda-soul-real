import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'motion/react';
import {
  Sparkles,
  Send,
  Square,
  Paperclip,
  X,
  Copy,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronRight,
  Brain,
  FileText,
  Zap,
  Flame,
  Cpu,
  HardDrive,
  FolderArchive,
  Bot,
  RefreshCw,
  CheckCircle2,
  Cloud,
  Plus,
  Globe,
  Compass,
  FolderGit2,
  Sliders,
  PenTool,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { ChatMessage, ChatAttachment, AIModelOption, UserProfile, LearnedKnowledge } from '../types';
import { AI_MODELS, findModelById } from '../data/models';
import { UserAvatar } from './UserAvatar';
import { createZipFromCode, triggerDownload } from '../lib/zipExporter';
import { DiscordLiveChatModal } from './DiscordLiveChatModal';
import { LearnedKnowledgeModal } from './LearnedKnowledgeModal';
import { dbSaveLearnedKnowledge, dbSubscribeKnowledge } from '../lib/firebase';
import { getSavedGitHubToken, getSavedActiveRepo } from '../lib/githubClient';

interface AndromedaChatAreaProps {
  messages: ChatMessage[];
  streamingMessage: string;
  streamingThought?: string;
  isStreaming: boolean;
  onSendMessage: (prompt: string, attachments?: ChatAttachment[], enableThinking?: boolean, thinkingLevel?: 'low' | 'medium' | 'high') => void;
  onStopStreaming: () => void;
  onRegenerate: () => void;
  onClearChat: () => void;
  onNewChat: () => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  userName?: string;
  currentUser?: UserProfile | null;
  onEditMessage?: (content: string) => void;
  onOpenProvidersModal: () => void;
  onOpenDiscord?: () => void;
  onOpenGitHubModal?: () => void;
  activeGitHubRepo?: string;
  customModels?: AIModelOption[];
}

export const AndromedaChatArea: React.FC<AndromedaChatAreaProps> = ({
  messages,
  streamingMessage,
  streamingThought,
  isStreaming,
  onSendMessage,
  onStopStreaming,
  onRegenerate,
  selectedModelId,
  onSelectModel,
  userName = 'User',
  currentUser,
  onOpenProvidersModal,
  onOpenDiscord,
  onOpenGitHubModal,
  activeGitHubRepo,
  customModels = [],
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(true);
  const [thinkingLevel, setThinkingLevel] = useState<'low' | 'medium' | 'high'>('high');
  const [isHoveringThinking, setIsHoveringThinking] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(true);
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState(() => !!getSavedGitHubToken());
  const [activeRepo, setActiveRepo] = useState(() => activeGitHubRepo || getSavedActiveRepo());

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [zippingCodeKey, setZippingCodeKey] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  // Discord Live Interactive Pop-up & Side Update State
  const [isDiscordLiveChatOpen, setIsDiscordLiveChatOpen] = useState(false);
  const [activeBotCode, setActiveBotCode] = useState('');
  const [updatingCodeKey, setUpdatingCodeKey] = useState<string | null>(null);
  const [updatedCodeKey, setUpdatedCodeKey] = useState<string | null>(null);

  // Cloud Learned Knowledge State
  const [isLearnedKnowledgeOpen, setIsLearnedKnowledgeOpen] = useState(false);
  const [learnedKnowledgeList, setLearnedKnowledgeList] = useState<LearnedKnowledge[]>([]);
  const [teachingMsgId, setTeachingMsgId] = useState<string | null>(null);
  const [taughtSuccessMsgId, setTaughtSuccessMsgId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const currentModel = findModelById(selectedModelId, customModels);

  // Update token & repo state
  useEffect(() => {
    setHasGitHubToken(!!getSavedGitHubToken());
    setActiveRepo(activeGitHubRepo || getSavedActiveRepo());
  }, [activeGitHubRepo, isPlusMenuOpen]);

  // Close plus menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    };
    if (isPlusMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isPlusMenuOpen]);

  // Subscribe to Cloud Learned Knowledge for this user
  useEffect(() => {
    if (currentUser?.id) {
      const unsub = dbSubscribeKnowledge(currentUser.id, (list) => {
        setLearnedKnowledgeList(list);
      });
      return () => unsub();
    }
  }, [currentUser?.id]);

  // Auto-scroll as text streams
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, streamingThought]);

  // Auto-resize input textarea with safe minimum height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.max(48, Math.min(textareaRef.current.scrollHeight, 220));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputText]);

  // Handle Form Submit & Intercept /discord Command
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPrompt = inputText.trim();

    // Check for /discord command: opens Discord connect page directly without any extra steps
    if (cleanPrompt.toLowerCase() === '/discord' || cleanPrompt.toLowerCase().startsWith('/discord ')) {
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = '48px';
      if (onOpenDiscord) {
        onOpenDiscord();
        return;
      }
    }

    if ((!cleanPrompt && attachments.length === 0) || isStreaming) return;

    onSendMessage(cleanPrompt, attachments, isThinkingEnabled, thinkingLevel);
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ZIP Exporter Handlers
  const handleDownloadCodeZip = async (codeKey: string, code: string, lang: string) => {
    setZippingCodeKey(codeKey);
    try {
      const result = await createZipFromCode(
        `\`\`\`${lang}\n${code}\n\`\`\``,
        `andromeda_${lang}_artifact`
      );
      if (result.success && result.blob && result.filename) {
        triggerDownload(result.blob, result.filename);
      }
    } catch (err) {
      console.error('Error generating code ZIP:', err);
    } finally {
      setZippingCodeKey(null);
    }
  };

  const handleDownloadFullMessageZip = async (messageId: string, fullContent: string) => {
    setZippingCodeKey(`full-${messageId}`);
    try {
      const result = await createZipFromCode(fullContent, `andromeda_project_${messageId.slice(0, 8)}`);
      if (result.success && result.blob && result.filename) {
        triggerDownload(result.blob, result.filename);
      }
    } catch (err) {
      console.error('Error generating project ZIP:', err);
    } finally {
      setZippingCodeKey(null);
    }
  };

  // Direct Side "Update Bot" Action
  const handleDirectUpdateBot = async (codeKey: string, codeString: string) => {
    setUpdatingCodeKey(codeKey);
    try {
      await fetch('/api/discord/update-bot-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeString, filename: 'index.js' }),
      });
      setUpdatedCodeKey(codeKey);
      setTimeout(() => setUpdatedCodeKey(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingCodeKey(null);
    }
  };

  // Teach Andromeda / Save to Google Cloud Server
  const handleTeachAndromeda = async (msgId: string, content: string) => {
    setTeachingMsgId(msgId);
    try {
      const firstLine = content.split('\n')[0].replace(/[#*`_]/g, '').trim();
      const topic = firstLine.slice(0, 60) || 'AI Assistant Solution';
      const insight = content.slice(0, 450);

      const item: LearnedKnowledge = {
        id: `know-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        topic,
        insight,
        category: content.includes('discord') ? 'discord_bot' : content.includes('```') ? 'coding_style' : 'general_intelligence',
        source: 'feedback',
        userId: currentUser?.id || 'usr_local',
        userEmail: currentUser?.email,
        createdAt: Date.now(),
        tags: ['auto-learned', 'cloud-sync'],
      };

      if (currentUser?.id && currentUser.provider !== 'guest') {
        await dbSaveLearnedKnowledge(currentUser.id, item);
      }
      setLearnedKnowledgeList((prev) => [item, ...prev]);
      setTaughtSuccessMsgId(msgId);
      setTimeout(() => setTaughtSuccessMsgId(null), 3000);
    } catch (err) {
      console.error('Failed to teach Andromeda:', err);
    } finally {
      setTeachingMsgId(null);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleCopyCode = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  const handleToggleSpeak = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.').replace(/[#*`_]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const newAttachment: ChatAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data: base64Data,
          previewUrl: file.type.startsWith('image/') ? base64Data : undefined,
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'andromeda':
        return <Flame className="w-3.5 h-3.5 text-[#D97706]" />;
      case 'google':
      case 'gemini':
        return <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />;
      case 'ollama':
        return <Cpu className="w-3.5 h-3.5 text-[#059669]" />;
      case 'lmstudio':
        return <HardDrive className="w-3.5 h-3.5 text-[#7C3AED]" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-[#4F46E5]" />;
    }
  };

  // Token Usage & Cost Calculation
  const totalSessionChars = messages.reduce((acc, m) => acc + (m.content?.length || 0) + (m.thought?.length || 0), 0) + streamingMessage.length + (streamingThought?.length || 0) + inputText.length;
  const estimatedTokens = Math.max(16, Math.round(totalSessionChars / 4));
  const costPerToken = currentModel.provider === 'gemini' ? 0.00000025 : 0.00000015;
  const estimatedCost = (estimatedTokens * costPerToken).toFixed(4);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/60 relative overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6">
        <div className="w-full max-w-4xl mx-auto space-y-6">
          {/* Empty Chat Welcome Landing Screen */}
          {messages.length === 0 && !isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="min-h-[58vh] flex flex-col items-center justify-center text-center px-4 py-8"
            >
              <div className="relative mb-6 group cursor-pointer" onClick={onOpenProvidersModal}>
                <div className="absolute inset-0 rounded-3xl bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20 transition-all" />
                <img
                  src="/andromeda-logo.png"
                  alt="Andromeda Soul Mascot"
                  className="w-24 h-24 rounded-3xl object-cover shadow-xl border border-indigo-100 ring-4 ring-indigo-50/80 group-hover:scale-105 transition-transform duration-300 relative z-10"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
                Andromeda Soul
              </h1>
              <p className="text-sm sm:text-base text-slate-500 font-medium max-w-md leading-relaxed mb-8">
                Think • Code • Create • Together
              </p>

              {/* Interactive Suggestion Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-w-3xl w-full">
                {[
                  { title: 'Build a Discord bot', desc: 'Code an autonomous bot with /discord command', prompt: 'Build a Discord bot' },
                  { title: 'Create a TypeScript project', desc: 'Generate a full production Vite + Express app', prompt: 'Create a TypeScript project' },
                  { title: 'Explain quantum computing', desc: 'Understand qubit state superposition simply', prompt: 'Explain quantum computing' },
                  { title: 'Generate an image', desc: 'Synthesize a photo-realistic futuristic city', prompt: 'Generate an image of a futuristic cybernetic city' },
                  { title: 'Analyze my code', desc: 'Refactor and optimize TypeScript performance', prompt: 'Analyze my code for optimization and edge cases' },
                  { title: 'Build a website', desc: 'Design a high-converting white minimalist landing page', prompt: 'Build a responsive modern website' },
                ].map((card) => (
                  <button
                    key={card.title}
                    onClick={() => onSendMessage(card.prompt, [], isThinkingEnabled)}
                    className="group text-left p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300/80 text-slate-800 transition-all cursor-pointer shadow-xs hover:shadow-md bouncy-card"
                  >
                    <span className="block text-xs font-bold text-indigo-600 mb-1 flex items-center justify-between">
                      <span>Suggestion</span>
                      <Sparkles className="w-3 h-3 text-indigo-400 group-hover:scale-110 transition-transform" />
                    </span>
                    <span className="block font-bold text-sm text-slate-900 mb-1">{card.title}</span>
                    <span className="block text-xs text-slate-500 leading-snug">{card.desc}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((message) => {
            const isUser = message.role === 'user';
            const content = message.content;
            const thought = message.thought;
            const isThoughtExpanded = expandedThoughts[message.id] ?? false;

            if (isUser) {
              return (
                <motion.div
                  key={message.id}
                  initial={{ scale: 0.92, opacity: 0, y: 14 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  className="flex justify-end items-start gap-3"
                >
                  <div className="max-w-[85%] sm:max-w-[75%] space-y-2">
                    {/* User attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#EBE8DF] border border-[#DDD9CE] text-xs text-[#1C1917]"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#78716C]" />
                            <span className="font-mono text-xs max-w-[140px] truncate">{att.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="px-4 py-3 rounded-2xl rounded-tr-md bg-slate-900 text-white text-sm leading-relaxed whitespace-pre-wrap font-sans shadow-sm shadow-slate-200 selection:bg-indigo-500 selection:text-white">
                      {content}
                    </div>
                  </div>
                  <UserAvatar user={currentUser} name={userName} size="sm" />
                </motion.div>
              );
            }

            // Assistant message
            return (
              <motion.div
                key={message.id}
                initial={{ scale: 0.92, opacity: 0, y: 14 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="flex flex-col space-y-3 rounded-2xl bg-white border border-slate-200/80 px-4 py-4 sm:px-5 shadow-sm"
              >
                {/* Assistant Model Tag & Thought */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white border border-[#E2E0D8] flex items-center justify-center shadow-2xs">
                    {getProviderIcon(currentModel.provider)}
                  </div>
                  <span className="text-xs font-semibold text-[#1C1917]">{currentModel.name}</span>
                  {message.modelId && (
                    <span className="text-[10px] font-mono text-[#A8A29E] px-1.5 py-0.5 rounded bg-[#F0EEE6]">
                      {message.modelId}
                    </span>
                  )}
                </div>

                {/* Thought Accordion */}
                {thought && (
                  <div className="rounded-xl border border-[#E2E0D8] bg-[#F4F2EB]/60 overflow-hidden text-xs">
                    <button
                      onClick={() => toggleThought(message.id)}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <Brain className="w-3.5 h-3.5 text-amber-600" />
                        <span>Thinking Process & Reasoning</span>
                      </div>
                      {isThoughtExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {isThoughtExpanded && (
                      <div className="px-3.5 py-2.5 bg-white/70 border-t border-[#E2E0D8] text-[#44403C] font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {thought}
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant Markdown Content */}
                <div className="prose prose-sm max-w-none text-[#1C1917] leading-relaxed">
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeString = String(children).replace(/\n$/, '');

                        if (!inline && match) {
                          const lang = match[1];
                          const codeKey = `code-${message.id}-${codeString.slice(0, 16)}`;
                          const isCopied = copiedCodeKey === codeKey;
                          const isDiscordCode =
                            codeString.includes('discord.js') ||
                            codeString.includes('Client') ||
                            codeString.includes('GatewayIntentBits') ||
                            codeString.includes('SlashCommandBuilder') ||
                            codeString.includes('discord.py') ||
                            codeString.includes('discord.ext');

                          return (
                            <div className="relative my-3 rounded-xl overflow-hidden border border-zinc-800 bg-[#18181B] text-zinc-100 shadow-sm">
                              <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-xs text-zinc-400">
                                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-300">
                                  {lang}
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* Discord Live Pop-up Trigger */}
                                  {isDiscordCode && (
                                    <button
                                      onClick={() => {
                                        setActiveBotCode(codeString);
                                        setIsDiscordLiveChatOpen(true);
                                      }}
                                      className="flex items-center gap-1 text-xs text-[#5865F2] hover:text-[#7289DA] transition-colors cursor-pointer font-medium"
                                      title="Open interactive Discord chat simulator"
                                    >
                                      <Bot className="w-3.5 h-3.5" />
                                      <span>Live Discord Chat</span>
                                    </button>
                                  )}

                                  {/* Side Update Button */}
                                  {isDiscordCode && (
                                    <button
                                      id={`update-bot-btn-${codeKey}`}
                                      onClick={() => handleDirectUpdateBot(codeKey, codeString)}
                                      disabled={updatingCodeKey === codeKey}
                                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                                        updatedCodeKey === codeKey
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-[#5865F2] hover:bg-[#4752C4] text-white'
                                      }`}
                                      title="Hot-reload and update Discord bot script"
                                    >
                                      {updatingCodeKey === codeKey ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : updatedCodeKey === codeKey ? (
                                        <CheckCircle2 className="w-3 h-3" />
                                      ) : (
                                        <RefreshCw className="w-3 h-3" />
                                      )}
                                      <span>
                                        {updatingCodeKey === codeKey
                                          ? 'Updating...'
                                          : updatedCodeKey === codeKey
                                          ? 'Bot Updated!'
                                          : 'Update Bot'}
                                      </span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleDownloadCodeZip(codeKey, codeString, lang)}
                                    disabled={zippingCodeKey === codeKey}
                                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer font-mono"
                                    title="Download as standalone code ZIP"
                                  >
                                    <FolderArchive className="w-3.5 h-3.5" />
                                    <span>{zippingCodeKey === codeKey ? 'Zipping...' : 'ZIP'}</span>
                                  </button>
                                  <button
                                    onClick={() => handleCopyCode(codeKey, codeString)}
                                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed">
                                <code>{children}</code>
                              </pre>
                            </div>
                          );
                        }

                        return (
                          <code className="px-1.5 py-0.5 rounded-md bg-[#F2F0E8] text-[#292524] text-xs font-mono font-medium">
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-between pt-1 text-xs text-[#78716C]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopyMessage(message.id, content)}
                      className="p-1.5 rounded-lg hover:bg-[#F0EEE6] hover:text-[#1C1917] transition-colors cursor-pointer"
                      title="Copy response"
                    >
                      {copiedMsgId === message.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => handleToggleSpeak(message.id, content)}
                      className="p-1.5 rounded-lg hover:bg-[#F0EEE6] hover:text-[#1C1917] transition-colors cursor-pointer"
                      title={speakingMsgId === message.id ? 'Stop audio' : 'Read aloud'}
                    >
                      {speakingMsgId === message.id ? (
                        <VolumeX className="w-3.5 h-3.5 text-[#D97706]" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={onRegenerate}
                      className="p-1.5 rounded-lg hover:bg-[#F0EEE6] hover:text-[#1C1917] transition-colors cursor-pointer"
                      title="Regenerate"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* If the message contains code blocks, show quick project ZIP exporter */}
                  {content.includes('```') && (
                    <button
                      onClick={() => handleDownloadFullMessageZip(message.id, content)}
                      disabled={zippingCodeKey === `full-${message.id}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer font-mono"
                      title="Export all generated files as a single downloadable ZIP project"
                    >
                      <FolderArchive className="w-3.5 h-3.5 text-amber-600" />
                      <span>{zippingCodeKey === `full-${message.id}` ? 'Building ZIP...' : 'Export Code ZIP'}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Active Streaming Message */}
          {isStreaming && (
            <div className="space-y-3 animate-in fade-in duration-100">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-[#E2E0D8] flex items-center justify-center shadow-2xs">
                  {getProviderIcon(currentModel.provider)}
                </div>
                <span className="text-xs font-semibold text-[#1C1917]">{currentModel.name}</span>
                <span className="text-[11px] text-[#D97706] flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-ping" />
                  Streaming...
                </span>
              </div>

              {streamingThought && (
                <div className="rounded-xl border border-[#E2E0D8] bg-[#F4F2EB]/60 p-3 text-xs font-mono text-[#78716C] leading-relaxed whitespace-pre-wrap animate-pulse">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 mb-1">
                    <Brain className="w-3.5 h-3.5" />
                    <span>Thinking...</span>
                  </div>
                  {streamingThought}
                </div>
              )}

              {streamingMessage && (
                <div className="prose prose-sm max-w-none text-[#1C1917] leading-relaxed">
                  <ReactMarkdown>{streamingMessage}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Box Area */}
      <motion.div
        initial={{ y: 25, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="p-3 sm:p-5 bg-white/80 border-t border-slate-200/80 shrink-0 backdrop-blur-md"
      >
        <div className="w-full max-w-4xl mx-auto">
          {/* Active Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-mono text-xs max-w-[150px] truncate">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="p-0.5 text-slate-400 hover:text-rose-600 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Unified Bouncy Input Card */}
          <div className="relative rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/40 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100/60 transition-all overflow-visible">
            
            {/* ChatGPT-Style Plus Tool Menu Popup */}
            {isPlusMenuOpen && (
              <div
                ref={plusMenuRef}
                className="absolute bottom-full left-2 mb-2 w-64 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 text-slate-800 dark:text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-150 space-y-0.5"
              >
                {/* 1. Sketch */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    setInputText('/image A futuristic glowing cityscape with cybernetic architecture, neon reflections, 8k masterpiece');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                >
                  <div className="w-6 h-6 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center">
                    <PenTool className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">Sketch / Canvas</div>
                    <div className="text-[10px] text-slate-400 font-normal">Generate or draw image & UI</div>
                  </div>
                </button>

                {/* 2. Thinking */}
                <div
                  onMouseEnter={() => setIsHoveringThinking(true)}
                  onMouseLeave={() => setIsHoveringThinking(false)}
                  className="relative"
                >
                  <button
                    type="button"
                    onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                        <Brain className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold">Thinking</div>
                        <div className="text-[10px] text-slate-400 font-normal capitalize">Level: {thinkingLevel}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {/* Thinking Sub-menu on Hover / Toggle */}
                  {isHoveringThinking && (
                    <div className="absolute left-full top-0 ml-1.5 w-44 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 space-y-1">
                      {(['low', 'medium', 'high'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setThinkingLevel(lvl);
                            setIsThinkingEnabled(true);
                            setIsHoveringThinking(false);
                            setIsPlusMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                            thinkingLevel === lvl && isThinkingEnabled
                              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 font-bold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <div className="capitalize">{lvl}</div>
                          {thinkingLevel === lvl && isThinkingEnabled && (
                            <Check className="w-3 h-3 text-amber-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Web search */}
                <button
                  type="button"
                  onClick={() => {
                    setIsWebSearchActive(!isWebSearchActive);
                    setIsPlusMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">Web search</div>
                      <div className="text-[10px] text-slate-400 font-normal">Real-time web grounding</div>
                    </div>
                  </div>
                  {isWebSearchActive && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>

                {/* 4. Deep research */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDeepResearchActive(!isDeepResearchActive);
                    setIsPlusMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                      <Compass className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">Deep research</div>
                      <div className="text-[10px] text-slate-400 font-normal">Multi-step deep synthesis</div>
                    </div>
                  </div>
                  {isDeepResearchActive && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>

                {/* 5. GitHub (with checkmark when connected) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    if (onOpenGitHubModal) onOpenGitHubModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
                      <FolderGit2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">GitHub</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {activeRepo ? `Active: ${activeRepo}` : 'Modify & push commits'}
                      </div>
                    </div>
                  </div>
                  {hasGitHubToken && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>

                {/* 6. OpenAI Platform / Providers */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    onOpenProvidersModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left border-t border-slate-100 dark:border-slate-800/80 pt-1.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <Sliders className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">Providers & Keys</div>
                      <div className="text-[10px] text-slate-400 font-normal">NVIDIA, Gemini, OpenAI</div>
                    </div>
                  </div>
                </button>
              </div>
            )}

            <textarea
              id="andromeda-chat-input"
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${currentModel.name} anything, code a Discord bot (/discord), or build apps...`}
              rows={1}
              className="w-full px-4 pt-3.5 pb-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none resize-none bg-transparent font-sans leading-relaxed"
            />

            {/* Bottom Actions Toolbar inside Card */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50/60 border-t border-slate-100">
              <div className="flex items-center gap-1 sm:gap-2">
                
                {/* 1. ChatGPT-Style Plus Tool Button */}
                <button
                  id="plus-tools-menu-button"
                  type="button"
                  onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                  className={`p-2 sm:p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer bouncy-btn ${
                    isPlusMenuOpen ? 'bg-slate-200 text-slate-900' : ''
                  }`}
                  title="Tools (Sketch, Thinking, Search, GitHub, Providers)"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  className="hidden"
                  accept="image/*,text/*,.js,.jsx,.ts,.tsx,.py,.json,.md,.html,.css"
                />

                <button
                  id="attach-file-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 sm:p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white transition-all cursor-pointer bouncy-btn"
                  title="Attach images, documents, or code"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Extended Thinking Switch with Hover Slider for Low, Medium, High */}
                <div
                  className="relative"
                  onMouseEnter={() => setIsHoveringThinking(true)}
                  onMouseLeave={() => setIsHoveringThinking(false)}
                >
                  <button
                    id="toggle-thinking-button"
                    type="button"
                    onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold transition-all cursor-pointer bouncy-btn ${
                      isThinkingEnabled
                        ? 'bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs'
                        : 'text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent'
                    }`}
                    title="Hover to switch Thinking budget (Low, Medium, High)"
                  >
                    <Brain className={`w-3.5 h-3.5 ${isThinkingEnabled ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span>
                      {isThinkingEnabled ? `Thinking (${thinkingLevel.toUpperCase()})` : 'Thinking OFF'}
                    </span>
                  </button>

                  {/* Hover Floating Level Switch */}
                  {isHoveringThinking && (
                    <div className="absolute bottom-full left-0 mb-1.5 flex items-center p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-lg z-50 text-xs font-medium animate-in fade-in duration-100">
                      {(['low', 'medium', 'high'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setThinkingLevel(lvl);
                            setIsThinkingEnabled(true);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize transition-all cursor-pointer ${
                            thinkingLevel === lvl && isThinkingEnabled
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* GitHub Active Repo Pill */}
                {activeRepo && (
                  <button
                    type="button"
                    onClick={onOpenGitHubModal}
                    className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-all cursor-pointer"
                    title="Manage repository files and push commits"
                  >
                    <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="truncate max-w-[130px]">{activeRepo}</span>
                  </button>
                )}

                {/* Model badge quick link */}
                <button
                  onClick={onOpenProvidersModal}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200 transition-all cursor-pointer bouncy-btn"
                  title="Click to configure providers"
                >
                  {getProviderIcon(currentModel.provider)}
                  <span className="font-semibold truncate max-w-[120px]">{currentModel.name}</span>
                </button>

                {/* Token Usage & Cost Tracker Badge */}
                <div className="relative group/token">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-indigo-50/90 text-indigo-700 border border-indigo-200/80 shadow-2xs cursor-default">
                    <Zap className="w-3 h-3 text-indigo-500 animate-pulse" />
                    <span>{estimatedTokens.toLocaleString()} tok</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-emerald-700 font-semibold">${estimatedCost}</span>
                  </div>

                  {/* Hover Tooltip breakdown */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/token:flex flex-col p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl z-50 w-52 font-mono space-y-1 pointer-events-none">
                    <div className="font-bold text-indigo-300 border-b border-slate-800 pb-1 flex justify-between">
                      <span>Token & Quota Tracker</span>
                      <span>{currentModel.name.split(' ')[0]}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Total Session Tokens:</span>
                      <span className="text-white font-bold">{estimatedTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Estimated Cost:</span>
                      <span className="text-emerald-400 font-bold">${estimatedCost}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-800/80">
                      Calculated from message history & active prompt length.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Action: Send / Stop button */}
              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    id="stop-streaming-button"
                    onClick={onStopStreaming}
                    className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-slate-900 hover:bg-rose-600 text-white transition-all cursor-pointer shadow-md bouncy-btn"
                    title="Stop generation"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    id="send-message-button"
                    onClick={() => handleSubmit()}
                    disabled={!inputText.trim() && attachments.length === 0}
                    className={`flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-full transition-all cursor-pointer bouncy-btn ${
                      inputText.trim() || attachments.length > 0
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 text-center text-[10px] sm:text-[11px] text-slate-400">
            Powered by Andromeda Soul Engine, GitHub integration & Google Cloud persistence.
          </div>
        </div>
      </motion.div>

      {/* Live Discord Chat Modal with Side Update Bot button */}
      <DiscordLiveChatModal
        isOpen={isDiscordLiveChatOpen}
        onClose={() => setIsDiscordLiveChatOpen(false)}
        botCode={activeBotCode}
        onUpdateBotCode={async (newCode) => {
          setActiveBotCode(newCode);
          return true;
        }}
      />

      {/* Learned Knowledge Modal (Google Cloud Server) */}
      <LearnedKnowledgeModal
        isOpen={isLearnedKnowledgeOpen}
        onClose={() => setIsLearnedKnowledgeOpen(false)}
        knowledgeList={learnedKnowledgeList}
        currentUser={currentUser}
        onAddKnowledge={(item) => {
          setLearnedKnowledgeList((prev) => [item, ...prev]);
        }}
      />
    </div>
  );
};
