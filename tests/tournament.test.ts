import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialAppState, migratePreviousState, normalizeAppState } from '../lib/event.ts';
import {
  createEmptyBracket,
  getRanking,
  reconcileGrandFinal,
  reconcileScores,
  resolveGrandFinal,
  resolveTournament,
  shuffleTeams,
  type MatchId,
} from '../lib/tournament.ts';

const completedBracket = () => {
  const bracket = createEmptyBracket();
  bracket.teams = Array.from({ length: 8 }, (_, index) => `Team ${index + 1}`);
  for (const id of Object.keys(bracket.scores) as MatchId[]) {
    bracket.scores[id] = { a: '2', b: '1' };
  }
  return bracket;
};

void test('ランダム抽選は全チームを重複・欠落なく並べ替える', () => {
  const teams = Array.from({ length: 8 }, (_, index) => `Team ${index + 1}`);
  const values = [0.12, 0.87, 0.34, 0.68, 0.05, 0.91, 0.46];
  let index = 0;
  const shuffled = shuffleTeams(teams, () => values[index++]);

  assert.notDeepEqual(shuffled, teams);
  assert.deepEqual([...shuffled].sort(), [...teams].sort());
});

void test('8チームの12試合から1位〜8位を重複なく決定する', () => {
  const resolved = resolveTournament(completedBracket());
  const ranking = getRanking(resolved);
  assert.equal(ranking.length, 8);
  assert.equal(new Set(ranking.map(({ team }) => team)).size, 8);
  assert.equal(ranking[0].team, 'Team 1');
});

void test('上流の勝敗変更時は影響を受ける後続試合だけリセットする', () => {
  const previous = completedBracket();
  const next = structuredClone(previous);
  next.scores.M01 = { a: '0', b: '3' };
  const reconciled = reconcileScores(previous, next);

  assert.deepEqual(reconciled.scores.M05, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M07, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M09, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M10, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M11, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M12, { a: '', b: '' });
  assert.deepEqual(reconciled.scores.M06, { a: '2', b: '1' });
  assert.deepEqual(reconciled.scores.M08, { a: '2', b: '1' });
});

void test('総合決勝の出場者が変わった場合だけ得点をリセットする', () => {
  const score = { a: '3', b: '1' };
  assert.deepEqual(reconcileGrandFinal(['A王者', 'B王者'], ['A王者', 'B王者'], score), score);
  assert.deepEqual(reconcileGrandFinal(['A王者', 'B王者'], ['新A王者', 'B王者'], score), { a: '', b: '' });
  assert.equal(resolveGrandFinal(['A王者', 'B王者'], score).winner, 'A王者');
});

void test('1部・2部A/B・3部の4つの8チーム枠を独立して計算できる', () => {
  const makeDivision = (prefix: string) => {
    const bracket = completedBracket();
    bracket.teams = bracket.teams.map((_, index) => `${prefix}-${index + 1}`);
    return bracket;
  };
  const division1 = makeDivision('D1');
  const division2A = makeDivision('D2A');
  const division2B = makeDivision('D2B');
  const division3 = makeDivision('D3');

  assert.equal(resolveTournament(division1).M09.winner, 'D1-1');
  assert.equal(resolveTournament(division2A).M09.winner, 'D2A-1');
  assert.equal(resolveTournament(division2B).M09.winner, 'D2B-1');
  assert.equal(resolveTournament(division3).M09.winner, 'D3-1');
  assert.equal(
    resolveGrandFinal(
      [resolveTournament(division2A).M09.winner, resolveTournament(division2B).M09.winner],
      { a: '1', b: '2' },
    ).winner,
    'D2B-1',
  );
});

void test('1日目と2日目の大会データは完全に独立している', () => {
  const state = createInitialAppState();
  state.tournaments.day1.divisions[1].teams[0] = '男子チーム';
  state.tournaments.day1.divisions[2].A.scores.M01 = { a: '3', b: '1' };
  state.tournaments.day1.schedule['D1-M01'] = { startTime: '09:30', court: 'Aコート' };

  assert.equal(state.tournaments.day2.divisions[1].teams[0], '');
  assert.deepEqual(state.tournaments.day2.divisions[2].A.scores.M01, { a: '', b: '' });
  assert.deepEqual(state.tournaments.day2.schedule['D1-M01'], { startTime: '', court: '' });
  assert.equal(state.tournaments.day1.category, '男子');
  assert.equal(state.tournaments.day2.category, '女子');
});

void test('各大会に49試合分の進行表があり、旧データには空欄を自動補完する', () => {
  const current = createInitialAppState();
  assert.equal(Object.keys(current.tournaments.day1.schedule).length, 49);
  assert.ok(current.tournaments.day1.schedule['D2-GF']);

  const legacyLike = structuredClone(current) as unknown as Record<string, unknown>;
  const tournaments = legacyLike.tournaments as Record<string, Record<string, unknown>>;
  delete tournaments.day1.schedule;
  const normalized = normalizeAppState(legacyLike as never);
  assert.equal(normalized.version, 4);
  assert.deepEqual(normalized.tournaments.day1.schedule['D2-A-M09'], { startTime: '', court: '' });
});

void test('従来の大会データは1日目へ移行し2日目は初期状態を保つ', () => {
  const previous = completedBracket();
  const migrated = migratePreviousState({
    name: '既存大会',
    date: '2026-09-10',
    divisions: {
      1: previous,
      2: { A: previous, B: previous, grandFinal: { a: '2', b: '1' } },
      3: previous,
    },
  }, 2);

  assert.equal(migrated.tournaments.day1.name, '既存大会');
  assert.equal(migrated.tournaments.day1.divisions[1].teams[0], 'Team 1');
  assert.deepEqual(migrated.tournaments.day1.divisions[2].grandFinal, { a: '2', b: '1' });
  assert.equal(migrated.tournaments.day2.divisions[1].teams[0], '');
});

