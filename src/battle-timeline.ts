import {coord,type Capture,type Game,type VisibleRole} from './game';
import type {ActionStep} from './ritual';
export type BattleCue={kind:'windup'|'release'|'dash'|'impact'|'plant'|'charged'|'recover';at:number;index?:number};
export type Timeline={duration:number;contacts:number[];hold:number;cues:BattleCue[];role:VisibleRole;execution:boolean;attack:boolean;charge:boolean;reduced:boolean};
export const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(t:number,a:number,b:number)=>smooth((t-a)/(b-a));
export function battleTimeline(role:VisibleRole,steps:number,execution:boolean,attack:boolean,charge=false,reduced=false):Timeline{
 steps=Math.max(1,steps);const duration=reduced?100*steps:execution?1080+steps*180:charge?820:attack?{king:1060,guard:880,martyr:1080,unknown:960}[role]:{king:740,guard:580,martyr:720,unknown:660}[role];
 const contacts=execution?Array.from({length:steps},(_,i)=>.18+(i+.72)*.66/steps):attack?[.58]:[],hold=(reduced?0:execution?32:40)/duration;
 const cues:BattleCue[]=execution?[{kind:'release',at:0},{kind:'dash',at:.18},...contacts.map((at,index)=>({kind:'impact' as const,at,index})),{kind:'recover',at:.87}]:attack?[{kind:'windup',at:0},{kind:'release',at:.24},{kind:'impact',at:contacts[0],index:0},...(charge?[{kind:'charged' as const,at:.85}]:[]),{kind:'recover',at:.87}]:charge?[{kind:'windup',at:0},{kind:'plant',at:.66},{kind:'charged',at:.85},{kind:'recover',at:.94}]:[{kind:'plant',at:.68},{kind:'recover',at:.9}];
 return{duration,contacts,hold,cues,role,execution,attack,charge,reduced};
}
export const battleCues=(steps:number,execution:boolean,attack:boolean)=>battleTimeline('unknown',steps,execution,attack).cues;
export const impactAt=(index:number,steps:number,execution:boolean)=>battleTimeline('unknown',steps,execution,true).contacts[index];
export function pathProgress(t:number,steps:number,execution:boolean){const travel=execution?clamp((t-.18)/.66):clamp(t);const index=Math.min(steps-1,Math.floor(travel*steps));return{index,t:travel===1?1:travel*steps-index};}
// Both combat and endings use absolute, ordered, idempotent milestones. A slow
// frame consumes every crossed cue; audio/flash freshness is a separate policy.
export function consumeCues<T extends {at:number}>(cues:T[],emitted:Set<number>,progress:number):{cue:T;index:number}[]{const due:{cue:T;index:number}[]=[];cues.forEach((cue,index)=>{if(progress>=cue.at&&!emitted.has(index)){emitted.add(index);due.push({cue,index});}});return due;}
export type FigurePose={heave:number;lean:number;roll:number;sway:number;weaponPitch:number;weaponRoll:number;capeDrag:number;leftArm:number;rightArm:number;leftLeg:number;rightLeg:number;sealScale:number;sealLift:number;crownLift:number;crownRoll:number};
export const neutralPose=():FigurePose=>({heave:0,lean:0,roll:0,sway:0,weaponPitch:0,weaponRoll:0,capeDrag:0,leftArm:0,rightArm:0,leftLeg:0,rightLeg:0,sealScale:1,sealLift:0,crownLift:0,crownRoll:0});
export function sampleBattle(t:number,line:Timeline,steps:number){
 t=clamp(t);const path=pathProgress(t,steps,line.execution),local=line.execution?path.t:t,contact=line.execution?.72:.58,hold=line.execution?line.hold/(.66/steps):line.hold;
 const held=local<contact?local:local<contact+hold?contact:contact+(local-contact-hold)*(1-contact)/(1-contact-hold);
 let travel:number;
 if(line.reduced)travel=line.execution?ramp(local,0,.72):t;
 else if(line.execution){const reach=line.role==='guard'?.48:.42;travel=reach*ramp(local,0,.72)+(1-reach)*ramp(local,.72+hold,1);}
 else if(line.attack){const distance={king:.34,guard:.48,martyr:.28,unknown:.42}[line.role];travel=t<contact?distance*ramp(t,.18,contact):distance+(1-distance)*ramp(t,contact+hold,.88);}
 else travel=ramp(t,.14,.82);
 const poseTime=line.attack||line.execution?held:local;
 const pose=neutralPose(),stride=Math.sin(ramp(poseTime,.12,.82)*Math.PI*2),weight=Math.sin(ramp(poseTime,.08,.88)*Math.PI),settle=Math.sin(ramp(poseTime,.68,1)*Math.PI)*(1-ramp(poseTime,.8,1));
 if(!line.reduced){
  const heavy=line.role==='king'? .65:line.role==='guard'?1:.75;
  pose.heave=-Math.abs(stride)*.009-settle*.018;pose.lean=(weight*.035-settle*.025)*heavy;pose.roll=stride*.012;pose.sway=stride*.012;pose.capeDrag=-Math.sin(clamp((poseTime-.06)/.9)*Math.PI)*.06;
  pose.weaponPitch=-stride*.025;pose.weaponRoll=stride*.02;pose.leftArm=stride*.035;pose.rightArm=-stride*.025;
  if(line.role==='guard'){pose.leftLeg=stride*.12;pose.rightLeg=-stride*.12;}
  if(line.attack||line.execution){
   const ready=ramp(held,0,.22),strike=ramp(held,.22,contact),follow=ramp(held,contact,.82),rest=ramp(held,.82,1);
   const release=1-rest;
   if(line.role==='guard'){pose.weaponPitch=(-.42*ready+1.57*strike+.32*follow)*release;pose.weaponRoll=(-.48*ready+1.01*strike+.18*follow)*release;pose.rightArm=-.035*ready*release;pose.leftArm=.08*ready*release;pose.lean=(.06*strike-.04*ready)*release;pose.leftLeg=.06*ready*release;pose.rightLeg=-.045*ready*release;}
   else if(line.role==='king'){pose.weaponPitch=(-.26*ready+.52*strike)*release;pose.weaponRoll=.05*strike*release;pose.heave-=.008*strike*release;pose.leftArm=-.1*ready*release;pose.lean=(-.025*ready+.045*strike)*release;}
   else if(line.role==='martyr'){pose.weaponPitch=(-.38*ready+.2*strike)*release;pose.sealScale=1+(.38*ready-.62*strike)*release;pose.sealLift=.06*ready*release;pose.leftArm=-.06*ready*release;pose.rightArm=-.06*ready*release;pose.lean=.07*strike*release;}
   else{pose.lean=(.055*strike-.025*ready)*release;pose.sealScale=1+(.12*ready-.2*strike)*release;pose.leftArm=-.025*ready*release;pose.rightArm=-.025*ready*release;}
  }
  if(line.charge){const lift=ramp(t,0,.46);pose.weaponPitch=-.55*lift;pose.weaponRoll=-.34*lift;pose.rightArm=-.04*lift;pose.lean=-.025*lift;}
 }
 return{index:path.index,local,travel,pose,held,phase:t<.18?'prepare':line.attack&&local>=contact&&local<contact+hold?'contact':local<.87?'drive':'settle'};
}
export function retirementPose(role:VisibleRole,t:number,reduced=false){const p=neutralPose();if(reduced)return p;const recoil=Math.sin(clamp(t/.3)*Math.PI)*.06,fold=ramp(t,.15,.86);p.sway=recoil;p.lean=-recoil+fold*(role==='guard'?.32:role==='martyr'?.2:.14);p.heave=-fold*(role==='guard'?.19:role==='martyr'?.07:.09);p.leftArm=fold*.15;p.rightArm=fold*.12;p.weaponPitch=fold*(role==='guard'?1.3:.3);p.capeDrag=-fold*.13;if(role==='king'){p.crownLift=Math.sin(t*Math.PI)*.12;p.crownRoll=fold*.45;}if(role==='guard'){p.leftLeg=-fold*.22;p.rightLeg=fold*.14;}if(role==='martyr')p.sealScale=Math.max(.04,1-fold*.96);return p;}
export type PublicBeats={captures:{step:number;victimId:string;capture:Capture}[];reveals:{step:number;id:string;role:'king'}[]};
// Disclosure comes only from the rules kernel's public capture/events output.
// Hidden attacker identities and uncaptured private roles are not inputs.
export function publicBeats(next:Game,previousCaptureCount:number,steps:ActionStep[]):PublicBeats{
 const captures=steps.flatMap((s,step)=>{const capture=next.captures.slice(previousCaptureCount).find(c=>c.id===s.victimId||c.at===coord(s.x,s.y));return s.victimId&&capture?[{step,victimId:s.victimId,capture}]:[];});
 const reveals=(next.events??[]).filter(e=>e.ply===next.ply&&e.kind==='rite-open').map(e=>({step:captures.filter(c=>c.capture.side===e.side&&c.capture.role==='martyr').at(-1)?.step??steps.length-1,id:e.id,role:'king' as const}));return{captures,reveals};
}
export type EndingCue={at:number;kind:'gather'|'seal'|'climax'|'settle';index?:number};
export function endingTimeline(reason:string){const duration=reason==='guard'?2900:reason==='martyr'?3200:reason==='ritual'?3100:2700;const cues:EndingCue[]=reason==='guard'?[{kind:'gather',at:0},...[0,1,2].map(index=>({kind:'seal' as const,index,at:.22+index*.18})),{kind:'climax',at:.78},{kind:'settle',at:.95}]:[{kind:'gather',at:0},{kind:'seal',at:reason==='martyr'?.26:.32},{kind:'climax',at:reason==='ritual'?.7:.6},{kind:'settle',at:.95}];return{duration,cues};}
