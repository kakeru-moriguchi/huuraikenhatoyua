import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyBracket,
  getRanking,
  reconcileGrandFinal,
  reconcileScores,
  resolveGrandFinal,
  resolveTournament,
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

