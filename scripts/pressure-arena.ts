// Usage: tsx scripts/pressure-arena.ts [path to a bundled baseline ai.cjs]
// With no argument, test the informed AI against a public martyr-rush policy.
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import * as current from '../src/ai';
import {act,createGame,startGame} from '../src/game';
import type {Action,Observation,PublicAction} from '../src/ai';

function rushAction(o:Observation):Action{
 const score=(a:Action)=>{
  const mover=o.pieces.find(p=>p.id===a.id)!;
  const target=o.pieces.find(p=>p.side!==o.side&&p.x===a.x&&p.y===a.y);
  const advance=o.side==='red'?6-a.y:a.y;
  const contacts=o.pieces.filter(p=>p.side!==o.side&&Math.abs(p.x-a.x)+Math.abs(p.y-a.y)===1).length;
  const repeats=o.history.slice(-12).filter(m=>m.id===a.id&&m.to.x===a.x&&m.to.y===a.y).length;
  const capture=target?.role==='king'?500:target?.role==='guard'?120:target?30:0;
  const initiative=mover.role==='martyr'?32+contacts*20:mover.role==='guard'?12:-35;
  return capture+initiative+advance*9-Math.abs(a.x-3)*3-repeats*40-(a.kind==='charge'?8:0);
 };
 return current.legalActions(o).sort((a,b)=>score(b)-score(a))[0];
}

const baseline:typeof current|undefined=process.argv[2]?createRequire(import.meta.url)(resolve(process.argv[2])):undefined;
for(const seed of baseline?[113,827]:[113]){
 for(const mode of ['classic','ritual'] as const)for(const newSide of ['red','blue'] as const){
  let game=createGame(mode);
  const history:PublicAction[]=[];
  for(const side of ['red','blue'] as const){
   const columns=current.deploy(side,'master',current.random(seed+(side==='blue'?719:0)));
   game.pieces.filter(p=>p.side===side).forEach((p,i)=>{p.x=columns[i];});
  }
  game=startGame(game);
  while(!game.result&&game.ply<240){
   const informed=!baseline&&game.turn===newSide;
   const engine=game.turn===newSide?current:baseline;
   const o=current.observe(game,game.turn,history,informed?'omniscient':undefined);
   const a=engine?engine.decide(o,informed?'omniscient':'master',{seed:seed+game.ply}).action:rushAction(o);
   if(!a)throw new Error('Missing action');
   const p=game.pieces.find(p=>p.id===a.id)!,next=act(game,a);
   if(game===next)throw new Error('Illegal action');
   const end=next.pieces.find(p=>p.id===a.id)!;
   history.push({side:p.side,id:p.id,from:{x:p.x,y:p.y},to:{x:end.x,y:end.y},kind:a.kind,
    captured:next.captures.length>game.captures.length?next.captures.at(-1)!.role:undefined});
   game=next;
  }
  console.log(JSON.stringify({seed,mode,newSide,plies:game.ply,result:game.result,history}));
 }
}
