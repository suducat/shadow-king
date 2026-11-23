const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function openGame(browser,dir='dist-test',opts={},qa=true){
 if(dir==='dist-test'&&process.env.SK_TEST_DIST)dir=process.env.SK_TEST_DIST;
 const {preferences={reduced:true,music:0,effects:0,muted:true,cinematic:false},...contextOptions}=opts;
 const context=await browser.newContext({viewport:{width:1280,height:840},deviceScaleFactor:1,reducedMotion:'no-preference',...contextOptions});context.setDefaultTimeout(60000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if((m.type()==='error'||m.type()==='warning'&&m.text().includes('THREE.Material:'))&&!m.text().includes('ERR_FAILED'))errors.push(m.text())});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='shadow-king.test')return route.abort();const f=path.join(path.resolve(root,dir),u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));try{await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff':'font/woff'})[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'not found'})}});
 await page.addInitScript(preferences=>{
  localStorage.setItem('shadow-king-settings',JSON.stringify(preferences));
  const OriginalWorker=window.Worker;window.__AI_MESSAGES__=[];window.__AI_RESULTS__=[];
  window.Worker=class extends OriginalWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(Number.isInteger(e.data?.id))window.__AI_RESULTS__.push(structuredClone(e.data));});}postMessage(message,...args){window.__AI_MESSAGES__.push(structuredClone(message));return super.postMessage(message,...args);}};
 },preferences);
 await page.goto('http://shadow-king.test/');if(qa)await page.waitForFunction(()=>window.__SK_QA__);else await page.evaluate(()=>document.fonts.ready);return{page,context,errors};
}
const launch=()=>require('playwright').chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
// Wait for an actual renderer frame before reading pose, effects or audio.
// Sample inside the page so repeated driver reads cannot reuse an older pose.
async function holdFrame(page,progress){
 return page.evaluate(async progress=>{
  const q=window.__SK_QA__;q.holdAction(progress);
  const deadline=performance.now()+30000;
  while(performance.now()<deadline){
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const frame=await q.combatFrame();
   if(Math.abs(frame.progress-progress)<1e-5)return frame;
  }
  throw new Error('Renderer did not reach held progress '+progress);
 },progress);
}
module.exports={root,openGame,launch,holdFrame};
