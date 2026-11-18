import {ArrowLeft,ArrowRight,Check,Crown,Shield,Sparkles,Swords,Eye,Orbit} from 'lucide-react';
import {DIFFICULTIES,OMNISCIENT_NOTICE,type Difficulty} from './ai';
import type {GameMode} from './ritual';
const portraits={easy:Shield,normal:Swords,hard:Sparkles,master:Crown,omniscient:Eye};
const audience:Record<Difficulty,string>={easy:'适合初次执棋，熟悉移动与三种胜法。',normal:'适合已熟悉规则，想练习攻防转换的玩家。',hard:'适合喜欢推测身份、布置献祭诱饵的玩家。',master:'适合愿意推演多步风险的熟手。',omniscient:'适合已掌握隐藏身份博弈，想挑战信息劣势的玩家。'};
export function OpponentSelect({difficulty,rule,select,back,start}:{difficulty:Difficulty;rule:GameMode;select:(d:Difficulty)=>void;back:()=>void;start:()=>void}){
 const levels=Object.keys(DIFFICULTIES) as Difficulty[],d=DIFFICULTIES[difficulty],Icon=portraits[difficulty],omniscient=difficulty==='omniscient';
 return <main className="court-selection opponent-court">
  <div className="court-options"><button className="court-back" onClick={back}><ArrowLeft size={16}/>返回模式选择</button><h1>选择对手</h1>
   <div className="rank-list">{levels.map(level=>{const entry=DIFFICULTIES[level],Badge=portraits[level];return <button className="rank-choice difficulty-card" key={level} onClick={()=>select(level)} aria-pressed={level===difficulty}>
    <Badge size={21}/><span><strong>{entry.name}</strong><small>{entry.title}</small></span><em>{level==='omniscient'?'全身份透视':entry.label}</em><Check className="choice-check" size={16}/>
   </button>;})}</div>
  </div>
  <section className={'opponent-exhibit tier-'+difficulty} aria-live="polite">
   <div className="exhibit-crest" aria-hidden="true"><div className="crest-rim"/><Icon/>{omniscient&&<Orbit className="crest-orbit"/>}</div>
   <div className="exhibit-copy"><small>{rule==='classic'?'经典规则':'祭典规则'}　／　{d.label}</small><h2>{d.name}</h2><p className="opponent-title">{d.title}</p>
    <p>{audience[difficulty]}</p>
    {omniscient&&<div id="omniscient-disclosure" className="challenge-disclosure" role="note"><strong><Eye size={17}/>全身份透视</strong><p>{OMNISCIENT_NOTICE}</p></div>}
    <button className="primary" aria-describedby={omniscient?'omniscient-disclosure':undefined} onClick={start}>{omniscient?'开始全知挑战':'开始布阵'}<ArrowRight size={17}/></button>
   </div>
  </section>
 </main>;
}
