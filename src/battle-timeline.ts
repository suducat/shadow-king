import {coord,type Capture,type Game,type VisibleRole} from './game';
import type {ActionStep} from './ritual';
export type BattleCue={kind:'slide'|'windup'|'release'|'dash'|'impact'|'plant'|'disclose'|'charged'|'recover';at:number;index?:number};
export type Timeline={duration:number;plant:number;contacts:number[];hold:number;cues:BattleCue[];role:VisibleRole;execution:boolean;attack:boolean;charge:boolean;reduced:boolean};
export const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(t:number,a:number,b:number)=>smooth((t-a)/(b-a));
export const disclosureDelay=(duration:number)=>Math.min(.10,90/duration);
// One draw across the whole path. Contacts occur when the extended blade,
 // half a square ahead of the base, reaches each occupied square.
export const drawStart=.42,drawSpan=.22;
export const cutTime=(index:number,steps:number)=>drawStart+(index+.48)*drawSpan/steps;
export function battleTimeline(role:VisibleRole,steps:number,execution:boolean,attack:boolean,charge=false,reduced=false):Timeline{
 steps=Math.max(1,steps);const duration=reduced?(attack||execution?240:160)*steps:execution?800+steps*100:charge?820:attack?{king:1060,guard:880,martyr:1080,unknown:960}[role]:{king:740,guard:580,martyr:720,unknown:660}[role];
 const contacts=execution?Array.from({length:steps},(_,i)=>cutTime(i,steps)):attack?[.58]:[],hold=(reduced?0:execution?32:40)/duration;
 // The sole reaches the tile at plant. The remaining time belongs to the
 // articulated figure's follow-through. Each victim gets its own recoil beat.
 const plant=execution?.84:attack?.88:.80;
 const cues:BattleCue[]=[];
 if(execution)cues.push({kind:'release',at:0},{kind:'dash',at:drawStart});
 else if(attack||charge)cues.push({kind:'windup',at:0});
 if(attack&&!execution)cues.push({kind:'release',at:.27});
 contacts.forEach((at,index)=>{
  cues.push({kind:'impact',at,index},{kind:'disclose',at:at+disclosureDelay(duration),index});
 });
 cues.push({kind:'plant',at:plant});
 if(charge)cues.push({kind:'charged',at:.91});
 cues.push({kind:'recover',at:.95});
 cues.sort((a,b)=>a.at-b.at);
 return{duration,plant,contacts,hold,cues,role,execution,attack,charge,reduced};
}
export const battleCues=(steps:number,execution:boolean,attack:boolean)=>battleTimeline('unknown',steps,execution,attack).cues;
export const impactAt=(index:number,steps:number,execution:boolean)=>battleTimeline('unknown',steps,execution,true).contacts[index];
export function pathProgress(t:number,steps:number,execution:boolean){const travel=execution?clamp((t-drawStart)/drawSpan):clamp(t);const index=Math.min(steps-1,Math.floor(travel*steps));return{index,t:travel===1?1:travel*steps-index};}
// Both combat and endings use absolute, ordered, idempotent milestones. A slow
// frame consumes every crossed cue; audio/flash freshness is a separate policy.
export function consumeCues<T extends {at:number}>(cues:T[],emitted:Set<number>,progress:number):{cue:T;index:number}[]{const due:{cue:T;index:number}[]=[];cues.forEach((cue,index)=>{if(progress>=cue.at&&!emitted.has(index)){emitted.add(index);due.push({cue,index});}});return due;}
export type FigurePose={heave:number;lean:number;roll:number;sway:number;weaponHeight:number;weaponPitch:number;weaponRoll:number;capeDrag:number;leftArm:number;rightArm:number;leftLeg:number;rightLeg:number;sealScale:number;sealLift:number;crownLift:number;crownRoll:number};
export const neutralPose=():FigurePose=>({heave:0,lean:0,roll:0,sway:0,weaponHeight:0,weaponPitch:0,weaponRoll:0,capeDrag:0,leftArm:0,rightArm:0,leftLeg:0,rightLeg:0,sealScale:1,sealLift:0,crownLift:0,crownRoll:0});
export function drawStance(p:FigurePose,weight=1){
 p.heave=-.145*weight;p.lean=.30*weight;p.roll=-.13*weight;
 p.weaponRoll=1.56*weight;p.weaponPitch=-.69*weight;p.rightArm=-.40*weight;
 p.leftArm=-.38*weight;p.leftLeg=.54*weight;p.rightLeg=-.36*weight;p.capeDrag=.13*weight;
}
export function sampleBattle(t:number,line:Timeline,steps:number){
 t=clamp(t);
 if(line.execution){
  const path=pathProgress(t,steps,true),pose=neutralPose();
  if(!line.reduced&&line.role==='guard'){
   const draw=ramp(t,drawStart-.055,drawStart+.04);
   const rest=1-ramp(t,drawStart+drawSpan+.09,1);
   drawStance(pose,(1-draw)*rest);
   pose.weaponPitch+=1.15*draw*rest;pose.weaponRoll+=.53*draw*rest;
   pose.lean+=.11*draw*rest;pose.capeDrag-=.27*draw*rest;
   pose.leftLeg+=.19*draw*rest;pose.rightLeg-=.27*draw*rest;
  }
  return {index:path.index,local:path.t,travel:path.t,lift:0,pose,held:t,
   phase:t<drawStart?'prepare':t<drawStart+drawSpan?'drive':'settle'};
 }
 const local=t,contact=.58,hold=line.hold;
 const held=local<contact?local:local<contact+hold?contact:contact+(local-contact-hold)*(1-contact)/(1-contact-hold);
 let travel:number;
 if(line.reduced)travel=ramp(t,0,line.plant);
 else if(line.attack){const distance={king:.43,guard:.48,martyr:.28,unknown:.42}[line.role];travel=t<contact?distance*ramp(t,.27,contact):distance+(1-distance)*ramp(t,contact+hold,line.plant);}
 else travel=ramp(t,.16,line.plant);
 const poseTime=line.attack?held:local;
 const pose=neutralPose(),stride=Math.sin(ramp(poseTime,.12,.82)*Math.PI*2),weight=Math.sin(ramp(poseTime,.08,.88)*Math.PI),settle=Math.sin(ramp(poseTime,.68,1)*Math.PI)*(1-ramp(poseTime,.8,1));
 if(!line.reduced&&line.role!=='unknown'){
  const heavy=line.role==='king'? .65:line.role==='guard'?1:.75;
  pose.heave=-Math.abs(stride)*.009-settle*.018;pose.lean=(weight*.035-settle*.025)*heavy;pose.roll=stride*.012;pose.sway=stride*.012;pose.capeDrag=-Math.sin(clamp((poseTime-.06)/.9)*Math.PI)*.06;
  pose.weaponPitch=-stride*.025;pose.weaponRoll=stride*.02;pose.leftArm=stride*.035;pose.rightArm=-stride*.025;
  if(line.role==='guard'){pose.leftLeg=stride*.12;pose.rightLeg=-stride*.12;}
  if(line.attack||line.execution){
   const ready=ramp(held,0,.25),strike=ramp(held,.27,contact),follow=ramp(held,contact,.82),rest=ramp(held,.82,1);
   const release=1-rest;
   if(line.role==='guard'){pose.weaponPitch=(-.42*ready+1.57*strike+.32*follow)*release;pose.weaponRoll=(-.48*ready+1.01*strike+.18*follow)*release;pose.rightArm=-.035*ready*release;pose.leftArm=.08*ready*release;pose.lean=(.06*strike-.04*ready)*release;pose.leftLeg=.06*ready*release;pose.rightLeg=-.045*ready*release;}
   else if(line.role==='king'){pose.weaponHeight=(.14*ready-.34*strike)*release;pose.weaponPitch=(-.32*ready+.84*strike)*release;pose.weaponRoll=.19*strike*release;pose.heave-=.008*strike*release;pose.leftArm=-.1*ready*release;pose.lean=(-.025*ready+.045*strike)*release;}
   else if(line.role==='martyr'){pose.weaponPitch=(-.38*ready+.2*strike)*release;pose.sealScale=1+(.38*ready-.62*strike)*release;pose.sealLift=.06*ready*release;pose.leftArm=-.06*ready*release;pose.rightArm=-.06*ready*release;pose.lean=.07*strike*release;}
  }
  if(!line.attack&&!line.execution){
   const load=ramp(t,0,.16)*(1-ramp(t,.16,.35));
   const brake=ramp(t,.57,line.plant)*(1-ramp(t,line.plant,1));
   const press=ramp(t,line.plant-.055,line.plant)*(1-ramp(t,line.plant,1));
   pose.heave-=.032*load+.045*press;
   pose.lean+=heavy*(-.075*load+.08*weight-.07*brake);
   pose.weaponPitch+=.09*load-.10*brake;
   pose.capeDrag+=.12*brake;
  }
  if(line.charge)drawStance(pose,ramp(t,0,.46));
 }
 const lift=line.reduced||line.role==='unknown'||line.attack||line.execution?0:
  .085*ramp(t,.08,.34)*(1-ramp(t,.54,line.plant));
 return{index:0,local,travel,lift,pose,held,phase:t<.18?'prepare':line.attack&&local>=contact&&local<contact+hold?'contact':local<.87?'drive':'settle'};
}
export function retirementPose(role:VisibleRole,t:number,reduced=false){const p=neutralPose();if(reduced)return p;const recoil=Math.sin(clamp(t/.3)*Math.PI)*.06,fold=ramp(t,.15,.86);p.sway=recoil;p.lean=-recoil+fold*(role==='guard'?.32:role==='martyr'?.2:.14);p.heave=-fold*(role==='guard'?.19:role==='martyr'?.07:.09);p.leftArm=fold*.15;p.rightArm=fold*.12;p.weaponPitch=fold*(role==='guard'?1.3:.3);p.capeDrag=-fold*.13;if(role==='king'){p.crownLift=Math.sin(t*Math.PI)*.12;p.crownRoll=fold*.45;}if(role==='guard'){p.leftLeg=-fold*.22;p.rightLeg=fold*.14;}if(role==='martyr')p.sealScale=Math.max(.04,1-fold*.96);return p;}
export type PublicBeats={decisive?:number;captures:{step:number;victimId:string;capture:Capture}[];reveals:{step:number;id:string;role:'king'}[]};
// Disclosure comes only from the rules kernel's public capture/events output.
// Hidden attacker identities and uncaptured private roles are not inputs.
export function publicBeats(next:Game,previousCaptureCount:number,steps:ActionStep[]):PublicBeats{
 const captures=steps.flatMap((s,step)=>{const capture=next.captures.slice(previousCaptureCount).find(c=>c.id===s.victimId||c.at===coord(s.x,s.y));return s.victimId&&capture?[{step,victimId:s.victimId,capture}]:[];});
 const reveals=(next.events??[]).filter(e=>e.ply===next.ply&&e.kind==='rite-open').map(e=>({step:captures.filter(c=>c.capture.side===e.side&&c.capture.role==='martyr').at(-1)?.step??steps.length-1,id:e.id,role:'king' as const}));return{captures,reveals,decisive:next.result?.winner&&['king','guard','martyr'].includes(next.result.reason)?captures.at(-1)?.step:undefined};
}
export type EndingCue={at:number;kind:'gather'|'seal'|'climax'|'settle';index?:number};
export function endingTimeline(reason:string){const duration=reason==='guard'?2900:reason==='martyr'?3200:reason==='ritual'?3100:2700;const cues:EndingCue[]=reason==='guard'?[{kind:'gather',at:0},...[0,1,2].map(index=>({kind:'seal' as const,index,at:.22+index*.18})),{kind:'climax',at:.78},{kind:'settle',at:.95}]:[{kind:'gather',at:0},{kind:'seal',at:reason==='martyr'?.26:.32},{kind:'climax',at:reason==='ritual'?.7:.6},{kind:'settle',at:.95}];return{duration,cues};}
