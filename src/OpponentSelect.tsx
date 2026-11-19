import {ArrowLeft,Check,Crown,Shield,Sparkles,Swords,Eye} from 'lucide-react';
import {DIFFICULTIES,OMNISCIENT_NOTICE,type Difficulty} from './ai';
import type {GameMode} from './ritual';
const portraits={easy:Shield,normal:Swords,hard:Sparkles,master:Crown,omniscient:Eye};
const copy:Record<Exclude<Difficulty,'omniscient'>,string>={easy:'行动较直接，适合第一次熟悉移动、吃子与献祭。',normal:'兼顾进攻与防守，适合已经了解胜利条件的玩家。',hard:'会考虑后续回应与祭台争夺，适合希望多一些变化的玩家。',master:'投入更多本地计算，权衡多步行动与风险，适合愿意耐心思考的玩家。'};
export function OpponentSelect({difficulty,rule,select,back,start}:{difficulty:Difficulty;rule:GameMode;select:(d:Difficulty)=>void;back:()=>void;start:()=>void}){
 const d=DIFFICULTIES[difficulty],omniscient=difficulty==='omniscient';
 return <main className="night-select opponents">
  <div className="hall-controls"><button className="hall-back" onClick={back}><ArrowLeft size={16}/>返回模式选择</button>
   <h1>选择对手</h1>
   <div className="hall-list">{(Object.keys(DIFFICULTIES) as Difficulty[]).map(id=>{
     const entry=DIFFICULTIES[id],Icon=portraits[id];
     return <button className="difficulty-card hall-rank" key={id} aria-pressed={difficulty===id} onClick={()=>select(id)}>
       <Icon size={18}/><strong>{entry.name}</strong><span>{entry.title}</span><small>{id==='omniscient'?'全身份透视':entry.label}</small><Check size={15}/>
     </button>;
   })}</div>
  </div>
  <section className="hall-opponent" aria-live="polite">
   <img src={import.meta.env.BASE_URL+'night/'+difficulty+'.webp'} alt=""/>
   <div className="opponent-copy"><small>{rule==='classic'?'经典规则':'祭典规则'}　／　{d.label}</small>
    <h2>{d.name}</h2><p>{omniscient?'帷幕之外':copy[difficulty]}</p>
    {omniscient&&<div id="omniscient-disclosure" className="challenge-disclosure"><Eye size={16}/>{OMNISCIENT_NOTICE}</div>}
    <button className="primary" onClick={start} aria-describedby={omniscient?'omniscient-disclosure':undefined}>{omniscient?'开始全知挑战':'开始布阵'} <Swords size={16}/></button>
   </div>
  </section>
 </main>;
}
