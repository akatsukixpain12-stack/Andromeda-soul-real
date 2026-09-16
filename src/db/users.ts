import { db } from './index.ts';
import { users, userSettings } from './schema.ts';
import { eq } from 'drizzle-orm';

export interface UserInput {
  uid: string;
  email?: string;
  name?: string;
  avatar?: string;
  provider?: string;
}

export async function getOrCreateUser(input: UserInput) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid: input.uid,
        email: input.email || '',
        name: input.name || 'User',
        avatar: input.avatar || '',
        provider: input.provider || 'google',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: input.email || '',
          name: input.name || 'User',
          avatar: input.avatar || '',
          provider: input.provider || 'google',
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database getOrCreateUser failed:', error);
    throw new Error('Database user sync failed. Please try again later.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    return result[0] || null;
  } catch (error) {
    console.error('Database getUserByUid failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserSettings(userUid: string) {
  try {
    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userUid, userUid));
    return result[0] || null;
  } catch (error) {
    console.error('Database getUserSettings failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateUserSettings(userUid: string, settings: any) {
  try {
    // Ensure user exists first
    await db
      .insert(users)
      .values({
        uid: userUid,
        email: settings.email || '',
        name: settings.name || 'User',
      })
      .onConflictDoNothing();

    const result = await db
      .insert(userSettings)
      .values({
        userUid,
        defaultModel: settings.defaultModel || 'andromeda-soul-1',
        systemPrompt: settings.systemPrompt || '',
        theme: settings.theme || 'dark',
        enableSearchGrounding: settings.enableSearchGrounding ?? true,
        enableWebSearch: settings.enableWebSearch ?? true,
        enableCalculator: settings.enableCalculator ?? true,
        customApiBaseUrl: settings.customApiBaseUrl || '',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userUid,
        set: {
          defaultModel: settings.defaultModel,
          systemPrompt: settings.systemPrompt,
          theme: settings.theme,
          enableSearchGrounding: settings.enableSearchGrounding,
          enableWebSearch: settings.enableWebSearch,
          enableCalculator: settings.enableCalculator,
          customApiBaseUrl: settings.customApiBaseUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database updateUserSettings failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
