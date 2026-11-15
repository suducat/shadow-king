import {useEffect,useRef,type RefObject} from 'react';
import {Crown,ShieldCheck,Swords,Sparkles,X} from 'lucide-react';
import type {BoardScene} from './scene';
import type {Game,VisiblePiece} from './game';
import {executionPath,type GameAction} from './ritual';
type Props={scene:RefObject<BoardScene|null>;game:Game;pieces:VisiblePiece[];selected?:VisiblePiece;legal:{x:number;y:number}[];chargeIntent:boolean;canAct:boolean;charge:()=>void;cancel:()=>void;execute:(a:GameAction)=>void};
export function executionReason(game:Game,p:VisiblePiece){
 if(p.executionUsed)return '本影卫的斩杀已使用，仍可普通移动。';
 if(!p.charging)return '请先蓄力，下一次己方回合才可斩杀。';
 if(game.turn!==p.side||p.charging.readyPly>game.ply)return '等待下一次己方行动回合。';
 if(!executionPath({pieces:game.pieces},p.id).length)return '前方有友军阻挡或已到边界，整段斩杀无法执行。';
 return '';
}
export function BoardHUD({scene,game,pieces,selected,legal,chargeIntent,canAct,charge,cancel,execute}:Props){
 const panel=useRef<HTMLDivElement>(null),labels=useRef(new Map<string,HTMLDivElement>());
 const guard=canAct&&selected?.role==='guard'?selected:undefined;
 const reason=guard?executionReason(game,guard):'',path=guard?executionPath({pieces:game.pieces},guard.id):[];
 const badges=pieces.filter(p=>p.charging||(p.role==='king'&&p.revealed&&game.ritual?.[p.side].phase!=='dormant'));
 useEffect(()=>{
  let frame=0;const tick=()=>{
   const board=scene.current;
   if(board){
    for(const p of badges){const el=labels.current.get(p.id);if(!el)continue;const at=board.projectActor(p.id,1.55);if(at){el.style.left=`${Math.min(innerWidth-75,Math.max(75,at.x))}px`;el.style.top=`${at.y}px`;}}
    if(panel.current&&guard){
     const at=board.projectActor(guard.id,1),el=panel.current;if(at){const w=el.offsetWidth,h=el.offsetHeight,minY=94,maxY=Math.max(minY,innerHeight-h-12);
      const candidates=[{x:at.x-w/2,y:at.y-h-45},{x:at.x+48,y:at.y-h/2},{x:at.x-w-48,y:at.y-h/2},{x:at.x-w/2,y:at.y+55}];
      const obstacles=legal.map(p=>{const corners=[board.projectCell(p.x-.45,p.y-.45),board.projectCell(p.x+.45,p.y+.45),board.projectCell(p.x-.45,p.y+.45),board.projectCell(p.x+.45,p.y-.45),board.projectCell(p.x,p.y,1.45)];return{left:Math.min(...corners.map(q=>q.x))-8,right:Math.max(...corners.map(q=>q.x))+8,top:Math.min(...corners.map(q=>q.y))-8,bottom:Math.max(...corners.map(q=>q.y))+8};});
      if(obstacles.length){const left=Math.min(...obstacles.map(p=>p.left)),right=Math.max(...obstacles.map(p=>p.right)),top=Math.min(...obstacles.map(p=>p.top)),bottom=Math.max(...obstacles.map(p=>p.bottom));candidates.push({x:left-w-12,y:at.y-h/2},{x:right+12,y:at.y-h/2},{x:at.x-w/2,y:top-h-12},{x:at.x-w/2,y:bottom+12});}
      const scored=candidates.map(c=>{const x=Math.max(10,Math.min(innerWidth-w-10,c.x)),y=Math.max(minY,Math.min(maxY,c.y));const overlap=obstacles.filter(p=>p.right>x&&p.left<x+w&&p.bottom>y&&p.top<y+h).length;return{x,y,score:overlap*10000+Math.abs(x+w/2-at.x)+Math.abs(y+h/2-at.y)+Math.abs(x-c.x)+Math.abs(y-c.y)};}).sort((a,b)=>a.score-b.score);
      el.style.left=`${scored[0].x}px`;el.style.top=`${scored[0].y}px`;
     }
    }
   }
   frame=requestAnimationFrame(tick);
  };tick();return()=>cancelAnimationFrame(frame);
 },[scene,guard?.id,legal,chargeIntent,badges]);
 return <div className="board-hud" aria-label="祭典棋盘状态">
  {badges.map(p=>{const king=p.role==='king',ready=!!p.charging&&game.turn===p.side&&p.charging.readyPly<=game.ply;return <div key={p.id} ref={el=>{if(el)labels.current.set(p.id,el);else labels.current.delete(p.id);}} className={`piece-status ${king?'royal-rite':ready?'skill-ready':'skill-charged'}`} data-piece-id={p.id}>{king?<Crown size={12}/>:<ShieldCheck size={12}/>}<span>{king?(game.ritual?.[p.side].phase==='occupied'?'祭台占领中':'祭典王印'):ready?'斩杀就绪':'蓄力完成'}</span></div>;})}
  {guard&&<div ref={panel} className={`skill-context guard-controls ${guard.charging?'ready':''}`} role="group" aria-label="影卫技能" data-piece-id={guard.id}>
   <div className="skill-title"><span><Swords size={15}/>影卫 · 秘剑</span><button aria-label="关闭技能面板" onClick={cancel}><X size={16}/></button></div>
   {guard.executionUsed?<p className="skill-spent"><ShieldCheck size={15}/>斩杀已使用<span>仍可普通移动与吃子</span></p>:chargeIntent?<><p className="charge-instruction">正在蓄力 · 选择亮起格子移动，或原地完成本次行动。</p><button className="skill-button" onClick={()=>execute({id:guard.id,x:guard.x,y:guard.y,kind:'charge'})}><Sparkles size={17}/>原地完成蓄力</button><button className="skill-cancel" onClick={cancel}>取消蓄力选择</button></>:guard.charging?<><p className="skill-state">斩杀就绪 · 本影卫剩余 1 次</p><button className="skill-button execute-skill" aria-label="斩杀" disabled={!!reason} aria-describedby="skill-reason" onClick={()=>{const to=path.at(-1);if(to)execute({id:guard.id,x:to.x,y:to.y,kind:'execute'});}}><Swords size={18}/>斩杀{!reason&&<small>向前 {path.length} 格</small>}</button><p id="skill-reason">{reason||'固定向前两格；仅边界不足时前进一格。普通行动将放弃蓄力。'}</p></>:<><button className="skill-button" aria-label="蓄力" onClick={charge}><Sparkles size={18}/>蓄力<small>剩余 1 次</small></button><p>本回合移动或原地蓄力，身份永久公开；下一己方回合斩杀。</p></>}
  </div>}
 </div>;
}
