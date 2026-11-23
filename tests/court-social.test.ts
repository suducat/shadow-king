import assert from 'node:assert/strict';
import {test} from 'node:test';
import {courtVerdict} from '../src/CourtSocial';
import {createGame} from '../src/game';
import {EMOTES,WHISPERS,readInteraction,readProfile} from '../src/court-protocol';

test('the court accepts only the eight phrases and three emote IDs',()=>{
 assert.equal(WHISPERS.length,8);assert.equal(EMOTES.length,3);
 for(const [kind,entries] of [['whisper',WHISPERS],['emote',EMOTES]] as const){
  entries.forEach((_,id)=>assert.deepEqual(readInteraction({kind,id,html:'discarded'}),{kind,id}));
  for(const id of [-1,entries.length,0.5,'0',null])assert.equal(readInteraction({kind,id}),undefined);
 }
 assert.deepEqual(readProfile({id:'0123456789ab',nickname:'  远星  ',token:'discarded'}),{id:'0123456789ab',nickname:'远星'});
 assert.equal(readProfile({id:'0123456789ab',nickname:'a\u202eb'}),undefined);
});

test('all four verdicts map the real winning and losing sides for either seat',()=>{
 const profiles={red:{id:'aaaaaaaaaaaa',nickname:'赤星'},blue:{id:'bbbbbbbbbbbb',nickname:'蓝月'}};
 for(const winner of ['red','blue'] as const){
  for(const reason of ['king','guard','martyr','ritual'] as const){
   const game={...createGame(reason==='ritual'?'ritual':'classic'),result:{winner,reason}};
   const result=courtVerdict(game,profiles)!;
   assert.equal(result.winner,profiles[winner]);
   assert.notEqual(result.winnerSide,result.loserSide);
   assert.ok(result.line?.includes(result.winner.nickname)&&result.line.includes(result.loser.nickname));
  }
 }
 assert.equal(courtVerdict({...createGame(),result:{winner:'red',reason:'ritual'}},profiles)?.line,undefined);
 assert.equal(courtVerdict({...createGame(),result:{winner:'red',reason:'resign'}},profiles)?.line,undefined);
 assert.equal(courtVerdict({...createGame(),result:{winner:null,reason:'quiet'}},profiles),undefined);
});
