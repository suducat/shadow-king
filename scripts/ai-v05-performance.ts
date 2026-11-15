import fs from 'node:fs';import assert from 'node:assert/strict';
import {createGame,startGame,act,allActions,type Game} from '../src/game';
import {decide,observe,random,legalActions,type Difficulty,type Observation,type PublicAction} from '../src/ai';import {decide as oldDecide} from '../tests/baselines/v04-ai';import {strategicFixture,baitHistory} from '../tests/ai-v05-fixtures';
const rng=random(881),inputs:Observation[]=[];
for(const mode of ['classic','ritual'] as const){let g=startGame(createGame(mode));const history:PublicAction[]=[];
 for(let i=0;i<50;i++){if(g.result){g=startGame(createGame(mode));history.length=0;}if(i%10===0)inputs.push(observe(g,g.turn,history));const legal=allActions(g),a=legal[Math.floor(rng()*legal.length)],p=g.pieces.find(p=>p.id===a.id)!,next=act(g,a),to=next.pieces.find(p=>p.id===a.id)!;history.push({id:a.id,side:g.turn,from:{x:p.x,y:p.y},to:{x:to.x,y:to.y},...(a.kind?{kind:a.kind}:{}),...(next.captures.length>g.captures.length?{captured:next.captures.at(-1)!.role}:{})});g=next;}
}
for(const name of ['B','E','F','H','I'] as const)inputs.push(observe(strategicFixture(name),'red',name==='F'?baitHistory():[]));
const records=[];
for(const version of ['old','new'] as const)for(const level of ['easy','normal','hard','master'] as Difficulty[])for(let i=0;i<inputs.length;i++){
 const d=version==='new'?decide(inputs[i],level,{seed:774+i}):oldDecide(inputs[i] as never,level,{seed:774+i});assert.ok(d.action);assert.ok(legalActions(inputs[i]).some(a=>a.id===d.action!.id&&a.x===d.action!.x&&a.y===d.action!.y&&a.kind===d.action!.kind));
 if(version==='new'){assert.ok(d.nodes<={easy:120,normal:600,hard:1800,master:5000}[level]);assert.ok(d.elapsed<{easy:150,normal:230,hard:350,master:800}[level],`${level}: deadline overshoot ${d.elapsed}`);}
 records.push({version,level,input:i,elapsed:d.elapsed,nodes:d.nodes,diagnostics:'diagnostics'in d?d.diagnostics:undefined});
}
const summary=Object.fromEntries(['old','new'].flatMap(v=>(['easy','normal','hard','master'] as Difficulty[]).map(level=>{const rows=records.filter(r=>r.version===v&&r.level===level),times=rows.map(r=>r.elapsed).sort((a,b)=>a-b);return[`${v}-${level}`,{searches:rows.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],p99Ms:times[Math.ceil(times.length*.99)-1],maxMs:times.at(-1)}];})));
fs.writeFileSync('artifacts/v05-performance.json',JSON.stringify({complete:true,method:'serial local Node measurements, actual production wall-clock deadlines and node caps; not physical Mac FPS',summary,records},null,2));console.log(JSON.stringify(summary,null,2));
