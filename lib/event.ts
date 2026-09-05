import { createEmptyBracket, emptyScores, type BracketState, type Score } from './tournament.ts';

export type DivisionId = 1 | 2 | 3;
export type BlockId = 'A' | 'B';
export type TournamentDayId = 'day1' | 'day2';

export type DivisionTwoState = {
  A: BracketState;
  B: BracketState;
  grandFinal: Score;
};

export type TournamentState = {
  name: string;
  category: string;
  date: string;
  divisions: {
    1: BracketState;
    2: DivisionTwoState;
    3: BracketState;
  };
};

export type AppState = {
  version: 3;
  tournaments: Record<TournamentDayId, TournamentState>;
};

type PartialDivisionTwo = {
  A?: Partial<BracketState>;
  B?: Partial<BracketState>;
  grandFinal?: Partial<Score>;
};

export type PreviousAppState = {
  name?: string;
  date?: string;
  teams?: string[];
  scores?: BracketState['scores'];
  divisions?: {
    1?: Partial<BracketState>;
    2?: PartialDivisionTwo;
    3?: Partial<BracketState>;
  };
};

export function normalizeBracket(value?: Partial<BracketState>): BracketState {
  const teams = Array.from({ length: 8 }, (_, index) => value?.teams?.[index] ?? '');
  return { teams, scores: { ...emptyScores(), ...value?.scores } };
}

export function createTournament(category: string, name: string): TournamentState {
  return {
    name,
    category,
    date: '',
    divisions: {
      1: createEmptyBracket(),
      2: { A: createEmptyBracket(), B: createEmptyBracket(), grandFinal: { a: '', b: '' } },
      3: createEmptyBracket(),
    },
  };
}

export function createInitialAppState(): AppState {
  return {
    version: 3,
    tournaments: {
      day1: createTournament('男子', '男子・3部制トーナメント'),
      day2: createTournament('女子', '女子・3部制トーナメント'),
    },
  };
}

export function normalizeTournament(
  value: Partial<TournamentState> | undefined,
  fallback: TournamentState,
): TournamentState {
  const divisionTwo = value?.divisions?.[2];
  return {
    name: typeof value?.name === 'string' ? value.name : fallback.name,
    category: typeof value?.category === 'string' ? value.category : fallback.category,
    date: typeof value?.date === 'string' ? value.date : '',
    divisions: {
      1: normalizeBracket(value?.divisions?.[1]),
      2: {
        A: normalizeBracket(divisionTwo?.A),
        B: normalizeBracket(divisionTwo?.B),
        grandFinal: {
          a: divisionTwo?.grandFinal?.a ?? '',
          b: divisionTwo?.grandFinal?.b ?? '',
        },
      },
      3: normalizeBracket(value?.divisions?.[3]),
    },
  };
}

export function normalizeAppState(value?: Partial<AppState>): AppState {
  const fallback = createInitialAppState();
  return {
    version: 3,
    tournaments: {
      day1: normalizeTournament(value?.tournaments?.day1, fallback.tournaments.day1),
      day2: normalizeTournament(value?.tournaments?.day2, fallback.tournaments.day2),
    },
  };
}

export function migratePreviousState(value: PreviousAppState, version: 1 | 2): AppState {
  const migrated = createInitialAppState();
  const dayOne = migrated.tournaments.day1;
  dayOne.name = value.name || dayOne.name;
  dayOne.date = value.date || '';

  if (version === 2 && value.divisions) {
    dayOne.divisions = {
      1: normalizeBracket(value.divisions[1]),
      2: {
        A: normalizeBracket(value.divisions[2]?.A),
        B: normalizeBracket(value.divisions[2]?.B),
        grandFinal: {
          a: value.divisions[2]?.grandFinal?.a ?? '',
          b: value.divisions[2]?.grandFinal?.b ?? '',
        },
      },
      3: normalizeBracket(value.divisions[3]),
    };
  } else {
    dayOne.divisions[1] = normalizeBracket({ teams: value.teams, scores: value.scores });
  }

  return migrated;
}

