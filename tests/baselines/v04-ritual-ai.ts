import {other,type Game,type Side,type Role,type Piece} from '../../src/game';
import {emptyRites,inAltar,executionPath,ritualActions,resolveRitual,type GameAction} from '../../src/ritual';
import type {Observation,Difficulty,SearchOptions,Decision} from './v04-ai';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const altarDistance=(p:{x:number;y:number})=>Math.max(0,2-p.x,p.x-4)+Math.max(0,2-p.y,p.y-4);
const rngFor=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function ritualHypothesis(o:Observation,rng:()=>number):Game{
 const counts={king:1,guard:3,martyr:3};for(const c of o.captures)if(c.side!==o.side)counts[c.role]--;
 for(const p of o.pieces)if(p.side!==o.side&&p.role!=='unknown')counts[p.role]--;
 if(Object.values(counts).some(n=>n<0))throw new Error('Inconsistent public ritual identities');
 const bag=(Object.keys(counts) as Role[]).flatMap(r=>Array(counts[r]).fill(r) as Role[]);
 for(let i=bag.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
 const pieces:Piece[]=o.pieces.map(p=>{const role=p.role==='unknown'?bag.pop()!:p.role;return{...p,role,...(role==='guard'?{executionUsed:p.executionUsed??false}:{})};});
 if(bag.length||pieces.some(p=>!p.role))throw new Error('Inconsistent public ritual inventory');
 return{mode:'ritual',pieces,turn:o.turn,ply:o.ply,quiet:o.quiet,captures:o.captures,seen:{},result:null,ritual:{red:{...(o.ritual?.red??{phase:'dormant'})},blue:{...(o.ritual?.blue??{phase:'dormant'})}},events:[]};
}
function generated(g:Game,disableExecution=false){const all=ritualActions({pieces:g.pieces,turn:g.turn,ply:g.ply,ended:!!g.result});return disableExecution?all.filter(a=>!a.kind):all;}
function danger(g:Game,target:Piece){
 let count=0;for(const enemy of g.pieces.filter(p=>p.side!==target.side)){
  if(distance(enemy,target)===1)count++;
  if(enemy.role==='guard'&&enemy.charging&&!enemy.executionUsed&&enemy.charging.readyPly<=g.ply&&executionPath(g,enemy.id).some(p=>p.x===target.x&&p.y===target.y))count+=1.5;
 }return count;
}
function value(g:Game,side:Side,purge=false,initialCharge=false):number{
 if(g.result)return g.result.winner===null?0:g.result.winner===side?100000:-100000;
 const court=(s:Side)=>{
  const own=g.pieces.filter(p=>p.side===s),foe=g.pieces.filter(p=>p.side!==s),king=own.find(p=>p.role==='king'),guards=own.filter(p=>p.role==='guard').length,martyrs=own.filter(p=>p.role==='martyr').length,rite=g.ritual?.[s];
  let n=guards*(purge?240:185)-martyrs*85;
  if(king){
   const threat=danger(g,king);n-=threat*(g.turn===s?1000:6500);
   if(rite&&rite.phase!=='dormant')n+=400+(6-altarDistance(king))*90+(rite.phase==='occupied'?2400:0);
   else n+=(6-altarDistance(king))*8;
   n+=own.filter(p=>p!==king&&distance(p,king)===1).length*8;
  }
  for(const p of own){
   const t=danger(g,p),center=6-Math.abs(p.x-3)-Math.abs(p.y-3);
   if(p.role==='guard'){
    n-=t*(guards===1?4800:230)*(g.turn===s?.4:1);n+=center*5+(p.executionUsed?0:28)+(p.revealed?-7:0);
    if(p.charging){const targets=executionPath(g,p.id).filter(a=>a.victimId).length;n+=initialCharge?22+targets*30:targets?18+targets*30:0;}
    const known=foe.filter(q=>q.role==='guard'&&q.revealed);if(known.length)n+=(7-Math.min(...known.map(q=>distance(p,q))))*(purge?26:7);
   }else if(p.role==='martyr'){
    n+=center*5+t*(king&&inAltar(king)?110:35)+(7-Math.min(7,...foe.map(q=>distance(p,q))))*4;
   }
  }
  return n;
 };
 return court(side)-court(other(side));
}
function priority(g:Game,a:GameAction,initialCharge=false):number{
 const p=g.pieces.find(p=>p.id===a.id)!,victims=(a.kind==='execute'?executionPath(g,a.id).filter(t=>Math.abs(t.y-p.y)<=Math.abs(a.y-p.y)): [{x:a.x,y:a.y}]).flatMap(t=>g.pieces.filter(q=>q.side!==p.side&&q.x===t.x&&q.y===t.y));
 let n=0;for(const v of victims)n+=v.role==='king'?100000:v.role==='guard'?(g.pieces.filter(q=>q.side===v.side&&q.role==='guard').length===1?50000:250):80;
 if(p.role==='king'&&g.ritual?.[p.side].phase!=='dormant')n+=(altarDistance(p)-altarDistance(a))*160;
 const chargeThreat=a.kind==='charge'?g.pieces.some(q=>q.side!==p.side&&q.x===a.x&&(q.y-a.y)*(p.side==='red'?-1:1)>0&&Math.abs(q.y-a.y)<=2):false;
 n+=(a.kind==='charge'?(initialCharge?25:chargeThreat?22:-5):0)+(a.kind==='execute'?(initialCharge?30:victims.length?30:-8):0)+(6-Math.abs(a.x-3)-Math.abs(a.y-3))*3;
 return n;
}
export function decideRitual(o:Observation,difficulty:Difficulty,options:SearchOptions={}):Decision{
 const began=performance.now(),rng=rngFor(options.seed??1),legal=ritualActions({pieces:o.pieces,turn:o.turn,ply:o.ply,ended:o.ended}).filter(a=>!options.disableExecution||!a.kind),algorithm={easy:'ritual legal random',normal:'ritual posterior expected value',hard:'ritual 2-ply sampled response search',master:'ritual information-set UCB + 4-ply beam search'}[difficulty];let nodes=0,samples=0;
 const done=(action:GameAction|null)=>({action,nodes,samples,algorithm,elapsed:performance.now()-began});
 if(o.turn!==o.side||o.ended||!legal.length)return done(null);
 if(difficulty==='easy')return done(legal[Math.floor(rng()*legal.length)]);
 const deadline=began+(options.maxMillis??(difficulty==='master'?650:difficulty==='hard'?220:100)),budget=options.nodeBudget??(difficulty==='master'?5000:difficulty==='hard'?1800:600),expired=()=>nodes>=budget||performance.now()>=deadline;
 const purge=options.style==='purge',initialCharge=options.chargePrior==='initial'||(!options.chargePrior&&difficulty!=='master');
 const roots=legal.map(a=>({a,visits:0,total:0}));
 const tree=(g:Game,depth:number,alpha:number,beta:number):number=>{
  nodes++;if(g.result||depth===0||expired())return value(g,o.side,purge,initialCharge);
  const all=generated(g,options.disableExecution);if(!all.length)return 0;
  const candidates=all.map(a=>({a,p:priority(g,a,initialCharge)})).sort((a,b)=>b.p-a.p).slice(0,depth>=2?4:5),max=g.turn===o.side;let best=max?-Infinity:Infinity;
  for(const {a}of candidates){const v=tree(resolveRitual(g,a,true),depth-1,alpha,beta);best=max?Math.max(best,v):Math.min(best,v);if(max)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(alpha>=beta||expired())break;}return best;
 };
 const cyclePenalty=(a:GameAction)=>o.history.slice(-14).filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y&&(h.kind??'move')===(a.kind??'move')).length*90;
 if(difficulty==='master'){
  while(!expired()&&samples<220){
   const root=roots.find(r=>!r.visits)||roots.reduce((best,r)=>{const u=(q:typeof r)=>q.total/q.visits+1400*Math.sqrt(Math.log(samples+1)/q.visits);return u(r)>u(best)?r:best;});
   const g=ritualHypothesis(o,rng);samples++;root.total+=tree(resolveRitual(g,root.a,true),3,-Infinity,Infinity)-cyclePenalty(root.a);root.visits++;
  }
 }else{
  const count=difficulty==='hard'?6:8;
  while(samples<count&&!expired()){
   const g=ritualHypothesis(o,rng);samples++;
   for(const root of roots){if(expired())break;root.total+=tree(resolveRitual(g,root.a,true),difficulty==='hard'?1:0,-Infinity,Infinity)-cyclePenalty(root.a);root.visits++;}
  }
 }
 const best=roots.filter(r=>r.visits).sort((a,b)=>b.total/b.visits-a.total/a.visits)[0];return done(best?.a??legal[0]);
}
