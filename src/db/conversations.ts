import { db } from './index.ts';
import { conversations, messages, users } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export interface MessageInput {
  id: string;
  role: string;
  content: string;
  model?: string;
  tokens?: number;
  reasoningTimeMs?: number;
  thinking?: string;
  timestamp?: number | Date;
}

export interface ConversationInput {
  id: string;
  userUid: string;
  title: string;
  model?: string;
  pinned?: boolean;
  tags?: string[];
  summary?: string;
  messages?: MessageInput[];
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

export async function saveConversation(input: ConversationInput) {
  try {
    // 1. Ensure user exists in users table
    await db
      .insert(users)
      .values({
        uid: input.userUid,
        email: '',
        name: 'User',
      })
      .onConflictDoNothing();

    // 2. Insert or update conversation
    const convCreatedAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const convUpdatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();

    await db
      .insert(conversations)
      .values({
        id: input.id,
        userUid: input.userUid,
        title: input.title,
        model: input.model || 'andromeda-soul-1',
        pinned: input.pinned ?? false,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        summary: input.summary || null,
        createdAt: convCreatedAt,
        updatedAt: convUpdatedAt,
      })
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          title: input.title,
          model: input.model || 'andromeda-soul-1',
          pinned: input.pinned ?? false,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          summary: input.summary || null,
          updatedAt: convUpdatedAt,
        },
      });

    // 3. Upsert messages if provided
    if (input.messages && input.messages.length > 0) {
      for (const m of input.messages) {
        const msgTime = m.timestamp ? new Date(m.timestamp) : new Date();
        await db
          .insert(messages)
          .values({
            id: m.id,
            conversationId: input.id,
            role: m.role,
            content: m.content,
            model: m.model || null,
            tokens: m.tokens || null,
            reasoningTimeMs: m.reasoningTimeMs || null,
            thinking: m.thinking || null,
            timestamp: msgTime,
          })
          .onConflictDoUpdate({
            target: messages.id,
            set: {
              content: m.content,
              model: m.model || null,
              tokens: m.tokens || null,
              reasoningTimeMs: m.reasoningTimeMs || null,
              thinking: m.thinking || null,
            },
          });
      }
    }

    return await getConversationById(input.id, input.userUid);
  } catch (error) {
    console.error('Database saveConversation failed:', error);
    throw new Error('Database conversation save failed. Please try again later.', { cause: error });
  }
}

export async function getConversations(userUid: string) {
  try {
    const userConvs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userUid, userUid))
      .orderBy(desc(conversations.updatedAt));

    const result = [];
    for (const c of userConvs) {
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(messages.timestamp);

      result.push({
        id: c.id,
        title: c.title,
        model: c.model,
        pinned: c.pinned,
        tags: c.tags ? JSON.parse(c.tags) : [],
        summary: c.summary,
        createdAt: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
        updatedAt: c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now(),
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          tokens: m.tokens,
          reasoningTimeMs: m.reasoningTimeMs,
          thinking: m.thinking,
          timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
        })),
      });
    }

    return result;
  } catch (error) {
    console.error('Database getConversations failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getConversationById(id: string, userUid: string) {
  try {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (convs.length === 0) return null;
    const c = convs[0];

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(messages.timestamp);

    return {
      id: c.id,
      title: c.title,
      model: c.model,
      pinned: c.pinned,
      tags: c.tags ? JSON.parse(c.tags) : [],
      summary: c.summary,
      createdAt: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now(),
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        tokens: m.tokens,
        reasoningTimeMs: m.reasoningTimeMs,
        thinking: m.thinking,
        timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
      })),
    };
  } catch (error) {
    console.error('Database getConversationById failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteConversation(id: string, userUid: string) {
  try {
    await db.delete(conversations).where(eq(conversations.id, id));
    return { success: true };
  } catch (error) {
    console.error('Database deleteConversation failed:', error);
    throw new Error('Database delete failed. Please try again later.', { cause: error });
  }
}

export async function deleteAllConversations(userUid: string) {
  try {
    await db.delete(conversations).where(eq(conversations.userUid, userUid));
    return { success: true };
  } catch (error) {
    console.error('Database deleteAllConversations failed:', error);
    throw new Error('Database delete failed. Please try again later.', { cause: error });
  }
}
