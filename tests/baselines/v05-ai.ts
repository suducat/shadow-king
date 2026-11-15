import {RITUAL_RULES,ritualActions,type GameAction,type Rites} from '../../src/ritual';
import {decideStrategic} from './v05-strategic-ai';
import {deployAdaptive} from '../../src/ai-deployment';
import { CONFIG, ROLES, other, viewFor, type Game, type Side, type Role, type VisiblePiece, type Capture } from '../../src/game';
export type Difficulty='easy'|'normal'|'hard'|'master';
export const DIFFICULTIES:Record<Difficulty,{name:string;title:string;label:string;description:string}>={
 easy:{name:'棋侍',title:'初识棋道',label:'简单',description:'基础局面评分与轻量判断，行动直接，适合熟悉规则。'},
 normal:{name:'影谋',title:'藏锋于影',label:'普通',description:'结合公开身份数量与对手回应，兼顾攻防与献祭风险。'},
 hard:{name:'诡相',title:'落子为饵',label:'困难',description:'约束身份推理与多回合前瞻，提前争夺祭台、规划斩杀。'},
 master:{name:'无冕者',title:'执掌命运',label:'大师',description:'用联合身份样本核算终局风险，谋划祭台封锁与多回合战术。'},
};
export const AI_RULES={id:'shadow-king-standard-v1',...CONFIG,roles:{king:1,guard:3,martyr:3}} as const;
export type PublicAction={id:string;side:Side;from:{x:number;y:number};to:{x:number;y:number};captured?:Role;kind?:GameAction['kind']};
// This is the ONLY input accepted by the decision engine/Worker. In particular,
// Game.seen contains hidden roles and must never cross this boundary.
export type Observation={side:Side;turn:Side;pieces:VisiblePiece[];captures:Capture[];ply:number;quiet:number;ended:boolean;history:PublicAction[];rules:typeof AI_RULES|typeof RITUAL_RULES;ritual?:Rites};
export function observe(g:Game,side:Side,history:PublicAction[]=[]):Observation{
 const ritual=g.mode==='ritual';
 const pieces:VisiblePiece[]=g.pieces.map(p=>{
  const known=p.side===side||ritual&&!!p.revealed;
  return {id:p.id,side:p.side,x:p.x,y:p.y,role:known?p.role:'unknown',...(ritual&&p.revealed?{revealed:true}:{}),...(known&&p.executionUsed!==undefined?{executionUsed:p.executionUsed}:{}),...(known&&p.charging?{charging:{readyPly:p.charging.readyPly}}:{})};
 });
 const captures=g.captures.map(c=>({side:c.side,role:c.role,by:c.by,ply:c.ply,at:c.at,...(c.id?{id:c.id}:{}),...(c.execution!==undefined?{execution:c.execution}:{}),...(c.charged!==undefined?{charged:c.charged}:{})}));
 const rite=(s:Side)=>{const r=g.ritual![s];return {phase:r.phase,...(r.openedPly!==undefined?{openedPly:r.openedPly}:{}),...(r.occupiedPly!==undefined?{occupiedPly:r.occupiedPly}:{})};};
 return {side,turn:g.turn,pieces,captures,ply:g.ply,quiet:g.quiet,ended:!!g.result,history:history.map(a=>({id:a.id,side:a.side,from:{x:a.from.x,y:a.from.y},to:{x:a.to.x,y:a.to.y},...(a.captured?{captured:a.captured}:{}),...(a.kind?{kind:a.kind}:{})})),rules:ritual?RITUAL_RULES:AI_RULES,...(ritual?{ritual:{red:rite('red'),blue:rite('blue')}}:{})};
}
export function sanitizeObservation(o:Observation):Observation{
 if(![AI_RULES.id,RITUAL_RULES.id].includes(o.rules.id)||o.rules.size!==7)throw new Error('Unsupported AI rules');
 // Re-apply the same allowlist at the Worker/search boundary. Extraneous
 // properties, prototypes and unserialized debug objects never enter nodes.
 return observe({pieces:o.pieces as Game['pieces'],turn:o.turn,ply:o.ply,quiet:o.quiet,captures:o.captures,seen:{},result:o.ended?{winner:null,reason:'quiet'}:null,...(o.rules.id===RITUAL_RULES.id?{mode:'ritual',ritual:o.ritual!}:{})},o.side,o.history);
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
export type SearchOptions={seed?:number;maxMillis?:number;nodeBudget?:number;style?:'balanced'|'purge';disableExecution?:boolean;chargePrior?:'initial'|'threat'};
export type Decision={action:Action|null;nodes:number;samples:number;algorithm:string;elapsed:number;diagnostics?:{depth:number;rounds:number;worlds:number;entropy:number;style:number;inferenceStates?:number}};
export function decide(o:Observation,difficulty:Difficulty,options:SearchOptions={}):Decision{
 if(![AI_RULES.id,RITUAL_RULES.id].includes(o.rules.id)||o.rules.size!==7)throw new Error('Unsupported AI rules');
 return decideStrategic(sanitizeObservation(o),difficulty,options);
}
