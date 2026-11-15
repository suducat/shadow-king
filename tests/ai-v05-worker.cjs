const{launch,openGame,root}=require('./support.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await launch();try{const{page,errors}=await openGame(browser,'dist-test',{deviceScaleFactor:.5});
 const worker=fs.readdirSync(path.join(root,'dist-test/assets')).find(f=>f.startsWith('ai.worker-'));
 const result=await page.evaluate(async filename=>{
  const g=window.__SK_QA__.snapshot().game,side='red';
  const pieces=g.pieces.map(p=>({id:p.id,side:p.side,x:p.x,y:p.y,role:p.side===side?p.role:'unknown'}));
  const observation={side,turn:side,pieces,captures:[],ply:0,quiet:0,ended:false,history:[],rules:{id:'shadow-king-standard-v1',size:7,quietFullRounds:30,repetition:3,roles:{king:1,guard:3,martyr:3}}};
  const worker=new Worker(`/assets/${filename}`,{type:'module'}),started=performance.now(),replies=[];let ticks=0,last=started,maxGap=0;
  const timer=setInterval(()=>{const now=performance.now();ticks++;maxGap=Math.max(maxGap,now-last);last=now;},20);
  try{await new Promise((resolve,reject)=>{worker.onerror=e=>reject(new Error(e.message));worker.onmessage=e=>{if(e.data.error)reject(new Error(e.data.error));replies.push(e.data);if(replies.length===6)resolve();};for(let id=1;id<=6;id++)worker.postMessage({id,observation,difficulty:'master',seed:330+id});});}
  finally{clearInterval(timer);worker.terminate();}
  return{ticks,maxGap,elapsed:performance.now()-started,replies,observation};
 },worker);
 assert.equal(result.replies.length,6);assert.ok(result.ticks>=2,'main-thread heartbeat must continue during Worker search');assert.ok(result.observation.pieces.filter(p=>p.side==='blue').every(p=>p.role==='unknown'));assert.ok(!('seen'in result.observation));for(const r of result.replies){assert.ok(r.decision.action);assert.ok(r.decision.elapsed<900);assert.ok(r.decision.nodes<=5000);}assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'artifacts/v05-worker-report.json'),JSON.stringify({...result,errors,complete:true},null,2));console.log(JSON.stringify({searches:6,ticks:result.ticks,maxGap:result.maxGap,elapsed:result.elapsed,errors}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
