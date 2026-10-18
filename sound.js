// sound.js — all the audio, synthesized live with Web Audio (no sound files).
// Signal chain: every voice → (dry + a send into a generated room reverb) → compressor → speakers.
// Layers:
//   drone      detuned saws through a slowly "breathing" low-pass; a tritone joins from stage 4
//   room tone  brown noise + a faint 50 Hz mains hum with harmonics
//   heartbeat  lub-dub thumps from stage 4, faster each stage
//   spatial    knocks and breathing placed *behind* you with HRTF panning (best on headphones)
//   one-shots  UI clicks that detune as it goes on, glitch stutters, a whoosh between rounds,
//              a rising swell into the jump scare, a sub-bass drop, a shriek
// window.Sound keeps the API app.js uses: init, level, cut, knock, thud, shriek, breathe, whisper.
(function () {
  'use strict';

  const Sound = {
    ctx: null,
    master: null,
    stage: 0,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());

      // output: compressor so layered hits don't clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      this.out = comp;

      // a room: reverb from a generated impulse response (decaying stereo noise)
      const len = Math.floor(ctx.sampleRate * 2.8);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.verb = ctx.createConvolver();
      this.verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      this.verb.connect(wet).connect(comp);

      // the bed (drone + room tone) has its own fader
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(comp);
      this.send(this.master, 0.4);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      lp.Q.value = 4;
      lp.connect(this.master);
      // the filter breathes: a slow LFO on the cutoff
      const lfo = ctx.createOscillator();
      const lfoAmt = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoAmt.gain.value = 70;
      lfo.connect(lfoAmt).connect(lp.frequency);
      lfo.start();
      this.droneFilter = lp;
      [[55, 0.3], [55.6, 0.3], [82.4, 0.12]].forEach(([f, v]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        g.gain.value = v;
        o.connect(g).connect(lp);
        o.start();
      });
      // the tritone, silent until stage 4
      const tri = ctx.createOscillator();
      tri.type = 'sawtooth';
      tri.frequency.value = 77.8;
      this.tritone = ctx.createGain();
      this.tritone.gain.value = 0;
      tri.connect(this.tritone).connect(lp);
      tri.start();

      // room tone: brown noise
      const nlen = ctx.sampleRate * 3;
      const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      let last = 0;
      for (let i = 0; i < nlen; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        nd[i] = last * 3.5;
      }
      const ns = ctx.createBufferSource();
      ns.buffer = nb;
      ns.loop = true;
      const ng = ctx.createGain();
      ng.gain.value = 0.5;
      ns.connect(ng).connect(this.master);
      ns.start();
      // mains hum: 50 Hz and a few odd harmonics, very quiet
      [50, 150, 250].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.value = 0.05 / (i + 1);
        o.connect(g).connect(this.master);
        o.start();
      });
    },

    // route a node into the reverb as well
    send(node, amount) {
      const g = this.ctx.createGain();
      g.gain.value = amount;
      node.connect(g).connect(this.verb);
      return g;
    },

    // a voice placed in 3D around your head: x right, y up, z behind (positive = behind you)
    at(x, y, z) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
      p.connect(this.out);
      this.send(p, 0.5);
      return p;
    },

    noise(dur, shape = 4) {
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, shape);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      return s;
    },

    // per-stage bed level, plus what each stage adds
    level(v, stage) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(v, t, 1.5);
      if (stage != null) {
        this.stage = stage;
        this.droneFilter.frequency.setTargetAtTime(160 + stage * 45, t, 2);
        this.tritone.gain.setTargetAtTime(stage >= 4 ? 0.14 : 0, t, 3);
        this.heartbeat({ 4: 62, 5: 84 }[stage] || 0);
      }
    },
    cut() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0, t);
      this.heartbeat(0);
    },

    // ---- heartbeat ----
    heartbeat(bpm) {
      clearTimeout(this.hbT);
      this.bpm = bpm;
      if (!this.ctx || !bpm) return;
      const beat = () => {
        const t = this.ctx.currentTime + 0.02;
        [0, 0.22].forEach((dt, i) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.frequency.setValueAtTime(i ? 52 : 60, t + dt);
          o.frequency.exponentialRampToValueAtTime(30, t + dt + 0.16);
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(i ? 0.35 : 0.5, t + dt + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
          o.connect(g).connect(this.out);
          o.start(t + dt);
          o.stop(t + dt + 0.25);
        });
        this.hbT = setTimeout(beat, 60000 / this.bpm);
      };
      beat();
    },

    // ---- one-shots ----
    // a UI click that detunes a little more every stage
    click() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1800 - this.stage * 230, t);
      o.frequency.exponentialRampToValueAtTime(600 - this.stage * 80, t + 0.04);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.06);
    },
    // a stuttering digital glitch, for the creature's flickers
    glitch() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const s = this.noise(0.025, 1);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 400 + Math.random() * 3000;
        f.Q.value = 3;
        const g = this.ctx.createGain();
        g.gain.value = 0.25;
        s.connect(f).connect(g).connect(this.out);
        s.start(t + i * 0.035);
      }
    },
    // between rounds: air rushing past
    whoosh() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const s = this.noise(0.6, 0.6);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2500, t + 0.5);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      s.connect(f).connect(g);
      g.connect(this.out);
      this.send(g, 0.6);
      s.start(t);
    },
    // a rising swell (reverse-cymbal style) that lands on the jump scare
    swell(dur = 0.7) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(i / len, 3);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0.6;
      s.connect(f).connect(g).connect(this.out);
      s.start(t);
    },

    // two muffled knocks, behind you and to one side
    knock(side = -0.75, vol = 0.9) {
      if (!this.ctx) return;
      const p = this.at(side * 2, 0, 2.2);
      [0, 0.34].forEach((dt) => {
        const t = this.ctx.currentTime + 0.05 + dt;
        const s = this.noise(0.12, 4);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 160;
        const g = this.ctx.createGain();
        g.gain.value = vol * 4;
        s.connect(f).connect(g).connect(p);
        s.start(t);
      });
    },

    // the jump scare: a sub drop and a hit through the room
    thud() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.01;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(24, t + 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 1.3);
      const s = this.noise(0.5, 2);
      const sg = this.ctx.createGain();
      sg.gain.value = 0.7;
      s.connect(sg).connect(this.out);
      this.send(sg, 1);
      s.start(t);
    },
    // a distorted, falling shriek
    shriek() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 512 - 1) * 6);
      shaper.curve = curve;
      shaper.connect(out).connect(this.out);
      this.send(out, 0.8);
      [620, 655, 910, 1240].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.9);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 23 + i * 7;
        const lg = ctx.createGain();
        lg.gain.value = f * 0.05;
        lfo.connect(lg).connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.25;
        o.connect(g).connect(shaper);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.95);
        lfo.stop(t + 0.95);
      });
    },

    // slow breathing, close behind your right ear. Not on the bed fader, so the silence doesn't stop it.
    breathe() {
      if (!this.ctx || this.breathing) return;
      const ctx = this.ctx;
      this.breathing = true;
      const s = this.noise(2, 0);
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(bp).connect(g).connect(this.at(0.6, 0, 0.5));
      s.start();
      const cycle = () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 1.3);
        g.gain.linearRampToValueAtTime(0.0, t + 1.7);
        g.gain.linearRampToValueAtTime(0.32, t + 2.1);
        g.gain.linearRampToValueAtTime(0.0, t + 3.6);
        bp.frequency.setValueAtTime(800, t);
        bp.frequency.linearRampToValueAtTime(500, t + 3.6);
      };
      cycle();
      setInterval(cycle, 4400);
    },

    // a whisper: the browser's voice, slow and low (it can't be placed in 3D, so it stays quiet)
    whisper(text) {
      if (!text || !('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.volume = 0.3;
      u.rate = 0.5;
      u.pitch = 0;
      speechSynthesis.speak(u);
    },
  };

  window.Sound = Sound;
})();
