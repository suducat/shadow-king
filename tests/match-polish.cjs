const assert=require('node:assert/strict');
const {launch,openGame}=require('./support.cjs');

(async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await openGame(browser,'dist-test',{
   viewport:{width:1440,height:900},deviceScaleFactor:.65,preferences:{quality:'low',reduced:false,muted:true},
  });
  const button=name=>page.getByRole('button',{name,exact:true});
  await button('制作信息').click();
  assert.equal(await page.getByRole('link',{name:/suducat/}).getAttribute('href'),'https://github.com/suducat');
  await button('关闭').click();
  await page.getByRole('button',{name:/开启棋局/}).click();
  await page.getByRole('button',{name:/本地双人/}).click();
  await button('我是红方，揭开帷幕').click();await button('确认布阵').click();
  await button('我是蓝方，揭开帷幕').click();await button('确认布阵').click();
  const opening=await button('我是红方，揭开帷幕').evaluate(target=>new Promise(resolve=>{
   const observer=new MutationObserver(()=>{
    const intro=document.querySelector('.match-vignette[data-outcome=start]');
    if(intro){observer.disconnect();resolve(intro.textContent);}
   });
   observer.observe(document.body,{subtree:true,childList:true});
   target.click();
  }));
  assert.match(opening,/帷幕落下，红方先行/);
  await page.locator('.match-vignette[data-outcome=start]').waitFor({state:'detached'});
  const faces=await page.evaluate(()=>window.__SK_QA__.snapshot().actors);
  assert.ok(faces.filter(a=>a.id.startsWith('red-')).every(a=>Math.cos(a.facing)<-.99));
  assert.ok(faces.filter(a=>a.id.startsWith('blue-')).every(a=>Math.cos(a.facing)>.99));
  await page.evaluate(()=>window.__SK_QA__.loadRitualFixture('counter'));
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await page.waitForSelector('canvas[data-ready=true]');
   await page.locator('.altar-state-banner').waitFor();
   const board=await page.evaluate(()=>{
    const qa=window.__SK_QA__;
    const pts=[[-.5,-.5],[6.5,-.5],[-.5,6.5],[6.5,6.5]].map(([x,y])=>qa.project(x,y));
    return {x:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),y:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
   });
   for(const selector of ['.altar-state-banner','.camera-controls']){
    const {x,y,width,height}=await page.locator(selector).boundingBox();
    assert.ok(x>=0&&x+width<=viewport.width+.5,selector);
    assert.ok(x>=board.right||x+width<=board.x||y>=board.bottom||y+height<=board.y,JSON.stringify({selector,viewport,board,x,y,width,height}));
   }
   const fallen=await page.evaluate(()=>window.__SK_QA__.snapshot().fallen);
   assert.deepEqual(fallen,Array.from({length:3},()=>({side:'blue',role:'martyr'})));
   console.log('PASS',viewport.width,viewport.height,'board clearance and 3D fallen pieces');
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>window.__SK_QA__.loadFixture('king','guard','ai'));
  await page.locator('.sr-board button').nth(24).evaluate(b=>b.click());
  await page.locator('.sr-board button').nth(17).evaluate(b=>b.click());
  await button('继续').click();
  await page.locator('.match-vignette[data-outcome=loss] .opponent-entrance[data-rank=master]').waitFor({state:'attached'});
  await page.evaluate(()=>window.__SK_QA__.loadFixture('king','guard','ai'));
  await button('认输').click();await button('确认认输').click();
  await page.locator('.match-vignette[data-outcome=win] .opponent-entrance[data-rank=master]').waitFor({state:'attached'});
  assert.deepEqual(errors,[]);
  console.log('PASS AI defeat and victory vignettes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
