import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_BUILD_ID,decide,observe} from '../src/ai';
import {forcedRiteLoss} from '../src/rite-proof';
import {resolvePick} from '../src/interaction';
import type {Game} from '../src/game';
import {strategicFixture,baitHistory} from './ai-v05-fixtures';
function proofGame():Game{return{pieces:[{id:'r-k',side:'red',role:'king',x:3,y:5,revealed:true},{id:'r-g',side:'red',role:'guard',x:0,y:0,revealed:true},{id:'b-k',side:'blue',role:'king',x:6,y:0},{id:'b-g',side:'blue',role:'guard',x:0,y:1}],mode:'ritual',ritual:{red:{phase:'open',openedPly:8},blue:{phase:'dormant'}},turn:'red',ply:10,quiet:0,captures:[],seen:{},result:null};}
test('formal release carries the reviewed AI version',()=>assert.equal(AI_BUILD_ID,'v0.6.0'));
test('rite proof preserves a purge counter-win before occupation resolves',()=>assert.equal(forcedRiteLoss(proofGame(),'blue').loss,false));
test('rite proof finds a safe altar entry with no winning defensive reply',()=>{const g=proofGame();g.pieces=g.pieces.filter(p=>p.id!=='r-g');assert.equal(forcedRiteLoss(g,'blue').loss,true);});
test('actual capture coverage prevents an altar loss certificate',()=>{const g=proofGame();g.pieces=g.pieces.filter(p=>p.id!=='r-g').map(p=>p.id==='b-g'?{...p,x:3,y:3}:p);assert.equal(forcedRiteLoss(g,'blue').loss,false);});
test('interrupted proof work never claims completion',()=>{const p=forcedRiteLoss(proofGame(),'blue',()=>true);assert.equal(p.complete,false);assert.equal(p.loss,false);});
test('classic rules gain no ritual condition',()=>{const g=proofGame();delete g.mode;delete g.ritual;assert.deepEqual(forcedRiteLoss(g,'blue'),{loss:false,checks:0,complete:true});});
test('a highlighted legal floor destination wins over perspective body occlusion',()=>{assert.deepEqual(resolvePick({x:1,y:5},{x:2,y:6},[{x:1,y:5}],'selected'),{x:1,y:5});assert.deepEqual(resolvePick({x:1,y:5},{x:2,y:6},[],null),{x:2,y:6});assert.equal(resolvePick(null,null,[],null),null);});
test('an exhausted search still returns a legal action from public information',()=>{const g=strategicFixture('F'),o=observe(g,'red',baitHistory()),d=decide(o,'master',{seed:421,maxMillis:0,nodeBudget:0});assert.ok(d.action);assert.ok(o.pieces.find(p=>p.id===d.action!.id&&p.side==='red'));});
