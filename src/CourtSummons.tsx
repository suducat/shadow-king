import {CourtReception} from './CourtSocial';
import {courtProfile,saveProfile} from './court-profile';
import {readProfile} from './court-protocol';
import {sideName} from './game';
import {useState,type FormEvent} from 'react';
import {ArrowLeft,ChevronRight,Copy,Crown,KeyRound,DoorOpen} from 'lucide-react';
import type {CourtSession} from './court-session';
import type {GameMode} from './ritual';
import type {Side} from './game';

type Props={rule:GameMode;room:CourtSession['state']|null;
 begin:(side:Side,code?:string)=>void;toggle:()=>void;cancel:()=>void;reconnect:()=>void;back:()=>void;profileChanged:()=>void};

export function CourtSummons({rule,room,begin,toggle,cancel,reconnect,back,profileChanged}:Props){
 const [profile,setProfile]=useState(courtProfile);
 const [nickname,setNickname]=useState(profile.nickname);
 const [join,setJoin]=useState(false);
 const [secret,setSecret]=useState('');
 const [copied,setCopied]=useState('');
 const waiting=room?.stage==='waiting',ready=room?.stage==='ready';
 const busy=room?.stage==='connecting'||room?.stage==='opening'||room?.stage==='reconnecting';
 function enter(e:FormEvent){e.preventDefault();if(/^\d{6}$/.test(secret)&&!busy)begin('blue',secret);}
 const title=ready?'双王就位':room?.side==='red'?'静候应邀者':join?'应邀入局':'王庭邀约';
 return <section className="mode-panel court-summons" aria-label="王庭邀约">
  <button className="text-back" onClick={room?cancel:join?()=>setJoin(false):back}><ArrowLeft size={15}/>{room?'撤销邀约':'返回'}</button>
  <div className="eyebrow">THE COURT’S SUMMONS</div>
  <h2>{title}</h2>
  <p>{ready?'两位执棋者已至，命运只待揭幕。':room?.side==='red'?'邀约已发出，等待另一位执棋者赴约。':join?'输入六位邀约密令，踏入另一座王庭。':'永夜王庭之外，另一位执棋者正等待你的回应。'}</p>
  <div className="court-rule">{rule==='ritual'?'祭典模式':'经典模式'}</div>
  {!room&&!join&&<>
   <button className="mode-card" onClick={()=>begin('red')}><Crown size={27}/><div><strong>发起邀约</strong><small>设下棋局，静候另一位执棋者。</small></div><ChevronRight size={20}/></button>
   <button className="mode-card" onClick={()=>setJoin(true)}><DoorOpen size={27}/><div><strong>应邀入局</strong><small>凭密令进入另一座王庭。</small></div><ChevronRight size={20}/></button>
  </>}
  <form className="court-profile" onSubmit={e=>{
   e.preventDefault();const next=readProfile({...profile,nickname});if(!next)return;
   saveProfile(next);setProfile(next);setNickname(next.nickname);profileChanged();
  }}><label htmlFor="court-nickname">昵称</label><input id="court-nickname" maxLength={24} value={nickname} onChange={e=>setNickname(e.target.value)} />
   <button className="secondary" disabled={nickname===profile.nickname}>保存昵称</button><small className="court-player-id">ID {profile.id}</small></form>
  <CourtReception/>
  {waiting&&<div className="court-invitation">
   <span>邀约密令</span><strong className="court-code" aria-label="邀约密令">{room.code}</strong>
   <button className="secondary" onClick={async()=>{
    try{await navigator.clipboard.writeText(room.code);setCopied('密令已复制');}
    catch{setCopied('请选中上方密令并手动复制。');}
   }}><Copy size={16}/>复制密令</button>
   <p className="court-wait" role="status">{copied||room.message||'静候另一位执棋者'}</p>
  </div>}
  {join&&!ready&&room?.side!=='red'&&<form className="court-join" onSubmit={enter}>
   <label htmlFor="court-secret">邀约密令</label>
   <input id="court-secret" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6}
    value={secret} onChange={e=>setSecret(e.target.value.replace(/\D/g,''))} disabled={busy} required/>
   <button className="primary" disabled={busy||secret.length!==6}><KeyRound size={16}/>确认入局</button>
  </form>}
  {busy&&<p role="status" className="court-message">{room.message||(room.side==='blue'?'正在回应邀约……':'正在发出邀约……')}</p>}
  {room?.stage==='error'&&<>
   <p role="alert" className="court-message court-error">{room.message}</p>
   {room.reconnectable&&<button className="secondary" onClick={reconnect}>重新连接</button>}
   {room.side==='red'&&!room.reconnectable&&<button className="secondary" onClick={()=>begin('red')}>重新发起邀约</button>}
  </>}
  {ready&&<div className="court-ready">
   <p role="status" className="court-message">{room.starting?'棋局启幕':'应邀者已至'}</p>
   {(['red','blue'] as const).map(side=>{
    const local=side===room.side,placed=local?room.ready:room.otherReady;
    return <div key={side} className={side}><Crown size={19}/><strong>{sideName[side]}</strong>
     <span className="court-ready-profile">{room.profiles?.[side]?.nickname??(local?profile.nickname:'执棋者')}<small className="court-player-id">{room.profiles?.[side]?.id??(local?profile.id:'')}</small></span>
     <span>{placed?(local?'己方就位':'对方就位'):'未就位'}</span></div>;
   })}
   <button className="primary" onClick={toggle} disabled={room.starting}>{room.ready?'取消就位':'就位'}</button>
  </div>}
 </section>;
}
