import { scoreWinner, type Score } from './tournament.ts';

export type LeagueMatchId = `L${string}`;
export type LeagueGroup = 'A' | 'B';
export type LeagueMatch = { id: LeagueMatchId; round: number; seedA?: number; seedB?: number; group?: LeagueGroup; placementRank?: 1 | 2 | 3 };
export type LeagueState = { format: 'two_groups'; teams: string[]; scores: Record<LeagueMatchId, Score>; rankOverrides?: Partial<Record<LeagueGroup, string[]>> };

export const LEAGUE_MATCHES: LeagueMatch[] = [
  { id: 'L01', round: 1, group: 'A', seedA: 0, seedB: 1 },
  { id: 'L02', round: 2, group: 'A', seedA: 0, seedB: 2 },
  { id: 'L03', round: 3, group: 'A', seedA: 1, seedB: 2 },
  { id: 'L04', round: 1, group: 'B', seedA: 3, seedB: 4 },
  { id: 'L05', round: 2, group: 'B', seedA: 3, seedB: 5 },
  { id: 'L06', round: 3, group: 'B', seedA: 4, seedB: 5 },
  { id: 'L07', round: 4, placementRank: 1 },
  { id: 'L08', round: 4, placementRank: 2 },
  { id: 'L09', round: 4, placementRank: 3 },
];
export const LEAGUE_MATCH_IDS = LEAGUE_MATCHES.map(({ id }) => id);

export function createEmptyLeague(): LeagueState {
  return { format: 'two_groups', teams: Array.from({ length: 6 }, () => ''), scores: Object.fromEntries(LEAGUE_MATCH_IDS.map((id) => [id, { a: '', b: '' }])) as LeagueState['scores'] };
}

export type LeagueStanding = {
  rank: number; team: string; played: number; wins: number; losses: number;
  matchesFor: number; matchesAgainst: number; matchDiff: number;
  gamesFor: number; gamesAgainst: number; gameDiff: number;
};

export function groupStandings(state: LeagueState, group: LeagueGroup): LeagueStanding[] {
  const start = group === 'A' ? 0 : 3;
  const rows = state.teams.slice(start, start + 3).map((team) => ({ rank: 0, team: team.trim(), played: 0, wins: 0, losses: 0, matchesFor: 0, matchesAgainst: 0, matchDiff: 0, gamesFor: 0, gamesAgainst: 0, gameDiff: 0 }));
  for (const match of LEAGUE_MATCHES.filter((entry) => entry.group === group)) {
    const teamA = state.teams[match.seedA!]?.trim();
    const teamB = state.teams[match.seedB!]?.trim();
    const score = state.scores[match.id];
    const winner = teamA && teamB && teamA !== teamB ? scoreWinner(score) : null;
    if (!winner) continue;
    const a = rows[match.seedA! - start];
    const b = rows[match.seedB! - start];
    a.played += 1; b.played += 1;
    if (winner === 'a') { a.wins += 1; b.losses += 1; } else { b.wins += 1; a.losses += 1; }
    a.matchesFor += Number(score.a); a.matchesAgainst += Number(score.b);
    b.matchesFor += Number(score.b); b.matchesAgainst += Number(score.a);
    a.matchDiff += Number(score.a) - Number(score.b);
    b.matchDiff += Number(score.b) - Number(score.a);
    for (const game of score.games ?? []) {
      a.gamesFor += Number(game.a); a.gamesAgainst += Number(game.b);
      b.gamesFor += Number(game.b); b.gamesAgainst += Number(game.a);
      a.gameDiff += Number(game.a) - Number(game.b);
      b.gameDiff += Number(game.b) - Number(game.a);
    }
  }
  const override = state.rankOverrides?.[group];
  const hasOverride = override?.length === 3 && new Set(override).size === 3 && rows.every((row) => override.includes(row.team));
  const ranked = rows.filter((row) => row.team).sort((a, b) => b.wins - a.wins || b.matchDiff - a.matchDiff || b.gameDiff - a.gameDiff || (hasOverride ? override.indexOf(a.team) - override.indexOf(b.team) : a.team.localeCompare(b.team, 'ja')));
  let rank = 0;
  return ranked.map((row, index) => {
    if (index === 0 || hasOverride || row.wins !== ranked[index - 1].wins || row.matchDiff !== ranked[index - 1].matchDiff || row.gameDiff !== ranked[index - 1].gameDiff) rank = index + 1;
    return { ...row, rank };
  });
}

export function leagueMatch(state: LeagueState, match: LeagueMatch) {
  const standingsA = match.placementRank ? groupStandings(state, 'A') : [];
  const standingsB = match.placementRank ? groupStandings(state, 'B') : [];
  const groupReady = (rows: LeagueStanding[]) => rows.length === 3 && rows.every((row) => row.played === 2) && new Set(rows.map((row) => row.rank)).size === 3;
  const teamA = match.placementRank ? groupReady(standingsA) ? standingsA[match.placementRank - 1].team : '' : state.teams[match.seedA!]?.trim() ?? '';
  const teamB = match.placementRank ? groupReady(standingsB) ? standingsB[match.placementRank - 1].team : '' : state.teams[match.seedB!]?.trim() ?? '';
  const score = state.scores[match.id];
  const outcome = teamA && teamB && teamA !== teamB ? scoreWinner(score) : null;
  return { teamA, teamB, score, winner: outcome === 'a' ? teamA : outcome === 'b' ? teamB : '', loser: outcome === 'a' ? teamB : outcome === 'b' ? teamA : '' };
}

export function reconcileLeagueScores(previous: LeagueState, next: LeagueState): LeagueState {
  const scores = structuredClone(next.scores);
  const rankOverrides = { ...next.rankOverrides };
  for (const group of ['A', 'B'] as const) {
    if (LEAGUE_MATCHES.some((match) => match.group === group && JSON.stringify(previous.scores[match.id]) !== JSON.stringify(next.scores[match.id])) || previous.teams.slice(group === 'A' ? 0 : 3, group === 'A' ? 3 : 6).some((team, index) => team !== next.teams[index + (group === 'A' ? 0 : 3)])) delete rankOverrides[group];
  }
  let working = { ...next, scores, rankOverrides };
  for (const match of LEAGUE_MATCHES) {
    const before = leagueMatch(previous, match);
    const after = leagueMatch(working, match);
    if (before.teamA !== after.teamA || before.teamB !== after.teamB) {
      scores[match.id] = { a: '', b: '' };
      working = { ...working, scores };
    }
  }
  return working;
}
