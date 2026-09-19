import { env } from 'cloudflare:workers';
import { createInitialAppState, normalizeAppState, type AppState } from '@/lib/event';

const STATE_ID = 'primary';

type StoredStateRow = {
  data: string;
  revision: number;
  updated_at: string;
};

function database(): D1Database {
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) throw new Error('D1 database binding DB is unavailable.');
  return binding;
}

export type TournamentSnapshot = {
  state: AppState;
  revision: number;
  updatedAt: string | null;
};

export async function getTournamentSnapshot(): Promise<TournamentSnapshot> {
  const row = await database()
    .prepare('SELECT data, revision, updated_at FROM tournament_state WHERE id = ?')
    .bind(STATE_ID)
    .first<StoredStateRow>();

  if (!row) return { state: createInitialAppState(), revision: 0, updatedAt: null };

  return {
    state: normalizeAppState(JSON.parse(row.data) as Partial<AppState>),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export async function saveTournamentState(value: unknown, updatedBy: string): Promise<TournamentSnapshot> {
  if (!value || typeof value !== 'object') throw new Error('大会データの形式が正しくありません。');
  const state = normalizeAppState(value as Partial<AppState>);
  const data = JSON.stringify(state);

  await database()
    .prepare(`
      INSERT INTO tournament_state (id, data, revision, updated_at, updated_by)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        revision = tournament_state.revision + 1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `)
    .bind(STATE_ID, data, updatedBy)
    .run();

  return getTournamentSnapshot();
}
