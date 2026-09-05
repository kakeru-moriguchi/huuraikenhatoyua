'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Crown,
  Medal,
  RotateCcw,
  Save,
  Settings2,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  MATCHES,
  MATCH_IDS,
  getRanking,
  reconcileGrandFinal,
  reconcileScores,
  resolveGrandFinal,
  resolveTournament,
  scoreWinner,
  type BracketState,
  type MatchDefinition,
  type MatchId,
  type MatchSource,
  type Score,
} from '@/lib/tournament';
import {
  createInitialAppState,
  migratePreviousState,
  normalizeAppState,
  type AppState,
  type BlockId,
  type DivisionId,
  type DivisionTwoState,
  type PreviousAppState,
  type TournamentDayId,
  type TournamentState,
} from '@/lib/event';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: Record<string, unknown>;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const STORAGE_KEY = 'three-match-tournament-v3';
const PREVIOUS_STORAGE_KEY = 'three-match-tournament-v2';
const LEGACY_STORAGE_KEY = 'three-match-tournament-v1';
const GRAND_FINAL = {
  id: 'D2-GF',
  division: 2,
  stage: 'grand_final',
} as const;

function blockChampions(division: DivisionTwoState): [string, string] {
  return [
    resolveTournament(division.A).M09.winner,
    resolveTournament(division.B).M09.winner,
  ];
}

function sourceLabel(source: MatchSource) {
  return source.type === 'seed'
    ? `第${source.seed}シード`
    : `${source.matchId} ${source.type === 'winner' ? '勝者' : '敗者'}`;
}

function MatchCard({
  match,
  state,
  resolved,
  editable,
  displayPrefix,
  onScore,
}: {
  match: MatchDefinition;
  state: BracketState;
  resolved: ReturnType<typeof resolveTournament>;
  editable: boolean;
  displayPrefix?: string;
  onScore: (id: MatchId, side: 'a' | 'b', value: string) => void;
}) {
  const detail = resolved[match.id];
  const score = state.scores[match.id];
  const outcome = scoreWinner(score);
  const ready = Boolean(detail.teamA && detail.teamB);
  const complete = Boolean(ready && outcome);
  const tied = ready && score.a !== '' && score.b !== '' && score.a === score.b;
  const displayId = displayPrefix ? `${displayPrefix}-${match.id}` : match.id;

  return (
    <article className={`match-card ${complete ? 'match-card--complete' : ''}`}>
      <div className="match-card__head">
        <div><span className="match-id">{displayId}</span><h3>{match.title}</h3></div>
        <span className={`status ${complete ? 'status--done' : ready ? 'status--ready' : ''}`}>
          {complete ? <Check size={13} /> : <CircleDot size={13} />}
          {complete ? '確定' : ready ? '入力待ち' : '対戦待ち'}
        </span>
      </div>
      {(['a', 'b'] as const).map((side) => {
        const team = side === 'a' ? detail.teamA : detail.teamB;
        return (
          <div className={`team-row ${outcome === side ? 'team-row--winner' : ''}`} key={side}>
            <div className="team-name">
              <span className="source-label">{sourceLabel(side === 'a' ? match.sourceA : match.sourceB)}</span>
              <strong>{team || '未定'}</strong>
            </div>
            {editable ? (
              <Input
                aria-label={`${displayId} ${team || (side === 'a' ? 'チームA' : 'チームB')}の得点`}
                className="score-input"
                disabled={!ready}
                inputMode="numeric"
                min="0"
                type="number"
                value={score[side]}
                onChange={(event) => onScore(match.id, side, event.target.value.replace(/[^0-9]/g, ''))}
              />
            ) : <span className="score-display">{score[side] === '' ? '—' : score[side]}</span>}
          </div>
        );
      })}
      {tied ? <p className="score-error">同点では確定できません。勝敗がつく得点を入力してください。</p> : null}
      <p className="route-label"><ArrowRight size={13} /> {match.route}</p>
    </article>
  );
}

