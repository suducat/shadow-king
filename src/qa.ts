import { createGame, startGame, type Game, type Role } from './game';
export type FixtureName = 'capture' | 'king' | 'guard' | 'martyr' | 'corners';
// Imported only by the test-build branch. Never linked into the production bundle.
export function fixture(name: FixtureName, attacker: Role = 'king'): Game {
  let g = createGame();
  if (name === 'corners') {
    const cells = [[0,0],[6,0],[0,6],[6,6],[3,3],[2,5],[4,5]];
    let i = 0;
    g.pieces = g.pieces.map(p => p.side === 'red' ? { ...p, x: cells[i][0], y: cells[i++][1] } : { ...p, y: 1 });
  } else {
    const role = name === 'capture' ? 'guard' : name;
    const actor = g.pieces.find(p => p.side === 'red' && p.role === attacker)!;
    const victim = g.pieces.find(p => p.side === 'blue' && p.role === role)!;
    if (name === 'guard' || name === 'martyr') {
      const removed = g.pieces.filter(p => p.side === 'blue' && p.role === role && p.id !== victim.id);
      g.pieces = g.pieces.filter(p => !removed.includes(p));
      g.captures = removed.map((p,i) => ({ side:p.side, role:p.role, by:'red', ply:i+1, at:'A7' }));
    }
    g.pieces = g.pieces.map(p => p.id === actor.id ? {...p,x:3,y:3} : p.id === victim.id ? {...p,x:3,y:2} : p);
  }
  return startGame(g);
}
