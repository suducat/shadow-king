import * as T from 'three';
import type {BoardScene} from './scene';
import {fixture} from './qa';
import {ritualFixture} from './ritual-qa';
import {act,viewFor,type Game,type VisibleRole} from './game';
import {disclosureDelay,publicBeats} from './battle-timeline';
import {modelState} from './lifecycle-qa';
export function combatFrame(scene:BoardScene){
 const tr=scene.transition;
 return{progress:tr?.lastProgress,role:tr?.role,duration:tr?.duration,contacts:tr?.line.contacts,
  position:tr?.actor.group.position.toArray(),body:tr?.actor.rig?.body.rotation.toArray(),legs:tr?.actor.rig?[tr.actor.rig.leftLeg.rotation.x,tr.actor.rig.rightLeg.rotation.x]:[],
  tip:tr?.actor.rig?.weapon.localToWorld(new T.Vector3().fromArray(tr.actor.rig.weapon.userData.contact)).toArray(),
  victims:tr?.victims.map(v=>({id:v.id,role:v.actor.role,disposed:v.actor.disposed,disclosed:v.disclosed,opacity:Math.min(...modelState(scene).filter(a=>a.id===v.id).map(a=>a.zeroOpacity))})),
  memory:{...scene.renderer.info.memory},render:{...scene.renderer.info.render},fx:scene.fx.transients.length,action:!!scene.fx.action,states:modelState(scene),cues:scene.cueLog.slice(-20)};
}
export async function combatProbe(scene:BoardScene){
 const failures:string[]=[],contacts:{role:string;direction:number[];distance:number}[]=[],privacy:unknown[]=[],memory:unknown[]=[];let checks=0,actions=0;
 const check=(ok:boolean,label:string)=>{checks++;if(!ok)failures.push(label);};
 const step=(progress:number)=>{const tr=scene.transition!;(scene as unknown as{stepMove(n:number):void}).stepMove(tr.start+tr.duration*progress);};
 const update=(g:Game,viewer:'red'|'blue'='red')=>scene.update({pieces:viewFor(g,viewer),viewer,selected:null,legal:[],cinematic:true,reduced:false,deployment:false,active:true,mode:g.mode??'classic',ritual:g.ritual});
 const healthy=()=>modelState(scene).every(a=>a.visible&&!a.zeroOpacity&&!a.disposed&&!a.hidden&&a.scale.every(n=>n===1)&&a.modelScale.every(n=>n===1));
 const off=scene.onPublicCapture;let disclosed=0;scene.onPublicCapture=()=>disclosed++;
 try{
 for(const role of ['king','guard','martyr'] as const)for(const [dx,dy]of [[0,-1],[0,1],[-1,0],[1,0]]){
  scene.resetActors();let g=fixture('capture',role),a=g.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!,v=g.pieces.find(p=>p.side==='blue'&&p.x===3&&p.y===2)!;
  g={...g,pieces:g.pieces.map(p=>p.id===v.id?{...p,x:3+dx,y:3+dy}:p)};update(g);
  const next=act(g,{id:a.id,x:3+dx,y:3+dy}),steps=[{x:3+dx,y:3+dy,victimId:v.id}];
  const p=scene.animatePath(a.id,role,steps,false,false,{publicBeats:publicBeats(next,g.captures.length,steps)});update(next);const tr=scene.transition!;
  step(.2);const before=modelState(scene).find(s=>s.id===v.id)!;check(before.zeroOpacity===0&&before.visible,`victim before contact ${role}/${dx}/${dy}`);
  step(.58);const actor=tr.actor;actor.group.updateMatrixWorld(true);const tip=actor.rig!.weapon.localToWorld(new T.Vector3().fromArray(actor.rig!.weapon.userData.contact));
  const target=new T.Vector3(3+dx-3,1.1,3+dy-3),distance=Math.hypot(tip.x-target.x,tip.z-target.z);contacts.push({role,direction:[dx,dy],distance});if(role==='guard'||role==='king')check(distance<.28,`guard blade contact ${distance}`);
  const body=actor.rig!.body.rotation.clone();step(.58+tr.line.hold*.7);check(Math.abs(actor.rig!.body.rotation.x-body.x)+Math.abs(actor.rig!.body.rotation.y-body.y)+Math.abs(actor.rig!.body.rotation.z-body.z)<1e-9,`contact hold ${role}`);
  const victim=tr.victims[0];
  check(victim.actor.role==='unknown'&&!victim.disclosed&&victim.actor.group.position.distanceTo(victim.at)>.005,`sealed recoil before disclosure ${role}/${dx}/${dy}`);
  step(.58+disclosureDelay(tr.duration)+.001);
  check(victim.disclosed&&victim.actor.role===v.role&&!victim.actor.disposed,`public model after recoil ${role}/${dx}/${dy}`);
  step(1.1);await p;actions++;check(healthy()&&!scene.actors.has(v.id),`capture settled ${role}`);
 }
 for(const role of ['king','guard','martyr'] as const){
  scene.resetActors();const g=fixture('capture',role);update(g,'blue');const a=g.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!;
  const p=scene.animatePath(a.id,role,[{x:4,y:3}],false,false);const tr=scene.transition!;step(.35);privacy.push({supplied:role,actual:tr.role,duration:tr.duration,body:tr.actor.rig?.body.rotation.toArray(),cues:tr.cues});check(tr.role==='unknown'&&tr.duration===660,`opaque motion ${role}`);scene.skipMove();await p;actions++;
 }
 for(const fps of [60,15,3,0])for(const name of ['ready','execute-open','purge','counter'] as const){
  scene.resetActors();const g=ritualFixture(name);update(g);const a=g.pieces.find(p=>p.id==='red-0')!,next=act(g,{id:a.id,x:a.x,y:name==='counter'?2:1,kind:'execute'}),steps=next.lastAction!.steps;
  const before=scene.cueLog.length,p=scene.animatePath(a.id,'guard',steps,false,true,{publicBeats:publicBeats(next,g.captures.length,steps)});update(next);const tr=scene.transition!;
  if(fps===60&&name==='ready'){for(const [i,hit]of tr.line.contacts.entries()){step(hit);tr.actor.group.updateMatrixWorld(true);const tip=tr.actor.rig!.weapon.localToWorld(new T.Vector3().fromArray(tr.actor.rig!.weapon.userData.contact));const d=Math.hypot(tip.x-(steps[i].x-3),tip.z-(steps[i].y-3));contacts.push({role:'execution',direction:[0,-1],distance:d});check(d<.28,`execution blade ${i}/${d}`);}}
  if(!fps)step(1.1);else{for(let t=0;t<tr.duration;t+=1000/fps)step(Math.max(tr.lastProgress,t/tr.duration));step(1.1);}await p;actions++;
  const hits=scene.cueLog.slice(before).filter(c=>c.kind==='impact');check(hits.length===steps.length,`all contacts ${name}/${fps}`);check(healthy()&&scene.actors.size===next.pieces.length,`all bodies ${name}/${fps}`);
 }
 // A rule commit must not erase a charged victim or break its altar before contact.
 for(const scenario of ['charged-victim','occupied-king','rite-opening'] as const){
  scene.resetActors();let g=ritualFixture(scenario==='occupied-king'?'counter':scenario==='rite-opening'?'execute-open':'charge');
  if(scenario==='charged-victim')g={...g,pieces:g.pieces.map(p=>p.id==='blue-0'?{...p,revealed:true,charging:{readyPly:2}}:p)};
  update(g);const a=g.pieces.find(p=>p.id==='red-0')!,next=act(g,{id:a.id,x:a.x,y:scenario==='occupied-king'?3:scenario==='rite-opening'?1:2,...(scenario==='rite-opening'?{kind:'execute' as const}:{})}),steps=next.lastAction!.steps;
  const p=scene.animatePath(a.id,'guard',steps,false,scenario==='rite-opening',{publicBeats:publicBeats(next,g.captures.length,steps)});update(next);const tr=scene.transition!;step(.2);
  if(scenario==='charged-victim')check(scene.fx.charges.has('blue-0'),'charged victim retains rune before contact');
  if(scenario==='occupied-king')check(!scene.fx.transients.some(t=>t.kind==='collapse'),'occupation intact before contact');
  if(scenario==='rite-opening')check(!scene.fx.active&&scene.fx.royalMarks.size===0,'rite dormant before actual capture');
  step(tr.line.contacts[0]+.001);
  if(scenario==='charged-victim')check(!scene.fx.charges.has('blue-0'),'charged victim rune ends on contact');
  if(scenario==='occupied-king')check(scene.fx.transients.filter(t=>t.kind==='collapse').length===1,'occupation breaks exactly on contact');
  if(scenario==='rite-opening')check(scene.fx.active&&scene.fx.royalMarks.size===1,'rite opens exactly on contact');
  step(1.1);await p;actions++;
 }
 // Repeated render/release cycles detect GPU-side resource growth, not just maps.
 for(let i=0;i<16;i++){
  scene.resetActors();const g=ritualFixture('ready');update(g);const next=act(g,{id:'red-0',x:3,y:1,kind:'execute'}),steps=next.lastAction!.steps;
  const p=scene.animatePath('red-0','guard',steps,false,true,{publicBeats:publicBeats(next,g.captures.length,steps)});update(next);step(.43);
  if(i%2)scene.skipMove();else{scene.resetActors();update(g);}await p;actions++;
  scene.fx.clearTransient();scene.renderer.render(scene.scene,scene.camera);check(healthy()&&!scene.transition&&!scene.fx.action&&scene.fx.transients.length===0,`cancel/skip ${i}`);
  memory.push({round:i,...scene.renderer.info.memory});
 }
 const geometries=memory.slice(4).map(m=>(m as {geometries:number}).geometries);check(Math.max(...geometries)-Math.min(...geometries)<80,'bounded rendered geometry across reset/skip');
 scene.resetActors();check(scene.actors.size===0&&scene.fx.transients.length===0,'menu teardown');
 return{checks,actions,contacts,privacy,memory,publicDisclosures:disclosed,failures};
 }finally{scene.onPublicCapture=off;scene.debugActionProgress=null;}
}
export async function audioProbe(){
 const {Soundscape}=await import('./audio');const ctx=new OfflineAudioContext(2,48000*3,48000),s=new Soundscape();s.music=0;s.effects=1;s.attach(ctx);
 const accepted=s.play('battle-guard-impact',{key:'same',group:'cancel'}),duplicate=s.play('battle-guard-impact',{key:'same',group:'cancel'});s.stopGroup('cancel');
 const afterCancel=s.stats;for(let i=0;i<30;i++)s.play(`battle-${(['king','guard','martyr','unknown'])[i%4]}-impact`,{key:`voice/${i}`,group:'load'});
 const max=s.stats,b=await ctx.startRendering();await Promise.resolve();let peak=0,energy=0,nonfinite=0;for(let c=0;c<2;c++)for(const v of b.getChannelData(c)){peak=Math.max(peak,Math.abs(v));energy+=v*v;if(!Number.isFinite(v))nonfinite++;}
 return{accepted,duplicate,afterCancel,max,finished:s.stats,peak,rms:Math.sqrt(energy/(2*b.length)),nonfinite};
}
