const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {randomUUID}=require('node:crypto');
const WebSocket=require('ws');

const origin='https://suducat.github.io';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const line=['guard','martyr','guard','king','martyr','guard','martyr'];
const root=path.resolve(__dirname,'..');
const connectProtocol='shadow-king-v1';
const sockets=new Set();
async function freePort(){
 const server=net.createServer().listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const {port}=server.address();
 await new Promise(resolve=>server.close(resolve));return port;
}
async function launch(persist,seconds){
 const port=await freePort(),url=`http://127.0.0.1:${port}`;
 let log='';
 const child=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--local',
  '--config','server/cloudflare/wrangler.jsonc','--ip','127.0.0.1','--port',String(port),
  '--inspector-port','0','--persist-to',persist,'--var',`ALLOWED_ORIGINS:${origin}`,
  ...(seconds?['--var',`ROOM_TTL_SECONDS:${seconds}`]:[])],
  {cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',
   XDG_CONFIG_HOME:path.join(persist,'config'),XDG_CACHE_HOME:path.join(persist,'cache')},
   stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk).slice(-10000);});
 const stop=async()=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  const closed=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGTERM');await closed;
 };
 for(let time=0;time<180;time++){
  if(child.exitCode!==null)break;
  try{if((await fetch(url+'/health',{signal:AbortSignal.timeout(300)})).ok)return {url,stop};}catch{}
  await delay(150);
 }
 await stop();
 throw new Error('Wrangler did not start\n'+log);
}
const post=(url,path,rule='classic')=>fetch(url+path,{method:'POST',
 headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({version:1,rule})});
function client(url,ticket){
 const ws=new WebSocket(url.replace(/^http/,'ws')+`/v1/rooms/${ticket.code}/socket`,
  [connectProtocol,`seat.${ticket.token}`],{origin});
 sockets.add(ws);const frames=[],signals=new Set();
 let ended=false;
 ws.on('error',()=>{});
 ws.on('message',raw=>{const m=String(raw)==='pong'?{type:'pong'}:JSON.parse(raw);frames.push(m);for(const wake of signals)wake();});
 const closed=new Promise(resolve=>ws.once('close',code=>{ended=true;sockets.delete(ws);for(const wake of signals)wake();resolve(code);}));
 const take=(pred,from=0,timeout=5000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{signals.delete(check);reject(new Error('Expected WebSocket frame, got '+frames.map(f=>f.type+':'+(f.stage??f.message??'')).join(', ')));},timeout);
  function check(){
   const index=frames.findIndex((f,i)=>i>=from&&pred(f));
   if(index>=0||ended){clearTimeout(timer);signals.delete(check);if(index>=0)resolve(frames[index]);else reject(new Error('Socket closed'));}
  }
  signals.add(check);check();
 });
 return {ticket,ws,frames,take,closed,send:m=>ws.send(JSON.stringify(m)),state:(pred,from)=>take(f=>f.type==='state'&&pred(f),from)};
}
const intent=(socket,s,action,id=randomUUID())=>({type:'action',intent:{matchId:s.matchId,actionId:id,
 playerId:socket.ticket.playerId,turnNumber:s.game.ply,sequenceNumber:s.game.ply+1,actionType:action.kind??'move',payload:action}});
async function both(sockets,predicate){
 return Promise.all(sockets.map(c=>c.state(predicate)));
}
async function play(pair,active,state,action){
 active.send(intent(active,state,action));
 return both(pair,m=>m.game?.ply===state.game.ply+1);
}
async function room(url,mode){
 const resp=await post(url,'/v1/rooms',mode);assert.equal(resp.status,201);
 const host=await resp.json(),joined=await post(url,`/v1/rooms/${host.code}/join`,mode);assert.equal(joined.status,200);
 return [client(url,host),client(url,await joined.json())];
}
async function begin(pair,blueLine=line){
 await both(pair,s=>s.stage==='ready');
 pair.forEach(c=>c.send({type:'ready',value:true}));
 const [draft]=await both(pair,s=>s.stage==='deploying');
 pair[0].send({type:'deployment',matchId:draft.matchId,line});
 pair[1].send({type:'deployment',matchId:draft.matchId,line:blueLine});
 return both(pair,s=>s.stage==='playing');
}
(async()=>{
 const url='https://shadow-king-multiplayer.shadow-king.workers.dev';
 try{
  assert.deepEqual(await (await fetch(url+'/health',{signal:AbortSignal.timeout(5000)})).json(),{ok:true,version:1});
  for(const mode of ['classic','ritual']){
   const pair=await room(url,mode);
   const [red,blue]=pair;
   const [sRed,sBlue]=await begin(pair);
   assert.equal(sRed.matchId,sBlue.matchId);
   assert.ok(sBlue.game.pieces.filter(p=>p.side==='red').every(p=>p.role==='unknown'));
   const move={id:'red-0',x:0,y:5,...(mode==='ritual'?{kind:'charge'}:{})};
   const [afterRed,afterBlue]=await play(pair,red,sRed,move);
   for(const state of [afterRed,afterBlue])assert.equal(state.game.pieces.find(p=>p.id==='red-0').y,5);
   if(mode==='ritual')assert.equal(afterBlue.game.pieces.find(p=>p.id==='red-0').role,'guard');
   blue.ws.terminate();
   await blue.closed;
   const reconnect=client(url,blue.ticket);
   const recovered=await reconnect.state(s=>s.game?.ply===1&&s.opponentConnected);
   assert.equal(recovered.lastTurn.actionId,afterRed.lastTurn.actionId);
   reconnect.send({type:'leave'});
   assert.equal(await red.closed,4000);
   console.log('PASS production '+mode+' HTTPS, WebSocket, ready, formation, identity privacy, move sync, reconnect and exit');
  }
 }finally{for(const ws of sockets)ws.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
