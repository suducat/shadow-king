import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {decide,observe} from '../src/ai';import {act} from '../src/game';
const require=createRequire(import.meta.url),{launch,openGame,root}=require('./support.cjs');const browser=await launch();let page:any;const report:any={checks:[],errors:[]};
try{
 const b=await openGame(browser,'dist-test',{deviceScaleFactor:.5});page=b.page;report.errors=b.errors;const snap=()=>page.evaluate(()=>(window as any).__SK_QA__.snapshot());
 const key=async(x:number,y:number)=>{await page.locator('.sr-board button').nth(y*7+x).focus();await page.keyboard.press('Enter');};
 await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/祭典模式/}).click();await page.getByRole('button',{name:/人机对战/}).click();await page.getByRole('button',{name:/无冕者/}).click();await page.getByRole('button',{name:'确认布阵'}).click();
 for(let n=0;n<260;n++){
  await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.phase==='result'||s.reveal||s.game.turn==='red'&&!s.busy;},null,{timeout:60000});
  const s=await snap();if(s.reveal){await page.getByRole('button',{name:'继续',exact:true}).click();continue;}if(s.game.result){await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().phase==='result');report.result=s.game.result;report.plies=s.game.ply;report.captures=s.game.captures.length;break;}
  assert.equal(s.game.mode,'ritual');assert.equal(s.viewer,'red');for(const p of s.rendered.filter((p:any)=>p.side==='blue'))assert.equal(p.role,s.game.pieces.find((q:any)=>q.id===p.id).revealed?s.game.pieces.find((q:any)=>q.id===p.id).role:'unknown');
  const a=decide(observe(s.game,'red'), 'normal',{seed:619+s.game.ply,nodeBudget:900,maxMillis:Infinity}).action!,actor=s.game.pieces.find((p:any)=>p.id===a.id),expected=act(s.game,a);
  await key(actor.x,actor.y);assert.equal((await snap()).selected,a.id);
  if(a.kind==='charge'){
   await page.getByRole('button',{name:'蓄力',exact:true}).click();if(a.x===actor.x&&a.y===actor.y)await page.getByRole('button',{name:'原地完成蓄力',exact:true}).click();else await key(a.x,a.y);
  }else if(a.kind==='execute'){
   await page.getByRole('button',{name:'斩杀',exact:true}).click();
  }else await key(a.x,a.y);
  await page.waitForFunction((ply:number)=>(window as any).__SK_QA__.snapshot().game.ply>ply,s.game.ply);
  const next=await snap();assert.equal(next.game.ply,s.game.ply+1);assert.deepEqual(next.game.pieces.find((p:any)=>p.id===a.id),expected.pieces.find(p=>p.id===a.id));
  if(n%8===0){const states=await page.evaluate(()=>(window as any).__SK_QA__.modelState());assert.ok(states.every((m:any)=>m.visible&&!m.hidden&&!m.disposed));console.log('RITE MATCH',next.game.ply);}
 }
 assert.ok(report.result,'complete natural terminal game required');const final=await snap();assert.equal(final.phase,'result');assert.equal(final.thinking,false);assert.deepEqual(report.errors,[]);
 const states=await page.evaluate(()=>(window as any).__SK_QA__.modelState());assert.ok(states.every((m:any)=>m.visible&&!m.hidden&&!m.zeroOpacity&&!m.disposed));
 report.complete=true;await page.screenshot({path:path.join(root,'artifacts/rite-full-game.png')});console.log('PASS full ritual game',JSON.stringify({plies:report.plies,result:report.result}));
}catch(e){report.failure=(e as Error).stack;if(page){report.snapshot=await page.evaluate(()=>(window as any).__SK_QA__.snapshot()).catch(()=>null);await page.screenshot({path:path.join(root,'artifacts/rite-full-game-failure.png')}).catch(()=>{});}throw e;}
finally{fs.writeFileSync(path.join(root,'artifacts/rite-full-game-report.json'),JSON.stringify(report,null,2));await browser.close();}
