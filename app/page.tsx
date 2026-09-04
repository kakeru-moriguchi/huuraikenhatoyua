'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleDot, Medal, RotateCcw, Save, Settings2, Shield, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => unknown;
      }, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

type MatchSource = { type: 'seed'; seed: number } | { type: 'winner' | 'loser'; matchId: MatchId };
type MatchId = 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'M06' | 'M07' | 'M08' | 'M09' | 'M10' | 'M11' | 'M12';
type MatchDefinition = { id: MatchId; round: 1 | 2 | 3; title: string; route: string; sourceA: MatchSource; sourceB: MatchSource };
type Score = { a: string; b: string };
type TournamentState = { name: string; date: string; teams: string[]; scores: Record<MatchId, Score> };

const MATCHES: MatchDefinition[] = [
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
const MATCH_IDS = MATCHES.map((match) => match.id);
const EMPTY_SCORES = Object.fromEntries(MATCH_IDS.map((id) => [id, { a: '', b: '' }])) as Record<MatchId, Score>;
const INITIAL_STATE: TournamentState = { name: '3試合保証トーナメント', date: '', teams: Array.from({ length: 8 }, () => ''), scores: EMPTY_SCORES };

function scoreWinner(score: Score): 'a' | 'b' | null {
  if (score.a === '' || score.b === '') return null;
  const a = Number(score.a), b = Number(score.b);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a === b) return null;
  return a > b ? 'a' : 'b';
}

function resolveTournament(state: TournamentState) {
  const resolved = {} as Record<MatchId, { teamA: string; teamB: string; winner: string; loser: string }>;
  const resolveSource = (source: MatchSource) => source.type === 'seed' ? state.teams[source.seed - 1]?.trim() ?? '' : resolved[source.matchId]?.[source.type] ?? '';
  for (const match of MATCHES) {
    const teamA = resolveSource(match.sourceA), teamB = resolveSource(match.sourceB);
    const outcome = teamA && teamB ? scoreWinner(state.scores[match.id]) : null;
    resolved[match.id] = { teamA, teamB, winner: outcome === 'a' ? teamA : outcome === 'b' ? teamB : '', loser: outcome === 'a' ? teamB : outcome === 'b' ? teamA : '' };
  }
  return resolved;
}

function reconcileScores(previous: TournamentState, next: TournamentState): TournamentState {
  const before = resolveTournament(previous);
  const scores = structuredClone(next.scores);
  let working = { ...next, scores };
  for (const match of MATCHES) {
    const after = resolveTournament(working);
    if ((before[match.id].teamA !== after[match.id].teamA || before[match.id].teamB !== after[match.id].teamB) && (scores[match.id].a !== '' || scores[match.id].b !== '')) {
      scores[match.id] = { a: '', b: '' };
      working = { ...working, scores };
    }
  }
  return working;
}

function sourceLabel(source: MatchSource) {
  return source.type === 'seed' ? `第${source.seed}シード` : `${source.matchId} ${source.type === 'winner' ? '勝者' : '敗者'}`;
}

function MatchCard({ match, state, resolved, editable, onScore }: { match: MatchDefinition; state: TournamentState; resolved: ReturnType<typeof resolveTournament>; editable: boolean; onScore: (id: MatchId, side: 'a' | 'b', value: string) => void }) {
  const detail = resolved[match.id], score = state.scores[match.id], outcome = scoreWinner(score);
  const ready = Boolean(detail.teamA && detail.teamB), complete = Boolean(ready && outcome);
  const tied = ready && score.a !== '' && score.b !== '' && score.a === score.b;
  return <article className={`match-card ${complete ? 'match-card--complete' : ''}`}>
    <div className="match-card__head"><div><span className="match-id">{match.id}</span><h3>{match.title}</h3></div><span className={`status ${complete ? 'status--done' : ready ? 'status--ready' : ''}`}>{complete ? <Check size={13} /> : <CircleDot size={13} />}{complete ? '確定' : ready ? '入力待ち' : '対戦待ち'}</span></div>
    {(['a', 'b'] as const).map((side) => { const team = side === 'a' ? detail.teamA : detail.teamB; return <div className={`team-row ${outcome === side ? 'team-row--winner' : ''}`} key={side}>
      <div className="team-name"><span className="source-label">{sourceLabel(side === 'a' ? match.sourceA : match.sourceB)}</span><strong>{team || '未定'}</strong></div>
      {editable ? <Input aria-label={`${match.id} ${team || (side === 'a' ? 'チームA' : 'チームB')}の得点`} className="score-input" disabled={!ready} inputMode="numeric" min="0" type="number" value={score[side]} onChange={(event) => onScore(match.id, side, event.target.value.replace(/[^0-9]/g, ''))} /> : <span className="score-display">{score[side] === '' ? '—' : score[side]}</span>}
    </div> })}
    {tied ? <p className="score-error">同点では確定できません。勝敗がつく得点を入力してください。</p> : null}
    <p className="route-label"><ArrowRight size={13} /> {match.route}</p>
  </article>;
}

