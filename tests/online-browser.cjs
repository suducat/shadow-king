const assert=require('node:assert/strict');
const {launch}=require('./support.cjs');
const base=process.env.SK_ONLINE_BASE||'http://127.0.0.1:18767/';
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const key=(page,x,y)=>page.locator('.sr-board button').nth(y*7+x).evaluate(element=>element.click());
const settled=(page,ply)=>page.waitForFunction(ply=>{const q=window.__SK_QA__?.snapshot();return q?.game.ply===ply&&!q.busy;},ply);
(async()=>{
 const browser=await launch();
 try{
  const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  const errors=[];
  for(const page of pages){
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    localStorage.setItem('shadow-king-settings',JSON.stringify({quality:'low',reduced:true,muted:true,music:0,effects:0}));
    const Real=window.WebSocket;window.courtSockets=[];
    window.WebSocket=class extends Real{
     constructor(url,protocols){super(url,protocols);if(protocols?.includes('shadow-king-v1'))window.courtSockets.push(this);}
    };
   });
  }
  await Promise.all(pages.map(async p=>{
   await p.goto(base);await p.getByRole('button',{name:/开启棋局/}).click();
   await p.getByRole('button',{name:/王庭邀约/}).click();
  }));
  const [red,blue]=pages;
  await red.getByRole('button',{name:/发起邀约/}).click();
  const code=await red.locator('.court-code').textContent();
  assert.match(code,/^\d{6}$/);
  await blue.getByRole('button',{name:/应邀入局/}).click();
  await blue.getByLabel('邀约密令').fill(code);
  await button(blue,'确认入局').click();
  await Promise.all(pages.map(p=>p.getByRole('heading',{name:'双王就位'}).waitFor()));
  await button(red,'就位').click();
  await button(blue,'就位').click();
  await Promise.all(pages.map(p=>p.waitForSelector('.phase-setup')));
  const redIds=await red.evaluate(()=>window.__SK_QA__.snapshot().rendered.filter(p=>p.side==='red').map(p=>p.id));
  await key(red,0,6);await key(red,1,6);
  await button(red,'准备').click();
  await button(blue,'准备').click();
  await Promise.all(pages.map(p=>p.waitForSelector('.phase-play')));
  await Promise.all(pages.map(p=>settled(p,0)));
  assert.equal(redIds.length,7);
  await key(red,0,6);await key(red,0,5);
  await Promise.all(pages.map(p=>settled(p,1)));
  await blue.evaluate(()=>window.courtSockets.at(-1).close(4007,'test interruption'));
  await blue.getByRole('heading',{name:'与王庭的连接暂时中断'}).waitFor();
  await blue.waitForFunction(()=>window.courtSockets.length===2&&window.courtSockets.at(-1).readyState===WebSocket.OPEN);
  await blue.getByRole('alertdialog').waitFor({state:'hidden'});
  await red.getByRole('alertdialog').waitFor({state:'hidden'});
  await Promise.all(pages.map(p=>settled(p,1)));
  const placement=await blue.evaluate(()=>window.__SK_QA__.snapshot().rendered.find(p=>p.x===0&&p.y===5));
  assert.equal(placement.role,'unknown');
  await key(blue,0,0);await key(blue,0,1);
  await Promise.all(pages.map(p=>settled(p,2)));
  await button(red,'离开王庭').click();
  await red.getByRole('dialog').getByRole('button',{name:'离开王庭',exact:true}).click();
  await blue.getByRole('alertdialog').getByRole('heading',{name:'对方暂离王庭'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS desktop and mobile-emulated UI, actual WebSocket, secret setup, moves, automatic reconnect and leave');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
