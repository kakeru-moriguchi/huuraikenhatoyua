import { env } from 'cloudflare:workers';
import { getTournamentSnapshot, saveTournamentStateAtRevision, type TournamentSnapshot } from './tournament.ts';
import { applyApprovedReport, getMatchContext, parseResultReport, ResultReportError, type PendingResult, type ResultReport } from '../lib/result-submission.ts';

function database(): D1Database {
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) throw new Error('D1 database binding DB is unavailable.');
  return binding;
}

async function ensureTable(): Promise<void> {
  await database().prepare(`
    CREATE TABLE IF NOT EXISTS result_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      match_id TEXT NOT NULL,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      games TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(day, match_id, submitted_by)
    )
  `).run();
}

type SubmissionRow = {
  id: number;
  day: string;
  match_id: string;
  team_a: string;
  team_b: string;
  submitted_by: string;
  games: string;
  submitted_at: string;
};

function rowToPending(row: SubmissionRow): PendingResult {
  const report = parseResultReport({
    day: row.day,
    matchId: row.match_id,
    teamA: row.team_a,
    teamB: row.team_b,
    submittedBy: row.submitted_by,
    games: JSON.parse(row.games) as unknown,
  });
  return { ...report, id: row.id, submittedAt: row.submitted_at };
}

export async function submitResultReport(value: unknown): Promise<void> {
  const report = parseResultReport(value);
  const snapshot = await getTournamentSnapshot();
  const current = getMatchContext(snapshot.state.tournaments[report.day], report.matchId);
  if (!current.teamA || !current.teamB || current.teamA !== report.teamA || current.teamB !== report.teamB) {
    throw new ResultReportError('対戦チームが変更されています。画面を再読み込みしてください。', 409);
  }
  await ensureTable();
  await database().prepare(`
    INSERT INTO result_submissions (day, match_id, team_a, team_b, submitted_by, games)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, match_id, submitted_by) DO UPDATE SET
      team_a = excluded.team_a,
      team_b = excluded.team_b,
      games = excluded.games,
      submitted_at = CURRENT_TIMESTAMP
  `).bind(report.day, report.matchId, report.teamA, report.teamB, report.submittedBy, JSON.stringify(report.games)).run();
}

export async function listPendingResults(): Promise<PendingResult[]> {
  await ensureTable();
  const rows = await database().prepare('SELECT * FROM result_submissions ORDER BY submitted_at DESC, id DESC LIMIT 200').all<SubmissionRow>();
  return rows.results.map(rowToPending);
}

export async function reviewResultReport(id: number, decision: 'approve' | 'reject', updatedBy: string): Promise<TournamentSnapshot | null> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ResultReportError('報告が見つかりません。');
  await ensureTable();
  const row = await database().prepare('SELECT * FROM result_submissions WHERE id = ?').bind(id).first<SubmissionRow>();
  if (!row) throw new ResultReportError('報告はすでに処理されています。', 404);
  if (decision === 'reject') {
    await database().prepare('DELETE FROM result_submissions WHERE id = ?').bind(id).run();
    return null;
  }
  const report: ResultReport = rowToPending(row);
  const snapshot = await getTournamentSnapshot();
  const next = applyApprovedReport(snapshot.state, report);
  let saved: TournamentSnapshot;
  try {
    saved = await saveTournamentStateAtRevision(next, snapshot.revision, updatedBy);
  } catch {
    throw new ResultReportError('大会データが更新されました。再読み込みしてから確定してください。', 409);
  }
  await database().prepare('DELETE FROM result_submissions WHERE day = ? AND match_id = ?').bind(report.day, report.matchId).run();
  return saved;
}