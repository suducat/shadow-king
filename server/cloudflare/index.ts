import {DurableObject} from 'cloudflare:workers';
import {COURT_COOLDOWN,readInteraction,readProfile,COURT_SOCKET,COURT_VERSION,ROOM_TTL,type RoomTicket} from '../../src/court-protocol';
import {other,type Side} from '../../src/game';
import {advanceDeadline,applyCommand,expireBlue,newRoom,reserveBlue,roomSnapshot,type Room,type Seat} from './room-state';

type Env={ROOMS:DurableObjectNamespace;LIMITS:DurableObjectNamespace;ALLOWED_ORIGINS:string;ROOM_TTL_SECONDS?:string};
type SocketIdentity={side:Side;playerId:string;socketId:string;window:number;count:number};
const bytes=new TextEncoder();
const json=(body:unknown,status=200)=>Response.json(body,{status});
const failure=(status:number,message:string)=>json({message},status);
const invalid=()=>failure(404,'密令无效或已失效。');
const code=()=>{
 const sample=new Uint32Array(1);
 do {crypto.getRandomValues(sample);}while(sample[0]>=4_294_000_000);
 return String(sample[0]%1_000_000).padStart(6,'0');
};
const cors=(r:Response,origin:string)=>{
 const h=new Headers(r.headers);h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');h.set('Cache-Control','no-store');
 return new Response(r.body,{status:r.status,headers:h});
};
const allowed=(env:Env,origin:string|null)=>!!origin&&env.ALLOWED_ORIGINS.split(',').map(s=>s.trim()).includes(origin);
function ticket(code:string,side:Side,seat:Seat):RoomTicket{
 return {code,side,playerId:seat.playerId,token:seat.token};
}
async function ruleRequest(req:Request){
 const raw=await req.text();
 if(bytes.encode(raw).length>256)return null;
 try{
  const p=JSON.parse(raw);
  return p?.version===COURT_VERSION&&(p.rule==='classic'||p.rule==='ritual')?p.rule as 'classic'|'ritual':null;
 }catch{return null;}
}
export default {
 async fetch(req:Request,env:Env){
  const url=new URL(req.url),origin=req.headers.get('Origin');
  if(url.pathname==='/health'&&req.method==='GET')return json({ok:true,version:COURT_VERSION});
  if(!allowed(env,origin))return failure(403,'此网页来源未获准连接。');
  const respond=(r:Response)=>cors(r,origin!);
  const isCreate=url.pathname==='/v1/rooms';
  const roomPath=/^\/v1\/rooms\/(\d{6})\/(join|socket)$/.exec(url.pathname);
  if(!isCreate&&!roomPath)return respond(invalid());
  if(req.method==='OPTIONS')return respond(new Response(null,{status:204,headers:{
   'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600',
  }}));
  if(roomPath?.[2]==='socket'&&(req.method!=='GET'||req.headers.get('Upgrade')?.toLowerCase()!=='websocket'))
   return respond(failure(426,'需要 WebSocket 连接。'));
  if(roomPath?.[2]!=='socket'&&req.method!=='POST')return respond(failure(405,'请求方法无效。'));
  const ip=req.headers.get('CF-Connecting-IP')??'local';
  const limit=env.LIMITS.getByName(ip);
  if(!(await limit.fetch('https://limit.internal/'+(isCreate?'create':'connect'),{method:'POST'})).ok)
   return respond(failure(429,'邀约请求过多，请稍后重试。'));
  if(roomPath?.[2]==='socket')return env.ROOMS.getByName(roomPath[1]).fetch(req);
  // Bound the body even if the caller omits Content-Length.
  if(!req.body||Number(req.headers.get('Content-Length'))>256)return respond(failure(413,'邀约请求过大。'));
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>256){await reader.cancel();return respond(failure(413,'邀约请求过大。'));}
   chunks.push(value);
  }
  const body=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const rule=await ruleRequest(new Request('https://room.internal',{method:'POST',body}));
  if(!rule)return respond(failure(400,'棋局规则或游戏版本不一致，请刷新。'));
  const request=(room:string,verb:string)=>env.ROOMS.getByName(room).fetch(`https://room.internal/${room}/${verb}`,
   {method:'POST',body:JSON.stringify({version:COURT_VERSION,rule})});
  if(roomPath)return respond(await request(roomPath[1],'join'));
  for(let retry=0;retry<12;retry++){
   const response=await request(code(),'create');
   if(response.status!==409)return respond(response);
  }
  return respond(failure(503,'暂时无法分配密令，请重试。'));
 },
} satisfies ExportedHandler<Env>;

