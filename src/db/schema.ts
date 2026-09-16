import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID / ID
  email: text('email'),
  name: text('name'),
  avatar: text('avatar'),
  provider: text('provider').default('google'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Conversations Table
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  model: text('model').default('andromeda-soul-1'),
  pinned: boolean('pinned').default(false),
  tags: text('tags'), // JSON stringified array of tags
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Messages Table
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  model: text('model'),
  tokens: integer('tokens'),
  reasoningTimeMs: integer('reasoning_time_ms'),
  thinking: text('thinking'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// 4. Learned Knowledge Table
export const learnedKnowledge = pgTable('learned_knowledge', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'), // JSON stringified array
  category: text('category').default('General'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 5. Projects Table (App Factory / Neural models)
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description'),
  code: text('code'),
  type: text('type').default('app'), // 'app' | 'pytorch' | 'discord' | 'tool'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 6. User Settings Table
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  defaultModel: text('default_model').default('andromeda-soul-1'),
  systemPrompt: text('system_prompt'),
  theme: text('theme').default('dark'),
  enableSearchGrounding: boolean('enable_search_grounding').default(true),
  enableWebSearch: boolean('enable_web_search').default(true),
  enableCalculator: boolean('enable_calculator').default(true),
  customApiBaseUrl: text('custom_api_base_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Relations ---
export const usersRelations = relations(users, ({ many, one }) => ({
  conversations: many(conversations),
  knowledge: many(learnedKnowledge),
  projects: many(projects),
  settings: one(userSettings, {
    fields: [users.uid],
    references: [userSettings.userUid],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userUid],
    references: [users.uid],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const learnedKnowledgeRelations = relations(learnedKnowledge, ({ one }) => ({
  user: one(users, {
    fields: [learnedKnowledge.userUid],
    references: [users.uid],
  }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, {
    fields: [projects.userUid],
    references: [users.uid],
  }),
}));
