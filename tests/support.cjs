const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function openGame(browser,dir='dist-test',opts={},qa=true){
 const context=await browser.newContext({viewport:{width:1280,height:840},deviceScaleFactor:1,reducedMotion:'no-preference',...opts});context.setDefaultTimeout(60000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errors.push(m.text())});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='shadow-king.test')return route.abort();const f=path.join(root,dir,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));try{await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff':'font/woff'})[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'not found'})}});
 await page.addInitScript(()=>{
  localStorage.setItem('shadow-king-settings',JSON.stringify({reduced:true,music:0,effects:0,muted:true,cinematic:false}));
  const OriginalWorker=window.Worker;window.__AI_MESSAGES__=[];window.__AI_RESULTS__=[];
  window.Worker=class extends OriginalWorker{constructor(...args){super(...args);this.addEventListener('message',e=>window.__AI_RESULTS__.push(structuredClone(e.data)));}postMessage(message,...args){window.__AI_MESSAGES__.push(structuredClone(message));return super.postMessage(message,...args);}};
 });
 await page.goto('http://shadow-king.test/');if(qa)await page.waitForFunction(()=>window.__SK_QA__);else await page.evaluate(()=>document.fonts.ready);return{page,context,errors};
}
const launch=()=>require('playwright').chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
module.exports={root,openGame,launch};
