import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialAppState, normalizeAppState } from '../lib/event.ts';
import { applyApprovedReport, getMatchContext, parseResultReport } from '../lib/result-submission.ts';
import { createEmptyGames, scoreFromGames, scoreWinner } from '../lib/tournament.ts';

void test('3対戦すべてのゲーム数が揃ってから団体戦の勝敗を確定する', () => {
  const games = createEmptyGames();
  games[0] = { a: '4', b: '2' };
  games[1] = { a: '1', b: '4' };
  const partial = scoreFromGames(games);
  assert.deepEqual([partial.a, partial.b], ['1', '1']);
  assert.equal(scoreWinner(partial), null);
  games[2] = { a: '4', b: '3' };
  const complete = scoreFromGames(games);
  assert.deepEqual([complete.a, complete.b], ['2', '1']);
  assert.equal(scoreWinner(complete), 'a');
});

void test('同点や未入力を含む参加者報告を拒否する', () => {
  const base = { day: 'day1', matchId: 'D1-M01', teamA: 'A', teamB: 'B', submittedBy: 'A', games: [{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '4', b: '3' }] };
  assert.deepEqual(parseResultReport(base).games[0], { a: '4', b: '2' });
  assert.throws(() => parseResultReport({ ...base, games: [{ a: '4', b: '4' }, ...base.games.slice(1)] }));
  assert.throws(() => parseResultReport({ ...base, games: base.games.slice(0, 2) }));
  assert.throws(() => parseResultReport({ ...base, submittedBy: '別チーム' }));
});

void test('参加者報告の承認で次戦へ進み、勝者変更時は後続結果を消す', () => {
  const state = createInitialAppState();
  state.tournaments.day1.divisions[1].teams = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'B'];
  const report = parseResultReport({
    day: 'day1', matchId: 'D1-M01', teamA: 'A', teamB: 'B', submittedBy: 'A',
    games: [{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '3', b: '4' }],
  });
  const approved = applyApprovedReport(state, report);
  assert.equal(getMatchContext(approved.tournaments.day1, 'D1-M01').score.a, '2');
  assert.equal(getMatchContext(approved.tournaments.day1, 'D1-M05').teamA, 'A');
  assert.equal(state.tournaments.day1.divisions[1].scores.M01.a, '');
  assert.equal(approved.tournaments.day2.divisions[1].scores.M01.a, '');

  approved.tournaments.day1.divisions[1].scores.M05 = { a: '2', b: '1' };
  const correction = parseResultReport({
    ...report, games: [{ a: '1', b: '4' }, { a: '2', b: '4' }, { a: '4', b: '3' }],
  });
  const changed = applyApprovedReport(approved, correction);
  assert.equal(getMatchContext(changed.tournaments.day1, 'D1-M05').teamA, 'B');
  assert.deepEqual(changed.tournaments.day1.divisions[1].scores.M05, { a: '', b: '' });
});

void test('出場チームが変わった古い報告を承認しない', () => {
  const state = createInitialAppState();
  state.tournaments.day1.divisions[1].teams[0] = '新チーム';
  state.tournaments.day1.divisions[1].teams[7] = 'B';
  const report = parseResultReport({
    day: 'day1', matchId: 'D1-M01', teamA: 'A', teamB: 'B', submittedBy: 'A',
    games: [{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '4', b: '3' }],
  });
  assert.throws(() => applyApprovedReport(state, report));
});
void test('2部Aブロック優勝の変更で総合決勝をリセットし、総合決勝も3対戦で判定する', () => {
  const state = createInitialAppState();
  const division = state.tournaments.day1.divisions[2];
  for (const block of ['A', 'B'] as const) {
    division[block].teams = Array.from({ length: 8 }, (_, index) => `${block}${index + 1}`);
    for (const id of Object.keys(division[block].scores) as Array<keyof typeof division.A.scores>) {
      division[block].scores[id] = { a: '2', b: '1' };
    }
  }
  division.grandFinal = { a: '2', b: '1' };
  const before = getMatchContext(state.tournaments.day1, 'D2-A-M09');
  const changed = applyApprovedReport(state, parseResultReport({
    day: 'day1', matchId: 'D2-A-M09', teamA: before.teamA, teamB: before.teamB, submittedBy: before.teamB,
    games: [{ a: '2', b: '4' }, { a: '1', b: '4' }, { a: '4', b: '3' }],
  }));
  assert.deepEqual(changed.tournaments.day1.divisions[2].grandFinal, { a: '', b: '' });
  const final = getMatchContext(changed.tournaments.day1, 'D2-GF');
  assert.equal(final.teamA, before.teamB);
  const approvedFinal = applyApprovedReport(changed, parseResultReport({
    day: 'day1', matchId: 'D2-GF', teamA: final.teamA, teamB: final.teamB, submittedBy: final.teamA,
    games: [{ a: '4', b: '2' }, { a: '4', b: '1' }, { a: '3', b: '4' }],
  }));
  assert.equal(getMatchContext(approvedFinal.tournaments.day1, 'D2-GF').score.a, '2');
  assert.equal(scoreWinner(approvedFinal.tournaments.day1.divisions[2].grandFinal), 'a');
});
void test('ゲーム別得点を保存形式へ正規化しても団体戦結果を保持する', () => {
  const state = createInitialAppState();
  state.tournaments.day1.divisions[1].scores.M01 = scoreFromGames([
    { a: '4', b: '2' }, { a: '4', b: '3' }, { a: '1', b: '4' },
  ]);
  const restored = normalizeAppState(structuredClone(state));
  assert.deepEqual(restored.tournaments.day1.divisions[1].scores.M01.games?.[0], { a: '4', b: '2' });
  assert.deepEqual([restored.tournaments.day1.divisions[1].scores.M01.a, restored.tournaments.day1.divisions[1].scores.M01.b], ['2', '1']);
  assert.deepEqual(restored.tournaments.day2.divisions[1].scores.M01, { a: '', b: '' });
});