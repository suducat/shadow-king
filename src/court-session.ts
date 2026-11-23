import {courtIce,relayConfiguration} from './court-ice';
import type {DataConnection,Peer as PeerInstance} from 'peerjs';
import {other,type Game,type Role,type Side} from './game';
import type {GameAction,GameMode} from './ritual';
import {
 deployment,disclosures,initialOnline,isCommitments,ownPosition,publicPosition,repetitionMatches,
 resolveOnline,settleRepetition,verifyOpenings,type Commitments,type Opening,
} from './online-rules';

const protocol=3,gameVersion='0.8.1';
const namespace='shadow-king-summons-v1-';
const failure='邀约未能建立，请重试。';
const signalFailure='暂时无法连接邀约服务，请检查网络后重试。';
const channelFailure='直连和中继均未连通。请保持房主页打开，换用另一网络后重试。';
const invalid='密令无效或已失效。';
const full='此局已有执棋者。';
const absent='对方暂离王庭';
const identifier=()=>crypto.randomUUID();
const code=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');
type State={stage:'opening'|'waiting'|'connecting'|'ready'|'deploying'|'playing'|'error';code:string;side:Side;ready:boolean;otherReady:boolean;starting:boolean;message:string;pending:boolean;rematchRequested:boolean;opponentRematch:boolean;deploymentUntil?:number;deploymentLocked?:boolean;};
type Packet=Record<string,unknown>;
type Turn={match:string;ply:number;op:string;side:Side;action:GameAction};
type Pending={turn:Turn;next?:Game;matches?:number[]};
export type TurnDisplay={action:GameAction|null;before:Game;next:Game};

function actionFrom(value:unknown):GameAction{
 const a=value as Partial<GameAction>|null;
 if(!a||typeof a.id!=='string'||!/^(red|blue)-[0-6]$/.test(a.id)||
 !Number.isInteger(a.x)||!Number.isInteger(a.y)||a.x!<0||a.x!>6||a.y!<0||a.y!>6||
 ![undefined,'move','charge','execute'].includes(a.kind))throw new Error('非法操作');
 return {id:a.id,x:a.x!,y:a.y!,...(a.kind?{kind:a.kind}:{})};
}

function sameAction(a:GameAction,b:GameAction){
 return a.id===b.id&&a.x===b.x&&a.y===b.y&&(a.kind??'move')===(b.kind??'move');
}

export class CourtSession{
 private peer?:PeerInstance;
 private channel?:DataConnection;
 private peerGeneration=0;
 private resumeHost?:()=>void;
 private closed=false;
 private failed=false;
 private timer?:ReturnType<typeof setTimeout>;
 private heartbeat?:ReturnType<typeof setInterval>;
 private lastSignal=0;
 private mailbox=Promise.resolve();
 private match='';
 private offer='';
 private rematchId='';
 private secrets:Opening[]=[];
 private roles=new Map<string,Role>();
 private hashes:Commitments={};
 private remoteHashes:Commitments={};
 private game?:Game;
 private localDeployed=false;
 private remoteDeployed=false;
 private wait?:Pending;
 private history=new Map<number,{publicKey:string;ownKey:string}>();
 private localReady=false;
 private remoteReady=false;
 state:State;

