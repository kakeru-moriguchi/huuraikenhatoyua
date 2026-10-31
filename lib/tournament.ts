export type MatchId =
  | 'M01' | 'M02' | 'M03' | 'M04'
  | 'M05' | 'M06' | 'M07' | 'M08'
  | 'M09' | 'M10' | 'M11' | 'M12';

export type GameScore = { a: string; b: string };
export type Score = GameScore & { games?: [GameScore, GameScore, GameScore] };

export function createEmptyGames(): [GameScore, GameScore, GameScore] {
  return [{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }];
}
export type MatchSource =
  | { type: 'seed'; seed: number }
  | { type: 'winner' | 'loser'; matchId: MatchId };
export type MatchDefinition = {
  id: MatchId;
  round: 1 | 2 | 3;
  title: string;
  route: string;
  sourceA: MatchSource;
  sourceB: MatchSource;
};
export type BracketState = {
  teams: string[];
  scores: Record<MatchId, Score>;
};
export type ResolvedMatch = {
  teamA: string;
  teamB: string;
  winner: string;
  loser: string;
};

export const MATCHES: MatchDefinition[] = [
  { id: 'M01', round: 1, title: '1回戦 A', route: '勝者 → M05 / 敗者 → M07', sourceA: { type: 'seed', seed: 1 }, sourceB: { type: 'seed', seed: 8 } },
  { id: 'M02', round: 1, title: '1回戦 B', route: '勝者 → M05 / 敗者 → M07', sourceA: { type: 'seed', seed: 4 }, sourceB: { type: 'seed', seed: 5 } },
  { id: 'M03', round: 1, title: '1回戦 C', route: '勝者 → M06 / 敗者 → M08', sourceA: { type: 'seed', seed: 2 }, sourceB: { type: 'seed', seed: 7 } },
  { id: 'M04', round: 1, title: '1回戦 D', route: '勝者 → M06 / 敗者 → M08', sourceA: { type: 'seed', seed: 3 }, sourceB: { type: 'seed', seed: 6 } },
  { id: 'M05', round: 2, title: '勝者側 A', route: '勝者 → 決勝 / 敗者 → 3位決定戦', sourceA: { type: 'winner', matchId: 'M01' }, sourceB: { type: 'winner', matchId: 'M02' } },
  { id: 'M06', round: 2, title: '勝者側 B', route: '勝者 → 決勝 / 敗者 → 3位決定戦', sourceA: { type: 'winner', matchId: 'M03' }, sourceB: { type: 'winner', matchId: 'M04' } },
  { id: 'M07', round: 2, title: '敗者側 A', route: '勝者 → 5・6位決定戦 / 敗者 → 7・8位決定戦', sourceA: { type: 'loser', matchId: 'M01' }, sourceB: { type: 'loser', matchId: 'M02' } },
  { id: 'M08', round: 2, title: '敗者側 B', route: '勝者 → 5・6位決定戦 / 敗者 → 7・8位決定戦', sourceA: { type: 'loser', matchId: 'M03' }, sourceB: { type: 'loser', matchId: 'M04' } },
  { id: 'M09', round: 3, title: '決勝', route: '1位・2位を決定', sourceA: { type: 'winner', matchId: 'M05' }, sourceB: { type: 'winner', matchId: 'M06' } },
  { id: 'M10', round: 3, title: '3位決定戦', route: '3位・4位を決定', sourceA: { type: 'loser', matchId: 'M05' }, sourceB: { type: 'loser', matchId: 'M06' } },
  { id: 'M11', round: 3, title: '5・6位決定戦', route: '5位・6位を決定', sourceA: { type: 'winner', matchId: 'M07' }, sourceB: { type: 'winner', matchId: 'M08' } },
  { id: 'M12', round: 3, title: '7・8位決定戦', route: '7位・8位を決定', sourceA: { type: 'loser', matchId: 'M07' }, sourceB: { type: 'loser', matchId: 'M08' } },
];

export const MATCH_IDS = MATCHES.map((match) => match.id);

export function emptyScores(): Record<MatchId, Score> {
  return Object.fromEntries(MATCH_IDS.map((id) => [id, { a: '', b: '' }])) as Record<MatchId, Score>;
}

export function createEmptyBracket(): BracketState {
  return { teams: Array.from({ length: 8 }, () => ''), scores: emptyScores() };
}

