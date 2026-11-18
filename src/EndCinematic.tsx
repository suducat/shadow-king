import { useLayoutEffect, useRef, useState } from 'react';
import {consumeCues,endingTimeline} from './battle-timeline';
import {sound} from './audio';
import type { Ending } from './game';
const shards = [
  'M72 72L68 30 94 53 101 77Z', 'M103 78L95 53 112 14 124 58 126 80Z',
  'M128 81L124 57 145 39 157 63 151 81Z', 'M151 81L157 62 181 29 174 76Z',
  'M76 83L119 85 118 100 80 99Z', 'M124 85L169 81 167 98 127 101Z',
];
let endingSerial=0;
export function EndCinematic({ reason,reduced=false }: { reason: Ending;reduced?:boolean }) {
  const [skipped,setSkipped]=useState(false);
  const host=useRef<HTMLDivElement>(null);
  const group=useRef(`ending/${++endingSerial}`);
  useLayoutEffect(()=>{
    const element=host.current,root=element?.parentElement;if(!root||!element)return;
    const reduce=reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line=endingTimeline(reason),emitted=new Set<number>();
    const animations=root.getAnimations({subtree:true}).flatMap(animation=>{
      const end=Number(animation.effect?.getComputedTiming().endTime);
      if(!Number.isFinite(end)||end<=0)return [];
      animation.pause();animation.currentTime=skipped||reduce?end:0;return [{animation,end}];
    });
    const apply=(progress:number)=>{
      element.style.setProperty('--ending-progress',String(progress));
      const crossed=consumeCues(line.cues,emitted,progress);
      element.dataset.stage=progress>=.95?'settle':progress>=line.cues.find(c=>c.kind==='climax')!.at?'climax':progress>=.22?'seal':'gather';
      const seals=line.cues.filter(c=>c.kind==='seal'&&c.at<=progress).length;
      element.dataset.seals=String(seals);
      for(const {cue,index}of crossed){
        const late=(progress-cue.at)*line.duration;
        if(!skipped&&!reduce&&late<160&&!document.hidden)sound.play(`end-${reason}-${cue.kind}`,{key:`${group.current}/${index}`,group:group.current,index:cue.index});
      }
      for(const a of animations){
        const target=(a.animation.effect as KeyframeEffect).target as Element|null;
        let begin=0,finish=1;
        if(target?.closest('.broken-crown')||target?.closest('.royal-shockwave')){begin=.6;finish=.97;}
        else if(target?.closest('.royal-runes')){begin=.32;finish=.9;}
        else if(target?.closest('.guard-oath')){const i=Number((target.closest('.guard-oath') as HTMLElement).style.getPropertyValue('--i'));begin=.22+i*.18;finish=begin+.16;}
        else if(target?.closest('.collapsing-array')||target?.closest('.silver-shatter')){begin=.78;finish=1;}
        else if(target?.closest('.sacrifice-mark')){begin=.26;finish=.45;}
        else if(target?.closest('.great-seal')||target?.closest('.sacrifice-flare')){begin=.6;finish=1;}
        else if(target?.closest('.rite-crown')){begin=.7;finish=.96;}
        else if(target?.closest('.rite-defense-wave')||target?.closest('.rite-survival')){begin=.32;finish=.7;}
        const local=Math.max(0,Math.min(1,(progress-begin)/(finish-begin)));
        a.animation.currentTime=skipped||reduce?a.end:local*a.end;
      }
    };
    if(skipped||reduce){apply(1);sound.stopGroup(group.current);return;}
    const start=performance.now();let frame=0;
    const tick=()=>{const progress=Math.min(1,(performance.now()-start)/line.duration);apply(progress);if(progress<1)frame=requestAnimationFrame(tick);};
    apply(0);frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);sound.stopGroup(group.current);};
  },[reason,skipped,reduced]);
  const isKing=reason==='king'||reason==='resign',isGuard=reason==='guard',isMartyr=reason==='martyr',isRitual=reason==='ritual';
  return <div ref={host} className={`end-cinematic ${skipped?'cinematic-skipped':''} ${reduced?'cinematic-reduced':''}`} data-cinematic={reason}>
    {reason==='resign'?<div className="resignation-stage"><svg viewBox="0 0 240 160" aria-label="认输，王旗垂落"><path d="M80 25v120M82 30l80 16-12 64-68-19Z"/><path d="m92 48 45 12-8 28-37-9Z"/></svg><span className="cinematic-caption">王旗垂落 · 王庭谢幕</span></div>:isKing ? <div className="regicide-stage"><div className="royal-shockwave"/><div className="royal-shockwave second"/><svg viewBox="0 0 250 150" className="broken-crown" aria-label="破碎的王冠"><defs><linearGradient id="crown-gold" x2=".8" y2="1"><stop stopColor="#f3dfac"/><stop offset=".5" stopColor="#af8544"/><stop offset="1" stopColor="#6e4c29"/></linearGradient></defs>{shards.map((d,i)=><path key={i} d={d} fill="url(#crown-gold)" stroke="#e1c086" strokeWidth=".7" style={{'--dx':`${(i%3-1)*20}px`,'--dy':`${i<4?-10:17}px`,'--dr':`${(i%2?1:-1)*(6+i)}deg`,'--delay':`${.2+i*.04}s`} as React.CSSProperties}/>)}<path d="M109 107l-15 17m38-17 6 22m23-26 19 12" stroke="#c8a362" strokeWidth=".6"/></svg><svg className="royal-runes" viewBox="0 0 360 100" aria-hidden="true"><ellipse cx="180" cy="50" rx="145" ry="29"/><ellipse cx="180" cy="50" rx="125" ry="23"/>{Array.from({length:16},(_,i)=><path key={i} transform={`translate(${180+Math.sin(i*Math.PI/8)*136},${50+Math.cos(i*Math.PI/8)*25}) rotate(${i*22.5})`} d="M-3-5 1 1-3 5M1 1 5-2"/>)}</svg><span className="cinematic-caption">王座失辉 · 王冠破碎</span></div> : isGuard ? <div className="guard-stage"><svg className="collapsing-array" viewBox="0 0 350 220" aria-hidden="true"><circle cx="175" cy="115" r="87"/><circle cx="175" cy="115" r="95"/><path d="m175 20 82 143H93ZM80 95l89 20-30 30 35 65m86-105-74 10 13 37-24 58"/></svg><div className="three-guards">{[0,1,2].map(i=><div className="guard-oath" key={i} style={{'--i':i} as React.CSSProperties}><svg viewBox="0 0 70 120" aria-label={`第${i+1}道守护符文熄灭`}><path d="M35 8 17 31l5 37 13 12 13-12 5-37Z" className="oath-shield"/><path d="M35 18v80m-12-19h24M35 94l-4 12 4 6 4-6Z"/><path d="M20 29h30M24 39l6 4m16-4-6 4"/></svg><span>◆</span></div>)}</div><div className="silver-shatter">{Array.from({length:18},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}</div><span className="cinematic-caption">誓言逐一熄灭 · 守护法阵崩塌</span></div> : isMartyr ? <div className="sacrifice-stage"><div className="sacrifice-flare"/><svg className="great-seal" viewBox="0 0 320 320" aria-label="三道献祭印同时点亮的紫金法阵"><circle cx="160" cy="160" r="119"/><circle cx="160" cy="160" r="128"/><circle cx="160" cy="160" r="97"/><path d="m160 55 91 158H69ZM160 265 69 107h182Z" className="seal-star"/><circle cx="160" cy="160" r="39"/><path d="m160 134 17 26-17 26-17-26ZM134 160h52"/>{Array.from({length:24},(_,i)=><path key={i} transform={`translate(${160+Math.sin(i*Math.PI/12)*110},${160+Math.cos(i*Math.PI/12)*110}) rotate(${-i*15})`} d="M-3-6 3-3-2 2 3 6M-2 2-5 5"/>)}</svg><div className="three-sacrifices">{[0,1,2].map(i=><div key={i} className="sacrifice-mark" style={{'--i':i} as React.CSSProperties}><svg viewBox="0 0 50 50" aria-label="献祭印点亮"><circle cx="25" cy="25" r="20"/><path d="m25 10 13 23H12ZM25 38 12 17h26ZM25 19v12m-6-6h12"/></svg></div>)}</div><span className="cinematic-caption">三印归一 · 命运逆转</span></div> : isRitual?<div className="ritual-throne-stage"><svg className="ritual-throne" viewBox="0 0 320 240" aria-label="王守住九格祭台，祭典完成"><circle cx="160" cy="126" r="96"/><circle cx="160" cy="126" r="106"/>{Array.from({length:9},(_,i)=><rect key={i} x={98+i%3*42} y={64+Math.floor(i/3)*42} width="38" height="38"/>)}<path className="rite-crown" d="m119 112 8-35 23 21 10-34 13 34 23-21 7 35Zm7 9h70v12h-70Z"/><path className="rite-survival" d="M160 38v-18m0 210v-18M72 126H48m224 0h-24"/></svg><div className="rite-defense-wave"/><span className="cinematic-caption">九格祭台 · 王权归位 · 守过回应</span></div> : <div className="draw-stage"><div/><div/><span>◇</span><small>万籁归寂</small></div>}
    <svg className={`ending-milestones milestone-${reason}`} viewBox="0 0 360 260" aria-hidden="true">
      {reason==='king'?<><path className="fate-chain" d="M20 128h95l25-48 40 91 40-91 25 48h95"/><path className="fate-fracture" d="m180 40-14 65 22 22-30 30 15 64"/></>:reason==='guard'?<>{[0,1,2].map(i=><path key={i} className={`fallen-link link-${i}`} d={`M${65+i*95} 60v130m-25-80h50m-45 60 20 20 20-20`}/>)}</>:reason==='martyr'?<>{[0,1,2].map(i=><path key={i} className="offering-ray" transform={`rotate(${i*120} 180 130)`} d="M180 22v74m-7-8 7 12 7-12"/>)}<circle className="fate-convergence" cx="180" cy="130" r="24"/></>:reason==='ritual'?<><path className="rite-answer" d="M30 130h70m160 0h70M100 95v70m160-70v70"/><rect className="rite-held" x="112" y="62" width="136" height="136" rx="3"/></>:null}
    </svg>
    {(isKing||isGuard||isMartyr||isRitual)&&<button className="cinematic-skip" onClick={()=>setSkipped(true)} disabled={skipped}>{skipped?'演出已跳过':'跳过结算演出'}</button>}
  </div>;
}