export default function Home() {
  const [state, setState] = useState<TournamentState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState('setup');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const saved = localStorage.getItem('three-match-tournament-v1'); if (saved) { try { const parsed = JSON.parse(saved) as TournamentState; setState({ ...INITIAL_STATE, ...parsed, scores: { ...EMPTY_SCORES, ...parsed.scores } }); } catch { localStorage.removeItem('three-match-tournament-v1'); } } setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem('three-match-tournament-v1', JSON.stringify(state)); }, [state, loaded]);
  useEffect(() => {
    if (!loaded || !document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const reportError = (error: unknown) => console.warn('WebMCP tool registration failed', error);
    const registration = document.modelContext.registerTool({
      name: 'configure_tournament',
      title: '大会と参加チームを設定',
      description: '大会名、開催日、8チームを一括設定し、画面と保存データを更新します。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          date: { type: 'string' },
          teams: { type: 'array', minItems: 8, maxItems: 8, items: { type: 'string', minLength: 1 } },
        },
        required: ['name', 'teams'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as { name?: unknown; date?: unknown; teams?: unknown };
        if (typeof value.name !== 'string' || !Array.isArray(value.teams) || value.teams.length !== 8 || value.teams.some((team) => typeof team !== 'string' || !team.trim())) throw new Error('大会名と8つのチーム名が必要です。');
        const teams = value.teams.map((team) => String(team).trim());
        if (new Set(teams).size !== 8) throw new Error('チーム名は重複できません。');
        setState((previous) => reconcileScores(previous, { ...previous, name: value.name!.trim(), date: typeof value.date === 'string' ? value.date : '', teams }));
        setActiveTab('bracket');
        return { configured: true, teamCount: 8 };
      },
    }, { signal: lifecycle.signal });
    Promise.resolve(registration).catch(reportError);
    return () => lifecycle.abort();
  }, [loaded]);
  const resolved = useMemo(() => resolveTournament(state), [state]);
  const teamCount = state.teams.filter((team) => team.trim()).length;
  const completedCount = MATCH_IDS.filter((id) => Boolean(resolved[id].winner)).length;
  const ranking = useMemo(() => ([['M09', 1, 2], ['M10', 3, 4], ['M11', 5, 6], ['M12', 7, 8]] as const).flatMap(([id, winnerRank, loserRank]) => [{ rank: winnerRank, team: resolved[id].winner }, { rank: loserRank, team: resolved[id].loser }]), [resolved]);
  const updateTeam = (index: number, value: string) => setState((previous) => { const teams = [...previous.teams]; teams[index] = value; return reconcileScores(previous, { ...previous, teams }); });
  const updateScore = (id: MatchId, side: 'a' | 'b', value: string) => setState((previous) => reconcileScores(previous, { ...previous, scores: { ...previous.scores, [id]: { ...previous.scores[id], [side]: value } } }));
  const resetTournament = () => { setState(INITIAL_STATE); setActiveTab('setup'); localStorage.removeItem('three-match-tournament-v1'); };

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><span className="brand-mark"><Trophy size={20} /></span><div><p className="eyebrow">TOURNAMENT DESK</p><h1>{state.name || '大会名未設定'}</h1></div></div><div className="topbar-actions"><span className="save-state"><Save size={14} /> 端末に自動保存</span><AlertDialog><AlertDialogTrigger render={<Button variant="outline" size="sm" />}><RotateCcw size={15} /> リセット</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>大会データをリセットしますか？</AlertDialogTitle><AlertDialogDescription>登録チームと全12試合の結果が消去されます。この操作は元に戻せません。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={resetTournament}>リセットする</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></header>
    <div className="page-wrap">
      <section className="overview" aria-label="大会進行状況"><div className="overview-copy"><span className="kicker">全チーム3試合保証</span><h2>12試合で、1位から8位まで。</h2><p>勝敗を入力するだけで、次の対戦と最終順位を自動更新します。</p></div><div className="metrics"><div><span>登録チーム</span><strong>{teamCount}<small>/ 8</small></strong></div><div><span>終了試合</span><strong>{completedCount}<small>/ 12</small></strong></div><div><span>大会進行</span><strong>{Math.round((completedCount / 12) * 100)}<small>%</small></strong></div></div></section>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="workspace"><TabsList className="step-nav" aria-label="大会管理メニュー"><TabsTrigger value="setup"><Settings2 size={16} /><span>大会設定</span></TabsTrigger><TabsTrigger value="teams"><Users size={16} /><span>チーム登録</span><em>{teamCount}/8</em></TabsTrigger><TabsTrigger value="bracket"><Shield size={16} /><span>トーナメント</span></TabsTrigger><TabsTrigger value="scores"><CircleDot size={16} /><span>結果入力</span><em>{completedCount}/12</em></TabsTrigger><TabsTrigger value="ranking"><Medal size={16} /><span>最終順位</span></TabsTrigger></TabsList>
        <TabsContent value="setup" className="panel"><div className="panel-heading"><div><span>STEP 01</span><h2>大会設定</h2><p>大会名と開催日を設定します。</p></div><CalendarDays size={30} /></div><div className="form-grid"><label><span>大会名</span><Input value={state.name} onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))} placeholder="大会名を入力" /></label><label><span>開催日</span><Input type="date" value={state.date} onChange={(e) => setState((p) => ({ ...p, date: e.target.value }))} /></label></div><div className="rule-strip"><div><strong>8</strong><span>参加チーム</span></div><ChevronRight /><div><strong>3</strong><span>各チームの試合数</span></div><ChevronRight /><div><strong>12</strong><span>合計試合数</span></div><ChevronRight /><div><strong>1–8</strong><span>確定する順位</span></div></div><div className="panel-actions"><Button onClick={() => setActiveTab('teams')}>チーム登録へ <ArrowRight size={16} /></Button></div></TabsContent>
        <TabsContent value="teams" className="panel"><div className="panel-heading"><div><span>STEP 02</span><h2>チーム登録</h2><p>シード順に8チームを登録します。1回戦は1位対8位の形式です。</p></div><Users size={30} /></div><div className="team-grid">{state.teams.map((team, index) => <label className="team-field" key={index}><span className="seed-number">{String(index + 1).padStart(2, '0')}</span><span className="sr-only">第{index + 1}シード</span><Input value={team} onChange={(e) => updateTeam(index, e.target.value)} placeholder={`チーム ${index + 1}`} /></label>)}</div>{teamCount < 8 ? <p className="hint">あと{8 - teamCount}チームを登録すると、全対戦が開始できます。</p> : <p className="success-note"><Check size={15} /> 8チームの登録が完了しました。</p>}<div className="panel-actions"><Button disabled={teamCount < 8} onClick={() => setActiveTab('bracket')}>組み合わせを見る <ArrowRight size={16} /></Button></div></TabsContent>
        <TabsContent value="bracket" className="panel panel--wide"><div className="panel-heading"><div><span>STEP 03</span><h2>トーナメント</h2><p>勝者側と敗者側の両方が、順位決定戦へ進みます。</p></div><Shield size={30} /></div><div className="bracket-grid">{[1, 2, 3].map((round) => <section className="round-column" key={round}><div className="round-title"><span>ROUND {round}</span><strong>{round === 1 ? '初戦' : round === 2 ? '進路決定' : '順位決定'}</strong></div><div className="round-matches">{MATCHES.filter((m) => m.round === round).map((match) => <MatchCard key={match.id} match={match} state={state} resolved={resolved} editable={false} onScore={updateScore} />)}</div></section>)}</div><div className="panel-actions"><Button disabled={teamCount < 8} onClick={() => setActiveTab('scores')}>試合結果を入力 <ArrowRight size={16} /></Button></div></TabsContent>
        <TabsContent value="scores" className="panel panel--wide"><div className="panel-heading"><div><span>STEP 04</span><h2>試合結果入力</h2><p>得点は入力と同時に反映されます。修正で出場チームが変わる後続試合は自動で未入力に戻ります。</p></div><CircleDot size={30} /></div><div className="score-rounds">{[1, 2, 3].map((round) => <section key={round}><div className="round-title"><span>ROUND {round}</span><strong>{round === 1 ? '1回戦' : round === 2 ? '2試合目' : '最終戦'}</strong></div><div className="score-grid">{MATCHES.filter((m) => m.round === round).map((match) => <MatchCard key={match.id} match={match} state={state} resolved={resolved} editable onScore={updateScore} />)}</div></section>)}</div><div className="panel-actions"><Button disabled={completedCount < 12} onClick={() => setActiveTab('ranking')}>最終順位を見る <ArrowRight size={16} /></Button></div></TabsContent>
        <TabsContent value="ranking" className="panel"><div className="panel-heading"><div><span>STEP 05</span><h2>最終順位</h2><p>{completedCount === 12 ? '全12試合が終了し、最終順位が確定しました。' : `順位確定まであと${12 - completedCount}試合です。`}</p></div><Trophy size={30} /></div><div className="ranking-list">{ranking.map(({ rank, team }) => <div className={`rank-row rank-row--${rank}`} key={rank}><span className="rank-number">{rank}</span><div><span>{rank <= 3 ? ['CHAMPION', 'RUNNER-UP', 'THIRD PLACE'][rank - 1] : `${rank}TH PLACE`}</span><strong>{team || '未確定'}</strong></div>{rank === 1 ? <Trophy size={24} /> : <Medal size={22} />}</div>)}</div></TabsContent>
      </Tabs>
    </div>
  </main>;
}

