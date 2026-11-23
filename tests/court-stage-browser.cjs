const assert=require('node:assert/strict');
const {launch,openGame}=require('./support.cjs');

(async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await openGame(browser,'dist-test',{
   viewport:{width:1366,height:900},deviceScaleFactor:.65,hasTouch:true,isMobile:false,
   preferences:{quality:'low',reduced:false,cinematic:false,muted:true},
  });
  await page.locator('.court-hero-art svg').waitFor();
  await page.getByRole('button',{name:/开启棋局/}).click();
  await page.getByText('推荐',{exact:true}).waitFor();
  assert.equal(await page.getByText('什么是祭典模式',{exact:true}).count(),0);
  await page.getByRole('button',{name:/祭典模式/}).click();
  await page.getByText('什么是祭典模式').click();
  await page.getByText(/死士全灭只会开启祭台/).waitFor();
  await page.getByRole('button',{name:/经典模式/}).click();
  assert.equal(await page.getByText('什么是祭典模式',{exact:true}).count(),0);
  await page.evaluate(()=>window.__SK_QA__.loadRitualFixture('counter'));
  const ready=()=>page.waitForSelector('canvas[data-ready=true]');
  await ready();
  const icon=page.getByRole('button',{name:/战局纪事/});
  const chronicle=page.locator('#court-chronicle');
  const bounds=await page.locator('canvas').boundingBox();
  assert.ok(bounds.width>800);
  await icon.click();await chronicle.waitFor({state:'visible'});
  assert.deepEqual(await page.locator('canvas').boundingBox(),bounds);
  await page.getByRole('button',{name:'关闭战局纪事'}).click();
  await chronicle.waitFor({state:'hidden'});
  const radius=()=>page.evaluate(()=>{
   const qa=window.__SK_QA__;qa.project(3,3);
   return Math.hypot(...qa.snapshot().debugProject.position);
  });
  const initial=await radius();
  await page.getByRole('button',{name:'放大',exact:true}).click();
  await page.waitForFunction(()=>window.__SK_QA__.snapshot().camera.zoom>1.09);
  await ready();
  assert.ok(await radius()<initial*.94);
  for(const name of ['旋转棋盘','缩小']){
   const before=await radius();
   await page.getByRole('button',{name,exact:true}).click();
   await page.waitForFunction(()=>{
    const q=window.__SK_QA__.snapshot().camera;
    return Math.abs(q.zoom-q.desiredZoom)<.002&&Math.abs(q.angle-q.desiredAngle)<.002;
   });
   const after=await radius();
   assert.ok(name==='旋转棋盘'?Math.abs(after-before)<.01:after>before);
  }
  await page.setViewportSize({width:390,height:844});await ready();
  const selected=await page.evaluate(()=>window.__SK_QA__.snapshot().selected);
  const box=await page.locator('canvas').boundingBox();
  const client=await page.context().newCDPSession(page);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  const touches=async(type,span)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:span?[{x:x-span,y,id:1},{x:x+span,y,id:2}]:[]});
  await touches('touchStart',42);await touches('touchMove',62);await touches('touchEnd',0);
  await page.waitForFunction(()=>window.__SK_QA__.snapshot().camera.zoom>1.25);
  assert.equal(await page.evaluate(()=>window.__SK_QA__.snapshot().selected),selected);
  assert.deepEqual(errors,[]);
  console.log('PASS 2D homepage, ritual guide, board width, collapsible chronicle, orbit, zoom and pinch');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
