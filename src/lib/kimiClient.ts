import { ChatMessage, ChatAttachment } from '../types';

export interface StreamKimiParams {
  prompt: string;
  history?: ChatMessage[];
  modelName?: string;
  apiKey?: string;
  systemInstruction?: string;
  attachments?: ChatAttachment[];
  enableThinking?: boolean;
  onToken: (token: string) => void;
  onThought?: (thought: string) => void;
  signal?: AbortSignal;
}

export const DEFAULT_KIMI_API_KEY =
  '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';
export const DEFAULT_KIMI_MODEL = 'moonshotai/kimi-k3';
export const KIMI_INVOKE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Streams chat completions using the NVIDIA-hosted Moonshot Kimi K3 model.
 * Supports deep reasoning traces (reasoning_effort: "max"), multimodal vision attachments,
 * and high-context token streaming.
 */
export async function streamKimi({
  prompt,
  history = [],
  modelName = DEFAULT_KIMI_MODEL,
  apiKey,
  systemInstruction,
  attachments = [],
  onToken,
  onThought,
  signal,
}: StreamKimiParams): Promise<string> {
  // 1. Try server-side proxy /api/chat first to bypass any browser CORS restrictions
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        history: history.slice(-10),
        modelId: 'nvidia-kimi-k3',
        systemInstruction,
        enableThinking: true,
        attachments,
      }),
      signal,
    });

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (currentEvent === 'chunk' && parsed.text) {
                accumulated += parsed.text;
                onToken(parsed.text);
              } else if (currentEvent === 'thought' && parsed.thought && onThought) {
                onThought(parsed.thought);
              } else if (currentEvent === 'done') {
                return accumulated;
              }
            } catch {}
          }
        }
      }

      if (accumulated.trim()) {
        return accumulated;
      }
    }
  } catch (proxyErr) {
    console.warn('[streamKimi server proxy notice, attempting direct endpoint]:', proxyErr);
  }

  // 2. Direct NVIDIA endpoint fallback
  const activeKey = (apiKey || DEFAULT_KIMI_API_KEY).trim();
  const messages: any[] = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  for (const msg of history.slice(-10)) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  // Multimodal user content (text + optional image attachments)
  let userContent: any = prompt || 'Hello';
  if (attachments && attachments.length > 0) {
    const parts: any[] = [{ type: 'text', text: prompt || '' }];
    for (const att of attachments) {
      if (att.data && (att.type?.startsWith('image/') || att.type === 'image')) {
        parts.push({
          type: 'image_url',
          image_url: { url: att.data },
        });
      }
    }
    userContent = parts;
  }
  messages.push({ role: 'user', content: userContent });

  const payload = {
    messages,
    model: modelName || DEFAULT_KIMI_MODEL,
    max_tokens: 16384,
    seed: 0,
    stream: true,
    temperature: 1,
    reasoning_effort: 'max',
  };

  const response = await fetch(KIMI_INVOKE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
    } catch {
      errDetail = await response.text();
    }
    throw new Error(`Kimi API Error (${response.status}): ${errDetail || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body from Kimi API is empty.');
  }

  const decoder = new TextDecoder('utf-8');
  let accumulatedText = '';
  let accumulatedThought = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith(':')) continue;

      if (cleanLine.startsWith('data: ')) {
        const dataStr = cleanLine.slice(6).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta || {};

          // Extract reasoning / thought
          const reasoning = delta.reasoning_content || delta.thinking || choice.reasoning_content;
          if (reasoning && onThought) {
            accumulatedThought += reasoning;
            onThought(accumulatedThought);
          }

          // Extract generated text
          const text = delta.content || choice.text;
          if (text) {
            accumulatedText += text;
            onToken(text);
          }
        } catch {}
      }
    }
  }

  return accumulatedText;
}
