import { db } from './index.ts';
import { projects, users } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export interface ProjectInput {
  id: string;
  userUid: string;
  title: string;
  description?: string;
  code?: string;
  type?: string;
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

export async function saveProject(input: ProjectInput) {
  try {
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
      .insert(projects)
      .values({
        id: input.id,
        userUid: input.userUid,
        title: input.title,
        description: input.description || '',
        code: input.code || '',
        type: input.type || 'app',
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          title: input.title,
          description: input.description || '',
          code: input.code || '',
          type: input.type || 'app',
          updatedAt,
        },
      })
      .returning();

    const p = result[0];
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      type: p.type,
      createdAt: p.createdAt ? new Date(p.createdAt).getTime() : Date.now(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt).getTime() : Date.now(),
    };
  } catch (error) {
    console.error('Database saveProject failed:', error);
    throw new Error('Database project save failed. Please try again later.', { cause: error });
  }
}

export async function getProjects(userUid: string) {
  try {
    const list = await db
      .select()
      .from(projects)
      .where(eq(projects.userUid, userUid))
      .orderBy(desc(projects.updatedAt));

    return list.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      type: p.type,
      createdAt: p.createdAt ? new Date(p.createdAt).getTime() : Date.now(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt).getTime() : Date.now(),
    }));
  } catch (error) {
    console.error('Database getProjects failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteProject(id: string, userUid: string) {
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return { success: true };
  } catch (error) {
    console.error('Database deleteProject failed:', error);
    throw new Error('Database delete failed. Please try again later.', { cause: error });
  }
}
