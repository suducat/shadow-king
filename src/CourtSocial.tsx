import {useEffect,useState} from 'react';
import {EMOTES,WHISPERS,type CourtInteraction,type CourtProfile} from './court-protocol';
import {MessageCircle} from 'lucide-react';
import type {CourtSession} from './court-session';
import {modeOf} from './ritual';
import {sideName,other,type Game} from './game';

function KingEmote({id}:{id:number}){
 return <svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true">
  <circle cx="32" cy="32" r="29" fill="#12222e" stroke="#ad8b50"/>
  <path d="M12 54Q13 43 23 41h18q10 2 11 13" fill="#773345" stroke="#b79455" strokeWidth="2"/>
  <path d="M20 51l5-8 7 5 7-5 5 8-12 6Z" fill="#9da7ad" stroke="#ceb176"/>
  <path d="M19 26Q19 16 32 16T45 26v10q0 11-13 11T19 36Z" fill="#dfbd9b" stroke="#634638"/>
  <path d="m18 26-4-14 10 6 8-11 8 11 10-6-4 14Z" fill="#cba358" stroke="#f0d08a" strokeLinejoin="round"/>
  <path d="m32 16 3 4-3 4-3-4Z" fill="#843448"/>
  <g fill="none" stroke="#362628" strokeWidth="2" strokeLinecap="round">
   {id===0?<path d="M23 33q3-4 6 0m6 0q3-4 6 0m-14 5q5 8 10 0"/>:
    id===1?<><path d="m23 32 5-2m8 0 5 2m-13 9q4-5 8 0"/><path d="M24 35v5m16-5v5" stroke="#78bddf" strokeWidth="3"/></>:
    <><path d="m23 31 5 1m9-2 4-2m-16 6h1m12 0h1"/><circle cx="33" cy="40" r="2"/></>}
  </g>
  {id===2&&<path d="M50 29q0-4 4-4 4 0 4 3 0 2-2 3t-2 3m0 4h.1" stroke="#f1d59a" strokeWidth="2" fill="none" strokeLinecap="round"/>}
 </svg>;
}

export function CourtSocial({room,send}:{room:CourtSession['state'];send:(kind:CourtInteraction['kind'],id:number)=>void}){
 const [open,setOpen]=useState(false);
 const [bubble,setBubble]=useState<CourtInteraction>();
 const [,refreshCooldown]=useState(0);
 const interaction=room.interaction;
 useEffect(()=>{
  setBubble(interaction);
  if(!interaction)return;
  const timer=setTimeout(()=>setBubble(undefined),3000);
  return ()=>clearTimeout(timer);
 },[interaction]);
 useEffect(()=>{
  const remaining=(room.sendUntil??0)-Date.now();
  if(remaining<=0)return;
  const timer=setTimeout(()=>refreshCooldown(tick=>tick+1),remaining);
  return ()=>clearTimeout(timer);
 },[room.sendUntil]);
 const disabled=Date.now()<(room.sendUntil??0)||room.stage!=='playing'||room.opponentPaused;
 function sendAndClose(kind:CourtInteraction['kind'],id:number){send(kind,id);setOpen(false);}
 return <div className="court-social">
  <div className="court-social-players">{(['red','blue'] as const).map(side=><div key={side}>
   <small className={side}>{sideName[side]}</small><strong>{room.profiles?.[side]?.nickname??'执棋者'}</strong>
   {bubble?.side===side&&<div key={bubble.kind+bubble.id} className={`court-bubble ${side}`} role="status">
    {bubble.kind==='whisper'?WHISPERS[bubble.id]:<span role="img" aria-label={EMOTES[bubble.id]}><KingEmote id={bubble.id}/></span>}
   </div>}
  </div>)}</div>
  {room.stage!=='deploying'&&<div className="court-interactions" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
   <button type="button" className="secondary court-chat-trigger" title="王庭密语" aria-label="王庭密语" aria-expanded={open} aria-controls="court-chat-panel" onClick={()=>setOpen(value=>!value)}><MessageCircle size={20} aria-hidden="true"/></button>
   <div id="court-chat-panel" className="court-interaction-panel" hidden={!open}>
    <div className="court-phrases">{WHISPERS.map((phrase,id)=><button type="button" key={phrase} disabled={disabled} onClick={()=>sendAndClose('whisper',id)}>{phrase}</button>)}</div>
    <small>王庭戏法</small><div className="court-emotes">{EMOTES.map((name,id)=><button type="button" key={name} aria-label={name} title={name} disabled={disabled} onClick={()=>sendAndClose('emote',id)}><KingEmote id={id}/></button>)}</div>
   </div>
  </div>}
 </div>;
}

export function courtVerdict(game:Game,profiles:Partial<Record<'red'|'blue',CourtProfile>>|undefined){
 const winnerSide=game.result?.winner;
 if(!winnerSide||!game.result||!profiles)return;
 const loserSide=other(winnerSide),winner=profiles[winnerSide],loser=profiles[loserSide];
 if(!winner||!loser)return;
 const w=winner.nickname,l=loser.nickname;
 const lines={
  king:`「${l}」的王冠已然陨落，「${w}」将执掌此局的命运。`,
  guard:`当「${l}」最后的影卫倒下，「${w}」的胜局已无人能够阻挡。`,
  martyr:`「${w}」以最后的献祭改写命运，「${l}」终究未能阻止这场终焉。`,
  ritual:`古老祭典终迎来登临之刻，「${w}」加冕于王庭，「${l}」的王权就此谢幕。`,
 };
 const reason=game.result.reason;
 return {winner,loser,winnerSide,loserSide,line:reason in lines&&(reason!=='ritual'||modeOf(game)==='ritual')?lines[reason as keyof typeof lines]:undefined};
}
