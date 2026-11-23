const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
const debug=process.env.SK_ONLINE_DEBUG==='1';
const formationOnly=process.env.SK_FORMATION_ONLY==='1';
const base=process.env.SK_ONLINE_BASE||'http://127.0.0.1:17367/shadow-king/';
const status=(p,text)=>p.locator('[role=alert]').filter({hasText:text}).waitFor();
const snap=p=>p.evaluate(()=>window.__SK_QA__.snapshot());
const press=(p,name)=>p.getByRole('button',{name,exact:true}).click();
const enter=async(p,rule)=>{
 await p.goto(base);
 await p.getByRole('button',{name:/开启棋局/}).click();
 await p.locator('.rules-selector').getByRole('button',{name:new RegExp(rule)}).click();
 await p.getByRole('button',{name:/王庭邀约/}).click();
};
const join=async(p,code)=>{
 await press(p,'应邀入局 凭密令进入另一座王庭。');
 await p.getByLabel('邀约密令').fill(code);
 await press(p,'确认入局');
};
const settled=(p,ply)=>p.waitForFunction(ply=>{
 const s=window.__SK_QA__.snapshot();return s.game.ply===ply&&!s.busy;
},ply);
const cell=(p,x,y)=>p.locator('.sr-board button').nth(y*7+x).evaluate(b=>b.click());
const touch=async(p,x,y,h)=>{
 await p.waitForSelector('canvas[data-ready=true]');
 const xy=await p.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);
 await p.touchscreen.tap(xy.x,xy.y);
};
const draw=async(p)=>p.waitForSelector('.phase-play');
const ready=async(p)=>p.getByRole('heading',{name:'双王就位'}).waitFor();
const publicState=s=>({
 board:s.rendered.map(({id,x,y,revealed,charging})=>({id,x,y,revealed,charging})),
 captures:s.game.captures,turn:s.game.turn,result:s.game.result,rite:s.game.ritual,lastAction:s.game.lastAction,
});
(async()=>{
 const browser=await chromium.launch({headless:true,
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:[...(new URL(base).hostname==='127.0.0.1'?['--no-proxy-server']:[]),...(formationOnly?['--disable-webgl']:[]),'--use-angle=swiftshader','--enable-unsafe-swiftshader',
   '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,LocalNetworkAccessChecksWebRTC,LocalNetworkAccessChecksWebSockets'],
 });
 try{
  const contexts=await Promise.all([
   browser.newContext({viewport:{width:1280,height:900}}),
   browser.newContext({viewport:{width:820,height:1180},deviceScaleFactor:1,isMobile:true,hasTouch:true}),
   browser.newContext({viewport:{width:390,height:844},hasTouch:true}),
  ]);
  for(const c of contexts){
   c.setDefaultTimeout(45_000);
   await c.addInitScript(()=>localStorage.setItem('shadow-king-settings',JSON.stringify({quality:'low',reduced:true,muted:true,music:0,effects:0})));
  }
  const [red,blue,third]=await Promise.all(contexts.map(c=>c.newPage()));
  const errors=[];[red,blue,third].forEach((p,i)=>{
   p.on('pageerror',e=>errors.push(e.message));
   if(debug)p.on('console',entry=>console.log(i,entry.type(),entry.text()));
  });
  await red.goto(base);
  await press(red,'快速玩法');
  const guide=red.getByRole('region',{name:'快速了解规则'});
  await guide.getByText(/立刻获胜/).waitFor();
  await enter(red,'经典模式');
  await red.getByRole('button',{name:/发起邀约/}).click();
  const room=red.locator('.court-code');
  await room.waitFor();
  const code=await room.textContent();assert.match(code,/^\d{6}$/);
  if(!formationOnly){
  await enter(third,'经典模式');await join(third,'000000');
  await status(third,'密令无效或已失效。');
  console.log('PASS six-digit invite and invalid code');
  await enter(blue,'祭典模式');await join(blue,code);
  await status(blue,/双方所选规则不同/).catch(async error=>{
   console.log('host and guest lobby at timeout',await red.locator('.court-summons').innerText(),await blue.locator('.court-summons').innerText());throw error;
  });
  console.log('PASS rule mismatch');
  await new Promise(r=>setTimeout(r,600));
  await enter(blue,'经典模式');
  await blue.evaluate(()=>{
   const original=RTCDataChannel.prototype.send;
   let interrupted=false;
   window.courtEnrollments=0;
   RTCDataChannel.prototype.send=function(data){
    if(ArrayBuffer.isView(data)){
     const text=new TextDecoder().decode(data);
     if(text.includes('"type":"enroll"')){
      window.courtEnrollments++;
      if(!interrupted){interrupted=true;return;}
     }
    }
    return original.call(this,data);
   };
  });
  }else await enter(blue,'经典模式');
  await join(blue,code);
  await Promise.all([ready(red),ready(blue)]);
  if(!formationOnly){
  assert.equal(await blue.evaluate(()=>window.courtEnrollments),2);
  console.log('PASS fresh retry after an interrupted handshake, without replacing the invite');
  await enter(third,'经典模式');await join(third,code);
  await status(third,'此局已有执棋者。');
  }
  await press(red,'就位');
  await blue.getByText('对方就位',{exact:true}).waitFor();
  await press(red,'取消就位');
  await blue.getByText('对方就位',{exact:true}).waitFor({state:'detached'});
  await press(blue,'就位');await press(red,'就位');
  await Promise.all([red.waitForSelector('.phase-setup'),blue.waitForSelector('.phase-setup')]);
  const royal=(await snap(red)).rendered.find(q=>q.side==='red'&&q.role==='king');
  const swapped=(royal.x+1)%7;
  await cell(red,royal.x,6);await cell(red,swapped,6);
  assert.equal((await snap(red)).rendered.find(q=>q.id===royal.id).x,swapped);
  await press(red,'准备');
  assert.equal((await snap(red)).phase,'setup');
  await press(blue,'准备');await Promise.all([draw(red),draw(blue)]);
  assert.equal((await snap(red)).rendered.find(q=>q.side==='red'&&q.role==='king').x,swapped);
  console.log('PASS secret formation swaps and early confirmation');

  for(const [p,side] of [[red,'red'],[blue,'blue']]){
   const s=await snap(p);
   assert.equal(s.viewer,side);
   assert.equal(s.rendered.filter(q=>q.side!==side&&q.role==='unknown').length,7);
   assert.equal(s.rendered.filter(q=>q.side===side&&q.role==='king').length,1);
  }
  // A blue input during red's turn has no effect.
  await cell(blue,3,0);await cell(blue,3,1);
  assert.equal((await snap(blue)).game.ply,0);
  const steps=[[red,6,5],[blue,0,1],[red,5,4],[blue,1,2],[red,4,3],[blue,2,3]];
  for(const [index,[p,from,to]] of steps.entries()){
   if(index===1&&!formationOnly){await touch(p,3,from,.74);await touch(p,3,to,.14);}
   else{await cell(p,3,from);await cell(p,3,to);}
   if(index===5){
    await Promise.all([red.waitForSelector('.reveal-card'),blue.waitForSelector('.reveal-card')]);
    assert.equal(await red.locator('.reveal-card h2').textContent(),await blue.locator('.reveal-card h2').textContent());
    await Promise.all([press(red,'继续'),press(blue,'继续')]);
   }
   await Promise.all([settled(red,index+1),settled(blue,index+1)]);
   assert.deepEqual(publicState(await snap(red)),publicState(await snap(blue)));
  }
  console.log(formationOnly?'PASS classic pairing, alternating moves and capture disclosure':'PASS classic pairing, rule mismatch, occupied room, ready/cancel, alternating moves, touch, capture disclosure');
  if(!(await snap(red)).game.result){
   await press(red,'认输');await press(red,'确认认输');
  }
  await Promise.all([red.waitForSelector('.phase-result'),blue.waitForSelector('.phase-result')]);
  await press(blue,'再来一局');
  await red.getByText('对方想再来一局。').waitFor();
  assert.equal((await snap(red)).phase,'result');
  await press(red,'再来一局');
  await Promise.all([red.waitForSelector('.phase-setup'),blue.waitForSelector('.phase-setup')]);
  await press(blue,'准备');
  // Red leaves the countdown alone; the latest draft must lock on timeout.
  await Promise.all([draw(red),draw(blue)]);
  for(const p of [red,blue]){
   const fresh=await snap(p);
   assert.equal(fresh.game.ply,0);
   assert.equal(fresh.game.captures.length,0);
   assert.equal(fresh.rendered.filter(q=>q.role==='unknown').length,7);
  }
  await cell(red,3,6);await cell(red,3,5);
  await Promise.all([settled(red,1),settled(blue,1)]);
  console.log('PASS same-channel rematch, deadline auto-lock, fresh secrets and advancing turns');
  await press(red,'离开王庭');
  await red.getByRole('dialog').getByRole('button',{name:'离开王庭',exact:true}).click();
  const pause=blue.getByRole('alertdialog');
  await pause.getByText('对方暂离王庭').waitFor();
  await pause.getByRole('button',{name:'离开王庭',exact:true}).click();
  await red.getByRole('heading',{name:'选择规则与对手'}).waitFor();
  console.log('PASS departure and room cleanup');

  await enter(red,'祭典模式');await red.getByRole('button',{name:/发起邀约/}).click();
  await enter(blue,'祭典模式');await room.waitFor();await join(blue,await room.textContent());
  await Promise.all([ready(red),ready(blue)]);
  await press(red,'就位');await press(blue,'就位');await Promise.all([red.waitForSelector('.phase-setup'),blue.waitForSelector('.phase-setup')]);
  await press(red,'准备');await press(blue,'准备');await Promise.all([draw(red),draw(blue)]);
  await press(red,'规则手册');
  await guide.getByText(/撑过对方一回合才赢/).waitFor();
  await press(red,'关闭');
  const guard=(await snap(red)).rendered.find(q=>q.side==='red'&&q.role==='guard');
  await cell(red,guard.x,6);await press(red,'蓄力');await press(red,'原地完成蓄力');
  await Promise.all([settled(red,1),settled(blue,1)]);
  const publicGuard=(await snap(blue)).rendered.find(q=>q.id===guard.id);
  assert.equal(publicGuard.role,'guard');assert.ok(publicGuard.charging);
  const free=guard.x===0?6:0;
  await cell(blue,free,0);await cell(blue,free,1);
  await Promise.all([settled(red,2),settled(blue,2)]);
  await cell(red,guard.x,6);await press(red,'斩杀');
  await Promise.all([settled(red,3),settled(blue,3)]);
  assert.equal((await snap(red)).game.lastAction.kind,'execute');
  assert.deepEqual(publicState(await snap(red)),publicState(await snap(blue)));
  await blue.reload();
  await red.getByRole('alertdialog').getByText('对方暂离王庭').waitFor();
  await red.getByRole('alertdialog').getByRole('button',{name:'离开王庭',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS ritual charge, public guard, double-step execution and refresh disconnect');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
