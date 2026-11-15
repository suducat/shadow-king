import {CONFIG,coord,other,type Game,type Side,type Piece,type VisiblePiece,type Role} from './game';
export type GameMode='classic'|'ritual';
export type GameAction={id:string;x:number;y:number;kind?:'move'|'charge'|'execute'};
export type RiteState={phase:'dormant'|'open'|'occupied'|'completed';openedPly?:number;occupiedPly?:number};
export type Rites=Record<Side,RiteState>;
export type RuleEvent={kind:'charge'|'abandon'|'execute'|'charged-captured'|'rite-open'|'occupy'|'rite-complete';side:Side;id:string;ply:number;kills?:number};
export type ActionStep={x:number;y:number;victimId?:string};
export type ResolvedAction={kind:'move'|'charge'|'execute';id:string;side:Side;from:{x:number;y:number};steps:ActionStep[];ply:number};
export const RITUAL_RULES={id:'shadow-king-rite-v2',size:7,quietFullRounds:30,repetition:3,roles:{king:1,guard:3,martyr:3},executionPerGuard:1,executionRange:2,executionDistance:'full-forward-path',executionAllyBlock:'entire-action'} as const;
export const modeOf=(g:Pick<Game,'mode'>):GameMode=>g.mode??'classic';
export const forward=(side:Side)=>side==='red'?-1:1;
export const inAltar=(p:{x:number;y:number})=>p.x>=2&&p.x<=4&&p.y>=2&&p.y<=4;
export const emptyRites=():Rites=>({red:{phase:'dormant'},blue:{phase:'dormant'}});
type ActionState={pieces:VisiblePiece[];turn:Side;ply:number;ended:boolean};
export function executionPath(state:Pick<ActionState,'pieces'>,id:string):ActionStep[]{
 const p=state.pieces.find(p=>p.id===id);if(!p||p.role!=='guard'||p.executionUsed||!p.charging)return[];
 const steps:ActionStep[]=[];
 for(let n=1;n<=2;n++){const y=p.y+forward(p.side)*n;if(y<0||y>=7)break;const victim=state.pieces.find(q=>q.x===p.x&&q.y===y);if(victim?.side===p.side)return[];steps.push({x:p.x,y,...(victim?{victimId:victim.id}:{})});}
 return steps;
}
export function ritualActions(state:ActionState):GameAction[]{
 if(state.ended)return[];const all:GameAction[]=[];
 for(const p of state.pieces.filter(p=>p.side===state.turn)){
  const moves=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({id:p.id,x:p.x+dx,y:p.y+dy})).filter(a=>a.x>=0&&a.x<7&&a.y>=0&&a.y<7&&!state.pieces.some(q=>q.side===p.side&&q.x===a.x&&q.y===a.y));
  all.push(...moves);
  if(p.role==='guard'&&!p.executionUsed){
   if(!p.charging)all.push(...[{id:p.id,x:p.x,y:p.y},...moves].map(a=>({...a,kind:'charge' as const})));
   else if(p.charging.readyPly<=state.ply){const target=executionPath(state,p.id).at(-1);if(target)all.push({id:p.id,x:target.x,y:target.y,kind:'execute'});};
  }
 }
 return all;
}
export function ritualKey(g:Game):string{
 const pieces=g.pieces.map(p=>`${p.id}/${p.side}/${p.role}/${p.x}/${p.y}/${+!!p.revealed}/${+!!p.executionUsed}/${p.charging?(p.charging.readyPly<=g.ply?'ready':'waiting'):'-'}`).sort().join('|');
 const rites=g.ritual??emptyRites();return `ritual:${g.turn}:${pieces}:${rites.red.phase}/${rites.blue.phase}`;
}
export function resolveRitual(g:Game,a:GameAction,simulation=false):Game{
 if(modeOf(g)!=='ritual'||!simulation&&!ritualActions({pieces:g.pieces,turn:g.turn,ply:g.ply,ended:!!g.result}).some(m=>m.id===a.id&&m.x===a.x&&m.y===a.y&&(m.kind??'move')===(a.kind??'move')))return g;
 const original=g.pieces.find(p=>p.id===a.id)!,side=original.side,ply=g.ply+1,kind=a.kind??'move';
 const rites:Rites={red:{...(g.ritual?.red??{phase:'dormant'})},blue:{...(g.ritual?.blue??{phase:'dormant'})}};
 const events:RuleEvent[]=[],captures=[...g.captures];let pieces=g.pieces.map(p=>({...p})),result:Game['result']=null;
 // A charge lasts ONLY until this side's next action. Every abandoned guard
 // keeps its public identity and its independent, still-unused skill token.
 pieces=pieces.map(p=>{if(p.side===side&&p.charging&&p.charging.readyPly<=g.ply){if(!(p.id===a.id&&kind==='execute'))events.push({kind:'abandon',side,id:p.id,ply});const{charging,...rest}=p;return rest;}return p;});
 if(kind==='charge')pieces=pieces.map(p=>p.id===a.id?{...p,revealed:true,executionUsed:false,charging:{readyPly:g.ply+2}}:p);
 if(kind==='execute')pieces=pieces.map(p=>p.id===a.id?{...p,revealed:true,executionUsed:true}:p);
 let path:ActionStep[]=kind==='execute'?executionPath({pieces:g.pieces},a.id):[{x:a.x,y:a.y}];
 const steps:ActionStep[]=[];
 for(const at of path){
  const victim=pieces.find(p=>p.side!==side&&p.x===at.x&&p.y===at.y);
  if(victim){
   captures.push({side:victim.side,role:victim.role,by:side,ply,at:coord(at.x,at.y),id:victim.id,execution:kind==='execute',charged:!!victim.charging});
   if(victim.charging)events.push({kind:'charged-captured',side:victim.side,id:victim.id,ply});
   pieces=pieces.filter(p=>p.id!==victim.id);
  }
  pieces=pieces.map(p=>p.id===a.id?{...p,x:at.x,y:at.y}:p);steps.push({...at,...(victim?{victimId:victim.id}:{})});
  if(victim){
   if(victim.role==='king')result={winner:side,reason:'king'};
   else if(victim.role==='guard'&&!pieces.some(p=>p.side===victim.side&&p.role==='guard'))result={winner:side,reason:'guard'};
   else if(victim.role==='martyr'&&!pieces.some(p=>p.side===victim.side&&p.role==='martyr')&&rites[victim.side].phase==='dormant'){
    rites[victim.side]={phase:'open',openedPly:ply};
    pieces=pieces.map(p=>p.side===victim.side&&p.role==='king'?{...p,revealed:true}:p);
    const king=pieces.find(p=>p.side===victim.side&&p.role==='king');if(king)events.push({kind:'rite-open',side:victim.side,id:king.id,ply});
   }
  }
  if(result)break; // No animation, movement or capture beyond a terminal step.
 }
 if(kind==='charge')events.push({kind:'charge',side,id:a.id,ply});
 if(kind==='execute')events.push({kind:'execute',side,id:a.id,ply,kills:captures.length-g.captures.length});
 // Captures win first. Then finish the previously established opponent's
 // defense window, before this action can establish a competing occupation.
 if(!result){
  const candidate=other(side),rite=rites[candidate],king=pieces.find(p=>p.side===candidate&&p.role==='king');
  if(rite.phase==='occupied'&&ply>(rite.occupiedPly??Infinity)){
   if(king&&inAltar(king)){rite.phase='completed';result={winner:candidate,reason:'ritual'};events.push({kind:'rite-complete',side:candidate,id:king.id,ply});}
   else{rite.phase='open';delete rite.occupiedPly;}
  }
 }
 if(!result){
  const rite=rites[side],king=pieces.find(p=>p.side===side&&p.role==='king');
  if(rite.phase==='open'&&ply>(rite.openedPly??Infinity)&&king&&inAltar(king)){rite.phase='occupied';rite.occupiedPly=ply;events.push({kind:'occupy',side,id:king.id,ply});}
 }
 const next:Game={...g,pieces,captures,turn:other(side),ply,quiet:captures.length>g.captures.length?0:g.quiet+1,result,ritual:rites,
  events:simulation?[]:[...(g.events??[]),...events],lastAction:{kind,id:a.id,side,from:{x:original.x,y:original.y},steps,ply},seen:simulation?{}:{...g.seen}};
 if(!simulation){const key=ritualKey(next);next.seen[key]=(next.seen[key]??0)+1;if(!next.result&&next.seen[key]>=CONFIG.repetition)next.result={winner:null,reason:'repetition'};}
 if(!next.result){
  if(next.quiet>=CONFIG.quietFullRounds*2)next.result={winner:null,reason:'quiet'};
  else if(!ritualActions({pieces:next.pieces,turn:next.turn,ply:next.ply,ended:false}).length)next.result={winner:null,reason:'blocked'};
 }
 return next;
}
