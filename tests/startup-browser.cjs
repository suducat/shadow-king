const assert=require('node:assert/strict');
const {openGame,launch}=require('./support.cjs');
(async()=>{
 const browser=await launch();
 try{
  for(const mobile of [false,true]){
   const {page,context,errors}=await openGame(browser,'dist',{
    viewport:mobile?{width:390,height:844}:{width:1440,height:900},
    isMobile:mobile,hasTouch:mobile,preferences:{reduced:true,quality:'low',muted:true},
   },false);
   const requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name));
   assert.ok(!requests.some(url=>/\/assets\/(scene|fallen\.worker)-/.test(url)));
   assert.equal(await page.locator('canvas').count(),0);
   assert.equal(await page.locator('.local-note').count(),0);
   await page.getByRole('button',{name:'制作信息'}).click();
   await page.getByRole('link',{name:/suducat.*GitHub/}).waitFor();
   assert.equal(await page.getByText('神秘 · 谋略 · 命运',{exact:true}).count(),0);
   await page.getByRole('button',{name:'关闭',exact:true}).click();
   await page.getByRole('button',{name:/开启棋局/}).click();
   const explanation=page.getByText('什么是祭典模式',{exact:true});
   assert.equal(await explanation.count(),0);
   await page.getByRole('button',{name:/祭典模式/}).click();
   await explanation.click();
   await page.getByText(/死士全灭只会开启祭台/).waitFor();
   assert.equal(await page.locator('canvas').count(),0);
   await page.getByRole('button',{name:/经典模式/}).click();
   assert.equal(await explanation.count(),0);
   await page.getByRole('button',{name:/本地双人/}).click();
   await page.getByRole('button',{name:'我是红方，揭开帷幕'}).click();
   await page.waitForSelector('canvas[data-ready=true]');
   assert.deepEqual(errors,[]);
   await context.close();
   console.log(mobile?'PASS mobile startup':'PASS desktop startup');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
