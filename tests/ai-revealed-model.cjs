const assert=require('node:assert/strict');
const {launch,openGame,holdFrame}=require('./support.cjs');

(async()=>{
 const browser=await launch();
 try{
  const {page,errors}=await openGame(browser,'dist-test',{
   deviceScaleFactor:.65,preferences:{quality:'low',reduced:false,cinematic:false,muted:true},
  });
  // Script only the AI's choice. The game still validates and animates it
  // through the same Worker callback and turn flow as a normal match.
  for(const [id,role,to] of [['blue-3','king',{x:4,y:2}],['blue-0','guard',{x:3,y:3}]]){
   await page.evaluate(({id,to})=>{
    const qa=window.__SK_QA__;
    const WorkerClass=window.Worker;
    window.Worker=class extends WorkerClass {
     postMessage({id:request}){
      queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{
       id:request,decision:{action:{id,...to},algorithm:'test',nodes:1,elapsed:0},
      }})));
     }
    };
    const game=qa.snapshot().game;
    qa.holdAction(0);
    qa.loadState({
     ...game,mode:'ritual',turn:'blue',result:null,ply:2,events:[],seen:{},captures:[],
     ritual:{red:{phase:'dormant'},blue:{phase:'open',openedPly:1}},
     pieces:game.pieces.map(p=>p.id==='blue-3'?{...p,x:4,y:1,revealed:true}:p.id==='blue-0'
      ?{...p,x:3,y:2,revealed:true,charging:{readyPly:2}}:p),
    },'normal');
   },{id,to});
   for(const progress of [.2,.5,.8]){
    await holdFrame(page,progress);
    const body=await page.evaluate(id=>window.__SK_QA__.bodyDrawProbe(id),id);
    assert.equal(body.role,role);assert.ok(body.visible&&body.draws>0&&body.bodyHeight>.5);assert.equal(body.batched,false);
   }
   await page.evaluate(()=>window.__SK_QA__.holdAction(null));
   await page.waitForFunction(()=>{const s=window.__SK_QA__.snapshot();return s.game.turn==='red'&&!s.busy;});
   const settled=await page.evaluate(id=>window.__SK_QA__.bodyDrawProbe(id),id);
   assert.equal(settled.batched,false);assert.ok(settled.draws>0&&settled.bodyHeight>.5);
   console.log('PASS',role,'body draws throughout AI movement and after landing');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
