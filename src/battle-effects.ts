import * as T from 'three';
import {cutFragments} from './cut-fragments';
import {cutTime,drawStart,drawSpan} from './battle-timeline';
import {cellToWorld} from './interaction';
import {forward,inAltar,type ActionStep,type GameMode,type Rites} from './ritual';
import type {VisiblePiece,VisibleRole} from './game';
const WHITE=0xf3fbff;
const SILVER=0xbdeeff,PURPLE=0xb17bfa,GOLD=0xffd28a;
const material=(color:number,opacity=.8)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,side:T.DoubleSide});
function floor(parent:T.Object3D,geometry:T.BufferGeometry,color:number,opacity:number,x=0,z=0,y=.158){const m=new T.Mesh(geometry,material(color,opacity));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
function ring(parent:T.Object3D,r:number,width:number,color:number,opacity:number,y=.16){return floor(parent,new T.RingGeometry(r,r+width,64),color,opacity,0,0,y);}
function strip(parent:T.Object3D,x1:number,z1:number,x2:number,z2:number,width:number,color:number,opacity:number,y=.16){const m=floor(parent,new T.PlaneGeometry(width,Math.hypot(x2-x1,z2-z1)),color,opacity,(x1+x2)/2,(z1+z2)/2,y);m.rotation.z=-Math.atan2(x2-x1,z2-z1);return m;}
function dispose(group:T.Object3D){const mats=new Set<T.Material>();group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){if(o instanceof T.InstancedMesh)o.dispose();o.geometry.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))mats.add(m);}});mats.forEach(m=>m.dispose());group.removeFromParent();}
type Transient={group:T.Group;start:number;life:number;kind:'unseal'|'fracture'|'ash'|'impact'|'collapse'|'open'|'occupy';direction?:T.Vector3;reduced?:boolean};
const tint=(role:VisibleRole)=>role==='king'?GOLD:role==='guard'?SILVER:role==='martyr'?PURPLE:0xb8c3cb;
export class BattleEffects{
 altar=new T.Group();charges=new Map<string,T.Group>();royalMarks=new Map<string,T.Group>();preview=new T.Group();action:T.Group|null=null;transients:Transient[]=[];
 light=new T.PointLight(PURPLE,0,9,2);active=false;occupied=false;openedAt=-Infinity;private lastRites?:Rites;
 private border:T.Mesh[]=[];private sigils:T.Mesh[]=[];private flow:T.Mesh[]=[];private core:T.Group;
 private statePieces:VisiblePiece[]=[];private pending:string|null=null;private mode?:GameMode;private particleBudget=8;
 setQuality(low:boolean){this.particleBudget=low?6:8;}
 constructor(private root:T.Group){
  this.light.visible=false;root.add(this.altar,this.preview,this.light);this.light.position.set(0,2.4,0);this.altar.visible=false;
  for(let i=0;i<4;i++){const q=i-1.5;this.border.push(strip(this.altar,q,-1.5,q,1.5,i===0||i===3?.075:.035,PURPLE,.1),strip(this.altar,-1.5,q,1.5,q,i===0||i===3?.075:.035,PURPLE,.1));}
  for(const k of [-1,1]){this.border.push(strip(this.altar,-1.57,k*1.57,1.57,k*1.57,.045,GOLD,.08),strip(this.altar,k*1.57,-1.57,k*1.57,1.57,.045,GOLD,.08));}
  this.core=new T.Group();this.altar.add(this.core);for(const r of [.43,.53,1.18,1.3])this.sigils.push(ring(this.core,r,.018,r<1?GOLD:PURPLE,.08,.163));
  for(let i=0;i<8;i++){const a=i*Math.PI/4,b=a+Math.PI*3/4;this.sigils.push(strip(this.core,Math.sin(a)*1.16,Math.cos(a)*1.16,Math.sin(b)*1.16,Math.cos(b)*1.16,.014,GOLD,.06,.164));}
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){
   const g=new T.Group();g.position.set(x,0,z);this.altar.add(g);
   for(let i=0;i<4;i++){const a=i*Math.PI/2;this.sigils.push(strip(g,Math.sin(a)*.18,Math.cos(a)*.18,Math.sin(a+.45)*.3,Math.cos(a+.45)*.3,.018,GOLD,.06,.165));}
  }
  for(let i=0;i<12;i++){const m=floor(this.altar,new T.PlaneGeometry(.16,.045),GOLD,.8);m.visible=false;this.flow.push(m);}
 }
 update(mode:GameMode|undefined,rites:Rites|undefined,pieces:VisiblePiece[],preview:ActionStep[]=[],pending:string|null=null,previewOrigin?:VisiblePiece,now=performance.now(),reduced=false){
  const cues:string[]=[];
  if(mode!==this.mode)this.clearTransient();
  this.mode=mode;this.light.visible=mode==='ritual';this.altar.visible=mode==='ritual';this.pending=pending;
  const active=mode==='ritual'&&!!rites&&Object.values(rites).some(r=>r.phase!=='dormant');
  const occupied=active&&Object.values(rites!).some(r=>r.phase==='occupied');
  if(active&&!this.active){this.openedAt=now;cues.push('rite-open');if(!reduced)this.ceremony('open',now);}
  if(occupied&&!this.occupied){cues.push('rite-occupy');if(!reduced)this.ceremony('occupy',now);}
  if(this.lastRites&&mode==='ritual'&&(['red','blue'] as const).some(side=>this.lastRites![side].phase==='occupied'&&((rites?.[side].phase!=='occupied'&&rites?.[side].phase!=='completed')||!pieces.some(p=>p.side===side&&p.role==='king')&&this.statePieces.some(p=>p.side===side&&p.role==='king')))){this.collapse(now,reduced);cues.push('rite-break');}
  this.active=active;this.occupied=occupied;this.lastRites=rites?structuredClone(rites):undefined;
  for(const [id,g]of this.charges)if(mode!=='ritual'||!pieces.some(p=>p.id===id&&(p.charging||p.id===pending))){dispose(g);this.charges.delete(id);}
  for(const p of pieces.filter(p=>mode==='ritual'&&p.role==='guard'&&(p.charging||p.id===pending))){
   if(!this.charges.has(p.id)){
    const g=new T.Group();g.userData.began=now;this.root.add(g);this.charges.set(p.id,g);
    ring(g,.43,.025,SILVER,.85,.016);ring(g,.49,.012,0x668edc,.7,.019);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;strip(g,Math.sin(a)*.35,Math.cos(a)*.35,Math.sin(a)*.47,Math.cos(a)*.47,.035,SILVER,.85,.02);}
    const blade=new T.Mesh(new T.OctahedronGeometry(1),material(WHITE,.94));blade.position.set(.21,.88,.19);blade.name='blade';g.add(blade);
    const halo=new T.Mesh(new T.OctahedronGeometry(1),material(SILVER,.32));
    halo.scale.set(2.8,1.07,2.8);blade.add(halo);
    for(let i=0;i<8;i++){const spark=new T.Mesh(new T.OctahedronGeometry(.026),material(WHITE,.87));spark.userData.spark=i;g.add(spark);}
   }
  }
  for(const [id,g]of this.royalMarks)if(mode!=='ritual'||!pieces.some(p=>p.id===id&&p.role==='king'&&p.revealed&&rites&&rites[p.side].phase!=='dormant')){dispose(g);this.royalMarks.delete(id);}
  for(const p of pieces.filter(p=>mode==='ritual'&&p.role==='king'&&p.revealed&&rites&&rites[p.side].phase!=='dormant')){
   let g=this.royalMarks.get(p.id);if(!g){g=new T.Group();this.root.add(g);this.royalMarks.set(p.id,g);ring(g,.54,.04,GOLD,.9,.025);ring(g,.63,.035,PURPLE,.85,.027);for(let i=0;i<4;i++){const a=i*Math.PI/2;strip(g,Math.sin(a)*.44,Math.cos(a)*.44,Math.sin(a)*.68,Math.cos(a)*.68,.03,GOLD,.85,.03);}}const ascended=inAltar(p)&&rites?.[p.side].phase==='occupied';
   let mantle=g.getObjectByName('altar-mantle');
   if(ascended&&!mantle){
    mantle=new T.Group();mantle.name='altar-mantle';g.add(mantle);
    const aura=new T.Mesh(new T.CylinderGeometry(.26,.53,1.45,12,1,true),material(PURPLE,.14));
    aura.position.y=.76;mantle.add(aura);
    for(let i=0;i<3;i++){
     const halo=ring(mantle,.34+i*.065,.014,i===1?PURPLE:GOLD,.75,.4+i*.37);
     halo.rotation.y=.26*(i-1);
    }
    const glow=new T.PointLight(PURPLE,3.3,3,2);glow.position.y=1;mantle.add(glow);
   }
   if(!ascended&&mantle)dispose(mantle);
   g.scale.setScalar(ascended?1.12:1);
  }
  this.statePieces=pieces;
  [...this.preview.children].forEach(c=>dispose(c));this.preview.clear();
  if(preview.length){const p=previewOrigin;
   for(const at of preview){const g=new T.Group();g.position.copy(cellToWorld(at.x,at.y,0));this.preview.add(g);floor(g,new T.PlaneGeometry(.78,.78),SILVER,.12);const dir=p?forward(p.side):-1;strip(g,-.19,-dir*.12,0,dir*.14,.055,SILVER,.95,.18);strip(g,.19,-dir*.12,0,dir*.14,.055,SILVER,.95,.18);}
  }
  return cues;
 }
 startMartyrTrail(from:T.Vector3,steps:ActionStep[]){this.clearAction();const g=new T.Group();g.userData.martyr=true;this.root.add(g);this.action=g;const to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);for(let i=0;i<3;i++){const m=ring(g,.18,.012,PURPLE,.1,.16);m.position.x=T.MathUtils.lerp(from.x,to.x,i/3);m.position.z=T.MathUtils.lerp(from.z,to.z,i/3);}}
 startStrike(role:VisibleRole,from:T.Vector3,steps:ActionStep[]){
  this.clearAction();const g=new T.Group();g.userData.steps=steps.map(s=>({...s}));g.userData.role=role;g.userData.strike=true;g.userData.points=[];g.userData.to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y,1.03);this.root.add(g);this.action=g;
  if(role==='martyr'){
   const target=steps.at(-1)!;
   const seal=new T.Group();seal.name='target-seal';seal.position.copy(cellToWorld(target.x,target.y,0));g.add(seal);
   ring(seal,.37,.025,PURPLE,.95);ring(seal,.48,.014,GOLD,.76);
   for(let i=0;i<6;i++){
    const a=i*Math.PI/3,b=a+2*Math.PI/3;
    strip(seal,.33*Math.cos(a),.33*Math.sin(a),.33*Math.cos(b),.33*Math.sin(b),.018,PURPLE,.86,.174);
   }
  }
  // A strip swept between two points on the physical blade remains readable
  // obliquely. Limit its history in time so a low frame rate cannot leave a long tail.
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(new Float32Array(8*2*3),3).setUsage(T.DynamicDrawUsage));
  geo.setIndex(Array.from({length:7},(_,i)=>[2*i,2*i+1,2*i+2,2*i+1,2*i+3,2*i+2]).flat());
  geo.setDrawRange(0,0);
  const trail=new T.Mesh(geo,material(tint(role),.50));trail.name='weapon-trail';trail.visible=false;trail.frustumCulled=false;g.add(trail);
  const beam=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(6),3)),new T.LineBasicMaterial({color:tint(role),transparent:true,opacity:.5,depthWrite:false,toneMapped:false}));beam.visible=false;beam.name='spell-thread';beam.frustumCulled=false;g.add(beam);
  const mote=new T.Mesh(new T.OctahedronGeometry(.035),material(tint(role),.6));mote.visible=false;mote.name='spell-mote';g.add(mote);
 }
 startAction(from:T.Vector3,steps:ActionStep[],role:VisibleRole='guard'){
  this.startStrike(role,from,steps);const g=this.action!,to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);g.userData.execution=true;g.userData.direction=to.clone().sub(from).setY(0).normalize().toArray();
  strip(g,from.x,from.z,to.x,to.z,.065,tint(role),.6,.17);strip(g,from.x,from.z,to.x,to.z,.18,tint(role),.12,.165);
  for(let i=0;i<steps.length*2;i++){const t=(i+.5)/(steps.length*2),x=T.MathUtils.lerp(from.x,to.x,t),z=T.MathUtils.lerp(from.z,to.z,t);strip(g,x-.08,z-.04,x+.08,z+.04,.012,tint(role),.45,.17);}
  const wake=new T.Group();
  wake.name='draw-wake';wake.position.copy(from);wake.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
  const length=steps.length;
  for(let i=0;i<3;i++){
   const verts:number[]=[],indices:number[]=[];
   for(let j=0;j<=18;j++){
    const t=j/18,bow=Math.sin(t*Math.PI),w=(i===0?.085:.026)*bow;
    const x=(i-1)*.12+bow*.26,y=.44+t*.51+bow*(i-1)*.18;
    verts.push(x-w,y-w,t*length,x+w,y+w,t*length);
    if(j)indices.push(j*2-2,j*2-1,j*2,j*2-1,j*2+1,j*2);
   }
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute(verts,3));geometry.setIndex(indices);
   wake.add(new T.Mesh(geometry,material(i===0?WHITE:SILVER,.9)));
  }
  wake.visible=false;g.add(wake);
  const glint=new T.Mesh(new T.OctahedronGeometry(1),material(WHITE,.96));
  glint.name='draw-glint';g.add(glint);
  for(let i=0;i<5;i++){
   const ray=new T.Mesh(new T.OctahedronGeometry(1),material(i%2?WHITE:SILVER,.86));
   ray.name='draw-ray';ray.userData.angle=i*2.4;g.add(ray);
  }
  const slash=new T.Shape();
  slash.moveTo(-.83,-.12);slash.quadraticCurveTo(-.18,.52,.86,.14);
  slash.quadraticCurveTo(.01,.28,-.83,-.12);
  for(let i=0;i<steps.length;i++){
   const step=steps[i],cut=new T.Mesh(new T.ShapeGeometry(slash),material(WHITE,0));
   cut.name='blade-crescent';cut.userData.step=i;cut.visible=false;
   cut.position.copy(cellToWorld(step.x,step.y,1.12));
   cut.rotation.set(.14,Math.atan2(to.x-from.x,to.z-from.z),-.36);
   g.add(cut);
  }
  const silhouette=new T.Shape();silhouette.moveTo(-.09,1.2);silhouette.quadraticCurveTo(0,1.34,.09,1.2);silhouette.lineTo(.11,1.06);silhouette.lineTo(.24,.98);silhouette.lineTo(.28,.62);silhouette.lineTo(.18,.66);silhouette.lineTo(.2,.12);silhouette.lineTo(.08,.12);silhouette.lineTo(0,.5);silhouette.lineTo(-.08,.12);silhouette.lineTo(-.2,.12);silhouette.lineTo(-.18,.66);silhouette.lineTo(-.28,.62);silhouette.lineTo(-.24,.98);silhouette.lineTo(-.11,1.06);silhouette.closePath();
  for(let i=0;i<2;i++){const trail=new T.Mesh(new T.ShapeGeometry(silhouette),material(tint(role),.1));trail.name='afterimage';trail.position.set(from.x,.18,from.z);trail.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);trail.userData.offset=i;g.add(trail);}
 }
 stepAction(progress:number,position:T.Vector3,_direction:number,tip?:T.Vector3,index=0,local=progress,reduced=false,edge?:T.Vector3,now=performance.now()){
  const g=this.action;if(!g)return;if(g.userData.martyr){g.children.forEach(o=>{const m=o as T.Mesh;(m.material as T.MeshBasicMaterial).opacity=.1*(1-progress);});return;}
  const seal=g.getObjectByName('target-seal');
  if(seal){seal.visible=progress>=.12&&progress<.82;seal.scale.setScalar(reduced?1:.67+.33*T.MathUtils.smoothstep(progress,.12,.5));}
  for(const child of g.children)if(child.name==='blade-crescent'){
   const cut=child as T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>;
   const age=progress-cutTime(child.userData.step,g.userData.steps.length);
   cut.visible=!reduced&&age>=-.015&&age<.16;
   cut.material.opacity=1-T.MathUtils.smoothstep(age,.02,.16);
   cut.scale.setScalar(1.10+Math.max(0,age)*3);
  }
  const wake=g.getObjectByName('draw-wake');
  if(wake){
   const glint=g.getObjectByName('draw-glint')!;
   glint.visible=!reduced&&!!edge&&!!tip&&progress<drawStart+.06;
   if(glint.visible&&edge&&tip){
    const power=T.MathUtils.smoothstep(progress,0,drawStart);
    glint.position.lerpVectors(tip,edge,.5);
    glint.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),edge.clone().sub(tip).normalize());
    glint.scale.set(.055+.06*power,.44+.13*power,.06+.045*power);
   }
   for(const ray of g.children.filter(c=>c.name==='draw-ray')){
    ray.visible=glint.visible&&progress>.04&&progress<drawStart;
    if(!ray.visible)continue;
    const a=ray.userData.angle;
    const pull=(1-T.MathUtils.smoothstep(progress,.04,drawStart))*(1.0+.22*Math.sin(a));
    ray.position.copy(glint.position).addScaledVector(new T.Vector3(Math.cos(a),.35*Math.sin(2*a),Math.sin(a)),pull);
    ray.lookAt(glint.position);ray.scale.set(.021,.021,.025+pull*.24);
   }
   const travel=T.MathUtils.clamp((progress-drawStart)/drawSpan,0,1);
   wake.visible=!reduced&&travel>0&&progress<.85;
   for(const line of wake.children as T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>[]){
    line.geometry.setDrawRange(0,6*Math.ceil(travel*18));
    line.material.opacity=1-T.MathUtils.smoothstep(progress,drawStart+drawSpan,.85);
   }
  }
  const role=g.userData.role as VisibleRole,trail=g.getObjectByName('weapon-trail') as T.Mesh,beam=g.getObjectByName('spell-thread') as T.Line,mote=g.getObjectByName('spell-mote') as T.Mesh,active=!!tip&&role!=='unknown'&&local>.2&&local<.86&&!reduced;
  if(g.userData.index!==index){g.userData.points=[];g.userData.index=index;}
  const physical=role==='guard'||role==='king';
  if(physical&&tip&&edge&&active){
   const points=g.userData.points as {tip:T.Vector3;edge:T.Vector3;time:number}[];
   while(points.length&&points[0].time<now-105)points.shift();
   if(points.at(-1)?.time!==now)points.push({tip:tip.clone(),edge:edge.clone(),time:now});
   if(points.length>8)points.shift();
   const a=trail.geometry.getAttribute('position') as T.BufferAttribute;
   points.forEach((p,i)=>{a.setXYZ(2*i,p.tip.x,p.tip.y,p.tip.z);a.setXYZ(2*i+1,p.edge.x,p.edge.y,p.edge.z);});
   a.needsUpdate=true;trail.geometry.setDrawRange(0,Math.max(0,points.length-1)*6);
  }
  trail.visible=active&&physical;beam.visible=active&&!physical&&local<.65;mote.visible=beam.visible;
  if(tip&&beam.visible){
   const target=(g.userData.steps as ActionStep[])[index],to=cellToWorld(target.x,target.y,1.03);
   const advance=T.MathUtils.smoothstep(local,.27,.58);
   mote.position.lerpVectors(tip,to,advance);mote.scale.setScalar(role==='martyr'?2.3:1.45);
   const a=beam.geometry.getAttribute('position') as T.BufferAttribute;
   a.setXYZ(0,tip.x,tip.y,tip.z);a.setXYZ(1,mote.position.x,mote.position.y,mote.position.z);a.needsUpdate=true;
  }
  const dir=new T.Vector3().fromArray(g.userData.direction??[0,0,1]);g.children.filter(o=>o.name==='afterimage').forEach(o=>{const lag=(o.userData.offset+1)*.34;o.position.copy(position).addScaledVector(dir,-lag);o.visible=!reduced&&progress>drawStart+.05&&progress<drawStart+drawSpan+.04;});
 }
 impact(x:number,y:number,role:VisibleRole='guard',direction=new T.Vector3(0,0,-1),reduced=false,now=performance.now(),shatter=false){
  const g=new T.Group();g.position.set(x-3,0,y-3);this.root.add(g);const color=shatter?WHITE:tint(role);ring(g,reduced?.47:.2,reduced?.034:.022,color,reduced?.78:.6,.17);
  if(!reduced){
   const flash=new T.Mesh(new T.OctahedronGeometry(.13),material(color,.48));flash.name='contact-flash';flash.position.y=1.02;g.add(flash);
   if(shatter){
    const chips=new T.InstancedMesh(new T.TetrahedronGeometry(1),material(WHITE,.83),this.particleBudget+4);
    chips.name='chips';chips.frustumCulled=false;g.add(chips);
   }
   if(role==='king'&&!shatter)ring(g,.33,.052,GOLD,.9,.18);
  }
  this.push({group:g,start:now,life:reduced?180:360,kind:'impact',direction:direction.clone().normalize(),reduced});
 }
 prepareFracture(model:T.Group){return cutFragments(model,this.root);}
 fracture(group:T.Group,direction:T.Vector3,now:number){
  this.root.add(group);
  this.push({group,start:now,life:330,kind:'fracture',direction:direction.clone()});
 }
 ash(position:T.Vector3,direction:T.Vector3,now:number){
  const group=new T.Group();group.position.copy(position).setY(0);this.root.add(group);
  const ash=new T.InstancedMesh(new T.OctahedronGeometry(1),material(0xc1b6aa,.52),this.particleBudget);
  ash.name='ash';ash.frustumCulled=false;group.add(ash);
  this.push({group,start:now,life:390,kind:'ash',direction:direction.clone()});
 }
 unseal(origin:T.Vector3,yaw:number,role:'king'|'guard',now:number){
  const group=new T.Group();
  group.position.copy(origin).setY(0);group.rotation.y=yaw;
  const color=role==='king'?GOLD:SILVER;
  ring(group,.37,.045,color,.92,.19);
  ring(group,.53,.018,color,.56,.20);
  // Two curved pieces of the dark seal peel away from the revealed armour.
  for(const side of [-1,1]){
   const cloth=new T.Shape();
   cloth.moveTo(0,1.47);cloth.quadraticCurveTo(side*.27,1.28,side*.29,.95);
   cloth.lineTo(side*.47,.27);cloth.quadraticCurveTo(side*.24,.38,0,.30);
   cloth.quadraticCurveTo(side*.13,.95,0,1.47);
   const veil=new T.Mesh(new T.ShapeGeometry(cloth),material(0x182638,.86));
   veil.name='shed-veil';veil.userData.side=side;group.add(veil);
  }
  const rays=new T.InstancedMesh(new T.OctahedronGeometry(1),material(color,.92),role==='king'?8:6);
  rays.name='unseal-rays';rays.frustumCulled=false;group.add(rays);
  this.root.add(group);this.push({group,start:now,life:620,kind:'unseal'});
 }
 crownStrike(origin:T.Vector3,now:number){
  const group=new T.Group();group.position.copy(origin).setY(0);this.root.add(group);
  ring(group,.29,.064,GOLD,.98,.17);ring(group,.48,.022,GOLD,.72,.17);
  this.push({group,start:now,life:370,kind:'impact'});
 }
 private push(t:Transient){while(this.transients.length>=6)dispose(this.transients.shift()!.group);this.transients.push(t);}
 ceremony(kind:'open'|'occupy',now:number){const g=new T.Group();this.root.add(g);ring(g,kind==='open'?1.3:.65,.022,kind==='open'?PURPLE:GOLD,.45);this.push({group:g,start:now,life:kind==='open'?650:550,kind});}
 collapse(now=performance.now(),reduced=false){const g=new T.Group();this.root.add(g);ring(g,1.35,.035,PURPLE,reduced?.2:.5);this.push({group:g,start:now,life:reduced?180:480,kind:'collapse',reduced});}
 tick(now:number,reduced:boolean,actors:Map<string,{group:T.Group}>){
  const wake=T.MathUtils.smoothstep((now-this.openedAt)/650,0,1);
  this.border.forEach((m,i)=>(m.material as T.MeshBasicMaterial).opacity=this.active?(i<8?.55:.7)+(reduced?0:Math.sin(now*.0015+i*.15)*.045)*wake:.065);
  this.sigils.forEach(m=>(m.material as T.MeshBasicMaterial).opacity=this.active?(this.occupied?.65:.4)+(reduced?0:Math.sin(now*.0017)*.055):.055);
  this.core.rotation.y=reduced?0:this.occupied?Math.sin(now*.0007)*.015:now*.00004;
  this.flow.forEach((m,i)=>{m.visible=this.active;const t=(i/12+(reduced?0:now*.000035))%1,q=t*4,n=Math.floor(q),f=(q-n)*3,coords=[[-1.5+f,-1.5],[1.5,-1.5+f],[1.5-f,1.5],[-1.5,1.5-f]][n];if(this.occupied){const a=i*Math.PI/6,r=1.48*(1-((reduced?.4:now*.00022)+i/12)%1);m.position.set(Math.sin(a)*r,.18,Math.cos(a)*r);m.rotation.z=-a;}else{m.position.set(coords[0],.18,coords[1]);m.rotation.z=n%2?Math.PI/2:0;}});
  this.light.visible=this.mode==='ritual';this.light.intensity=this.active?(this.occupied?1.8:1.15)+(reduced?0:Math.sin(wake*Math.PI)*1.2):0;
  for(const[id,g]of this.charges){
   const actor=actors.get(id),weapon=actor?.group.getObjectByName('rig-weapon');
   if(!actor||!weapon)continue;
   g.position.copy(actor.group.position);g.updateWorldMatrix(true,false);
   const blade=g.getObjectByName('blade')!;
   blade.position.copy(g.worldToLocal(weapon.localToWorld(new T.Vector3(0,.49,.014))));
   weapon.getWorldQuaternion(blade.quaternion);
   blade.quaternion.premultiply(g.getWorldQuaternion(new T.Quaternion()).invert());
   const rise=reduced?1:T.MathUtils.smoothstep(now-g.userData.began,0,360);
   blade.scale.set(.076,.42*(.45+.55*rise),.072);
   for(const spark of g.children)if(spark.userData.spark!==undefined){
    const i=spark.userData.spark,t=(now*.0013+i/8)%1,angle=i*2.4+t;
    spark.visible=!reduced;
    spark.position.set(Math.cos(angle)*.73,.12+(i%3)*.24,Math.sin(angle)*.73).lerp(blade.position,t*t);
    spark.lookAt(blade.getWorldPosition(new T.Vector3()));
    spark.scale.set(.75,.75,3.8*(1-t)+.5);
   }
  }
  for(const[id,g]of this.royalMarks){
   const actor=actors.get(id);if(actor)g.position.copy(actor.group.position);
   g.rotation.y=reduced?0:now*.00045;
  }
  this.transients=this.transients.filter(t=>{const age=T.MathUtils.clamp((now-t.start)/t.life,0,1);if(age>=1){dispose(t.group);return false;}const fade=1-age;
   t.group.children.forEach(o=>{const m=o as T.Mesh,mat=m.material as T.MeshBasicMaterial;if(m.name==='shed-veil'){
     const side=m.userData.side;
     m.position.set(side*.64*age,.34*age,.35);m.rotation.set(-age*.95,side*.8*age,-side*age);
     mat.opacity=.86*(1-T.MathUtils.smoothstep(age,.15,.82));
    }else if(m.name==='unseal-rays'&&m instanceof T.InstancedMesh){
     const ray=new T.Object3D();
     for(let i=0;i<m.count;i++){
      const angle=i*2.4,r=.33+age*.48;
      ray.position.set(Math.cos(angle)*r,.32+(i%4)*.27+age*.44,Math.sin(angle)*r);
      ray.rotation.set(.28,angle,.28);
      ray.scale.set(.033,.22*(1-age)+.04,.033);
      ray.updateMatrix();m.setMatrixAt(i,ray.matrix);
     }
     m.instanceMatrix.needsUpdate=true;mat.opacity=.92*fade;
    }else if(m.name==='cut-fragment'){
     const i=m.userData.band,dir=t.direction!,spread=[.13,.82,-.73,-.41,.50][i];
     m.position.copy(m.userData.pivot).addScaledVector(dir,age*(.22+.08*i));
     m.position.x-=dir.z*spread*age;m.position.z+=dir.x*spread*age;
     m.position.y+=Math.sin(age*Math.PI)*(.08+.065*i)-age*age*.17;
     m.rotation.set(age*.52*i,age*spread,age*spread*1.7);
     mat.opacity=1-T.MathUtils.smoothstep(age,.43,1);
    }else if((m.name==='chips'||m.name==='ash')&&m instanceof T.InstancedMesh){const dir=t.direction!,side=new T.Vector3(-dir.z,0,dir.x),dummy=new T.Object3D();for(let i=0;i<m.count;i++){const ash=m.name==='ash',spread=Math.sin(i*2.4)*(ash?.31:.72);dummy.position.copy(dir).multiplyScalar(age*(.24+(i%3)*(ash?.12:.28))).addScaledVector(side,spread*age);dummy.position.y=ash?.25+age*.77+(i%4)*.16:Math.max(.22,.55+(i%4)*.19+Math.sin(age*Math.PI)*.36-age*age*.68);dummy.rotation.set(age*(i+1),i*.7,age*i);const size=(ash?.024:.084)*(1-.65*age);dummy.scale.set(size,size*(ash?.7:1.7),size*.63);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}m.instanceMatrix.needsUpdate=true;mat.opacity=.65*fade;}
    else if(m.name==='contact-flash'){m.visible=age<.24;mat.opacity=.48*(1-age/.24);m.scale.setScalar(.7+age*1.8);}
    else if(t.reduced&&t.kind==='impact'){mat.opacity=.78*fade;m.scale.setScalar(1);}
    else{mat.opacity=(t.reduced?.3:.5)*fade;m.scale.setScalar(t.kind==='occupy'?1.3-age*.3:1+age*(t.kind==='collapse'?.25:1.05));}});return true;});
 }
 clearAction(){if(this.action)dispose(this.action);this.action=null;}
 clearTransient(){this.clearAction();this.transients.forEach(t=>dispose(t.group));this.transients=[];}
 reset(){this.clearTransient();for(const g of this.charges.values())dispose(g);this.charges.clear();for(const g of this.royalMarks.values())dispose(g);this.royalMarks.clear();[...this.preview.children].forEach(c=>dispose(c));this.preview.clear();this.active=this.occupied=false;this.lastRites=undefined;this.statePieces=[];}
 destroy(){this.reset();dispose(this.altar);dispose(this.preview);this.light.removeFromParent();}
}
