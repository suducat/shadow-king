const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {randomUUID}=require('node:crypto');
const WebSocket=require('ws');

const origin='http://127.0.0.1:17367';
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
 const persist=await mkdtemp(path.join(os.tmpdir(),'sk-room-'));let dev;
 try{
  dev=await launch(persist);const url=dev.url;
  assert.equal((await fetch(url+'/v1/rooms',{method:'POST',headers:{Origin:'https://other.invalid'},body:'{}'})).status,403);
  assert.equal((await post(url,'/v1/rooms/000000/join')).status,404);
  const created=await post(url,'/v1/rooms');assert.equal(created.status,201);
  assert.equal(created.headers.get('access-control-allow-origin'),origin);
  const redTicket=await created.json();assert.match(redTicket.code,/^\d{6}$/);
  const joinPath=`/v1/rooms/${redTicket.code}/join`;
  assert.equal((await post(url,joinPath,'ritual')).status,409);
  const competing=await Promise.all([post(url,joinPath),post(url,joinPath)]);
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  const blueTicket=await competing.find(r=>r.ok).json();
  const bogus=client(url,{...redTicket,token:'a'.repeat(64)});
  assert.notEqual(await bogus.closed,1000);
  let red=client(url,redTicket),blue=client(url,blueTicket),pair=[red,blue];
  await both(pair,s=>s.stage==='ready');
  red.ws.send('ping');await red.take(m=>m.type==='pong');
  red.send({type:'ready',value:true});await blue.state(s=>s.otherReady);
  red.send({type:'ready',value:false});await blue.state(s=>!s.otherReady,1);
  let [sRed,sBlue]=await begin(pair,['king','guard','martyr','guard','martyr','guard','martyr']);
  assert.equal(sRed.matchId,sBlue.matchId);
  assert.ok(!('seen' in sRed.game));
  assert.ok(sRed.game.pieces.filter(p=>p.side==='blue').every(p=>p.role==='unknown'));
  assert.ok(sBlue.game.pieces.filter(p=>p.side==='red').every(p=>p.role==='unknown'));
  assert.equal(sBlue.game.pieces.find(p=>p.id==='blue-0').role,'king');
  blue.send(intent(blue,sBlue,{id:'blue-0',x:0,y:1}));await blue.take(m=>m.type==='error');
  const first=intent(red,sRed,{id:'red-0',x:0,y:5});
  red.send(first);red.send(first);
  await red.take(m=>m.type==='ack'&&m.actionId===first.intent.actionId);
  [sRed,sBlue]=await both(pair,s=>s.game?.ply===1);
  assert.equal(sBlue.lastTurn.actionId,first.intent.actionId);
  const beforeDisconnect=red.frames.length;blue.ws.terminate();await blue.closed;
  await red.state(s=>!s.opponentConnected,beforeDisconnect);
  blue=client(url,blueTicket);pair=[red,blue];
  sBlue=await blue.state(s=>s.game?.ply===1&&s.opponentConnected);
  assert.equal(sBlue.lastTurn.actionId,first.intent.actionId);
  red.send(first);await red.take(m=>m.type==='ack'&&m.actionId===first.intent.actionId);
  assert.equal((await blue.state(s=>s.game?.ply===1)).game.ply,1);
  pair.forEach(c=>c.ws.terminate());await dev.stop();
  dev=await launch(persist);
  red=client(dev.url,redTicket);blue=client(dev.url,blueTicket);pair=[red,blue];
  [sRed,sBlue]=await both(pair,s=>s.game?.ply===1&&s.opponentConnected);
  assert.equal(sRed.lastTurn.actionId,first.intent.actionId);
  for(let step=0;step<5;step++){
   [sRed,sBlue]=await play(pair,blue,sBlue,{id:`blue-${step+1}`,x:step+1,y:1});
   [sRed,sBlue]=await play(pair,red,sRed,{id:'red-0',x:0,y:4-step});
  }
  assert.deepEqual(sRed.game.result,{winner:'red',reason:'king'});
  assert.deepEqual(sRed.game.captures,sBlue.game.captures);
  assert.equal(sRed.game.captures[0].role,'king');
  pair.forEach(c=>c.send({type:'rematch',matchId:sRed.matchId}));
  await both(pair,s=>s.stage==='deploying'&&s.matchId!==sRed.matchId);
  blue.send({type:'leave'});assert.equal(await red.closed,4000);

  pair=await room(dev.url,'ritual');[red,blue]=pair;
  [sRed,sBlue]=await begin(pair);
  [sRed,sBlue]=await play(pair,red,sRed,{id:'red-0',x:0,y:5,kind:'charge'});
  assert.equal(sBlue.game.pieces.find(p=>p.id==='red-0').role,'guard');
  [sRed,sBlue]=await play(pair,blue,sBlue,{id:'blue-1',x:1,y:1});
  [sRed,sBlue]=await play(pair,red,sRed,{id:'red-0',x:0,y:3,kind:'execute'});
  assert.equal(sBlue.game.lastAction.steps.length,2);
  assert.equal(sBlue.game.pieces.find(p=>p.id==='red-0').executionUsed,true);
  await dev.stop();
  dev=await launch(persist,2);
  const expireResponse=await post(dev.url,'/v1/rooms');
  assert.equal(expireResponse.status,201);
  const expTicket=await expireResponse.json();
  const exp=client(dev.url,expTicket);
  await exp.state(s=>s.stage==='waiting');
  await exp.take(m=>m.type==='closed'&&m.message.includes('过期'),0,7000);
  assert.equal(await exp.closed,4000);
  assert.equal((await post(dev.url,`/v1/rooms/${expTicket.code}/join`)).status,404);
  console.log('PASS Wrangler HTTP + WebSocket, seat race, readiness, sync, duplicate and wrong turns, privacy, regicide, skills, reconnect, persistence restart, leave and alarm expiry');
 }finally{
  for(const ws of sockets)ws.terminate();
  await dev?.stop();await rm(persist,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
