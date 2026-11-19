const {launch,openGame}=require('./support.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
 const browser=await launch();
 try{
  const out='artifacts/rule-entrance';
  fs.mkdirSync(out,{recursive:true});
  for(const mobile of [false,true]){
   const {page,context,errors}=await openGame(browser,'dist',{
    viewport:mobile?{width:390,height:844}:{width:1440,height:900},
    hasTouch:mobile,isMobile:mobile,preferences:{quality:'low',reduced:false,muted:true},
   },false);
   const press=name=>{
    const button=page.getByRole('button',{name});
    return mobile?button.tap():button.click();
   };
   await press(/开启棋局/);
   const local=page.getByRole('button',{name:/本地双人/});
   await local.waitFor();
   await page.locator('.rule-layout > .mode-panel').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
   const original=await local.boundingBox();
   const entrance=page.locator('.rule-entrance');
   for(const [rule,name,moving] of [['classic',/经典模式/,'.rule-blade'],['ritual',/祭典模式/,'.rule-king']]){
    await press(name);
    assert.equal(await entrance.getAttribute('data-rule'),rule);
    assert.equal(await entrance.locator(moving).evaluate(e=>getComputedStyle(e).animationDuration),'1.15s');
    assert.equal(await entrance.locator('canvas,img').count(),0);
    const box=await entrance.boundingBox();
    assert.ok(box.width>220&&box.x>=0);
    if(!mobile){
     assert.ok(box.x>original.x+original.width);
     assert.equal((await local.boundingBox()).y,original.y);
     await page.screenshot({path:out+'/'+rule+'.png',animations:'disabled'});
    }else{
     assert.ok(box.y>original.y+original.height);
     await entrance.screenshot({path:out+'/'+rule+'-phone.png',animations:'disabled'});
    }
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await entrance.locator('.rule-king').evaluate(e=>getComputedStyle(e).animationName),'none');
   await press(/人机对战/);
   assert.equal(await page.locator('.opponent-entrance').count(),1);
   assert.equal(await page.locator('.rule-entrance').count(),0);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('PASS',mobile?'mobile touch':'desktop mouse', 'mode switches, artwork and AI entry');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
