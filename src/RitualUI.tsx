import type {Game} from './game';
const phaseName={dormant:'尚未开启',open:'祭典已开启',occupied:'祭台占领中 · 等待回应',completed:'祭典完成'};
export function RitualStatus({game}:{game:Game}){
 if(game.mode!=='ritual')return null;
 return <div className="ritual-status" aria-live="polite">{(['red','blue'] as const).map(side=>{const phase=game.ritual?.[side].phase??'dormant';return <div key={side} className={`${side} rite-${phase}`}><b>{side==='red'?'红方':'蓝方'} · {phaseName[phase]}</b>{phase!=='dormant'&&<span className="rite-embers" aria-label="三道死士符文点亮">{[0,1,2].map(i=><i key={i} style={{animationDelay:`${i*.18}s`}}>◇</i>)}</span>}<small>{phase==='open'?`${side==='red'?'红方':'蓝方'}王已公开，须在己方行动结束时占领祭台。`:phase==='occupied'?`${side==='red'?'蓝方':'红方'}拥有一次完整回应；${side==='red'?'红方':'蓝方'}王若守住祭台，回应结束即获胜。`:'三死士全灭只开启祭典，不立即获胜。'}</small></div>;})}</div>;
}
export function RitualGuide(){return <div className="ritual-guide"><h3>祭典模式 · 修订规则</h3><p>三死士全灭 → 王永久公开 → 在己方行动结束时占领中央 3×3 祭台 → 对手完整回应一次 → 王仍存活于祭台，则立即获胜，无需再走一步。触发瞬间王已在祭台，也必须先完成己方下一次合法行动。</p><p>每名影卫各有一次斩杀。蓄力可原地或普通移动一格，并永久公开身份。下一己方回合只能沿阵营前进方向斩杀两格（仅边界不足时一格）：红方向上、蓝方向下；旋转视角不改变方向。</p><p>前方任一格有友军则整招不可释放，不能主动缩短；只有棋盘边界不足两格时允许一格。成功释放即消耗次数，即使没有吃子。放弃蓄力只清除状态，不消耗次数；已使用过的影卫不能再次蓄力，但可正常移动和吃子。</p><p>路径逐格吃子；弑王或肃清立即终局，余下路径不再执行。最后死士被斩杀仅开启对方祭典。肃清仍须吃掉敌方全部三名影卫。</p></div>;}

export function QuickRules({mode}:{mode:'classic'|'ritual'}){
 return <section className="rules-quick" aria-labelledby="quick-rules-title">
  <h3 id="quick-rules-title">快速了解规则</h3>
  <ol>
   <li><strong>先认自己的棋。</strong> 每方有 1 个王、3 个影卫、3 个死士。对手的棋通常盖着，吃掉后才揭晓身份。</li>
   <li><strong>每回合走一枚。</strong> 红方先走。普通移动只能向上、下、左、右走一格。走进对手所在的格子就是吃子，可以选择不吃。</li>
   <li><strong>两种通用赢法。</strong> 吃掉对方的王，或吃光对方的 3 个影卫，马上获胜。</li>
  </ol>
  {mode==='classic'?<p><strong>经典模式</strong>　你的 3 个死士都被对手吃掉，你立刻获胜。所以遇到送上门的暗棋，先想想要不要吃。</p>:
   <p><strong>祭典模式</strong>　你的 3 个死士都被吃掉时，你的王亮明身份。在己方行动后让王占住中央九格，撑过对方一回合才赢。影卫也能先蓄力，亮明身份，下一次己方行动可向前斩杀；每枚影卫整局只能斩杀一次。</p>}
 </section>;
}
