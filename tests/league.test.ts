import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialAppState, normalizeAppState } from '../lib/event.ts';
import { LEAGUE_MATCHES, createEmptyLeague, groupStandings, leagueMatch, reconcileLeagueScores } from '../lib/league.ts';
import { applyApprovedReport, parseResultReport } from '../lib/result-submission.ts';
import { scoreFromGames } from '../lib/tournament.ts';

const win = () => scoreFromGames([{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '2', b: '4' }]);

void test('女子3部はA/B各3チームのリーグ6試合と同順位対決3試合', () => {
  assert.equal(LEAGUE_MATCHES.length, 9);
  assert.equal(LEAGUE_MATCHES.filter((match) => match.group === 'A').length, 3);
  assert.equal(LEAGUE_MATCHES.filter((match) => match.group === 'B').length, 3);
  assert.deepEqual(LEAGUE_MATCHES.filter((match) => match.placementRank).map((match) => match.placementRank), [1, 2, 3]);
  for (let seed = 0; seed < 6; seed += 1) assert.equal(LEAGUE_MATCHES.filter((match) => match.seedA === seed || match.seedB === seed).length, 2);
});

void test('旧6チーム総当たりデータはチーム名を保持し、異なる対戦結果を引き継がない', () => {
  const state = createInitialAppState();
  state.tournaments.day2.league3.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  const old = structuredClone(state) as unknown as { tournaments: { day2: { league3: { format?: string; scores: Record<string, unknown> } } } };
  delete old.tournaments.day2.league3.format;
  old.tournaments.day2.league3.scores.L01 = win();
  const restored = normalizeAppState(old as never);
  assert.deepEqual(restored.tournaments.day2.league3.teams, ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(restored.tournaments.day2.league3.scores.L01, { a: '', b: '' });
});

void test('グループ順位が決まると1位・2位・3位同士を自動配置する', () => {
  const league = createEmptyLeague();
  league.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const match of LEAGUE_MATCHES.filter((entry) => entry.group)) league.scores[match.id] = win();
  assert.deepEqual(groupStandings(league, 'A').map((row) => row.team), ['A', 'B', 'C']);
  assert.deepEqual(groupStandings(league, 'B').map((row) => row.team), ['D', 'E', 'F']);
  assert.deepEqual([leagueMatch(league, LEAGUE_MATCHES[6]).teamA, leagueMatch(league, LEAGUE_MATCHES[6]).teamB], ['A', 'D']);
  assert.deepEqual([leagueMatch(league, LEAGUE_MATCHES[7]).teamA, leagueMatch(league, LEAGUE_MATCHES[7]).teamB], ['B', 'E']);
  assert.deepEqual([leagueMatch(league, LEAGUE_MATCHES[8]).teamA, leagueMatch(league, LEAGUE_MATCHES[8]).teamB], ['C', 'F']);
});

void test('旧女子3部リーグの報告は新トーナメントへ反映しない', () => {
  const state = createInitialAppState();
  const league = state.tournaments.day2.league3;
  league.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const match of LEAGUE_MATCHES.filter((entry) => entry.group)) league.scores[match.id] = win();
  league.scores.L07 = win();
  const report = parseResultReport({
    day: 'day2', matchId: 'D3-L01', teamA: 'A', teamB: 'B', submittedBy: 'B',
    games: [{ a: '1', b: '4' }, { a: '2', b: '4' }, { a: '4', b: '2' }],
  });
  assert.throws(() => applyApprovedReport(state, report), /旧リーグ戦/);
  assert.equal(state.tournaments.day2.league3.scores.L07.a, '2');
  assert.throws(() => parseResultReport({ day: 'day1', matchId: 'D3-L01', teamA: 'A', teamB: 'B', submittedBy: 'A', games: [win(), win(), win()] }));
});

void test('チーム変更時は影響したリーグ結果と順位決定戦をリセットする', () => {
  const before = createEmptyLeague();
  before.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const match of LEAGUE_MATCHES) before.scores[match.id] = win();
  const next = reconcileLeagueScores(before, { ...before, teams: ['X', 'B', 'C', 'D', 'E', 'F'] });
  assert.equal(next.scores.L01.a, '');
  assert.equal(next.scores.L02.a, '');
  assert.equal(next.scores.L03.a, '2');
  assert.equal(next.scores.L04.a, '2');
  assert.equal(next.scores.L07.a, '');
});

void test('完全同率は自動対戦を保留し、管理者の順位指定後に反映する', () => {
  const league = createEmptyLeague();
  league.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  league.scores.L01 = win();
  league.scores.L02 = scoreFromGames([{ a: '2', b: '4' }, { a: '1', b: '4' }, { a: '4', b: '2' }]);
  league.scores.L03 = win();
  for (const match of LEAGUE_MATCHES.filter((entry) => entry.group === 'B')) league.scores[match.id] = win();
  assert.deepEqual(groupStandings(league, 'A').map((row) => row.rank), [1, 1, 1]);
  assert.equal(leagueMatch(league, LEAGUE_MATCHES[6]).teamA, '');
  const ordered = reconcileLeagueScores(league, { ...league, rankOverrides: { A: ['B', 'C', 'A'] } });
  assert.deepEqual(groupStandings(ordered, 'A').map((row) => row.team), ['B', 'C', 'A']);
  assert.equal(leagueMatch(ordered, LEAGUE_MATCHES[6]).teamA, 'B');
});
