const assert=require('node:assert/strict');
const fs=require('node:fs');
const dir='artifacts/combat-polish';
fs.mkdirSync(dir,{recursive:true});
const {launch,openGame,holdFrame}=require('./support.cjs');
(async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await openGame(browser,'dist-test',{deviceScaleFactor:.65,preferences:{quality:'low',reduced:false,cinematic:false,muted:true}});
  const button=name=>page.getByRole('button',{name,exact:true});
  const load=async name=>{
   await page.evaluate(name=>{const qa=window.__SK_QA__;qa.holdAction(0);return qa.loadRitualFixture(name);},name);
   await page.waitForSelector('canvas[data-ready=true]');
  };
  const cell=async(x,y)=>{
   const p=await page.evaluate(([x,y])=>window.__SK_QA__.project(x,y,.75),[x,y]);
   await page.mouse.click(p.x,p.y);
  };
  await load('counter');assert.equal((await page.evaluate(()=>window.__SK_QA__.combatFrame())).mantle,true);
  await page.screenshot({path:dir+'/altar.png'});
  await load('ready');await cell(3,3);await button('斩杀').click();
  const first=await holdFrame(page,.42);
  assert.deepEqual(first.activeSlash,[0]);assert.ok(first.particles.includes('chips'));
  assert.ok(Number(await page.locator('.execution-shade').evaluate(e=>e.style.opacity))>.55);
  await page.screenshot({path:dir+'/execution.png'});
  const second=await holdFrame(page,.76);assert.deepEqual(second.activeSlash,[1]);
  assert.deepEqual(second.cues.filter(e=>e.kind==='impact').slice(-2).map(e=>e.index),[0,1]);
  await button('跳过动作').click();await page.waitForSelector('.reveal-card');
  assert.equal(await page.locator('.execution-shade').evaluate(e=>e.style.opacity),'0');
  await page.evaluate(()=>{const qa=window.__SK_QA__;qa.holdAction(0);return qa.loadFixture('capture','martyr');});
  await page.waitForSelector('canvas[data-ready=true]');await cell(3,3);
  const target=await page.evaluate(()=>window.__SK_QA__.project(3,2,.14));await page.mouse.click(target.x,target.y);
  const sealed=await holdFrame(page,.61);
  assert.equal(sealed.victims[0].role,'unknown');assert.equal(await page.locator('.fallen-spirits li').count(),0);
  assert.ok((await holdFrame(page,.72)).particles.includes('ash'));
  await page.waitForSelector('.fallen-spirits li');
  await page.screenshot({path:dir+'/ashes.png'});
  await button('暗王主菜单').click();await button('返回主菜单').click();
  await page.getByRole('button',{name:/开启棋局/}).click();
  await page.getByRole('button',{name:/人机对战/}).click();
  for(const [name,id] of [['棋侍','easy'],['影谋','normal'],['诡相','hard'],['无冕者','master'],['全知者','omniscient']]){
   await page.getByRole('button',{name:new RegExp(name)}).click();
   const figure=page.locator(`.opponent-figure[data-rank="${id}"] img`);
   assert.equal(await figure.evaluate(async e=>{await e.decode();return getComputedStyle(e).animationDuration;}),'0.5s');
  }
  assert.equal(await page.locator('#omniscient-disclosure').count(),1);
  await page.screenshot({path:dir+'/opponent.png'});
  assert.deepEqual(errors,[]);console.log('PASS altar mantle, indexed shatter, execution shade cleanup, published ghosts and five portraits');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
