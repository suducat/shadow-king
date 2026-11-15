import { useLayoutEffect, useRef, useState } from 'react';
import type { Ending } from './game';
const shards = [
  'M72 72L68 30 94 53 101 77Z', 'M103 78L95 53 112 14 124 58 126 80Z',
  'M128 81L124 57 145 39 157 63 151 81Z', 'M151 81L157 62 181 29 174 76Z',
  'M76 83L119 85 118 100 80 99Z', 'M124 85L169 81 167 98 127 101Z',
];
export function EndCinematic({ reason }: { reason: Ending }) {
  const [skipped,setSkipped]=useState(false);
  const host=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const root=host.current?.parentElement;if(!root)return;
    const reduce=skipped||!!root.closest('.reduced-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations=root.getAnimations({subtree:true}).flatMap(animation=>{
      const end=Number(animation.effect?.getComputedTiming().endTime);
      if(!Number.isFinite(end)||end<=0)return [];
      animation.pause();animation.currentTime=reduce?end:0;
      return [{animation,end}];
    });
    if(reduce||!animations.length)return;
    // Use the same monotonic clock as chess movement. CSS animation start times
    // can remain pending behind a busy WebGL compositor; explicit progress keeps
    // the three endings in sync and also makes their frame progression testable.
    const start=performance.now(),end=Math.max(...animations.map(a=>a.end));let frame=0;
    const tick=()=>{const elapsed=performance.now()-start;for(const a of animations)a.animation.currentTime=Math.min(elapsed,a.end);if(elapsed<end)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[reason,skipped]);
  const isKing=reason==='king'||reason==='resign',isGuard=reason==='guard',isMartyr=reason==='martyr',isRitual=reason==='ritual';
  return <div ref={host} className={`end-cinematic ${skipped?'cinematic-skipped':''}`} data-cinematic={reason}>
    {isKing ? <div className="regicide-stage"><div className="royal-shockwave"/><div className="royal-shockwave second"/><svg viewBox="0 0 250 150" className="broken-crown" aria-label="破碎的王冠"><defs><linearGradient id="crown-gold" x2=".8" y2="1"><stop stopColor="#f3dfac"/><stop offset=".5" stopColor="#af8544"/><stop offset="1" stopColor="#6e4c29"/></linearGradient></defs>{shards.map((d,i)=><path key={i} d={d} fill="url(#crown-gold)" stroke="#e1c086" strokeWidth=".7" style={{'--dx':`${(i%3-1)*20}px`,'--dy':`${i<4?-10:17}px`,'--dr':`${(i%2?1:-1)*(6+i)}deg`,'--delay':`${.2+i*.04}s`} as React.CSSProperties}/>)}<path d="M109 107l-15 17m38-17 6 22m23-26 19 12" stroke="#c8a362" strokeWidth=".6"/></svg><svg className="royal-runes" viewBox="0 0 360 100" aria-hidden="true"><ellipse cx="180" cy="50" rx="145" ry="29"/><ellipse cx="180" cy="50" rx="125" ry="23"/>{Array.from({length:16},(_,i)=><path key={i} transform={`translate(${180+Math.sin(i*Math.PI/8)*136},${50+Math.cos(i*Math.PI/8)*25}) rotate(${i*22.5})`} d="M-3-5 1 1-3 5M1 1 5-2"/>)}</svg><span className="cinematic-caption">王座失辉 · 王冠破碎</span></div> : isGuard ? <div className="guard-stage"><svg className="collapsing-array" viewBox="0 0 350 220" aria-hidden="true"><circle cx="175" cy="115" r="87"/><circle cx="175" cy="115" r="95"/><path d="m175 20 82 143H93ZM80 95l89 20-30 30 35 65m86-105-74 10 13 37-24 58"/></svg><div className="three-guards">{[0,1,2].map(i=><div className="guard-oath" key={i} style={{'--i':i} as React.CSSProperties}><svg viewBox="0 0 70 120" aria-label={`第${i+1}道守护符文熄灭`}><path d="M35 8 17 31l5 37 13 12 13-12 5-37Z" className="oath-shield"/><path d="M35 18v80m-12-19h24M35 94l-4 12 4 6 4-6Z"/><path d="M20 29h30M24 39l6 4m16-4-6 4"/></svg><span>◆</span></div>)}</div><div className="silver-shatter">{Array.from({length:18},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}</div><span className="cinematic-caption">誓言逐一熄灭 · 守护法阵崩塌</span></div> : isMartyr ? <div className="sacrifice-stage"><div className="sacrifice-flare"/><svg className="great-seal" viewBox="0 0 320 320" aria-label="三道献祭印同时点亮的紫金法阵"><circle cx="160" cy="160" r="119"/><circle cx="160" cy="160" r="128"/><circle cx="160" cy="160" r="97"/><path d="m160 55 91 158H69ZM160 265 69 107h182Z" className="seal-star"/><circle cx="160" cy="160" r="39"/><path d="m160 134 17 26-17 26-17-26ZM134 160h52"/>{Array.from({length:24},(_,i)=><path key={i} transform={`translate(${160+Math.sin(i*Math.PI/12)*110},${160+Math.cos(i*Math.PI/12)*110}) rotate(${-i*15})`} d="M-3-6 3-3-2 2 3 6M-2 2-5 5"/>)}</svg><div className="three-sacrifices">{[0,1,2].map(i=><div key={i} className="sacrifice-mark" style={{'--i':i} as React.CSSProperties}><svg viewBox="0 0 50 50" aria-label="献祭印点亮"><circle cx="25" cy="25" r="20"/><path d="m25 10 13 23H12ZM25 38 12 17h26ZM25 19v12m-6-6h12"/></svg></div>)}</div><span className="cinematic-caption">三印归一 · 命运逆转</span></div> : isRitual?<div className="ritual-throne-stage"><svg className="ritual-throne" viewBox="0 0 320 240" aria-label="王守住九格祭台，祭典完成"><circle cx="160" cy="126" r="96"/><circle cx="160" cy="126" r="106"/>{Array.from({length:9},(_,i)=><rect key={i} x={98+i%3*42} y={64+Math.floor(i/3)*42} width="38" height="38"/>)}<path className="rite-crown" d="m119 112 8-35 23 21 10-34 13 34 23-21 7 35Zm7 9h70v12h-70Z"/><path className="rite-survival" d="M160 38v-18m0 210v-18M72 126H48m224 0h-24"/></svg><div className="rite-defense-wave"/><span className="cinematic-caption">九格祭台 · 王权归位 · 守过回应</span></div> : <div className="draw-stage"><div/><div/><span>◇</span><small>万籁归寂</small></div>}
    {(isKing||isGuard||isMartyr||isRitual)&&<button className="cinematic-skip" onClick={()=>setSkipped(true)} disabled={skipped}>{skipped?'演出已跳过':'跳过结算演出'}</button>}
  </div>;
}
