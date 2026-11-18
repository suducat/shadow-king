import * as T from 'three';
import {cellToWorld} from './interaction';
import {forward,type ActionStep,type GameMode,type Rites} from './ritual';
import type {VisiblePiece,VisibleRole} from './game';
const SILVER=0xbdeeff,PURPLE=0xb17bfa,GOLD=0xffd28a;
const material=(color:number,opacity=.8)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,side:T.DoubleSide});
function floor(parent:T.Object3D,geometry:T.BufferGeometry,color:number,opacity:number,x=0,z=0,y=.158){const m=new T.Mesh(geometry,material(color,opacity));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
function ring(parent:T.Object3D,r:number,width:number,color:number,opacity:number,y=.16){return floor(parent,new T.RingGeometry(r,r+width,64),color,opacity,0,0,y);}
function strip(parent:T.Object3D,x1:number,z1:number,x2:number,z2:number,width:number,color:number,opacity:number,y=.16){const m=floor(parent,new T.PlaneGeometry(width,Math.hypot(x2-x1,z2-z1)),color,opacity,(x1+x2)/2,(z1+z2)/2,y);m.rotation.z=-Math.atan2(x2-x1,z2-z1);return m;}
function dispose(group:T.Object3D){const mats=new Set<T.Material>();group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){if(o instanceof T.InstancedMesh)o.dispose();o.geometry.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))mats.add(m);}});mats.forEach(m=>m.dispose());group.removeFromParent();}
type Transient={group:T.Group;start:number;life:number;kind:'impact'|'collapse'|'open'|'occupy';direction?:T.Vector3;reduced?:boolean};
const tint=(role:VisibleRole)=>role==='king'?GOLD:role==='guard'?SILVER:role==='martyr'?PURPLE:0xb8c3cb;
export class BattleEffects{
 altar=new T.Group();charges=new Map<string,T.Group>();royalMarks=new Map<string,T.Group>();preview=new T.Group();action:T.Group|null=null;transients:Transient[]=[];
 light=new T.PointLight(PURPLE,0,9,2);active=false;occupied=false;openedAt=-Infinity;private lastRites?:Rites;
 private border:T.Mesh[]=[];private sigils:T.Mesh[]=[];private flow:T.Mesh[]=[];private core:T.Group;
 private statePieces:VisiblePiece[]=[];private pending:string|null=null;private mode?:GameMode;private particleBudget=8;
 setQuality(low:boolean){this.particleBudget=low?6:8;}
 constructor(private root:T.Group){
  root.add(this.altar,this.preview,this.light);this.light.position.set(0,2.4,0);this.altar.visible=false;
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
  this.mode=mode;this.altar.visible=mode==='ritual';this.pending=pending;
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
    const blade=new T.Mesh(new T.PlaneGeometry(.032,.64),material(SILVER,.95));blade.position.set(.21,.88,.19);blade.name='blade';g.add(blade);
    for(let i=0;i<5;i++){const spark=new T.Mesh(new T.OctahedronGeometry(.025),material(SILVER,.8));spark.userData.spark=i;g.add(spark);}
   }
  }
  for(const [id,g]of this.royalMarks)if(mode!=='ritual'||!pieces.some(p=>p.id===id)){dispose(g);this.royalMarks.delete(id);}
  for(const p of pieces.filter(p=>mode==='ritual'&&p.role==='king'&&p.revealed&&rites?.[p.side].phase!=='dormant')){
   let g=this.royalMarks.get(p.id);if(!g){g=new T.Group();this.root.add(g);this.royalMarks.set(p.id,g);ring(g,.54,.04,GOLD,.9,.025);ring(g,.63,.035,PURPLE,.85,.027);for(let i=0;i<4;i++){const a=i*Math.PI/2;strip(g,Math.sin(a)*.44,Math.cos(a)*.44,Math.sin(a)*.68,Math.cos(a)*.68,.03,GOLD,.85,.03);}}g.scale.setScalar(rites?.[p.side].phase==='occupied'?1.14:1);
  }
  this.statePieces=pieces;
  this.preview.children.forEach(c=>dispose(c));this.preview.clear();
  if(preview.length){const p=previewOrigin;
   for(const at of preview){const g=new T.Group();g.position.copy(cellToWorld(at.x,at.y,0));this.preview.add(g);floor(g,new T.PlaneGeometry(.78,.78),SILVER,.12);const dir=p?forward(p.side):-1;strip(g,-.19,-dir*.12,0,dir*.14,.055,SILVER,.95,.18);strip(g,.19,-dir*.12,0,dir*.14,.055,SILVER,.95,.18);}
  }
  return cues;
 }
 startMartyrTrail(from:T.Vector3,steps:ActionStep[]){this.clearAction();const g=new T.Group();g.userData.martyr=true;this.root.add(g);this.action=g;const to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);for(let i=0;i<3;i++){const m=ring(g,.18,.012,PURPLE,.1,.16);m.position.x=T.MathUtils.lerp(from.x,to.x,i/3);m.position.z=T.MathUtils.lerp(from.z,to.z,i/3);}}
 startStrike(role:VisibleRole,from:T.Vector3,steps:ActionStep[]){
  this.clearAction();const g=new T.Group();g.userData.steps=steps.map(s=>({...s}));g.userData.role=role;g.userData.strike=true;g.userData.points=[];g.userData.to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y,1.03);this.root.add(g);this.action=g;
  const line=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(24),3)),new T.LineBasicMaterial({color:tint(role),transparent:true,opacity:.5,depthWrite:false,toneMapped:false}));line.geometry.setDrawRange(0,0);line.visible=false;line.name='weapon-trail';line.frustumCulled=false;g.add(line);
  const beam=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(6),3)),new T.LineBasicMaterial({color:tint(role),transparent:true,opacity:.5,depthWrite:false,toneMapped:false}));beam.visible=false;beam.name='spell-thread';beam.frustumCulled=false;g.add(beam);
  const mote=new T.Mesh(new T.OctahedronGeometry(.035),material(tint(role),.6));mote.visible=false;mote.name='spell-mote';g.add(mote);
 }
 startAction(from:T.Vector3,steps:ActionStep[],role:VisibleRole='guard'){
  this.startStrike(role,from,steps);const g=this.action!,to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);g.userData.execution=true;g.userData.direction=to.clone().sub(from).setY(0).normalize().toArray();
  strip(g,from.x,from.z,to.x,to.z,.065,tint(role),.6,.17);strip(g,from.x,from.z,to.x,to.z,.18,tint(role),.12,.165);
  for(let i=0;i<steps.length*2;i++){const t=(i+.5)/(steps.length*2),x=T.MathUtils.lerp(from.x,to.x,t),z=T.MathUtils.lerp(from.z,to.z,t);strip(g,x-.08,z-.04,x+.08,z+.04,.012,tint(role),.45,.17);}
  const silhouette=new T.Shape();silhouette.moveTo(-.09,1.2);silhouette.quadraticCurveTo(0,1.34,.09,1.2);silhouette.lineTo(.11,1.06);silhouette.lineTo(.24,.98);silhouette.lineTo(.28,.62);silhouette.lineTo(.18,.66);silhouette.lineTo(.2,.12);silhouette.lineTo(.08,.12);silhouette.lineTo(0,.5);silhouette.lineTo(-.08,.12);silhouette.lineTo(-.2,.12);silhouette.lineTo(-.18,.66);silhouette.lineTo(-.28,.62);silhouette.lineTo(-.24,.98);silhouette.lineTo(-.11,1.06);silhouette.closePath();
  for(let i=0;i<2;i++){const trail=new T.Mesh(new T.ShapeGeometry(silhouette),material(tint(role),.1));trail.name='afterimage';trail.position.set(from.x,.18,from.z);trail.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);trail.userData.offset=i;g.add(trail);}
 }
 stepAction(progress:number,position:T.Vector3,_direction:number,tip?:T.Vector3,index=0,local=progress,reduced=false){
  const g=this.action;if(!g)return;if(g.userData.martyr){g.children.forEach(o=>{const m=o as T.Mesh;(m.material as T.MeshBasicMaterial).opacity=.1*(1-progress);});return;}
  const role=g.userData.role as VisibleRole,trail=g.getObjectByName('weapon-trail') as T.Line,beam=g.getObjectByName('spell-thread') as T.Line,mote=g.getObjectByName('spell-mote') as T.Mesh,active=!!tip&&local>.2&&local<.86&&!reduced;
  if(g.userData.index!==index){g.userData.points=[];g.userData.index=index;}
  if(tip&&active){const points=g.userData.points as T.Vector3[];points.push(tip.clone());if(points.length>8)points.shift();const a=trail.geometry.getAttribute('position') as T.BufferAttribute;for(let i=0;i<points.length;i++)a.setXYZ(i,points[i].x,points[i].y,points[i].z);a.needsUpdate=true;trail.geometry.setDrawRange(0,points.length);}
  trail.visible=active&&role==='guard';beam.visible=active&&role!=='guard'&&local<.64;mote.visible=beam.visible;
  if(tip&&beam.visible){const target=(g.userData.steps as ActionStep[])[index],to=cellToWorld(target.x,target.y,1.03),a=beam.geometry.getAttribute('position') as T.BufferAttribute;a.setXYZ(0,tip.x,tip.y,tip.z);a.setXYZ(1,to.x,to.y,to.z);a.needsUpdate=true;mote.position.lerpVectors(tip,to,T.MathUtils.clamp((local-.24)/.34,0,1));}
  const dir=new T.Vector3().fromArray(g.userData.direction??[0,0,1]);g.children.filter(o=>o.name==='afterimage').forEach(o=>{const lag=(o.userData.offset+1)*.13;o.position.copy(position).addScaledVector(dir,-lag);o.visible=!reduced&&progress>.18&&progress<.84;});
 }
 impact(x:number,y:number,role:VisibleRole='guard',direction=new T.Vector3(0,0,-1),reduced=false,now=performance.now(),victimRole:VisibleRole='unknown'){
  const g=new T.Group();g.position.set(x-3,0,y-3);this.root.add(g);const color=tint(role);ring(g,.2,.022,color,reduced?.35:.6,.17);
  if(!reduced){
   const flash=new T.Mesh(new T.OctahedronGeometry(.13),material(color,.48));flash.name='contact-flash';flash.position.y=1.02;g.add(flash);
   const chips=new T.InstancedMesh(new T.OctahedronGeometry(1),material(tint(victimRole==='unknown'?role:victimRole),.65),this.particleBudget);chips.name='chips';chips.frustumCulled=false;g.add(chips);
  }
  this.push({group:g,start:now,life:reduced?180:360,kind:'impact',direction:direction.clone().normalize(),reduced});
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
  this.light.intensity=this.active?(this.occupied?1.8:1.15)+(reduced?0:Math.sin(wake*Math.PI)*1.2):0;
  for(const[id,g]of this.charges){const a=actors.get(id),p=this.statePieces.find(p=>p.id===id);if(!a||!p)continue;g.position.copy(a.group.position);const rise=T.MathUtils.smoothstep((now-g.userData.began)/450,0,1);g.rotation.y=reduced?0:Math.sin(now*.0008)*.012;g.children.forEach(c=>{if(c.userData.spark!==undefined){const t=(now*.0005+c.userData.spark/5)%1,angle=c.userData.spark*Math.PI*.4;c.position.set(Math.cos(angle)*.36*(1-t),.18+t*.82,Math.sin(angle)*.36*(1-t));c.visible=!reduced&&rise>.2;}if(c.name==='blade'){const weapon=a.group.getObjectByName('rig-weapon');if(weapon){g.updateWorldMatrix(true,false);const point=weapon.localToWorld(new T.Vector3(0,.29,.014));c.position.copy(g.worldToLocal(point));weapon.getWorldQuaternion(c.quaternion);c.quaternion.premultiply(g.getWorldQuaternion(new T.Quaternion()).invert());}c.scale.y=.55+.45*rise;}});}
  for(const[id,g]of this.royalMarks){const a=actors.get(id);if(a)g.position.copy(a.group.position);g.rotation.y=reduced?0:now*.00008;}
  this.transients=this.transients.filter(t=>{const age=T.MathUtils.clamp((now-t.start)/t.life,0,1);if(age>=1){dispose(t.group);return false;}const fade=1-age;
   t.group.children.forEach(o=>{const m=o as T.Mesh,mat=m.material as T.MeshBasicMaterial;if(m.name==='chips'&&m instanceof T.InstancedMesh){const dir=t.direction!,side=new T.Vector3(-dir.z,0,dir.x),dummy=new T.Object3D();for(let i=0;i<m.count;i++){const spread=Math.sin(i*2.4)*.28;dummy.position.copy(dir).multiplyScalar(age*(.2+(i%3)*.08)).addScaledVector(side,spread*age);dummy.position.y=.95+Math.sin(age*Math.PI)*(.13+i%2*.08)-age*age*.16;dummy.rotation.set(age*(i+1),i*.7,age*i);dummy.scale.set(.018,.04,.012);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}m.instanceMatrix.needsUpdate=true;mat.opacity=.65*fade;}
    else if(m.name==='contact-flash'){m.visible=age<.24;mat.opacity=.48*(1-age/.24);m.scale.setScalar(.7+age*1.8);}
    else{mat.opacity=(t.reduced?.3:.5)*fade;m.scale.setScalar(t.kind==='occupy'?1.3-age*.3:1+age*(t.kind==='collapse'?.25:1.05));}});return true;});
 }
 clearAction(){if(this.action)dispose(this.action);this.action=null;}
 clearTransient(){this.clearAction();this.transients.forEach(t=>dispose(t.group));this.transients=[];}
 reset(){this.clearTransient();for(const g of this.charges.values())dispose(g);this.charges.clear();for(const g of this.royalMarks.values())dispose(g);this.royalMarks.clear();this.preview.children.forEach(c=>dispose(c));this.preview.clear();this.active=this.occupied=false;this.lastRites=undefined;this.statePieces=[];}
 destroy(){this.reset();dispose(this.altar);dispose(this.preview);this.light.removeFromParent();}
}
