import {RITUAL_RULES,ritualActions,type GameAction,type Rites} from './ritual';
import {decideStrategic} from './strategic-ai';
import {deployAdaptive} from './ai-deployment';
import {decideOmniscient} from './omniscient-ai';
import {distance} from './strategy-eval';
import { CONFIG, ROLES, other, viewFor, type Game, type Side, type Role, type VisiblePiece, type Capture } from './game';
export type StandardDifficulty='easy'|'normal'|'hard'|'master';
export type Difficulty=StandardDifficulty|'omniscient';
export const AI_BUILD_ID='v0.9.0';
export const OMNISCIENT_NOTICE='全知者能够看见你的全部棋子身份。你仍无法看见它尚未公开的身份。';
export const DIFFICULTIES:Record<Difficulty,{name:string;title:string;label:string;description:string}>={
 easy:{name:'棋侍',title:'初识棋道',label:'简单',description:'基础局面评分与轻量判断，行动直接，适合熟悉规则。'},
 normal:{name:'影谋',title:'藏锋于影',label:'普通',description:'结合公开身份数量与对手回应，兼顾攻防与献祭风险。'},
 hard:{name:'诡相',title:'落子为饵',label:'困难',description:'约束身份推理与多回合前瞻，提前争夺祭台、规划斩杀。'},
 master:{name:'无冕者',title:'执掌命运',label:'大师',description:'核算完整身份后验与祭典回应，权衡不可逆风险与多回合战术。'},
 omniscient:{name:'全知者',title:'帷幕之外',label:'终极挑战',description:'全身份透视与独立深度搜索。在它眼中，没有秘密。'},
};
export const AI_RULES={id:'shadow-king-standard-v1',...CONFIG,roles:{king:1,guard:3,martyr:3}} as const;
export type PublicAction={id:string;side:Side;from:{x:number;y:number};to:{x:number;y:number};captured?:Role;kind?:GameAction['kind']};
// This is the ONLY input accepted by the decision engine/Worker. In particular,
// Private repetition keys only cross with the explicit omniscient grant.
// Ordinary observers and the simulated human policy never receive them.
export type Observation={side:Side;turn:Side;pieces:VisiblePiece[];captures:Capture[];ply:number;quiet:number;ended:boolean;history:PublicAction[];rules:typeof AI_RULES|typeof RITUAL_RULES;ritual?:Rites;knowledge?:'omniscient';repetition?:Record<string,number>};
export function observe(g:Game,side:Side,history:PublicAction[]=[],grant?:'omniscient'):Observation{
 const ritual=g.mode==='ritual';
 const pieces:VisiblePiece[]=g.pieces.map(p=>{
  const known=p.side===side||ritual&&!!p.revealed||grant==='omniscient';
  return {id:p.id,side:p.side,x:p.x,y:p.y,role:known?p.role:'unknown',...(ritual&&p.revealed?{revealed:true}:{}),...(known&&p.executionUsed!==undefined?{executionUsed:p.executionUsed}:{}),...(known&&p.charging?{charging:{readyPly:p.charging.readyPly}}:{})};
 });
 const captures=g.captures.map(c=>({side:c.side,role:c.role,by:c.by,ply:c.ply,at:c.at,...(c.id?{id:c.id}:{}),...(c.execution!==undefined?{execution:c.execution}:{}),...(c.charged!==undefined?{charged:c.charged}:{})}));
 const rite=(s:Side)=>{const r=g.ritual![s];return {phase:r.phase,...(r.openedPly!==undefined?{openedPly:r.openedPly}:{}),...(r.occupiedPly!==undefined?{occupiedPly:r.occupiedPly}:{})};};
 return {side,turn:g.turn,pieces,captures,ply:g.ply,quiet:g.quiet,ended:!!g.result,history:history.map(a=>({id:a.id,side:a.side,from:{x:a.from.x,y:a.from.y},to:{x:a.to.x,y:a.to.y},...(a.captured?{captured:a.captured}:{}),...(a.kind?{kind:a.kind}:{})})),rules:ritual?RITUAL_RULES:AI_RULES,...(ritual?{ritual:{red:rite('red'),blue:rite('blue')}}:{}),...(grant==='omniscient'?{knowledge:'omniscient' as const,repetition:{...g.seen}}:{})};
}
export function sanitizeObservation(o:Observation,allowOmniscience=false):Observation{
 if(![AI_RULES.id,RITUAL_RULES.id].includes(o.rules.id)||o.rules.size!==7)throw new Error('Unsupported AI rules');
 // Re-apply the same allowlist at the Worker/search boundary. Extraneous
 // properties, prototypes and unserialized debug objects never enter nodes.
 return observe({pieces:o.pieces as Game['pieces'],turn:o.turn,ply:o.ply,quiet:o.quiet,captures:o.captures,seen:allowOmniscience&&o.knowledge==='omniscient'?{...o.repetition}:{},result:o.ended?{winner:null,reason:'quiet'}:null,...(o.rules.id===RITUAL_RULES.id?{mode:'ritual',ritual:o.ritual!}:{})},o.side,o.history,allowOmniscience&&o.knowledge==='omniscient'?'omniscient':undefined);
}
export type Action=GameAction;
export function random(seed:number){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function shuffle<T>(items:T[],rng:()=>number){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export const deploy=(side:Side,difficulty:Difficulty,rng:()=>number):number[]=>deployAdaptive(side,difficulty,rng);
export function legalActions(o:Pick<Observation,'pieces'|'turn'|'ended'|'rules'> & {ply?:number}):Action[]{
 if(o.rules.id===RITUAL_RULES.id)return ritualActions({pieces:o.pieces,turn:o.turn,ply:o.ply??0,ended:o.ended});
 if(o.ended)return[];const size=o.rules.size;
 return o.pieces.filter(p=>p.side===o.turn).flatMap(p=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({id:p.id,x:p.x+dx,y:p.y+dy})).filter(a=>a.x>=0&&a.y>=0&&a.x<size&&a.y<size&&!o.pieces.some(q=>q.side===p.side&&q.x===a.x&&q.y===a.y)));
}
const roles:Role[]=['king','guard','martyr'];
export function remaining(o:Observation,side:Side):Record<Role,number>{
 return Object.fromEntries(roles.map(role=>[role,o.rules.roles[role]-o.captures.filter(c=>c.side===side&&c.role===role).length])) as Record<Role,number>;
}
export type SearchOptions={seed?:number;maxMillis?:number;nodeBudget?:number;style?:'balanced'|'purge';disableExecution?:boolean;chargePrior?:'initial'|'threat';onFallback?:(decision:Decision)=>void};
export type Decision={action:Action|null;nodes:number;samples:number;algorithm:string;elapsed:number;diagnostics?:{depth:number;rounds:number;worlds:number;entropy:number;style:number;inferenceStates?:number}};
function decideAttendant(o:Observation,options:SearchOptions):Decision{
 const start=performance.now(),rng=random(options.seed??1);
 const legal=o.turn===o.side?legalActions(o).filter(a=>!options.disableExecution||!a.kind):[];
 const own=o.pieces.filter(p=>p.side===o.side),foes=o.pieces.filter(p=>p.side!==o.side);
 const lastMartyr=remaining(o,other(o.side)).martyr===1;
 const moves=legal.map(a=>{
  const mover=own.find(p=>p.id===a.id)!;
  const target=foes.find(p=>p.x===a.x&&p.y===a.y);
  const threatened=foes.some(p=>distance(p,a)===1);
  let weight=target?4:1.5;
  if(target?.role==='king')weight=20;
  if(target?.role==='martyr'&&lastMartyr&&o.rules.id===AI_RULES.id)weight=.15;
  if(mover.role==='king')weight*=threatened?.25:1;
  if(a.kind==='charge')weight*=.3;
  return {a,weight};
 });
 let pick=rng()*moves.reduce((sum,m)=>sum+m.weight,0);
 const choice=moves.find(m=>(pick-=m.weight)<=0)?.a??moves.at(-1)?.a??null;
 return {action:choice,nodes:0,samples:0,algorithm:'weighted legal moves with public cues',elapsed:performance.now()-start};
}
export function decide(o:Observation,difficulty:Difficulty,options:SearchOptions={}):Decision{
 if(![AI_RULES.id,RITUAL_RULES.id].includes(o.rules.id)||o.rules.size!==7)throw new Error('Unsupported AI rules');
 if(difficulty==='omniscient'){
  if(o.knowledge!=='omniscient'||o.pieces.some(p=>p.role==='unknown'))throw new Error('全知挑战需要显式授予完整身份观察');
  return decideOmniscient(sanitizeObservation(o,true),options);
 }
 const clean=sanitizeObservation(o);
 return difficulty==='easy'?decideAttendant(clean,options):decideStrategic(clean,difficulty,options);
}
