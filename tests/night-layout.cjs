const assert=require('node:assert/strict');
const {launch,openGame}=require('./support.cjs');
(async()=>{
 const browser=await launch();
 try{
  for(const [width,height] of [[1440,900],[1280,720],[390,844],[844,390]]){
   const {context,page,errors}=await openGame(browser,'dist-test',{viewport:{width,height},hasTouch:width<900,isMobile:width<900,preferences:{quality:'low',reduced:true,muted:true}});
   const press=async el=>width<900?el.tap():el.click();
   const button=name=>page.getByRole('button',{name});
   await press(button(/开启棋局/));
   const entry=button('人机对战'),box=await entry.boundingBox();
   assert.ok(box.y+box.height<=height,'entry on first screen');
   await press(button('祭典模式'));assert.deepEqual(await entry.boundingBox(),box);
   assert.match(await page.locator('figcaption').innerText(),/一次完整回应/);
   await press(entry);assert.equal(await page.locator('.hall-rank').count(),5);
   await press(button(/全知者/));assert.match(await page.locator('#omniscient-disclosure').innerText(),/能够看见你的全部棋子身份/);
   await press(button(/诡相/));assert.equal(await page.locator('#omniscient-disclosure').count(),0);
   await press(button('开始布阵'));await press(button('确认布阵'));
   await page.waitForSelector('canvas[data-ready=true]');
   const result=await page.evaluate(()=>{
    const q=window.__SK_QA__,canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect(),tools=document.querySelector('.hall-camera').getBoundingClientRect();
    return {noOverlap:tools.bottom<=r.top||tools.top>=r.bottom||tools.right<=r.left||tools.left>=r.right,
      inside:[[0,0],[6,0],[0,6],[6,6],[3,3]].map(([x,y])=>{
       const p=q.project(x,y,.18);
       return r.left<p.x&&p.x<r.right&&r.top<p.y&&p.y<r.bottom&&p.x>=0&&p.x<innerWidth;
      }),overflow:document.documentElement.scrollWidth-innerWidth};
   });
   assert.ok(result.noOverlap,'camera controls share board pixels');assert.deepEqual(result.inside,[true,true,true,true,true]);assert.ok(result.overflow<=1,'horizontal scroll');
   assert.deepEqual(errors,[]);await context.close();console.log('PASS',width,height,'mode, five opponents, disclosure, deployment, grid corners and camera controls');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
