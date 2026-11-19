const {launch}=require('../../tests/support.cjs');
const fs=require('node:fs');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
 await server.listen();
 const browser=await launch();
 try{
  for(const view of ['hall','altar','unlit','easy','normal','hard','master','omniscient']){
   const page=await browser.newPage();
   await page.goto(server.resolvedUrls.local[0]+'scripts/night-studio/blank.html');
   const image=await page.evaluate(async view=>(await import('/scripts/night-studio/stage.ts')).photograph(view),view);
   fs.writeFileSync('public/night/'+view+'.webp',Buffer.from(image.split(',')[1],'base64'));await page.close();
  }
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
