import {createGame,startGame,act,allActions,other,type Game,type Side,type Role} from '../src/game';
import {observe,deploy,random,legalActions,type Observation,type Action,type PublicAction} from '../src/ai';
import {inAltar} from '../src/ritual';
export type Config={mode:'classic'|'ritual';seed:number;reverse:boolean;baseline:'master'|'rush'|'defender'};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function baseline(o:Observation,kind:'rush'|'defender',rng:()=>number):Action{
 const moves=legalActions(o),own=o.pieces.filter(p=>p.side===o.side),king=own.find(p=>p.role==='king')!,foes=o.pieces.filter(p=>p.side!==o.side),guards=own.filter(p=>p.role==='guard').length;
 const danger=(a:{x:number;y:number})=>foes.filter(q=>distance(q,a)===1).length;
 return moves.map(a=>{const p=own.find(p=>p.id===a.id)!,victim=foes.find(q=>q.x===a.x&&q.y===a.y),progress=(o.side==='red'?p.y-a.y:a.y-p.y),repeat=o.history.slice(-16).filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y).length;
 let score=rng()*8-repeat*110+(victim?.role==='king'?100000:victim?.role==='guard'&&o.captures.filter(c=>c.side!==o.side&&c.role==='guard').length===2?90000:0);
 if(kind==='rush')score+=p.role==='martyr'?progress*70+danger(a)*30-Math.abs(a.x-3)*2:progress*5;if(kind==='defender')score+=(victim?45:0)-danger(a)*(p.role==='king'?3000:p.role==='guard'&&guards===1?2700:p.role==='guard'?160:-15)+(p.role!=='king'&&distance(a,king)===1?35:0)+(6-Math.abs(a.x-3)-Math.abs(a.y-3))*8;
 if(p.role==='king'){score-=danger(a)*5000;if(o.ritual?.[o.side].phase==='open')score+=(inAltar(a)?1400:0)+(Math.abs(p.x-3)+Math.abs(p.y-3)-Math.abs(a.x-3)-Math.abs(a.y-3))*120;}
 if(a.kind==='charge')score-=100;if(a.kind==='execute')score-=80;return{a,score};}).sort((a,b)=>b.score-a.score)[0].a;
}
export async function run(config:Config,workerURL:string){
 let g=createGame(config.mode);const omni:Side=config.reverse?'blue':'red',rngs={red:random(config.seed+(omni==='red'?11:29)),blue:random(config.seed+(omni==='blue'?11:29))};
 for(const side of ['red','blue'] as Side[]){const row=deploy(side,side===omni?'omniscient':'master',rngs[side]);let i=0;g.pieces=g.pieces.map(p=>p.side===side?{...p,x:row[i++]}:p);}g=startGame(g);
 const history:PublicAction[]=[],moves:unknown[]=[],timing:{level:string;elapsed:number;nodes:number;depth?:number}[]=[],worker=new Worker(workerURL,{type:'module'});let id=0,beats=0;const ticker=setInterval(()=>beats++,30);
 try{while(!g.result&&g.ply<240){const side=g.turn,level=side===omni?'omniscient':config.baseline,o=observe(g,side,history,level==='omniscient'?'omniscient':undefined),seed=Math.floor(rngs[side]()*0xffffffff);let a:Action|null;
  if(level==='rush'||level==='defender')a=baseline(o,level,rngs[side]);else{const d:any=await new Promise((resolve,reject)=>{const token=++id,limit=setTimeout(()=>reject(Error('Worker exceeded 8-second deadline')),8000);worker.onmessage=e=>{if(e.data.id!==token||e.data.fallback)return;clearTimeout(limit);e.data.error?reject(Error(e.data.error)):resolve(e.data.decision);};worker.onerror=e=>{clearTimeout(limit);reject(Error(e.message));};worker.postMessage({id:token,observation:o,difficulty:level,seed});});a=d.action;timing.push({level,elapsed:d.elapsed,nodes:d.nodes,depth:d.diagnostics?.depth});}
  if(!a)throw Error(`No legal choice at ${g.ply}`);const next=act(g,a);if(next===g)throw Error(`Illegal ${JSON.stringify(a)}`);const actor=g.pieces.find(p=>p.id===a!.id)!,end=next.pieces.find(p=>p.id===a!.id)!,caps=next.captures.slice(g.captures.length);history.push({id:a.id,side,from:{x:actor.x,y:actor.y},to:{x:end.x,y:end.y},...(a.kind?{kind:a.kind}:{}),...(caps.length?{captured:caps.at(-1)!.role}:{})});moves.push({ply:g.ply,action:a,captured:caps,events:next.events?.slice(g.events?.length??0)});g=next;
 }
 return{...config,omniscientSide:omni,result:g.result,plies:g.ply,truncated:!g.result,illegal:0,timing,beats,moves,final:g};
 }finally{clearInterval(ticker);worker.terminate();}
}
