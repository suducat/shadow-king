import {useEffect} from 'react';
import {OpponentEntrance} from './OpponentEntrance';
import {DIFFICULTIES,type Difficulty} from './ai';

const outcomeLines:Record<Difficulty,[string,string]>={
 easy:['棋侍收起棋谱。','棋侍低头，重新排列棋子。'],
 normal:['影谋收剑入鞘。','影谋的剑锋垂落。'],
 hard:['诡相展扇，最后一计已成。','诡相合扇，退入帷幕后。'],
 master:['无冕者举起失落的王冠。','无冕者摘下王冠。'],
 omniscient:['全知者合上永夜之眼。','帷幕落下，全知者的目光归于沉寂。'],
};

export function MatchVignette({difficulty,outcome,reduced,onEnd,online=false}:{
 difficulty?:Difficulty;outcome?:'win'|'loss';reduced:boolean;onEnd?:()=>void;online?:boolean;
}){
 useEffect(()=>{
  if(!onEnd)return;
  const timer=setTimeout(onEnd,reduced?180:850);
  return ()=>clearTimeout(timer);
 },[onEnd,reduced]);
 return <div className={`match-vignette ${reduced?'still':''}`} data-outcome={outcome??'start'}>
  <div className="match-vignette-art">
   {difficulty?<OpponentEntrance difficulty={difficulty}/>:<svg viewBox="0 0 348 264" aria-hidden="true">
    <g className="entrance-sigil" fill="none" stroke="currentColor">
     <circle cx="174" cy="128" r="89" strokeDasharray="2 7"/>
     <path d="M174 51l91 77-91 77-91-77z"/>
    </g>
    <g className="entrance-actor" fill="none" stroke="currentColor" strokeWidth="2">
     <path className="entrance-metal" d="m119 111 29 22 26-40 26 40 29-22-13 67h-84z"/>
     <path d="M140 193h68M174 122v42"/>
    </g>
   </svg>}
  </div>
  <div className="match-vignette-copy" role="status">
   <strong>{outcome&&difficulty?`${DIFFICULTIES[difficulty].name} · ${outcome==='win'?'胜利':'败北'}`:online?'棋局启幕':'永夜棋局 · 开局'}</strong>
   <p>{outcome&&difficulty?outcomeLines[difficulty][outcome==='win'?0:1]:'帷幕落下，红方先行。'}</p>
  </div>
 </div>;
}
