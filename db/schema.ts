import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tournamentState = sqliteTable('tournament_state', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text('updated_by').notNull().default(''),
});

export const adminCredentials = sqliteTable('admin_credentials', {
  id: text('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  iterations: integer('iterations').notNull().default(210000),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text('updated_by').notNull(),
});

export const adminSessions = sqliteTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userEmail: text('user_email').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
