const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');

// Test build: VITE_PEER_TEST_PORT plus VITE_TURN_TEST_URL, backed by local
// PeerServer and TURN (court-test/court-test). No public service is mocked.
const base=process.env.SK_ONLINE_BASE||'http://127.0.0.1:17367/shadow-king/';
(async()=>{
 const browser=await chromium.launch({headless:true,
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-proxy-server','--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,LocalNetworkAccessChecksWebRTC,LocalNetworkAccessChecksWebSockets'],
 });
 try{
  const contexts=await Promise.all([browser.newContext(),browser.newContext({hasTouch:true})]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const [i,page] of pages.entries()){
   await page.addInitScript(guest=>{
    const Real=window.RTCPeerConnection;
    window.courtConnections=[];
    window.RTCPeerConnection=class extends Real{
     constructor(config){
      super(config);
      if(config?.iceServers?.some(server=>server.username==='court-test'))window.courtConnections.push(this);
     }
     createOffer(...args){
      // Force the first route to stall and let its normal deadline fire.
      if(guest&&window.courtConnections[0]===this)return new Promise(()=>{});
      return super.createOffer(...args);
     }
    };
   },i===1);
  }
  await Promise.all(pages.map(async page=>{
   await page.goto(base);
   await page.getByRole('button',{name:/开启棋局/}).click();
   await page.getByRole('button',{name:/王庭邀约/}).click();
  }));
  const [host,guest]=pages;
  await host.getByRole('button',{name:/发起邀约/}).click();
  const code=await host.locator('.court-code').textContent();
  await guest.getByRole('button',{name:/应邀入局/}).click();
  await guest.getByLabel('邀约密令').fill(code);
  await guest.getByRole('button',{name:'确认入局'}).click();
  try{
   await Promise.all(pages.map(p=>p.getByRole('heading',{name:'双王就位'}).waitFor({timeout:35000})));
  }catch(error){
   for(const page of pages)console.error(await page.locator('.court-summons').innerText(),await page.evaluate(()=>
    window.courtConnections.map(pc=>({policy:pc.getConfiguration().iceTransportPolicy,ice:pc.iceConnectionState,gathering:pc.iceGatheringState}))));
   throw error;
  }
  for(const page of pages){
   const details=await page.evaluate(async()=>{
    const connection=window.courtConnections.at(-1);
    const stats=await connection.getStats();
    const transport=[...stats.values()].find(item=>item.type==='transport'&&item.selectedCandidatePairId);
    const pair=stats.get(transport?.selectedCandidatePairId);
    return {policy:connection.getConfiguration().iceTransportPolicy,local:stats.get(pair?.localCandidateId)?.candidateType,remote:stats.get(pair?.remoteCandidateId)?.candidateType};
   });
   assert.deepEqual(details,{policy:'relay',local:'relay',remote:'relay'});
  }
  assert.equal(await guest.evaluate(()=>window.courtConnections.length),2);
  console.log('PASS initial timeout, same invite, both browsers on a real TURN candidate pair');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
