import test from 'node:test';import assert from 'node:assert/strict';
import {runMatch,summarize,spreadAction} from '../scripts/balance';import {createGame,startGame,act,allActions} from '../src/game';import {observe} from '../src/ai';
const base=()=>runMatch({group:'test',mode:'ritual',seed:0,reverse:false,red:{level:'easy',strategy:'balanced',seed:1},blue:{level:'easy',strategy:'balanced',seed:2}});
test('victory statistics separate king, purge, rite, classic sacrifice and draws',()=>{
 const b=base(),rows=[{...b,result:{winner:'red' as const,reason:'king' as const}},{...b,result:{winner:'blue' as const,reason:'guard' as const}},{...b,result:{winner:'red' as const,reason:'ritual' as const}},{...b,result:{winner:'blue' as const,reason:'martyr' as const}},{...b,result:{winner:null,reason:'quiet' as const}}];const s=summarize(rows);assert.deepEqual(s.victories,{king:1,purge:1,rite:1,classicSacrifice:1});assert.equal(s.draws,1);assert.equal(s.redWins,2);assert.equal(s.blueWins,2);assert.equal(s.games,5);
});
test('empty releases and charge risk use explicit independent denominators',()=>{
 const b={...base(),executions:2,executionKills:1,charges:5,chargedLosses:1,closedEpisodes:4,censoredEpisodes:1,riteOpens:2,result:{winner:'red' as const,reason:'ritual' as const}};const s=summarize([b]);assert.equal(s.executionKillsPerRelease,.5);assert.equal(s.executionsPerGame,2);assert.equal(s.chargedCaptureProbability,.2);assert.equal(s.riteSuccessPerOpening,.5);assert.equal(s.riteOpenRate,1);
});
test('spread-rush test policy consumes redacted observation only and remains legal',()=>{
 let g=startGame(createGame('ritual'));for(let i=0;i<50&&!g.result;i++){const o=observe(g,g.turn),a=spreadAction(o,[],{level:'normal',strategy:'rush',seed:1},i)!;assert.ok(allActions(g).some(b=>JSON.stringify(a)===JSON.stringify(b)));g=act(g,a);}
});
