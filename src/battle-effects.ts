import * as T from 'three';
import {cellToWorld} from './interaction';
import {forward,type ActionStep,type GameMode,type Rites} from './ritual';
import type {VisiblePiece} from './game';
const SILVER=0xbdeeff,PURPLE=0xb17bfa,GOLD=0xffd28a;
const material=(color:number,opacity=.8)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,side:T.DoubleSide});
function floor(parent:T.Object3D,geometry:T.BufferGeometry,color:number,opacity:number,x=0,z=0,y=.158){const m=new T.Mesh(geometry,material(color,opacity));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
function ring(parent:T.Object3D,r:number,width:number,color:number,opacity:number,y=.16){return floor(parent,new T.RingGeometry(r,r+width,64),color,opacity,0,0,y);}
function strip(parent:T.Object3D,x1:number,z1:number,x2:number,z2:number,width:number,color:number,opacity:number,y=.16){const m=floor(parent,new T.PlaneGeometry(width,Math.hypot(x2-x1,z2-z1)),color,opacity,(x1+x2)/2,(z1+z2)/2,y);m.rotation.z=-Math.atan2(x2-x1,z2-z1);return m;}
function dispose(group:T.Object3D){const mats=new Set<T.Material>();group.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))mats.add(m);}});mats.forEach(m=>m.dispose());group.removeFromParent();}
type Transient={group:T.Group;start:number;life:number;kind:'impact'|'collapse'};
export class BattleEffects{
 altar=new T.Group();charges=new Map<string,T.Group>();royalMarks=new Map<string,T.Group>();preview=new T.Group();action:T.Group|null=null;transients:Transient[]=[];
 light=new T.PointLight(PURPLE,0,9,2);active=false;occupied=false;openedAt=-Infinity;private lastRites?:Rites;
 private border:T.Mesh[]=[];private sigils:T.Mesh[]=[];private flow:T.Mesh[]=[];private core:T.Group;
 private statePieces:VisiblePiece[]=[];private pending:string|null=null;private mode?:GameMode;
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
 update(mode:GameMode|undefined,rites:Rites|undefined,pieces:VisiblePiece[],preview:ActionStep[]=[],pending:string|null=null,previewOrigin?:VisiblePiece){
  if(mode!==this.mode)this.clearTransient();
  this.mode=mode;this.altar.visible=mode==='ritual';this.pending=pending;
  const active=mode==='ritual'&&!!rites&&Object.values(rites).some(r=>r.phase!=='dormant');
  const occupied=active&&Object.values(rites!).some(r=>r.phase==='occupied');
  if(active&&!this.active)this.openedAt=performance.now();
  if(this.lastRites&&mode==='ritual')for(const side of ['red','blue'] as const)if(this.lastRites[side].phase==='occupied'&&rites?.[side].phase!=='occupied'&&rites?.[side].phase!=='completed')this.collapse();
  if(this.lastRites&&mode==='ritual')for(const side of ['red','blue'] as const)if(this.lastRites[side].phase==='occupied'&&!pieces.some(p=>p.side===side&&p.role==='king')&&this.statePieces.some(p=>p.side===side&&p.role==='king'))this.collapse();
  this.active=active;this.occupied=occupied;this.lastRites=rites?structuredClone(rites):undefined;
  for(const [id,g]of this.charges)if(mode!=='ritual'||!pieces.some(p=>p.id===id&&(p.charging||p.id===pending))){dispose(g);this.charges.delete(id);}
  for(const p of pieces.filter(p=>mode==='ritual'&&(p.charging||p.id===pending))){
   if(!this.charges.has(p.id)){
    const g=new T.Group();this.root.add(g);this.charges.set(p.id,g);
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
 }
 startMartyrTrail(from:T.Vector3,steps:ActionStep[]){this.clearAction();const g=new T.Group();g.userData.martyr=true;this.root.add(g);this.action=g;const to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);for(let i=0;i<5;i++){const m=ring(g,.21,.023,PURPLE,.18,.19);m.position.x=T.MathUtils.lerp(from.x,to.x,i/5);m.position.z=T.MathUtils.lerp(from.z,to.z,i/5);}}
 startAction(from:T.Vector3,steps:ActionStep[]){
  this.clearAction();const g=new T.Group();this.root.add(g);this.action=g;const to=cellToWorld(steps.at(-1)!.x,steps.at(-1)!.y);
  strip(g,from.x,from.z,to.x,to.z,.1,SILVER,.95,.185);strip(g,from.x,from.z,to.x,to.z,.3,0x628ccf,.3,.18);
  for(let i=0;i<steps.length*3;i++){const t=(i+.3)/(steps.length*3),x=T.MathUtils.lerp(from.x,to.x,t),z=T.MathUtils.lerp(from.z,to.z,t);strip(g,x-.13,z-.06,x+.13,z+.06,.018,SILVER,.65,.19);}
  const flash=new T.Group();flash.position.set(from.x,0,from.z);ring(flash,.46,.045,SILVER,.95,.2);g.add(flash);
  const silhouette=new T.Shape();silhouette.moveTo(-.09,1.2);silhouette.quadraticCurveTo(0,1.34,.09,1.2);silhouette.lineTo(.11,1.06);silhouette.lineTo(.24,.98);silhouette.lineTo(.3,.62);silhouette.lineTo(.18,.66);silhouette.lineTo(.2,.12);silhouette.lineTo(.08,.12);silhouette.lineTo(0,.5);silhouette.lineTo(-.08,.12);silhouette.lineTo(-.2,.12);silhouette.lineTo(-.18,.66);silhouette.lineTo(-.3,.62);silhouette.lineTo(-.24,.98);silhouette.lineTo(-.11,1.06);silhouette.closePath();
  for(let i=0;i<3;i++)for(let cross=0;cross<2;cross++){const trail=new T.Mesh(new T.ShapeGeometry(silhouette),material(SILVER,.22));trail.name='afterimage';trail.position.set(from.x,.22,from.z);trail.rotation.y=cross*Math.PI/2;trail.userData.offset=i;g.add(trail);}
  const arc=new T.Mesh(new T.TorusGeometry(.52,.035,6,48,Math.PI*1.5),material(0xe3faff,.95));arc.name='blade-arc';arc.rotation.x=.4;g.add(arc);
 }
 stepAction(progress:number,position:T.Vector3,direction:number){if(!this.action)return;
  this.action.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshBasicMaterial;m.opacity=(this.action?.userData.martyr?.18:o.name==='afterimage'?.19:.8)*(progress>.78?(1-progress)/.22:1);if(o.name==='afterimage'){const lag=(o.userData.offset+1)*.15;o.position.set(position.x,.22,position.z-direction*lag);o.visible=progress>.18&&progress<.78;}if(o.name==='blade-arc'){o.position.set(position.x,.85,position.z);o.visible=progress>.12&&progress<.8;o.rotation.z=-direction*(progress-.18)*Math.PI*3;}}});
 }
 impact(x:number,y:number){const g=new T.Group();g.position.set(x-3,0,y-3);this.root.add(g);ring(g,.25,.045,SILVER,1,.22);
  for(let i=0;i<3;i++){const m=new T.Mesh(new T.TorusGeometry(.4+i*.08,.025,4,32,Math.PI*1.4),material(i%2?GOLD:SILVER,.95));m.position.y=.5+i*.1;m.rotation.set(.5,i*.8,.4);g.add(m);}
  for(let i=0;i<8;i++){const m=new T.Mesh(new T.OctahedronGeometry(.035),material(SILVER,.9));m.userData.angle=i*Math.PI/4;g.add(m);}
  this.transients.push({group:g,start:performance.now(),life:450,kind:'impact'});
 }
 collapse(){const g=new T.Group();this.root.add(g);ring(g,1.35,.065,PURPLE,.8);this.transients.push({group:g,start:performance.now(),life:700,kind:'collapse'});}
 tick(now:number,reduced:boolean,actors:Map<string,{group:T.Group}>){
  this.border.forEach((m,i)=>(m.material as T.MeshBasicMaterial).opacity=this.active?(i<8?.72:.88)+(!reduced?Math.sin(now*.002+i*.2)*.08:0):.07);
  this.sigils.forEach(m=>(m.material as T.MeshBasicMaterial).opacity=this.active?(this.occupied?.74:.46)+(!reduced?Math.sin(now*.0025)*.1:0):.065);
  this.core.rotation.y=reduced?0:this.occupied?Math.sin(now*.0009)*.025:now*.00007;
  this.flow.forEach((m,i)=>{m.visible=this.active;const t=(i/12+(reduced?0:now*.000055))%1,q=t*4,n=Math.floor(q),f=(q-n)*3;const coords=[[-1.5+f,-1.5],[1.5,-1.5+f],[1.5-f,1.5],[-1.5,1.5-f]][n];if(this.occupied){const a=i*Math.PI/6,r=1.48*(1-((reduced?.4:now*.0003)+i/12)%1);m.position.set(Math.sin(a)*r,.18,Math.cos(a)*r);m.rotation.z=-a;}else{m.position.set(coords[0],.18,coords[1]);m.rotation.z=n%2?Math.PI/2:0;}});
  this.light.intensity=this.active?(this.occupied?2.6:1.6)+(reduced?0:Math.max(0,1-(now-this.openedAt)/1100)*5):0;
  for(const [id,g]of this.charges){const a=actors.get(id),p=this.statePieces.find(p=>p.id===id);if(!a||!p)continue;g.position.copy(a.group.position);g.rotation.y=reduced?0:Math.sin(now*.001)*.025;
   g.children.forEach(c=>{if(c.userData.spark!==undefined){const t=(now*.0007+c.userData.spark/5)%1,a=c.userData.spark*Math.PI*.4;c.position.set(Math.cos(a)*.4*(1-t),.15+t*.85,Math.sin(a)*.4*(1-t));c.visible=!reduced;}if(c.name==='blade')c.rotation.z=p.id===this.pending?-.5:-.3;});}
  for(const [id,g]of this.royalMarks){const a=actors.get(id);if(a)g.position.copy(a.group.position);g.rotation.y=reduced?0:now*.00015;}
  this.transients=this.transients.filter(t=>{const a=(now-t.start)/t.life;if(a>=1){dispose(t.group);return false;}t.group.children.forEach(c=>{const m=c as T.Mesh;(m.material as T.MeshBasicMaterial).opacity=1-a;if(c.userData.angle!==undefined)c.position.set(Math.sin(c.userData.angle)*a*.9,.25+a*.7,Math.cos(c.userData.angle)*a*.9);else c.scale.setScalar(1+a*(t.kind==='collapse'?.7:.5));});return true;});
 }
 clearAction(){if(this.action)dispose(this.action);this.action=null;}
 clearTransient(){this.clearAction();this.transients.forEach(t=>dispose(t.group));this.transients=[];}
 reset(){this.clearTransient();for(const g of this.charges.values())dispose(g);this.charges.clear();for(const g of this.royalMarks.values())dispose(g);this.royalMarks.clear();this.preview.children.forEach(c=>dispose(c));this.preview.clear();this.active=this.occupied=false;this.lastRites=undefined;this.statePieces=[];}
 destroy(){this.clearTransient();for(const g of this.charges.values())dispose(g);this.charges.clear();for(const g of this.royalMarks.values())dispose(g);this.royalMarks.clear();dispose(this.altar);dispose(this.preview);this.light.removeFromParent();}
}
