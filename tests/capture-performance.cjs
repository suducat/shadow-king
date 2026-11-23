const assert=require('node:assert/strict');
const {openGame,launch}=require('./support.cjs');

(async()=>{
 const browser=await launch();
 try{
  const results=[];
  for(let i=0;i<3;i++){
   const {page,context,errors}=await openGame(browser,'dist-test',{
    deviceScaleFactor:.65,preferences:{quality:'medium',reduced:true,muted:true},
   });
   await page.waitForFunction(()=>window.__SK_QA__.fallenMeshesReady()===3);
   const captures=await page.evaluate(()=>window.__SK_QA__.profileFallen());
   assert.equal(captures.length,9);
   for(const role of ['king','guard','martyr']){
    const sameRole=captures.filter(capture=>capture.role===role);
    assert.ok(sameRole.every(capture=>capture.triangles>100));
    assert.equal(new Set(sameRole.map(capture=>capture.geometry)).size,1);
   }
   assert.equal(new Set(captures.map(capture=>capture.geometry)).size,3);
   assert.equal(await page.evaluate(()=>window.__SK_QA__.snapshot().fallen.length),0);
   assert.deepEqual(errors,[]);
   results.push(captures.map(({side,role,ms})=>({side,role,ms})));
   await context.close();
  }
  console.log(JSON.stringify(results));
  console.log('PASS background statue preparation, independent slots, geometry reuse across colors and teardown');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
