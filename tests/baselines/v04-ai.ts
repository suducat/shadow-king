import {RITUAL_RULES,ritualActions,type GameAction,type Rites} from '../../src/ritual';
import {decideRitual} from './v04-ritual-ai';
import { CONFIG, ROLES, other, viewFor, type Game, type Side, type Role, type VisiblePiece, type Capture } from '../../src/game';
export type Difficulty='easy'|'normal'|'hard'|'master';
export const DIFFICULTIES:Record<Difficulty,{name:string;title:string;label:string;description:string}>={
 easy:{name:'棋侍',title:'初识棋道',label:'简单',description:'尚未熟悉棋局中的全部陷阱，行动比较直接，适合新玩家。'},
 normal:{name:'影谋',title:'藏锋于影',label:'普通',description:'能够进行基本攻防，重视关键棋子的生存，并尝试判断敌方意图。'},
 hard:{name:'诡相',title:'落子为饵',label:'困难',description:'懂得利用隐藏身份、布置诱饵、分析敌方棋子构成，具有较强策略性。'},
 master:{name:'无冕者',title:'执掌命运',label:'大师',description:'能够综合分析身份信息、空间控制、三种胜利条件和多回合风险，挑战高水平玩家。'},
};
export const AI_RULES={id:'shadow-king-standard-v1',...CONFIG,roles:{king:1,guard:3,martyr:3}} as const;
export type PublicAction={id:string;side:Side;from:{x:number;y:number};to:{x:number;y:number};captured?:Role;kind?:GameAction['kind']};
// This is the ONLY input accepted by the decision engine/Worker. In particular,
// Game.seen contains hidden roles and must never cross this boundary.
export type Observation={side:Side;turn:Side;pieces:VisiblePiece[];captures:Capture[];ply:number;quiet:number;ended:boolean;history:PublicAction[];rules:typeof AI_RULES|typeof RITUAL_RULES;ritual?:Rites};
export function observe(g:Game,side:Side,history:PublicAction[]=[]):Observation{
 return{side,turn:g.turn,pieces:viewFor(g,side),captures:g.captures.map(c=>({...c})),ply:g.ply,quiet:g.quiet,ended:!!g.result,history:history.map(a=>({id:a.id,side:a.side,from:{...a.from},to:{...a.to},...(a.captured?{captured:a.captured}:{}),...(a.kind?{kind:a.kind}:{})})),rules:g.mode==='ritual'?RITUAL_RULES:AI_RULES,...(g.mode==='ritual'?{ritual:{red:{...g.ritual!.red},blue:{...g.ritual!.blue}}}:{})};
}
export type Action=GameAction;
export function random(seed:number){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function shuffle<T>(items:T[],rng:()=>number){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function deploy(side:Side,difficulty:Difficulty,rng:()=>number):number[]{
 // Role order is the same as createGame's own roster; only our seven columns
 // are chosen. No player board/identity data is accepted by this function.
 if(difficulty==='easy')return shuffle([0,1,2,3,4,5,6],rng);
 const layouts:Record<Exclude<Difficulty,'easy'>,Role[][]>={
 normal:[['martyr','guard','guard','king','guard','martyr','martyr']],
 hard:[['martyr','guard','martyr','king','guard','guard','martyr'],['martyr','guard','guard','king','martyr','guard','martyr']],
 master:[['martyr','guard','king','guard','martyr','guard','martyr'],['martyr','guard','martyr','guard','king','guard','martyr']],
 };
 let layout=[...layouts[difficulty][Math.floor(rng()*layouts[difficulty].length)]];if(rng()<.5)layout.reverse();
 const free=[0,1,2,3,4,5,6];return ROLES.map(role=>{const x=free.find(x=>layout[x]===role)!;free.splice(free.indexOf(x),1);return side==='blue'?6-x:x;});
}
export function legalActions(o:Pick<Observation,'pieces'|'turn'|'ended'|'rules'> & {ply?:number}):Action[]{
 if(o.rules.id===RITUAL_RULES.id)return ritualActions({pieces:o.pieces,turn:o.turn,ply:o.ply??0,ended:o.ended});
 if(o.ended)return[];const size=o.rules.size;
 return o.pieces.filter(p=>p.side===o.turn).flatMap(p=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({id:p.id,x:p.x+dx,y:p.y+dy})).filter(a=>a.x>=0&&a.y>=0&&a.x<size&&a.y<size&&!o.pieces.some(q=>q.side===p.side&&q.x===a.x&&q.y===a.y)));
}
type Man=Omit<VisiblePiece,'role'>&{role:Role};
type Position={pieces:Man[];turn:Side;quiet:number;winner?:Side|null};
const roles:Role[]=['king','guard','martyr'];
export function remaining(o:Observation,side:Side):Record<Role,number>{
 return Object.fromEntries(roles.map(role=>[role,o.rules.roles[role]-o.captures.filter(c=>c.side===side&&c.role===role).length])) as Record<Role,number>;
}
function hypothesis(o:Observation,rng:()=>number):Position{
 const counts=remaining(o,other(o.side));
 for(const p of o.pieces)if(p.side!==o.side&&p.role!=='unknown')counts[p.role]--;
 const bag=shuffle(roles.flatMap(r=>Array(Math.max(0,counts[r])).fill(r) as Role[]),rng);
 // Opaque IDs are NEVER parsed, hashed into a role, or used as role priors.
 return{pieces:o.pieces.map(p=>({...p,role:p.role==='unknown'?bag.pop()!:p.role})),turn:o.turn,quiet:o.quiet};
}
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function actions(p:Position):Action[]{return legalActions({pieces:p.pieces,turn:p.turn,ended:p.winner!==undefined,rules:AI_RULES});}
function apply(p:Position,a:Action):Position{
 const attacker=p.pieces.find(m=>m.id===a.id)!,victim=p.pieces.find(m=>m.x===a.x&&m.y===a.y);
 const pieces=p.pieces.filter(m=>m!==victim).map(m=>m===attacker?{...m,x:a.x,y:a.y}:m);
 let winner:Side|null|undefined;
 if(victim&&(victim.role==='king'||!pieces.some(m=>m.side===victim.side&&m.role===victim.role)))winner=victim.role==='martyr'?victim.side:attacker.side;
 const quiet=victim?0:p.quiet+1;if(winner===undefined&&quiet>=CONFIG.quietFullRounds*2)winner=null;
 return{pieces,turn:other(p.turn),quiet,winner};
}
function evaluate(p:Position,side:Side):number{
 if(p.winner!==undefined)return p.winner===null?0:p.winner===side?100000:-100000;
 const value=(s:Side)=>{
  const own=p.pieces.filter(m=>m.side===s),foe=p.pieces.filter(m=>m.side!==s),guards=own.filter(m=>m.role==='guard').length,martyrs=own.filter(m=>m.role==='martyr').length;
  let score=guards*190-martyrs*160;
  for(const m of own){
   const threats=foe.filter(e=>distance(m,e)===1).length;
   const cover=own.filter(e=>e!==m&&distance(m,e)===1).length;
   const closest=Math.min(7,...foe.map(e=>distance(e,m)));
   const center=6-Math.abs(m.x-3)-Math.abs(m.y-3);
   if(m.role==='king')score+=Math.min(closest,4)*15+cover*9-threats*(p.turn===s?430:1800);
   else if(m.role==='guard')score+=center*3+cover*2-threats*(guards===1?850:145)*(p.turn===s?.35:1);
   else score+=center*7+(7-closest)*7+threats*(martyrs===1?420:55)*(p.turn===s?.5:1);
  }
  return score;
 };
 return value(side)-value(other(side));
}
// Public expected-value heuristic: refuses the last-martyr capture, values
// protecting our king/last guard, and offers our martyrs as tempting targets.
function publicScore(o:Observation,a:Action):number{
 const actor=o.pieces.find(p=>p.id===a.id)!,victim=o.pieces.find(p=>p.x===a.x&&p.y===a.y),own=o.pieces.filter(p=>p.side===o.side),foe=o.pieces.filter(p=>p.side!==o.side);
 const counts=remaining(o,other(o.side)),n=roles.reduce((s,r)=>s+counts[r],0),ownGuards=own.filter(p=>p.role==='guard').length,ownMartyrs=own.filter(p=>p.role==='martyr').length;
 const capture=(role:Role)=>role==='king'?100000:role==='guard'?(counts.guard===1?100000:210):(counts.martyr===1?-100000:-210);
 let score=victim?(victim.role==='unknown'?roles.reduce((s,r)=>s+counts[r]/n*capture(r),0):capture(victim.role)):0;
 const terminal=(r:Role)=>r==='king'||counts[r]===1;
 // Immediate endings have no next-turn exposure. In every other outcome,
 // losing our king/final guard costs the same scale as a terminal victory.
 const ongoing=victim?1-(victim.role==='unknown'?roles.reduce((v,r)=>v+(terminal(r)?counts[r]/n:0),0):terminal(victim.role)?1:0):1;
 const after=o.pieces.filter(p=>p!==victim).map(p=>p.id===a.id?{...p,x:a.x,y:a.y}:p);
 for(const p of after.filter(p=>p.side===o.side)){
  const threat=after.filter(q=>q.side!==o.side&&distance(p,q)===1).length;
  const nearest=Math.min(7,...foe.filter(q=>q!==victim).map(q=>distance(q,p)));
  if(p.role==='king')score+=nearest*7-threat*100000*ongoing;
  else if(p.role==='guard')score-=threat*(ownGuards===1?100000*ongoing:190);
  else if(p.role==='martyr')score+=threat*(ownMartyrs===1?950:110)+(7-nearest)*5;
 }
 score+=(6-Math.abs(a.x-3)-Math.abs(a.y-3))*3;
 if(actor.role==='king')score-=8; // do not lead the assault with the crown
 // Public movement history discourages cycles without reading Game.seen.
 score-=o.history.slice(-12).filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y).length*55;
 return score;
}
export type SearchOptions={seed?:number;maxMillis?:number;nodeBudget?:number;style?:'balanced'|'purge';disableExecution?:boolean;chargePrior?:'initial'|'threat'};
export type Decision={action:Action|null;nodes:number;samples:number;algorithm:string;elapsed:number};
const algorithms={easy:'random + occasional crown safety',normal:'public expected value + immediate safety',hard:'posterior determinizations + 2-ply minimax',master:'information-set root UCB + 4-ply beam search'};
export function decide(o:Observation,difficulty:Difficulty,options:SearchOptions={}):Decision{
 if(o.rules.id===RITUAL_RULES.id)return decideRitual(o,difficulty,options);
 const began=performance.now(),rng=random(options.seed??1),legal=legalActions(o),algorithm=algorithms[difficulty];let nodes=0,samples=0;
 if(o.rules.id!==AI_RULES.id||o.rules.size!==CONFIG.size)throw new Error('Unsupported AI rules');
 if(o.turn!==o.side||o.ended||!legal.length)return{action:null,nodes,samples,algorithm,elapsed:performance.now()-began};
 // Validate the observable inventory, not the true hidden board.
 for(const s of ['red','blue'] as Side[]){const count=remaining(o,s);if(roles.some(r=>count[r]<0)||roles.reduce((n,r)=>n+count[r],0)!==o.pieces.filter(p=>p.side===s).length)throw new Error('Invalid public inventory');}
 let action:Action;
 if(difficulty==='easy'){
  const choices=rng()<.22?legal.filter(a=>{const p=o.pieces.find(p=>p.id===a.id)!;return p.role!=='king'||!o.pieces.some(e=>e.side!==o.side&&distance(a,e)===1);}):legal;
  action=(choices.length?choices:legal)[Math.floor(rng()*(choices.length||legal.length))];
 }else{
  const ranked=legal.map(a=>({a,score:publicScore(o,a)+rng()*.001})).sort((a,b)=>b.score-a.score);
  action=ranked[0].a;
  if(difficulty!=='normal'){
   const deadline=began+(options.maxMillis??(difficulty==='master'?650:220)),budget=options.nodeBudget??(difficulty==='master'?14000:4200);
   const expired=()=>nodes>=budget||performance.now()>=deadline;
   // Every candidate gets the same hypotheses in hard mode. Master allocates
   // additional hypotheses with UCB, so uncertainty can overturn early guesses.
   const roots=ranked.map(r=>({...r,total:0,visits:0}));
   const tree=(p:Position,depth:number,alpha:number,beta:number):number=>{
    nodes++;if(depth===0||p.winner!==undefined||expired())return evaluate(p,o.side);
    const all=actions(p);if(!all.length)return 0;
    const max=p.turn===o.side;
    const ordered=all.map(a=>{const next=apply(p,a);return{next,v:evaluate(next,o.side)};}).sort((a,b)=>max?b.v-a.v:a.v-b.v);
    let best=max?-Infinity:Infinity;
    // Keep terminal tactics and the most promising spatial/sacrificial replies.
    for(const c of ordered.slice(0,depth>=3?4:depth>=2?5:8)){
     const v=tree(c.next,depth-1,alpha,beta);best=max?Math.max(best,v):Math.min(best,v);
     if(max)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
     if(beta<=alpha||expired())break;
    }return best;
   };
   if(difficulty==='hard'){
    while(!expired()&&samples<18){
     const p=hypothesis(o,rng);samples++;
     for(const root of roots){if(expired())break;const v=tree(apply(p,root.a),1,-Infinity,Infinity);root.total+=v;root.visits++;}
    }
   }else{
    // Information-set bandit: each iteration draws a possible secret layout
    // solely from remaining public counts, never the actual enemy roles.
    while(!expired()&&samples<160){
     const root=roots.find(r=>!r.visits)||roots.reduce((best,r)=>{
      const u=(q:typeof r)=>q.total/q.visits+550*Math.sqrt(Math.log(samples+1)/q.visits);
      return u(r)>u(best)?r:best;
     });
     const p=hypothesis(o,rng);samples++;
     root.total+=tree(apply(p,root.a),3,-Infinity,Infinity);root.visits++;
    }
   }
   // Blend a small, common public prior to stabilize scarce samples. Public
   // one-ply safety remains a tie-breaker, never an identity oracle.
   const scored=roots.filter(r=>r.visits).map(r=>({...r,value:r.total/r.visits+r.score*.015}));
   scored.sort((a,b)=>b.value-a.value);if(scored.length)action=scored[0].a;
  }
 }
 return{action,nodes,samples,algorithm,elapsed:performance.now()-began};
}
