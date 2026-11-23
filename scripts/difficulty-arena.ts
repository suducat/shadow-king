// Short-budget paired games for tuning; full browser budgets are in the engines.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import * as current from '../src/ai';
import {act,createGame,other,startGame,type Side} from '../src/game';
import type {Difficulty,PublicAction,SearchOptions} from '../src/ai';

const baselinePath=process.argv[2];
const mode=process.argv[3];
if(!baselinePath||(mode!=='classic'&&mode!=='ritual'))throw new Error('Usage: tsx scripts/difficulty-arena.ts /path/to/baseline.cjs classic|ritual');
const baseline:typeof current=createRequire(import.meta.url)(resolve(baselinePath));
const budgets:Record<Difficulty,SearchOptions>={
 easy:{maxMillis:20,nodeBudget:120},normal:{maxMillis:45,nodeBudget:600},hard:{maxMillis:85,nodeBudget:1500},
 master:{maxMillis:140,nodeBudget:3600},omniscient:{maxMillis:220,nodeBudget:12000},
};
const matchups=[
 ['easy','normal',false],['normal','hard',false],['hard','master',false],
 ['master','omniscient',false],['omniscient','omniscient',true],
] as const;
for(const [lower,upper,old] of matchups){
 for(const upperSide of ['red','blue'] as const){
  const game=createGame(mode),history:PublicAction[]=[];
  // Same deployment pair on every leg. Only the side controlled by each engine changes.
  for(const side of ['red','blue'] as const){
   const columns=current.deploy(side,'master',current.random(side==='red'?221:719));
   game.pieces.filter(p=>p.side===side).forEach((piece,index)=>{piece.x=columns[index];});
  }
  let state=startGame(game);
  const depths:Record<Side,number[]>={red:[],blue:[]},times:Record<Side,number[]>={red:[],blue:[]};
  while(!state.result&&state.ply<96){
   const side=state.turn,level=side===upperSide?upper:lower,engine=side!==upperSide&&old?baseline:current;
   const observation=current.observe(state,side,history,level==='omniscient'?'omniscient':undefined);
   const decision=engine.decide(observation,level,{...budgets[level],seed:1337+state.ply});
   if(!decision.action)throw new Error('Missing action');
   const a=decision.action,moved=state.pieces.find(p=>p.id===a.id)!,next=act(state,a);
   if(next===state)throw new Error('Illegal action');
   const end=next.pieces.find(p=>p.id===a.id)!;
   const captured=next.captures.length>state.captures.length?next.captures.at(-1)!.role:undefined;
   history.push({id:a.id,side,from:{x:moved.x,y:moved.y},to:{x:end.x,y:end.y},kind:a.kind,captured});
   depths[side].push(decision.diagnostics?.depth??0);
   times[side].push(decision.elapsed);
   state=next;
  }
  const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]??0;};
  console.log(JSON.stringify({mode,lower,upper,old,upperSide,plies:state.ply,outcome:state.result,
   upperDepth:median(depths[upperSide]),lowerDepth:median(depths[other(upperSide)]),
   upperMs:median(times[upperSide]),lowerMs:median(times[other(upperSide)])}));
 }
}
