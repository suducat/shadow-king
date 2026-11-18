const{launch,openGame,root}=require('./support.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await launch(),report={checks:[],errors:[]};let page;try{
 const game=await openGame(browser,'dist',{deviceScaleFactor:.75},false);page=game.page;report.errors=game.errors;
 assert.equal(await page.evaluate(()=>typeof window.__SK_QA__),'undefined');assert.equal(await page.locator('.fallback-board').count(),0);
 for(const name of ['棋侍','影谋','诡相','无冕者']){
  await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/人机对战/}).click();await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'开始布阵',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();
  await page.locator('.sr-board button').nth(6*7).focus();await page.keyboard.press('Enter');await page.locator('.sr-board button').nth(5*7).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.match-ply')?.textContent==='2 步已落定'&&!document.querySelector('.player-status')?.textContent.includes('思考'),null,{timeout:60000});
  assert.match(await page.locator('.sr-board button').nth(5*7).getAttribute('aria-label'),/绯红王庭 影卫/);assert.equal(await page.locator('.handoff-screen').count(),0);
  assert.equal(await page.evaluate(()=>typeof window.__SK_QA__),'undefined');
  const messages=await page.evaluate(()=>window.__AI_MESSAGES__);assert.ok(messages.length);const last=messages.at(-1);assert.ok(last.observation.pieces.filter(p=>p.side==='red').every(p=>p.role==='unknown'));assert.ok(!('seen' in last.observation));
  report.checks.push(`${name}: production setup, actual human action, actual Worker action, turn returns`);console.log('PASS',report.checks.at(-1));
  await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();
 }
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(root,'artifacts/production-ai-failure.png')});throw e;}
finally{fs.writeFileSync(path.join(root,'artifacts/production-ai-report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