export class InviteLimit extends DurableObject<Env>{
 async fetch(req:Request){
  const key=new URL(req.url).pathname,cap=key==='/create'?40:160;
  return this.ctx.blockConcurrencyWhile(async()=>{
   const now=Date.now(),slot=Math.floor(now/60_000);
   const previous=await this.ctx.storage.get<{slot:number;count:number}>(key);
   const count=previous?.slot===slot?previous.count:0;
   if(count>=cap)return new Response(null,{status:429});
   await this.ctx.storage.put(key,{slot,count:count+1});
   if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+120_000);
   return new Response(null,{status:204});
  });
 }
 async alarm(){await this.ctx.storage.deleteAll();}
}

export class CourtRoom extends DurableObject<Env>{
 constructor(ctx:DurableObjectState,env:Env){
  super(ctx,env);
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 private getRoom(){return this.ctx.storage.get<Room>('room');}
 private sockets(room:Room,side:Side){
  const id=room.seats[side]?.socketId;
  return id?this.ctx.getWebSockets(side).filter(ws=>ws.readyState===WebSocket.OPEN&&this.identity(ws)?.socketId===id):[];
 }
 private identity(ws:WebSocket):SocketIdentity|null{return ws.deserializeAttachment() as SocketIdentity|null;}
 private send(ws:WebSocket,message:unknown){try{ws.send(JSON.stringify(message));}catch{/* Socket close callback updates presence. */}}
 private broadcast(room:Room){
  for(const side of ['red','blue'] as const){
   const snapshot=roomSnapshot(room,side,this.sockets(room,other(side)).length>0);
   for(const ws of this.sockets(room,side))this.send(ws,snapshot);
  }
 }
 private async save(room:Room,touch=false){
  if(touch){
   const seconds=Number(this.env.ROOM_TTL_SECONDS);
   room.expires=Date.now()+(Number.isInteger(seconds)&&seconds>=2&&seconds<=86400?seconds*1000:ROOM_TTL);
  }
  room.revision++;
  await this.ctx.storage.put('room',room);
  await this.schedule(room);
 }
 private async schedule(room:Room){
  const next=Math.min(room.expires,room.deploymentUntil??Infinity,room.seats.blue?.reservedUntil??Infinity);
  const previous=await this.ctx.storage.getAlarm();
  if(previous===null||next<previous)await this.ctx.storage.setAlarm(next);
 }
 private async shutdown(message:string){
  for(const ws of this.ctx.getWebSockets()){
   this.send(ws,{type:'closed',message});
   try{ws.close(4000,'room closed');}catch{/* Already closed. */}
  }
  await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();
 }
 private async current(){
  const room=await this.getRoom(),now=Date.now();
  if(!room)return null;
  if(room.expires<=now){await this.shutdown('邀约已过期。');return null;}
  const released=expireBlue(room,now),started=advanceDeadline(room,now);
  if(released||started){await this.save(room);this.broadcast(room);}
  return room;
 }
 async fetch(req:Request){
  const url=new URL(req.url);
  return this.ctx.blockConcurrencyWhile(async()=>{
   const room=await this.current(),now=Date.now();
   if(req.method==='POST'){
    const [,code,verb]=url.pathname.split('/');
    const rule=await ruleRequest(req);
    if(!rule)return failure(400,'棋局规则或游戏版本不一致，请刷新。');
    if(verb==='create'){
     if(room)return failure(409,'密令已占用。');
     const fresh=newRoom(code,rule,now);await this.save(fresh,true);
     return json(ticket(code,'red',fresh.seats.red),201);
    }
    if(verb!=='join'||!room)return invalid();
    if(room.rule!==rule)return failure(409,'双方所选规则不同。请返回选择相同规则。');
    if(room.stage!=='waiting')return failure(409,'此局已有执棋者。');
    const seat=reserveBlue(room,now);
    if(!seat)return failure(409,'此局已有执棋者。');
    await this.save(room,true);
    return json(ticket(code,'blue',seat));
   }
   if(!room)return invalid();
   if(!allowed(this.env,req.headers.get('Origin')))return failure(403,'此网页来源未获准连接。');
   const protocols=(req.headers.get('Sec-WebSocket-Protocol')??'').split(',').map(p=>p.trim());
   const token=protocols.find(p=>/^seat\.[a-f0-9]{64}$/.test(p))?.slice(5);
   const side:Side|undefined=token&&token===room.seats.red.token?'red':token&&token===room.seats.blue?.token?'blue':undefined;
   if(!protocols.includes(COURT_SOCKET)||!side)return failure(401,'席位凭证无效。');
   const seat=room.seats[side]!,old=this.sockets(room,side);
   const [client,server]=Object.values(new WebSocketPair());
   this.ctx.acceptWebSocket(server,[side]);
   seat.socketId=crypto.randomUUID();delete seat.reservedUntil;
   server.serializeAttachment({side,playerId:seat.playerId,socketId:seat.socketId,window:now,count:0} satisfies SocketIdentity);
   await this.save(room,true);
   for(const ws of old)try{ws.close(4001,'seat replaced');}catch{/* Already closed. */}
   this.broadcast(room);
   return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':COURT_SOCKET}});
  });
 }
 async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
  await this.ctx.blockConcurrencyWhile(async()=>{
   const room=await this.current(),identity=this.identity(ws);
   if(!room||!identity)return;
   const seat=room.seats[identity.side];
   if(seat?.playerId!==identity.playerId||seat.socketId!==identity.socketId)return;
   const now=Date.now();
   if(now-identity.window>=10_000){identity.window=now;identity.count=0;}
   if(++identity.count>45){ws.close(4008,'rate limit');return;}
   ws.serializeAttachment(identity);
   if(typeof message!=='string'||message.length>4096||bytes.encode(message).length>4096){ws.close(1009,'message too large');return;}
   let command:unknown;
   try{command=JSON.parse(message);}catch{this.send(ws,{type:'error',message:'无效消息。'});return;}
   if(command&&typeof command==='object'&&'type' in command&&command.type==='leave'){
    if(identity.side==='blue'&&room.stage==='waiting'){
     delete room.seats.blue;room.ready={red:false,blue:false};await this.save(room,true);this.broadcast(room);
     ws.close(4000,'seat left');return;
    }
    await this.shutdown('对方暂离王庭');return;
   }
   if(command&&typeof command==='object'&&'type' in command){
    if(command.type==='profile'){
     const profile=readProfile('profile' in command?command.profile:null);
     if(!profile||room.stage!=='waiting'||(seat.profile?.id===profile.id&&seat.profile.nickname===profile.nickname))return;
     seat.profile=profile;await this.save(room);this.broadcast(room);return;
    }
    if(command.type==='interaction'){
     const interaction=readInteraction(command);
     if(!interaction||room.stage!=='playing'||!room.game||room.game.result||
      !('matchId' in command)||command.matchId!==room.matchId||now-(seat.lastInteraction??0)<COURT_COOLDOWN)return;
     const peers=this.sockets(room,other(identity.side));
     if(!peers.length)return;
     seat.lastInteraction=now;await this.ctx.storage.put('room',room);
     for(const peer of peers)this.send(peer,{type:'interaction',...interaction,side:identity.side,matchId:room.matchId});
     return;
    }
   }
   const outcome=applyCommand(room,identity.side,command,now,this.sockets(room,other(identity.side)).length>0);
   if(outcome.changed){await this.save(room,true);this.broadcast(room);}
   if(outcome.notice)this.send(ws,outcome.notice);
  });
 }
 private async disconnect(ws:WebSocket){
  await this.ctx.blockConcurrencyWhile(async()=>{
   const room=await this.current(),identity=this.identity(ws);
   if(!room||!identity)return;
   const seat=room.seats[identity.side];
   if(!seat||seat.socketId!==identity.socketId)return;
   delete seat.socketId;
   await this.save(room);this.broadcast(room);
  });
 }
 async webSocketClose(ws:WebSocket){await this.disconnect(ws);try{ws.close();}catch{/* Already closed. */}}
 async webSocketError(ws:WebSocket){await this.disconnect(ws);}
 async alarm(){
  await this.ctx.blockConcurrencyWhile(async()=>{
   const room=await this.current();
   if(room)await this.schedule(room);
  });
 }
}