function BracketBoard({
  bracket,
  editable,
  displayPrefix,
  onScore,
}: {
  bracket: BracketState;
  editable: boolean;
  displayPrefix?: string;
  onScore: (id: MatchId, side: 'a' | 'b', value: string) => void;
}) {
  const resolved = useMemo(() => resolveTournament(bracket), [bracket]);
  if (editable) {
    return (
      <div className="score-rounds">
        {[1, 2, 3].map((round) => (
          <section key={round}>
            <div className="round-title">
              <span>ROUND {round}</span>
              <strong>{round === 1 ? '1回戦' : round === 2 ? '2試合目' : '最終戦'}</strong>
            </div>
            <div className="score-grid">
              {MATCHES.filter((match) => match.round === round).map((match) => (
                <MatchCard key={match.id} match={match} state={bracket} resolved={resolved} editable displayPrefix={displayPrefix} onScore={onScore} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="bracket-grid">
      {[1, 2, 3].map((round) => (
        <section className="round-column" key={round}>
          <div className="round-title">
            <span>ROUND {round}</span>
            <strong>{round === 1 ? '初戦' : round === 2 ? '進路決定' : '順位決定'}</strong>
          </div>
          <div className="round-matches">
            {MATCHES.filter((match) => match.round === round).map((match) => (
              <MatchCard key={match.id} match={match} state={bracket} resolved={resolved} editable={false} displayPrefix={displayPrefix} onScore={onScore} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RankingList({ bracket, compact = false }: { bracket: BracketState; compact?: boolean }) {
  const ranking = getRanking(resolveTournament(bracket));
  return (
    <div className={`ranking-list ${compact ? 'ranking-list--compact' : ''}`}>
      {ranking.map(({ rank, team }) => (
        <div className={`rank-row rank-row--${rank}`} key={rank}>
          <span className="rank-number">{rank}</span>
          <div>
            <span>{rank <= 3 ? ['CHAMPION', 'RUNNER-UP', 'THIRD PLACE'][rank - 1] : `${rank}TH PLACE`}</span>
            <strong>{team || '未確定'}</strong>
          </div>
          {rank === 1 ? <Trophy size={24} /> : <Medal size={22} />}
        </div>
      ))}
    </div>
  );
}

function formatTournamentDate(date: string) {
  if (!date) return '日付未設定';
  const [year, month, day] = date.split('-');
  return `${year}.${month}.${day}`;
}

function TournamentSelector({
  value,
  tournaments,
  onChange,
}: {
  value: TournamentDayId;
  tournaments: AppState['tournaments'];
  onChange: (value: TournamentDayId) => void;
}) {
  const items: Array<{ id: TournamentDayId; day: string }> = [
    { id: 'day1', day: '1日目' },
    { id: 'day2', day: '2日目' },
  ];
  return (
    <nav className="tournament-nav" aria-label="開催日・カテゴリー切替">
      {items.map(({ id, day }) => {
        const tournament = tournaments[id];
        return (
          <button type="button" aria-pressed={value === id} key={id} onClick={() => onChange(id)}>
            <span className="tournament-nav__day">{day}</span>
            <strong>{tournament.category || 'カテゴリー未設定'}</strong>
            <span className="tournament-nav__date"><CalendarDays size={14} />{formatTournamentDate(tournament.date)}</span>
            {value === id ? <Check size={17} /> : null}
          </button>
        );
      })}
    </nav>
  );
}

function DivisionSelector({
  division,
  tournament,
  onChange,
}: {
  division: DivisionId;
  tournament: TournamentState;
  onChange: (division: DivisionId) => void;
}) {
  const counts = {
    1: tournament.divisions[1].teams.filter(Boolean).length,
    2: tournament.divisions[2].A.teams.filter(Boolean).length + tournament.divisions[2].B.teams.filter(Boolean).length,
    3: tournament.divisions[3].teams.filter(Boolean).length,
  };
  return (
    <nav className="division-nav" aria-label="部門切替">
      {([1, 2, 3] as const).map((id) => (
        <button type="button" aria-pressed={division === id} key={id} onClick={() => onChange(id)}>
          <span>{id}部</span>
          <strong>{id === 2 ? 'A / Bブロック' : '8チーム'}</strong>
          <em>{counts[id]} / {id === 2 ? 16 : 8}</em>
        </button>
      ))}
    </nav>
  );
}

function BlockSelector({
  value,
  includeGrandFinal,
  onChange,
}: {
  value: BlockId | 'grand';
  includeGrandFinal: boolean;
  onChange: (value: BlockId | 'grand') => void;
}) {
  const items: Array<{ value: BlockId | 'grand'; label: string }> = [
    { value: 'A', label: 'Aブロック' },
    { value: 'B', label: 'Bブロック' },
    ...(includeGrandFinal ? [{ value: 'grand' as const, label: '総合決勝' }] : []),
  ];
  return (
    <fieldset className="block-nav" aria-label="2部ステージ切替">
      {items.map((item) => (
        <button type="button" aria-pressed={value === item.value} key={item.value} onClick={() => onChange(item.value)}>
          {item.value === 'grand' ? <Crown size={15} /> : <Shield size={15} />}
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}

function GrandFinalCard({
  teams,
  score,
  editable,
  onScore,
}: {
  teams: [string, string];
  score: Score;
  editable: boolean;
  onScore: (side: 'a' | 'b', value: string) => void;
}) {
  const resolved = resolveGrandFinal(teams, score);
  const outcome = scoreWinner(score);
  const ready = Boolean(teams[0] && teams[1]);
  const complete = Boolean(resolved.winner);
  const tied = ready && score.a !== '' && score.b !== '' && score.a === score.b;
  return (
    <div className="grand-final-wrap">
      <div className="grand-final-label"><Crown size={20} /><span>DIVISION 2</span><strong>総合決勝</strong></div>
      <article className={`grand-final-card ${complete ? 'match-card--complete' : ''}`}>
        <div className="match-card__head">
          <div><span className="match-id">{GRAND_FINAL.id}</span><h3>2部 総合決勝</h3></div>
          <span className={`status ${complete ? 'status--done' : ready ? 'status--ready' : ''}`}>
            {complete ? <Check size={13} /> : <CircleDot size={13} />}
            {complete ? '確定' : ready ? '入力待ち' : '両ブロック待ち'}
          </span>
        </div>
        {(['a', 'b'] as const).map((side, index) => (
          <div className={`team-row grand-team-row ${outcome === side ? 'team-row--winner' : ''}`} key={side}>
            <div className="team-name">
              <span className="source-label">{index === 0 ? 'Aブロック 1位' : 'Bブロック 1位'}</span>
              <strong>{teams[index] || '未確定'}</strong>
            </div>
            {editable ? (
              <Input
                aria-label={`2部総合決勝 ${teams[index] || (index === 0 ? 'Aブロック代表' : 'Bブロック代表')}の得点`}
                className="score-input"
                disabled={!ready}
                inputMode="numeric"
                min="0"
                type="number"
                value={score[side]}
                onChange={(event) => onScore(side, event.target.value.replace(/[^0-9]/g, ''))}
              />
            ) : <span className="score-display">{score[side] === '' ? '—' : score[side]}</span>}
          </div>
        ))}
        {tied ? <p className="score-error">同点では確定できません。勝敗がつく得点を入力してください。</p> : null}
        <p className="route-label"><ArrowRight size={13} /> 勝者 → 2部総合優勝 / 敗者 → 2部総合準優勝</p>
      </article>
      {!ready ? <p className="grand-final-note">A・B両ブロックの優勝が確定すると、得点を入力できます。</p> : null}
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(createInitialAppState);
  const [activeDay, setActiveDay] = useState<TournamentDayId>('day1');
  const [division, setDivision] = useState<DivisionId>(1);
  const [activeTab, setActiveTab] = useState('setup');
  const [d2View, setD2View] = useState<BlockId | 'grand'>('A');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const previous = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    let hydratedState: AppState | null = null;
    try {
      if (saved) {
        hydratedState = normalizeAppState(JSON.parse(saved) as Partial<AppState>);
      } else if (previous) {
        hydratedState = migratePreviousState(JSON.parse(previous) as PreviousAppState, 2);
      } else if (legacy) {
        hydratedState = migratePreviousState(JSON.parse(legacy) as PreviousAppState, 1);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    queueMicrotask(() => {
      if (hydratedState) setState(hydratedState);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  const updateTournamentMeta = (change: Partial<Pick<TournamentState, 'name' | 'category' | 'date'>>) => {
    setState((previous) => ({
      ...previous,
      tournaments: {
        ...previous.tournaments,
        [activeDay]: { ...previous.tournaments[activeDay], ...change },
      },
    }));
  };

  const updateMainBracket = (day: TournamentDayId, id: 1 | 3, change: (bracket: BracketState) => BracketState) => {
    setState((previous) => {
      const tournament = previous.tournaments[day];
      const current = tournament.divisions[id];
      const next = reconcileScores(current, change(current));
      return {
        ...previous,
        tournaments: {
          ...previous.tournaments,
          [day]: { ...tournament, divisions: { ...tournament.divisions, [id]: next } },
        },
      };
    });
  };

  const updateDivisionTwoBlock = (day: TournamentDayId, block: BlockId, change: (bracket: BracketState) => BracketState) => {
    setState((previous) => {
      const tournament = previous.tournaments[day];
      const current = tournament.divisions[2];
      const beforeChampions = blockChampions(current);
      const nextBlock = reconcileScores(current[block], change(current[block]));
      const nextDivision = { ...current, [block]: nextBlock };
      const afterChampions = blockChampions(nextDivision);
      nextDivision.grandFinal = reconcileGrandFinal(beforeChampions, afterChampions, current.grandFinal);
      return {
        ...previous,
        tournaments: {
          ...previous.tournaments,
          [day]: { ...tournament, divisions: { ...tournament.divisions, 2: nextDivision } },
        },
      };
    });
  };

  const activeTournament = state.tournaments[activeDay];
  const selectedBlock: BlockId = d2View === 'B' ? 'B' : 'A';
  const activeBracket = division === 2 ? activeTournament.divisions[2][selectedBlock] : activeTournament.divisions[division];
  const activeResolved = useMemo(() => resolveTournament(activeBracket), [activeBracket]);
  const activeTeamCount = activeBracket.teams.filter((team) => team.trim()).length;
  const d2TeamCount = activeTournament.divisions[2].A.teams.filter(Boolean).length + activeTournament.divisions[2].B.teams.filter(Boolean).length;
  const grandFinalTeams = blockChampions(activeTournament.divisions[2]);
  const grandFinalResolved = resolveGrandFinal(grandFinalTeams, activeTournament.divisions[2].grandFinal);
  const currentTeamCount = division === 2 ? d2TeamCount : activeTeamCount;
  const currentTeamTarget = division === 2 ? 16 : 8;
  const blockCompleted = MATCH_IDS.filter((id) => Boolean(activeResolved[id].winner)).length;
  const divisionTwoCompleted =
    MATCH_IDS.filter((id) => Boolean(resolveTournament(activeTournament.divisions[2].A)[id].winner)).length +
    MATCH_IDS.filter((id) => Boolean(resolveTournament(activeTournament.divisions[2].B)[id].winner)).length +
    (grandFinalResolved.winner ? 1 : 0);
  const currentCompleted = division === 2 ? divisionTwoCompleted : blockCompleted;
  const currentMatchTarget = division === 2 ? 25 : 12;

  const updateTeam = (index: number, value: string) => {
    const change = (bracket: BracketState) => {
      const teams = [...bracket.teams];
      teams[index] = value;
      return { ...bracket, teams };
    };
    if (division === 2) updateDivisionTwoBlock(activeDay, selectedBlock, change);
    else updateMainBracket(activeDay, division, change);
  };

  const updateScore = (id: MatchId, side: 'a' | 'b', value: string) => {
    const change = (bracket: BracketState) => ({
      ...bracket,
      scores: { ...bracket.scores, [id]: { ...bracket.scores[id], [side]: value } },
    });
    if (division === 2) updateDivisionTwoBlock(activeDay, selectedBlock, change);
    else updateMainBracket(activeDay, division, change);
  };

  const updateGrandFinalScore = (side: 'a' | 'b', value: string) => {
    if (!grandFinalTeams[0] || !grandFinalTeams[1]) return;
    setState((previous) => {
      const tournament = previous.tournaments[activeDay];
      return {
        ...previous,
        tournaments: {
          ...previous.tournaments,
          [activeDay]: {
            ...tournament,
            divisions: {
              ...tournament.divisions,
              2: {
                ...tournament.divisions[2],
                grandFinal: { ...tournament.divisions[2].grandFinal, [side]: value },
              },
            },
          },
        },
      };
    });
  };

  const resetTournament = () => {
    setState(createInitialAppState());
    setActiveDay('day1');
    setDivision(1);
    setD2View('A');
    setActiveTab('setup');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PREVIOUS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  };

  useEffect(() => {
    if (!loaded || !document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = document.modelContext.registerTool({
      name: 'configure_division_block',
      title: '部門の参加チームを設定',
      description: '1部・3部、または2部A/Bブロックの8チームを一括設定します。',
      inputSchema: {
        type: 'object',
        properties: {
          division: { type: 'integer', enum: [1, 2, 3] },
          tournament: { type: 'string', enum: ['day1', 'day2'] },
          block: { type: 'string', enum: ['A', 'B'] },
          teams: { type: 'array', minItems: 8, maxItems: 8, items: { type: 'string', minLength: 1 } },
        },
        required: ['tournament', 'division', 'teams'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as { tournament?: unknown; division?: unknown; block?: unknown; teams?: unknown };
        if ((value.tournament !== 'day1' && value.tournament !== 'day2') || ![1, 2, 3].includes(Number(value.division)) || !Array.isArray(value.teams) || value.teams.length !== 8 || value.teams.some((team) => typeof team !== 'string' || !team.trim())) {
          throw new Error('大会、部門、8つのチーム名が必要です。');
        }
        const day = value.tournament;
        const id = Number(value.division) as DivisionId;
        const teams = value.teams.map((team) => String(team).trim());
        if (new Set(teams).size !== 8) throw new Error('同じブロック内でチーム名は重複できません。');
        if (id === 2) {
          if (value.block !== 'A' && value.block !== 'B') throw new Error('2部にはAまたはBブロックの指定が必要です。');
          updateDivisionTwoBlock(day, value.block, (bracket) => ({ ...bracket, teams }));
          setD2View(value.block);
        } else {
          updateMainBracket(day, id, (bracket) => ({ ...bracket, teams }));
        }
        setActiveDay(day);
        setDivision(id);
        setActiveTab('bracket');
        return { configured: true, tournament: day, division: id, block: id === 2 ? value.block : null, teamCount: 8 };
      },
    }, { signal: lifecycle.signal });
    Promise.resolve(registration).catch((error) => console.warn('WebMCP tool registration failed', error));
    return () => lifecycle.abort();
  }, [loaded]);

  const isGrandFinalView = division === 2 && d2View === 'grand';
  const divisionLabel = `${division}部`;
  const displayPrefix = division === 2 ? selectedBlock : undefined;
  const blockReady = activeTeamCount === 8;
  const blockFinished = blockCompleted === 12;
  const divisionFinished = division === 2 ? divisionTwoCompleted === 25 : blockFinished;
  const activeDayLabel = activeDay === 'day1' ? '1日目' : '2日目';
  const tournamentContext = `${activeDayLabel}・${activeTournament.category || 'カテゴリー未設定'}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Trophy size={20} /></span>
          <div><p className="eyebrow">{tournamentContext}</p><h1>{activeTournament.name || '大会名未設定'}</h1></div>
        </div>
        <div className="topbar-actions">
          <span className="save-state"><Save size={14} /> 端末に自動保存</span>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" size="sm" />}><RotateCcw size={15} /> リセット</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>2日分の大会データをリセットしますか？</AlertDialogTitle>
                <AlertDialogDescription>男子・女子両大会の登録チームと全試合結果が消去されます。この操作は元に戻せません。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={resetTournament}>リセットする</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="page-wrap">
        <TournamentSelector
          value={activeDay}
          tournaments={state.tournaments}
          onChange={(day) => {
            setActiveDay(day);
            setD2View('A');
          }}
        />

        <section className="overview" aria-label="大会進行状況">
          <div className="overview-copy">
            <span className="kicker">{tournamentContext}・{divisionLabel}・全チーム3試合保証</span>
            <h2>{division === 2 ? '2ブロックから、総合王者へ。' : '12試合で、1位から8位まで。'}</h2>
            <p>{division === 2 ? 'A・B各ブロックを独立進行し、両優勝チームで総合決勝を行います。' : '勝敗を入力するだけで、次の対戦と最終順位を自動更新します。'}</p>
          </div>
          <div className="metrics">
            <div><span>登録チーム</span><strong>{currentTeamCount}<small>/ {currentTeamTarget}</small></strong></div>
            <div><span>終了試合</span><strong>{currentCompleted}<small>/ {currentMatchTarget}</small></strong></div>
            <div><span>大会進行</span><strong>{Math.round((currentCompleted / currentMatchTarget) * 100)}<small>%</small></strong></div>
          </div>
        </section>

        <DivisionSelector division={division} tournament={activeTournament} onChange={(id) => { setDivision(id); if (id !== 2) setD2View('A'); }} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="workspace">
          <TabsList className="step-nav" aria-label="大会管理メニュー">
            <TabsTrigger value="setup"><Settings2 size={16} /><span>大会設定</span></TabsTrigger>
            <TabsTrigger value="teams"><Users size={16} /><span>チーム登録</span><em>{currentTeamCount}/{currentTeamTarget}</em></TabsTrigger>
            <TabsTrigger value="bracket"><Shield size={16} /><span>トーナメント</span></TabsTrigger>
            <TabsTrigger value="scores"><CircleDot size={16} /><span>結果入力</span><em>{currentCompleted}/{currentMatchTarget}</em></TabsTrigger>
            <TabsTrigger value="ranking"><Medal size={16} /><span>最終順位</span></TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="panel">
            <div className="panel-heading"><div><span>STEP 01 · {tournamentContext}</span><h2>大会設定</h2><p>選択中の大会だけに適用される名称、カテゴリー、開催日を設定します。</p></div><CalendarDays size={30} /></div>
            <div className="form-grid">
              <label htmlFor="tournament-name"><span>大会名</span><Input id="tournament-name" value={activeTournament.name} onChange={(event) => updateTournamentMeta({ name: event.target.value })} placeholder="大会名を入力" /></label>
              <label htmlFor="tournament-category"><span>カテゴリー</span><Input id="tournament-category" value={activeTournament.category} onChange={(event) => updateTournamentMeta({ category: event.target.value })} placeholder="例：男子" /></label>
              <label htmlFor="tournament-date"><span>開催日</span><Input id="tournament-date" type="date" value={activeTournament.date} onChange={(event) => updateTournamentMeta({ date: event.target.value })} /></label>
            </div>
            <div className="rule-strip">
              <div><strong>32</strong><span>参加チーム</span></div><ChevronRight />
              <div><strong>3</strong><span>部門</span></div><ChevronRight />
              <div><strong>49</strong><span>合計試合数</span></div><ChevronRight />
              <div><strong>8·16·8</strong><span>部門別チーム数</span></div>
            </div>
            <div className="panel-actions"><Button onClick={() => setActiveTab('teams')}>チーム登録へ <ArrowRight size={16} /></Button></div>
          </TabsContent>

          <TabsContent value="teams" className="panel">
            <div className="panel-heading">
              <div><span>STEP 02 · {divisionLabel}</span><h2>チーム登録</h2><p>{division === 2 ? 'A・Bブロックへ8チームずつ登録します。' : 'シード順に8チームを登録します。1回戦は1位対8位の形式です。'}</p></div>
              <Users size={30} />
            </div>
            {division === 2 ? <BlockSelector value={selectedBlock} includeGrandFinal={false} onChange={(value) => setD2View(value === 'B' ? 'B' : 'A')} /> : null}
            <div className="team-grid">
              {activeBracket.teams.map((team, index) => (
                <label className="team-field" key={index}>
                  <span className="seed-number">{division === 2 ? selectedBlock : ''}{String(index + 1).padStart(2, '0')}</span>
                  <span className="sr-only">{divisionLabel}{division === 2 ? `${selectedBlock}ブロック` : ''}第{index + 1}シード</span>
                  <Input value={team} onChange={(event) => updateTeam(index, event.target.value)} placeholder={`${division === 2 ? selectedBlock + ' ' : ''}チーム ${index + 1}`} />
                </label>
              ))}
            </div>
            {activeTeamCount < 8
              ? <p className="hint">{division === 2 ? `${selectedBlock}ブロック：` : ''}あと{8 - activeTeamCount}チームを登録してください。</p>
              : <p className="success-note"><Check size={15} /> {division === 2 ? `${selectedBlock}ブロックの` : ''}8チーム登録が完了しました。</p>}
            <div className="panel-actions"><Button disabled={!blockReady} onClick={() => setActiveTab('bracket')}>組み合わせを見る <ArrowRight size={16} /></Button></div>
          </TabsContent>

          <TabsContent value="bracket" className="panel panel--wide">
            <div className="panel-heading">
              <div><span>STEP 03 · {divisionLabel}</span><h2>{division === 2 ? 'ブロック別トーナメント' : 'トーナメント'}</h2><p>{division === 2 ? 'A・Bの試合は独立し、各ブロック優勝が総合決勝へ進みます。' : '勝者側と敗者側の両方が順位決定戦へ進みます。'}</p></div>
              <Shield size={30} />
            </div>
            {division === 2 ? <BlockSelector value={d2View} includeGrandFinal onChange={setD2View} /> : null}
            {isGrandFinalView
              ? <GrandFinalCard teams={grandFinalTeams} score={activeTournament.divisions[2].grandFinal} editable={false} onScore={updateGrandFinalScore} />
              : <BracketBoard bracket={activeBracket} editable={false} displayPrefix={displayPrefix} onScore={updateScore} />}
            <div className="panel-actions">
              <Button disabled={isGrandFinalView ? !grandFinalTeams[0] || !grandFinalTeams[1] : !blockReady} onClick={() => setActiveTab('scores')}>試合結果を入力 <ArrowRight size={16} /></Button>
            </div>
          </TabsContent>

          <TabsContent value="scores" className="panel panel--wide">
            <div className="panel-heading">
              <div><span>STEP 04 · {divisionLabel}</span><h2>試合結果入力</h2><p>修正で出場チームが変わる後続試合は、自動的に未入力へ戻ります。</p></div>
              <CircleDot size={30} />
            </div>
            {division === 2 ? <BlockSelector value={d2View} includeGrandFinal onChange={setD2View} /> : null}
            {isGrandFinalView
              ? <GrandFinalCard teams={grandFinalTeams} score={activeTournament.divisions[2].grandFinal} editable onScore={updateGrandFinalScore} />
              : <BracketBoard bracket={activeBracket} editable displayPrefix={displayPrefix} onScore={updateScore} />}
            <div className="panel-actions">
              <Button disabled={!divisionFinished} onClick={() => setActiveTab('ranking')}>最終順位を見る <ArrowRight size={16} /></Button>
            </div>
          </TabsContent>

          <TabsContent value="ranking" className="panel">
            <div className="panel-heading">
              <div><span>STEP 05 · {divisionLabel}</span><h2>{division === 2 && d2View === 'grand' ? '2部 総合結果' : '最終順位'}</h2><p>{division === 2 ? 'A・B各ブロックの順位を保持し、総合決勝は優勝・準優勝のみ決定します。' : blockFinished ? '全12試合が終了し、最終順位が確定しました。' : `順位確定まであと${12 - blockCompleted}試合です。`}</p></div>
              <Trophy size={30} />
            </div>
            {division === 2 ? <BlockSelector value={d2View} includeGrandFinal onChange={setD2View} /> : null}
            {isGrandFinalView ? (
              <div className="overall-result">
                <GrandFinalCard teams={grandFinalTeams} score={activeTournament.divisions[2].grandFinal} editable={false} onScore={updateGrandFinalScore} />
                <div className="overall-podium">
                  <div className="overall-podium__winner"><Crown size={28} /><span>2部 総合優勝</span><strong>{grandFinalResolved.winner || '未確定'}</strong></div>
                  <div><Medal size={24} /><span>2部 総合準優勝</span><strong>{grandFinalResolved.loser || '未確定'}</strong></div>
                </div>
              </div>
            ) : <RankingList bracket={activeBracket} />}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

