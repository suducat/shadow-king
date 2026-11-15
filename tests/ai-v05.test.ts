import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,startGame,act,type Game,type Side} from '../src/game';
import {observe,decide,sanitizeObservation,type Difficulty} from '../src/ai';
import {inferIdentities,worldGame} from '../src/belief';
import {attacks} from '../src/strategy-eval';
import {strategicFixture,baitHistory} from './ai-v05-fixtures';
const opts={seed:421,nodeBudget:5000,maxMillis:Infinity};
const settings=(level:Difficulty)=>({...opts,nodeBudget:{easy:120,normal:600,hard:1800,master:5000}[level]});
test('belief: exact joint assignments respect all casualty counts and public skills',()=>{
 for(const name of ['C','F','H','I'] as const){const o=observe(strategicFixture(name),'red',baitHistory()),b=inferIdentities(o);assert.ok(Math.abs(b.worlds.reduce((n,w)=>n+w.weight,0)-1)<1e-9);
  for(const w of b.worlds){const h=worldGame(o,b,w);for(const r of ['king','guard','martyr'] as const)assert.equal(h.pieces.filter(p=>p.side==='blue'&&p.role===r).length,b.remaining[r]);}
  for(const r of ['king','guard','martyr'] as const)assert.ok(Math.abs(Object.values(b.marginals).reduce((n,p)=>n+p[r],0)-b.remaining[r])<1e-8);
 }
});
test('G: aggressive king/guard disguises retain nonzero probability; truth permutations invisible',()=>{
 const g=strategicFixture('G'),o=observe(g,'red',baitHistory()),b=inferIdentities(o);assert.ok(b.marginals['blue-1'].king>.05&&b.marginals['blue-1'].martyr<.95);
 const swapped={...g,pieces:g.pieces.map(p=>p.id==='blue-1'?{...p,role:'king' as const}:p.id==='blue-3'?{...p,role:'martyr' as const}:p)};
 assert.deepEqual(observe(swapped,'red',baitHistory()),o);for(const level of ['easy','normal','hard','master'] as Difficulty[])assert.deepEqual(decide(o,level,settings(level)).action,decide(observe(swapped,'red',baitHistory()),level,settings(level)).action);
});
test('strict observation allowlist does not even read a hidden role getter or private extras',()=>{
 const g=startGame(createGame('ritual'));for(const p of g.pieces.filter(p=>p.side==='blue')){Object.defineProperty(p,'role',{get(){throw new Error('hidden role read');}});Object.defineProperty(p,'secret',{enumerable:true,get(){throw new Error('secret read');}});}
 Object.defineProperty(g,'seen',{get(){throw new Error('private repetition read');}});const o=observe(g,'red');assert.ok(o.pieces.filter(p=>p.side==='blue').every(p=>p.role==='unknown'));assert.ok(!JSON.stringify(o).includes('secret'));
 const injected={...o,privateGame:g,pieces:o.pieces.map(p=>({...p,privateScene:{trueRole:'king'}}))};assert.ok(!JSON.stringify(sanitizeObservation(injected)).includes('private'));
 for(const level of ['easy','normal','hard','master'] as Difficulty[]){const d=decide(injected,level,{...opts,nodeBudget:600});assert.ok(d.action);assert.ok(!JSON.stringify(d).includes('trueRole'));}
});
for(const level of ['hard','master'] as Difficulty[]){
 test(`${level} A: advance nine-cell altar control before last martyr falls`,()=>{const g=strategicFixture('A'),a=decide(observe(g,'red'),level,settings(level)).action!,next=act(g,a);const control=(s:Game)=>[...attacks(s,'red').keys()].filter(k=>{const[x,y]=k.split('/').map(Number);return x>=2&&x<=4&&y>=2&&y<=4;}).length;assert.ok(control(next)>control(g));});
 test(`${level} B: defend reachable altar entrance against a revealed king`,()=>{const g=strategicFixture('B'),a=decide(observe(g,'red'),level,settings(level)).action!,next=act(g,a);assert.ok(attacks(next,'red').has('3/2')||next.pieces.some(p=>p.side==='red'&&p.x===3&&p.y===2));});
 test(`${level} C/D: no empty corner charge or automatic empty execution`,()=>{for(const name of ['C','D'] as const){const g=strategicFixture(name),a=decide(observe(g,'red'),level,settings(level)).action!;assert.notEqual(a.kind,name==='C'?'charge':'execute');}});
 test(`${level} E: king accepts a safe high-value capture`,()=>{const g=strategicFixture('E'),a=decide(observe(g,'red'),level,settings(level)).action!;assert.equal(a.id,'red-3');assert.equal(a.x,3);assert.equal(a.y,2);});
 test(`${level} F: reject probable last-martyr bait when the hidden king can convert rite`,()=>{const g=strategicFixture('F'),a=decide(observe(g,'red',baitHistory()),level,settings(level)).action!;assert.ok(!(a.x===0&&a.y===2));});
 for(const name of ['H','I'] as const)test(`${level} ${name}: certain purge/regicide wins take precedence`,()=>{const g=strategicFixture(name),a=decide(observe(g,'red'),level,settings(level)).action!;assert.equal(act(g,a).result?.winner,'red');assert.equal(act(g,a).result?.reason,name==='H'?'guard':'king');});
}
test('public martyr losses reduce base probability; behavioral evidence never violates quotas',()=>{
 const full=observe(startGame(createGame('ritual')),'red'),reduced=observe(strategicFixture('F'),'red');for(const p of reduced.pieces)if(p.side==='blue'){delete p.revealed;p.role='unknown';delete p.executionUsed;}
 const a=inferIdentities(full,false),b=inferIdentities(reduced,false);assert.ok(Math.abs(a.marginals['blue-1'].martyr-3/7)<1e-9);assert.ok(Math.abs(b.marginals['blue-1'].martyr-1/5)<1e-9);assert.ok(b.marginals['blue-1'].martyr<a.marginals['blue-1'].martyr);
 const behavior=inferIdentities(observe(strategicFixture('F'),'red',baitHistory()));assert.ok(behavior.marginals['blue-1'].martyr>.5);assert.ok(behavior.marginals['blue-1'].king>.05);
});
test('G guard disguised as a rushing martyr remains possible under the same public history',()=>{
 const g=startGame(createGame('ritual'));g.pieces=g.pieces.map(p=>p.id==='blue-0'?{...p,x:0,y:2}:p);const history=baitHistory().map(h=>({...h,id:'blue-0'})),o=observe(g,'red',history),b=inferIdentities(o);assert.ok(b.marginals['blue-0'].guard>.05&&b.marginals['blue-0'].martyr<.95);
 const swapped={...g,pieces:g.pieces.map(p=>p.id==='blue-0'?{...p,role:'martyr' as const}:p.id==='blue-1'?{...p,role:'guard' as const}:p)};assert.deepEqual(observe(swapped,'red',history),o);for(const level of ['hard','master'] as Difficulty[])assert.deepEqual(decide(o,level,settings(level)).action,decide(observe(swapped,'red',history),level,settings(level)).action);
});
test('charged forward threat covers the next responder turn; a king can evade into another altar cell',()=>{
 const g=createGame('ritual'),removed=g.pieces.filter(p=>p.side==='blue'&&p.role==='martyr');g.pieces=g.pieces.filter(p=>!removed.includes(p)).map(p=>p.id==='red-0'?{...p,x:3,y:4,revealed:true,charging:{readyPly:8}}:p.id==='blue-3'?{...p,x:3,y:2,revealed:true}:p);g.captures=removed.map(p=>({side:p.side,role:p.role,by:'red',ply:7,at:'D3'}));g.turn='blue';g.ply=7;g.ritual!.blue={phase:'open',openedPly:7};assert.ok(attacks(g,'red').has('3/2'));
 for(const level of ['hard','master'] as Difficulty[]){const a=decide(observe(g,'blue'),level,settings(level)).action!,next=act(g,a);assert.equal(a.id,'blue-3');assert.ok(a.x!==3||a.y!==2);assert.ok(!attacks(next,'red').has(`${a.x}/${a.y}`));assert.equal(next.ritual!.blue.phase,'occupied');}
});
test('secret deployment has full king-column support and is not a fixed two-layout book',async()=>{
 const {deploy,random}=await import('../src/ai');for(const level of ['normal','hard','master'] as Difficulty[]){const rng=random(781),columns=new Set<number>(),layouts=new Set<string>();for(let i=0;i<1800;i++){const row=deploy('blue',level,rng);assert.deepEqual([...row].sort(),[0,1,2,3,4,5,6]);columns.add(row[3]);layouts.add(row.map((col,i)=>`${col}/${['g','m','g','k','m','g','m'][i]}`).sort().join('|'));}assert.equal(columns.size,7);assert.ok(layouts.size>70);}
});
