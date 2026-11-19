// Sample visible WebGL output on the action clock for frame-accurate comparison.
const {launch, openGame} = require('../tests/support.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const [stage, dist = 'dist-test'] = process.argv.slice(2);
assert.ok(['before','after','night15','night-new'].includes(stage));
const out = 'artifacts/motion/' + stage;
const cases = process.argv.length>4 ? process.argv.slice(4) : ['move','capture','execution'];
const fps = 30;
(async () => {
 const browser = await launch();
 try {
  const {page, errors} = await openGame(browser, dist, {viewport:{width:1080,height:720}, deviceScaleFactor:1,
    preferences:{quality:'low', reduced:false, effects:0, music:0, muted:true, cinematic:false}});
  const click = async(x,y,h=.14) => {const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]); await page.mouse.click(p.x,p.y);};
  for(const name of cases) {
   const folder=out+'/'+name;
   fs.mkdirSync(folder,{recursive:true});
   const select = async(hold) => {
    await page.evaluate(({name,hold})=>{const q=window.__SK_QA__;q.holdAction(hold);return name==='rite'?q.loadRitualFixture('opening'):name==='execution'?q.loadRitualFixture('ready'):q.loadFixture('capture','guard');},{name,hold});
    await page.waitForSelector('canvas[data-ready=true]');
    await click(3,3,.8);
   };
   const act = async()=>name==='execution'?page.getByRole('button',{name:'斩杀',exact:true}).click():click(name==='move'?4:3,name==='move'?3:2);
   await select(0);await act();
   const start=await page.evaluate(()=>window.__SK_QA__.combatFrame());
   assert.ok(start.duration);
   const log=[];
   for(let frame=0;frame<Math.ceil(start.duration*fps/1000);frame++){
    const t=frame*1000/(fps*start.duration);
    const {jpeg, sample}=await page.evaluate(async t=>{
     const q=window.__SK_QA__;q.holdAction(t);
     await new Promise(r=>requestAnimationFrame(r));
     // Capture immediately after the scene's RAF, before WebGL's buffer is cleared.
     const canvas=document.querySelector('canvas');
     const jpeg=canvas.toDataURL('image/jpeg',.93).split(',')[1];
     const {progress,position,tip,victims,cues}=await q.combatFrame();
     return {jpeg,sample:{progress,position,tip,victims,cues}};
    },t);
    assert.ok(Math.abs(sample.progress-t)<1e-5);
    fs.writeFileSync(folder+'/f'+String(frame).padStart(3,'0')+'.jpg',Buffer.from(jpeg,'base64'));
    log.push(sample);
   }
   fs.writeFileSync(folder+'/frames.json',JSON.stringify({duration:start.duration,fps,log}));
   execFileSync('ffmpeg',['-loglevel','error','-y','-framerate',String(fps),'-i',folder+'/f%03d.jpg','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,drawtext=text=F%{n}:x=12:y=12:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7','-pix_fmt','yuv420p','-c:v','libx264','-movflags','+faststart',folder+'/frames.mp4']);
   await page.getByRole('button',{name:'跳过动作',exact:true}).click();console.log(stage,name,log.length,'frames');
  }
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
