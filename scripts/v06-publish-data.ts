import fs from 'node:fs';import {createHash} from 'node:crypto';import {createGame,startGame,type Side} from '../src/game';import {deploy,random} from '../src/ai';
fs.mkdirSync('docs/v0.6/data',{recursive:true});
for(const tag of ['main','final']){
 const data=JSON.parse(fs.readFileSync(`artifacts/v06/${tag}/arena.json`,'utf8'));if(data.completed!==data.planned||data.failures.length)throw Error(`${tag} incomplete: ${data.completed}/${data.planned}`);
 const dir=tag==='main'?'dist-test':'/tmp/shadow-king-v06-final-ai',worker=fs.readdirSync(`${dir}/assets`).find(f=>f.startsWith('ai.worker-')&&f.endsWith('.js'))!;
 data.workerSha256=createHash('sha256').update(fs.readFileSync(`${dir}/assets/${worker}`)).digest('hex');data.workerFile=worker;
 data.version=tag==='main'?'initial evaluation before encirclement refinement':'final production policy';
 for(const r of data.records){let g=createGame(r.mode);for(const side of ['red','blue'] as Side[]){const row=deploy(side,side===r.omniscientSide?'omniscient':'master',random(r.seed+(side===r.omniscientSide?11:29)));let i=0;g.pieces=g.pieces.map(p=>p.side===side?{...p,x:row[i++]}:p);}r.initial=startGame(g);delete r.final.seen;delete r.final.events;}
 fs.writeFileSync(`docs/v0.6/data/${tag==='main'?'initial':'final'}-arena.json`,JSON.stringify(data,null,2)+'\n');
}
fs.copyFileSync('/tmp/shadow-king-omniscient-initial.ts','docs/v0.6/data/omniscient-initial.ts.txt');
