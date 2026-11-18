// Controlled poses supplement the realtime films. They are NOT an FPS benchmark.
const{launch,openGame}=require('../tests/support.cjs'),fs=require('fs');
(async()=>{const b=await launch();try{for(const[stage,dir]of[['before',process.env.BASELINE_DIST||'/tmp/shadow-king-v07-baseline/dist-test'],['after',process.env.CANDIDATE_DIST||'dist-test']]){
 const{page,context,errors}=await openGame(b,dir,{viewport:{width:1024,height:768},deviceScaleFactor:1,preferences:{quality:'low',reduced:false,muted:true,music:0,effects:0,cinematic:false}});
 await page.evaluate(()=>window.__SK_QA__.loadFixture('capture','guard'));await page.waitForSelector('canvas[data-ready=true]');await page.evaluate(()=>window.__SK_QA__.holdAction(0));
 const click=async(x,y,h=.14)=>{const p=await page.evaluate(([x,y,h])=>window.__SK_QA__.project(x,y,h),[x,y,h]);await page.mouse.click(p.x,p.y);};await click(3,3,.8);await click(3,2);
 fs.mkdirSync(`artifacts/v07/poses/${stage}`,{recursive:true});for(const[i,t]of[0,.2,.4,.58,.62,.78,.93].entries()){
  await page.evaluate(t=>window.__SK_QA__.holdAction(t),t);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.locator('canvas').screenshot({path:`artifacts/v07/poses/${stage}/guard-${i}.png`});
 }
 if(errors.length)throw Error(errors.join('\n'));await context.close();
 }}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
