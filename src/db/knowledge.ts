import { db } from './index.ts';
import { learnedKnowledge, users } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export interface KnowledgeInput {
  id: string;
  userUid: string;
  title: string;
  content: string;
  tags?: string[];
  category?: string;
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

export async function saveLearnedKnowledge(input: KnowledgeInput) {
  try {
    // Ensure user exists
    await db
      .insert(users)
      .values({
        uid: input.userUid,
        email: '',
        name: 'User',
      })
      .onConflictDoNothing();

    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();

    const result = await db
      .insert(learnedKnowledge)
      .values({
        id: input.id,
        userUid: input.userUid,
        title: input.title,
        content: input.content,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        category: input.category || 'General',
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: learnedKnowledge.id,
        set: {
          title: input.title,
          content: input.content,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          category: input.category || 'General',
          updatedAt,
        },
      })
      .returning();

    const item = result[0];
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags ? JSON.parse(item.tags) : [],
      category: item.category,
      createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now(),
    };
  } catch (error) {
    console.error('Database saveLearnedKnowledge failed:', error);
    throw new Error('Database knowledge save failed. Please try again later.', { cause: error });
  }
}

export async function getLearnedKnowledge(userUid: string) {
  try {
    const list = await db
      .select()
      .from(learnedKnowledge)
      .where(eq(learnedKnowledge.userUid, userUid))
      .orderBy(desc(learnedKnowledge.updatedAt));

    return list.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags ? JSON.parse(item.tags) : [],
      category: item.category,
      createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now(),
    }));
  } catch (error) {
    console.error('Database getLearnedKnowledge failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteLearnedKnowledge(id: string, userUid: string) {
  try {
    await db.delete(learnedKnowledge).where(eq(learnedKnowledge.id, id));
    return { success: true };
  } catch (error) {
    console.error('Database deleteLearnedKnowledge failed:', error);
    throw new Error('Database delete failed. Please try again later.', { cause: error });
  }
}
