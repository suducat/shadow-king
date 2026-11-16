const{launch,openGame,root}=require('./support.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const report={checks:[],errors:[]},mark=s=>{report.checks.push(s);console.log('PASS',s)};
(async()=>{const browser=await launch();let page;try{
 const boot=await openGame(browser,'dist-test',{deviceScaleFactor:.5});page=boot.page;report.errors=boot.errors;
 const snap=()=>page.evaluate(()=>window.__SK_QA__.snapshot());
 const cell=async(x,y)=>{await page.locator('.sr-board button').nth(y*7+x).focus();await page.keyboard.press('Enter')};
 const start=async()=>{await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/人机对战/}).click();await page.getByRole('button',{name:/无冕者/}).click();await page.getByRole('button',{name:'开始布阵',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();};
 await start();await cell(3,6);await cell(3,5);await page.waitForFunction(()=>{const s=window.__SK_QA__.snapshot();return s.game.ply===2&&!s.busy;},null,{timeout:30000});
 const messages=await page.evaluate(()=>window.__AI_MESSAGES__);assert.ok(messages.length);
 for(const m of messages){assert.ok(!('seen'in m.observation));assert.ok(m.observation.pieces.every(p=>p.side===m.observation.side?p.role!=='unknown':p.role==='unknown'));}
 assert.equal((await snap()).ai.fallback,false);mark('真实Worker输入无敌方暗身份／seen，实际运行大师搜索');
 // Extend the watchdog ONLY in these controlled stale-reply cases; restore
 // the real 1.8s deadline before the final timeout/fallback test.
 // A deliberately uncooperative Worker sends a valid-looking obsolete reply
 // even AFTER terminate(). This tests the epoch guard, not the AI algorithm.
 await page.evaluate(()=>{window.__REAL_TIMEOUT__=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__REAL_TIMEOUT__(fn,ms===1800?100000:ms,...args);window.__DELAYED__=[];window.__TERMINATED__=0;window.Worker=class{
  postMessage(m){const p=m.observation.pieces.find(p=>p.side===m.observation.side);window.__DELAYED__.push(()=>this.onmessage?.({data:{id:m.id,decision:{action:{id:p.id,x:p.x,y:p.y+1},nodes:1,samples:1,algorithm:'test delayed reply',elapsed:1}}}));}
  terminate(){window.__TERMINATED__++;}
 };});
 await page.evaluate(()=>window.__SK_QA__.loadAIFixture('capture','guard','master'));
 await page.waitForFunction(()=>window.__DELAYED__.length>0);
 await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();
 await page.evaluate(()=>{window.__DELAYED__.splice(0).forEach(f=>f())});await page.waitForTimeout(400);
 let s=await snap();assert.equal(s.phase,'menu');assert.equal(s.game.ply,0);assert.ok(await page.evaluate(()=>window.__TERMINATED__>0));mark('返回菜单后强制送达旧Worker回复，不会落子');
 await start();await cell(3,6);await cell(3,5);await page.waitForFunction(()=>window.__DELAYED__.length>0);
 await page.getByRole('button',{name:'重新开始',exact:true}).click();await page.getByRole('button',{name:'重新开始',exact:true}).last().click();
 await page.evaluate(()=>window.__DELAYED__.splice(0).forEach(f=>f()));await page.waitForTimeout(300);s=await snap();assert.equal(s.phase,'setup');assert.equal(s.game.ply,0);assert.equal(s.game.pieces.length,14);mark('重开清理旧任务，同ID棋子不受旧回复影响');
 await page.getByRole('button',{name:'确认布阵'}).click();await cell(3,6);await cell(3,5);await page.waitForFunction(()=>window.__DELAYED__.length>0);
 await page.getByRole('button',{name:'认输',exact:true}).click();await page.getByRole('button',{name:'确认认输',exact:true}).click();
 await page.evaluate(()=>window.__DELAYED__.splice(0).forEach(f=>f()));await page.waitForTimeout(300);s=await snap();assert.equal(s.phase,'result');assert.equal(s.game.result.reason,'resign');assert.equal(s.game.result.winner,'blue');assert.equal(s.game.ply,1);mark('玩家在AI回合认输归属正确，终局拒绝旧回复');
 await page.evaluate(()=>{window.setTimeout=window.__REAL_TIMEOUT__});
 await page.getByRole('button',{name:'再来一局',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();await cell(3,6);await cell(3,5);
 await page.waitForFunction(()=>{const s=window.__SK_QA__.snapshot();return s.game.ply===2&&!s.busy;},null,{timeout:30000});s=await snap();assert.equal(s.ai.fallback,true);assert.equal(s.game.turn,'red');mark('无响应Worker在1.8秒后终止，有限启发式合法落子恢复玩家回合');
 assert.deepEqual(report.errors,[]);
}catch(e){if(page){report.failure=e.stack;await page.screenshot({path:path.join(root,'artifacts/ai-controller-failure.png')});}throw e;}
finally{fs.writeFileSync(path.join(root,'artifacts/ai-controller-report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
