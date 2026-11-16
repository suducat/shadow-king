import fs from 'node:fs';import {act,allActions,type Game} from '../src/game';
const version=process.env.VERSION||'initial',data=JSON.parse(fs.readFileSync(`docs/v0.6/data/${version}-arena.json`,'utf8')),reviews=[];
for(const r of data.records.filter((r:{result:{winner:string|null};omniscientSide:string})=>r.result?.winner&&r.result.winner!==r.omniscientSide)){
 let g=r.initial as Game;const exposedLosses:unknown[]=[];let terminalThreats:unknown[]=[];
 for(let i=0;i<r.moves.length;i++){const m=r.moves[i];if(m.action.kind==='charge'&&g.turn===r.omniscientSide){const next=r.moves[i+1];if(next?.captured?.some((c:{id:string})=>c.id===m.action.id))exposedLosses.push({ply:m.ply,action:m.action,counter:next.action});}
  if(m.ply===r.plies-2)terminalThreats=allActions(g).map(a=>{const n=act(g,a);return{action:a,losingReplies:allActions(n).filter(b=>{const result=act(n,b).result;return !!result?.winner&&result.winner!==r.omniscientSide;})};});g=act(g,m.action);
 }
 reviews.push({mode:r.mode,baseline:r.baseline,seed:r.seed,reverse:r.reverse,result:r.result,exposedLosses,terminalThreats,allFinalActionsLose:terminalThreats.every((x:any)=>x.losingReplies.length>0),lastMoves:r.moves.slice(-12)});
}
fs.mkdirSync('artifacts/v06',{recursive:true});fs.writeFileSync('artifacts/v06/review.json',JSON.stringify({version,reviews},null,2));console.log(JSON.stringify(reviews.map(({terminalThreats,lastMoves,...r})=>r),null,2));
