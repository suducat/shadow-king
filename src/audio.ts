import type {VisibleRole} from './game';
export type CueOptions={key?:string;group?:string;decisive?:boolean;reduced?:boolean;material?:VisibleRole;index?:number};
export type AudioLayer={noise?:boolean;frequency:number;end?:number;duration:number;delay?:number;gain:number;type?:OscillatorType;filter?:number;pan?:number};
const tone=(frequency:number,duration:number,gain:number,end=frequency,type:OscillatorType='sine',delay=0):AudioLayer=>({frequency,end,duration,gain,type,delay});
const grain=(frequency:number,duration:number,gain:number):AudioLayer=>({noise:true,frequency,duration,gain});
// Only public presentation names enter this palette. An opaque mover always
// gets the same envelope/timbre, irrespective of its true identity or ID.
export function cueLayers(kind:string,options:CueOptions={}):AudioLayer[]{
 if(kind==='select')return[tone(392,.11,.12),tone(588,.17,.045,588,'sine',.025)];
 if(kind==='turn')return[tone(146.83,.24,.09),tone(220,.3,.05,220,'sine',.06)];
 if(kind==='reveal')return[tone(174.61,.36,.12),tone(349.23,.45,.065,349.23,'sine',.06)];
 if(kind==='charge'||kind==='charge-complete')return[tone(196,.5,.09,294),tone(588,.3,.045,440,'sine',.08)];
 if(kind.startsWith('rite-')){const base=kind==='rite-break'?98:kind==='rite-occupy'?146.83:130.81;return[tone(base,.65,.13,base*.8),tone(base*1.5,.7,.07,base*1.5,'sine',.05),grain(480,.16,.08)];}
 if(kind.startsWith('end-')){
  const [,reason,part='gather']=kind.split('-'),base=reason==='martyr'?130.81:reason==='ritual'?146.83:reason==='guard'?110:reason==='resign'?98:73.42;
  if(part==='seal'){const f=reason==='guard'?[220,196,164.81][options.index??0]:base*2;return[tone(f,.38,.1,f*.92),grain(reason==='guard'?1400:700,.09,.045)];}
  if(part==='climax')return[tone(base/2,.65,.16,base/2),tone(base,1.1,.11),tone(base*1.5,.95,.07,base*1.5,'triangle',.025),tone(base*2,1.15,.06,base*2,'sine',.045),grain(reason==='king'?1800:reason==='guard'?2400:650,.2,.1)];
  if(part==='settle')return[tone(base,.45,.055),tone(base*2,.55,.025)];
  return[tone(base,.8,.1,base*.96),tone(base*1.5,.75,.04,base*1.5,'sine',.08)];
 }
 const parts=kind.split('-'),role:VisibleRole=kind.startsWith('execution-')?'guard':(['king','guard','martyr','unknown'].includes(parts[1])?parts[1]:'unknown') as VisibleRole;
 const stage=kind.startsWith('execution-')?parts[1]:parts.at(-1);
 if(stage==='windup'||stage==='release'||stage==='dash'){
  if(role==='guard')return[grain(stage==='dash'?1800:1300,.11,.09),tone(740,.16,.04,980)];
  if(role==='king')return[tone(98,.24,.1,130.81),tone(392,.18,.035)];
  if(role==='martyr')return[tone(196,.28,.075,392),tone(294,.22,.04,440)];
  return[grain(480,.12,.065),tone(123,.16,.045,110)];
 }
 if(stage==='impact'){
  const base=role==='king'?58:role==='guard'?84:role==='martyr'?72:70,material=options.material==='guard'?1600:options.material==='king'?1100:550;
  const layers=[tone(base,.17,.24,base*.65),grain(material,.105,.21)];
  if(role==='guard')layers.push(tone(890,.25,.08,840),tone(1174,.17,.035));
  if(role==='king')layers.push(tone(294,.36,.08),tone(440,.25,.045));
  if(role==='martyr')layers.push(tone(261,.32,.09),tone(392,.4,.05,294));
  if(options.decisive)layers.push(tone(49,.24,.095,36));
  return layers;
 }
 if(stage==='plant')return[grain(1450,.032,.14),tone(role==='king'?79:102,.10,.14,51),grain(285,.085,.08)];
 if(stage==='charged')return[tone(294,.3,.09,588),tone(880,.24,.04,660)];
 if(stage==='recover')return[tone(role==='guard'?440:196,.16,.025,146.83)];
 return[tone(146.83,.15,.055)];
}
type Voice={sources:Set<AudioScheduledSourceNode>;nodes:Set<AudioNode>;group:string;music:boolean};
export class Soundscape{
 ctx:BaseAudioContext|null=null;musicGain:GainNode|null=null;fxGain:GainNode|null=null;timer:ReturnType<typeof setInterval>|null=null;
 music=.32;effects=.65;muted=false;lastKind='';activeEffects=new Set<AudioScheduledSourceNode>();
 private voices=new Set<Voice>();private seen=new Set<string>();private tick=0;private mode='menu';private wetSend:GainNode|null=null;private room:ConvolverNode|null=null;private roomGain:GainNode|null=null;private limiter:DynamicsCompressorNode|null=null;private impulse:AudioBuffer|null=null;private noise:AudioBuffer|null=null;
 readonly accepted:{kind:string;key?:string;at:number}[]=[];
 get stats(){return{voices:this.voices.size,effectSources:this.activeEffects.size,dedupeKeys:this.seen.size};}
 attach(ctx:BaseAudioContext){
  this.ctx=ctx;this.musicGain=ctx.createGain();this.musicGain.connect(ctx.destination);this.fxGain=ctx.createGain();
  this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=10;this.limiter.attack.value=.003;this.limiter.release.value=.12;this.limiter.connect(ctx.destination);this.fxGain.connect(this.limiter);
  this.wetSend=ctx.createGain();this.wetSend.gain.value=.1;this.roomGain=ctx.createGain();this.roomGain.gain.value=.32;this.roomGain.connect(this.limiter);this.fxGain.connect(this.wetSend);
  this.impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*.32),ctx.sampleRate);let seed=771;for(let c=0;c<2;c++){const d=this.impulse.getChannelData(c);for(let i=0;i<d.length;i++){seed=Math.imul(seed,1664525)+1013904223;d[i]=((seed>>>0)/4294967296*2-1)*Math.exp(-i/ctx.sampleRate*19)*.05;}for(const ms of[13,29,47])d[Math.floor(ctx.sampleRate*ms/1000)]+=.12;}
  this.noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.7),ctx.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<d.length;i++){seed=Math.imul(seed,1664525)+1013904223;d[i]=(seed>>>0)/4294967296*2-1;}
  this.musicGain.gain.value=this.music*.18;this.fxGain.gain.value=this.muted?0:this.effects*.5;this.resetRoom();this.update();
 }
 private resetRoom(){if(!this.ctx||!this.wetSend||!this.roomGain)return;this.wetSend.disconnect();this.room?.disconnect();this.room=this.ctx.createConvolver();this.room.normalize=false;this.room.buffer=this.impulse;this.wetSend.connect(this.room);this.room.connect(this.roomGain);}
 async unlock(){if(!this.ctx){this.attach(new AudioContext());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.silenceEffects();});}if(this.ctx instanceof AudioContext)await this.ctx.resume();if(!this.timer){this.ambient();this.timer=setInterval(()=>this.ambient(),2600);}}
 update(){if(!this.ctx||!this.musicGain||!this.fxGain)return;this.musicGain.gain.setTargetAtTime(this.muted||this.mode==='ending'?0:this.music*.18,this.ctx.currentTime,.1);this.fxGain.gain.setTargetAtTime(this.muted?0:this.effects*.5,this.ctx.currentTime,.025);}
 setMode(mode:string){if(mode===this.mode)return;this.mode=mode;if(mode==='ending')for(const v of [...this.voices])if(v.music)this.stopVoice(v);this.update();}
 private stopVoice(v:Voice){for(const s of v.sources){s.onended=null;try{s.stop();}catch{}this.activeEffects.delete(s);}for(const n of v.nodes)n.disconnect();v.sources.clear();v.nodes.clear();this.voices.delete(v);}
 stopGroup(group:string){for(const v of [...this.voices])if(v.group===group)this.stopVoice(v);}
 silenceEffects(){for(const v of [...this.voices])if(!v.music)this.stopVoice(v);this.activeEffects.clear();this.resetRoom();}
 play(kind:string,options:CueOptions={}):boolean{
  this.lastKind=kind.startsWith('end-')?kind.split('-').slice(0,2).join('-'):kind;
  if(options.key){if(this.seen.has(options.key))return false;this.seen.add(options.key);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);}
  if(!this.ctx||this.muted||typeof document!=='undefined'&&document.hidden)return false;
  if(this.voices.size>=12){if(!kind.includes('impact')&&!kind.includes('climax'))return false;const old=[...this.voices].find(v=>!v.music);if(old)this.stopVoice(old);else return false;}
  if(import.meta.env.DEV||import.meta.env.MODE==='test'){this.accepted.push({kind,key:options.key,at:this.ctx.currentTime});if(this.accepted.length>256)this.accepted.shift();}
  this.voice(cueLayers(kind,options),options.group??'ui',false,options.reduced?.55:1);return true;
 }
 private voice(layers:AudioLayer[],group:string,music:boolean,multiplier=1){
  if(!this.ctx)return;const ctx=this.ctx,v:Voice={sources:new Set(),nodes:new Set(),group,music};this.voices.add(v);
  for(const layer of layers){const t=ctx.currentTime+(layer.delay??0),env=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner();filter.type=layer.noise?'lowpass':'lowpass';filter.frequency.value=layer.noise?layer.frequency:layer.filter??(music?650:3200);pan.pan.value=layer.pan??0;
   const source=layer.noise?ctx.createBufferSource():ctx.createOscillator();if(source instanceof OscillatorNode){source.type=layer.type??'sine';source.frequency.setValueAtTime(layer.frequency,t);source.frequency.exponentialRampToValueAtTime(Math.max(20,layer.end??layer.frequency),t+layer.duration);}else source.buffer=this.noise;
   const gain=layer.gain*multiplier;env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(Math.max(.0002,gain),t+.006);env.gain.exponentialRampToValueAtTime(.0001,t+layer.duration);
   source.connect(filter);filter.connect(env);env.connect(pan);pan.connect((music?this.musicGain:this.fxGain)!);for(const n of[source,filter,env,pan])v.nodes.add(n);v.sources.add(source);if(!music)this.activeEffects.add(source);
   source.onended=()=>{v.sources.delete(source);this.activeEffects.delete(source);if(!v.sources.size){for(const n of v.nodes)n.disconnect();v.nodes.clear();this.voices.delete(v);}};source.start(t);source.stop(t+layer.duration+.025);
  }
 }
 private ambient(){if(typeof document!=='undefined'&&document.hidden||this.muted||!this.music||this.mode==='ending'||!this.ctx)return;const notes=this.mode==='game'?[73.42,110,82.41,98]:[65.41,98,77.78,87.31],f=notes[this.tick++%notes.length];this.voice([tone(f,4.5,.12),tone(f*1.5,4.3,.055,f*1.5,'sine',.1),tone(f*2,4,.035,f*2,'sine',.2)],'ambience',true);}
}
export const sound=new Soundscape();
