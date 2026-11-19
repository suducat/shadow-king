import {other,type Game,type Piece,type Side} from './game';
import {executionPath,forward,inAltar,type GameAction} from './ritual';
import type {Observation} from './ai';
export const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const altarDistance=(p:{x:number;y:number})=>Math.max(0,2-p.x,p.x-4)+Math.max(0,2-p.y,p.y-4);
const cells=Array.from({length:9},(_,i)=>({x:2+i%3,y:2+Math.floor(i/3)}));
export function attacks(g:Game,side:Side):Map<string,number>{
 const map=new Map<string,number>();const add=(x:number,y:number)=>{if(x>=0&&x<7&&y>=0&&y<7&&!g.pieces.some(p=>p.side===side&&p.x===x&&p.y===y))map.set(`${x}/${y}`,(map.get(`${x}/${y}`)??0)+1);};
 for(const p of g.pieces.filter(p=>p.side===side)){for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])add(p.x+dx,p.y+dy);if(p.charging&&p.charging.readyPly<=g.ply+(g.turn===side?0:1))for(const at of executionPath(g,p.id))add(at.x,at.y);}return map;
}
export function chargeMeaning(g:Game,p:Piece,publicOnly=false):number{
 if(!p.charging)return 0;const path=executionPath(g,p.id);if(!path.length)return -130;
 const targets=path.flatMap(t=>g.pieces.filter(q=>q.side!==p.side&&q.x===t.x&&q.y===t.y));
 const foeKing=g.pieces.find(q=>q.side!==p.side&&q.role==='king'&&(!publicOnly||q.revealed)),threat=targets.reduce((v,q)=>v+(publicOnly&&!q.revealed?35:q.role==='king'?150:q.role==='guard'?65:10),0);
 const rite=g.ritual?.[other(p.side)],urgency=rite?.phase==='open'||rite?.phase==='occupied';
 const entrance=foeKing?path.filter(t=>inAltar(t)&&distance(t,foeKing)<=2).length:0;
 const nearby=g.pieces.filter(q=>q.side!==p.side).reduce((n,q)=>Math.min(n,...path.map(t=>distance(t,q))),8);
 return -85+threat+(urgency?entrance*80:entrance*8)+Math.max(0,3-nearby)*12;
}
export function evaluateStrategy(g:Game,side:Side,style=0):number{
 if(g.result)return g.result.winner===null?0:g.result.winner===side?100000:-100000;
 const maps={red:attacks(g,'red'),blue:attacks(g,'blue')};
 const court=(s:Side)=>{
  const own=g.pieces.filter(p=>p.side===s),foe=g.pieces.filter(p=>p.side!==s),king=own.find(p=>p.role==='king'),guards=own.filter(p=>p.role==='guard').length,martyrs=own.filter(p=>p.role==='martyr').length;
  if(!king)return -100000;const enemy=other(s),threat=(p:{x:number;y:number})=>maps[enemy].get(`${p.x}/${p.y}`)??0,ownRite=g.ritual?.[s],enemyRite=g.ritual?.[enemy];
  const enemyMartyrs=foe.filter(p=>p.role==='martyr').length,enemyKing=foe.find(p=>p.role==='king'),enemyGuards=foe.filter(p=>p.role==='guard');
  let value=guards*260+(guards===1?200:0),control=0;
  for(const cell of cells){const key=`${cell.x}/${cell.y}`,ours=maps[s].get(key)??0,theirs=maps[enemy].get(key)??0,occupied=own.some(p=>p.x===cell.x&&p.y===cell.y);
   const relevant=enemyKing?1+Math.max(0,3-distance(enemyKing,cell))*.35:1;control+=(Math.min(ours,2)*1.2-Math.min(theirs,2)*.5+(occupied?.7:0))*relevant;
  }
  const urgency=g.mode!=='ritual'?12:enemyRite?.phase==='occupied'?65:enemyRite?.phase==='open'?50:enemyMartyrs<=1?38:enemyMartyrs===2?12:10;
  value+=control*urgency*(style===2?1.1:1);
  const kDanger=threat(king);value-=kDanger*(g.turn===s?900:19000);
  value+=(6-altarDistance(king))*(!g.mode?5:ownRite?.phase!=='dormant'?55:6)+own.filter(p=>p!==king&&distance(p,king)===1).length*7;
  if(g.mode==='ritual'){
   value+=(3-martyrs)*(65+(6-altarDistance(king))*9);
   if(ownRite?.phase==='open'||ownRite?.phase==='occupied'){
    const entries=cells.filter(c=>!foe.some(p=>p.x===c.x&&p.y===c.y)&&!threat(c));const route=Math.min(9,...entries.map(c=>distance(king,c)));
    value+=180+(8-route)*95+(ownRite.phase==='occupied'?4200:0)-kDanger*300;
   }
  }else value+=(3-martyrs)*190;
  for(const p of own){const d=threat(p),center=6-Math.abs(p.x-3)-Math.abs(p.y-3),near=Math.min(8,...foe.map(q=>distance(p,q)));
   if(p.role!=='king'){
    // Reward a screen that can contest several squares and be reinforced.
    // A lone guard deep behind enemy lines receives no formation bonus.
    const advance=s==='red'?6-p.y:p.y;
    const partner=own.some(q=>q.role!=='king'&&q.role!==p.role&&distance(p,q)<=2);
    const front=Math.min(3,advance)*(1-Math.abs(p.x-3)*.14);
    value+=front*(p.role==='martyr'?27:partner?23:9)+(partner&&advance>=2?18:0);
    // A martyr parked in the middle is easy to ignore. Beyond the
    // middle, reward closing on the crown or the last guard, especially
    // when the martyr threatens both and taking it advances our sacrifice.
    if(enemyKing){
     const crownDistance=distance(p,enemyKing);
     const guardDistance=enemyGuards.length===1?distance(p,enemyGuards[0]):12;
     const targetDistance=Math.min(crownDistance,guardDistance);
     const pressure=Math.max(0,6-targetDistance);
     value+=pressure*(p.role==='martyr'?34:partner?26:12);
     if(crownDistance<=2&&guardDistance<=2)value+=55;
    }
   }
   if(p.role==='guard'){value+=center*(style===1?8:7)-d*(guards===1?(g.turn===s?750:18000):160)+(p.executionUsed?0:35)-(p.revealed?(style===3?26:18):0)+chargeMeaning(g,p);}
   if(p.role==='martyr'){
    // Martyrs retain board-control and shielding value; exposure is useful
    // only when sacrifice can actually be converted, not an unconditional rush.
    const prepared=!g.mode||altarDistance(king)<=2&&control>=0;
    value+=center*8+own.filter(q=>q.role!=='martyr'&&distance(q,p)===1).length*(style===3?12:9)+d*(prepared?(martyrs===1?320:35):-25)+(7-near)*(prepared?3:0);
   }
  }
  return value;
 };return court(side)-court(other(side));
}
// Move ordering sees only that mover's identities and publicly revealed targets.
// Never order an enemy's capture using our still-hidden true role in a sample.
export function actionOrder(g:Game,a:GameAction):number{
 const p=g.pieces.find(p=>p.id===a.id)!,victim=g.pieces.find(p=>p.x===a.x&&p.y===a.y&&p.side!==g.turn);
 let score=victim?(victim.revealed?(victim.role==='king'?10000:victim.role==='guard'?250:10):140):0;
 if(a.kind==='charge'){const hypothetical={...p,x:a.x,y:a.y,charging:{readyPly:g.ply+2}},state={...g,pieces:g.pieces.map(q=>q.id===p.id?hypothetical:q)};score+=chargeMeaning(state,hypothetical,true)-35;}
 if(a.kind==='execute')score+=executionPath(g,p.id).filter(t=>t.victimId).length*130-45;
 score+=(6-Math.abs(a.x-3)-Math.abs(a.y-3))*4;
 if(p.role==='king'&&g.ritual&&g.ritual[p.side].phase!=='dormant')score+=(altarDistance(p)-altarDistance(a))*130;
 return score;
}
export function habitCost(o:Observation,a:GameAction):number{
 const history=o.history.slice(-18),p=o.pieces.find(p=>p.id===a.id)!;
 const repeat=history.filter(h=>h.id===a.id&&h.to.x===a.x&&h.to.y===a.y&&(h.kind??'move')===(a.kind??'move')).length;
 const last=history.filter(h=>h.side===o.side).slice(-5),own=o.pieces.filter(p=>p.side===o.side),sameRole=last.filter(h=>own.find(p=>p.id===h.id)?.role===p.role).length;
 return repeat*85+(a.kind==='charge'?history.filter(h=>h.id===a.id&&h.kind==='charge').length*65:0)+(sameRole>=4?14:0);
}
