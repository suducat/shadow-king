import {type Game,type Role,type Side} from './game';
import {COURT_SOCKET,COURT_VERSION,type CourtCommand,type CourtIntent,type CourtNotice,type CourtSnapshot,type ProjectedGame,type RoomTicket} from './court-protocol';
import type {GameAction,GameMode} from './ritual';

const interrupted='与王庭的连接暂时中断';
const opponentAway='对方暂离王庭';
const retryDelay=[400,800,1600,3200,6400];
const endpoint=import.meta.env.VITE_MULTIPLAYER_URL?.trim();
type State={
 stage:'opening'|'waiting'|'connecting'|'ready'|'deploying'|'playing'|'reconnecting'|'error';
 code:string;side:Side;ready:boolean;otherReady:boolean;starting:boolean;
 message:string;pending:boolean;rematchRequested:boolean;opponentRematch:boolean;
 deploymentUntil?:number;deploymentLocked?:boolean;opponentPaused?:boolean;reconnectable?:boolean;
};
export type TurnDisplay={action:GameAction|null;before:Game;next:Game};

// App's board expects a Game. Masked roles remain placeholders and never
// participate in legal-action resolution or comparison of positions locally.
function adaptGame(game:ProjectedGame):Game{
 return {...game,seen:{},pieces:game.pieces.map(p=>({...p,role:p.role==='unknown'?'guard':p.role}))};
}
const ownLine=(draft:Game,side:Side)=>draft.pieces.filter(p=>p.side===side).sort((a,b)=>a.x-b.x).map(p=>p.role);
export class CourtSession{
 private url:URL|null=null;
 private ticket?:RoomTicket;
 private socket?:WebSocket;
 private request?:AbortController;
 private retryTimer?:ReturnType<typeof setTimeout>;
 private deadline?:ReturnType<typeof setTimeout>;
 private heartbeat?:ReturnType<typeof setInterval>;
 private pongTimeout?:ReturnType<typeof setTimeout>;
 private failures=0;
 private closed=false;
 private suspended=false;
 private revision=-1;
 private matchId='';
 private game?:Game;
 private lastStage?:CourtSnapshot['stage'];
 private outbox?:CourtCommand&{type:'action'};
 private replay=false;
 private deployment?:{matchId:string;line:Role[];locked:boolean};
 private lastDraft='';
 state:State;
 constructor(private rule:GameMode,side:Side,code:string,private publish:(s:State)=>void,
  private onStart:(g:Game,side:Side,deploying?:boolean)=>void,private onTurn:(turn:TurnDisplay)=>void){
  this.state={stage:side==='red'?'opening':'connecting',code,side,ready:false,otherReady:false,starting:false,
   message:'正在连接邀约服务……',pending:false,rematchRequested:false,opponentRematch:false};
 }
 private update(change:Partial<State>){this.state={...this.state,...change};if(!this.closed)this.publish(this.state);}
 private fail(message:string,reconnectable=false){
  this.update({stage:'error',message,pending:false,opponentPaused:false,reconnectable});
 }
 async open(){
  if(this.closed)return;
  this.update({});
  if(!endpoint){this.fail('王庭邀约服务尚未配置。');return;}
  try{
   this.url=new URL(endpoint);
   const local=['localhost','127.0.0.1','[::1]'].includes(this.url.hostname);
   if(this.url.protocol!=='https:'&&!(local&&this.url.protocol==='http:'))throw new Error();
  }catch{this.fail('邀约服务地址无效。');return;}
  const request=this.request=new AbortController(),timer=setTimeout(()=>request.abort(),9000);
  try{
   const hosting=this.state.side==='red';
   if(!hosting&&!/^\d{6}$/.test(this.state.code)){this.fail('密令无效或已失效。');return;}
   const response=await fetch(new URL(hosting?'/v1/rooms':`/v1/rooms/${this.state.code}/join`,this.url),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:COURT_VERSION,rule:this.rule}),signal:request.signal,
   });
   const body=await response.json();
   if(this.closed)return;
   if(!response.ok){this.fail(typeof body.message==='string'?body.message:'邀约未能建立，请重试。');return;}
   if(body.side!==this.state.side||!/^\d{6}$/.test(body.code)||!/^[a-f0-9]{64}$/.test(body.token)||typeof body.playerId!=='string')throw new Error();
   this.ticket=body as RoomTicket;this.connect();
  }catch{if(!this.closed)this.fail('暂时无法连接邀约服务，请检查网络后重试。');}
  finally{clearTimeout(timer);this.request=undefined;}
 }
 private connect(){
  if(this.closed||this.suspended||this.socket||!this.ticket||!this.url)return;
  clearTimeout(this.retryTimer);
  const url=new URL(`/v1/rooms/${this.ticket.code}/socket`,this.url);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url,[COURT_SOCKET,`seat.${this.ticket.token}`]);
  this.socket=socket;
  this.deadline=setTimeout(()=>this.lost(socket),6000);
  socket.addEventListener('message',event=>{
   if(this.closed||this.socket!==socket)return;
   clearTimeout(this.pongTimeout);
   if(event.data==='pong')return;
   let data:CourtSnapshot|CourtNotice;
   try{data=JSON.parse(event.data);}catch{return;}
   if(data?.type==='state'&&data.rule===this.rule&&data.revision>this.revision){
    clearTimeout(this.deadline);this.failures=0;
    this.heartbeat??=setInterval(()=>{
     if(this.socket!==socket||socket.readyState!==WebSocket.OPEN)return;
     try{socket.send('ping');this.pongTimeout=setTimeout(()=>this.lost(socket),9000);}
     catch{this.lost(socket);}
    },20_000);
    this.sync(data);
   }else if(data?.type==='closed'){
    this.ticket=undefined;this.dropSocket();this.fail(data.message);
   }else if(data?.type==='error'){
    if(data.actionId&&this.outbox?.intent.actionId===data.actionId)this.outbox=undefined;
    if(this.deployment?.locked&&this.state.stage==='deploying'&&!this.state.deploymentLocked)this.deployment.locked=false;
    this.update({message:data.message,pending:!!this.outbox});
   }else if(data?.type==='ack'&&this.outbox?.intent.actionId===data.actionId){
    this.outbox=undefined;this.update({pending:false});
   }
  });
  socket.addEventListener('error',()=>this.lost(socket));
  socket.addEventListener('close',event=>{
   if(this.socket!==socket)return;
   if(event.code===4000||event.code===4001){
    this.ticket=undefined;this.dropSocket();this.fail(event.code===4001?'此席位已在另一个页面连接。':'邀约已结束。');
   }else this.lost(socket);
  });
 }
 private sync(s:CourtSnapshot){
  const next=s.game?adaptGame(s.game):undefined,previous=this.game,matchChanged=s.matchId!==this.matchId;
  const resumed=this.state.stage==='reconnecting'||this.state.stage==='error';
  this.revision=s.revision;this.matchId=s.matchId;this.game=next;
  if(matchChanged){this.outbox=undefined;this.replay=false;this.deployment=undefined;this.lastDraft='';}
  if(this.outbox&&(s.lastTurn?.actionId===this.outbox.intent.actionId||!next||next.ply!==this.outbox.intent.turnNumber||next.result))this.outbox=undefined;
  // During deployment publish private local edits, but keep their UI in place
  // when other players change their readiness or a socket reconnects.
  if(next&&(matchChanged||this.lastStage!==s.stage||!previous)){
   this.onStart(next,this.state.side,s.stage==='deploying');
  }else if(next&&previous&&s.stage==='playing'){
   const action=s.lastTurn;
   if(action?.payload&&previous.ply+1===next.ply&&action.turnNumber===previous.ply)
    this.onTurn({before:previous,next,action:action.payload});
   else if(next.ply===previous.ply&&next.result&&!previous.result)
    this.onTurn({before:previous,next,action:null});
   else if(next.ply!==previous.ply)this.onStart(next,this.state.side);
  }
  this.lastStage=s.stage;
  const opponentPaused=(s.stage==='playing'||s.stage==='deploying')&&!s.opponentConnected&&!next?.result;
  const stage=s.stage==='waiting'&&this.state.side==='blue'?'connecting':s.stage;
  this.update({stage,code:this.ticket!.code,ready:s.ready,otherReady:s.otherReady,opponentPaused,
   pending:!!this.outbox,reconnectable:false,rematchRequested:s.rematchRequested,opponentRematch:s.opponentRematch,
   deploymentUntil:s.deploymentUntil===undefined?undefined:Date.now()+Math.max(0,s.deploymentUntil-s.serverNow),
   deploymentLocked:s.deploymentLocked||!!this.deployment?.locked,
   message:opponentPaused||stage==='connecting'?opponentAway:stage==='ready'?'应邀者已至':'',
  });
  if(resumed&&s.stage==='deploying'&&this.deployment&&!s.deploymentLocked)
   this.send({type:this.deployment.locked?'deployment':'draft',matchId:this.matchId,line:this.deployment.line});
  if(s.stage!=='deploying')this.deployment=undefined;
  if(this.replay&&this.outbox&&s.opponentConnected){this.replay=false;this.send(this.outbox);}
 }
 private dropSocket(){
  clearTimeout(this.deadline);clearTimeout(this.pongTimeout);clearInterval(this.heartbeat);this.heartbeat=undefined;
  const socket=this.socket;this.socket=undefined;
  socket?.close();
 }
 private lost(socket:WebSocket){
  if(this.socket!==socket||this.closed)return;
  this.dropSocket();this.replay=!!this.outbox;
  if(this.suspended)return;
  if(this.failures>=retryDelay.length){this.fail('暂时无法恢复与王庭的连接。',!!this.ticket);return;}
  this.update({stage:'reconnecting',message:interrupted,reconnectable:true});
  this.retryTimer=setTimeout(()=>this.connect(),retryDelay[this.failures++]+Math.floor(Math.random()*180));
 }
 reconnect(){
  if(!this.ticket||this.closed||this.socket)return;
  clearTimeout(this.retryTimer);this.failures=0;this.suspended=false;
  this.update({stage:'reconnecting',message:interrupted,reconnectable:true});this.connect();
 }
 suspend(){
  this.suspended=true;clearTimeout(this.retryTimer);this.replay=!!this.outbox;this.dropSocket();
 }
 close(){
  if(this.closed)return;
  if(this.socket?.readyState===WebSocket.OPEN)this.sendRaw({type:'leave'});
  this.closed=true;this.ticket=undefined;this.outbox=undefined;this.request?.abort();
  clearTimeout(this.retryTimer);this.dropSocket();
 }
 private sendRaw(command:unknown){
  if(this.socket?.readyState!==WebSocket.OPEN)return false;
  try{this.socket.send(JSON.stringify(command));return true;}catch{this.lost(this.socket);return false;}
 }
 private send(command:CourtCommand){return this.sendRaw(command);}
 toggleReady(){if(this.state.stage==='ready')this.send({type:'ready',value:!this.state.ready});}
 updateDraft(draft:Game){
  if(this.lastStage!=='deploying'||this.state.deploymentLocked)return;
  const line=ownLine(draft,this.state.side),key=line.join('/');
  if(line.length!==7||key===this.lastDraft)return;
  this.lastDraft=key;this.deployment={matchId:this.matchId,line,locked:false};
  this.send({type:'draft',matchId:this.matchId,line});
 }
 lockDeployment(draft:Game){
  if(this.state.stage!=='deploying'||this.state.deploymentLocked)return;
  const line=ownLine(draft,this.state.side);
  this.deployment={matchId:this.matchId,line,locked:true};
  this.update({deploymentLocked:true});
  this.send({type:'deployment',matchId:this.matchId,line});
 }
 private submit(action:GameAction|null){
  if(!this.ticket||!this.game||this.state.stage!=='playing'||this.state.opponentPaused||this.outbox||this.game.result)return;
  const intent:CourtIntent={matchId:this.matchId,actionId:crypto.randomUUID(),playerId:this.ticket.playerId,
   turnNumber:this.game.ply,sequenceNumber:this.game.ply+1,actionType:action?(action.kind??'move'):'resign',payload:action};
  this.outbox={type:'action',intent};this.update({pending:true});
  if(!this.send(this.outbox))this.replay=!!this.outbox;
 }
 play(action:GameAction){this.submit(action);}
 resign(){this.submit(null);}
 requestRematch(){if(this.game?.result&&this.state.stage==='playing')this.send({type:'rematch',matchId:this.matchId});}
}
