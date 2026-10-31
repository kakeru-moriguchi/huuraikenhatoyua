import { scoreWinner, type Score } from './tournament.ts';

export type LeagueMatchId = `L${string}`;
export type LeagueMatch = { id: LeagueMatchId; round: number; seedA: number; seedB: number };
export type LeagueState = { teams: string[]; scores: Record<LeagueMatchId, Score> };

const rounds: Array<Array<[number, number]>> = [
  [[0, 5], [1, 4], [2, 3]],
  [[0, 4], [5, 3], [1, 2]],
  [[0, 3], [4, 2], [5, 1]],
  [[0, 2], [3, 1], [4, 5]],
  [[0, 1], [2, 5], [3, 4]],
];

export const LEAGUE_MATCHES: LeagueMatch[] = rounds.flatMap((pairs, round) => pairs.map(([seedA, seedB], index) => ({
  id: `L${String(round * 3 + index + 1).padStart(2, '0')}`,
  round: round + 1,
  seedA,
  seedB,
})));
export const LEAGUE_MATCH_IDS = LEAGUE_MATCHES.map(({ id }) => id);

export function createEmptyLeague(): LeagueState {
  return {
    teams: Array.from({ length: 6 }, () => ''),
    scores: Object.fromEntries(LEAGUE_MATCH_IDS.map((id) => [id, { a: '', b: '' }])) as LeagueState['scores'],
  };
}

export function leagueMatch(state: LeagueState, match: LeagueMatch) {
  const teamA = state.teams[match.seedA]?.trim() ?? '';
  const teamB = state.teams[match.seedB]?.trim() ?? '';
  const score = state.scores[match.id];
  const outcome = teamA && teamB && teamA !== teamB ? scoreWinner(score) : null;
  return { teamA, teamB, score, winner: outcome === 'a' ? teamA : outcome === 'b' ? teamB : '' };
}

export function reconcileLeagueScores(previous: LeagueState, next: LeagueState): LeagueState {
  const scores = structuredClone(next.scores);
  for (const match of LEAGUE_MATCHES) {
    const before = leagueMatch(previous, match);
    const after = leagueMatch(next, match);
    if (before.teamA !== after.teamA || before.teamB !== after.teamB) scores[match.id] = { a: '', b: '' };
  }
  return { ...next, scores };
}

export type LeagueStanding = {
  rank: number;
  team: string;
  played: number;
  wins: number;
  losses: number;
  matchDiff: number;
  gameDiff: number;
};

export function leagueStandings(state: LeagueState): LeagueStanding[] {
  const rows = state.teams.map((team) => ({ rank: 0, team: team.trim(), played: 0, wins: 0, losses: 0, matchDiff: 0, gameDiff: 0 }));
  for (const match of LEAGUE_MATCHES) {
    const { teamA, teamB, score, winner } = leagueMatch(state, match);
    if (!teamA || !teamB || !winner) continue;
    const a = rows[match.seedA];
    const b = rows[match.seedB];
    a.played += 1; b.played += 1;
    if (winner === teamA) { a.wins += 1; b.losses += 1; }
    else { b.wins += 1; a.losses += 1; }
    const matchDiff = Number(score.a) - Number(score.b);
    a.matchDiff += matchDiff; b.matchDiff -= matchDiff;
    for (const game of score.games ?? []) {
      const gameDiff = Number(game.a) - Number(game.b);
      a.gameDiff += gameDiff; b.gameDiff -= gameDiff;
    }
  }
  const ranked = rows.filter((row) => row.team).sort((a, b) =>
    b.wins - a.wins || b.matchDiff - a.matchDiff || b.gameDiff - a.gameDiff || a.team.localeCompare(b.team, 'ja'));
  let rank = 0;
  return ranked.map((row, index) => {
    if (index === 0 || row.wins !== ranked[index - 1].wins || row.matchDiff !== ranked[index - 1].matchDiff || row.gameDiff !== ranked[index - 1].gameDiff) rank = index + 1;
    return { ...row, rank };
  });
}
