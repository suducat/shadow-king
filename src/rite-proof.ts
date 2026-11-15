import {act,allActions,other,type Game,type Side} from './game';
import {resolveRitual,inAltar,type GameAction} from './ritual';
// Work only on a lawful belief world. Never accept the real hidden game here.
// After an opponent enters the altar, captures are the only way to interrupt
// occupation or win first. Enumerate these replies with the canonical kernel.
export function forcedRiteLoss(g:Game,defender:Side,expired:()=>boolean=()=>false):{loss:boolean;checks:number;complete:boolean}{
 const foe=other(defender),rite=g.ritual?.[foe];let checks=0;
 if(g.mode!=='ritual'||g.result||g.turn!==foe||!rite||rite.phase!=='open')return{loss:false,checks,complete:true};
 const king=g.pieces.find(p=>p.side===foe&&p.role==='king');if(!king)return{loss:false,checks,complete:true};
 const advance=(state:Game,a:GameAction)=>{checks++;return resolveRitual(state,a,true);};
 const candidates=allActions(g).filter(a=>a.id===king.id?inAltar(a):inAltar(king));
 for(const a of candidates){if(expired())return{loss:false,checks,complete:false};const occupied=advance(g,a);
  if(occupied.result){if(occupied.result.winner===foe)return{loss:true,checks,complete:true};continue;}
  if(occupied.ritual?.[foe].phase!=='occupied')continue;
  // Include non-royal wins such as the last public guard; they outrank the rite.
  const replies=allActions(occupied).filter(b=>b.kind==='execute'||occupied.pieces.some(p=>p.side===foe&&p.x===b.x&&p.y===b.y));let saved=false;
  for(const b of replies){if(expired())return{loss:false,checks,complete:false};const result=advance(occupied,b);if(result.result?.winner===defender){saved=true;break;}}
  if(!saved)return{loss:true,checks,complete:true};
 }
 return{loss:false,checks,complete:true};
}
