const {launch,openGame}=require('../tests/support.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [stage,dir='dist']=process.argv.slice(2);
const sizes=[[1440,900],[390,844],[1280,720],[844,390]];
(async()=>{
 const b=await launch();
 try{
  for(const [width,height] of sizes){
   const {page,context,errors}=await openGame(b,dir,{viewport:{width,height},hasTouch:width<900,isMobile:width<900,preferences:{quality:'low',reduced:true,muted:true,effects:0,music:0,cinematic:false}},false);
   const folder='artifacts/court/'+stage+'/'+width+'x'+height;fs.mkdirSync(folder,{recursive:true});
   const shot=async name=>{
    await page.evaluate(async()=>{document.activeElement?.blur?.();window.scrollTo(0,0);await document.fonts.ready;for(const img of document.images)await img.decode().catch(()=>{});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await page.screenshot({path:path.join(folder,name+'.png'),animations:'disabled'});console.log(stage,width,height,name);
   };
   await shot('home');
   await page.getByRole('button',{name:/开启棋局/}).click();await shot('classic');
   await page.getByRole('button',{name:/祭典模式/}).click();await shot('ritual');
   await page.getByRole('button',{name:/人机对战/}).click();
   await page.getByRole('button',{name:/全知者.*帷幕之外/}).click();await shot('ai');
   await page.getByRole('button',{name:'开始全知挑战'}).click();await page.waitForSelector('canvas[data-ready=true]');await shot('setup');
   await page.getByRole('button',{name:'确认布阵'}).click();await page.waitForSelector('.phase-play');await shot('play');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
