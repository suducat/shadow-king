import * as T from 'three';
import {QUALITY,type Quality} from './quality';
import {BoardMarks} from './board-marks';
import {RigidBatches} from './rigid-batches';
import {renderResolution} from './render-resolution';
import {surface,disposeSurfaces,setSurfaceSampling} from './surfaces';
import {BattleEffects} from './battle-effects';
import {battleTimeline,consumeCues,sampleBattle,retirementPose,neutralPose,smooth,clamp,type BattleCue,type Timeline,type PublicBeats} from './battle-timeline';
import type {CueOptions} from './audio';
import type { Side, VisiblePiece, VisibleRole,Capture } from './game';
import {type GameMode,type Rites,type ActionStep} from './ritual';
import { createCharacter, disposeCharacters,poseFigure, type CharacterRig } from './models';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bodyPickMesh, cellToWorld, clientToNDC, intersectBoard,resolvePick } from './interaction';

type SceneState = { pieces: VisiblePiece[]; selected: string | null; legal: { x: number; y: number }[]; viewer: Side | null; cinematic: boolean; reduced: boolean; deployment: boolean; active: boolean; mode?:GameMode; ritual?:Rites; preview?:ActionStep[]; pendingCharge?:string|null };
type Actor = { group: T.Group; model: T.Group; rune: T.Mesh; role: VisibleRole; side: Side; target: T.Vector3; moving: number; pick: T.Mesh; rig?: CharacterRig; revealStarted?:number; rest:()=>void; disposed:boolean;facing:number };
const GOLD = 0xb7955d, RED = 0xd7654e, BLUE = 0x6ca9bd;
const mat = (color: T.ColorRepresentation, metalness = .55, roughness = .42) => new T.MeshStandardMaterial({ color, metalness, roughness });
const metal = mat(GOLD, .8, .3), darkMetal = mat(0x403b2d, .76, .35), obsidian = mat(0x111c20, .6, .5);

function mesh(geo: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, parent?: T.Object3D) {
  const m = new T.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = material instanceof T.MeshStandardMaterial; m.receiveShadow = true; parent?.add(m); return m;
}
function cylinder(parent: T.Object3D, top: number, bottom: number, h: number, y: number, material: T.Material, count = 32) {
  return mesh(new T.CylinderGeometry(top, bottom, h, count), material, 0, y, 0, parent);
}
function line(parent: T.Object3D, points: T.Vector3[], color: number, opacity = .65) {
  const l = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color, transparent: true, opacity })); parent.add(l); return l;
}
function ring(parent: T.Object3D, r: number, y: number, color = GOLD, opacity = .5) {
  const m = mesh(new T.RingGeometry(r, r + .012, 72), new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide }), 0, y, 0, parent);
  m.rotation.x = -Math.PI / 2; return m;
}
function makeActor(p: VisiblePiece,quality:Quality): Actor {
  const group=new T.Group(),{model,pick,rig}=createCharacter(p.role,p.side,quality);
  group.add(model,pick);
  const shadow=mesh(new T.CircleGeometry(.345,24),new T.MeshBasicMaterial({color:0x05090c,transparent:true,opacity:.32,depthWrite:false}),0,.003,0,group);shadow.rotation.x=-Math.PI/2;
  const contact=mesh(new T.RingGeometry(.345,.39,24),new T.MeshBasicMaterial({color:0x080d10,transparent:true,opacity:.13,depthWrite:false}),0,.002,0,group);contact.rotation.x=-Math.PI/2;
  const rune=ring(group,.37,.025,p.role==='martyr'?0xb394ce:p.side==='red'?RED:BLUE,.35);
  group.position.copy(cellToWorld(p.x,p.y,.18));
  const parts=[model,...Object.values(rig??{})],poses=parts.map(part=>({part,position:part.position.clone(),rotation:part.rotation.clone(),scale:part.scale.clone()}));
  const materials=new Map<T.Material,{opacity:number;transparent:boolean;depthWrite:boolean}>();model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});});
  const rest=()=>{group.scale.setScalar(1);group.visible=true;for(const p of poses){p.part.visible=true;p.part.position.copy(p.position);p.part.rotation.copy(p.rotation);p.part.scale.copy(p.scale);}model.traverse(o=>{if(o instanceof T.Mesh)o.visible=true;});for(const[m,r]of materials){const changed=m.transparent!==r.transparent||m.depthWrite!==r.depthWrite;m.opacity=r.opacity;m.transparent=r.transparent;m.depthWrite=r.depthWrite;if(changed)m.needsUpdate=true;}};
  group.userData={x:p.x,y:p.y,actorId:p.id};
  return {group,model,pick,rig,rune,role:p.role,side:p.side,target:group.position.clone(),moving:0,rest,disposed:false,facing:0};
}

