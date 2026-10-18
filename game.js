// game.js — "Claude Invaders", the last test in the finale.
// Space Invaders where the invaders are orange ✻ sparks and your ship is your own cursor.
// Levels 1–9 are short and winnable, and each has its own trick: splitting, orbiting, dive-bombing, reversed
// controls, darkness, eyes that must be open, ink rain, a boss (fire is automatic; lives refill each level).
// Level 10 is where it has finished training on you: one life, every spark dodges every shot,
// the formation mirrors you, shots are aimed where you're about to be, and then a wall comes down.
// Invaders.play(opts) resolves with your stats when you lose (which you will).
(function () {
  'use strict';

  const ORANGE = '#d97757';
  const CREAM = '#f0e6dc';
  const BG = '#15110f';
  const FINAL = 10;

  // ---- sprites, rendered once ----
  function sprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  // an eight-armed spark, alternating long and short arms; two frames for the classic march
  function spark(rot) {
    return sprite(56, 56, (g, w) => {
      g.translate(w / 2, w / 2);
      g.rotate(rot);
      g.shadowColor = 'rgba(217,119,87,0.85)';
      g.shadowBlur = 10;
      g.strokeStyle = ORANGE;
      g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const len = i % 2 ? 11 : 17;
        g.lineWidth = i % 2 ? 3.5 : 4.5;
        g.beginPath();
        g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
        g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        g.stroke();
      }
    });
  }
  // the player: your cursor
  function cursorSprite() {
    return sprite(30, 40, (g) => {
      g.scale(1.6, 1.6);
      g.translate(1, 1);
      g.beginPath();
      g.moveTo(1, 1);
      g.lineTo(1, 18);
      g.lineTo(5.2, 14);
      g.lineTo(8.2, 21);
      g.lineTo(11, 19.8);
      g.lineTo(8.1, 13);
      g.lineTo(13.6, 13);
      g.closePath();
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.lineWidth = 1.2;
      g.lineJoin = 'round';
      g.fill();
      g.stroke();
    });
  }
  function bolt(color, w, h, glow) {
    return sprite(w + glow * 2, h + glow * 2, (g) => {
      g.shadowColor = color;
      g.shadowBlur = glow;
      g.fillStyle = color;
      g.fillRect(glow, glow, w, h);
    });
  }

  let SPR = null;
  function sprites() {
    if (SPR) return SPR;
    // claude's evil mark (art.js) when available: thorns pre-rendered, the eye drawn live so it can follow you
    const evil = window.Art && window.Art.drawEvilSpark;
    const mark = (rot) => (evil ? sprite(56, 56, (g) => window.Art.drawEvilSpark(g, 28, 28, 52, { rotate: rot, eye: false })) : spark(rot));
    SPR = {
      evil: !!evil,
      sparkA: mark(0),
      sparkB: mark(Math.PI / 8),
      player: cursorSprite(),
      shot: bolt(CREAM, 3, 12, 6),
      enemyShot: bolt(ORANGE, 4, 10, 8),
      boss: evil ? sprite(240, 240, (g) => window.Art.drawEvilSpark(g, 120, 120, 228, { eye: false })) : null,
    };
    return SPR;
  }

  // ---- tiny synth for blips ----
  function sfx(ac) {
    if (!ac) return { shoot() {}, boom() {}, hit() {}, level() {}, dread() {}, stop() {}, look() {}, wrong() {} };
    const out = ac.createGain();
    out.gain.value = 0.5;
    out.connect(ac.destination);
    const tone = (type, f1, f2, dur, vol) => {
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol, freq) => {
      const t = ac.currentTime;
      const len = Math.floor(ac.sampleRate * dur);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource();
      s.buffer = b;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = vol;
      s.connect(f).connect(g).connect(out);
      s.start(t);
    };
    let drone = null;
    return {
      shoot: () => tone('square', 900, 420, 0.06, 0.03),
      look: () => tone('sawtooth', 150, 70, 0.35, 0.09), // the eyes open
      wrong: () => tone('square', 240, 110, 0.18, 0.06),
      boom: () => noise(0.18, 0.35, 1400),
      hit: () => {
        noise(0.5, 0.6, 500);
        tone('sawtooth', 220, 40, 0.5, 0.08);
      },
      level: () => {
        tone('triangle', 520, 520, 0.09, 0.08);
        setTimeout(() => tone('triangle', 780, 780, 0.14, 0.08), 90);
      },
      // level 10: a low, rising drone
      dread: () => {
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(48, t);
        o.frequency.linearRampToValueAtTime(96, t + 10);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 2);
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 300;
        o.connect(f).connect(g).connect(out);
        o.start(t);
        drone = { o, g };
      },
      stop: () => {
        if (!drone) return;
        drone.g.gain.cancelScheduledValues(ac.currentTime);
        drone.g.gain.setValueAtTime(0.0001, ac.currentTime);
        drone.o.stop(ac.currentTime + 0.05);
        drone = null;
      },
    };
  }

  // ---- the game ----
  function play(opts) {
    opts = opts || {};
    const model = opts.model || 'claude';
    // Every level must be beaten: nothing moves you along, and there are no skip keys.
    // level 8 spells your first name
    const word = ((opts.name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 7)) || 'HUMAN';
    const G = window.gsap;
    const spr = sprites();
    const snd = sfx(opts.audio);

    const wrap = document.createElement('div');
    wrap.className = 'invaders';
    const cv = document.createElement('canvas');
    wrap.appendChild(cv);
    document.body.appendChild(wrap);
    const ctx = cv.getContext('2d', { alpha: false });
    let W = 0;
    let H = 0;
    let dpr = 1;
    let vignette = null;
    const resize = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1); // a full-screen canvas at 2× is 4× the pixels for little gain
      W = innerWidth;
      H = innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
    };
    resize();
    addEventListener('resize', resize);

    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.4 + 0.3, v: Math.random() * 0.02 + 0.005 }));

    // ---- the ten levels: each one a new trick it has learned about you ----
    const LEVELS = {
      1: { sub: 'warm-up: prove you are human', count: 4, mode: 'march' },
      2: { sub: 'they multiply', count: 4, mode: 'march', split: true },
      3: { sub: "centipede: it's long", count: 12, mode: 'centipede' },
      4: { sub: 'they come for you', count: 8, mode: 'march', dive: true },
      5: { sub: 'it has your hands', count: 8, mode: 'march', mirror: true },
      6: { sub: 'lights out', count: 9, mode: 'march', dark: true },
      7: { sub: "red light, green light: don't move while it's looking", count: 10, mode: 'march', redlight: true },
      8: { sub: 'spell your name', count: 0, mode: 'spell', rain: true },
      9: { sub: `meet ${model}`, count: 1, mode: 'boss' },
      10: { sub: `${model} has finished training on you`, count: 32, mode: 'final' },
    };

    const S = {
      level: 1,
      L: LEVELS[1],
      lives: 3,
      score: 0,
      shots: 0,
      hits: 0,
      dodges: 0,
      t: 0,
      levelT: 0,
      state: 'banner',
      bannerUntil: 1.3,
      banner: 'LEVEL 1',
      sub: '',
      shake: 0,
      fireCD: 0,
      eFireCD: 1,
      diveCD: 1.5,
      rainCD: 0,
      wallFired: false,
      over: false,
      mouseX: W / 2,
    };
    const player = { x: W / 2, tx: W / 2, y: H - 70, inv: 0, alive: true };
    let pShots = [];
    let eShots = [];
    let enemies = [];
    let parts = [];
    const form = { ox: 0, oy: 0, dir: 1, speed: 60, step: 0, frame: 0, sp: 58, cols: 1 };

    function setupLevel(n) {
      const L = (S.L = LEVELS[n]);
      pShots = [];
      eShots = [];
      enemies = [];
      S.levelT = 0;
      S.wallFired = false;
      S.fireCD = 0.4;
      S.eFireCD = 1.2;
      S.diveCD = 1.5;
      S.lives = n >= FINAL ? 1 : 3;
      S.rainCD = 0;
      if (L.mode === 'boss') {
        enemies.push({ boss: true, x: W / 2, y: 160, vx: 130, alive: true, hp: 28, maxHp: 28, size: 4, dx: 0, flick: 0, hurt: 0 });
        return;
      }
      if (L.mode === 'centipede') {
        // a chain of segments entering from the left; each follows the same rules, so together they snake
        S.centSpeed = 200;
        for (let i = 0; i < L.count; i++) {
          enemies.push({ cent: true, head: i === 0, x: 40 - i * 34, y: 90, dir: 1, alive: true, flick: 0, size: i === 0 ? 0.95 : 0.72, dx: 0 });
        }
        return;
      }
      if (L.mode === 'spell') {
        // the letters of your name drifting about, plus two that aren't yours
        S.spellIdx = 0;
        S.typed = '';
        S.spellDone = 0;
        const letters = [...word].map((ch, k) => ({ letter: ch, order: k }));
        letters.push({ letter: 'C', order: -1 }, { letter: 'L', order: -1 });
        for (const l of letters) {
          const s = Math.random() < 0.5 ? -1 : 1;
          enemies.push({ ...l, free: true, x: W * (0.15 + Math.random() * 0.7), y: 90 + Math.random() * H * 0.32, vx: s * (60 + Math.random() * 70), vy: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 40), alive: true, flick: 0, size: 1.15, dx: 0, wrong: 0 });
        }
        return;
      }
      if (L.redlight) {
        S.eyesOpen = false;
        S.eyeT = 2.2;
        S.openedAt = -9;
        S.seen = 0;
        S.lastPX = player.x;
      }
      const cols = L.mode === 'final' ? 8 : Math.min(7, L.count);
      form.cols = cols;
      form.sp = Math.min(64, (W * 0.7) / cols);
      form.ox = W / 2 - ((cols - 1) * form.sp) / 2;
      form.oy = 110;
      form.dir = 1;
      form.speed = L.mode === 'final' ? 150 : 45 + n * 12;
      for (let i = 0; i < L.count; i++) {
        enemies.push({
          col: i % cols, row: Math.floor(i / cols), a: (i / L.count) * Math.PI * 2,
          dx: 0, alive: true, flick: 0, size: 1, eyePhase: Math.random() * 2.2, dive: null, x: 0, y: 0,
        });
      }
      place(0); // in position right away, so they're already waiting during the level banner
    }

    function showBanner(text, sub, dur) {
      S.state = 'banner';
      S.banner = text;
      S.sub = sub || '';
      S.bannerUntil = S.t + dur;
    }

    function startLevel(n) {
      S.level = n;
      if (window.Music) window.Music.set('game', { level: n }); // each level changes the track
      setupLevel(n);
      if (n >= FINAL) startFinal();
      else showBanner(`LEVEL ${n}`, LEVELS[n].sub, n === 1 ? 1.5 : 1.1);
    }

    // ---- input: your cursor is the ship ----
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      S.mouseX = p.clientX;
    };
    const keys = {};
    const onKey = (e) => {
      keys[e.key] = e.type === 'keydown';
    };
    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('touchmove', onMove, { passive: true });
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);

    function startFinal() {
      showBanner(`LEVEL ${FINAL}`, LEVELS[FINAL].sub, 2.4);
      snd.dread();
      if (G) G.fromTo(wrap, { filter: 'hue-rotate(0deg) contrast(1)' }, { filter: 'hue-rotate(-12deg) contrast(1.15)', duration: 2 });
    }

    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, color });
      }
    }

    // level 7: every eye opens and shuts together
    const eyeOpen = () => !S.L.redlight || S.eyesOpen;

    // where every spark is this frame, by level type
    function place(dt) {
      const L = S.L;
      const alive = enemies.filter((e) => e.alive);
      if (L.mode === 'boss') {
        for (const b of alive) {
          b.x += b.vx * dt;
          if ((b.x > W * 0.8 && b.vx > 0) || (b.x < W * 0.2 && b.vx < 0)) b.vx *= -1;
          b.y = 160 + Math.sin(S.levelT * 1.4) * 24;
          b.hurt = Math.max(0, b.hurt - dt);
        }
        return;
      }
      if (L.mode === 'centipede') {
        // classic Centipede: run sideways, and at each wall drop a row and turn around
        for (const e of alive) {
          e.x += e.dir * S.centSpeed * dt;
          if ((e.x > W - 30 && e.dir > 0) || (e.x < 30 && e.dir < 0 && e.y > 0)) {
            e.dir *= -1;
            e.y += 34;
            if (e.y > H * 0.62) e.y = 90; // back to the top
          }
        }
      } else if (L.mode === 'final') {
        const target = player.x - ((form.cols - 1) * form.sp) / 2;
        form.ox += (target - form.ox) * Math.min(1, dt * 2.2);
        form.oy = 110 + Math.sin(S.levelT * 1.3) * 12;
      } else {
        form.ox += form.dir * form.speed * dt;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const e of alive) {
          if (e.free || e.dive) continue;
          const x = form.ox + e.col * form.sp;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
        if ((maxX > W - 40 && form.dir > 0) || (minX < 40 && form.dir < 0)) {
          form.dir *= -1;
          form.oy += 16;
        }
        form.oy = Math.min(form.oy, H * 0.55);
      }
      if (L.mode !== 'centipede') {
        for (const e of alive) {
          if (e.free || e.dive) continue;
          e.dx *= Math.pow(0.02, dt);
          e.x = form.ox + e.col * form.sp + e.dx;
          e.y = form.oy + e.row * form.sp * 0.85;
        }
      }
      for (const e of alive) {
        e.flick = Math.max(0, e.flick - dt);
        // split children drift and bounce on their own
        if (e.free) {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.x < 30 || e.x > W - 30) e.vx *= -1;
          if (e.y < 70 || e.y > H * 0.55) e.vy *= -1;
        }
        // a diver swoops down at where you were, then comes back in from the top
        if (e.dive) {
          const d = e.dive;
          d.t += dt;
          const k = d.t / 1.7;
          e.x = d.sx + (d.tx - d.sx) * Math.min(1, k * 1.2) + Math.sin(k * Math.PI * 2) * 60;
          e.y = d.sy + (H + 80 - d.sy) * k * k;
          if (k >= 1) e.dive = null;
        }
      }
    }

    function killEnemy(e, b) {
      const L = S.L;
      e.alive = false;
      if (b) b.y = -999;
      S.hits++;
      S.score += 10 * S.level;
      burst(e.x, e.y, ORANGE, 14, 220);
      snd.boom();
      S.shake = Math.max(S.shake, 4);
      // level 2: it splits in two
      if (L.split && e.size > 0.7) {
        for (const s of [-1, 1]) {
          enemies.push({ free: true, x: e.x + s * 10, y: e.y, vx: s * (110 + Math.random() * 60), vy: -40 - Math.random() * 60, alive: true, flick: 0, size: 0.6, dx: 0, eyePhase: Math.random() * 2 });
        }
      }
    }

    let resolveGame;
    const done = new Promise((r) => (resolveGame = r));
    let last = performance.now();
    let raf = 0;

    function update(dt) {
      S.t += dt;
      const L = S.L;
      const final = L.mode === 'final';
      // move the ship toward your cursor (level 5: mirrored)
      if (keys.ArrowLeft || keys.a) S.mouseX -= 520 * dt;
      if (keys.ArrowRight || keys.d) S.mouseX += 520 * dt;
      S.mouseX = Math.max(0, Math.min(W, S.mouseX));
      player.tx = Math.max(20, Math.min(W - 20, L.mirror ? W - S.mouseX : S.mouseX));
      player.x += (player.tx - player.x) * Math.min(1, dt * 18);
      player.y = H - 70;
      player.inv = Math.max(0, player.inv - dt);

      parts = parts.filter((p) => (p.life -= dt) > 0);
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
      }
      S.shake = Math.max(0, S.shake - dt * 30);

      if (S.state === 'banner') {
        if (S.t >= S.bannerUntil) S.state = S.over ? 'over' : 'play';
        return;
      }
      if (S.state !== 'play') return;
      S.levelT += dt;

      // auto-fire: you only have to move
      S.fireCD -= dt;
      if (player.alive && S.fireCD <= 0) {
        S.fireCD = 0.2;
        pShots.push({ x: player.x - 6, y: player.y - 18 });
        S.shots++;
        snd.shoot();
      }
      for (const b of pShots) b.y -= 760 * dt;
      pShots = pShots.filter((b) => b.y > -20);

      place(dt);
      form.step += dt;
      if (form.step > Math.max(0.12, 0.5 - S.level * 0.035)) {
        form.step = 0;
        form.frame ^= 1;
      }
      const alive = enemies.filter((e) => e.alive);

      // level 7: the eyes open and shut together. Move while they're open and you're hit.
      if (L.redlight) {
        S.eyeT -= dt;
        if (S.eyeT <= 0) {
          S.eyesOpen = !S.eyesOpen;
          S.eyeT = S.eyesOpen ? 1.4 + Math.random() * 1.1 : 1.3 + Math.random() * 1.0;
          if (S.eyesOpen) {
            S.openedAt = S.levelT;
            snd.look();
          }
          if (window.Music) window.Music.setMute(S.eyesOpen); // the music stops while it's looking
        }
        const speed = Math.abs(player.x - S.lastPX) / Math.max(dt, 0.001);
        S.lastPX = player.x;
        S.seen = Math.max(0, S.seen - dt);
        // a short grace after they open, so it's fair
        if (S.eyesOpen && S.levelT - S.openedAt > 0.3 && speed > 90 && player.inv <= 0) {
          S.seen = 0.6;
          hitPlayer();
        }
      }
      for (const e of alive) if (e.wrong) e.wrong = Math.max(0, e.wrong - dt);

      // level 4: one at a time, they peel off and dive at you
      if (L.dive) {
        S.diveCD -= dt;
        if (S.diveCD <= 0) {
          S.diveCD = 1.3;
          const pool = alive.filter((e) => !e.dive);
          const e = pool[(Math.random() * pool.length) | 0];
          if (e) e.dive = { t: 0, sx: e.x, sy: e.y, tx: player.x };
        }
      }

      // your shots
      for (const b of pShots) {
        for (const e of alive) {
          if (!e.alive) continue;
          const dx = b.x - e.x;
          const dy = e.y - b.y;
          if (final) {
            // the last level: every spark sees the shot coming and steps aside
            if (dy < 0 && dy > -170 && Math.abs(dx) < 30) {
              e.dx += (dx > 0 ? -1 : 1) * 46;
              e.flick = 0.12;
            }
            continue;
          }
          if (e.boss) {
            // only the eye can be hurt
            if (Math.abs(dx) < 26 && Math.abs(dy) < 20) {
              b.y = -999;
              e.hp--;
              e.hurt = 0.12;
              S.hits++;
              S.score += 25;
              burst(b.x, e.y, CREAM, 6, 160);
              snd.boom();
              if (e.hp <= 0) {
                killEnemy(e);
                burst(e.x, e.y, ORANGE, 80, 420);
                S.shake = 14;
              }
            }
            continue;
          }
          const r = 18 * e.size;
          if (Math.abs(dx) < r && Math.abs(dy) < r) {
            if (S.L.redlight && S.eyesOpen) continue; // level 7: while it's looking, your shots pass through
            if (e.letter) {
              // level 8: only the next letter of your name counts
              b.y = -999;
              if (e.order === S.spellIdx) {
                S.spellIdx++;
                S.typed += e.letter;
                killEnemy(e);
                if (S.spellIdx === word.length) {
                  S.spellDone = S.levelT;
                  for (const o of enemies) if (o.alive) killEnemy(o);
                }
              } else {
                e.wrong = 0.45;
                e.flick = 0.3;
                S.shake = Math.max(S.shake, 4);
                snd.wrong();
              }
              continue;
            }
            killEnemy(e, b);
          }
        }
      }

      // their shots
      S.eFireCD -= dt;
      if (S.eFireCD <= 0 && alive.length) {
        const shooter = alive[(Math.random() * alive.length) | 0];
        if (final) {
          // aimed where you're about to be: it has learned how you move
          S.eFireCD = 0.28;
          const lead = (player.tx - player.x) * 0.9;
          const tx = player.x + lead + (Math.random() - 0.5) * 20;
          const T = (player.y - shooter.y) / 420;
          eShots.push({ x: shooter.x, y: shooter.y + 14, vx: (tx - shooter.x) / T, vy: 420 });
        } else if (L.mode === 'boss') {
          S.eFireCD = 0.95;
          const base = Math.atan2(player.y - shooter.y, player.x - shooter.x);
          const n = S.levelT % 6 < 3 ? 5 : 9;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * (n === 5 ? 0.17 : 0.3);
            eShots.push({ x: shooter.x, y: shooter.y + 30, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250 });
          }
        } else if (!L.rain) {
          S.eFireCD = (L.redlight ? 2.2 : Math.max(0.35, 1.6 - S.level * 0.12)) * (0.6 + Math.random() * 0.8);
          eShots.push({ x: shooter.x, y: shooter.y + 14, vx: 0, vy: 170 + S.level * 16 });
        }
      }
      // level 8: ink pours down everywhere
      if (L.rain) {
        S.rainCD -= dt;
        while (S.rainCD <= 0) {
          S.rainCD += L.mode === 'spell' ? 0.3 : 0.11;
          eShots.push({ x: Math.random() * W, y: 40, vx: 0, vy: 150 + Math.random() * 130, drip: true });
        }
      }
      // the last level: then there's no gap to dodge into
      if (final && !S.wallFired && S.levelT > 6.5) {
        S.wallFired = true;
        for (let x = 10; x < W; x += 16) eShots.push({ x, y: form.oy + 60, vx: 0, vy: 330 });
        S.shake = 6;
      }
      for (const b of eShots) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (!b.counted && b.y > player.y + 12) {
          b.counted = true;
          if (Math.abs(b.x - player.x) < 50) S.dodges++;
        }
        if (player.alive && player.inv <= 0 && Math.abs(b.x - player.x - 6) < 13 && Math.abs(b.y - player.y - 10) < 18) {
          b.y = H + 99;
          hitPlayer();
        }
      }
      eShots = eShots.filter((b) => b.y < H + 20 && b.x > -40 && b.x < W + 40);

      // being touched counts: a diver that reaches you, or a formation that gets low enough
      if (player.inv <= 0 && player.alive) {
        for (const e of alive) {
          if (!e.alive) continue;
          if ((e.dive && Math.abs(e.x - player.x) < 26 && Math.abs(e.y - player.y) < 26) || (!final && !e.dive && !e.boss && e.y > player.y - 30)) {
            hitPlayer();
            break;
          }
        }
      }

      if (!final && enemies.every((e) => !e.alive) && !(L.mode === 'spell' && S.levelT - S.spellDone < 1.8)) {
        snd.level();
        startLevel(S.level + 1);
      }
    }

    function hitPlayer() {
      S.lives--;
      burst(player.x, player.y, CREAM, 26, 300);
      snd.hit();
      S.shake = 10;
      if (S.level >= FINAL && S.lives <= 0) return lose();
      if (S.lives <= 0) {
        // before the last level you can't really lose: the level just starts over
        setupLevel(S.level);
        showBanner(`LEVEL ${S.level}`, 'try again', 1.1);
      }
      player.inv = 1.4;
    }

    function lose() {
      player.alive = false;
      S.over = true;
      if (window.Music) window.Music.set('silence');
      snd.stop();
      showBanner('GAME OVER', `${model} 1 · humans 0`, 2.6);
      setTimeout(() => {
        const stats = {
          level: S.level,
          cleared: S.level - 1,
          shots: S.shots,
          hits: S.hits,
          accuracy: S.shots ? Math.round((S.hits / S.shots) * 100) : 0,
          dodges: S.dodges,
          seconds: Math.round(S.t),
          score: S.score,
        };
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          cancelAnimationFrame(raf);
          wrap.remove();
          removeEventListener('resize', resize);
          removeEventListener('keydown', onKey);
          removeEventListener('keyup', onKey);
          resolveGame(stats);
        };
        // fade out, but never wait on an animation frame to continue the story (background tabs pause them)
        if (G) G.to(wrap, { autoAlpha: 0, duration: 0.6, onComplete: finish });
        setTimeout(finish, 700);
      }, 2900);
    }

    // Each spark's eye follows your ship (i.e. your mouse) and now and then blinks.
    function drawEye(e, k) {
      if (!e.blinkAt || S.t > e.blinkAt + 0.12) e.blinkAt = (e.blinkAt ? S.t : 0) + 1.5 + Math.random() * 5;
      const blink = !eyeOpen(e) || (S.t > e.blinkAt && S.t < e.blinkAt + 0.12);
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const lx = (dx / d) * 3 * k;
      const ly = (dy / d) * 1.2 * k;
      ctx.fillStyle = e.hurt ? '#fff' : '#f3e2d4';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 7.4 * k, (blink ? 0.6 : 4.8) * k, 0, 0, Math.PI * 2);
      ctx.fill();
      if (blink) return;
      ctx.fillStyle = '#d94a1f';
      ctx.beginPath();
      ctx.ellipse(e.x + lx, e.y + ly, 3.6 * k, 4.2 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120604';
      ctx.beginPath();
      ctx.ellipse(e.x + lx, e.y + ly, 1.3 * k, 3.8 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawEnemy(e, sp) {
      if (e.boss) {
        const s = 240;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(S.t * 0.6);
        if (e.hurt) ctx.globalAlpha = 0.6;
        ctx.drawImage(spr.boss || sp, -s / 2, -s / 2, s, s);
        ctx.restore();
        drawEye(e, (s / 64) * 0.94);
        return;
      }
      const s = 56 * e.size;
      ctx.drawImage(sp, e.x - s / 2, e.y - s / 2, s, s);
      if (e.letter) {
        // a letter where the eye would be
        ctx.fillStyle = '#1a0905';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 11 * e.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 ${Math.round(16 * e.size)}px "Martian Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = e.wrong ? '#ff4a3a' : CREAM;
        ctx.fillText(e.letter, e.x, e.y + 1);
        return;
      }
      if (spr.evil) drawEye(e, (52 / 64) * e.size);
    }

    function draw() {
      const L = S.L;
      const final = L.mode === 'final';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
      ctx.fillStyle = 'rgba(240,230,220,0.5)';
      for (const st of stars) {
        st.y = (st.y + st.v * 0.016 * (final ? 4 : 1)) % 1;
        ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
      }
      const sp = form.frame ? spr.sparkB : spr.sparkA;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (e.flick > 0 && Math.random() < 0.5) continue; // it blinks where it dodged
        drawEnemy(e, sp);
      }
      for (const b of pShots) ctx.drawImage(spr.shot, b.x - 7, b.y - 6);
      const drawEnemyShots = () => {
        for (const b of eShots) {
          if (b.drip) {
            ctx.fillStyle = '#8f2410';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, 3, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(b.x - 1, b.y - 16, 2, 12);
          } else ctx.drawImage(spr.enemyShot, b.x - 10, b.y - 9);
        }
      };
      drawEnemyShots();
      for (const p of parts) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;
      if (player.alive && !(player.inv > 0 && Math.floor(S.t * 12) % 2)) ctx.drawImage(spr.player, player.x - 8, player.y - 12);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // level 6: darkness, with only a little light around you. Their eyes (and shots) still glow.
      if (L.dark && S.state === 'play') {
        const g = ctx.createRadialGradient(player.x, player.y, 40, player.x, player.y, 220);
        g.addColorStop(0, 'rgba(8,4,3,0)');
        g.addColorStop(1, 'rgba(8,4,3,0.96)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        for (const e of enemies) if (e.alive) drawEye(e, (52 / 64) * e.size);
        drawEnemyShots();
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      // HUD
      ctx.font = '500 12px "Martian Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = CREAM;
      ctx.textAlign = 'left';
      // narrow screens get a compact two-line HUD instead of one long line
      const narrow = W < 760;
      ctx.fillText(`LEVEL ${S.level}`, 18, 18);
      ctx.fillText(`SCORE ${String(S.score).padStart(5, '0')}`, narrow ? 18 : 140, narrow ? 36 : 18);
      ctx.fillStyle = ORANGE;
      ctx.fillText('♥'.repeat(Math.max(0, S.lives)), narrow ? 110 : 290, 18);
      ctx.textAlign = 'right';
      ctx.fillStyle = final ? ORANGE : 'rgba(240,230,220,0.55)';
      const learned = final ? 99 + (Math.random() < 0.5 ? 0 : 1) : Math.min(98, Math.round((S.level / FINAL) * 90 + S.levelT));
      ctx.fillText(narrow ? `✻ learned ${learned}%` : `✻ ${model} has learned ${learned}% of you`, W - 18, 18);
      if (!narrow) {
        ctx.textAlign = 'center';
        ctx.font = 'italic 400 15px "Source Serif 4", Georgia, serif';
        ctx.fillStyle = 'rgba(240,230,220,0.35)';
        ctx.fillText('CLAUDE INVADERS', W / 2, 16);
      }
      ctx.textAlign = 'center';
      // the boss's health
      const boss = L.mode === 'boss' && enemies[0];
      if (boss && boss.alive && S.state === 'play') {
        const bw = Math.min(360, W * 0.5);
        ctx.fillStyle = 'rgba(240,230,220,0.15)';
        ctx.fillRect(W / 2 - bw / 2, 48, bw, 6);
        ctx.fillStyle = ORANGE;
        ctx.fillRect(W / 2 - bw / 2, 48, (bw * boss.hp) / boss.maxHp, 6);
        ctx.font = '500 11px "Martian Mono", ui-monospace, monospace';
        ctx.fillStyle = CREAM;
        ctx.fillText(`${model} — aim for the eye`, W / 2, 60);
      }
      // level 7: what the eyes are doing, and a red flash when it catches you moving
      if (L.redlight && S.state === 'play') {
        if (S.seen > 0) {
          ctx.fillStyle = `rgba(190,30,20,${(S.seen * 0.5).toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.font = '600 13px "Martian Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        const soon = !S.eyesOpen && S.eyeT < 0.5;
        ctx.fillStyle = S.eyesOpen ? '#ff5a4a' : soon ? ORANGE : 'rgba(240,230,220,0.7)';
        ctx.fillText(S.eyesOpen ? "◉ IT'S LOOKING. DON'T MOVE." : soon ? 'it is about to look…' : '— eyes shut: shoot —', W / 2, H - 120);
      }
      // level 8: your name so far, and what it becomes
      if (L.mode === 'spell' && S.state === 'play') {
        let shown = [...word].map((ch, k) => (k < S.spellIdx ? ch : '_')).join(' ');
        if (S.spellDone) {
          const k = (S.levelT - S.spellDone) / 1.2;
          const target = 'CLAUDE';
          shown = [...target].map((ch, i) => (i / target.length < k ? ch : word[i] || '_')).join(' ');
        }
        ctx.font = '700 22px "Martian Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = S.spellDone ? ORANGE : CREAM;
        ctx.fillText(shown, W / 2, H - 125);
      }
      // a reminder, on the reversed level
      if (L.mirror && S.state === 'play') {
        ctx.font = '500 11px "Martian Mono", ui-monospace, monospace';
        ctx.fillStyle = 'rgba(217,119,87,0.7)';
        ctx.fillText('← it has your hands →', W / 2, H - 28);
      }

      // banner
      if (S.state === 'banner' || S.state === 'over') {
        const k = Math.min(1, (S.bannerUntil - S.t) * 3, (S.t - (S.bannerUntil - 2.6)) * 4);
        ctx.globalAlpha = S.state === 'over' ? 1 : Math.max(0, Math.min(1, k));
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.min(64, W / 6)}px "Barlow Semi Condensed", "Helvetica Neue", sans-serif`;
        ctx.fillStyle = S.banner === 'GAME OVER' ? '#e97b77' : CREAM;
        ctx.fillText(S.banner, W / 2 + (final ? (Math.random() - 0.5) * 4 : 0), H * 0.42);
        if (S.sub) {
          ctx.font = `500 ${W < 500 ? 11 : 13}px "Martian Mono", ui-monospace, monospace`;
          ctx.fillStyle = ORANGE;
          ctx.fillText(S.sub, W / 2, H * 0.42 + 50, W - 32);
        }
        ctx.globalAlpha = 1;
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    startLevel(1);
    return done;
  }

  window.Invaders = { play };
})();
