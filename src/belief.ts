import type {Observation} from './ai';
import {other,type Role,type Game,type Piece} from './game';
import {emptyRites} from './ritual';
export type Distribution=Record<Role,number>;
export type IdentityWorld={roles:Role[];weight:number};
export type Belief={ids:string[];worlds:IdentityWorld[];marginals:Record<string,Distribution>;remaining:Distribution;entropy:number};
const roles:Role[]=['king','guard','martyr'];
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function inferIdentities(o:Observation,behavior=true):Belief{
 const enemy=other(o.side),counts={...o.rules.roles},unknown=o.pieces.filter(p=>p.side===enemy&&p.role==='unknown');
 for(const c of o.captures)if(c.side===enemy)counts[c.role]--;
 const remaining={...counts};for(const p of o.pieces)if(p.side===enemy&&p.role!=='unknown')counts[p.role]--;
 if(roles.some(r=>counts[r]<0)||roles.reduce((n,r)=>n+counts[r],0)!==unknown.length)throw new Error('Invalid public inventory');
 // Rewind surviving defenders through public moves. A defender arriving later
 // must not turn an earlier quiet advance into evidence of a deliberate offer.
 const defenders=new Map(o.pieces.filter(p=>p.side===o.side).map(p=>[p.id,{x:p.x,y:p.y}]));
 const offers=new Map<string,number>();
 if(behavior)for(let i=o.history.length-1;i>=0;i--){
  const h=o.history[i];
  if(h.side===o.side){if(defenders.has(h.id))defenders.set(h.id,h.from);continue;}
  if(!h.captured&&Array.from(defenders.values()).some(q=>dist(h.to,q)===1))
   offers.set(h.id,(offers.get(h.id)??0)+1);
 }
 const evidence=behavior?unknown.map(p=>{
  const home=enemy==='red'?6:0,progress=Math.abs(p.y-home);
  const moves=o.history.filter(h=>h.id===p.id);
  const advances=moves.filter(h=>!h.captured&&Math.abs(h.to.y-home)>Math.abs(h.from.y-home)).length;
  const captures=moves.filter(h=>h.captured).length;
  const support=o.pieces.some(q=>q.side===enemy&&q.id!==p.id&&dist(q,p)===1);
  const exposed=o.pieces.some(q=>q.side===o.side&&dist(q,p)===1);
  const rush=Math.min(3,advances)*.28+Math.max(0,progress-1)*.22;
  const offered=Math.min(2,offers.get(p.id)??0)*.38+(exposed&&!support?.46:0);
  const sheltered=progress<=1&&support?.35:0;
  const bound=(n:number)=>Math.max(-2.4,Math.min(2.4,n));
  return {king:bound(sheltered-rush*.65-offered),guard:bound(sheltered*.55+Math.min(2,captures)*.25-offered*.28),
   martyr:bound(rush+offered-sheltered-Math.min(2,captures)*.18)};
 }):[];
 const worlds:IdentityWorld[]=[];
 const visit=(i:number,assigned:Role[],log:number)=>{
  if(i===unknown.length){worlds.push({roles:[...assigned],weight:Math.exp(log)});return;}
  for(const r of roles)if(counts[r]>0){counts[r]--;assigned.push(r);visit(i+1,assigned,log+(behavior?evidence[i][r]:0));assigned.pop();counts[r]++;}
 };visit(0,[],0);
 const total=worlds.reduce((n,w)=>n+w.weight,0),uniform=1/worlds.length;
 // A uniform mixture preserves deliberate disguises as possible worlds.
 for(const w of worlds)w.weight=.72*w.weight/total+.28*uniform;
 const marginals:Belief['marginals']={};
 for(const p of o.pieces.filter(p=>p.side===enemy))marginals[p.id]={king:p.role==='king'?1:0,guard:p.role==='guard'?1:0,martyr:p.role==='martyr'?1:0};
 unknown.forEach((p,i)=>worlds.forEach(w=>marginals[p.id][w.roles[i]]+=w.weight));
 return {ids:unknown.map(p=>p.id),worlds,marginals,remaining,entropy:-worlds.reduce((n,w)=>n+w.weight*Math.log(w.weight),0)};
}
export function sampleWorlds(b:Belief,count:number,rng:()=>number):IdentityWorld[]{
 if(b.worlds.length<=count)return b.worlds;
 const result:IdentityWorld[]=[],offset=rng()/count;let i=0,upper=b.worlds[0].weight;
 for(let j=0;j<count;j++){const t=offset+j/count;while(t>upper&&i<b.worlds.length-1)upper+=b.worlds[++i].weight;result.push({roles:b.worlds[i].roles,weight:1/count});}return result;
}
export function worldGame(o:Observation,b:Belief,w:IdentityWorld):Game{
 const assigned=new Map(b.ids.map((id,i)=>[id,w.roles[i]]));
 const pieces:Piece[]=o.pieces.map(p=>{const role=p.role==='unknown'?assigned.get(p.id)!:p.role;return{...p,role,...(role==='guard'&&o.rules.id==='shadow-king-rite-v2'?{executionUsed:p.executionUsed??false}:{})};});
 return {pieces,turn:o.turn,ply:o.ply,quiet:o.quiet,captures:o.captures.map(c=>({...c})),seen:{},result:null,...(o.rules.id==='shadow-king-rite-v2'?{mode:'ritual',ritual:structuredClone(o.ritual??emptyRites()),events:[]}: {})};
}
