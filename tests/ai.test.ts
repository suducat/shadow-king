import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,startGame,move,legalMoves,other,type Side,type Role,type Game} from '../src/game';
import {observe,decide,deploy,random,AI_RULES,remaining,type Difficulty} from '../src/ai';
const levels:Difficulty[]=['easy','normal','hard','master'];
function decision(g:Game,level:Difficulty,seed=9){return decide(observe(g,g.turn),level,{seed,maxMillis:Infinity,nodeBudget:level==='master'?6000:2000});}
for(const level of levels){
 test(`${level}: seeded deployments are legal and independent of opponent`,()=>{
  for(let seed=0;seed<100;seed++)for(const side of ['red','blue'] as Side[])assert.deepEqual([...deploy(side,level,random(seed))].sort(),[0,1,2,3,4,5,6]);
 });
 test(`${level}: legal moves on 80 evolving positions`,()=>{
  let g=startGame(createGame());for(let i=0;i<80;i++){
   if(g.result)g=startGame(createGame());const d=decision(g,level,i),a=d.action;assert.ok(a);assert.ok(legalMoves(g,a.id).some(t=>t.x===a.x&&t.y===a.y));g=move(g,a.id,a.x,a.y);
  }
 });
 test(`${level}: hidden-identity permutation cannot change input or seeded decision`,()=>{
  const g=startGame(createGame()),hidden=g.pieces.filter(p=>p.side==='blue').map(p=>p.role).reverse();let i=0;
  const altered={...g,pieces:g.pieces.map(p=>p.side==='blue'?{...p,role:hidden[i++]}:p),seen:{'SECRET ROLE SIGNATURE':77}};
  const a=observe(g,'red'),b=observe(altered,'red');assert.deepEqual(a,b);assert.ok(!('seen' in a));
  const da=decision(g,level),db=decision(altered,level);assert.deepEqual(da.action,db.action);assert.equal(da.nodes,db.nodes);
 });
}
function tactical(role:Role,side:Side='blue'):Game{
 // The sole enemy survivor's identity follows from PUBLIC casualty counts.
 const g=createGame();const king=g.pieces.find(p=>p.side==='red'&&p.role==='king')!,guard=g.pieces.find(p=>p.side==='red'&&p.role==='guard')!;
 const survivor={id:'opaque-opponent',side,role,x:3,y:2};
 return startGame({...g,pieces:[{...king,x:0,y:5},{...guard,x:3,y:3},...g.pieces.filter(p=>p.side==='red'&&p.id!==king.id&&p.id!==guard.id),survivor],captures:g.pieces.filter(p=>p.side===side).slice(1).map((p,i)=>({side,role:p.role,by:other(side),ply:i+1,at:'A1'})),turn:'red'});
}
// Build consistent casualty counts for posterior certainty, including fixtures
// which are intentionally one capture from a terminal condition.
for(const role of ['king','guard','martyr'] as Role[])for(const level of levels.filter(l=>l!=='easy')){
 test(`${level}: ${role} posterior terminal tactic`,()=>{
  const g=tactical(role);const remainingRoles={king:1,guard:3,martyr:3};remainingRoles[role]--;
  g.captures=(Object.keys(remainingRoles) as Role[]).flatMap(r=>Array.from({length:remainingRoles[r]},(_,i)=>({side:'blue' as const,role:r,by:'red' as const,ply:i+1,at:'A1'})));
  const o=observe(g,'red');assert.equal(remaining(o,'blue')[role],1);
  const a=decision(g,level,51).action!;const captures=a.x===3&&a.y===2;
  if(role==='martyr')assert.equal(captures,false,'must not complete the enemy sacrifice');else{assert.ok(captures);assert.equal(move(g,a.id,a.x,a.y).result?.winner,'red');}
 });
}
test('game over/wrong side yields no action, unknown rule config is rejected',()=>{
 const g=startGame(createGame());for(const level of levels){assert.equal(decide(observe(g,'blue'),level).action,null);assert.equal(decide(observe({...g,result:{winner:'red',reason:'king'}},'red'),level).action,null);}
 assert.throws(()=>decide({...observe(g,'red'),rules:{...AI_RULES,id:'court-variant'} as unknown as typeof AI_RULES},'master'),/Unsupported/);
});
test('normal protects king and final guard from an immediate cardinal capture',()=>{
 const g=startGame(createGame());g.pieces=g.pieces.filter(p=>p.side!=='red'||p.role!=='guard'||p.id==='red-0').map(p=>p.id==='red-3'?{...p,x:3,y:3}:p.id==='blue-0'?{...p,x:3,y:2}:p);
 g.captures=[0,1].map(i=>({side:'red',role:'guard',by:'blue',ply:i+1,at:'A1'}));
 const a=decision(g,'normal').action!;assert.equal(a.id,'red-3');const next=move(g,a.id,a.x,a.y),king=next.pieces.find(p=>p.side==='red'&&p.role==='king')!;assert.ok(!next.pieces.some(p=>p.side==='blue'&&Math.abs(p.x-king.x)+Math.abs(p.y-king.y)===1));
});
test('fairness boundary after casualties/history, both colors and arbitrary opaque IDs',()=>{
 for(const side of ['red','blue'] as Side[]){
  const g=startGame(createGame());const enemy=other(side),removed=g.pieces.find(p=>p.side===enemy&&p.role==='martyr')!;
  g.pieces=g.pieces.filter(p=>p!==removed).map((p,i)=>({...p,id:`opaque-${i}`}));g.captures=[{side:enemy,role:'martyr',by:side,ply:1,at:'A1'}];g.turn=side;g.ply=7;
  const history=[{id:g.pieces[0].id,side:'red' as const,from:{x:0,y:6},to:{x:0,y:5}}];const a=observe(g,side,history),roles=g.pieces.filter(p=>p.side===enemy).map(p=>p.role).reverse();let i=0;
  const b=observe({...g,pieces:g.pieces.map(p=>p.side===enemy?{...p,role:roles[i++]}:p)},side,history);assert.deepEqual(a,b);
  for(const level of levels){const opts={seed:19,maxMillis:Infinity,nodeBudget:1000};assert.deepEqual(decide(a,level,opts).action,decide(b,level,opts).action);}
 }
});
test('normal evaluates final-martyr offers without exposing the crown',()=>{
 const g=startGame(createGame());g.pieces=g.pieces.filter(p=>p.side!=='red'||p.role!=='martyr'||p.id==='red-1').map(p=>p.id==='red-1'?{...p,x:3,y:3}:p.id==='blue-0'?{...p,x:3,y:1}:p);
 g.captures=[0,1].map(i=>({side:'red',role:'martyr',by:'blue',ply:i+1,at:'A1'}));
 const a=decision(g,'normal').action!,next=move(g,a.id,a.x,a.y),king=next.pieces.find(p=>p.side==='red'&&p.role==='king')!;assert.notEqual(next,g);assert.ok(legalMoves(g,'red-1').some(p=>p.x===3&&p.y===2),'sacrifice offer remains available, not compulsory');assert.ok(!next.pieces.some(p=>p.side==='blue'&&Math.abs(p.x-king.x)+Math.abs(p.y-king.y)===1));
});
test('wall-clock/node ceilings bound hard and master search',()=>{
 for(const level of ['hard','master'] as Difficulty[]){const d=decide(observe(startGame(createGame()),'red'),level,{maxMillis:15,nodeBudget:500});assert.ok(d.nodes<=500);assert.ok(d.elapsed<300);assert.ok(d.action);}
});
test('normal preserves its final guard under an immediate attack',()=>{
 const g=startGame(createGame());g.pieces=g.pieces.filter(p=>p.side!=='red'||p.role!=='guard'||p.id==='red-0').map(p=>p.id==='red-0'?{...p,x:3,y:3}:p.id==='blue-0'?{...p,x:3,y:2}:p);
 g.captures=[0,1].map(i=>({side:'red',role:'guard',by:'blue',ply:i+1,at:'A1'}));
 const a=decision(g,'normal').action!,next=move(g,a.id,a.x,a.y),guard=next.pieces.find(p=>p.side==='red'&&p.role==='guard')!;
 assert.equal(a.id,guard.id);assert.ok(!next.pieces.some(p=>p.side==='blue'&&Math.abs(p.x-guard.x)+Math.abs(p.y-guard.y)===1));
});

test('normal never charges a threatened king into a second enemy, hoping for a lucky capture',()=>{
 const g=startGame(createGame());g.pieces=g.pieces.map(p=>p.id==='red-3'?{...p,x:3,y:3}:p.id==='blue-0'?{...p,x:3,y:2}:p.id==='blue-1'?{...p,x:4,y:2}:p);
 const a=decision(g,'normal').action!,next=move(g,a.id,a.x,a.y),king=next.pieces.find(p=>p.side==='red'&&p.role==='king')!;
 assert.ok(!next.pieces.some(p=>p.side==='blue'&&Math.abs(p.x-king.x)+Math.abs(p.y-king.y)===1));
});
