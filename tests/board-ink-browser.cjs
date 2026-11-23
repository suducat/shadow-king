const assert=require('node:assert/strict');
const {openGame,launch,holdFrame}=require('./support.cjs');

(async()=>{
 const browser=await launch();
 try{
  for(const mobile of [false,true]){
   const {page,context,errors}=await openGame(browser,'dist-test',{
    viewport:mobile?{width:390,height:844}:{width:1440,height:900},
    hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1,
    reducedMotion:mobile?'reduce':'no-preference',
    preferences:{quality:'low',reduced:mobile,cinematic:true,muted:true},
   });
   const portrait=page.locator('.home-portrait');
   assert.equal(await portrait.locator('.home-floor polygon').count(),49);
   const hero=page.locator('.court-hero-art');
   assert.equal(await hero.innerText(),'');
   assert.equal(await hero.locator('button').count(),0);
   if(!mobile){
    await page.screenshot({path:'artifacts/home-court-desktop.png'});
    await page.locator('.home-portrait[data-role="guard"]').waitFor({timeout:23000});
    assert.equal(await portrait.locator('.home-sword-light').count(),1);
    await page.locator('.home-portrait[data-role="martyr"]').waitFor({timeout:10000});
    await page.locator('.home-portrait[data-role="king"]').waitFor({timeout:10000});
   }else{
    await page.screenshot({path:'artifacts/home-court-mobile.png'});
    assert.equal(await portrait.getAttribute('data-role'),'king');
    assert.equal(await portrait.locator('.entrance-actor').evaluate(actor=>getComputedStyle(actor).animationName),'none');
   }
   await page.getByRole('button',{name:/开启棋局/}).click();
   await page.locator('.rule-entrance').waitFor();
   assert.equal(await portrait.count(),0);

   const mark=kind=>page.locator(`.board-ink [data-ink="${kind}"]`);
   const press=async(x,y,h=.14)=>{
    const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);
    if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
   };
   const load=async(name,t)=>{
    await page.evaluate(([name,t])=>{const q=window.__SK_QA__;q.holdAction(t);return name==='capture'?q.loadFixture('capture','guard'):q.loadRitualFixture(name);},[name,t]);
    await page.waitForSelector('canvas[data-ready=true]');
   };
   const location=async locator=>(await locator.getAttribute('transform')).match(/translate\(([-.\d]+) ([-.\d]+)\)/).slice(1).map(Number);
   const atTile=async(locator,x,y,h)=>{
    const [a,b]=await location(locator);
    const c=await page.locator('canvas').boundingBox();
    const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);
    assert.ok(Math.hypot(a+c.x-p.x,b+c.y-p.y)<32,`ink aligns with ${x},${y}`);
   };
   const skip=async()=>{
    await page.getByRole('button',{name:'跳过动作',exact:true}).click();
    assert.equal(await page.locator('.board-ink [data-ink]').count(),0);
   };
   await load('capture',.23);
   await press(3,3,.8);await press(4,3);
   await holdFrame(page,.23);
   if(mobile)assert.equal(await mark('slide').count(),0);
   else{
    const before=await location(mark('slide'));
    await holdFrame(page,.43);
    const after=await location(mark('slide'));
    assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])>4,'move streak follows moving piece');
   }
   await skip();

   await load('capture',.2);
   await press(3,3,.8);await press(3,2);
   await holdFrame(page,.2);
   assert.equal(await mark('impact').count(),0);
   const hit=await holdFrame(page,.61);
   assert.equal(hit.victims[0].role,'unknown');
   await atTile(mark('impact'),3,2,.73);
   await holdFrame(page,.71);
   assert.equal(await mark('soul').count(),mobile?0:1);
   await skip();
   await page.waitForSelector('.reveal-card');

   await load('execute-open',.45);
   await press(3,3,.8);
   await page.getByRole('button',{name:'斩杀',exact:true}).click();
   await holdFrame(page,.45);
   assert.equal(await mark('dash').count(),mobile?0:1);
   await holdFrame(page,.50);
   await atTile(mark('shatter').first(),3,2,.73);
   await atTile(mark('rite'),3,3,.25);
   await holdFrame(page,.61);
   assert.equal(await mark('shatter').count(),2);
   await atTile(mark('shatter').nth(1),3,1,.73);
   assert.equal(await page.locator('.court-flash').count(),0);
   await skip();
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('PASS',mobile?'390×844 touch / reduced':'1440×900 mouse / full motion','home portraits, airborne trail, impact, soul, both execution contacts, altar and skip');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
