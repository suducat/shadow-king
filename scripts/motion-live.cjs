// Per-action wall-clock capture. Screencasting keeps Chromium's compositor active
// on software GPUs; the audio stream taps the game's actual master output.
const {launch,openGame}=require('../tests/support.cjs');
const fs=require('node:fs'), assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [stage,dist='dist-test']=process.argv.slice(2);
(async()=>{
 const browser=await launch();
 try {
  for(const name of (process.argv.length>4?process.argv.slice(4):['move','capture','execution'])){
   const folder='artifacts/motion/'+stage+'/'+name;fs.mkdirSync(folder,{recursive:true});
   const {page,context,errors}=await openGame(browser,dist,{viewport:{width:1080,height:720},deviceScaleFactor:1,preferences:{quality:'low',reduced:false,effects:.65,music:0,muted:false,cinematic:false},recordVideo:{dir:folder,size:{width:1080,height:720}}});
   await page.addInitScript(()=>{
    const Original=AudioContext,connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(to,...args){const result=connect.call(this,to,...args);if(to===this.context.destination&&this.context.tap)connect.call(this,this.context.tap);return result;};
    window.AudioContext=class extends Original{constructor(...args){super(...args);this.tap=this.createMediaStreamDestination();window.audioTap=this.tap;window.liveAudio=this;}};
   });
   await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();
   await page.evaluate(name=>name==='rite'?window.__SK_QA__.loadRitualFixture('opening'):name==='execution'?window.__SK_QA__.loadRitualFixture('ready'):window.__SK_QA__.loadFixture('capture','guard'),name);
   await page.waitForSelector('canvas[data-ready=true]');
   const click=async(x,y,h=.14)=>{const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);await page.mouse.click(p.x,p.y);};
   await page.evaluate(async()=>{
    await window.liveAudio.resume();const src=document.querySelector('canvas'),copy=document.createElement('canvas');copy.width=src.width;copy.height=src.height;
    const ctx=copy.getContext('2d'),track=copy.captureStream(0).getVideoTracks()[0],stream=new MediaStream([track,...window.audioTap.stream.getAudioTracks()]);
    let ticking=true;const paint=()=>{if(!ticking)return;ctx.drawImage(src,0,0);track.requestFrame();requestAnimationFrame(paint);};requestAnimationFrame(paint);
    const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[];
    rec.ondataavailable=e=>chunks.push(e.data);
    window.stopClip=()=>new Promise(resolve=>{rec.onstop=()=>{ticking=false;const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks));};rec.stop();});await new Promise((ok,fail)=>{rec.onstart=ok;rec.onerror=fail;rec.start(250);});
   });
   await click(3,3,.8);await page.waitForTimeout(1700);
   if(name==='execution')await page.getByRole('button',{name:'斩杀',exact:true}).click();
   else await click(name==='move'?4:3,name==='move'?3:2);
   await page.waitForSelector(name==='move'?'.handoff-screen':'.reveal-card');await page.waitForTimeout(1000);
   fs.writeFileSync(folder+'/live.webm',Buffer.from(await page.evaluate(()=>window.stopClip()),'base64'));
   const video=page.video();await context.close();await video.saveAs(folder+'/screen.webm');await video.delete();
   const streams=execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name','-of','csv=p=0',folder+'/live.webm'],{encoding:'utf8'});
   assert.match(streams,/opus/);assert.match(streams,/vp8/);assert.deepEqual(errors,[]);console.log(stage,name,streams.trim());
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