type Victim={id:string;actor:Actor;index:number;at:T.Vector3;disclosed:boolean};
type Motion={id:string;victimId?:string;role:VisibleRole;actor:Actor;victim?:Actor;victims:Victim[];steps:ActionStep[];execution:boolean;cues:BattleCue[];emitted:Set<number>;silent:boolean;impacts:Set<number>;restore:()=>void;from:T.Vector3;to:T.Vector3;start:number;duration:number;impact:boolean;finish:(completed:boolean)=>void;line:Timeline;publicBeats:PublicBeats;pendingState?:SceneState;beforeRites?:Rites;beforePieces:VisiblePiece[];ceremonyCommitted:boolean;lastProgress:number;fromFacing:number;goalFacing:number;groupKey:string};
let sceneSerial=0;
const shortAngle=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
export class BoardScene {
  renderer: T.WebGLRenderer;
  quality:Quality='medium';private pendingQuality:Quality|null=null;private keyLight!:T.DirectionalLight;private labelMaterial?:T.MeshBasicMaterial;
  environment: T.WebGLRenderTarget;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(36, 1, .1, 100);
  root = new T.Group();
  actors = new Map<string, Actor>();
  tiles: T.Mesh[] = [];
  marks = new T.Group();
  private boardMarks=new BoardMarks(this.marks);
  batches=new RigidBatches(this.root);
  batchingEnabled=true;
  private measuredDensity=0;private displayDensity=0;bufferResizes=0;
  particles: T.Points;
  ray = new T.Raycaster();
  pointer = new T.Vector2();
  state: SceneState = { pieces: [], selected: null, legal: [], viewer: 'red', cinematic: true, reduced: false, deployment: false, active: false };
  frame = 0;
  renderedFrames = 0;
  fx:BattleEffects;
  onBattleCue:((kind:string,options?:CueOptions)=>void)|null=null;
  onBattleCancel:((group:string)=>void)|null=null;onPublicCapture:((capture:Capture)=>void)|null=null;
  lastSkipped=false;private instance=++sceneSerial;private actionSerial=0;private ceremonySerial=0;private audioQueue:{kind:string;options:CueOptions;at:number}[]=[];private cameraImpulse:{at:number;direction:T.Vector3}|null=null;private cameraBase=new T.Vector3();
  debugActionProgress:number|null=null;
  cueLog:{id:string;kind:string;index?:number}[]=[];
  observer: ResizeObserver;
  onCell: (x: number, y: number) => void;
  angle = .55; desiredAngle = .55; zoom = 1; desiredZoom = 1;
  burst: { group: T.Group; start: number } | null = null;
  down: { x: number; y: number; id: number; button: number } | null = null; dragging = false;
  debugInput: unknown = null;
  debugProject: unknown = null;
  lastHit: { x: number; y: number; source: string } | null = null;
  transition:Motion|null=null;
  lastAttack: {role:VisibleRole; victimId?:string; dissolved:boolean;execution?:boolean;path?:ActionStep[]} | null = null;
  private dirty = true; private lastRender=0;
  private dead = false;
  private measuredWidth = 0; private measuredHeight = 0;
  private last = performance.now();
  private lastCamera = performance.now();
  constructor(public host: HTMLElement, onCell: (x: number, y: number) => void) {
    this.onCell = onCell;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    this.batchingEnabled=!/SwiftShader|llvmpipe|softpipe/i.test(debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'');
    setSurfaceSampling(Math.min(this.renderer.capabilities.getMaxAnisotropy(),QUALITY[this.quality].anisotropy));
    this.renderer.shadowMap.enabled = false; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute('aria-label', '可交互的三维魔法棋盘，点击己方棋子，再点击亮起的合法格子');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04,.1,100,{size:128});this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.8;
    room.dispose();pmrem.dispose();
    this.scene.fog = new T.FogExp2(0x0b1319, .024);
    this.scene.add(this.root); this.root.add(this.marks);this.fx=new BattleEffects(this.root);
    this.scene.add(new T.AmbientLight(0xa6bdca, .92));
    const key = new T.DirectionalLight(0xffe3be, 3.1); key.position.set(-4, 12, 7); key.castShadow = true;this.keyLight=key;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; key.shadow.normalBias = .035; this.scene.add(key);
    const cold = new T.DirectionalLight(0x7cc0e3, 2.4); cold.position.set(5, 5, -7); this.scene.add(cold);
    const rim = new T.PointLight(0xa3bed2, 8, 18); rim.position.set(-6, 3, -4); this.scene.add(rim);
    this.makeBoard(); this.makeHall();
    this.scene.onBeforeRender=()=>{if(this.batchingEnabled)this.batches.sync([...this.actors].map(([id,a])=>({id,model:a.model,exclude:a.disposed||!!this.transition?.victims.some(v=>v.actor===a)})),true);};
    const positions = new Float32Array(100 * 3);
    for (let i = 0; i < 100; i++) { positions[i * 3] = (Math.random() - .5) * 22; positions[i * 3 + 1] = Math.random() * 7; positions[i * 3 + 2] = (Math.random() - .5) * 18; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(positions, 3));
    pg.setDrawRange(0,QUALITY[this.quality].particles);
    this.particles = new T.Points(pg, new T.PointsMaterial({ color: 0xd5b782, size: .018, transparent: true, opacity: .38, depthWrite: false, blending: T.AdditiveBlending })); this.scene.add(this.particles);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('lostpointercapture', this.pointerCancel);
    this.animate();
  }
  private makeBoard() {
    const board=new T.Group();this.root.add(board);
    const texture = surface('stone',true),relief=surface('stone');
    const stone = mat(0x283b43, .05, .88); stone.map = texture; stone.bumpMap=relief;stone.roughnessMap=relief; stone.bumpScale=.012;
    const pale = mat(0xa9a28f, .03, .86); pale.map = texture; pale.bumpMap=relief;pale.roughnessMap=relief; pale.bumpScale=.01;
    mesh(new T.BoxGeometry(8.1, .35, 8.1), mat(0x242e2f, .5, .6), 0, -.2, 0, board);
    mesh(new T.BoxGeometry(7.8, .16, 7.8), darkMetal, 0, .005, 0, board);
    for(const parity of [0,1]){const cells=Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7)})).filter(p=>(p.x+p.y)%2===parity),tiles=new T.InstancedMesh(new T.BoxGeometry(.98,.15,.98),parity?stone:pale,cells.length),matrix=new T.Matrix4();cells.forEach((p,i)=>tiles.setMatrixAt(i,matrix.makeTranslation(p.x-3,.065,p.y-3)));tiles.receiveShadow=true;board.add(tiles);this.tiles.push(tiles);}
    for (const s of [-1, 1]) {
      mesh(new T.BoxGeometry(8.05, .065, .035), metal, 0, .1, s * 3.98, board);
      mesh(new T.BoxGeometry(.035, .065, 8.05), metal, s * 3.98, .1, 0, board);
      mesh(new T.BoxGeometry(7.3, .025, .025), metal, 0, .15, s * 3.63, board);
      mesh(new T.BoxGeometry(.025, .025, 7.3), metal, s * 3.63, .15, 0, board);
      for (let i = 0; i < 7; i++) {
        this.label('ABCDEFG'[i], i - 3, .16, s * 3.8, s === 1 ? 0 : Math.PI,board);
        this.label(String(7 - i), s * 3.8, .16, i - 3, s === 1 ? -Math.PI / 2 : Math.PI / 2,board);
      }
      for (const t of [-1, 1]) {
        const corner = new T.Group(); corner.position.set(s * 3.78, .16, t * 3.78); board.add(corner);
        ring(corner, .12, 0, GOLD, .85); ring(corner, .16, 0, GOLD, .6);
        mesh(new T.OctahedronGeometry(.07), metal, 0, .03, 0, corner).scale.y = .3;
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const foot = mesh(new T.BoxGeometry(.7, .4, .7), darkMetal, Math.sin(a) * 4.7, -.5, Math.cos(a) * 4.7, board); foot.rotation.y = Math.PI / 4;
    }
    this.batchStatic(board);
  }
  private label(text:string,x:number,y:number,z:number,rotation:number,parent:T.Group){
    const glyphs='ABCDEFG7654321';
    if(!this.labelMaterial){const c=document.createElement('canvas');c.width=64*glyphs.length;c.height=64;const ctx=c.getContext('2d')!;ctx.font='30px Georgia';ctx.fillStyle='#d7bc82';ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<glyphs.length;i++)ctx.fillText(glyphs[i],i*64+32,32);this.labelMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,opacity:.85,depthWrite:false});}
    const geo=new T.PlaneGeometry(.22,.22),uv=geo.getAttribute('uv'),index=glyphs.indexOf(text);for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+index)/glyphs.length);
    const m=mesh(geo,this.labelMaterial,x,y,z,parent);m.rotation.set(-Math.PI/2,0,rotation);
  }
  private batchStatic(group:T.Group){
    group.updateMatrixWorld(true);const groups=new Map<T.Material,T.Mesh[]>();group.traverse(o=>{if(o instanceof T.Mesh&&!(o instanceof T.InstancedMesh)&&!Array.isArray(o.material)){const list=groups.get(o.material)??[];list.push(o);groups.set(o.material,list);}});
    for(const[material,objects]of groups){if(objects.length<2)continue;const inverse=group.matrixWorld.clone().invert(),geometries=objects.map(o=>{const raw=o.geometry.clone(),g=raw.index?raw.toNonIndexed():raw;if(g!==raw)raw.dispose();return g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));});const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;for(const o of objects){o.removeFromParent();o.geometry.dispose();}mesh(merged,material,0,0,0,group);}
  }
  private makeHall() {
    const stone = mat(0x1d2b32, .04, .94);stone.bumpMap=surface('stone');stone.bumpScale=.035;
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!,fade=ctx.createRadialGradient(64,64,4,64,64,64);fade.addColorStop(0,'white');fade.addColorStop(.55,'#777');fade.addColorStop(1,'black');ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
    const floor = mesh(new T.PlaneGeometry(32,32),new T.MeshStandardMaterial({color:0x162731,roughness:.97,metalness:.02,envMapIntensity:.15,transparent:true,opacity:.3,alphaMap:new T.CanvasTexture(c),depthWrite:false}),0,-.78,0,this.scene);floor.rotation.x=-Math.PI/2;
    const ritual = new T.Group(); ritual.position.y = -.765; this.scene.add(ritual);
    [5.3, 5.45, 5.7, 6.5].forEach(r => ring(ritual, r, 0, GOLD, .14));
    const glyphLines:T.Vector3[]=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,p=new T.Vector3(Math.sin(a)*5.5,0,Math.cos(a)*5.5),q=new T.Vector3(Math.sin(a+.02)*5.8,0,Math.cos(a+.02)*5.8),r=new T.Vector3(Math.sin(a+.04)*5.5,0,Math.cos(a+.04)*5.5);glyphLines.push(p,q,q,r);}ritual.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(glyphLines),new T.LineBasicMaterial({color:GOLD,transparent:true,opacity:.2,depthWrite:false})));
    const columns=new T.Group();this.scene.add(columns);
    for (const x of [-9, 9]) for (const z of [-9, 0, 9]) {
      const pillar = new T.Group(); pillar.position.set(x, -.7, z); columns.add(pillar);
      cylinder(pillar, .7, .85, .35, .17, stone, 8); cylinder(pillar, .45, .54, 9, 4.8, stone, 12);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new T.CylinderGeometry(.035, .035, 8.6, 6), darkMetal, Math.sin(a) * .5, 4.8, Math.cos(a) * .5, pillar); }
      cylinder(pillar, .75, .6, .3, 9.4, darkMetal, 8);
      const candle = mesh(new T.ConeGeometry(.06, .3, 8), new T.MeshBasicMaterial({ color: 0xefb46c }), x > 0 ? -.7 : .7, 2, 0, pillar);
      const flame = new T.PointLight(0xe6a45f, 2.8, 5); flame.position.copy(candle.position); flame.userData.decorativeLight=true;flame.visible=this.quality==='high';pillar.add(flame);
    }
    this.batchStatic(columns);
  }
  update(next: SceneState) {
    // A staged, noninteractive court portrait; never mutate a live match.
    if(!next.active){
      const king=next.pieces.find(p=>p.side==='red'&&p.role==='king');
      const masks=next.pieces.filter(p=>p.side==='blue').slice(0,2);
      next={...next,pieces:[...(king?[{...king,x:3,y:4}]:[]),...masks.map((p,i)=>({...p,x:i===0?2:4,y:2}))]};
    }
    this.dirty=true;
    this.renderer.domElement.dataset.ready='false';
    const geometryChanged=next.pieces.length!==this.state.pieces.length||next.pieces.some(p=>!this.state.pieces.some(old=>old.id===p.id&&old.role===p.role&&old.x===p.x&&old.y===p.y));
    if(geometryChanged)this.renderer.shadowMap.needsUpdate=true;
    const tr=this.transition;
    if(tr){
      const incoming=next.pieces.find(p=>p.id===tr.id);
      // A new perspective/board must never inherit an older actor's animation.
      if(next.viewer!==this.state.viewer||!next.active||next.deployment||!incoming||incoming.role!==tr.actor.role||incoming.x!==tr.to.x+3||incoming.y!==tr.to.z+3||next.pieces.some(p=>tr.victims.some(v=>v.id===p.id)))this.cancelMove();
    }
    const previousViewer = this.state.viewer;
    if(next.viewer!==previousViewer)this.fx.clearTransient();
    if(next.viewer!==previousViewer&&this.burst){this.root.remove(this.burst.group);this.disposeGroup(this.burst.group);this.burst=null;}
    this.state = next;
    if (next.viewer && next.viewer !== previousViewer) this.desiredAngle = next.viewer === 'blue' ? Math.PI + .55 : .55;
    const ids = new Set(next.pieces.map(p => p.id));
    for (const [id, actor] of this.actors) if (!ids.has(id) && !this.transition?.victims.some(v=>v.id===id)) { this.removeActor(id,actor); }
    for (const p of next.pieces) {
      let actor = this.actors.get(p.id);
      const deferred=this.transition?.publicBeats.reveals.some(r=>r.id===p.id&&!this.transition!.impacts.has(r.step));
      if ((!actor || actor.role !== p.role)&&!deferred) {
        const unseal=next.mode==='ritual'&&p.revealed&&p.role==='king'&&actor?.role==='unknown';
        if (actor) { this.removeActor(p.id,actor); }
        actor = makeActor(p,this.quality);if(unseal)actor.revealStarted=performance.now();this.root.add(actor.group); this.actors.set(p.id, actor);
      }
      if(!actor)continue;
      if(next.mode!=='ritual'||next.deployment)actor.revealStarted=undefined;
      const target = new T.Vector3(p.x - 3, .18, p.y - 3);
      actor.group.userData = { x: p.x, y: p.y, actorId:p.id };
      if (actor.target.distanceTo(target) > .01) { actor.target.copy(target); actor.moving = next.reduced ? 0 : performance.now(); if ((next.reduced || next.deployment)&&this.transition?.id!==p.id) actor.group.position.copy(target); }
      if(next.viewer===null||next.deployment)actor.group.position.copy(target);
      const selected = next.selected === p.id;
      (actor.rune.material as T.MeshBasicMaterial).opacity = selected ? .95 : .25;
      const occupying=next.mode==='ritual'&&p.role==='king'&&next.ritual?.[p.side].phase==='occupied';
      (actor.rune.material as T.MeshBasicMaterial).color.setHex(p.charging?0xc1d8e5:occupying?0xd3a1ed:p.role==='martyr'?0xb394ce:p.side==='red'?RED:BLUE);
      actor.rune.scale.setScalar(occupying?1.45:selected?1.2:p.charging?1.25:1);
    }
    this.boardMarks.update(next.pieces.find(p=>p.id===next.selected),next.legal.map(p=>({...p,occupied:next.pieces.some(q=>q.x===p.x&&q.y===p.y)})));
    if(this.transition)this.transition.pendingState=next;
    this.syncEffects(next,this.transition&&!this.transition.ceremonyCommitted?this.transition.beforeRites:next.ritual,performance.now());
    // Reconcile first; one RAF renders after camera and matrices are settled.

  }
  setBatching(enabled:boolean){if(enabled===this.batchingEnabled)return;this.batches.clear();this.batchingEnabled=enabled;this.dirty=true;}
  setQuality(value:Quality){
    if(value===this.quality&&!this.pendingQuality)return;
    // Defer mesh replacement until the active animation has settled. Changing
    // settings must never cancel a move or release an actor still in use.
    this.pendingQuality=value;this.applyQuality();
  }
  private applyQuality(){
    if(!this.pendingQuality||this.transition)return;
    this.quality=this.pendingQuality;this.pendingQuality=null;const q=QUALITY[this.quality];
    this.batches.clear();setSurfaceSampling(Math.min(this.renderer.capabilities.getMaxAnisotropy(),q.anisotropy));this.measuredDensity=0;
    this.renderer.shadowMap.enabled=!!q.shadow;
    if(q.shadow){this.keyLight.shadow.mapSize.set(q.shadow,q.shadow);this.keyLight.shadow.map?.dispose();this.keyLight.shadow.map=null;this.renderer.shadowMap.needsUpdate=true;}
    this.scene.traverse(o=>{if(o.userData.decorativeLight)o.visible=this.quality==='high';});
    this.particles.geometry.setDrawRange(0,q.particles);this.fx.setQuality(this.quality==='low');
    for(const[id,actor]of this.actors)this.removeActor(id,actor);
    this.update(this.state);this.resize();this.dirty=true;
  }
  resetActors() {
    this.batches.clear();this.cancelMove();
    for(const[id,actor]of this.actors)this.removeActor(id,actor);
    this.fx.reset();this.audioQueue=[];this.clearCameraImpulse();
    this.actors.clear();
  }
  revealActor(id:string,role:VisibleRole){
    const old=this.actors.get(id);if(!old||old.role===role)return;
    const next=makeActor({id,role,side:old.side,x:old.group.userData.x,y:old.group.userData.y},this.quality);next.group.position.copy(old.group.position);next.target.copy(old.target);
    next.facing=shortAngle(old.model.rotation.y+old.facing-next.model.rotation.y);this.removeActor(id,old);this.actors.set(id,next);this.root.add(next.group);for(const v of this.transition?.victims??[])if(v.actor===old)v.actor=next;
  }
  private syncEffects(state:SceneState,rites:Rites|undefined,now:number){
    const tr=this.transition;const pieces=state.pieces.map(p=>tr?.publicBeats.reveals.some(r=>r.id===p.id&&!tr.impacts.has(r.step))?tr.beforePieces.find(b=>b.id===p.id)??p:p);
    for(const v of tr?.victims??[])if(!tr!.impacts.has(v.index)){const p=tr!.beforePieces.find(p=>p.id===v.id);if(p&&!pieces.some(b=>b.id===p.id))pieces.push(p);}
    const cues=this.fx.update(state.mode,rites,pieces,state.preview,state.pendingCharge,state.pieces.find(p=>p.id===state.selected),now,state.reduced);
    for(const kind of cues??[])this.audioQueue.push({kind,options:{group:'ceremony',key:`${this.instance}/rite/${++this.ceremonySerial}`,reduced:state.reduced},at:now});
  }
  animateMove(id:string,role:VisibleRole,to:{x:number;y:number},victimId?:string,reduced=false):Promise<boolean>{return this.animatePath(id,role,[{...to,...(victimId?{victimId}:{})}],reduced,false);}
  animatePath(id:string,role:VisibleRole,steps:ActionStep[],reduced=false,execution=false,options:{charge?:boolean;publicBeats?:PublicBeats}={}):Promise<boolean>{
    this.cancelMove();const actor=this.actors.get(id);if(!actor||!steps.length)return Promise.resolve(false);
    // A caller can never promote an opaque actor by supplying its true role.
    role=actor.role==='unknown'||role==='unknown'?'unknown':actor.role;this.lastSkipped=false;
    const victims=steps.flatMap((step,index)=>{const a=step.victimId?this.actors.get(step.victimId):undefined;return a?[{id:step.victimId!,actor:a,index,at:a.group.position.clone(),disclosed:false}]:[];});
    const victimId=victims[0]?.id,to=steps.at(-1)!,line=battleTimeline(role,steps.length,execution,!!victimId,!!options.charge,reduced),from=actor.group.position.clone(),destination=cellToWorld(to.x,to.y,.18),dir=destination.clone().sub(from).setY(0);
    const goalFacing=dir.lengthSq()>.001?shortAngle(Math.atan2(dir.x,dir.z)-actor.model.rotation.y):actor.facing;
    if(execution)this.fx.startAction(from,steps,role);else if(victimId)this.fx.startStrike(role,from,steps);else if(role==='martyr'&&!reduced)this.fx.startMartyrTrail(from,steps);
    this.lastAttack=victimId||execution?{role,victimId,dissolved:false,execution,path:steps.map(p=>({...p}))}:null;
    return new Promise(finish=>{this.transition={id,role,actor,victim:victims[0]?.actor,victimId,victims,steps:steps.map(p=>({...p})),execution,cues:line.cues,emitted:new Set(),silent:false,impacts:new Set(),restore:actor.rest,from,to:destination,start:performance.now(),duration:line.duration,impact:false,finish,line,publicBeats:options.publicBeats??{captures:[],reveals:[]},beforeRites:this.state.ritual?structuredClone(this.state.ritual):undefined,beforePieces:structuredClone(this.state.pieces),ceremonyCommitted:false,lastProgress:0,fromFacing:actor.facing,goalFacing,groupKey:`battle/${this.instance}/${++this.actionSerial}`};});
  }
  cancelMove(completed=false){
    const tr=this.transition;this.transition=null;if(!tr)return;
    tr.restore();if(this.actors.get(tr.id)===tr.actor){tr.actor.group.position.copy(tr.to);tr.actor.facing=tr.goalFacing;if(tr.actor.rig){const pose=neutralPose();if(tr.actor.role==='guard'&&this.state.pieces.find(p=>p.id===tr.id)?.charging){pose.weaponPitch=-.55;pose.weaponRoll=-.34;pose.rightArm=-.04;}poseFigure(tr.actor.rig,pose,tr.actor.facing);}}
    for(const v of tr.victims)this.removeActor(v.id,v.actor);
    if(!completed||tr.silent){this.audioQueue=this.audioQueue.filter(c=>c.options.group!==tr.groupKey);this.onBattleCancel?.(tr.groupKey);}
    this.fx.clearAction();this.clearCameraImpulse();tr.finish(completed);
  }
  private clearCameraImpulse(){this.cameraImpulse=null;if(this.cameraBase.lengthSq()){this.camera.position.copy(this.cameraBase);this.camera.lookAt(0,-.05,0);this.camera.updateMatrixWorld();}}
  private stepMove(now:number){
    const tr=this.transition;if(!tr)return;this.dirty=true;this.renderer.shadowMap.needsUpdate=true;
    if(this.actors.get(tr.id)!==tr.actor){this.cancelMove();return;}
    const progress=Math.max(tr.lastProgress,clamp((now-tr.start)/tr.duration));tr.lastProgress=progress;
    const sample=sampleBattle(progress,tr.line,tr.steps.length),index=tr.execution?sample.index:0,step=tr.steps[index],from=index?cellToWorld(tr.steps[index-1].x,tr.steps[index-1].y,.18):tr.from,to=cellToWorld(step.x,step.y,.18),dir=to.clone().sub(from).setY(0).normalize(),actor=tr.actor;
    actor.group.position.lerpVectors(from,to,sample.travel);actor.model.position.y=0;actor.model.rotation.z=0;
    if(actor.rig){const turn=tr.line.reduced?1:smooth(clamp(progress/.26));poseFigure(actor.rig,sample.pose,tr.fromFacing+shortAngle(tr.goalFacing-tr.fromFacing)*turn);}
    actor.group.updateMatrixWorld(true);const tip=actor.rig?actor.rig.weapon.localToWorld(new T.Vector3().fromArray(actor.rig.weapon.userData.contact??[0,.3,0])):actor.group.position.clone();
    this.fx.stepAction(progress,actor.group.position,Math.sign(dir.z),tip,index,sample.local,tr.line.reduced);
    for(const{cue,index:cueIndex}of consumeCues(tr.cues,tr.emitted,progress)){
      const at=tr.start+cue.at*tr.duration,age=now-at,fresh=age<160&&!document.hidden&&!tr.silent;
      if(import.meta.env.MODE==='test')this.cueLog.push({id:tr.id,kind:cue.kind,index:cue.index});
      let material:VisibleRole='unknown';
      if(cue.kind==='impact'){
        const i=cue.index!,hit=tr.steps[i];tr.impacts.add(i);tr.impact=true;
        const disclosed=tr.publicBeats.captures.find(c=>c.step===i);const victim=tr.victims.find(v=>v.index===i);
        if(disclosed&&victim){victim.disclosed=true;if(fresh&&victim.actor.role!==disclosed.capture.role)this.revealActor(victim.id,disclosed.capture.role);if(fresh)this.onPublicCapture?.(disclosed.capture);}
        if(fresh)for(const reveal of tr.publicBeats.reveals.filter(r=>r.step===i))this.revealActor(reveal.id,reveal.role);
        if(tr.publicBeats.reveals.some(r=>r.step===i))tr.ceremonyCommitted=true;
        if(tr.pendingState)this.syncEffects(tr.pendingState,tr.ceremonyCommitted?tr.pendingState.ritual:tr.beforeRites,now);
        material=victim?.actor.role??'unknown';
        if(fresh){this.fx.impact(hit.x,hit.y,tr.role,dir,tr.line.reduced,at,material);if(!tr.line.reduced&&this.state.cinematic)this.cameraImpulse={at:now,direction:dir.clone()};}
      }
      if(cue.kind==='recover'&&tr.pendingState&&!tr.ceremonyCommitted){tr.ceremonyCommitted=true;this.syncEffects(tr.pendingState,tr.pendingState.ritual,now);}
      if(fresh){const kind=tr.execution&&tr.role!=='unknown'?`execution-${cue.kind}`:`battle-${tr.role}-${cue.kind}`;this.audioQueue.push({kind,options:{key:`${tr.groupKey}/${cueIndex}`,group:tr.groupKey,reduced:tr.line.reduced,material},at});}
    }
    for(const v of tr.victims){if(v.actor.disposed)continue;const hit=tr.line.contacts[v.index]??.58;if(progress<hit)continue;
      const end=Math.min(.97,hit+(tr.execution?.22:.36)),age=clamp((progress-hit-tr.line.hold)/(end-hit-tr.line.hold));if(age>=.98){this.removeActor(v.id,v.actor);continue;}
      v.actor.group.position.copy(v.at).addScaledVector(dir,Math.sin(Math.min(1,age/.3)*Math.PI)*.025);if(v.actor.rig)poseFigure(v.actor.rig,retirementPose(v.actor.role,age,tr.line.reduced),v.actor.facing);
      (v.actor.rune.material as T.MeshBasicMaterial).opacity=.25*(1-age);
      v.actor.model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(!m.transparent||m.depthWrite){m.transparent=true;m.depthWrite=false;m.needsUpdate=true;}const start=m.userData.scope==='base'?.68:m.userData.scope==='crown'?.35:.18;m.opacity=1-smooth(clamp((age-start)/(.98-start)));}});
    }
    if(progress>=1){if(tr.pendingState&&!tr.ceremonyCommitted)this.syncEffects(tr.pendingState,tr.pendingState.ritual,now);if(this.lastAttack)this.lastAttack.dissolved=true;this.cancelMove(true);}
  }
  effect(x:number,y:number,role:VisibleRole){this.fx.impact(x,y,role,new T.Vector3(0,0,-1),this.state.reduced);this.dirty=true;}
  rotate() { this.desiredAngle += Math.PI / 2; }
  setZoom(value: number) { this.desiredZoom = value; }
  resetCamera() { this.desiredAngle = this.state.viewer === 'blue' ? Math.PI + .55 : .55; this.desiredZoom = 1; }
  syncLayout() { this.resize(); }
  layoutReady() {
    const c=this.renderer.domElement,r=c.getBoundingClientRect(),h=this.host.getBoundingClientRect();
    return Math.abs(r.width-h.width)<1&&Math.abs(r.height-h.height)<1&&Math.abs(this.camera.aspect-h.width/h.height)<.00001;
  }
  private resize() {
    const rect=this.host.getBoundingClientRect(),w=rect.width,h=rect.height;
    if(w<=0||h<=0)return;
    const {ratio}=renderResolution(w,h,devicePixelRatio,this.quality);this.displayDensity=devicePixelRatio;
    if(Math.abs(w-this.measuredWidth)<.01&&Math.abs(h-this.measuredHeight)<.01&&Math.abs(ratio-this.measuredDensity)<.0001)return;
    this.measuredWidth=w;this.measuredHeight=h;this.measuredDensity=ratio;this.displayDensity=devicePixelRatio;this.dirty=true;this.renderer.domElement.dataset.ready='false';
    this.renderer.setDrawingBufferSize(w,h,ratio);this.bufferResizes++;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  private pointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button };
    this.dragging = e.button === 2;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private pointerMove = (e: PointerEvent) => {
    if (this.down?.id !== e.pointerId) return;
    if (this.dragging) { this.desiredAngle += (e.clientX - this.down.x) * .008; this.down.x = e.clientX; }
  };
  private pointerCancel = () => { this.down = null; this.dragging = false; };
  private pointerUp = (e: PointerEvent) => {
    const down = this.down; this.down = null;
    if (!down || down.id !== e.pointerId) return;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (this.dragging || down.button !== 0) { this.dragging = false; return; }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const ndc = clientToNDC(e.clientX, e.clientY, this.renderer.domElement.getBoundingClientRect());
    if (!ndc) return;
    this.camera.updateMatrixWorld(true); this.root.updateMatrixWorld(true);
    this.ray.setFromCamera(ndc, this.camera);
    // Intersect ONLY the dedicated body surfaces and the exact board plane.
    // Three.Line's default 1-world-unit tolerance must never enter picking.
    const bodies = Array.from(this.actors.values(), a => a.pick);
    const hit = this.ray.intersectObjects(bodies, false)[0];
    if(import.meta.env.MODE==='test') this.debugInput={rect:this.renderer.domElement.getBoundingClientRect().toJSON(),ndc:ndc.toArray(),bodies:bodies.map(m=>({world:m.getWorldPosition(new T.Vector3()).toArray(),cell:m.parent?.userData})),hits:this.ray.intersectObjects(bodies,false).map(h=>({cell:h.object.parent?.userData,point:h.point.toArray()}))};
    const body = hit?.object.parent?.userData;
    const cell = resolvePick(intersectBoard(this.ray.ray),body?.x!==undefined?{x:body.x,y:body.y}:null,this.state.legal,this.state.selected);
    if (cell) { this.lastHit = { ...cell, source: body?.x !== undefined ? 'body' : 'cell' }; this.onCell(cell.x, cell.y); }
  };
  projectActor(id:string,height=1.4){const actor=this.actors.get(id);if(!actor)return null;this.camera.updateMatrixWorld(true);const v=actor.group.position.clone();v.y+=height;v.project(this.camera);const r=this.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
  projectCell(x: number, y: number, height = .14) {
    this.camera.updateMatrixWorld(true);
    const p = cellToWorld(x, y, height).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    if(import.meta.env.MODE==='test')this.debugProject={x,y,height,p:p.toArray(),r:r.toJSON(),position:this.camera.position.toArray(),aspect:this.camera.aspect,zoom:this.zoom,angle:this.angle};
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }
  private contextMenu = (e: Event) => e.preventDefault();
  private animate = () => {
    if (this.dead) return;
    this.frame = requestAnimationFrame(this.animate);
    this.applyQuality();
    if(devicePixelRatio!==this.displayDensity)this.resize();
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, .05); this.last = now;
    // Full privacy/result covers have no interactive 3D content. Stop their
    // hidden GPU work so DOM/SVG ending animation can use the compositor freely.
    if(this.state.viewer===null&&this.state.active){this.audioQueue=[];this.lastCamera=now;this.dirty=false;return;}
    const speed = this.state.reduced ? 1 : 1 - Math.exp(-Math.min((now-this.lastCamera)/1000,.25) * 7); this.lastCamera=now;
    this.angle += (this.desiredAngle - this.angle) * speed; this.zoom += (this.desiredZoom - this.zoom) * speed;
    const aspect = this.camera.aspect, fit = aspect < .85 ? 1.28 : aspect < 1.1 ? 1.12 : 1;
    let distance = (this.state.active ? 14.7 : 10.8) * fit / this.zoom;


    this.camera.position.set(Math.sin(this.angle) * distance * .78, distance * .83, Math.cos(this.angle) * distance * .78); this.camera.lookAt(0, -.05, 0);
    if(this.state.active){
      for(let iteration=0;iteration<3;iteration++){
        this.camera.updateMatrixWorld(true);let overflow=1;
        for(const x of [-3.6,3.6])for(const z of [-3.6,3.6])for(const y of [.05,1.85]){
          const p=new T.Vector3(x,y,z).project(this.camera);overflow=Math.max(overflow,Math.abs(p.x)/.94,Math.abs(p.y)/.82);
        }
        if(overflow<=1.002)break;distance*=overflow*1.01;
        this.camera.position.set(Math.sin(this.angle)*distance*.78,distance*.83,Math.cos(this.angle)*distance*.78);this.camera.lookAt(0,-.05,0);
      }
    }
    this.cameraBase.copy(this.camera.position);
    if(this.cameraImpulse&&this.state.cinematic&&!this.state.reduced){const t=(now-this.cameraImpulse.at)/180;if(t>=1)this.cameraImpulse=null;else{this.camera.position.addScaledVector(this.cameraImpulse.direction,-.018*Math.sin(t*Math.PI)*(1-t));this.camera.lookAt(0,-.05,0);}}
    for (const [id, actor] of this.actors) {
      const piece=this.state.pieces.find(p=>p.id===id);
      if(actor.revealStarted&&now-actor.revealStarted>700)actor.revealStarted=undefined;
      if(this.transition?.id===id||this.transition?.victims.some(v=>v.id===id))continue;
      actor.group.position.lerp(actor.target,this.state.reduced?1:1-Math.exp(-dt*10));actor.model.position.y=0;
      if(actor.rig){const pose=neutralPose(),charged=actor.role==='guard'&&(!!piece?.charging||this.state.pendingCharge===id);if(!this.state.reduced){pose.heave=Math.sin(now*.0013+actor.target.x)*.003;pose.capeDrag=Math.sin(now*.0011+actor.target.x)*.009;}if(charged){pose.weaponPitch=-.55;pose.weaponRoll=-.34;pose.rightArm=-.04;}poseFigure(actor.rig,pose,actor.facing);}
      actor.rune.rotation.z += this.state.reduced ? 0 : dt * .12;
    }
    const actionTime=import.meta.env.MODE==='test'&&this.debugActionProgress!==null&&this.transition?this.transition.start+this.transition.duration*this.debugActionProgress:now;
    this.stepMove(actionTime);
    this.fx.tick(actionTime,this.state.reduced,this.actors);
    if (this.burst) {
      const age = (now - this.burst.start) / 1000;
      this.burst.group.children.forEach(c => {
        const m = c as T.Mesh | T.Line;
        if (m.userData.velocity) { m.position.addScaledVector(m.userData.velocity, dt * 1.9); m.rotation.x += dt * 3; m.rotation.y += dt; }
        else m.scale.setScalar(1 + age * 3);
        (m.material as T.MeshBasicMaterial).opacity = Math.max(0, 1 - age);
      });
      if (age > 1.1) { this.root.remove(this.burst.group); this.disposeGroup(this.burst.group); this.burst = null; }
    }
    if (!this.state.reduced) this.particles.rotation.y += dt * .007;
    const ready=String(this.measuredWidth>0&&this.measuredHeight>0&&Math.abs(this.angle-this.desiredAngle)<.0008&&Math.abs(this.zoom-this.desiredZoom)<.001);
    if(this.renderer.domElement.dataset.ready!==ready)this.renderer.domElement.dataset.ready=ready;
    const moving=!!this.transition||!!this.burst||this.fx.transients.length>0||ready==='false';
    if (!document.hidden&&(this.dirty||moving||(!this.state.reduced&&now-this.lastRender>1000/QUALITY[this.quality].idleFps))){
      this.renderer.render(this.scene,this.camera);this.renderedFrames++;this.lastRender=now;this.dirty=false;
      const cues=this.audioQueue.splice(0);if(!document.hidden)for(const cue of cues)if(now-cue.at<180)this.onBattleCue?.(cue.kind,cue.options);
    }
  };
  skipMove(){if(!this.transition)return;this.lastSkipped=true;this.transition.silent=true;this.stepMove(this.transition.start+this.transition.duration+1);this.fx.clearTransient();this.audioQueue=[];this.clearCameraImpulse();}
  private removeActor(id:string,actor:Actor){
    // A stale animation may only release the exact instance it owns. Never an
    // actor with the same ID from a new perspective or a restarted match.
    if(this.actors.get(id)!==actor||actor.disposed)return;actor.disposed=true;actor.group.removeFromParent();this.actors.delete(id);this.disposeGroup(actor.group);
  }
  private disposeGroup(g: T.Object3D) {
    g.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) { if(o instanceof T.InstancedMesh)o.dispose();if(!o.geometry?.userData.shared)o.geometry?.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; for (const m of materials) if (!m.userData.shared && m !== metal && m !== darkMetal && m !== obsidian) { for(const value of Object.values(m))if(value instanceof T.Texture&&!value.userData.shared)value.dispose(); m.dispose(); } } });
  }
  destroy() {
    this.cancelMove(); this.dead = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('pointerup', this.pointerUp); this.renderer.domElement.removeEventListener('pointermove', this.pointerMove); this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.removeEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.pointerCancel);
    this.batches.clear();this.fx.destroy();this.disposeGroup(this.scene); disposeCharacters(); this.environment.dispose();disposeSurfaces(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
