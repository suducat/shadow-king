import {ArrowLeft, ArrowRight, BookOpen, Check, Swords, Users} from 'lucide-react';
import type {GameMode} from './ritual';
import still from './hall-placeholder.webp?inline';

const plates = import.meta.env.BASE_URL + 'night/';

function Stage({ritual = false}: {ritual?: boolean}) {
  return <div className="night-stage" aria-hidden="true" style={{backgroundImage:`url(${still})`}}>
    <img className="stage-plate" src={plates + (ritual ? 'unlit.webp' : 'hall.webp')} alt="" fetchPriority="high"/>
    {ritual && <img className="stage-plate stage-ignition" src={plates+'altar.webp'} alt=""/>}
    <i className="hall-mist"/><i className="hall-dust"/>
  </div>;
}

export function Hall({start,rules}:{start:()=>void;rules:()=>void}) {
  return <main className="night-lobby">
    <Stage/>
    <div className="hall-copy hero-copy">
      <h1>暗王</h1><div lang="en" className="hall-english">Shadow King</div>
      <p>藏起王冠，改写命运。</p>
      <button className="primary" onClick={start}>开启棋局<ArrowRight size={18}/></button>
      <button className="hall-rules" onClick={rules}><BookOpen size={16}/>快速玩法</button>
    </div>
  </main>;
}

export function RuleSelection({rule,choose,back,local,ai}:{
  rule:GameMode; choose:(mode:GameMode)=>void; back:()=>void; local:()=>void; ai:()=>void;
}) {
  return <main className="night-select">
    <div className="hall-controls">
      <button className="hall-back" onClick={back}><ArrowLeft size={16}/>返回主菜单</button>
      <h1>选择棋局</h1>
      <fieldset><legend>规则</legend><div className="rule-pair">
        {(['classic','ritual'] as const).map(id=><button key={id} aria-pressed={rule===id} onClick={()=>choose(id)}>
          {id==='classic'?'经典模式':'祭典模式'}<Check size={15}/>
        </button>)}
      </div></fieldset>
      <fieldset><legend>对战方式</legend>
        <button className="hall-entry" onClick={local}><Users/>本地双人<ArrowRight/></button>
        <button className="hall-entry" onClick={ai}><Swords/>人机对战<ArrowRight/></button>
      </fieldset>
    </div>
    <figure className="hall-study">
      <Stage ritual={rule==='ritual'}/>
      <figcaption aria-live="polite">{rule==='classic'?'己方三名死士全部被吃，立即获胜。':'三死士全灭开启祭台，王须占领并守过对手一次完整回应。'}</figcaption>
    </figure>
  </main>;
}
