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
 const evidence=unknown.map(p=>{
  const moves=o.history.filter(h=>h.id===p.id),home=enemy==='red'?6:0,progress=Math.abs(p.y-home),near=o.pieces.filter(q=>q.side!==enemy);
  const advances=moves.filter(h=>Math.abs(h.to.y-home)>Math.abs(h.from.y-home)).length,retreats=moves.filter(h=>Math.abs(h.to.y-home)<Math.abs(h.from.y-home)).length;
  const exposure=moves.filter(h=>near.some(q=>dist(h.to,q)<=1)).length,centerVisits=moves.filter(h=>h.to.x>=2&&h.to.x<=4&&h.to.y>=2&&h.to.y<=4).length;
  const protectedMoves=o.history.filter(h=>h.side===enemy&&h.id!==p.id&&dist(h.to,p)===1).length;
  // Weak, bounded behavioral evidence, never a role label. Current-survivor
  // distances are a proxy, not a reconstructed omniscient movement history.
  const bound=(v:number)=>Math.max(-.9,Math.min(.9,v));
  return {king:bound(protectedMoves*.07+centerVisits*(remaining.martyr<=1?.12:.025)-exposure*.12),guard:bound(retreats*.07+protectedMoves*.02-advances*.025),martyr:bound(advances*.08+progress*.04+exposure*.1-retreats*.05)};
 });
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
