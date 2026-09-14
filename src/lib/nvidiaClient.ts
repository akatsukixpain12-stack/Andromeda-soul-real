import { ChatMessage, ChatAttachment } from '../types';

export interface StreamNVIDIAParams {
  prompt: string;
  history: ChatMessage[];
  modelName?: string;
  apiKey?: string;
  systemInstruction?: string;
  attachments?: ChatAttachment[];
  enableThinking?: boolean;
  onToken: (token: string) => void;
  onThought?: (thought: string) => void;
  signal?: AbortSignal;
}

export const DEFAULT_NVIDIA_API_KEY =
  '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';
export const DEFAULT_KIMI_API_KEY =
  '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';
export const DEFAULT_NVIDIA_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
export const DEFAULT_KIMI_MODEL = 'moonshotai/kimi-k3';
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Streams chat completion using backend /api/chat proxy or direct NVIDIA API endpoint.
 * Supports reasoning_content (thinking process) and text generation.
 */
export async function streamNVIDIA({
  prompt,
  history = [],
  modelName = DEFAULT_NVIDIA_MODEL,
  apiKey,
  systemInstruction,
  attachments = [],
  enableThinking = true,
  onToken,
  onThought,
  signal,
}: StreamNVIDIAParams): Promise<string> {
  // 1. Try server-side proxy /api/chat first to prevent CORS blocks
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        history: history.slice(-10),
        modelId: modelName.includes('kimi') ? 'nvidia-kimi-k3' : 'andromeda-soul-1',
        systemInstruction,
        enableThinking,
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
    console.warn('[streamNVIDIA server proxy failed, trying direct endpoint]:', proxyErr);
  }

  // 2. Direct fetch fallback
  const isKimi = modelName.includes('kimi');
  const activeKey = (apiKey || (isKimi ? DEFAULT_KIMI_API_KEY : DEFAULT_NVIDIA_API_KEY)).trim();

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

  // Format current user message with text + attachments
  let userContent: any = prompt || 'Hello';
  if (attachments && attachments.length > 0) {
    const parts: any[] = [{ type: 'text', text: prompt || '' }];
    for (const att of attachments) {
      if (att.data && att.type.startsWith('image/')) {
        parts.push({
          type: 'image_url',
          image_url: { url: att.data },
        });
      }
    }
    userContent = parts;
  }
  messages.push({ role: 'user', content: userContent });

  const bodyPayload: any = isKimi
    ? {
        model: DEFAULT_KIMI_MODEL,
        messages,
        max_tokens: 16384,
        seed: 0,
        temperature: 1,
        stream: true,
        reasoning_effort: 'max',
      }
    : {
        model: modelName,
        messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        stream: true,
        extra_body: enableThinking
          ? { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: 16384 }
          : undefined,
      };

  const response = await fetch(NVIDIA_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(bodyPayload),
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
    throw new Error(`NVIDIA API Error (${response.status}): ${errDetail || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is empty or unreadable from NVIDIA API');
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

          // Extract thinking/reasoning content if present
          const reasoning = delta.reasoning_content || delta.thinking || choice.reasoning_content;
          if (reasoning && onThought) {
            accumulatedThought += reasoning;
            onThought(accumulatedThought);
          }

          // Extract standard text content
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
