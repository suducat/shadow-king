const {launch,openGame}=require('../tests/support.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const [stage,dist]=process.argv.slice(2);
(async()=>{const b=await launch();try{
 for(const [width,height] of [[1440,900],[390,844]]){
  const {page,context,errors}=await openGame(b,dist,{viewport:{width,height},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600,preferences:{quality:'low',reduced:true,muted:true}},false);
  const out='artifacts/night/'+stage+'/'+width;fs.mkdirSync(out,{recursive:true});
  const shot=async name=>{await page.evaluate(async()=>{document.activeElement.blur();scrollTo(0,0);await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});};
  const press=async(name)=>{const el=page.getByRole('button',{name});if(width<600)await el.tap();else await el.click();};
  if(stage==='15')await page.waitForSelector('canvas[data-ready=true]');await shot('home');
  await press(/开启棋局/);await shot('classic');
  if(stage==='15')console.log('baseline scene display',width,await page.locator('.menu-scene').evaluate(el=>getComputedStyle(el).display));
  await press(/祭典模式/);await shot('rite');await press(/经典模式/);await press(/人机对战/);await press(/诡相.*落子为饵/);await shot('ai');
  await press('开始布阵');await press('确认布阵');await page.waitForSelector('canvas[data-ready=true]');await shot('play');
  assert.deepEqual(errors,[]);console.log(stage,width,'five scenes');await context.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
