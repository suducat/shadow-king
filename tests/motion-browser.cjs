const {openGame,launch,holdFrame}=require('./support.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await launch();
 try{
  for(const touch of [false,true]){
   const {context,page,errors}=await openGame(browser,'dist-test',{viewport:touch?{width:390,height:844}:{width:1080,height:720},hasTouch:touch,isMobile:touch,deviceScaleFactor:.8,reducedMotion:touch?'reduce':'no-preference',preferences:{quality:'low',reduced:touch,cinematic:true,muted:true,music:0,effects:0}});
   const press=async(x,y,h=.14)=>{const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
   const hold=t=>holdFrame(page,t);
   const start=async()=>{await page.evaluate(()=>{window.__SK_QA__.holdAction(.2);return window.__SK_QA__.loadFixture('capture','guard');});await page.waitForSelector('canvas[data-ready=true]');await press(3,3,.8);await press(3,2);};
   await start();await hold(.2);
   const count=()=>page.locator('.right-sidebar h2 span').innerText();
   assert.equal(await count(),'00');
   const hit=await hold(.61);assert.equal(hit.victims[0].role,'unknown');assert.equal(hit.victims[0].disclosed,false);assert.equal(await count(),'00');
   await hold(.71);await page.waitForFunction(()=>document.querySelector('.right-sidebar h2 span')?.textContent==='01');
   assert.equal(await page.locator('.impact-disclosure').innerText(),'封印破碎 · 影卫');
   await page.getByRole('button',{name:'跳过动作',exact:true}).click();await page.waitForSelector('.reveal-card');
   const state=await page.evaluate(()=>window.__SK_QA__.snapshot());
   assert.equal(state.game.captures.length,1);assert.equal(state.game.ply,1);assert.equal(state.fxState.action,false);assert.equal(state.fxState.transients,0);
   await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForSelector('.handoff-screen');
   await start();await hold(.61);await page.getByRole('button',{name:'暗王主菜单'}).click();await page.getByRole('button',{name:'返回主菜单',exact:true}).click();await page.waitForSelector('.phase-menu');
   assert.equal(await page.locator('.skip-battle,.reveal-card,.impact-disclosure').count(),0);
   assert.equal(await page.evaluate(()=>window.__SK_QA__.snapshot().fxState.transients),0);
   assert.deepEqual(errors,[]);await context.close();console.log('PASS',touch?'390×844 touch / reduced':'1080×720 mouse / full motion','disclosure, skip, exit during motion');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
