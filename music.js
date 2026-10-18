// music.js — the soundtrack. Composed and played live with Web Audio (no audio files).
// A lookahead scheduler fires 16th-note steps at the current tempo; each "scene" decides what plays on
// each step. Continuous layers (a string drone, a Shepard tone) fade in and out underneath.
//
//   lullaby   stages 1–2: a music-box lullaby in A minor + vinyl crackle; `warp` slowly detunes it
//   unease    stage 3: the lullaby slows and sags flat over a low dissonant string drone
//   pulse     stage 4: a dark synthwave bass ostinato; the music box only plays fragments
//   dread     stage 5: a ticking clock, the string cluster, and a Shepard tone that rises forever
//   game      the finale's game: chiptune horror; changes per level (see gameStep)
//   log       the training log: a low pulse
//   broken    the end screen: the lullaby backwards, slow and warped
//   takeover  the desktop takeover: the Shepard rises, bass pulses quicken; braam() hits on the melt
//   silence   nothing
// Music.start(Sound) hooks into sound.js's compressor and reverb.
(function () {
  'use strict';

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // the lullaby, in eighth notes (MIDI; null = rest). A minor, a little lopsided.
  const LULLABY = [
    69, 72, 76, 81, 79, 76, 72, 74, 76, 72, 69, 71, 72, null, 64, null,
    69, 72, 76, 81, 79, 76, 77, 76, 74, 71, 68, 71, 69, null, null, null,
  ];
  // synthwave bass, one note per 8th, two bars
  const BASS = [33, 33, 33, 33, 33, 33, 36, 36, 29, 29, 29, 29, 31, 31, 32, 32];
  // the game's arpeggio (A minor / F / G / E), one note per 16th, four bars of four
  const ARP = [
    57, 60, 64, 69, 57, 60, 64, 69, 53, 57, 60, 65, 53, 57, 60, 65,
    55, 59, 62, 67, 55, 59, 62, 67, 52, 56, 59, 64, 52, 56, 59, 68,
  ];

  // ---- the game's ten songs, one per level, built with Tone.js ----
  // Every level is a real song: a written melody over a chord progression, in two sections that alternate
  // every four bars (A, then B with a counter-melody), so it develops instead of looping. It follows the
  // battle too: lighter while claude talks and you choose (pad, bass, melody), full during attacks (drums
  // and arpeggios come in). Melodies are 8th notes, four bars per section: '-' is a rest, '|' a bar line.
  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const mel = (s) => s.split(/\s+/).filter((x) => x && x !== '|').map((x) => (x === '-' ? null : x));
  // 'Am' → [root, third, fifth] as MIDI numbers in the given octave
  function chord(name, oct) {
    const m = name.match(/^([A-G][#b]?)(m?)/);
    const root = 12 * (oct + 1) + NOTE[m[1]];
    return [root, root + (m[2] ? 3 : 4), root + 7];
  }

  const SONGS = {
    1: { // INVADERS: an A-minor march
      bpm: 112, len: 1.5,
      prog: [['Am', 'Am', 'F', 'E'], ['F', 'G', 'Am', 'E']],
      a: 'A4 - A4 C5 E5 - D5 C5 | B4 - G#4 - E4 - - - | A4 - A4 C5 E5 - G5 F5 | E5 - D5 - B4 - G#4 -',
      b: 'F5 - E5 D5 C5 - A4 - | G4 - B4 D5 G5 - F5 E5 | E5 - C5 A4 C5 - E5 - | G#4 - B4 - E5 - - -',
      make: (T, w) => ({
        lead: w(new T.Synth({ oscillator: { type: 'pulse', width: 0.25 }, envelope: { attack: 0.003, decay: 0.15, sustain: 0.3, release: 0.08 }, volume: -12 })),
        bass: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.05 }, volume: -14 })),
        arp: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -26 })),
        kick: w(new T.MembraneSynth({ volume: -8 })),
        snare: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.1, sustain: 0 }, volume: -20 })),
        hat: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -30 })),
      }),
      bass: (i, t, d, I, root, k, n) => i % 2 === 0 && I.bass.triggerAttackRelease(n(root + ((i >> 1) % 2 ? 12 : 0)), d * 1.2, t),
      drums: (i, t, d, I) => {
        if (i % 8 === 0) I.kick.triggerAttackRelease('C1', d, t);
        if (i % 8 === 4) I.snare.triggerAttackRelease(d, t);
        if (i % 2 === 0) I.hat.triggerAttackRelease(d * 0.3, t);
      },
    },
    2: { // ASTEROIDS: floating bell melody in E phrygian, echoing in space, over a heartbeat thump
      bpm: 120, len: 2.6,
      prog: [['Em', 'F', 'Em', 'F'], ['C', 'D', 'Em', 'F']],
      a: 'E5 - - B4 - - E5 F5 | E5 - - - - - - - | G5 - - F5 - - E5 D5 | E5 - - - B4 - - -',
      b: 'C5 - - E5 - - G5 - | A5 - G5 - F#5 - D5 - | E5 - - G5 - - B5 - | A5 - G5 - F5 - E5 -',
      make: (T, w) => {
        const echo = w(new T.FeedbackDelay(0.375, 0.42));
        return {
          lead: w(new T.FMSynth({ harmonicity: 3.01, modulationIndex: 7, envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.4 }, modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0 }, volume: -10 }), echo),
          bass: w(new T.MembraneSynth({ pitchDecay: 0.02, octaves: 2.5, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -6 })),
          arp: w(new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 }, volume: -22 }), echo),
          ping: w(new T.MetalSynth({ envelope: { attack: 0.001, decay: 0.3, release: 0.1 }, harmonicity: 5.1, modulationIndex: 16, resonance: 3000, octaves: 1.2, volume: -30 }), echo),
        };
      },
      bass: (i, t, d, I, root, k, n) => i % 4 === 0 && I.bass.triggerAttackRelease(n(root - 12 + ((i >> 2) % 2 ? 1 : 0)), d * 2, t),
      drums: (i, t, d, I) => i % 16 === 10 && I.ping.triggerAttackRelease('E6', d, t),
    },
    3: { // CENTIPEDE: a scuttling chromatic line in C# minor
      bpm: 146, len: 0.9,
      prog: [['C#m', 'C#m', 'A', 'G#'], ['F#m', 'A', 'G#', 'G#']],
      a: 'C#5 D5 C#5 G#4 C#5 D5 E5 D#5 | E5 - D#5 D5 C#5 - G#4 - | C#5 D5 C#5 G#4 E5 F#5 G#5 F#5 | E5 D#5 D5 C#5 C5 - C#5 -',
      b: 'F#5 - E5 - D#5 - C#5 - | E5 - D#5 - C#5 - B4 - | G#4 A4 C5 C#5 D#5 E5 F#5 G#5 | G#5 - F#5 - D#5 - C5 -',
      make: (T, w) => ({
        lead: w(new T.FMSynth({ harmonicity: 3, modulationIndex: 12, oscillator: { type: 'square' }, modulation: { type: 'square' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0.2, release: 0.05 }, volume: -18 })),
        bass: w(new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.1, sustain: 0.1, release: 0.04 }, volume: -14 })),
        arp: w(new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }, volume: -22 })),
        kick: w(new T.MembraneSynth({ volume: -10 })),
        hat: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.025, sustain: 0 }, volume: -28 })),
      }),
      bass: (i, t, d, I, root, k, n) => i % 2 === 0 && I.bass.triggerAttackRelease(n(root + (i % 8 === 6 ? 7 : 0)), d, t),
      drums: (i, t, d, I) => {
        if (i % 8 === 0) I.kick.triggerAttackRelease('C1', d, t);
        I.hat.triggerAttackRelease(d * 0.2, t, i % 2 ? 0.4 : 0.8);
      },
    },
    4: { // GALAGA: a heroic D-minor march with sliding leads and stabbed chords
      bpm: 136, len: 1.6, stabs: true,
      prog: [['Dm', 'Bb', 'C', 'A'], ['Gm', 'Dm', 'Bb', 'A']],
      a: 'D5 - F5 - A5 - G5 F5 | F5 - D5 - C5 - - - | E5 - G5 - C6 - A5 G5 | A5 - - - C#5 - E5 -',
      b: 'G5 - A5 Bb5 A5 - G5 - | F5 - E5 - D5 - A4 - | Bb4 - D5 - F5 - Bb5 - | A5 - G5 - E5 - C#5 -',
      make: (T, w) => ({
        lead: w(new T.Synth({ portamento: 0.06, oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.1 }, volume: -9 })),
        bass: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.03 }, volume: -14 })),
        pad: w(new T.PolySynth(T.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.04 }, volume: -22 })),
        snare: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -18 })),
        kick: w(new T.MembraneSynth({ volume: -9 })),
      }),
      bass: (i, t, d, I, root, k, n) => i % 4 === 0 && I.bass.triggerAttackRelease(n(root), d, t),
      drums: (i, t, d, I) => {
        if (i % 8 === 0) I.kick.triggerAttackRelease('C1', d, t);
        if (i % 8 === 4 || (i % 16 >= 13)) I.snare.triggerAttackRelease(d * 0.6, t, i % 16 >= 13 ? 0.5 : 1); // a little roll into each bar
      },
    },
    5: { // MIRROR: everything sounds played backwards: swelling attacks, cut-off ends, a falling melody
      bpm: 92, len: 3.4,
      prog: [['F#m', 'D', 'Bm', 'C#'], ['D', 'A', 'Bm', 'C#']],
      a: 'C#6 - B5 - A5 - - - | F#5 - - - - - - - | G5 - F#5 - E5 - - - | C#5 - - - - - - -',
      b: 'D5 - E5 - F#5 - - - | A5 - - - - - - - | B5 - A5 - F#5 - E5 - | C#5 - - - F#5 - - -',
      make: (T, w) => {
        const chorus = w(new T.Chorus(3, 3.5, 0.7).start());
        return {
          lead: w(new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.35, decay: 0.01, sustain: 1, release: 0.02 }, volume: -16 }), chorus),
          pad: w(new T.PolySynth(T.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 1.2, decay: 0.01, sustain: 1, release: 0.03 }, volume: -28 }), chorus),
          bass: w(new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.6, decay: 0.01, sustain: 1, release: 0.03 }, volume: -10 })),
          swell: w(new T.NoiseSynth({ envelope: { attack: 0.9, decay: 0.01, sustain: 0, release: 0.01 }, volume: -24 })),
          kick: w(new T.MembraneSynth({ volume: -12 })),
        };
      },
      bass: (i, t, d, I, root, k, n) => i % 16 === 0 && I.bass.triggerAttackRelease(n(root), d * 15, t),
      drums: (i, t, d, I) => {
        if (i % 16 === 7) I.swell.triggerAttackRelease(d * 9, t);
        if (i % 16 === 0) I.kick.triggerAttackRelease('C1', d, t);
      },
    },
    6: { // LIGHTS OUT: a slow music box in the dark, a heartbeat, wind
      bpm: 66, len: 4,
      prog: [['Dm', 'Dm', 'Bb', 'A'], ['Gm', 'Gm', 'Dm', 'A']],
      a: 'D5 - - - F5 - - - | A5 - - - - - - - | G5 - - - F5 - E5 - | D5 - - - - - - -',
      b: 'Bb4 - - - D5 - - - | G5 - - - - - F5 - | E5 - - - C#5 - - - | D5 - - - - - - -',
      make: (T, w) => {
        const filt = w(new T.AutoFilter(0.08, 300, 3).start());
        return {
          lead: w(new T.FMSynth({ harmonicity: 3.51, modulationIndex: 9, envelope: { attack: 0.002, decay: 2, sustain: 0, release: 0.5 }, modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0 }, volume: -10 })),
          bass: w(new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 1, decay: 0.1, sustain: 1, release: 1.5 }, volume: -16 })),
          heart: w(new T.MembraneSynth({ pitchDecay: 0.05, octaves: 2, envelope: { attack: 0.001, decay: 0.25, sustain: 0 }, volume: -3 })),
          wind: w(new T.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 2, decay: 0.1, sustain: 1, release: 2 }, volume: -16 }), filt),
        };
      },
      bass: (i, t, d, I, root, k, n) => {
        if (i % 16 === 0) I.bass.triggerAttackRelease(n(root), d * 15, t);
        if (i % 64 === 0) I.wind.triggerAttackRelease(d * 60, t);
      },
      drums: (i, t, d, I) => (i % 16 === 0 || i % 16 === 3) && I.heart.triggerAttackRelease(i % 16 ? 'B0' : 'C1', d, t),
    },
    7: { // RED LIGHT: a toy-piano playground song in G (it stops whenever the eye opens)
      bpm: 108, len: 1.8,
      prog: [['G', 'G', 'C', 'D'], ['Em', 'C', 'G', 'D']],
      a: 'G4 - E4 - A4 G4 E4 - | G4 - E4 - A4 G4 E4 - | D5 - D5 - B4 - G4 - | A4 - B4 - G4 - - -',
      b: 'B4 - B4 - A4 - G4 - | E5 - D5 - C5 - A4 - | G4 - E4 - A4 G4 E4 - | D4 - - - G4 - - -',
      make: (T, w) => ({
        lead: w(new T.FMSynth({ harmonicity: 8, modulationIndex: 2, envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.2 }, modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0 }, volume: -8 })),
        bass: w(new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.003, decay: 0.2, sustain: 0, release: 0.05 }, volume: -10 })),
        arp: w(new T.FMSynth({ harmonicity: 6, modulationIndex: 1.5, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }, volume: -22 })),
        clap: w(new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 }, volume: -16 })),
        kick: w(new T.MembraneSynth({ volume: -10 })),
      }),
      bass: (i, t, d, I, root, k, n) => i % 4 === 0 && I.bass.triggerAttackRelease(n(root + ((i >> 2) % 2 ? 7 : 0)), d * 2, t), // oom-pah
      drums: (i, t, d, I) => {
        if (i % 8 === 4) I.clap.triggerAttackRelease(d * 0.5, t);
        if (i % 8 === 0) I.kick.triggerAttackRelease('C1', d, t);
      },
    },
    8: { // SPELL: the lullaby, as a chiptune, with a typewriter
      bpm: 116, len: 1.5, aMidi: true,
      prog: [['Am', 'Am', 'F', 'E'], ['F', 'C', 'Dm', 'E']],
      b: 'E5 - D5 - C5 - B4 - | A4 - C5 - E5 - A5 - | G5 - E5 - C5 - D5 - | E5 - - - A4 - - -',
      make: (T, w) => ({
        lead: w(new T.Synth({ oscillator: { type: 'pulse', width: 0.3 }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.05 }, volume: -13 })),
        bass: w(new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.05 }, volume: -10 })),
        arp: w(new T.Synth({ oscillator: { type: 'pulse', width: 0.12 }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -26 })),
        key: w(new T.MetalSynth({ envelope: { attack: 0.001, decay: 0.04, release: 0.01 }, harmonicity: 3, modulationIndex: 8, resonance: 5000, volume: -30 })),
        kick: w(new T.MembraneSynth({ volume: -10 })),
        hat: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -30 })),
      }),
      bass: (i, t, d, I, root, k, n) => {
        if (i % 4 === 0) I.bass.triggerAttackRelease(n(root), d * 2, t);
        if (Math.random() < 0.15) I.key.triggerAttackRelease('C7', d * 0.2, t);
      },
      drums: (i, t, d, I) => {
        if (i % 8 === 0) I.kick.triggerAttackRelease('C1', d, t);
        if (i % 4 === 2) I.hat.triggerAttackRelease(d * 0.3, t);
      },
    },
    9: { // BOSS: an epic A harmonic minor theme, distorted lead, choir, big drums, braams
      bpm: 88, len: 2,
      prog: [['Am', 'F', 'Dm', 'E'], ['Am', 'G', 'F', 'E']],
      a: 'A4 - - C5 E5 - - A5 | G#5 - - - F5 - E5 - | D5 - - F5 A5 - - D6 | C6 - B5 - G#5 - E5 -',
      b: 'A5 - G#5 - A5 - E5 - | D5 - - - C5 - B4 - | C5 - D5 - E5 - F5 - | G#5 - - - B5 - E6 -',
      make: (T, w) => {
        const dist = w(new T.Distortion(0.6));
        return {
          lead: w(new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 }, volume: -18 }), dist),
          pad: w(new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 30 }, envelope: { attack: 0.8, decay: 0.2, sustain: 0.8, release: 1.2 }, volume: -24 })),
          bass: w(new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.08 }, volume: -16 }), dist),
          arp: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }, volume: -26 })),
          tom: w(new T.MembraneSynth({ octaves: 4, envelope: { attack: 0.001, decay: 0.5, sustain: 0 }, volume: -3 })),
          snare: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -16 })),
        };
      },
      bass: (i, t, d, I, root, k, n) => i % 2 === 0 && I.bass.triggerAttackRelease(n(root + (i % 8 === 6 ? 12 : 0)), d * 1.4, t),
      drums: (i, t, d, I) => {
        if (i % 8 === 0) I.tom.triggerAttackRelease('A0', d * 3, t);
        if (i % 8 === 4) I.snare.triggerAttackRelease(d, t);
        if (i % 16 === 14) I.tom.triggerAttackRelease('E1', d, t, 0.6);
      },
      braam: true,
    },
    10: { // THE END: the first level's march again, crushed, detuned, far too fast
      bpm: 168, len: 1, crushed: true,
      prog: [['Am', 'Am', 'F', 'E'], ['F', 'G', 'Am', 'E']],
      a: 'A4 - A4 C5 E5 - D5 C5 | B4 - G#4 - E4 - - - | A4 - A4 C5 E5 - G5 F5 | E5 - D5 - B4 - G#4 -',
      b: 'F5 - E5 D5 C5 - A4 - | G4 - B4 D5 G5 - F5 E5 | E5 - C5 A4 C5 - E5 - | G#4 - B4 - E5 - - -',
      make: (T, w) => {
        const crush = w(new T.BitCrusher(3));
        return {
          lead: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.03 }, volume: -14 }), crush),
          bass: w(new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.03 }, volume: -12 })),
          arp: w(new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 }, volume: -24 }), crush),
          kick: w(new T.MembraneSynth({ volume: -5 })),
          snare: w(new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.08, sustain: 0 }, volume: -16 })),
        };
      },
      bass: (i, t, d, I, root, k, n) => I.bass.triggerAttackRelease(n(root + (i % 2 ? 12 : 0)), d * 0.8, t),
      drums: (i, t, d, I) => {
        if (i % 4 === 0) I.kick.triggerAttackRelease('C1', d, t);
        if (i % 8 === 4) I.snare.triggerAttackRelease(d, t);
      },
    },
  };

  function buildSong(level, T, out, braam, music) {
    const S = SONGS[level] || SONGS[1];
    const nodes = [];
    const w = (x, dest) => {
      nodes.push(x);
      x.connect(dest || out);
      return x;
    };
    const I = S.make(T, w);
    const n = (m) => T.Frequency(m, 'midi').toNote();
    const A = S.aMidi ? LULLABY.map((m) => (m ? n(m) : null)) : mel(S.a);
    const B = mel(S.b);
    const song = {
      bpm: S.bpm,
      step(i, t, d) {
        const k = music.intensity; // 0 = talking / choosing, 1 = under attack
        const bar = (i / 16) | 0;
        const sec = ((bar / 4) | 0) % 2; // A for four bars, then B for four
        const ch = chord(S.prog[sec][bar % 4], 3);
        // the melody
        if (i % 2 === 0) {
          const note = (sec ? B : A)[((i / 2) | 0) % 32];
          if (note) {
            if (S.crushed) I.lead.detune.setValueAtTime((Math.random() - 0.5) * 140, t);
            I.lead.triggerAttackRelease(note, d * S.len, t, k ? 0.95 : 0.65);
          }
        }
        // bass and anything tied to it
        S.bass(i, t, d, I, ch[0] - 12, k, n);
        // chords: sustained pads, or stabs on every beat (level 4)
        if (I.pad) {
          if (S.stabs && i % 4 === 0) I.pad.triggerAttackRelease(ch.map(n), d * 0.8, t, 0.6);
          else if (!S.stabs && i % 16 === 0) I.pad.triggerAttackRelease(ch.map(n), d * 15.5, t, k ? 0.5 : 0.7);
        }
        // a counter-melody arpeggio: in the B section, and always during attacks
        if (I.arp && (sec || k) && i % 2 === 1) I.arp.triggerAttackRelease(n(ch[(i >> 1) % 3] + 12), d * 0.8, t, 0.5);
        // drums only when it attacks
        if (k && S.drums) S.drums(i, t, d, I);
        if (S.braam && i % 128 === 0 && k) braam(t, 0.7);
      },
    };
    // let the last notes ring out, then free everything
    song.dispose = () => setTimeout(() => nodes.forEach((x) => { try { x.dispose(); } catch (e) { /* already gone */ } }), 1500);
    return song;
  }

  const Music = {
    ctx: null,
    scene: 'silence',
    step: 0,
    bpm: 76,
    warp: 0,
    level: 1,
    mute: false,
    intensity: 0,

    start(sound) {
      if (this.ctx || !sound || !sound.ctx) return;
      const ctx = (this.ctx = sound.ctx);
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.55;
      this.bus.connect(sound.out);
      const send = ctx.createGain();
      send.gain.value = 0.55;
      this.bus.connect(send).connect(sound.verb);
      // the mute gate (red light: the music stops while it's looking)
      this.gate = ctx.createGain();
      this.gate.connect(this.bus);
      // Tone.js (if it loaded) runs on this same context, so its instruments share our mix and reverb
      if (window.Tone) {
        try {
          window.Tone.setContext(ctx);
          this.T = window.Tone;
        } catch (e) {
          console.warn('Tone.js unavailable, using the built-in game track:', e);
        }
      }
      this.nextT = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
      this.startCrackle();
    },

    // schedule every step that falls inside the next 150 ms
    tick() {
      const ctx = this.ctx;
      if (!ctx) return;
      if (this.nextT < ctx.currentTime - 0.2) this.nextT = ctx.currentTime + 0.05; // after a background-tab stall
      while (this.nextT < ctx.currentTime + 0.15) {
        try {
          this.play(this.step, this.nextT);
        } catch (e) {
          // a dropped note is never worth stopping the score
        }
        this.nextT += 60 / this.bpm / 4;
        this.step++;
      }
    },

    // switch scenes: tempo, continuous layers, crackle
    set(scene, opts) {
      if (!this.ctx) return;
      opts = opts || {};
      const prev = this.scene;
      this.scene = scene;
      if (opts.warp != null) this.warp = opts.warp;
      if (opts.level != null) this.level = opts.level;
      const bpm = {
        lullaby: 76, unease: 56, pulse: 96, dread: 70, log: 90, broken: 48, takeover: 100,
        game: 124 + Math.min(9, this.level) * 5,
      }[scene];
      if (bpm) this.bpm = bpm;
      if (scene !== prev || scene === 'game') this.step = 0;
      // each game level loads its own track; leaving the game frees it
      if (scene === 'game') this.loadSong(this.level);
      else if (this.song) {
        this.song.dispose();
        this.song = null;
      }
      this.setMute(false);
      const t = this.ctx.currentTime;
      // layers
      this.pad(['unease', 'dread', 'log', 'broken'].includes(scene) || (scene === 'game' && this.level >= FINAL_LEVEL));
      this.shepard(scene === 'dread' || scene === 'takeover' || (scene === 'game' && this.level >= FINAL_LEVEL), scene === 'takeover' ? 7 : 12);
      this.crackleGain.gain.setTargetAtTime(['lullaby', 'unease', 'broken'].includes(scene) ? 0.07 : 0, t, 0.4);
      if (scene === 'silence') {
        this.bus.gain.cancelScheduledValues(t);
        this.bus.gain.setValueAtTime(0.0001, t);
      } else {
        this.bus.gain.cancelScheduledValues(t);
        this.bus.gain.setTargetAtTime(0.55, t, 0.15);
      }
    },

    // the battle tells the score how intense to be: 0 while talking/choosing, 1 under attack
    setIntensity(k) {
      this.intensity = k ? 1 : 0;
    },

    setMute(on) {
      if (!this.ctx || this.mute === on) return;
      this.mute = on;
      const t = this.ctx.currentTime;
      this.gate.gain.cancelScheduledValues(t);
      this.gate.gain.setTargetAtTime(on ? 0 : 1, t, on ? 0.01 : 0.08);
    },

    // ---- what plays on each step ----
    play(step, t) {
      const s = this.scene;
      if (s === 'silence') return;
      const eighth = step % 2 === 0;
      const i8 = (step / 2) | 0;
      if (s === 'lullaby' || s === 'unease') {
        if (!eighth) return;
        const note = LULLABY[i8 % LULLABY.length];
        if (note == null) return;
        if (Math.random() < this.warp * 0.2) return; // a missing note
        const sag = s === 'unease' ? -35 - (i8 % 64) * 1.2 : 0; // it goes flat as it plays
        const det = sag + (Math.random() - 0.5) * this.warp * 60;
        this.bell(mtof(note), t, 0.13, 1.8, det);
        if (i8 % 8 === 0) this.bell(mtof(note - 24), t, 0.06, 2.5, det); // a low note on the bar
      } else if (s === 'pulse') {
        if (eighth) this.bass(mtof(BASS[i8 % BASS.length]), t, 0.2, 0.22);
        if (step % 16 === 8) this.hat(t, 0.05);
        if (step % 8 === 4 && Math.random() < 0.6) {
          const note = LULLABY[(i8 * 3) % LULLABY.length];
          if (note) this.bell(mtof(note), t, 0.07, 2.2, (Math.random() - 0.5) * 70);
        }
      } else if (s === 'dread') {
        if (step % 4 === 0) this.click(t, step % 8 === 0 ? 2100 : 1600); // the clock
        if (step % 64 === 0) this.boom(t);
      } else if (s === 'log') {
        if (step % 4 === 0) this.bass(mtof(33), t, 0.12, 0.3);
        if (step % 2 === 1 && Math.random() < 0.3) this.click(t, 3200, 0.03); // keys
      } else if (s === 'broken') {
        if (!eighth) return;
        // the lullaby, backwards, slow, falling apart
        const note = LULLABY[LULLABY.length - 1 - (i8 % LULLABY.length)];
        if (note == null || Math.random() < 0.3) return;
        this.bell(mtof(note - 12), t, 0.1, 3, -60 + (Math.random() - 0.5) * 90);
      } else if (s === 'takeover') {
        // bass pulses that quicken
        const every = step < 64 ? 4 : step < 128 ? 2 : 1;
        if (step % every === 0) this.bass(mtof(33), t, 0.16, 0.15);
        if (step % 16 === 0) this.hat(t, 0.08);
      } else if (s === 'game') {
        if (this.song) this.song.step(step, t, 60 / this.bpm / 4);
        else this.gameStep(step, t);
      }
    },

    loadSong(level) {
      if (this.song) this.song.dispose();
      this.song = null;
      if (!this.T) return; // no Tone.js: gameStep's built-in track plays instead
      try {
        this.song = buildSong(level, this.T, this.gate, (t, v) => this.braam(t, v), this);
        this.bpm = this.song.bpm;
      } catch (e) {
        console.warn('Level track failed, using the built-in one:', e);
        this.song = null;
      }
    },

    gameStep(step, t) {
      const L = this.level;
      const beat = step % 4 === 0;
      const final = L >= FINAL_LEVEL;
      if (L === 6) {
        // lights out: just a heartbeat kick and the bass
        if (step % 8 === 0 || step % 8 === 3) this.kick(t, 0.5);
        if (step % 2 === 0) this.bass(mtof(BASS[(step / 2) % BASS.length]), t, 0.18, 0.18);
        return;
      }
      if (beat) this.kick(t, final ? 0.75 : 0.55);
      if (step % 4 === 2) this.hat(t, 0.06);
      if (step % 2 === 0) this.bass(mtof(BASS[(step / 2) % BASS.length] + (final ? 0.3 : 0)), t, 0.17, 0.16);
      if (L === 8) {
        // spelling your name: the lullaby, as a chiptune
        if (step % 2 === 0) {
          const note = LULLABY[(step / 2) % LULLABY.length];
          if (note) this.square(mtof(note), t, 0.05, 0.12, 0);
        }
        return;
      }
      const det = final ? (Math.random() - 0.5) * 80 : 0;
      this.square(mtof(ARP[step % ARP.length] + (L >= 5 ? 12 : 0)), t, final ? 0.06 : 0.045, 0.08, det);
      if (L === 9 && step % 32 === 0) this.braam(t, 0.6); // the boss
    },

    // ---- instruments ----
    // music box / bell: FM, a metallic partial that dies away fast
    bell(f, t, vol, dur, detune) {
      const ctx = this.ctx;
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const mg = ctx.createGain();
      const amp = ctx.createGain();
      car.frequency.value = f;
      car.detune.value = detune || 0;
      mod.frequency.value = f * 3.51;
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
      mod.connect(mg).connect(car.frequency);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      car.connect(amp).connect(this.gate);
      car.start(t);
      mod.start(t);
      car.stop(t + dur + 0.05);
      mod.stop(t + dur + 0.05);
    },
    // synth bass: saw + square through a closing low-pass
    bass(f, t, vol, dur) {
      const ctx = this.ctx;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + dur);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(amp).connect(this.gate);
      ['sawtooth', 'square'].forEach((type, k) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = k ? -7 : 7;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    },
    // chiptune lead
    square(f, t, vol, dur, detune) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const amp = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      o.detune.value = detune || 0;
      amp.gain.setValueAtTime(vol, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(amp).connect(this.gate);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    kick(t, vol) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const amp = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      amp.gain.setValueAtTime(vol, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(amp).connect(this.gate);
      o.start(t);
      o.stop(t + 0.3);
    },
    hat(t, vol) {
      const s = this.noise(0.04);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const amp = this.ctx.createGain();
      amp.gain.value = vol;
      s.connect(hp).connect(amp).connect(this.gate);
      s.start(t);
    },
    click(t, f, vol = 0.07) {
      const o = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      amp.gain.setValueAtTime(vol, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(amp).connect(this.gate);
      o.start(t);
      o.stop(t + 0.04);
    },
    boom(t) {
      const o = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 1.5);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(amp).connect(this.gate);
      o.start(t);
      o.stop(t + 2.3);
    },
    // the big brass-like hit: detuned saws, driven, a filter that blooms and closes
    braam(t, vol = 1) {
      const ctx = this.ctx;
      t = t || ctx.currentTime + 0.01;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 512 - 1) * 3);
      shaper.curve = curve;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(150, t);
      lp.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
      lp.frequency.exponentialRampToValueAtTime(160, t + 3.2);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.06);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      shaper.connect(lp).connect(amp).connect(this.bus);
      [55, 55.5, 54.6, 82.4, 27.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 4 ? 'sine' : 'sawtooth';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 4 ? 0.8 : 0.35;
        o.connect(g).connect(shaper);
        o.start(t);
        o.stop(t + 3.7);
      });
    },

    // ---- continuous layers ----
    // a low dissonant string cluster: A, B-flat and E, detuned saws through a moving filter
    pad(on) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      if (on && !this.padNode) {
        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(0.07, t + 3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 0.09;
        lg.gain.value = 260;
        lfo.connect(lg).connect(lp.frequency);
        lfo.start();
        lp.connect(out).connect(this.bus);
        const oscs = [lfo];
        [45, 46, 52, 57].forEach((m) => {
          [-9, 9].forEach((d) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = mtof(m);
            o.detune.value = d;
            o.connect(lp);
            o.start();
            oscs.push(o);
          });
        });
        this.padNode = { out, oscs };
      } else if (!on && this.padNode) {
        const p = this.padNode;
        this.padNode = null;
        p.out.gain.cancelScheduledValues(t);
        p.out.gain.setTargetAtTime(0.0001, t, 0.4);
        p.oscs.forEach((o) => o.stop(t + 2));
      }
    },

    // the Shepard tone: six sine octaves gliding up forever, the top fading out as the bottom fades in
    shepard(on, period = 12) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      if (on && !this.shep) {
        const N = 6;
        const base = 55;
        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(0.09, t + 3);
        out.connect(this.bus);
        const voices = Array.from({ length: N }, () => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          g.gain.value = 0;
          o.connect(g).connect(out);
          o.start();
          return { o, g };
        });
        const shep = { out, voices, k: 0, period, timer: null };
        const lvl = (p) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, p))), 2) * 0.5;
        const cycle = (t0) => {
          voices.forEach((v, i) => {
            const idx = (i + shep.k) % N;
            const f0 = base * Math.pow(2, idx);
            v.o.frequency.setValueAtTime(f0, t0);
            v.o.frequency.exponentialRampToValueAtTime(f0 * 2, t0 + shep.period);
            v.g.gain.setValueAtTime(lvl(idx / N), t0);
            v.g.gain.linearRampToValueAtTime(lvl((idx + 1) / N), t0 + shep.period);
          });
          shep.k = (shep.k + N - 1) % N; // each voice drops back an octave as the cycle wraps
          shep.next = t0 + shep.period;
          shep.timer = setTimeout(() => this.shep === shep && cycle(shep.next), (shep.period - 0.5) * 1000);
        };
        this.shep = shep;
        cycle(t + 0.05);
      } else if (on && this.shep) {
        this.shep.period = period;
      } else if (!on && this.shep) {
        const s = this.shep;
        this.shep = null;
        clearTimeout(s.timer);
        s.out.gain.cancelScheduledValues(t);
        s.out.gain.setTargetAtTime(0.0001, t, 0.3);
        s.voices.forEach((v) => v.o.stop(t + 2));
      }
    },

    // vinyl crackle under the lullaby
    startCrackle() {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 4;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        if (Math.random() < 0.0009) d[i] = (Math.random() * 2 - 1) * 0.9; // pops
        else d[i] = (Math.random() * 2 - 1) * 0.015; // hiss
      }
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      bp.Q.value = 0.5;
      this.crackleGain = ctx.createGain();
      this.crackleGain.gain.value = 0;
      s.connect(bp).connect(this.crackleGain).connect(this.bus);
      s.start();
    },

    noise(dur) {
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource();
      s.buffer = b;
      return s;
    },

    // one music-box note, for after everything stops
    lastNote() {
      if (!this.ctx) return;
      this.bell(mtof(69), this.ctx.currentTime + 0.05, 0.16, 4, -40);
    },
  };

  const FINAL_LEVEL = 10;
  window.Music = Music;
})();