export function shuffleTeams(teams: string[], random: () => number = Math.random): string[] {
  const shuffled = [...teams];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function gameNumber(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 99 ? number : null;
}

export function gameWinner(game: GameScore): 'a' | 'b' | null {
  const a = gameNumber(game.a);
  const b = gameNumber(game.b);
  if (a === null || b === null || a === b) return null;
  return a > b ? 'a' : 'b';
}

export function tallyGames(games: readonly GameScore[]) {
  const winners = games.map(gameWinner);
  const played = winners.filter(Boolean).length;
  return {
    a: played ? String(winners.filter((winner) => winner === 'a').length) : '',
    b: played ? String(winners.filter((winner) => winner === 'b').length) : '',
    complete: games.length === 3 && played === 3,
  };
}

export function scoreFromGames(games: [GameScore, GameScore, GameScore]): Score {
  const tally = tallyGames(games);
  return { a: tally.a, b: tally.b, games: games.map((game) => ({ ...game })) as [GameScore, GameScore, GameScore] };
}

export function normalizeScore(value?: Partial<Score>): Score {
  if (Array.isArray(value?.games) && value.games.length === 3) {
    const games = value.games.map((game) => ({
      a: typeof game?.a === 'string' ? game.a : '',
      b: typeof game?.b === 'string' ? game.b : '',
    })) as [GameScore, GameScore, GameScore];
    return scoreFromGames(games);
  }
  return {
    a: typeof value?.a === 'string' ? value.a : '',
    b: typeof value?.b === 'string' ? value.b : '',
  };
}

export function scoreHasInput(score: Score): boolean {
  return score.a !== '' || score.b !== '' || Boolean(score.games?.some((game) => game.a !== '' || game.b !== ''));
}

export function scoreWinner(score: Score): 'a' | 'b' | null {
  if (score.games) {
    const tally = tallyGames(score.games);
    if (!tally.complete) return null;
    return Number(tally.a) > Number(tally.b) ? 'a' : 'b';
  }
  const a = gameNumber(score.a);
  const b = gameNumber(score.b);
  if (a === null || b === null || a === b) return null;
  return a > b ? 'a' : 'b';
}

export function resolveTournament(state: BracketState) {
  const resolved = {} as Record<MatchId, ResolvedMatch>;
  const resolveSource = (source: MatchSource) =>
    source.type === 'seed'
      ? state.teams[source.seed - 1]?.trim() ?? ''
      : resolved[source.matchId]?.[source.type] ?? '';

  for (const match of MATCHES) {
    const teamA = resolveSource(match.sourceA);
    const teamB = resolveSource(match.sourceB);
    const outcome = teamA && teamB ? scoreWinner(state.scores[match.id]) : null;
    resolved[match.id] = {
      teamA,
      teamB,
      winner: outcome === 'a' ? teamA : outcome === 'b' ? teamB : '',
      loser: outcome === 'a' ? teamB : outcome === 'b' ? teamA : '',
    };
  }
  return resolved;
}

export function reconcileScores(previous: BracketState, next: BracketState): BracketState {
  const before = resolveTournament(previous);
  const scores = structuredClone(next.scores);
  let working = { ...next, scores };

  for (const match of MATCHES) {
    const after = resolveTournament(working);
    const participantsChanged =
      before[match.id].teamA !== after[match.id].teamA ||
      before[match.id].teamB !== after[match.id].teamB;
    if (participantsChanged && scoreHasInput(scores[match.id])) {
      scores[match.id] = { a: '', b: '' };
      working = { ...working, scores };
    }
  }
  return working;
}

export function getRanking(resolved: ReturnType<typeof resolveTournament>) {
  const finalPairs: Array<[MatchId, number, number]> = [
    ['M09', 1, 2],
    ['M10', 3, 4],
    ['M11', 5, 6],
    ['M12', 7, 8],
  ];
  return finalPairs.flatMap(([id, winnerRank, loserRank]) => [
    { rank: winnerRank, team: resolved[id].winner },
    { rank: loserRank, team: resolved[id].loser },
  ]);
}

export function reconcileGrandFinal(
  previousTeams: [string, string],
  nextTeams: [string, string],
  score: Score,
): Score {
  return previousTeams[0] === nextTeams[0] && previousTeams[1] === nextTeams[1]
    ? score
    : { a: '', b: '' };
}

export function resolveGrandFinal(teams: [string, string], score: Score) {
  const outcome = teams[0] && teams[1] ? scoreWinner(score) : null;
  return {
    teamA: teams[0],
    teamB: teams[1],
    winner: outcome === 'a' ? teams[0] : outcome === 'b' ? teams[1] : '',
    loser: outcome === 'a' ? teams[1] : outcome === 'b' ? teams[0] : '',
  };
}
