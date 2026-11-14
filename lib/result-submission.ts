import { SCHEDULE_MATCH_IDS, type AppState, type ScheduleMatchId, type TournamentDayId, type TournamentState } from './event.ts';
import { MATCH_IDS, gameWinner, reconcileGrandFinal, reconcileScores, resolveTournament, scoreFromGames, type GameScore, type MatchId, type Score } from './tournament.ts';
import { LEAGUE_MATCHES, leagueMatch } from './league.ts';

export type ResultReport = {
  day: TournamentDayId;
  matchId: ScheduleMatchId;
  teamA: string;
  teamB: string;
  submittedBy: string;
  games: [GameScore, GameScore, GameScore];
};

export type PendingResult = ResultReport & { id: number; submittedAt: string };

export class ResultReportError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ResultReportError';
    this.status = status;
  }
}

export function parseResultReport(value: unknown): ResultReport {
  if (!value || typeof value !== 'object') throw new ResultReportError('結果の形式が正しくありません。');
  const input = value as Record<string, unknown>;
  if (input.day !== 'day1' && input.day !== 'day2') throw new ResultReportError('開催日を選択してください。');
  if (typeof input.matchId !== 'string' || !SCHEDULE_MATCH_IDS.includes(input.matchId as ScheduleMatchId)) throw new ResultReportError('試合を選択してください。');
  if (input.day === 'day1' && input.matchId.startsWith('D3-L')) throw new ResultReportError('開催日と試合を確認してください。');
  if (typeof input.teamA !== 'string' || typeof input.teamB !== 'string' || !input.teamA.trim() || !input.teamB.trim()) throw new ResultReportError('対戦チームを確認してください。');
  if (input.teamA.trim() === input.teamB.trim()) throw new ResultReportError('対戦チームの名前が重複しています。');
  if (typeof input.submittedBy !== 'string' || ![input.teamA, input.teamB].includes(input.submittedBy)) throw new ResultReportError('報告するチームを選択してください。');
  if (!Array.isArray(input.games) || input.games.length !== 3) throw new ResultReportError('3対戦分のゲーム数を入力してください。');
  const games = input.games.map((value) => {
    if (!value || typeof value !== 'object') throw new ResultReportError('ゲーム数を確認してください。');
    const game = value as Record<string, unknown>;
    if (typeof game.a !== 'string' || typeof game.b !== 'string' || !/^\d{1,2}$/.test(game.a) || !/^\d{1,2}$/.test(game.b)) throw new ResultReportError('ゲーム数は0～99の整数で入力してください。');
    const result = { a: game.a, b: game.b };
    if (!gameWinner(result)) throw new ResultReportError('各対戦のゲーム数は同点にできません。');
    return result;
  }) as [GameScore, GameScore, GameScore];
  return {
    day: input.day,
    matchId: input.matchId as ScheduleMatchId,
    teamA: input.teamA.trim().slice(0, 80),
    teamB: input.teamB.trim().slice(0, 80),
    submittedBy: input.submittedBy,
    games,
  };
}

export function getMatchContext(tournament: TournamentState, id: ScheduleMatchId): { teamA: string; teamB: string; score: Score } {
  if (id.startsWith('D3-L')) {
    const match = LEAGUE_MATCHES.find((entry) => `D3-${entry.id}` === id);
    if (!match) throw new ResultReportError('試合が見つかりません。');
    const { teamA, teamB, score } = leagueMatch(tournament.league3, match);
    return { teamA, teamB, score };
  }
  if (id === 'D2-GF' || id === 'D2-3P') {
    const side = id === 'D2-GF' ? 'winner' : 'loser';
    const teamA = resolveTournament(tournament.divisions[2].A).M09[side];
    const teamB = resolveTournament(tournament.divisions[2].B).M09[side];
    const score = id === 'D2-GF'
      ? tournament.divisions[2].grandFinal
      : tournament.divisions[2].thirdPlacePlayoff;
    return { teamA, teamB, score };
  }
  const matchId = id.slice(-3) as MatchId;
  if (!MATCH_IDS.includes(matchId)) throw new ResultReportError('試合が見つかりません。');
  const bracket = id.startsWith('D1-') ? tournament.divisions[1]
    : id.startsWith('D3-') ? tournament.divisions[3]
      : id.startsWith('D2-A-') ? tournament.divisions[2].A
        : id.startsWith('D2-B-') ? tournament.divisions[2].B : null;
  if (!bracket) throw new ResultReportError('試合が見つかりません。');
  const match = resolveTournament(bracket)[matchId];
  return { teamA: match.teamA, teamB: match.teamB, score: bracket.scores[matchId] };
}

export function applyApprovedReport(state: AppState, report: ResultReport): AppState {
  if (report.matchId.startsWith('D3-L')) throw new ResultReportError('旧リーグ戦の報告です。現在のトーナメントには反映できません。', 409);
  const tournament = state.tournaments[report.day];
  const current = getMatchContext(tournament, report.matchId);
  if (!current.teamA || !current.teamB || current.teamA !== report.teamA || current.teamB !== report.teamB) {
    throw new ResultReportError('出場チームが変更されています。この報告は確定できません。', 409);
  }
  const next = structuredClone(state);
  const target = next.tournaments[report.day];
  const score = scoreFromGames(report.games);
  if (report.matchId === 'D2-GF') {
    target.divisions[2].grandFinal = score;
    return next;
  }
  if (report.matchId === 'D2-3P') {
    target.divisions[2].thirdPlacePlayoff = score;
    return next;
  }
  const matchId = report.matchId.slice(-3) as MatchId;
  if (report.matchId.startsWith('D1-') || report.matchId.startsWith('D3-')) {
    const division = report.matchId.startsWith('D1-') ? 1 : 3;
    const bracket = target.divisions[division];
    target.divisions[division] = reconcileScores(bracket, {
      ...bracket,
      scores: { ...bracket.scores, [matchId]: score },
    });
    return next;
  }
  const block = report.matchId.startsWith('D2-A-') ? 'A' : 'B';
  const division = target.divisions[2];
  const resolvedBefore = [resolveTournament(division.A), resolveTournament(division.B)] as const;
  const beforeChampions: [string, string] = [resolvedBefore[0].M09.winner, resolvedBefore[1].M09.winner];
  const beforeRunnersUp: [string, string] = [resolvedBefore[0].M09.loser, resolvedBefore[1].M09.loser];
  const bracket = division[block];
  division[block] = reconcileScores(bracket, { ...bracket, scores: { ...bracket.scores, [matchId]: score } });
  const resolvedAfter = [resolveTournament(division.A), resolveTournament(division.B)] as const;
  const afterChampions: [string, string] = [resolvedAfter[0].M09.winner, resolvedAfter[1].M09.winner];
  const afterRunnersUp: [string, string] = [resolvedAfter[0].M09.loser, resolvedAfter[1].M09.loser];
  division.grandFinal = reconcileGrandFinal(beforeChampions, afterChampions, division.grandFinal);
  division.thirdPlacePlayoff = reconcileGrandFinal(beforeRunnersUp, afterRunnersUp, division.thirdPlacePlayoff);
  return next;
}
