import {allActions,act,other,type Game} from '../../src/game';
import {resolveRitual} from '../../src/ritual';
import {inferIdentities,sampleWorlds,worldGame} from './v05-belief';
import {evaluateStrategy,actionOrder,habitCost,attacks} from './v05-strategy-eval';
import type {Observation,Difficulty,SearchOptions,Decision,Action} from './v05-ai';
const rngFor=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function decideStrategic(o:Observation,difficulty:Difficulty,options:SearchOptions={}):Decision{
 const start=performance.now(),rng=rngFor(options.seed??1),belief=inferIdentities(o,difficulty==='hard'||difficulty==='master');
 const maxMillis=options.maxMillis??({easy:20,normal:100,hard:220,master:650}[difficulty]),limit=start+maxMillis,budget=options.nodeBudget??({easy:120,normal:600,hard:1800,master:5000}[difficulty]);let nodes=0,depth=1,rounds=0,inferenceStates=0;
 const first=o.history[0];const style=difficulty==='master'?(first?(first.from.x*7+first.to.x+first.to.y)%4:(options.seed??1)%4):0;
 const worlds=sampleWorlds(belief,{easy:1,normal:3,hard:5,master:8}[difficulty],rng),games=worlds.map(w=>({g:worldGame(o,belief,w),weight:w.weight}));
 const legal=allActions(games[0].g).filter(a=>!options.disableExecution||!a.kind),expired=()=>nodes>=budget||performance.now()>=limit;
 const step=(g:Game,a:Action)=>{nodes++;return g.mode==='ritual'?resolveRitual(g,a,true):act(g,a);};
 const done=(a:Action|null):Decision=>({action:a,nodes,samples:games.length,algorithm:`constrained joint belief + shared-sample ${difficulty} response search`,elapsed:performance.now()-start,diagnostics:{depth,rounds,worlds:belief.worlds.length,entropy:belief.entropy,style,inferenceStates}});
 if(o.ended||o.turn!==o.side||!legal.length)return done(null);
 type Root={a:Action;value:number;prior:number;terminal?:{win:number;loss:number;ongoing:number;staticValue:number}};
 const rank:Root[]=legal.map(a=>({a,value:0,prior:actionOrder(games[0].g,a)-habitCost(o,a)})).sort((a,b)=>b.prior-a.prior);
 const advance=(g:Game,a:Action)=>g.mode==='ritual'?resolveRitual(g,a,true):act(g,a);
 let exactGames:typeof games|undefined;
 // A one-in-seven fatal martyr must not disappear just because an eight-world
 // sample rounded it away. Resolve immediate terminal probabilities over the
 // ENTIRE count-constrained joint posterior, using the actual rules kernel.
 for(const root of rank){
  const capture=games[0].g.pieces.some(p=>p.side!==o.side&&p.x===root.a.x&&p.y===root.a.y)||root.a.kind==='execute';
  if(!capture&&o.quiet<59&&o.ritual?.[other(o.side)].phase!=='occupied')continue;
  exactGames??=belief.worlds.map(w=>({g:worldGame(o,belief,w),weight:w.weight}));
  const t={win:0,loss:0,ongoing:0,staticValue:0};
  for(const sample of exactGames){if(performance.now()>=limit)return done(rank.find(r=>r.a.kind!=='charge'&&!games[0].g.pieces.some(p=>p.side!==o.side&&p.x===r.a.x&&p.y===r.a.y))?.a??rank[0].a);
   const next=advance(sample.g,root.a);inferenceStates++;
   if(next.result){if(next.result.winner===o.side)t.win+=sample.weight;else if(next.result.winner===other(o.side))t.loss+=sample.weight;}else{t.ongoing+=sample.weight;t.staticValue+=evaluateStrategy(next,o.side,style)*sample.weight;}
  }
  root.terminal=t;if(t.win>1-1e-9)return done(root.a);
 }
 const combined=(root:Root,total:number,weight:number)=>root.terminal?100000*(root.terminal.win-root.terminal.loss)+(weight?total/weight*root.terminal.ongoing:root.terminal.staticValue):total/(weight||1);
 // Complete common-sample first pass; exact root terminal mass is held fixed
 // at every depth, while search estimates only conditional ongoing outcomes.
 for(const root of rank){let value=0,weight=0;for(const sample of games){if(expired())return done(rank[0].a);const next=step(sample.g,root.a);if(root.terminal&&next.result)continue;value+=evaluateStrategy(next,o.side,style)*sample.weight;weight+=sample.weight;}
  root.value=combined(root,value,weight)-habitCost(o,root.a)+(root.a.kind==='charge'?-35:0);
 }
 rank.sort((a,b)=>b.value-a.value);let best=rank[0].a;
 if(difficulty==='easy'){const near=rank.filter(r=>r.value>=rank[0].value-110);return done(near[Math.floor(rng()*Math.min(5,near.length))].a);}
 let candidates=rank.slice(0,difficulty==='normal'?6:difficulty==='hard'?9:12);
 const tree=(g:Game,remaining:number,alpha:number,beta:number):number=>{
  if(g.result||remaining===0||expired())return evaluateStrategy(g,o.side,style);
  const moves=allActions(g).filter(a=>!options.disableExecution||!a.kind),max=g.turn===o.side;let bestValue=max?-Infinity:Infinity;
  const ordered=moves.map(a=>({a,order:actionOrder(g,a)})).sort((a,b)=>b.order-a.order);
  // All captures stay eligible; only quiet spatial branches use a beam.
  const dangers=attacks(g,other(g.turn)),guardCount=g.pieces.filter(p=>p.side===g.turn&&p.role==='guard').length;
  const threatened=new Set(g.pieces.filter(p=>p.side===g.turn&&(p.role==='king'||p.role==='guard'&&guardCount===1)&&dangers.has(`${p.x}/${p.y}`)).map(p=>p.id));
  const selected=ordered.filter((r,i)=>threatened.has(r.a.id)||i<(remaining>1?5:8)||g.pieces.some(p=>p.side!==g.turn&&p.x===r.a.x&&p.y===r.a.y)||r.a.kind==='execute');
  if(!selected.length)return 0;
  for(const r of selected){const next=step(g,r.a),value=tree(next,remaining-1,alpha,beta);bestValue=max?Math.max(bestValue,value):Math.min(bestValue,value);if(max)alpha=Math.max(alpha,bestValue);else beta=Math.min(beta,bestValue);if(alpha>=beta||expired())break;}return bestValue;
 };
 // Complete paired rounds only: never compare a one-world lucky action to
 // another action evaluated on several different worlds or shallower replies.
 for(const targetDepth of (difficulty==='normal'?[2]:difficulty==='hard'?[2,3]:[2,3,4])){
  const active=candidates.slice(0,targetDepth===2?candidates.length:targetDepth===3?4:2);
  const totals=new Map(active.map(r=>[r,0])),weights=new Map(active.map(r=>[r,0]));let completed=0;
  for(const sample of games){const partial=new Map<typeof candidates[number],{value:number;ongoing:boolean}>();
   for(const root of active){if(expired())break;const next=step(sample.g,root.a);partial.set(root,{value:root.terminal&&next.result?0:tree(next,targetDepth-1,-Infinity,Infinity),ongoing:!root.terminal||!next.result});}
   if(partial.size!==active.length)break;
   for(const[root,result]of partial){totals.set(root,totals.get(root)!+result.value*sample.weight);if(result.ongoing)weights.set(root,weights.get(root)!+sample.weight);}completed++;
   if(expired())break;
  }
  if(expired()||completed!==games.length)break;rounds+=completed;depth=targetDepth;
  const scores=active.map(r=>({a:r.a,value:combined(r,totals.get(r)!,weights.get(r)!)-habitCost(o,r.a)+(r.a.kind==='charge'?-35:0)})).sort((a,b)=>b.value-a.value);
  candidates=active.map(r=>({...r,value:scores.find(s=>s.a===r.a)!.value})).sort((a,b)=>b.value-a.value);
  const close=scores.filter(s=>s.value>=scores[0].value-(difficulty==='master'?3:0));best=close[Math.floor(rng()*close.length)].a;
  if(expired())break;
 }
 return done(best);
}
