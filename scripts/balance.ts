import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {createGame,startGame,act,allActions,other,viewFor,type Game,type Side,type Role} from '../src/game';
import {decide,observe,deploy,random,legalActions,type Observation,type Difficulty,type PublicAction} from '../src/ai';
import {executionPath,inAltar,type GameMode,type GameAction} from '../src/ritual';
type Strategy='balanced'|'purge'|'rush'|'escorted-rush'|'no-skills';
type Agent={level:Difficulty;strategy:Strategy;seed:number};
export type Match={group:string;mode:GameMode;seed:number;reverse:boolean;red:Agent;blue:Agent};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function spreadDeploy(g:Game,side:Side):Game{
 const columns:Record<Role,number[]>={king:[2],guard:[1,4,5],martyr:[0,3,6]};
 return{...g,pieces:g.pieces.map(p=>p.side===side?{...p,x:side==='red'?columns[p.role].shift()!:6-columns[p.role].shift()!}:p)};
}
export function spreadAction(o:Observation,history:PublicAction[],agent:Agent,seed:number,chargePrior?:'initial'|'threat'):GameAction|null{
 // The policy sees EXACTLY the same redacted observation as the search AI.
 const side=o.side,legal=legalActions(o).filter(a=>!a.kind),martyrs=o.pieces.filter(p=>p.side===side&&p.role==='martyr'),king=o.pieces.find(p=>p.side===side&&p.role==='king')!;
 const progress=(y:number)=>side==='red'?6-y:y;
 const forwardMoves=legal.filter(a=>martyrs.some(p=>p.id===a.id&&progress(a.y)>progress(p.y)));
 if(agent.strategy==='escorted-rush'&&martyrs.filter(p=>progress(p.y)>=2).length>=2&&o.ply%8===0&&!inAltar(king)){
  const escort=legal.filter(a=>a.id===king.id&&!o.pieces.some(p=>p.side!==side&&distance(a,p)===1)).sort((a,b)=>(Math.abs(a.x-3)+Math.abs(a.y-3))-(Math.abs(b.x-3)+Math.abs(b.y-3)))[0];
  if(escort)return escort;
 }
 const pool=forwardMoves.length?forwardMoves:legal.filter(a=>martyrs.some(p=>p.id===a.id&&progress(a.y)>=progress(p.y)));
 if(pool.length){
  const order=pool.map(a=>{const p=martyrs.find(p=>p.id===a.id)!,enemies=o.pieces.filter(p=>p.side!==side);const targets=[0,3,6],lane=targets.reduce((best,x)=>Math.abs(x-p.x)<Math.abs(best-p.x)?x:best,0);
   const repeats=history.slice(-10).filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y).length;
   return{a,v:(progress(a.y)-progress(p.y))*30-progress(p.y)*7-Math.abs(a.x-lane)*5+enemies.filter(p=>distance(p,a)===1).length*6-repeats*80};}).sort((a,b)=>b.v-a.v);return order[0].a;
 }
 return decide(o,agent.level,{seed,maxMillis:Infinity,chargePrior}).action;
}
export function runMatch(config:Match){
 const agents={red:config.red,blue:config.blue},rngs={red:random(config.red.seed),blue:random(config.blue.seed)};let g=createGame(config.mode);
 for(const side of ['red','blue'] as Side[]){const a=agents[side];if(a.strategy.includes('rush'))g=spreadDeploy(g,side);else{const xs=deploy(side,a.level,rngs[side]);let i=0;g={...g,pieces:g.pieces.map(p=>p.side===side?{...p,x:xs[i++]}:p)};}}g=startGame(g);
 const history:PublicAction[]=[];let illegal=0,charges=0,executions=0,executionKills=0,chargedLosses=0,closedEpisodes=0,riteOpens=0,guardCaptures=0,hiddenGuardCaptures=0,guardTurns=0,hiddenGuardTurns=0,publicGuardCaptureTurns=0,publicGuardCaptureChosen=0,guardPursuitSkippedForRoyalSafety=0,guardPursuitSkippedForRiteDefense=0,captureAvailableTurns=0,capturesDeclined=0,guardExecutionThreats=0,guardThreatResponses=0,riteDefenseRegicides=0,maxThink=0;
 const episodes=new Set<string>();
 for(let turn=0;!g.result&&turn<400;turn++){
  const side=g.turn,agent=agents[side],before=g,publicPieces=viewFor(g,side),legal=allActions(g),visibleGuards=publicPieces.filter(p=>p.side!==side&&p.role==='guard');
  const victims=(a:GameAction)=>a.kind==='execute'?executionPath({pieces:publicPieces},a.id).filter(p=>Math.abs(p.y-g.pieces.find(q=>q.id===a.id)!.y)<=Math.abs(a.y-g.pieces.find(q=>q.id===a.id)!.y)).flatMap(p=>publicPieces.filter(q=>q.side!==side&&q.x===p.x&&q.y===p.y)):publicPieces.filter(p=>p.side!==side&&p.x===a.x&&p.y===a.y);
  const hunt=legal.some(a=>victims(a).some(p=>visibleGuards.some(q=>q.id===p.id))),canCapture=legal.some(a=>victims(a).length);
  if(hunt)publicGuardCaptureTurns++;if(canCapture)captureAvailableTurns++;
  for(const p of g.pieces.filter(p=>p.role==='guard')){guardTurns++;if(!p.revealed)hiddenGuardTurns++;}
  // Omniscient DIAGNOSTIC only: not passed to either decision policy.
  const threats=g.pieces.filter(p=>p.side!==side&&p.charging).flatMap(charger=>executionPath(g,charger.id).flatMap(at=>g.pieces.filter(p=>p.side===side&&p.role==='guard'&&p.x===at.x&&p.y===at.y).map(target=>({charger:charger.id,target:target.id}))));guardExecutionThreats+=threats.length;
  const seed=Math.floor(rngs[side]()*0xffffffff),began=performance.now();let action:GameAction|null;
  if(agent.strategy.includes('rush'))action=spreadAction(observe(g,side,history),history,agent,seed,process.env.CHARGE_PRIOR==='initial'?'initial':process.env.CHARGE_PRIOR==='threat'?'threat':undefined);
  else action=decide(observe(g,side,history),agent.level,{seed,maxMillis:process.env.TIMED?undefined:Infinity,style:agent.strategy==='purge'?'purge':'balanced',disableExecution:agent.strategy==='no-skills',chargePrior:process.env.CHARGE_PRIOR==='initial'?'initial':process.env.CHARGE_PRIOR==='threat'?'threat':undefined}).action;
  maxThink=Math.max(maxThink,performance.now()-began);
  if(!action){illegal++;break;}const next=act(g,action);if(next===g){illegal++;break;}
  const actor=g.pieces.find(p=>p.id===action!.id)!,caps=next.captures.slice(g.captures.length),newEvents=(next.events??[]).slice(g.events?.length??0);
  if(hunt&&caps.some(c=>visibleGuards.some(p=>p.id===c.id)))publicGuardCaptureChosen++;
  else if(hunt){const king=g.pieces.find(p=>p.side===side&&p.role==='king')!;if(publicPieces.some(p=>p.side!==side&&distance(p,king)===1))guardPursuitSkippedForRoyalSafety++;if(g.ritual?.[other(side)].phase==='occupied')guardPursuitSkippedForRiteDefense++;}
  if(canCapture&&!caps.length)capturesDeclined++;
  for(const c of caps)if(c.role==='guard'){guardCaptures++;if(!g.pieces.find(p=>p.id===c.id)?.revealed)hiddenGuardCaptures++;}
  if(g.ritual?.[other(side)].phase==='occupied'&&next.result?.reason==='king'&&next.result.winner===side)riteDefenseRegicides++;
  for(const threat of threats){const charger=next.pieces.find(p=>p.id===threat.charger),target=next.pieces.find(p=>p.id===threat.target);if(target&&(!charger||!executionPath(next,charger.id).some(at=>at.x===target.x&&at.y===target.y)))guardThreatResponses++;}
  for(const e of newEvents){
   if(e.kind==='charge'){charges++;episodes.add(e.id);}
   if(e.kind==='execute'){executions++;executionKills+=e.kills??0;}
   if(e.kind==='charged-captured')chargedLosses++;
   if(['execute','abandon','charged-captured'].includes(e.kind)&&episodes.delete(e.id))closedEpisodes++;
   if(e.kind==='rite-open')riteOpens++;
  }
  const target=next.pieces.find(p=>p.id===actor.id)!;history.push({id:actor.id,side,from:{x:actor.x,y:actor.y},to:{x:target.x,y:target.y},...(caps.length?{captured:caps.at(-1)!.role}:{}),...(action.kind?{kind:action.kind}:{})});g=next;
 }
 return{...config,result:g.result,plies:g.ply,captures:g.captures.length,illegal,truncated:!g.result,charges,executions,executionKills,chargedLosses,closedEpisodes,censoredEpisodes:episodes.size,riteOpens,guardCaptures,hiddenGuardCaptures,guardTurns,hiddenGuardTurns,publicGuardCaptureTurns,publicGuardCaptureChosen,guardPursuitSkippedForRoyalSafety,guardPursuitSkippedForRiteDefense,captureAvailableTurns,capturesDeclined,guardExecutionThreats,guardThreatResponses,riteDefenseRegicides,maxThink};
}
export function summarize(records:ReturnType<typeof runMatch>[]){
 const sum=(key:keyof typeof records[number])=>records.reduce((n,r)=>n+Number(r[key]),0),count=(reason:string)=>records.filter(r=>r.result?.reason===reason).length,den=records.length,opens=sum('riteOpens'),charges=sum('charges'),exec=sum('executions'),closed=sum('closedEpisodes');
 return{games:den,victories:{king:count('king'),purge:count('guard'),rite:count('ritual'),classicSacrifice:count('martyr')},redWins:records.filter(r=>r.result?.winner==='red').length,blueWins:records.filter(r=>r.result?.winner==='blue').length,draws:records.filter(r=>r.result&&r.result.winner===null).length,truncated:records.filter(r=>r.truncated).length,illegal:sum('illegal'),averagePlies:sum('plies')/den,averageCaptures:sum('captures')/den,riteOpenedGames:records.filter(r=>r.riteOpens>0).length,riteOpens:opens,riteOpenRate:records.filter(r=>r.riteOpens>0).length/den,riteSuccessPerOpening:opens?count('ritual')/opens:null,charges,executions:exec,executionsPerGame:exec/den,executionKills:sum('executionKills'),executionKillsPerRelease:exec?sum('executionKills')/exec:null,chargedLosses:sum('chargedLosses'),resolvedChargeEpisodes:closed,censoredChargeEpisodes:sum('censoredEpisodes'),chargedCaptureProbability:charges?sum('chargedLosses')/charges:null,guardCaptures:sum('guardCaptures'),hiddenGuardCaptures:sum('hiddenGuardCaptures'),hiddenGuardTurnFraction:sum('guardTurns')?sum('hiddenGuardTurns')/sum('guardTurns'):null,publicGuardCaptureTurns:sum('publicGuardCaptureTurns'),publicGuardCaptureChosen:sum('publicGuardCaptureChosen'),guardPursuitSkippedForRoyalSafety:sum('guardPursuitSkippedForRoyalSafety'),guardPursuitSkippedForRiteDefense:sum('guardPursuitSkippedForRiteDefense'),captureAvailableTurns:sum('captureAvailableTurns'),capturesDeclined:sum('capturesDeclined'),guardExecutionThreats:sum('guardExecutionThreats'),guardThreatResponses:sum('guardThreatResponses'),riteDefenseRegicides:sum('riteDefenseRegicides')};
}
export async function runBalance(){
 const configs:Match[]=[],seeds=Number(process.env.SEEDS??6),levels:Difficulty[]=['easy','normal','hard','master'];
 const pair=(group:string,mode:GameMode,level:Difficulty,a:Strategy,b:Strategy,n=seeds)=>{for(let seed=0;seed<n;seed++)for(const reverse of[false,true]){const A={level,strategy:a,seed:101+seed*2},B={level,strategy:b,seed:102+seed*2};configs.push({group,mode,seed,reverse,red:reverse?B:A,blue:reverse?A:B});}};
 for(const mode of['classic','ritual'] as GameMode[])for(const level of levels)pair(`${mode}-${level}`,mode,level,'balanced','balanced');
 pair('ritual-no-skills','ritual','master','no-skills','no-skills',8);
 pair('ritual-purge-focus','ritual','master','purge','balanced',8);
 for(const mode of['classic','ritual'] as GameMode[])for(const level of['hard','master'] as Difficulty[])for(const strategy of['rush','escorted-rush'] as Strategy[])pair(`${mode}-${level}-${strategy}`,mode,level,strategy,'balanced');
 const filtered=process.env.GROUP?configs.filter(c=>c.group===process.env.GROUP):configs;
 const records:ReturnType<typeof runMatch>[]=[],began=performance.now();fs.mkdirSync('artifacts',{recursive:true});
 for(const config of filtered){records.push(runMatch(config));const groups=Object.fromEntries([...new Set(records.map(r=>r.group))].map(group=>[group,summarize(records.filter(r=>r.group===group))]));
  fs.writeFileSync(`artifacts/rite-balance${process.env.GROUP?'-'+process.env.GROUP:''}${process.env.CHARGE_PRIOR==='initial'?'-initial':''}.json`,JSON.stringify({chargePrior:process.env.CHARGE_PRIOR==='initial'?'initial':process.env.CHARGE_PRIOR==='threat'?'threat':'tiered',generatedAt:new Date().toISOString(),search:process.env.TIMED?'production wall-clock and node budgets':'production node budgets, fixed seeds, wall-clock disabled for reproducibility',completed:records.length,planned:filtered.length,elapsedMs:performance.now()-began,summary:summarize(records),groups,records},null,2));
  if(records.length%4===0)console.log(JSON.stringify({done:records.length,total:filtered.length,group:config.group,last:records.at(-1)?.result,elapsed:Math.round((performance.now()-began)/1000)}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runBalance();
