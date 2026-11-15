import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, swapSetup, move, viewFor, legalMoves, positionKey, CONFIG, type Game, type Piece, type Role } from '../src/game.ts';
const active = () => startGame(createGame());
function encounter(role: Role, last = false): Game {
  let g = active();
  const victim = g.pieces.find(p => p.side === 'blue' && p.role === role)!;
  g = { ...g, pieces: g.pieces.filter(p => !last || p.side !== 'blue' || p.role !== role || p.id === victim.id).map(p => p.id === 'red-0' ? { ...p, x: 3, y: 3 } : p.id === victim.id ? { ...p, x: 3, y: 2 } : p) };
  return g;
}
test('7×7 opening has 14 pieces, exact roles and independent back ranks', () => {
  const g = createGame(); assert.equal(g.pieces.length, 14);
  for (const side of ['red', 'blue']) {
    const ps = g.pieces.filter(p => p.side === side);
    assert.deepEqual(['king', 'guard', 'martyr'].map(r => ps.filter(p => p.role === r).length), [1, 3, 3]);
    assert.deepEqual(ps.map(p => p.x), [0, 1, 2, 3, 4, 5, 6]);
    assert.ok(ps.every(p => p.y === (side === 'red' ? 6 : 0)));
  }
});
test('secret deployment swaps only own pieces; immutable; locked once started', () => {
  const g = createGame(), next = swapSetup(g, 'red', 'red-0', 'red-3');
  assert.equal(next.pieces.find(p => p.id === 'red-0')!.x, 3);
  assert.equal(g.pieces.find(p => p.id === 'red-0')!.x, 0);
  assert.equal(swapSetup(g, 'red', 'red-0', 'blue-0'), g);
  const started = startGame(next); assert.equal(swapSetup(started, 'red', 'red-0', 'red-3'), started);
});
test('all roles obey identical cardinal movement; bounds, allies, turn and no-op rejected', () => {
  const g = active(); assert.deepEqual(legalMoves(g, 'red-0'), [{ x: 0, y: 5 }]);
  for (const [x, y] of [[-1, 6], [1, 5], [0, 4], [1, 6], [0, 6]]) assert.equal(move(g, 'red-0', x, y), g);
  assert.equal(move(g, 'blue-0', 0, 1), g);
  for (const role of ['king', 'guard', 'martyr'] as Role[]) {
    const p = g.pieces.find(p => p.side === 'red' && p.role === role)!;
    const central = { ...g, pieces: g.pieces.map(q => q.id === p.id ? { ...q, x: 3, y: 3 } : q) };
    assert.equal(legalMoves(central, p.id).length, 4);
  }
});
test('perspectives redact all enemy roles and both sides during handoff', () => {
  const g = swapSetup(createGame(), 'blue', 'blue-0', 'blue-3');
  for (const side of ['red', 'blue'] as const) {
    const view = viewFor(g, side);
    assert.ok(view.filter(p => p.side !== side).every(p => p.role === 'unknown'));
    assert.ok(view.filter(p => p.side === side).every(p => p.role !== 'unknown'));
  }
  assert.ok(viewFor(g, null).every(p => p.role === 'unknown'));
});
test('king capture wins immediately; public capture excludes attacker identity', () => {
  const g = encounter('king'), n = move(g, 'red-0', 3, 2);
  assert.deepEqual(n.result, { winner: 'red', reason: 'king' });
  assert.deepEqual(n.captures[0], { side: 'blue', role: 'king', by: 'red', ply: 1, at: 'D5' });
  assert.equal(n.pieces.length, g.pieces.length - 1);
  assert.equal(move(n, 'blue-0', 0, 1), n); assert.equal(legalMoves(n, 'blue-0').length, 0);
});
test('only last guard wins for attacker; earlier guard does not end game', () => {
  assert.equal(move(encounter('guard'), 'red-0', 3, 2).result, null);
  assert.deepEqual(move(encounter('guard', true), 'red-0', 3, 2).result, { winner: 'red', reason: 'guard' });
});
test('only last martyr wins for victim, even when attacker was about to draw', () => {
  assert.equal(move(encounter('martyr'), 'red-0', 3, 2).result, null);
  const g = { ...encounter('martyr', true), quiet: 59 };
  const n = move(g, 'red-0', 3, 2);
  assert.deepEqual(n.result, { winner: 'blue', reason: 'martyr' });
  assert.equal(n.quiet, 0); assert.equal(n.turn, 'blue');
});
test('60 plies, not 30 plies, trigger no-capture draw; captures reset clock', () => {
  const before = { ...active(), quiet: 28 };
  assert.equal(move(before, 'red-0', 0, 5).result, null);
  assert.deepEqual(move({ ...before, quiet: CONFIG.quietFullRounds * 2 - 1 }, 'red-0', 0, 5).result, { winner: null, reason: 'quiet' });
  assert.equal(move({ ...encounter('guard'), quiet: 59 }, 'red-0', 3, 2).quiet, 0);
});
test('third occurrence of same position and side draws; roles matter, interchangeable IDs do not', () => {
  let g = active();
  const cycle = () => { g = move(g, 'red-0', 0, 5); g = move(g, 'blue-0', 0, 1); g = move(g, 'red-0', 0, 6); g = move(g, 'blue-0', 0, 0); };
  cycle(); assert.equal(g.result, null); cycle();
  assert.deepEqual(g.result, { winner: null, reason: 'repetition' });
  const a = active(), b = { ...a, pieces: a.pieces.map(p => ({ ...p, id: p.id + 'different' })) };
  assert.equal(positionKey(a), positionKey(b));
  assert.notEqual(positionKey(a), positionKey({ ...a, turn: 'blue' }));
  assert.notEqual(positionKey(a), positionKey({ ...a, pieces: a.pieces.map(p => p.id === 'red-3' ? { ...p, role: 'martyr' as Role } : p) }));
});
test('side with no legal move draws rather than skipping', () => {
  const g = active(); g.pieces = g.pieces.filter(p => p.side === 'red');
  assert.deepEqual(move(g, 'red-0', 0, 5).result, { winner: null, reason: 'blocked' });
});
test('100 seeded automated games preserve invariants and reach one terminal outcome', () => {
  let seed = 129428; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let run = 0; run < 100; run++) {
    let g = active();
    for (let step = 0; step < 2500 && !g.result; step++) {
      const choices = g.pieces.flatMap(p => legalMoves(g, p.id).map(t => ({ id: p.id, ...t })));
      assert.ok(choices.length); const choice = choices[Math.floor(rand() * choices.length)];
      const previous = g; g = move(g, choice.id, choice.x, choice.y);
      assert.notEqual(g, previous); assert.equal(g.ply, previous.ply + 1);
      assert.equal(new Set(g.pieces.map(p => `${p.x},${p.y}`)).size, g.pieces.length);
      assert.equal(g.pieces.length + g.captures.length, 14);
      assert.ok(g.pieces.every(p => p.x >= 0 && p.x < 7 && p.y >= 0 && p.y < 7));
      assert.ok(viewFor(g, g.turn).filter(p => p.side !== g.turn).every(p => p.role === 'unknown'));
      if (g.result?.winner) {
        const loser = g.result.winner === 'red' ? 'blue' : 'red';
        if (g.result.reason === 'king') assert.ok(!g.pieces.some(p => p.side === loser && p.role === 'king'));
        if (g.result.reason === 'guard') assert.ok(!g.pieces.some(p => p.side === loser && p.role === 'guard'));
        if (g.result.reason === 'martyr') assert.ok(!g.pieces.some(p => p.side === g.result!.winner && p.role === 'martyr'));
      }
    }
    assert.ok(g.result, `simulation ${run} must end`);
  }
});
