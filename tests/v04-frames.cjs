const {launch,openGame,root,holdFrame}=require('./support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await openGame(browser,'dist-test',{deviceScaleFactor:.5});
  await page.evaluate(()=>{
   window.__OSC_COUNT__=0;
   const original=AudioContext.prototype.createOscillator;
   AudioContext.prototype.createOscillator=function(...args){window.__OSC_COUNT__++;return original.apply(this,args);};
  });
  await page.getByRole('button',{name:'开启声音',exact:true}).click();
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.locator('#fx').press('End');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(()=>{window.__SK_QA__.holdAction(0);return window.__SK_QA__.loadRitualFixture('ready');});
  await page.locator('.sr-board button').nth(24).focus();await page.keyboard.press('Enter');
  const before=await page.evaluate(()=>window.__OSC_COUNT__);
  await page.getByRole('button',{name:'斩杀',exact:true}).click();
  // Exercise every rendered audio milestone independently of software-GPU speed.
  // Background catch-up/expiry is covered separately by combat-background.cjs.
  for(const t of [.01,.19,.42,.52,.75,.84,.86,.96])await holdFrame(page,t);
  await page.evaluate(()=>window.__SK_QA__.holdAction(1));
  await page.waitForSelector('.reveal-card');
  const audio=await page.evaluate(async()=>{
   const q=window.__SK_QA__,frame=await q.combatFrame(),state=q.snapshot();
   return {state:state.audioState,oscillators:window.__OSC_COUNT__,cues:state.fxState.cues,
     accepted:frame.audioCues.filter(c=>c.kind.startsWith('execution-'))};
  });
  assert.equal(audio.state,'running');
  const audible=['release','dash','impact','impact','plant','recover'];
  assert.deepEqual(audio.accepted.map(c=>c.kind),audible.map(kind=>'execution-'+kind));
  assert.equal(new Set(audio.accepted.map(c=>c.key)).size,audible.length);
  assert.ok(audio.oscillators-before>=11);
  assert.deepEqual(audio.cues.slice(-8).map(c=>c.kind),['release','dash','impact','disclose','impact','plant','disclose','recover']);
  await page.evaluate(()=>{window.__SK_QA__.holdAction(null);document.querySelector('button[aria-label="静音"]').click();});
  const result=await page.evaluate(()=>window.__SK_QA__.stressV04());
  assert.ok(result.midFrameChecks>100);assert.deepEqual(result.failures,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'artifacts/v04-frame-lifecycle.json'),JSON.stringify({...result,audio,errors,complete:true},null,2));
  console.log(JSON.stringify({checks:result.midFrameChecks,moves:result.moves,captures:result.captures,audioOscillators:audio.oscillators-before,audible,failures:result.failures}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
