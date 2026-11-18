const{launch,openGame,root}=require('./support.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const report={checks:[],errors:[]},mark=s=>{report.checks.push(s);console.log('PASS',s)};
(async()=>{const browser=await launch();let page;try{
 const b=await openGame(browser,'dist',{deviceScaleFactor:.65},false);page=b.page;report.errors=b.errors;
 assert.equal(await page.evaluate(()=>typeof window.__SK_QA__),'undefined');
 const key=async(x,y)=>{await page.locator('.sr-board button').nth(y*7+x).focus();await page.keyboard.press('Enter')};
 const hand=async side=>{await page.getByRole('button',{name:`我是${side==='red'?'红':'蓝'}方，揭开帷幕`}).click();await page.waitForSelector('canvas[data-ready=true]');};
 await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/祭典模式/}).click();await page.getByRole('button',{name:/本地双人/}).click();await hand('red');await page.getByRole('button',{name:'确认布阵'}).click();await hand('blue');await page.getByRole('button',{name:'确认布阵'}).click();await hand('red');
 await key(0,6);await page.getByRole('button',{name:'蓄力',exact:true}).click();await key(0,5);await hand('blue');assert.match(await page.locator('.sr-board button').nth(35).getAttribute('aria-label'),/绯红王庭 影卫/);
 await key(6,0);await key(6,1);await hand('red');await key(0,5);await page.getByRole('button',{name:'斩杀',exact:true}).click();await hand('blue');assert.match(await page.locator('.sr-board button').nth(21).getAttribute('aria-label'),/绯红王庭 影卫/);
 await key(6,1);await key(6,2);await hand('red');await key(0,3);assert.equal(await page.getByRole('button',{name:'蓄力',exact:true}).count(),0);assert.match(await page.locator('.guard-controls').innerText(),/已使用/);await key(1,3);await hand('blue');mark('生产祭典本地对局：布阵、移动蓄力、公开、向前空斩、一次用尽后普通移动');
 await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();
 for(const name of ['棋侍','影谋','诡相','无冕者']){
  await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/祭典模式/}).click();await page.getByRole('button',{name:/人机对战/}).click();await page.getByRole('button',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'开始布阵',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();
  await key(1,6);await key(1,5);await page.waitForFunction(()=>document.querySelector('.match-ply')?.textContent==='2 步已落定'&&!/揭晓|思考/.test(document.querySelector('.board-bottom p')?.textContent||''),null,{timeout:60000});
  const inputs=await page.evaluate(()=>window.__AI_MESSAGES__),m=inputs.at(-1);assert.equal(m.observation.rules.id,'shadow-king-rite-v2');assert.ok(!('seen'in m.observation));assert.ok(m.observation.pieces.filter(p=>p.side==='red').every(p=>p.role==='unknown'));const outputs=await page.evaluate(()=>window.__AI_RESULTS__);assert.ok(outputs.at(-1).decision?.action);assert.equal(await page.evaluate(()=>typeof window.__SK_QA__),'undefined');
  mark(`生产${name}：真实祭典Worker行动及回合完成，输入无玩家暗身份`);await page.getByRole('button',{name:'暗王主菜单',exact:true}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).last().click();
 }
 await page.getByRole('button',{name:/开启棋局/}).click();await page.getByRole('button',{name:/经典模式/}).click();await page.getByRole('button',{name:/人机对战/}).click();await page.getByRole('button',{name:/影谋/}).click();await page.getByRole('button',{name:'开始布阵',exact:true}).click();await page.getByRole('button',{name:'确认布阵'}).click();await key(1,6);await key(1,5);await page.waitForFunction(()=>document.querySelector('.match-ply')?.textContent==='2 步已落定'&&!/揭晓|思考/.test(document.querySelector('.board-bottom p')?.textContent||''),null,{timeout:60000});assert.equal(await page.locator('.ritual-status').count(),0);const classic=await page.evaluate(()=>window.__AI_MESSAGES__.at(-1));assert.equal(classic.observation.rules.id,'shadow-king-standard-v1');mark('切换经典AI后使用原规则，无祭典状态或技能面板');
 assert.deepEqual(report.errors,[]);report.complete=true;
}catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(root,'artifacts/rite-production-failure.png')}).catch(()=>{});throw e;}
finally{fs.writeFileSync(path.join(root,'artifacts/rite-production-report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
