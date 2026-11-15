import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {decide,observe} from '../src/ai';
const require=createRequire(import.meta.url),{launch,openGame,root}=require('./support.cjs');
const report:{checks:string[];errors:string[];games:unknown[];worker:unknown[]}={checks:[],errors:[],games:[],worker:[]};
const reportFile=path.join(root,'artifacts',`ai-browser-${process.env.LEVEL||(process.env.SCENARIOS_ONLY?'scenarios':'report')}.json`);
const browser=await launch();let page:any;
const mark=(s:string)=>{report.checks.push(s);console.log('PASS',s);fs.writeFileSync(reportFile,JSON.stringify(report,null,2));};
const snapshot=()=>page.evaluate(()=> (window as any).__SK_QA__.snapshot());
async function click(x:number,y:number,height=.14){
 const p=await page.evaluate(([x,y,h]:number[])=>(window as any).__SK_QA__.project(x,y,h),[x,y,height]);await page.mouse.click(p.x,p.y);
}
async function ready(){await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.layoutReady&&Math.abs(s.camera.angle-s.camera.desiredAngle)<.001;});}
try{
 const game=await openGame(browser,'dist-test',{deviceScaleFactor:.5});page=game.page;report.errors=game.errors;
 await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/人机对战/}).click();
 assert.equal(await page.locator('.difficulty-card').count(),4);await page.screenshot({path:path.join(root,'artifacts/v03-difficulty.png')});
 await page.getByRole('button',{name:/无冕者/}).click();await page.getByRole('button',{name:'确认布阵'}).click();await ready();
 let s=await snapshot();assert.equal(s.gameMode,'ai');assert.equal(s.viewer,'red');assert.equal(s.game.turn,'red');
 await click(3,6,.7);await click(3,5); // regular human crown move
 // While AI owns the turn, attempted human moves cannot control either army.
 await page.waitForFunction(()=> (window as any).__SK_QA__.snapshot().game.turn==='blue');
 s=await snapshot();const ply=s.game.ply;await click(0,0,.6);await click(0,1);await click(1,6,.6);await click(1,5);
 await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.game.turn==='red'&&!s.busy&&s.game.ply>=2;},null,{timeout:30000});
 s=await snapshot();assert.equal(s.game.ply,ply+1);assert.equal(s.viewer,'red');assert.ok(s.rendered.filter((p:any)=>p.side==='blue').every((p:any)=>p.role==='unknown'));
 assert.equal(s.ai.fallback,false,'must execute actual Worker search');report.worker.push(s.ai);mark('四档入口、AI自动布阵、大师Worker行动、玩家不能代替AI，单回合只执行一步');
 // Repeated real matches from an unmodified opening, with a fair scripted human
 // using actual keyboard board controls. No direct engine move or state injection.
 for(const level of (process.env.SCENARIOS_ONLY?[]:process.env.LEVEL?[process.env.LEVEL]:['easy','normal','hard','master'])){
  if((await snapshot()).phase==='result')await page.getByRole('button',{name:'返回主菜单',exact:true}).click();
  else{await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();}
  await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/人机对战/}).click();
  const name={easy:'棋侍',normal:'影谋',hard:'诡相',master:'无冕者'}[level]!;
  await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'确认布阵'}).click();await ready();
  for(let turns=0;turns<130;turns++){
   await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.phase==='result'||s.reveal||s.game.turn==='red'&&!s.busy;},null,{timeout:30000});
   s=await snapshot();if(s.reveal){await page.getByRole('button',{name:'继续',exact:true}).click();continue;}if(s.phase==='result')break;
   assert.equal(s.viewer,'red');assert.ok(s.rendered.filter((p:any)=>p.side==='blue').every((p:any)=>p.role==='unknown'));
   const a=decide(observe(s.game,'red'), 'normal',{seed:117+s.game.ply}).action!;const actor=s.game.pieces.find((p:any)=>p.id===a.id);
   await page.locator('.sr-board button').nth(actor.y*7+actor.x).focus();await page.keyboard.press('Enter');
   assert.equal((await snapshot()).selected,a.id);
   await page.locator('.sr-board button').nth(a.y*7+a.x).focus();await page.keyboard.press('Enter');
   await page.waitForFunction((ply:number)=>(window as any).__SK_QA__.snapshot().game.ply>ply,s.game.ply);
   const moved=await snapshot();assert.equal(moved.game.pieces.find((p:any)=>p.id===a.id).x,a.x);assert.equal(moved.game.pieces.find((p:any)=>p.id===a.id).y,a.y);
   if(turns%10===0){const now=await snapshot();console.log('MATCH',level,now.game.ply,now.phase);}
  }
  s=await snapshot();assert.equal(s.phase,'result',`${level}: complete game required`);assert.equal(s.thinking,false);
  report.games.push({level,plies:s.game.ply,result:s.game.result});
  const states=await page.evaluate(()=>(window as any).__SK_QA__.modelState());assert.ok(states.every((a:any)=>a.visible&&a.hidden===0&&a.zeroOpacity===0&&a.disposed===0));
  report.worker.push(s.ai);mark(`${name}：真实键盘棋盘完整对局，终局停止，角色保持完整`);
 }
 if(!process.env.LEVEL){
 // Actual AI captures all three attacker roles, same sealed presentation.
 for(const role of ['king','guard','martyr']){
  await page.evaluate((r:string)=>(window as any).__SK_QA__.loadAIFixture('capture',r,'normal'),role);
  await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().reveal,null,{timeout:30000});s=await snapshot();
  assert.equal(s.attack.role,'unknown');assert.equal(s.attack.dissolved,true);assert.equal(s.game.captures.length,1);assert.equal(s.viewer,'red');
  const states=await page.evaluate(()=>(window as any).__SK_QA__.modelState());assert.ok(states.every((a:any)=>!a.zeroOpacity&&!a.hidden&&a.visible));
  await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.game.turn==='red'&&!s.busy;});
  assert.equal((await snapshot()).game.ply,1);
 }mark('AI王／影卫／死士吃子、消散、揭示、完整模型、无暗身份动作泄漏');
 // Existing cinematic branches triggered by a human capture in AI mode are
 // exercised by the original endings suite; here test AI-owned ending flow.
 for(const ending of ['king','guard']){
  await page.evaluate((e:string)=>(window as any).__SK_QA__.loadAIFixture(e,'guard','normal'),ending);
  await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().reveal,null,{timeout:30000});await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().phase==='result');s=await snapshot();assert.equal(s.game.result.reason,ending);assert.equal(s.game.result.winner,'blue');
 }mark('AI弑王和影卫尽灭进入原结算演出');
 await page.evaluate(()=>(window as any).__SK_QA__.loadFixture('martyr','guard','ai'));await ready();
 await click(3,3,.65);await click(3,2);await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().reveal);await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().phase==='result');s=await snapshot();assert.equal(s.game.result.reason,'martyr');assert.equal(s.game.result.winner,'blue');mark('AI最后死士被吃，献祭胜利沿用原结算');

 // Ordinary restart/leave UI regression. Forced obsolete replies are tested
 // separately in ai-controller.cjs; a capture reveal intentionally locks restart.
 await page.getByRole('button',{name:'再来一局',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();await ready();
 const opening=async()=>{await page.locator('.sr-board button').nth(42).focus();await page.keyboard.press('Enter');await page.locator('.sr-board button').nth(35).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>{const s=(window as any).__SK_QA__.snapshot();return s.game.ply===2&&!s.busy&&s.game.turn==='red';},null,{timeout:30000});};
 await opening();await page.getByRole('button',{name:'重新开始',exact:true}).click();await page.getByRole('button',{name:'重新开始',exact:true}).last().click();
 await page.waitForFunction(()=>(window as any).__SK_QA__.snapshot().phase==='setup');await page.waitForTimeout(2200);s=await snapshot();assert.equal(s.game.ply,0);assert.equal(s.game.pieces.length,14);
 await page.getByRole('button',{name:'确认布阵'}).click();await opening();
 await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();await page.waitForTimeout(2200);s=await snapshot();assert.equal(s.phase,'menu');assert.equal(s.game.ply,0);
 mark('人机重开、再次移动和返回菜单的界面流程');
 }
 const messages=await page.evaluate(()=>(window as any).__AI_MESSAGES__);
 assert.ok(messages.length>4);for(const m of messages){assert.ok(!('seen' in m.observation));assert.ok(m.observation.pieces.every((p:any)=>p.side===m.observation.side?p.role!=='unknown':p.role==='unknown'));}
 mark(`实际Worker ${messages.length} 条输入均通过暗身份隔离检查`);
 assert.deepEqual(report.errors,[]);(report as any).complete=true;
}catch(error){if(page){fs.writeFileSync(path.join(root,'artifacts/ai-browser-failure-state.json'),JSON.stringify(await snapshot(),null,2));}if(page)await page.screenshot({path:path.join(root,'artifacts/ai-browser-failure.png')});throw error;}
finally{fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));await browser.close();}