 constructor(private rule:GameMode,side:Side,secret:string,private publish:(s:State)=>void,
  private onStart:(g:Game,side:Side,deploying?:boolean)=>void,private onTurn:(turn:TurnDisplay)=>void){
  this.state={stage:side==='red'?'opening':'connecting',code:secret,side,ready:false,otherReady:false,starting:false,message:'',pending:false,rematchRequested:false,opponentRematch:false};
 }
 private update(next:Partial<State>){this.state={...this.state,...next};if(!this.closed)this.publish(this.state);}
 private arm(message=failure,ms=18_000,onTimeout=()=>this.fail(message)){
  clearTimeout(this.timer);this.timer=setTimeout(onTimeout,ms);
 }
 private fail(message:string){
  if(this.closed||this.failed)return;
  this.failed=true;
  this.update({stage:'error',message,pending:false,starting:false});
  this.release();
 }
 private release(){
  clearTimeout(this.timer);clearInterval(this.heartbeat);
  this.detachChannel();this.peer?.destroy();
  this.peer=undefined;this.resumeHost=undefined;
  this.wait=undefined;this.secrets=[];this.roles.clear();this.history.clear();this.game=undefined;
 }
 close(){
  if(this.active&&this.channel?.open){try{this.send({type:'bye'});}catch{/* heartbeat covers abrupt closure */}}
  this.closed=true;this.release();
 }
 private get active(){return !this.closed&&!this.failed;}
 private send(payload:Packet){
  if(!this.active||!this.channel?.open)throw new Error(absent);
  this.channel.send(payload);
 }
 async open(){
  this.update({message:'正在连接邀约服务……'});this.arm(signalFailure,9000);
  try{
   const {default:Peer}=await import('peerjs');
   const testPort=import.meta.env.MODE==='test'?import.meta.env.VITE_PEER_TEST_PORT:undefined;
   const testRelay=import.meta.env.MODE==='test'?import.meta.env.VITE_TURN_TEST_URL:undefined;
   const ice=testPort?{iceServers:testRelay?[{urls:testRelay,username:'court-test',credential:'court-test'}]:[]}:await courtIce();
   const hasRelay=!testPort||!!testRelay;
   const host=this.state.side==='red';
   const visit=identifier();
   let collisions=0,retried=false,relayOnly=false;
   const allocate=async()=>{
    const generation=++this.peerGeneration;
    this.detachChannel();
    this.peer?.destroy();
    this.arm(signalFailure,9000);
    const room=host?code():this.state.code;
    const config=relayOnly&&hasRelay?relayConfiguration(ice):ice;
    const signal=testPort?
     {host:'127.0.0.1',port:Number(testPort),path:'/',secure:false,config}:
     {secure:true,config};
    if(!this.active||generation!==this.peerGeneration)return;
    const peer=host?new Peer(namespace+room,signal):new Peer(signal);
    this.peer=peer;
    let registered=false,reconnected=false;
    const current=()=>this.active&&generation===this.peerGeneration;
    this.resumeHost=host?()=>{
     if(!current()||!peer.disconnected)return;
     if(!registered||reconnected){this.fail(signalFailure);return;}
     reconnected=true;
     this.update({stage:'opening',message:'正在恢复邀约服务……'});
     this.arm(signalFailure,9000);
     try{peer.reconnect();}catch{this.fail(signalFailure);}
    }:undefined;
    const retryJoin=(message:string)=>{
     if(!current())return;
     if(host||retried||this.state.stage!=='connecting'){this.fail(message);return;}
     retried=true;relayOnly=message===channelFailure;
     this.resetLobby();
     this.update({message:relayOnly?'直连未完成，正在重新连接并尝试中继……':'正在重新核对邀约……'});
     void allocate().catch(()=>this.fail(signalFailure));
    };
    peer.on('open',()=>{
     if(!current())return;
     registered=true;
     if(host){
      if(!this.channel){clearTimeout(this.timer);this.update({stage:'waiting',code:room,message:''});}
     }else{
      if(!retried)this.update({message:'正在寻找密令对应的王庭……'});
      this.attach(peer.connect(namespace+room,{reliable:true,serialization:'json',metadata:{visit,attempt:retried?2:1,route:relayOnly&&hasRelay?'relay':'auto'}}),retryJoin,relayOnly&&hasRelay);
     }
    });
    peer.on('connection',channel=>{
     if(!current()){channel.close();return;}
     // A retry from the same tab may arrive before the old channel reports
     // its closure. Never replace an established match or a different guest.
     if(host&&this.channel&&!this.game&&typeof channel.metadata?.visit==='string'&&
      channel.metadata.visit===this.channel.metadata?.visit&&
      (channel.metadata.attempt===2||(channel.metadata.attempt===undefined&&this.channel.metadata?.attempt===undefined))&&
      (this.channel.metadata?.attempt??1)===1){
      this.detachChannel();this.resetLobby();
      this.update({stage:'waiting',ready:false,otherReady:false,starting:false});
     }
     if(!host||this.channel){
      const reject=()=>{channel.send({type:'reject',reason:'full'});setTimeout(()=>channel.close(),500);};
      if(channel.open)reject();else channel.once('open',reject);
      return;
     }
     // PeerJS emits the offer before creating its local answer. Set the host's
     // ICE policy on this channel so a relay retry gathers on both devices.
     const relayed=hasRelay&&channel.metadata?.route==='relay';
     if(relayed&&channel.peerConnection){
      try{channel.peerConnection.setConfiguration(relayConfiguration(channel.peerConnection.getConfiguration()));}
      catch{ /* Let the existing ICE configuration try its candidates. */ }
     }
     this.attach(channel,undefined,relayed);
    });
    peer.on('error',error=>{
     if(!current())return;
     if(host&&error.type==='unavailable-id'&&++collisions<12){
      void allocate().catch(()=>this.fail(signalFailure));return;
     }
     if(error.type==='peer-unavailable'){
      if(!host&&!this.channel?.open)this.fail(invalid);
      return;
     }
     const signaling=['network','disconnected','server-error','socket-error','socket-closed'].includes(error.type);
     if(signaling&&(this.channel?.open||host&&registered))return;
     if(error.type==='webrtc'){
      // The connection's ICE listener and deadline are scoped to the attempted
      // channel. PeerJS emits some late errors without a connection identifier.
      return;
     }
     this.fail(this.channel?channelFailure:signalFailure);
    });
    peer.on('disconnected',()=>{
     if(!current()||this.channel?.open)return;
     if(host){
      if(this.channel)this.returnToWaiting();
      else this.resumeHost?.();
     }else if(registered)retryJoin(signalFailure);
     else this.fail(signalFailure);
    });
   };
   await allocate();
  }catch{this.fail(failure);}
 }
 private detachChannel(){
  const channel=this.channel;
  this.channel=undefined;
  clearTimeout(this.timer);clearInterval(this.heartbeat);
  channel?.close();
 }
 private resetLobby(){
  this.match='';this.offer='';this.remoteHashes={};this.hashes={};
  this.secrets=[];this.roles.clear();
  this.localReady=false;this.remoteReady=false;
 }
 private returnToWaiting(){
  this.detachChannel();this.resetLobby();
  this.update({stage:'waiting',ready:false,otherReady:false,starting:false,message:'对方未完成连接，仍可使用此密令。'});
  this.resumeHost?.();
 }
 private attach(channel:DataConnection,retryJoin?:(message:string)=>void,relay=false){
  this.channel=channel;this.lastSignal=Date.now();
  const current=()=>this.active&&this.channel===channel;
  let openedOnce=false;
  const drop=(message=channelFailure)=>{
   if(!current())return;
   if(this.state.side==='red'&&!this.game){this.returnToWaiting();return;}
   if(!this.game&&this.state.stage==='connecting'&&retryJoin){retryJoin(openedOnce&&message===channelFailure?failure:message);return;}
   this.fail(this.match?absent:message);
  };
  this.arm(channelFailure,relay?13_000:10_000,()=>drop());
  const pc=channel.peerConnection;
  let answered=false,localRelay=false;
  const onIce=()=>{
   if(!current()||channel.open)return;
   if(pc.iceConnectionState==='failed'){drop();return;}
   if(this.state.side==='blue'&&pc.remoteDescription&&!answered){
    answered=true;
    this.update({message:relay?'已找到王庭，正在通过中继连接……':'已找到王庭，正在尝试直连或中继……'});
   }
  };
  const onCandidate=({candidate}:RTCPeerConnectionIceEvent)=>{
   if(!current()||channel.open)return;
   if(candidate?.type==='relay'||candidate?.candidate.includes(' typ relay '))localRelay=true;
   if(!candidate&&relay&&this.state.side==='blue'&&!localRelay&&pc.iceGatheringState==='complete'){
    drop();
   }
  };
  pc?.addEventListener('iceconnectionstatechange',onIce);
  pc?.addEventListener('signalingstatechange',onIce);
  pc?.addEventListener('icecandidate',onCandidate);
  channel.once('close',()=>{
   pc?.removeEventListener('iceconnectionstatechange',onIce);
   pc?.removeEventListener('signalingstatechange',onIce);
   pc?.removeEventListener('icecandidate',onCandidate);
  });
  const opened=()=>{
   if(!current()||openedOnce)return;
   openedOnce=true;
   this.arm(failure,7000,()=>drop(failure));
   if(this.state.side==='blue')this.update({message:'连接已建立，正在核对棋局规则……'});
   let lastTick=Date.now();
   this.heartbeat=setInterval(()=>{
    const now=Date.now();
    // Timer suspension on mobile can skip several checks. Probe the channel
    // after waking before interpreting elapsed wall time as a dead peer.
    if(now-lastTick>15_000)this.lastSignal=now;
    lastTick=now;
    if(now-this.lastSignal>22_000){drop();return;}
    try{this.send({type:'ping'});}catch{drop();}
   },6_000);
   if(this.state.side==='blue'){
    try{this.send({type:'hello',protocol,gameVersion,rule:this.rule});}catch{drop();}
   }
  };
  channel.on('open',opened);
  channel.on('close',()=>drop());
  channel.on('error',()=>drop());
  channel.on('data',data=>{
   this.mailbox=this.mailbox.then(async()=>{
    if(!current())return;
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('无效邀约消息');
    this.lastSignal=Date.now();
    await this.receive(data as Packet);
   }).catch(e=>{
    if(!current())return;
    if(this.state.side==='red'&&!this.game)this.returnToWaiting();
    else this.fail(this.game?`对局已暂停：${e instanceof Error?e.message:'同步中断'}`:failure);
   });
  });
  if(channel.open)opened();
 }
 private async initialize(match=this.match){
  const result=await deployment(match,this.state.side);
  if(!this.active||(this.match!==match&&this.rematchId!==match))return false;
  this.secrets=result.openings;this.hashes=result.hashes;
  this.roles=new Map(this.secrets.map(p=>[p.id,p.role]));
  return true;
 }
 private readyRoom(){
  clearTimeout(this.timer);
  this.update({stage:'ready',message:'应邀者已至'});
 }
 toggleReady(){
  if(this.state.stage!=='ready'||this.state.starting)return;
  this.localReady=!this.localReady;
  this.update({ready:this.localReady});
  try{this.send({type:'ready',value:this.localReady});this.propose();}catch{this.fail(failure);}
 }
 private propose(){
  if(this.state.side!=='red'||this.offer||!this.localReady||!this.remoteReady)return;
  this.offer=identifier();
  this.update({starting:true});
  this.arm();
  this.send({type:'start-offer',offer:this.offer});
 }
 private deployBoard(){
  if(this.state.stage==='deploying')return;
  if(this.rematchId){this.match=this.rematchId;this.rematchId='';}
  this.game=undefined;this.localDeployed=this.remoteDeployed=false;
  this.arm(absent,48_000);
  this.update({stage:'deploying',deploymentUntil:Date.now()+30_000,deploymentLocked:false,
   starting:false,rematchRequested:false,opponentRematch:false,message:'秘密布阵'});
  this.onStart(initialOnline(this.rule,this.state.side,this.roles),this.state.side,true);
 }
 lockDeployment(draft:Game){
  if(!this.active||this.state.stage!=='deploying'||this.state.deploymentLocked)return;
  this.update({deploymentLocked:true});
  this.mailbox=this.mailbox.then(async()=>{
   const match=this.match;
   const result=await deployment(match,this.state.side,draft);
   if(!this.active||this.state.stage!=='deploying'||match!==this.match)return;
   this.secrets=result.openings;this.hashes=result.hashes;
   this.roles=new Map(this.secrets.map(p=>[p.id,p.role]));
   this.localDeployed=true;
   this.send({type:'deployment-lock',match,hashes:this.hashes});
   this.checkDeployment();
  }).catch(()=>this.fail('未能确认布阵。'));
 }
 private checkDeployment(){
  if(this.state.side!=='red'||!this.localDeployed||!this.remoteDeployed)return;
  this.send({type:'deployment-start',match:this.match});this.start();
 }
 private start(){
  if(this.state.stage!=='deploying')return;
  clearTimeout(this.timer);this.history.clear();this.wait=undefined;
  this.game=initialOnline(this.rule,this.state.side,this.roles);
  this.record(this.game);
  this.update({stage:'playing',starting:false,message:'棋局启幕',rematchRequested:false,opponentRematch:false});
  this.onStart(this.game,this.state.side);
 }
 async play(action:GameAction){
  const game=this.game,side=this.state.side;
  if(!this.active||!game||game.result||this.wait||game.turn!==side)return;
  // Queue local intents with network messages so asynchronous proof checks
  // cannot interleave with a second intent.
  this.mailbox=this.mailbox.then(()=>{
   if(!this.active||this.game!==game||this.wait)return;
   action=actionFrom(action);
   resolveOnline(game,action,side,this.roles);
   const turn:Turn={match:this.match,ply:game.ply,op:`${this.match}/${game.ply}`,side,action};
   this.wait={turn};
   this.update({pending:true});this.arm(absent);
   this.send({type:'action',...turn,proofs:action.kind==='charge'?this.proofs([action.id]):[]});
  }).catch(e=>this.fail(e instanceof Error?e.message:absent));
 }
 resign(){
  this.mailbox=this.mailbox.then(()=>{
   const game=this.game;
   if(!this.active||!game||game.result||this.wait||game.turn!==this.state.side)return;
   this.send({type:'resign',match:this.match,ply:game.ply,side:this.state.side});
   this.resigned(game,this.state.side);
  }).catch(()=>this.fail(absent));
 }
 private resigned(game:Game,side:Side){
  const next:Game={...game,result:{winner:other(side),reason:'resign'}};
  this.game=next;this.onTurn({before:game,next,action:null});
 }
 private proofs(ids:string[]){
  return ids.map(id=>{
   const proof=this.secrets.find(p=>p.id===id);
   if(!proof)throw new Error('缺少公开身份凭据');
   return proof;
  });
 }
 private turn(m:Packet,side:Side):Turn|null{
  const game=this.game!;
  if(m.match!==this.match||m.side!==side||!Number.isInteger(m.ply)||m.op!==`${this.match}/${m.ply}`)throw new Error('操作编号无效');
  if(Number(m.ply)<game.ply)return null;
  if(m.ply!==game.ply||side!==game.turn||game.result)throw new Error('回合不同步');
  return {match:this.match,ply:game.ply,op:m.op as string,side,action:actionFrom(m.action)};
 }
 private matches(m:Packet,next:Game):number[]{
  if(!Array.isArray(m.matches))throw new Error('无效重复局面');
  const unique=new Set<number>(),key=publicPosition(next);
  for(const ply of m.matches){
   if(!Number.isInteger(ply)||unique.has(ply)||this.history.get(ply)?.publicKey!==key)throw new Error('无效重复局面');
   unique.add(ply);
  }
  return [...unique];
 }
 private record(game:Game){this.history.set(game.ply,{publicKey:publicPosition(game),ownKey:ownPosition(game,this.state.side)});}
 private apply(before:Game,next:Game,action:GameAction){
  this.game=next;this.wait=undefined;clearTimeout(this.timer);
  this.record(next);this.update({pending:false});
  this.onTurn({before,next,action});
 }
 requestRematch(){
  if(!this.active||!this.game?.result||this.state.rematchRequested)return;
  this.mailbox=this.mailbox.then(async()=>{
   if(!this.active||!this.game?.result||this.state.rematchRequested)return;
   this.update({rematchRequested:true});
   this.send({type:'rematch',match:this.match});
   await this.offerRematch();
  }).catch(()=>this.fail(absent));
 }
 private async offerRematch(){
  if(this.state.side!=='red'||this.rematchId||!this.state.rematchRequested||!this.state.opponentRematch)return;
  this.rematchId=identifier();
  this.arm(absent,9000);
  if(await this.initialize(this.rematchId)){
   this.send({type:'rematch-offer',previous:this.match,match:this.rematchId,hashes:this.hashes});
  }
 }
 private async receiveRematch(m:Packet){
  const side=this.state.side;
  if(m.type==='rematch'&&m.match===this.match){
   this.update({opponentRematch:true});await this.offerRematch();return;
  }
  if(m.type==='rematch-offer'&&side==='blue'&&m.previous===this.match&&
   this.state.rematchRequested&&this.state.opponentRematch&&!this.rematchId&&
   typeof m.match==='string'&&/^[\da-f-]{36}$/.test(m.match)&&m.match!==this.match&&isCommitments(m.hashes,'red')){
   this.rematchId=m.match;this.remoteHashes=m.hashes;
   this.arm(absent,9000);
   if(await this.initialize(this.rematchId))this.send({type:'rematch-ack',match:this.rematchId,hashes:this.hashes});
   return;
  }
  if(m.type==='rematch-ack'&&side==='red'&&this.rematchId&&m.match===this.rematchId&&isCommitments(m.hashes,'blue')){
   this.remoteHashes=m.hashes;this.send({type:'rematch-begin',match:this.rematchId});this.deployBoard();return;
  }
  if(m.type==='rematch-begin'&&side==='blue'&&this.rematchId&&m.match===this.rematchId)this.deployBoard();
 }
 private async receive(m:Packet){
  if(m.type==='ping'){this.send({type:'pong'});return;}
  if(m.type==='pong')return;
  if(m.type==='bye'){if(this.state.side==='red'&&!this.game)this.returnToWaiting();else this.fail(absent);return;}
  if(m.type==='reject'){this.fail(m.reason==='full'?full:m.reason==='rule'?'双方所选规则不同。请返回选择相同规则。':'游戏版本不一致，请刷新后重试。');return;}
  const side=this.state.side,enemy=other(side);
  if(m.type==='hello'&&side==='red'&&!this.match){
   const reason=m.protocol!==protocol||m.gameVersion!==gameVersion?'version':m.rule!==this.rule?'rule':null;
   if(reason){this.send({type:'reject',reason});const rejected=this.channel;this.channel=undefined;
    clearTimeout(this.timer);clearInterval(this.heartbeat);
    setTimeout(()=>rejected?.close(),500);
    return;}
   this.match=identifier();if(!await this.initialize())return;
   this.send({type:'welcome',match:this.match,protocol,gameVersion,rule:this.rule,hashes:this.hashes});
   return;
  }
  if(m.type==='welcome'&&side==='blue'&&!this.match){
   if(typeof m.match!=='string'||!/^[\da-f-]{36}$/.test(m.match)||m.protocol!==protocol||m.gameVersion!==gameVersion||m.rule!==this.rule||!isCommitments(m.hashes,enemy))throw new Error('邀约协议不符');
   this.match=m.match;this.remoteHashes=m.hashes;if(!await this.initialize())return;
   this.send({type:'enroll',match:this.match,hashes:this.hashes});return;
  }
  if(m.type==='enroll'&&side==='red'&&this.state.stage==='waiting'&&m.match===this.match&&isCommitments(m.hashes,enemy)){
   this.remoteHashes=m.hashes;this.send({type:'enrolled',match:this.match});this.readyRoom();return;
  }
  if(m.type==='enrolled'&&side==='blue'&&this.state.stage==='connecting'&&this.match&&m.match===this.match){
   this.readyRoom();return;
  }
  if(this.state.stage==='ready'){
   if(m.type==='ready'&&typeof m.value==='boolean'){
    this.remoteReady=m.value;this.update({otherReady:m.value});this.propose();return;
   }
   if(m.type==='start-offer'&&side==='blue'&&typeof m.offer==='string'&&!this.offer){
    if(!this.localReady||!this.remoteReady){this.send({type:'start-decline',offer:m.offer});return;}
    this.offer=m.offer;this.update({starting:true});this.arm();
    this.send({type:'start-ack',offer:this.offer});return;
   }
   if(m.type==='start-decline'&&side==='red'&&this.offer&&m.offer===this.offer){
    this.offer='';clearTimeout(this.timer);this.update({starting:false});this.propose();return;
   }
   if(m.type==='start-ack'&&side==='red'&&this.offer&&m.offer===this.offer){
    this.send({type:'begin',offer:this.offer});this.deployBoard();return;
   }
   if(m.type==='begin'&&side==='blue'&&this.offer&&m.offer===this.offer){this.deployBoard();return;}
  }
  if(this.state.stage==='deploying'){
   if(m.match!==this.match)return;
   if(m.type==='deployment-lock'&&!this.remoteDeployed&&isCommitments(m.hashes,enemy)){
    this.remoteHashes=m.hashes;this.remoteDeployed=true;this.checkDeployment();return;
   }
   if(m.type==='deployment-start'&&side==='blue'&&this.localDeployed&&this.remoteDeployed){this.start();return;}
   return;
  }
  const game=this.game;
  if(!game)throw new Error('棋局尚未开始');
  if(game.result&&typeof m.type==='string'&&m.type.startsWith('rematch')){await this.receiveRematch(m);return;}
  if(m.type==='resign'){
   if(game.result)return;
   if(m.match!==this.match||m.ply!==game.ply||m.side!==enemy||game.turn!==enemy||this.wait)throw new Error('弃局时回合不同步');
   this.resigned(game,enemy);return;
  }
  if(m.type==='action'){
   const turn=this.turn(m,enemy);if(!turn)return;
   if(this.wait){if(this.wait.turn.op===turn.op)return;throw new Error('上一步尚未确认');}
   const proof=await verifyOpenings(this.match,m.proofs,this.remoteHashes,1);if(!this.active)return;
   const charge=turn.action.kind==='charge';
   if(charge?(proof.length!==1||proof[0].id!==turn.action.id||proof[0].role!=='guard'):proof.length!==0)throw new Error('技能身份不符');
   const {before,next}=resolveOnline(game,turn.action,side,this.roles,proof);
   const matches=repetitionMatches(next,side,this.history);
   this.wait={turn,next,matches};this.arm(absent);
   this.send({type:'resolved',...turn,proofs:this.proofs(disclosures(before,next)),matches});
   return;
  }
  if(m.type==='resolved'){
   const turn=this.turn(m,side);if(!turn)return;
   if(this.wait?.turn.op!==turn.op||this.wait.next||!sameAction(turn.action,this.wait.turn.action))throw new Error('无待确认操作');
   const action=this.wait.turn.action;
   const proofs=await verifyOpenings(this.match,m.proofs,this.remoteHashes,3);if(!this.active)return;
   const {before,next}=resolveOnline(game,action,side,this.roles,proofs);
   const disclosed=disclosures(before,next);
   if(disclosed.length!==proofs.length||proofs.some(p=>!disclosed.includes(p.id)))throw new Error('公开身份与走法不符');
   const matches=repetitionMatches(next,side,this.history);
   const settled=settleRepetition(next,matches,this.matches(m,next));
   this.send({type:'commit',...turn,action,matches,result:settled.result});
   // Render the board that preceded public disclosures, so the existing
   // battle timeline decides exactly when the opponent's identity appears.
   this.apply(game,settled,action);
   return;
  }
  if(m.type==='commit'){
   const turn=this.turn(m,enemy);if(!turn)return;
   const pending=this.wait;
   if(!pending?.next||pending.turn.op!==turn.op||!sameAction(turn.action,pending.turn.action))throw new Error('无待提交操作');
   const next=settleRepetition(pending.next,pending.matches!,this.matches(m,pending.next));
   const result=m.result as Game['result'];
   if((next.result?.winner??null)!==(result?.winner??null)||next.result?.reason!==result?.reason)throw new Error('胜负状态不同步');
   this.apply(game,next,pending.turn.action);
   return;
  }
  throw new Error('无效邀约状态');
 }
}
