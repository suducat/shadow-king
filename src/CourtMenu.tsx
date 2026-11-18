import {ArrowLeft,ArrowRight,BookOpen,Check,ChevronRight,Crown,Eye,Sparkles,Swords,Users} from 'lucide-react';
import type {GameMode} from './ritual';

const courtArt=import.meta.env.BASE_URL+'court/';
export function CourtHome({start,rules}:{start:()=>void;rules:()=>void}){
 return <main className="court-home hero-copy">
  <img className="home-art" src={courtArt+'court.webp'} alt="" fetchPriority="high"/>
  <div className="home-shade"/>
  <div className="home-copy"><h1>暗王</h1><div className="home-english" lang="en">Shadow King</div>
   <p>藏起王冠，改写命运。</p>
   <div className="home-actions"><button className="primary" onClick={start}>开启棋局 <ArrowRight size={19}/></button>
    <button className="court-link" onClick={rules}><BookOpen size={17}/>快速玩法</button></div>
  </div>
 </main>;
}
export function RuleCourt({rule,choose,back,local,ai}:{rule:GameMode;choose:(r:GameMode)=>void;back:()=>void;local:()=>void;ai:()=>void}){
 const ritual=rule==='ritual';
 return <main className="court-selection">
  <div className="court-options"><button className="court-back" onClick={back}><ArrowLeft size={16}/>返回主菜单</button>
   <h1>选择棋局</h1>
   <fieldset><legend>对弈规则</legend><div className="court-tabs">{(['classic','ritual'] as const).map(mode=>{
    const Icon=mode==='classic'?Crown:Sparkles;
    return <button key={mode} aria-pressed={rule===mode} onClick={()=>choose(mode)}><Icon size={18}/>{mode==='classic'?'经典模式':'祭典模式'}<Check className="choice-check" size={15}/></button>;
   })}</div></fieldset>
   <fieldset><legend>对战方式</legend>
    <button className="court-match" onClick={local}><Users/><span><strong>本地双人</strong><small>共用一台设备，轮流秘密执棋</small></span><ChevronRight/></button>
    <button className="court-match" onClick={ai}><Swords/><span><strong>人机对战</strong><small>执红入局，选择你的王庭对手</small></span><ChevronRight/></button>
   </fieldset>
  </div>
  <figure className={'rule-court '+(ritual?'rite-court':'classic-court')} aria-live="polite">
   <img src={courtArt+'court.webp'} className="court-image classic-art" alt=""/>
   <img src={courtArt+'altar.webp'} className="court-image rite-art" alt=""/>
   <div className="plate-rail" aria-hidden="true"/>
   <figcaption>{ritual?<div className="rite-embers preview-embers" aria-hidden="true">{[0,1,2].map(i=><i key={i} style={{animationDelay:i*.32+'s'}}>◇</i>)}</div>:<Eye className="veil-mark" size={24} aria-hidden="true"/>}
    <h2>{ritual?'终焉祭台':'帷下王庭'}</h2>
    <p>{ritual?'三死士全灭点亮祭台，王须占领并守过对手一次回应。':'己方三名死士全部被吃，立即获胜。'}</p>
   </figcaption>
  </figure>
 </main>;
}
