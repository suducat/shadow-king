const assert = require('node:assert/strict');
const { launch, openGame } = require('./support.cjs');

async function examine(browser, width, height, touch) {
  const { page, context, errors } = await openGame(browser, 'dist-test', {
    viewport: { width, height }, isMobile: touch, hasTouch: touch,
    reducedMotion: 'reduce', preferences: { reduced: true, quality: 'low', muted: true }
  });
  try {
    const button = name => page.getByRole('button', { name });
    const press = el => touch ? el.tap() : el.click();
    const ready = () => page.waitForSelector('canvas[data-ready=true]');
    const current = () => page.evaluate(() => window.__SK_QA__.snapshot());
    async function checkTarget(el) {
      assert.ok(await el.evaluate(node => {
        const r=node.getBoundingClientRect();
        return r.width>=42 && r.height>=43 && r.left>=0 && r.right<=innerWidth+1 &&
          r.top>=0 && r.bottom<=innerHeight+1 && node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }), 'Visible, unobscured first-screen control: '+await el.innerText());
    }
    async function cell(x,y,h=.14) {
      const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);
      if(touch) await page.touchscreen.tap(p.x,p.y);
      else await page.mouse.click(p.x,p.y);
    }
    await checkTarget(button(/开启棋局/));
    await press(button(/开启棋局/));
    const ai=button(/人机对战/), initial=await ai.boundingBox();
    const caption=await page.locator('figcaption h2').boundingBox();
    await press(button(/祭典模式/));
    assert.equal((await page.locator('figcaption h2').boundingBox()).y,caption.y);
    assert.deepEqual(await ai.boundingBox(),initial,'rule switch moves action');
    assert.match(await page.locator('figcaption').innerText(),/守过对手一次回应/);
    await press(button(/经典模式/));
    assert.match(await page.locator('figcaption').innerText(),/立即获胜/);
    await checkTarget(ai);
    await press(ai);
    await press(button(/全知者.*帷幕之外/));
    await checkTarget(button('开始全知挑战'));
    assert.match(await page.locator('#omniscient-disclosure').innerText(),/你仍无法看见/);
    await press(button(/棋侍.*初识棋道/));
    assert.equal(await page.locator('#omniscient-disclosure').count(),0);
    await press(button('开始布阵'));
    await ready();
    const start=button('确认布阵');
    await checkTarget(start);
    const geometry=await page.evaluate(()=>{
      const q=window.__SK_QA__, canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
      const corners=[0,6].flatMap(x=>[0,6].flatMap(y=>[.14,1.85].map(h=>q.project(x,y,h))));
      return {
        fits:corners.every(p=>p.x>=r.left&&p.x<r.right&&p.y>=r.top&&p.y<r.bottom),
        clear:corners.every(p=>document.elementFromPoint(p.x,p.y)===canvas),
        width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight
      };
    });
    assert.deepEqual(geometry,{fits:true,clear:true,width,height});
    const at0=(await current()).game.pieces.find(p=>p.x===0&&p.y===6).id;
    await cell(0,6,.75);await cell(1,6,.75);
    assert.equal((await current()).game.pieces.find(p=>p.id===at0).x,1);
    await press(start);
    await ready();
    for(const [label,title] of [['规则手册','永夜法则'],['查看完整战报','战局纪事']]){
      const trigger=button(label);
      await trigger.focus();await page.keyboard.press('Enter');
      const drawer=page.getByRole('dialog',{name:title});
      assert.ok(await drawer.isVisible());
      assert.ok(await drawer.evaluate(node=>node.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.ok(await trigger.evaluate(node=>node===document.activeElement));
    }
    await cell(1,6,.75);await cell(1,5);
    await page.waitForFunction(()=>window.__SK_QA__.snapshot().game.ply===2&&!window.__SK_QA__.snapshot().busy);
    assert.equal((await current()).game.pieces.find(p=>p.id===at0).y,5);
    if(width===390){
      await page.evaluate(()=>window.__SK_QA__.loadRitualFixture('ready'));
      await ready();
      await cell(3,3,.8);
      await press(button('斩杀'));
      for(let i=0;i<2;i++)await press(page.getByRole('button',{name:'继续',exact:true}));
      await press(button('我是蓝方，揭开帷幕'));
      await press(button('查看完整战报'));
      const events=page.locator('.court-drawer .chronicle article');
      assert.equal(await events.count(),2);
      assert.ok(await events.first().isVisible()&&await events.last().isVisible());
      console.log('PASS mobile public chronicle retains both execution victims');
    }
    assert.deepEqual(errors,[]);
    console.log('PASS',width+'×'+height,touch?'touch':'mouse','stable rules, difficulty, deployment swap, unobscured corners, drawers and first move + AI reply');
  }finally{await context.close();}
}

(async()=>{
  const browser=await launch();
  try {
    for(const [w,h,touch] of [[1440,900,false],[1280,720,false],[390,844,true],[844,390,true]])await examine(browser,w,h,touch);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
