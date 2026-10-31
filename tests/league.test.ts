import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialAppState, normalizeAppState } from '../lib/event.ts';
import { LEAGUE_MATCHES, createEmptyLeague, leagueMatch, leagueStandings, reconcileLeagueScores } from '../lib/league.ts';
import { applyApprovedReport, getMatchContext, parseResultReport } from '../lib/result-submission.ts';
import { scoreFromGames } from '../lib/tournament.ts';

void test('女子3部は6チームで各組み合わせを1度ずつ、5節15試合行う', () => {
  const pairs = LEAGUE_MATCHES.map((match) => [match.seedA, match.seedB].sort().join('-'));
  assert.equal(LEAGUE_MATCHES.length, 15);
  assert.equal(new Set(pairs).size, 15);
  for (let seed = 0; seed < 6; seed += 1) assert.equal(LEAGUE_MATCHES.filter((match) => match.seedA === seed || match.seedB === seed).length, 5);
  for (let round = 1; round <= 5; round += 1) {
    const seeds = LEAGUE_MATCHES.filter((match) => match.round === round).flatMap((match) => [match.seedA, match.seedB]);
    assert.equal(new Set(seeds).size, 6);
  }
});

void test('女子3部だけをリーグにし、旧データの6チームを引き継ぐ', () => {
  const state = createInitialAppState();
  state.tournaments.day2.divisions[3].teams = ['A', 'B', 'C', 'D', 'E', 'F', '', ''];
  const legacy = structuredClone(state) as unknown as { tournaments: { day2: { league3?: unknown } } };
  delete legacy.tournaments.day2.league3;
  const restored = normalizeAppState(legacy as never);
  assert.deepEqual(restored.tournaments.day2.league3.teams, ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(restored.tournaments.day1.divisions[3].teams.length, 8);
});

void test('女子3部の参加者報告は承認後に順位へ反映し、修正も再計算する', () => {
  const state = createInitialAppState();
  state.tournaments.day2.league3.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  const current = getMatchContext(state.tournaments.day2, 'D3-L01');
  assert.deepEqual([current.teamA, current.teamB], ['A', 'F']);
  const report = parseResultReport({
    day: 'day2', matchId: 'D3-L01', teamA: 'A', teamB: 'F', submittedBy: 'A',
    games: [{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '1', b: '4' }],
  });
  assert.equal(leagueStandings(state.tournaments.day2.league3)[0].wins, 0);
  const approved = applyApprovedReport(state, report);
  assert.equal(leagueStandings(approved.tournaments.day2.league3)[0].team, 'A');
  assert.equal(leagueStandings(approved.tournaments.day2.league3)[0].wins, 1);
  assert.equal(state.tournaments.day2.league3.scores.L01.a, '');
  assert.equal(approved.tournaments.day1.divisions[3].scores.M01.a, '');
  const corrected = applyApprovedReport(approved, parseResultReport({
    ...report, games: [{ a: '1', b: '4' }, { a: '2', b: '4' }, { a: '4', b: '3' }],
  }));
  assert.equal(leagueStandings(corrected.tournaments.day2.league3)[0].team, 'F');
  assert.throws(() => parseResultReport({ ...report, day: 'day1' }));
});

void test('女子3部の組み合わせ変更は影響した試合だけリセットする', () => {
  const before = createEmptyLeague();
  before.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const match of LEAGUE_MATCHES) before.scores[match.id] = scoreFromGames([{ a: '4', b: '1' }, { a: '4', b: '2' }, { a: '1', b: '4' }]);
  const next = { ...before, teams: ['X', 'B', 'C', 'D', 'E', 'F'] };
  const reconciled = reconcileLeagueScores(before, next);
  for (const match of LEAGUE_MATCHES) assert.equal(leagueMatch(reconciled, match).score.a, match.seedA === 0 || match.seedB === 0 ? '' : '2');
});

void test('同勝数では対戦差とゲーム差を使い、完全同率は同じ順位にする', () => {
  const league = createEmptyLeague();
  league.teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  const empty = leagueStandings(league);
  assert.ok(empty.every((row) => row.rank === 1));
  league.scores.L01 = scoreFromGames([{ a: '4', b: '0' }, { a: '4', b: '0' }, { a: '4', b: '0' }]);
  league.scores.L02 = scoreFromGames([{ a: '4', b: '3' }, { a: '4', b: '3' }, { a: '2', b: '4' }]);
  const standings = leagueStandings(league);
  assert.equal(standings[0].team, 'A');
  assert.equal(standings[1].team, 'B');
  assert.equal(standings[0].wins, standings[1].wins);
  assert.ok(standings[0].matchDiff > standings[1].matchDiff);
});
