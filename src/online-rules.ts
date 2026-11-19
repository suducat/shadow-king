import {act,CONFIG,createGame,other,positionKey,type Game,type Piece,type Role,type Side} from './game';
import {modeOf,ritualKey,type GameAction} from './ritual';

const ranks:Role[]=['king','guard','martyr'];
const inventory=()=>({king:1,guard:3,martyr:3});
export type Opening={id:string;role:Role;salt:string};
export type Commitments=Record<string,string>;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const randomBytes=(size:number)=>hex(crypto.getRandomValues(new Uint8Array(size)));
export const slotsFor=(side:Side)=>Array.from({length:7},(_,x)=>`${side}-${x}`);

export async function commitment(match:string,proof:Opening){
 const encoded=new TextEncoder().encode(JSON.stringify([match,proof.id,proof.role,proof.salt]));
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)));
}
export async function deployment(match:string,side:Side){
 const roles:Role[]=['king','guard','guard','guard','martyr','martyr','martyr'];
 for(let i=roles.length-1;i>0;i--){
  const j=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/2**32*(i+1));
  [roles[i],roles[j]]=[roles[j],roles[i]];
 }
 const openings:Opening[]=slotsFor(side).map((id,i)=>({id,role:roles[i],salt:randomBytes(24)}));
 const hashes=Object.fromEntries(await Promise.all(openings.map(async proof=>[proof.id,await commitment(match,proof)])));
 return {openings,hashes};
}
export const isCommitments=(value:unknown,side:Side):value is Commitments=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==7)return false;
 return slotsFor(side).every(id=>typeof (value as Commitments)[id]==='string'&&/^[0-9a-f]{64}$/.test((value as Commitments)[id]));
};
export async function verifyOpenings(match:string,proofs:unknown,hashes:Commitments,limit:number):Promise<Opening[]>{
 if(!Array.isArray(proofs)||proofs.length>limit)throw new Error('无效身份凭据');
 const seen=new Set<string>();
 for(const p of proofs){
  if(!p||typeof p.id!=='string'||!Object.hasOwn(hashes,p.id)||!ranks.includes(p.role)||
   typeof p.salt!=='string'||!/^[0-9a-f]{48}$/.test(p.salt)||seen.has(p.id)||await commitment(match,p)!==hashes[p.id]){
   throw new Error('无效身份凭据');
  }
  seen.add(p.id);
 }
 return proofs.map(({id,role,salt})=>({id,role,salt}));
}

// Unknown roles are temporary inventory placeholders. Only the local player's
// layout and verified public proofs are authoritative. IDs are board slots.
export function projectRoles(game:Game,side:Side,known:ReadonlyMap<string,Role>,proofs:Opening[]=[]):Game{
 const enemy=other(side),counts=inventory(),revealed=new Map(proofs.map(p=>[p.id,p.role]));
 const roleFor=(p:Piece)=>known.get(p.id)??revealed.get(p.id)??(p.revealed?p.role:undefined);
 for(const c of game.captures)if(c.side===enemy)counts[c.role]--;
 for(const p of game.pieces)if(p.side===enemy){const role=roleFor(p);if(role)counts[role]--;}
 if(ranks.some(r=>counts[r]<0))throw new Error('公开身份与棋子数量不一致');
 const pieces=game.pieces.map(p=>{
  if(p.side===side)return {...p,role:known.get(p.id)??p.role};
  let role=roleFor(p);
  if(!role){role=ranks.find(r=>counts[r]>0);if(!role)throw new Error('身份库存不一致');counts[role]--;}
  return {...p,role};
 });
 return {...game,pieces,seen:{}};
}
export function resolveOnline(game:Game,action:GameAction,side:Side,known:ReadonlyMap<string,Role>,proofs:Opening[]=[]){
 const mover=game.pieces.find(p=>p.id===action.id);
 if(!mover||mover.side!==game.turn)throw new Error('走法不属于当前执棋者');
 if(game.turn!==side&&(action.kind==='charge'||action.kind==='execute')&&
  (known.get(mover.id)??proofs.find(p=>p.id===mover.id)?.role??(mover.revealed?mover.role:null))!=='guard'){
  throw new Error('未证实的影卫技能');
 }
 const before=projectRoles(game,side,known,proofs),next=act(before,action);
 if(next===before)throw new Error('非法走法');
 return {before,next};
}
export function disclosures(before:Game,next:Game):string[]{
 const ids=next.captures.slice(before.captures.length).map(c=>c.id??before.pieces.find(p=>
  p.side===c.side&&p.x==='ABCDEFG'.indexOf(c.at[0])&&p.y===7-Number(c.at[1]))?.id);
 const kings=(next.events??[]).filter(e=>e.ply===next.ply&&e.kind==='rite-open').map(e=>e.id);
 return [...new Set([...ids,...kings])].filter((id):id is string=>!!id);
}
export const initialOnline=(mode:ReturnType<typeof modeOf>,side:Side,roles:ReadonlyMap<string,Role>)=>
 projectRoles(createGame(mode),side,roles);

export function publicPosition(game:Game){
 const pieces=game.pieces.map(p=>({...p,role:p.revealed?p.role:'guard' as const}));
 if(modeOf(game)==='ritual')return ritualKey({...game,pieces});
 return game.turn+':'+pieces.map(p=>`${p.side}/${p.x}/${p.y}`).sort().join('|');
}
export function ownPosition(game:Game,side:Side){
 const own={...game,pieces:game.pieces.filter(p=>p.side===side)};
 return positionKey(own);
}
export function repetitionMatches(game:Game,side:Side,history:ReadonlyMap<number,{publicKey:string;ownKey:string}>){
 const publicKey=publicPosition(game),ownKey=ownPosition(game,side);
 const same=[...history].filter(([,p])=>p.publicKey===publicKey);
 return same.length>=CONFIG.repetition-1?same.filter(([,p])=>p.ownKey===ownKey).map(([ply])=>ply):[];
}
export function settleRepetition(game:Game,ours:number[],theirs:number[]):Game{
 if(game.result&&!['quiet','blocked'].includes(game.result.reason))return game;
 return ours.filter(p=>theirs.includes(p)).length>=CONFIG.repetition-1?{...game,result:{winner:null,reason:'repetition'}}:game;
}
