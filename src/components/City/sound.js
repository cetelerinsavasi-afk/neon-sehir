// SADECE ÖNİZLEME — araba motor sesi (WebAudio ile üretilir, dosya yok).
// Devir hıza ve vitese göre yükselir; gaza basınca sert, bırakınca yumuşar.
export class EngineSound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(ctx.destination);
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 600;
      this.filter.Q.value = 2;
      this.filter.connect(this.master);
      this.o1 = ctx.createOscillator();
      this.o1.type = 'sawtooth';
      this.o2 = ctx.createOscillator();
      this.o2.type = 'square';
      this.g1 = ctx.createGain();
      this.g2 = ctx.createGain();
      this.g1.gain.value = 0.5;
      this.g2.gain.value = 0.18;
      this.o1.connect(this.g1).connect(this.filter);
      this.o2.connect(this.g2).connect(this.filter);
      this.o1.start();
      this.o2.start();
      // lastik sesi (gürültü)
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = ctx.createBufferSource();
      this.noise.buffer = buf;
      this.noise.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 1400;
      this.ng = ctx.createGain();
      this.ng.gain.value = 0;
      this.noise.connect(nf).connect(this.ng).connect(this.master);
      this.noise.start();
      this.idle(true);
    } catch {
      this.ctx = null;
    }
  }
  idle(on) {
    if (!this.ctx) return;
    this.on = on;
    this.master.gain.setTargetAtTime(on && !this.muted ? 0.22 : 0, this.ctx.currentTime, 0.15);
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(this.on && !m ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }
  // ratio: hız / azami hız, thr: gaz (−1…1), skid: kayma (0…1)
  update(ratio, thr, skid = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const gears = 5;
    const g = Math.min(gears - 1, Math.floor(ratio * gears));
    const inGear = ratio * gears - g;
    const rpm = 0.25 + inGear * 0.75 * (0.85 + g * 0.04);
    const f = 38 + rpm * 120;
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(380 + rpm * 900 + Math.max(0, thr) * 500, t, 0.08);
    this.g1.gain.setTargetAtTime(0.32 + Math.max(0, thr) * 0.35, t, 0.06);
    this.ng.gain.setTargetAtTime(skid * 0.12, t, 0.05);
  }
  horn() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    g.connect(this.ctx.destination);
    [392, 494].forEach((fr) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fr;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.5);
    });
  }
  thump(k) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(Math.min(0.5, 0.1 + k * 0.03), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  }
}
