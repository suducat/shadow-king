// Original procedural score and effects. No recorded or licensed audio assets.
class Soundscape {
  ctx: AudioContext | null = null;
  musicGain: GainNode | null = null;
  fxGain: GainNode | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  music = .32;
  effects = .65;
  muted = false;
  lastKind = '';
  activeEffects = new Set<AudioScheduledSourceNode>();
  silenceEffects(){for(const node of this.activeEffects){try{node.stop();}catch{/* already ended */}}this.activeEffects.clear();}
  private tick = 0;
  private mode = 'menu';
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
      this.fxGain = this.ctx.createGain(); this.fxGain.connect(this.ctx.destination);
      this.update();
    }
    await this.ctx.resume();
    if (!this.timer) { this.ambient(); this.timer = setInterval(() => this.ambient(), 2600); }
  }
  update() {
    if (this.ctx && this.musicGain && this.fxGain) {
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.music * .18, this.ctx.currentTime, .15);
      this.fxGain.gain.setTargetAtTime(this.muted ? 0 : this.effects * .32, this.ctx.currentTime, .05);
    }
  }
  setMode(mode: string) { this.mode = mode; }
  private tone(freq: number, duration: number, delay = 0, type: OscillatorType = 'sine', gain = .3, music = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(gain, t + .025); env.gain.exponentialRampToValueAtTime(.001, t + duration);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = music ? 650 : 2000;
    osc.connect(filter); filter.connect(env); env.connect((music ? this.musicGain : this.fxGain)!);
    if(!music){this.activeEffects.add(osc);osc.onended=()=>this.activeEffects.delete(osc);}
    osc.start(t); osc.stop(t + duration + .1);
  }
  private ambient() {
    if (document.hidden || this.muted || !this.music || this.mode === 'ending') return;
    const score = this.mode === 'game' ? [73.42, 110, 82.41, 98] : [65.41, 98, 77.78, 87.31];
    const f = score[this.tick++ % score.length];
    [1, 1.5, 2, 3].forEach((n, i) => this.tone(f * n, 5.5, i * .12, 'sine', .15 / (i + 1), true));
    this.tone(f * 4, 2.5, 1.2, 'triangle', .055, true);
  }
  play(kind: string) {
    this.lastKind = kind;
    if (!this.ctx || this.muted) return;
    if (kind === 'select') { this.tone(523, .15); this.tone(784, .3, .06, 'sine', .15); }
    else if(kind==='charge'){this.tone(220,.9,0,'sine',.16);this.tone(440,.8,.08,'triangle',.12);}
    else if(kind==='charge-complete'){this.tone(587,.4,0,'sine',.2);this.tone(880,.5,.06,'sine',.12);}
    else if(kind==='execution-release'){this.tone(293.66,.3,0,'triangle',.4);this.tone(1174.66,.22,.02,'sine',.25);}
    else if(kind==='execution-dash'){this.noise(.18);this.tone(440,.18,0,'sawtooth',.12);}
    else if(kind==='execution-impact'){this.noise(.2);[147,587,890].forEach((f,i)=>this.tone(f,.28,i*.012,'triangle',.35));}
    else if(kind==='execution-recover'){this.tone(880,.35,0,'sine',.12);this.tone(440,.4,.04,'sine',.09);}
    else if(kind==='execution'){[293.66,587.33,880].forEach((f,i)=>this.tone(f,.6,i*.06,'triangle',.35));this.noise(.25);}
    else if(kind==='rite-open'){[130.81,196,261.63].forEach((f,i)=>this.tone(f,1.5,i*.15,'sine',.3));}
    else if (kind === 'turn') [220, 293.66, 440].forEach((f, i) => this.tone(f, .6, i * .08, 'triangle', .2));
    else if (kind === 'reveal') [174.61, 349.23, 523.25, 698.46].forEach((f, i) => this.tone(f, 1.1, i * .1, 'sine', .3));
    else if (kind.startsWith('end-')) {
      const f = kind==='end-ritual'?[146.83,220,293.66,369.99,440,587.33]:kind === 'end-martyr' ? [130.81, 155.56, 196, 261.63, 392, 523.25] : kind === 'end-guard' ? [110, 164.81, 220, 329.63] : [98, 146.83, 196, 293.66, 392];
      f.forEach((v, i) => this.tone(v, kind==='end-martyr'?5:4, (kind==='end-martyr'?.3:0)+i*(kind==='end-martyr'?.22:.18), 'triangle', .3));
    } else if (kind.startsWith('attack')) {
      const base = kind.endsWith('king') ? 98 : kind.endsWith('guard') ? 293.66 : 130.81;
      [1, 1.5, 2.02, 4].forEach((n, i) => this.tone(base * n, .9 - i * .12, i * .025, i % 2 ? 'triangle' : 'sine', .45));
      this.noise(.28);
    } else { this.tone(kind === 'move-guard' ? 196 : kind === 'move-martyr' ? 174.61 : 146.83, .4, 0, 'triangle'); this.tone(440, .25, .12, 'sine', .1); }
  }
  private noise(duration: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = .6;
    s.connect(f); f.connect(g); g.connect(this.fxGain!); this.activeEffects.add(s);s.onended=()=>this.activeEffects.delete(s);s.start();
  }
}
export const sound = new Soundscape();
