import fs from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {createGame,startGame,act,allActions,other,type Side,type Game,type Role} from '../src/game';
import {decide,observe,random,deploy,type Difficulty,type PublicAction,type Observation} from '../src/ai';
import {decide as oldDecide,deploy as oldDeploy} from '../tests/baselines/v04-ai';
import {executionPath,inAltar,type GameMode,type GameAction} from '../src/ritual';
type Version='old'|'new'|'rush';
type Agent={version:Version;level:Difficulty;seed:number};
type Config={group:string;mode:GameMode;seed:number;reverse:boolean;red:Agent;blue:Agent};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function rush(o:Observation,seed:number,level:Difficulty):GameAction|null{
 const forward=(y:number)=>o.side==='red'?6-y:y,legal=allActions({pieces:o.pieces as Game['pieces'],turn:o.turn,ply:o.ply,quiet:o.quiet,seen:{},result:null,captures:o.captures,...(o.ritual?{mode:'ritual',ritual:o.ritual}:{})}).filter(a=>!a.kind);
 const martyrs=o.pieces.filter(p=>p.side===o.side&&p.role==='martyr'),king=o.pieces.find(p=>p.side===o.side&&p.role==='king')!;
 if(martyrs.filter(p=>forward(p.y)>=2).length>=2&&o.ply%8===0&&!inAltar(king)){
  const escort=legal.filter(a=>a.id===king.id&&!o.pieces.some(p=>p.side!==o.side&&distance(a,p)===1)).sort((a,b)=>(Math.abs(a.x-3)+Math.abs(a.y-3))-(Math.abs(b.x-3)+Math.abs(b.y-3)))[0];if(escort)return escort;
 }
 const moves=legal.filter(a=>martyrs.some(p=>p.id===a.id&&forward(a.y)>=forward(p.y))).map(a=>{const p=martyrs.find(p=>p.id===a.id)!;return{a,score:(forward(a.y)-forward(p.y))*30-forward(p.y)*7+o.pieces.filter(q=>q.side!==o.side&&distance(a,q)===1).length*6-o.history.slice(-10).filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y).length*80};}).sort((a,b)=>b.score-a.score);
 return moves[0]?.a??oldDecide(o as never,level,{seed,maxMillis:Infinity}).action;
}
export function runArenaMatch(config:Config){
 const agents={red:config.red,blue:config.blue},rngs={red:random(config.red.seed),blue:random(config.blue.seed)};let g=createGame(config.mode);
 for(const side of ['red','blue'] as Side[]){const agent=agents[side];if(process.env.FIXED_LAYOUT){const columns=[1,0,2,4,3,5,6];let i=0;g.pieces=g.pieces.map(p=>p.side===side?{...p,x:side==='red'?columns[i++]:6-columns[i++]}:p);continue;}if(agent.version==='rush'){const xs:Record<Role,number[]>={king:[2],guard:[1,4,5],martyr:[0,3,6]};g.pieces=g.pieces.map(p=>p.side===side?{...p,x:side==='red'?xs[p.role].shift()!:6-xs[p.role].shift()!}:p);}else{const columns=(process.env.PRODUCT_DEPLOY&&agent.version==='new'?deploy:oldDeploy)(side,process.env.COMMON_LAYOUT?'normal':agent.level,rngs[side]);let i=0;g.pieces=g.pieces.map(p=>p.side===side?{...p,x:columns[i++]}:p);}}
 g=startGame(g);const history:PublicAction[]=[],think:Record<Version,number[]>={old:[],new:[],rush:[]};
 const metrics={charges:0,remoteCharges:0,executions:0,executionKills:0,kingCaptures:0,riteOpens:0,chargesBy:{old:0,new:0,rush:0},remoteBy:{old:0,new:0,rush:0},kingCapturesBy:{old:0,new:0,rush:0}};let illegal=0;
 while(!g.result&&g.ply<400){const side=g.turn,agent=agents[side],o=observe(g,side,history),seed=Math.floor(rngs[side]()*0xffffffff),start=performance.now();
  const a=agent.version==='rush'?rush(o,seed,agent.level):(agent.version==='new'?decide(o,agent.level,{seed,maxMillis:Infinity}):oldDecide(o as never,agent.level,{seed,maxMillis:Infinity})).action;
  think[agent.version].push(performance.now()-start);if(!a){illegal++;break;}const next=act(g,a);if(next===g){illegal++;break;}
  const actor=g.pieces.find(p=>p.id===a.id)!,caps=next.captures.slice(g.captures.length),events=(next.events??[]).slice(g.events?.length??0);
  if(a.kind==='charge'){
   metrics.charges++;metrics.chargesBy[agent.version]++;const p=next.pieces.find(p=>p.id===a.id)!,path=executionPath(next,p.id),opponents=o.pieces.filter(p=>p.side!==side);
   // Public, fixed diagnostic proxy, never a hard prohibition in the policy.
   const remote=!path.some(inAltar)&&path.every(t=>opponents.every(q=>distance(t,q)>=3));if(remote){metrics.remoteCharges++;metrics.remoteBy[agent.version]++;}
  }
  if(a.kind==='execute'){metrics.executions++;metrics.executionKills+=caps.length;}
  if(actor.role==='king'&&caps.length){metrics.kingCaptures+=caps.length;metrics.kingCapturesBy[agent.version]+=caps.length;}
  metrics.riteOpens+=events.filter(e=>e.kind==='rite-open').length;
  const target=next.pieces.find(p=>p.id===actor.id)!;history.push({id:actor.id,side,from:{x:actor.x,y:actor.y},to:{x:target.x,y:target.y},...(caps.length?{captured:caps.at(-1)!.role}:{}),...(a.kind?{kind:a.kind}:{})});g=next;
 }
 return{...config,result:g.result,plies:g.ply,captures:g.captures.length,truncated:!g.result,illegal,...metrics,think};
}
export function arenaSummary(records:ReturnType<typeof runArenaMatch>[]){
 const games=records.length,sum=(key:'plies'|'captures'|'charges'|'remoteCharges'|'executions'|'executionKills'|'kingCaptures'|'riteOpens')=>records.reduce((n,r)=>n+r[key],0);
 const wins=(v:Version)=>records.filter(r=>r.result?.winner&&r[r.result.winner].version===v).length;
 const reason=(s:string)=>records.filter(r=>r.result?.reason===s).length;
 const timing=Object.fromEntries((['old','new','rush'] as Version[]).map(v=>{const times=records.flatMap(r=>r.think[v]).sort((a,b)=>a-b);return[v,{actions:times.length,meanMs:times.reduce((a,b)=>a+b,0)/(times.length||1),p95Ms:times[Math.max(0,Math.ceil(times.length*.95)-1)]??0,p99Ms:times[Math.max(0,Math.ceil(times.length*.99)-1)]??0}];}));
 return{games,newWins:wins('new'),oldWins:wins('old'),rushWins:wins('rush'),firstWins:records.filter(r=>r.result?.winner==='red').length,secondWins:records.filter(r=>r.result?.winner==='blue').length,draws:records.filter(r=>r.result&&r.result.winner===null).length,truncated:records.filter(r=>r.truncated).length,illegal:records.reduce((n,r)=>n+r.illegal,0),averagePlies:sum('plies')/games,averageFullTurns:sum('plies')/games/2,averageCaptures:sum('captures')/games,victories:{king:reason('king'),purge:reason('guard'),ritual:reason('ritual'),classicSacrifice:reason('martyr')},riteOpens:sum('riteOpens'),riteOpenedGames:records.filter(r=>r.riteOpens>0).length,riteCompleted:reason('ritual'),charges:sum('charges'),remoteCharges:sum('remoteCharges'),executions:sum('executions'),executionKills:sum('executionKills'),kingCaptures:sum('kingCaptures'),byVersion:Object.fromEntries((['old','new','rush'] as Version[]).map(v=>[v,{charges:records.reduce((n,r)=>n+r.chargesBy[v],0),remoteCharges:records.reduce((n,r)=>n+r.remoteBy[v],0),kingCaptures:records.reduce((n,r)=>n+r.kingCapturesBy[v],0)}])),timing};
}
export async function runArena(){
 const configs:Config[]=[],seeds=Number(process.env.SEEDS??6);
 const pair=(group:string,mode:GameMode,level:Difficulty,a:Version,b:Version,n=seeds)=>{for(let seed=0;seed<n;seed++)for(const reverse of[false,true]){const A={version:a,level,seed:907+seed*2},B={version:b,level,seed:908+seed*2};configs.push({group,mode,seed,reverse,red:reverse?B:A,blue:reverse?A:B});}};
 for(const mode of ['classic','ritual'] as GameMode[])for(const level of ['hard','master'] as Difficulty[]){pair(`${mode}-${level}-old-new`,mode,level,'old','new');pair(`${mode}-${level}-new-self`,mode,level,'new','new',Math.min(seeds,4));pair(`${mode}-${level}-rush-new`,mode,level,'rush','new');pair(`${mode}-${level}-rush-old`,mode,level,'rush','old');}
 for(const mode of ['classic','ritual'] as GameMode[])for(const[low,high]of [['easy','normal'],['normal','hard'],['hard','master']] as [Difficulty,Difficulty][]){for(let seed=0;seed<Math.min(seeds,4);seed++)for(const reverse of[false,true]){const A={version:'new' as const,level:low,seed:1201+seed*2},B={version:'new' as const,level:high,seed:1202+seed*2};configs.push({group:`${mode}-tiers-${low}-${high}`,mode,seed,reverse,red:reverse?B:A,blue:reverse?A:B});}}
 const selected=process.env.GROUP?configs.filter(c=>c.group.includes(process.env.GROUP!)):configs,records:ReturnType<typeof runArenaMatch>[]=[],began=performance.now();fs.mkdirSync('artifacts',{recursive:true});const file=`artifacts/v05-arena${process.env.TAG?'-'+process.env.TAG:''}.json`;
 for(const c of selected){const row=runArenaMatch(c);records.push(row);const groups=Object.fromEntries([...new Set(records.map(r=>r.group))].map(g=>[g,arenaSummary(records.filter(r=>r.group===g))]));
  fs.writeFileSync(file,JSON.stringify({sourceFingerprint:createHash('sha256').update(['src/ai.ts','src/belief.ts','src/strategy-eval.ts','src/strategic-ai.ts'].map(f=>fs.readFileSync(f,'utf8')).join('\n')).digest('hex'),generatedAt:new Date().toISOString(),planned:selected.length,completed:records.length,elapsedMs:performance.now()-began,search:'production default node caps; fixed seeds with wall-clock cutoff disabled for reproducibility; timing is measured wall time of this experiment',baseline:process.env.FIXED_LAYOUT?'identical fixed canonical layout, mirrored by side, to isolate search tier':process.env.PRODUCT_DEPLOY?'production deployment for new AI, frozen V0.4 deployment for old AI':process.env.COMMON_LAYOUT?'same normal deployment for all tiers':'frozen V0.4 AI, unchanged V0.4 rules; same baseline deployments for both policies',summary:arenaSummary(records),groups,records},null,2));console.log(JSON.stringify({done:records.length,total:selected.length,group:c.group,result:row.result,plies:row.plies,elapsedSeconds:Math.round((performance.now()-began)/1000)}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runArena();
