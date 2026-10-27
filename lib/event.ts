import { MATCH_IDS, createEmptyBracket, emptyScores, type BracketState, type MatchId, type Score } from './tournament.ts';

export type DivisionId = 1 | 2 | 3;
export type BlockId = 'A' | 'B';
export type TournamentDayId = 'day1' | 'day2';
export type ScheduleMatchId =
  | `D1-${MatchId}`
  | `D2-A-${MatchId}`
  | `D2-B-${MatchId}`
  | 'D2-GF'
  | `D3-${MatchId}`;
export type ScheduleEntry = { startTime: string; court: string };
export type TournamentSchedule = Record<ScheduleMatchId, ScheduleEntry>;
export type CourtSettings = {
  practice: string;
  division1: string;
  division2: string;
  division3: string;
};

export const SCHEDULE_MATCH_IDS: ScheduleMatchId[] = [
  ...MATCH_IDS.map((id) => `D1-${id}` as const),
  ...MATCH_IDS.map((id) => `D2-A-${id}` as const),
  ...MATCH_IDS.map((id) => `D2-B-${id}` as const),
  'D2-GF',
  ...MATCH_IDS.map((id) => `D3-${id}` as const),
];

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
  courts: CourtSettings;
  practiceCourts: Record<string, string>;
  schedule: TournamentSchedule;
};

export type AppState = {
  version: 6;
  tournaments: Record<TournamentDayId, TournamentState>;
};

export function createEmptySchedule(): TournamentSchedule {
  return Object.fromEntries(
    SCHEDULE_MATCH_IDS.map((id) => [id, { startTime: '', court: '' }]),
  ) as TournamentSchedule;
}

export function normalizeSchedule(value?: Partial<Record<ScheduleMatchId, Partial<ScheduleEntry>>>): TournamentSchedule {
  return Object.fromEntries(SCHEDULE_MATCH_IDS.map((id) => [id, {
    startTime: typeof value?.[id]?.startTime === 'string' ? value[id].startTime ?? '' : '',
    court: typeof value?.[id]?.court === 'string' ? value[id].court ?? '' : '',
  }])) as TournamentSchedule;
}

export function applyDivisionCourt(
  schedule: TournamentSchedule,
  division: DivisionId,
  court: string,
): TournamentSchedule {
  const belongsToDivision = (id: ScheduleMatchId) => division === 1
    ? id.startsWith('D1-')
    : division === 2
      ? id.startsWith('D2-')
      : id.startsWith('D3-');

  return Object.fromEntries(SCHEDULE_MATCH_IDS.map((id) => [
    id,
    belongsToDivision(id) ? { ...schedule[id], court } : schedule[id],
  ])) as TournamentSchedule;
}

function normalizePracticeCourts(value?: Record<string, unknown>): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeCourts(value?: Partial<CourtSettings>): CourtSettings {
  return {
    practice: typeof value?.practice === 'string' ? value.practice : '',
    division1: typeof value?.division1 === 'string' ? value.division1 : '',
    division2: typeof value?.division2 === 'string' ? value.division2 : '',
    division3: typeof value?.division3 === 'string' ? value.division3 : '',
  };
}

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
    courts: normalizeCourts(),
    practiceCourts: {},
    schedule: createEmptySchedule(),
  };
}

export function createInitialAppState(): AppState {
  return {
    version: 6,
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
    courts: normalizeCourts(value?.courts),
    practiceCourts: normalizePracticeCourts(value?.practiceCourts),
    schedule: normalizeSchedule(value?.schedule),
  };
}

export function normalizeAppState(value?: Partial<AppState>): AppState {
  const fallback = createInitialAppState();
  return {
    version: 6,
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

