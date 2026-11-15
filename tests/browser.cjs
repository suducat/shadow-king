// Real Chromium/WebGL tests. Static responses come from dist-test (no preview server,
// account login, network dependency, mocked renderer or synthetic game click handler).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const out = path.join(root,'artifacts'); fs.mkdirSync(out,{recursive:true});
let activePage;
const report = { browser:'Chromium / WebGL', checks:[], errors:[], started:new Date().toISOString() };
const mark = name => { report.checks.push(name); console.log('PASS',name); };
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff'};
async function routeBuild(page,dir='dist-test') {
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'shadow-king.test') return route.abort();
    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.join(root,dir,rel);
    if (!file.startsWith(path.join(root,dir)+path.sep)) return route.abort();
    try { await route.fulfill({status:200,contentType:mime[path.extname(file)]||'text/plain',body:fs.readFileSync(file)}); }
    catch { await route.fulfill({status:404,body:'missing test asset'}); }
  });
}
const snap = page => page.evaluate(() => window.__SK_QA__.snapshot());
async function settled(page) {
  await page.waitForFunction(() => { const s=window.__SK_QA__?.snapshot(); return s?.camera && s.layoutReady && s.actors.length===s.game.pieces.length && s.actors.every(a=>Math.abs(a.x-a.targetX)<.005&&Math.abs(a.y-a.targetY)<.005) && s.camera.viewer===s.viewer && Math.abs(s.camera.angle-s.camera.desiredAngle)<.0008 && Math.abs(s.camera.zoom-s.camera.desiredZoom)<.001; },null,{timeout:20000});
}
async function fixture(page,name,role='king') {
  await page.evaluate(([name,role])=>window.__SK_QA__.loadFixture(name,role),[name,role]);
  await settled(page);
}
async function click(page,x,y,height=.14,touch=false) {
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,height]);
  assert.ok(p && Number.isFinite(p.x));
  const hit=await page.evaluate(p=>{const el=document.elementFromPoint(p.x,p.y);return {tag:el?.tagName,cls:el?.className};},p);
  if(hit.tag!=='CANVAS') throw new Error(`Canvas intercepted at cell ${x},${y}: ${JSON.stringify({p,hit})}`);
  if(touch)await page.touchscreen.tap(p.x,p.y);
  else { await page.mouse.move(p.x-3,p.y+2); await page.mouse.click(p.x,p.y); }
}
async function boot(page) {
  await routeBuild(page); page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))report.errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('shadow-king-settings',JSON.stringify({music:.32,effects:.65,muted:false,cinematic:true,reduced:true})));
  await page.goto('http://shadow-king.test/');
  await page.waitForFunction(()=>window.__SK_QA__);
  assert.equal(await page.locator('.fallback-board').count(),0,'must test real 3D, not fallback');
}
async function newGame(page) {
  await page.getByRole('button',{name:/开启棋局/}).click();
  await page.getByRole('button',{name:/本地双人/}).click();
  await page.getByRole('button',{name:'我是红方，揭开帷幕'}).click();
  await settled(page);
  // Swap and swap back through actual 3D bodies, preserving the intended opening.
  await click(page,0,6,.8); await click(page,3,6,.8);
  const setupSnapshot=await snap(page);
  assert.equal(setupSnapshot.game.pieces.find(p=>p.id==='red-0').x,3);
  await page.waitForTimeout(100);await click(page,0,6,.8); await click(page,3,6,.8);
  await page.waitForTimeout(100);await page.getByRole('button',{name:'确认布阵'}).click();
  assert.ok((await snap(page)).rendered.every(p=>p.role==='unknown'));
  await page.getByRole('button',{name:'我是蓝方，揭开帷幕'}).click();
  await page.getByRole('button',{name:'确认布阵'}).click();
  await page.getByRole('button',{name:'我是红方，揭开帷幕'}).click(); await settled(page);
}
(async()=>{
  const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({headless:true,executablePath:executable,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const context=await browser.newContext({viewport:process.env.COMBAT?{width:1280,height:840}:{width:1440,height:950},deviceScaleFactor:process.env.COMBAT?.75:1,reducedMotion:'no-preference'});
    context.setDefaultTimeout(60000);const page=await context.newPage(); activePage=page; await boot(page);
    if(!process.env.COMBAT){
    await page.screenshot({timeout:60000,path:path.join(out,'v02-menu.png')});
    await newGame(page); mark('真实3D秘密布阵交换、隐私清空、双方确认与红方先行');
    for(let x=0;x<7;x++) {
      await page.keyboard.press('Escape');await click(page,x,6,.78);
      const s=await snap(page); assert.equal(s.selected,'red-'+x,`body ${x},6 selected ${s.selected}`);
    }
    for(const x of [0,1,3]){await page.keyboard.press('Escape');await click(page,x,6,1.45);assert.equal((await snap(page)).selected,'red-'+x);}
    const modelCheck=await snap(page);report.models=modelCheck.models;report.renderInfo=modelCheck.renderInfo;
    assert.equal(new Set(modelCheck.models.filter(m=>m.role==='unknown').map(m=>m.vertices)).size,1);
    assert.equal(new Set(modelCheck.models.filter(m=>m.role!=='unknown').map(m=>m.vertices)).size,3);
    await page.screenshot({timeout:60000,path:path.join(out,'v02-board.png')});
    mark('逐枚点击7枚棋子与3类角色头部均准确；3种模型结构不同，敌方模型统一');
    await fixture(page,'corners');
    for(const [x,y] of [[0,0],[6,0],[0,6],[6,6],[3,3]])for(const height of [.14,.78]) {
      await page.keyboard.press('Escape');await click(page,x,y,height);
      const s=await snap(page),p=s.game.pieces.find(p=>p.x===x&&p.y===y);
      assert.equal(s.selected,p.id,`corner/center ${x},${y},height=${height}; hit=${JSON.stringify(s.lastHit)}`);
    }
    mark('四角与中心：棋盘平面和棋子主体点击全部准确');
    await page.getByRole('button',{name:'旋转棋盘',exact:true}).click(); await settled(page);
    await page.getByRole('button',{name:'放大',exact:true}).click();
    await page.waitForTimeout(1000);
    await page.locator('.scene-host').evaluate(el=>{el.style.transform='translate(17px, 9px) scale(.9)';});
    await page.waitForFunction(()=>Math.abs(document.querySelector('canvas').getBoundingClientRect().width-900)<1);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    for(const [x,y] of [[0,0],[6,0],[0,6],[6,6],[3,3]]) {
      await page.keyboard.press('Escape');await click(page,x,y,.78); const s=await snap(page);
      assert.equal(s.selected,s.game.pieces.find(p=>p.x===x&&p.y===y).id);
    }
    mark('旋转90度、缩放、Canvas CSS偏移/缩放后，四角与中心仍准确');
    await page.locator('.scene-host').evaluate(el=>el.style.transform='');
    await fixture(page,'capture','guard');
    await click(page,3,3,.78);const id=(await snap(page)).selected;assert.ok(id);
    await click(page,4,2);assert.equal((await snap(page)).game.ply,0);assert.equal((await snap(page)).selected,id);
    await click(page,0,6,.14);assert.equal((await snap(page)).game.ply,0);
    await page.keyboard.press('Escape');await click(page,3,2,.78);assert.equal((await snap(page)).selected,null);
    mark('斜向移动、占据己方格和直接控制敌子均被阻止');
    await click(page,3,3,.78);const doublePoint=await page.evaluate(()=>window.__SK_QA__.project(4,3,.14));await page.mouse.dblclick(doublePoint.x,doublePoint.y,{delay:5});
    await page.waitForFunction(()=>window.__SK_QA__.snapshot().phase==='handoff');
    const moved=await snap(page); assert.equal(moved.game.ply,1);
    const actor=moved.actors.find(p=>p.id===id);assert.ok(Math.abs(actor.x-4)<.01&&Math.abs(actor.y-3)<.01);
    assert.ok(!moved.game.pieces.some(p=>p.x===3&&p.y===3));assert.equal(moved.game.turn,'blue');
    assert.ok(moved.rendered.every(p=>p.role==='unknown'));assert.equal(moved.activeBurst,false);assert.equal(moved.audioEffects,0);
    mark('合法移动、原格清空、渲染/逻辑坐标同步、重复点击锁定及回合隐私交接');
    }
    if((await snap(page)).phase==='handoff')await page.getByRole('button',{name:'我是蓝方，揭开帷幕'}).click();
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('#reduced').click();await page.getByRole('button',{name:'关闭',exact:true}).click();
    if(!process.env.ENDINGS)for(const role of ['king','guard','martyr']) {
      await fixture(page,'capture',role);await click(page,3,3,.78);await click(page,3,2,.14);
      await page.waitForSelector('.reveal-card');
      const attack=await snap(page);assert.equal(attack.attack.role,role);assert.equal(attack.attack.dissolved,true);assert.equal(attack.audioState,'running');
      assert.match(await page.locator('.reveal-card').innerText(),/影卫/);
      await page.screenshot({timeout:60000,path:path.join(out,`v02-capture-${role}.png`)});
      await page.getByRole('button',{name:'继续',exact:true}).click();
      await page.waitForFunction(()=>window.__SK_QA__.snapshot().phase==='handoff');
      const s=await snap(page);assert.equal(s.activeBurst,false);assert.equal(s.audioEffects,0);assert.equal(s.game.captures.length,1);assert.equal(s.game.turn,'blue');assert.equal(s.game.pieces.length,13);
    }
    if(!process.env.ENDINGS)mark('王/影卫/死士3种攻击均实际吃子、揭示身份并正确交接');
    for(const [ending,title,winner] of [['king','王权陨落','red'],['guard','影卫尽灭','red'],['martyr','终焉之祭','blue']]) {
      await fixture(page,ending,'king');await click(page,3,3,.78);await click(page,3,2);
      await page.waitForSelector('.reveal-card');await page.getByRole('button',{name:'继续',exact:true}).click();
      await page.waitForSelector('.result-screen');assert.equal((await snap(page)).lastSound,'end-'+ending);assert.equal((await snap(page)).game.result.winner,winner);
      assert.ok(await page.locator('.result-screen').evaluate((el,c)=>el.classList.contains('ending-'+c),ending));
      assert.equal(await page.locator('.result-copy h1').innerText(),title);
      if(ending==='martyr'){const delays=await page.locator('.sacrifice-mark').evaluateAll(els=>els.map(el=>getComputedStyle(el).animationDelay));assert.equal(new Set(delays).size,1);}
      await page.waitForFunction(()=>{const el=document.querySelector('.result-screen'),copy=document.querySelector('.result-copy');return el&&copy&&+getComputedStyle(el).opacity>.98&&+getComputedStyle(copy).opacity>.98;},null,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('.end-cinematic').getAnimations({subtree:true}).some(a=>/crown-shard|oath-extinguish|seal-unfold/.test(a.animationName)&&a.currentTime>600),null,{timeout:10000});
      assert.equal(await page.evaluate(()=>!!document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('.result-screen')),true,'result overlay must be visibly on top of the board');
      await page.waitForTimeout(1200);report['endingStyle-'+ending]=await page.locator('.result-screen').evaluate(el=>({decor:[...el.querySelectorAll('.end-cinematic svg')].map(s=>({class:s.getAttribute('class'),rect:s.getBoundingClientRect().toJSON(),opacity:getComputedStyle(s).opacity,paths:[...s.querySelectorAll('path')].slice(0,8).map(p=>({opacity:getComputedStyle(p).opacity,fill:getComputedStyle(p).fill,transform:getComputedStyle(p).transform}))})),animations:el.getAnimations({subtree:true}).map(a=>({name:a.animationName,time:a.currentTime,state:a.playState})),opacity:getComputedStyle(el).opacity,z:getComputedStyle(el).zIndex,rect:el.getBoundingClientRect().toJSON(),center:document.elementFromPoint(innerWidth/2,innerHeight/2)?.className}));await page.screenshot({timeout:60000,path:path.join(out,`v02-ending-${ending}.png`)});
      mark('实际触发结算：'+title+' / '+winner);
    }
    if(process.env.COMBAT){assert.deepEqual(report.errors,[]);return;}
    await page.reload();await page.waitForFunction(()=>window.__SK_QA__);await newGame(page);
    const sequence=[['red',3,6,3,5],['blue',3,0,3,1],['red',3,5,3,4],['blue',3,1,3,2],['red',3,4,3,3],['blue',3,2,4,2],['red',3,3,4,3],['blue',4,2,4,3]];
    for(let i=0;i<sequence.length;i++) {
      const [side,x,y,tx,ty]=sequence[i];await settled(page);assert.equal((await snap(page)).viewer,side);
      await click(page,x,y,.78);await click(page,tx,ty);
      if(i===sequence.length-1){await page.waitForSelector('.reveal-card');await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForSelector('.result-screen');}
      else {await page.waitForSelector('.handoff-screen');await page.getByRole('button',{name:`我是${side==='red'?'蓝':'红'}方，揭开帷幕`}).click();}
    }
    assert.deepEqual((await snap(page)).game.result,{winner:'blue',reason:'king'});assert.equal((await snap(page)).game.ply,8);
    mark('一场完整对局：正常布阵后双方轮流8步，以真实点击弑王结束');
    await context.close();
    const mobile=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    mobile.setDefaultTimeout(20000);const touchPage=await mobile.newPage();activePage=touchPage;await boot(touchPage);await fixture(touchPage,'corners');
    for(const [x,y] of [[0,0],[6,0],[0,6],[6,6],[3,3]]) {
      await touchPage.keyboard.press('Escape');await click(touchPage,x,y,.78,true);const s=await snap(touchPage);
      assert.equal(s.selected,s.game.pieces.find(p=>p.x===x&&p.y===y).id);
    }
    await fixture(touchPage,'capture','martyr');await click(touchPage,3,3,.78,true);await click(touchPage,3,2,.14,true);
    await touchPage.waitForSelector('.reveal-card');assert.match(await touchPage.locator('.reveal-card').innerText(),/影卫/);
    await touchPage.screenshot({path:path.join(out,'v02-mobile.png')});
    mark('手机触控/DPR=2：四角、中心、选择、移动吃子与身份揭示');
    await mobile.close();
    assert.deepEqual(report.errors,[],'no browser exceptions or console errors');mark('所有场景无浏览器异常或控制台错误');
  } catch(e) {report.failure=e.stack;if(activePage){await activePage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.snapshot=await snap(activePage).catch(()=>null);}throw e;} finally {report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,process.env.ENDINGS?'endings-report.json':process.env.COMBAT?'combat-report.json':'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
