import {modeOf,emptyRites,ritualActions,ritualKey,resolveRitual,type GameMode,type Rites,type RuleEvent,type ResolvedAction,type GameAction} from './ritual';
export type Side = 'red' | 'blue';
export type Role = 'king' | 'guard' | 'martyr';
export type VisibleRole = Role | 'unknown';
export type Piece = { id: string; side: Side; role: Role; x: number; y: number; revealed?:boolean; executionUsed?:boolean; charging?:{readyPly:number} };
export type VisiblePiece = Omit<Piece, 'role'> & { role: VisibleRole };
export type Ending = 'king' | 'guard' | 'martyr' | 'ritual' | 'quiet' | 'repetition' | 'blocked' | 'resign';
export type Result = { winner: Side | null; reason: Ending };
export type Capture = { side: Side; role: Role; by: Side; ply: number; at: string; id?:string; execution?:boolean; charged?:boolean };
export type Game = { pieces: Piece[]; turn: Side; ply: number; quiet: number; captures: Capture[]; seen: Record<string, number>; result: Result | null; mode?:GameMode; ritual?:Rites; events?:RuleEvent[]; lastAction?:ResolvedAction };
export const CONFIG = Object.freeze({ size: 7, quietFullRounds: 30, repetition: 3 });
export const ROLES: Role[] = ['guard', 'martyr', 'guard', 'king', 'martyr', 'guard', 'martyr'];
export const roleName = { king: '王', guard: '影卫', martyr: '死士', unknown: '未知身份' };
export const sideName = { red: '绯红王庭', blue: '幽蓝王庭' };
export const other = (s: Side): Side => s === 'red' ? 'blue' : 'red';
export const coord = (x: number, y: number) => `${'ABCDEFG'[x]}${7 - y}`;
export function createGame(mode:GameMode='classic'): Game {
  const pieces: Piece[] = (['red', 'blue'] as Side[]).flatMap(side => ROLES.map((role, x) => ({ id: `${side}-${x}`, side, role, x, y: side === 'red' ? 6 : 0 })));
  return { pieces:mode==='ritual'?pieces.map(p=>p.role==='guard'?{...p,executionUsed:false}:p):pieces, turn: 'red', ply: 0, quiet: 0, captures: [], seen: {}, result: null,...(mode==='ritual'?{mode,ritual:emptyRites(),events:[]}: {}) };
}
export function positionKey(g: Game): string {
  if(modeOf(g)==='ritual')return ritualKey(g);
  return g.turn + ':' + g.pieces.map(p => `${p.side}/${p.role}/${p.x}/${p.y}`).sort().join('|');
}
export function startGame(g: Game): Game {
  return { ...g, seen: { [positionKey(g)]: 1 } };
}
export function swapSetup(g: Game, side: Side, a: string, b: string): Game {
  const pa = g.pieces.find(p => p.id === a && p.side === side);
  const pb = g.pieces.find(p => p.id === b && p.side === side);
  if (!pa || !pb || g.ply || Object.keys(g.seen).length) return g;
  return { ...g, pieces: g.pieces.map(p => p.id === a ? { ...p, x: pb.x } : p.id === b ? { ...p, x: pa.x } : p) };
}
export function legalMoves(g: Game, id: string): { x: number; y: number }[] {
  if (g.result) return [];
  const p = g.pieces.find(p => p.id === id);
  if (!p || p.side !== g.turn) return [];
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
    .filter(t => t.x >= 0 && t.y >= 0 && t.x < CONFIG.size && t.y < CONFIG.size && !g.pieces.some(q => q.x === t.x && q.y === t.y && q.side === p.side));
}
export function viewFor(g: Game, viewer: Side | null): VisiblePiece[] {
  return g.pieces.map(({role,executionUsed,charging,...p})=>{
    const known=p.side===viewer||(modeOf(g)==='ritual'&&p.revealed);
    return {...p,role:known?role:'unknown',...(known&&executionUsed!==undefined?{executionUsed}:{}),...(known&&charging?{charging:{...charging}}:{})};
  });
}
export function move(g: Game, id: string, x: number, y: number): Game {
  if(modeOf(g)==='ritual')return resolveRitual(g,{id,x,y});
  if (!legalMoves(g, id).some(t => t.x === x && t.y === y)) return g;
  const attacker = g.pieces.find(p => p.id === id)!;
  const victim = g.pieces.find(p => p.x === x && p.y === y);
  const captures = victim ? [...g.captures, { side: victim.side, role: victim.role, by: attacker.side, ply: g.ply + 1, at: coord(x, y) }] : g.captures;
  const pieces = g.pieces.filter(p => p.id !== victim?.id).map(p => p.id === id ? { ...p, x, y } : p);
  const next: Game = { ...g, pieces, captures, turn: other(g.turn), ply: g.ply + 1, quiet: victim ? 0 : g.quiet + 1, result: null, seen: { ...g.seen } };
  // A single capture can complete only one of the three role-specific endings.
  if (victim) {
    if (victim.role === 'king') next.result = { winner: attacker.side, reason: 'king' };
    else if (!pieces.some(p => p.side === victim.side && p.role === victim.role)) next.result = {
      winner: victim.role === 'martyr' ? victim.side : attacker.side, reason: victim.role,
    };
  }
  const key = positionKey(next);
  next.seen[key] = (next.seen[key] || 0) + 1;
  if (!next.result) {
    if (next.quiet >= CONFIG.quietFullRounds * 2) next.result = { winner: null, reason: 'quiet' };
    else if (next.seen[key] >= CONFIG.repetition) next.result = { winner: null, reason: 'repetition' };
    else if (!pieces.some(p => p.side === next.turn && legalMoves(next, p.id).length)) next.result = { winner: null, reason: 'blocked' };
  }
  return next;
}

export function allActions(g:Game):GameAction[]{
 return modeOf(g)==='ritual'?ritualActions({pieces:g.pieces,turn:g.turn,ply:g.ply,ended:!!g.result}):g.pieces.filter(p=>p.side===g.turn).flatMap(p=>legalMoves(g,p.id).map(a=>({id:p.id,...a})));
}
export function act(g:Game,a:GameAction):Game{return modeOf(g)==='ritual'?resolveRitual(g,a):a.kind&&a.kind!=='move'?g:move(g,a.id,a.x,a.y);}
// Old serialized games have no mode and continue to use classic rules.
export function restoreGame(json:string):Game{const g=JSON.parse(json) as Game;if(g.mode&&g.mode!=='classic'&&g.mode!=='ritual')throw new Error('Unknown game mode');return g;}
