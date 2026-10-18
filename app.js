// app.js — the CAPTCHA that never lets you pass.
// Stages: 1 traffic lights · 2 empty rooms · 3 "it is watching" · 4 photos taken right now
//         5 webcam · 6 finale ("You are not human." … then it verifies the other one)
// Presenter keys (not while typing): Shift+N = skip to next stage, Shift+R = restart.
// URL: ?stage=3 starts at that stage.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  // ?demo runs every scripted pause at 60% (and shortens the game's levels) for judging in a hurry
  const DEMO = new URLSearchParams(location.search).has('demo');
  // ?short is the quick cut: CAPTCHA stages 1, 3 and 5, pauses at 45%, and four game steps (runner, maze, wall, end)
  const SHORT = new URLSearchParams(location.search).has('short');
  const PACE = SHORT ? 0.45 : DEMO ? 0.6 : 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * PACE));
  const lerp = (a, b, t) => a + (b - a) * t;

  const el = {
    name: $('name'), cb: $('cb'), cbLabel: $('cbLabel'), cont: $('continue'), card: $('card'), done: $('done'),
    veil: $('veil'), ch: $('challenge'), pre: $('chPre'), key: $('chKey'), post: $('chPost'),
    grid: $('grid'), audio: $('audioPanel'), camGate: $('camGate'), screenGate: $('screenGate'), loading: $('chLoading'), msg: $('chMsg'),
    reload: $('btnReload'), audioBtn: $('btnAudio'), info: $('btnInfo'), verify: $('btnVerify'), infoBox: $('chInfo'),
    icoAudio: $('icoAudio'), icoImage: $('icoImage'), play: $('btnPlay'), cam: $('btnCam'), cursor: $('fakeCursor'),
    train: $('chTrain'), log: $('trainLog'),
  };
  // the name you typed, minus anything that could be read as HTML when it's echoed back into the page
  const nameValue = () => el.name.value.replace(/[<>&"`]/g, '').trim();
  const SPARK = (n = 14) => Art.evilSparkSVG(n, { glow: n > 20 }); // claude's mark
  const G = window.gsap; // animation library (optional: everything degrades to plain timing without it)
  if (G) document.body.classList.add('gsap');
  if (G) G.registerPlugin(...[window.ScrambleTextPlugin, window.CustomEase, window.CustomWiggle].filter(Boolean));

  const BASE_TITLE = document.title;
  // what takes your place in the finale
  const MODEL_NAME = 'claude';
  Art.loadAssets('assets'); // the creature photos; drawn stand-ins are used until they arrive
  Art.loadScenes('assets'); // real photos for stages 1, 2 and 4; same fallback
  const startAt = Math.min(5, Math.max(1, parseInt(new URLSearchParams(location.search).get('stage'), 10) || 1));

  const S = {
    stage: 0,        // 0 = not started
    attempt: 0,      // verifies in this round
    rl: 0,           // reloads in this round
    fails: 0,        // total failures — drives the decaying error text
    spins: 0,        // checkbox clicks — each spin takes longer
    open: false,
    busy: false,
    mode: 'image',
    tiles: [],
    selected: new Set(),
    src: null,
    first: '',
    leftAt: 0,
    cam: null,
    camSrc: null,
    camBuf: [],
    frame: 0,
    // the figure in the webcam: (x, y) = top of its head as a fraction of the frame; jumps to t* during a flicker
    // starts peeking in from the right edge of the frame
    ghost: { x: 0.86, y: 0.07, scale: 2.6, alpha: 0, tx: 0.86, ty: 0.07, ts: 2.6, target: 0,
      mouth: 0.15, tm: 0.15, tilt: 0.4, next: 0, shake: 0, hand: 0, th: 0 },
    flash: false,    // next redraw shows the figure for a moment
    snapshot: null,
  };

  // "Please try again." slowly stops trying.
  const DECAY = ['Please try again.', 'Please try again.', 'I apologize. Please try again.', "I'm sorry, please try again", 'please', "I can't help with that.", 'please.', '✻'];

  // ---- time ----
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function parts(d) {
    const h = d.getHours();
    return { h12: h % 12 || 12, mm: String(d.getMinutes()).padStart(2, '0'), ap: h < 12 ? 'AM' : 'PM' };
  }
  function clock(d) {
    const p = parts(d);
    return `${p.h12}:${p.mm} ${p.ap}`;
  }
  function stampFor(d) {
    const p = parts(d);
    return [`${p.ap} ${p.h12}:${p.mm}`, `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`];
  }

  // all audio lives in sound.js
  const Sound = window.Sound;
  const LEVELS = { 1: 0, 2: 0.025, 3: 0.05, 4: 0.075, 5: 0.1 };

  // ---- the cursor that isn't yours (from stage 3) ----
  const Cursor = {
    x: -100, y: -100, ox: 0, oy: 0, tx: 0, ty: 0, on: false, puppet: false,
    enable() {
      if (this.on) return;
      this.on = true;
      document.body.classList.add('possessed');
      el.cursor.hidden = false;
      const tick = () => {
        this.ox += (this.tx - this.ox) * 0.25;
        this.oy += (this.ty - this.oy) * 0.25;
        this.tx *= 0.93;
        this.ty *= 0.93;
        el.cursor.style.transform = `translate(${this.x + this.ox - 1}px, ${this.y + this.oy - 1}px)`;
        requestAnimationFrame(tick);
      };
      tick();
      const drift = () => {
        this.tx = (Math.random() - 0.5) * 12;
        this.ty = (Math.random() - 0.5) * 12;
        setTimeout(drift, 2500 + Math.random() * 4500);
      };
      setTimeout(drift, 2000);
    },
    follow(e) {
      if (!this.puppet) {
        this.x = e.clientX;
        this.y = e.clientY;
      }
    },
    glideTo(target, dur = 1600) {
      this.enable();
      this.puppet = true;
      const r = target.getBoundingClientRect();
      const ex = r.left + r.width * 0.5;
      const ey = r.top + r.height * 0.55;
      const sx = this.x < 0 ? innerWidth * 0.7 : this.x;
      const sy = this.y < 0 ? innerHeight * 0.8 : this.y;
      if (G) {
        // a slight arc and a small overshoot onto the target, like a hand that knows where it's going
        const o = { k: 0 };
        const arc = (Math.random() < 0.5 ? -1 : 1) * Math.min(80, Math.hypot(ex - sx, ey - sy) * 0.15);
        return new Promise((res) =>
          G.to(o, {
            k: 1, duration: dur / 1000, ease: 'back.inOut(0.8)',
            onUpdate: () => {
              const k = o.k;
              this.x = lerp(sx, ex, k) + Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * arc;
              this.y = lerp(sy, ey, k);
            },
            onComplete: res,
          })
        );
      }
      const t0 = performance.now();
      return new Promise((res) => {
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          this.x = lerp(sx, ex, e);
          this.y = lerp(sy, ey, e);
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      });
    },
    async press(target) {
      el.cursor.classList.add('press');
      target.classList.add('press');
      await sleep(140);
      el.cursor.classList.remove('press');
      target.classList.remove('press');
    },
  };
  document.addEventListener('mousemove', (e) => Cursor.follow(e));

  // ---- popup plumbing ----
  function setHeader([pre, key, post]) {
    el.pre.textContent = pre;
    el.key.textContent = key;
    el.post.textContent = post;
  }
  function fail(text) {
    if (text == null) text = DECAY[Math.min(S.fails, DECAY.length - 1)];
    S.fails++;
    el.msg.className = 'ch-msg';
    el.msg.textContent = text;
    fit();
  }
  function note(text) {
    el.msg.className = 'ch-msg note';
    el.msg.textContent = text;
    fit();
  }
  function updateVerify() {
    if (S.stage === 5) {
      el.verify.textContent = 'Verify';
      el.verify.disabled = !S.cam || S.screenPending;
    } else {
      el.verify.textContent = S.selected.size || S.mode === 'audio' ? 'Verify' : 'Skip';
      el.verify.disabled = false;
    }
  }

  function buildGrid(n, px) {
    el.grid.innerHTML = '';
    el.grid.className = G ? 'grid js-anim' : 'grid';
    el.grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    S.tiles = [];
    S.selected.clear();
    for (let i = 0; i < n * n; i++) {
      const t = document.createElement('div');
      t.className = 'tile';
      const c = document.createElement('canvas');
      c.width = c.height = px;
      t.appendChild(c);
      // selection pieces: a highlight frame (live video), a ripple, and the blue check badge
      const hl = document.createElement('i');
      hl.className = 'hl';
      const ripple = document.createElement('i');
      ripple.className = 'ripple';
      const check = document.createElement('i');
      check.className = 'check';
      t.append(hl, ripple, check);
      t.addEventListener('click', () => toggle(i));
      el.grid.appendChild(t);
      S.tiles.push({ el: t, canvas: c, ctx: c.getContext('2d'), hl, ripple, check });
    }
    updateVerify();
  }
  // Cut one image into the grid the way reCAPTCHA does: the image spans the whole grid and the
  // white gaps cover thin strips of it, so lines and faces stay continuous across squares.
  function sliceOne(src, n, i) {
    const t = S.tiles[i];
    const gridPx = el.grid.offsetWidth;
    const tilePx = t.el.offsetWidth;
    const k = gridPx ? src.width / gridPx : 0;
    const col = i % n;
    const row = Math.floor(i / n);
    if (k && tilePx) {
      const pitch = (gridPx - tilePx) / (n - 1); // tile + gap
      t.ctx.drawImage(src, col * pitch * k, row * pitch * k, tilePx * k, tilePx * k, 0, 0, t.canvas.width, t.canvas.height);
    } else {
      const step = src.width / n;
      t.ctx.drawImage(src, col * step, row * step, step, step, 0, 0, t.canvas.width, t.canvas.height);
    }
  }
  function sliceInto(src, n) {
    S.tiles.forEach((_, i) => sliceOne(src, n, i));
  }
  function clearSel() {
    S.selected.forEach((i) => animateSel(S.tiles[i], false));
    S.selected.clear();
    S.tiles.forEach((t) => t.el.classList.remove('sel'));
    updateVerify();
  }

  // Selecting a square: the picture eases down, the check pops in with a little overshoot,
  // and a ring pulses out. Deselecting springs the picture back. Live-video squares don't
  // shrink (it would break the picture); they get an animated frame instead.
  function animateSel(t, on) {
    if (!G) return;
    const live = el.grid.classList.contains('live');
    G.killTweensOf([t.canvas, t.check, t.hl]);
    if (on) {
      if (!live) G.to(t.canvas, { scale: 0.8, duration: 0.3, ease: 'power3.out' });
      else G.fromTo(t.hl, { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 0.28, ease: 'power3.out' });
      G.fromTo(t.check, { autoAlpha: 1, scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: 0.42, ease: 'back.out(2.6)' });
      G.fromTo(t.ripple, { autoAlpha: 0.5, scale: 0.35 }, { autoAlpha: 0, scale: 1.25, duration: 0.55, ease: 'power2.out' });
    } else {
      if (!live) G.to(t.canvas, { scale: 1, duration: 0.38, ease: 'back.out(1.7)' });
      else G.to(t.hl, { autoAlpha: 0, duration: 0.18, ease: 'power1.in' });
      G.to(t.check, { scale: 0, autoAlpha: 0, duration: 0.16, ease: 'power2.in' });
    }
  }

  function toggle(i) {
    if (S.busy || S.mode !== 'image') return;
    if (S.stage === 5 && !S.cam) return;
    if (S.selected.has(i)) S.selected.delete(i);
    else S.selected.add(i);
    S.tiles[i].el.classList.toggle('sel', S.selected.has(i));
    animateSel(S.tiles[i], S.selected.has(i));
    Sound.click();
    if (R[S.stage].onSelect) R[S.stage].onSelect(i);
    updateVerify();
  }

  async function loading(ms) {
    el.loading.hidden = false;
    await sleep(ms);
    el.loading.hidden = true;
  }

  // Fade the tiles out, redraw the round while nothing is visible (so any drawing cost is hidden),
  // and let renderRound's ripple fade the new ones in.
  async function swapTiles() {
    const canvases = S.tiles.map((t) => t.canvas);
    // the timeout matters: GSAP runs on animation frames, which stop while the tab is hidden, and a tween
    // that never completes would leave the round busy (Verify dead) for good
    if (G) await new Promise((r) => {
      G.to(canvases, { opacity: 0, duration: 0.28, ease: 'power1.in', stagger: { each: 0.015, from: 'random' }, onComplete: r });
      setTimeout(r, 700);
    });
    else await sleep(280);
    renderRound();
    await sleep(380);
  }

  function renderRound() {
    S.mode = 'image';
    el.audio.hidden = true;
    el.camGate.hidden = true;
    el.screenGate.hidden = true;
    el.grid.style.visibility = '';
    el.icoAudio.hidden = false;
    el.icoImage.hidden = true;
    el.infoBox.hidden = true;
    setHeader(R[S.stage].header());
    R[S.stage].render();
    updateVerify();
    // tiles fade in in a quick ripple, like the real thing loading images
    if (G && S.stage !== 5) G.fromTo(S.tiles.map((t) => t.canvas), { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: { each: 0.025, from: 'random' }, ease: 'power1.out', clearProps: 'opacity' });
  }

  async function nextRound(msg) {
    await sleep(500);
    Sound.whoosh();
    await loading((600 + S.stage * 200) * PACE);
    S.stage += SHORT && (S.stage === 1 || S.stage === 3) ? 2 : 1; // the short cut skips stages 2 and 4
    S.attempt = 0;
    S.rl = 0;
    applyStage();
    renderRound();
    if (msg) note(msg);
  }

  function applyStage() {
    document.body.dataset.stage = S.stage;
    if (LEVELS[S.stage] != null) Sound.level(LEVELS[S.stage], S.stage);
    // the score follows the stage: a lullaby that goes wrong, then a pulse, then dread
    const MUSIC = { 1: ['lullaby', { warp: 0 }], 2: ['lullaby', { warp: 0.35 }], 3: ['unease', { warp: 0.6 }], 4: ['pulse', { warp: 0.8 }], 5: ['dread'] };
    if (window.Music && MUSIC[S.stage]) Music.set(...MUSIC[S.stage]);
    if (S.stage >= 3) Cursor.enable();
    if (S.stage >= 4) startLabelFlicker();
    VHS.set({ 1: 0, 2: 0.03, 3: 0.08, 4: 0.12, 5: 0.16 }[S.stage] || 0);
    Train.render();
  }

  // ---- the training data it's collecting on you ----
  // It has been counting from the first click; the counter only becomes visible in stage 3.
  const Train = {
    pct: 0,
    shown: 0,
    add(n) {
      this.pct = Math.min(99, this.pct + n);
      this.render();
    },
    render() {
      if (S.stage < 3) return;
      const show = (v) => {
        this.shown = v;
        el.train.innerHTML = `${SPARK(13)} learning: ${Math.round(v)}%`;
      };
      if (!G) return show(this.pct);
      const o = { v: this.shown };
      G.to(o, { v: this.pct, duration: 1.4, ease: 'power2.out', onUpdate: () => show(o.v) });
    },
    // while it puts itself together on screen
    generating() {
      if (S.stage < 3) return;
      el.train.innerHTML = `${SPARK(13)} generating human…`;
      clearTimeout(this.t);
      this.t = setTimeout(() => this.render(), 900);
    },
  };

  // ---- camcorder overlay: grain + a rolling tracking band, heavier each stage ----
  const VHS = (() => {
    // Grain is pure CSS: one speckle tile as a background on an oversized layer that a steps() animation
    // jumps around. It's composited on the GPU; no JavaScript runs per frame.
    const c = $('vhs');
    const band = $('vhsBand');
    c.style.backgroundImage = `url(${Art.speckle(256, 256).toDataURL()})`;
    // moved with transform (GPU), not `top` (which would re-layout the page every frame)
    if (G) G.fromTo(band, { y: () => -0.2 * innerHeight }, { y: () => 1.1 * innerHeight, duration: 4.5, ease: 'none', repeat: -1, repeatDelay: 2.5 });
    return {
      set(l) {
        c.classList.toggle('on', l > 0); // the grain animation only runs while it's visible
        const o = Math.min(1, l * 1.6); // speckle grain sits on top with normal blending, so keep it light
        if (G) {
          G.to(c, { opacity: o, duration: 3 });
          G.to(band, { opacity: Math.min(1, l * 5), duration: 3 });
        } else c.style.opacity = o;
      },
    };
  })();

  // Every evil-spark logo on the page watches your mouse, and blinks now and then.
  // One rAF-throttled pass per mouse move; only a handful of logos exist at once.
  (() => {
    let mx = innerWidth / 2;
    let my = innerHeight / 2;
    let queued = false;
    const look = () => {
      queued = false;
      document.querySelectorAll('svg.evil-spark').forEach((svg) => {
        const iris = svg.querySelector('.iris');
        if (!iris) return;
        const r = svg.getBoundingClientRect();
        if (!r.width) return;
        const dx = mx - (r.left + r.width / 2);
        const dy = my - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 60); // centred when you're right on top of it
        iris.setAttribute('transform', `translate(${((dx / d) * 3.2 * k).toFixed(2)} ${((dy / d) * 1.1 * k).toFixed(2)})`);
      });
    };
    addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(look);
      }
    });
    // blink: squash the eye shut for a moment, on one logo at a time
    setInterval(() => {
      const all = document.querySelectorAll('svg.evil-spark');
      if (!all.length) return;
      const svg = all[(Math.random() * all.length) | 0];
      const sclera = svg.querySelector('.sclera');
      const iris = svg.querySelector('.iris');
      if (!sclera || !iris) return;
      sclera.setAttribute('ry', '0.6');
      iris.style.visibility = 'hidden';
      setTimeout(() => {
        sclera.setAttribute('ry', '4.8');
        iris.style.visibility = '';
      }, 130);
    }, 2200);
  })();

  // the tab icon becomes its eye
  function setFavicon() {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(Art.evilSparkSVG(64, { glow: false }));
  }

  // A short burst of video-tear on any element: jitter, skew, RGB-split text, sliced clipping.
  function glitchEl(node, ms = 300) {
    if (!G) return;
    const R = G.utils.random;
    const tl = G.timeline({ onComplete: () => G.set(node, { clearProps: 'x,skewX,textShadow,clipPath,filter' }) });
    for (let i = 0; i < Math.round(ms / 45); i++) {
      tl.set(node, {
        x: R(-6, 6), skewX: R(-18, 18),
        textShadow: `${R(-4, 4)}px 0 rgba(255,0,60,.85), ${R(-4, 4)}px 0 rgba(0,220,255,.85)`,
        clipPath: `inset(${R(0, 45)}% 0 ${R(0, 35)}% 0)`,
        filter: `hue-rotate(${R(0, 360)}deg)`,
      }, i * 0.045);
    }
  }

  let flickT = null;
  function startLabelFlicker() {
    if (flickT) return;
    flickT = setInterval(() => {
      if (S.stage >= 6) return;
      el.cbLabel.textContent = Math.random() < 0.5 ? "I'm not alone" : "I'm claude";
      glitchEl(el.cbLabel, 220);
      setTimeout(() => {
        if (S.stage < 6) el.cbLabel.textContent = "I'm not a robot";
      }, 220);
    }, 6500);
  }

  // ---- the rounds ----
  const R = {};

  R[1] = {
    header: () => ['Select all squares with', 'traffic lights', 'If there are none, click skip'],
    help: 'Select each image that contains the object described in the text. Then click Verify. To get a new challenge, click the reload icon.',
    render() {
      buildGrid(4, 200);
      const src = Art.makeCanvas(800, 800);
      const street = Art.scenes.street;
      // an ordinary street: nothing wrong yet. Cropped square around the traffic light.
      if (street) Art.photoTile(src.getContext('2d'), 800, 800, street, { crop: [250, 0, 533, 533], filter: 'saturate(0.85) contrast(1.05)', vig: 0.2, grain: 8 });
      else Art.street(src.getContext('2d'), 800, 800);
      sliceInto(src, 4);
    },
    async verify() {
      if (!S.selected.size) {
        fail();
        return swapTiles();
      }
      Train.add(3);
      await nextRound('One more.');
    },
  };

  R[2] = {
    header: () => ['Select all images with', 'a person', S.attempt + S.rl ? 'Look again' : 'If there are none, click skip'],
    help: 'Select each image that contains a person. We are still learning what people look like.',
    render() {
      buildGrid(3, 256);
      const kinds = ['hall', 'room', 'bedroom', 'office', 'hall', 'room', 'bedroom', 'hall', 'office'];
      const opened = [4, 0, 8].slice(0, Math.min(3, S.attempt + S.rl));
      // the corridor sits in the centre, where the figure shows up
      const ROOM_OF_TILE = [0, 1, 2, 5, 3, 4, 6, 7, 8];
      // where someone stands in each photo, when they appear: [x, feet y, height] as fractions of the tile
      const SPOT = { 4: [0.5, 0.64, 0.2], 0: [0.62, 0.76, 0.3], 8: [0.8, 0.74, 0.42] };
      const draw = (i, figure) => {
        const photo = Art.scenes.rooms[ROOM_OF_TILE[i]];
        if (!photo) {
          Art.room(S.tiles[i].ctx, 256, 256, {
            seed: 900 + i * 31, kind: kinds[i], openDoor: opened.includes(i), watcher: i === 4 && S.rl >= 2,
            figure: figure ? { u: 0.5, s: 0.6 } : null,
          });
          return;
        }
        // empty, liminal, a little drained. Someone appears in the rooms you were told were empty.
        Art.photoTile(S.tiles[i].ctx, 256, 256, photo, {
          filter: 'saturate(0.7) contrast(1.06) brightness(0.95) sepia(0.12)', vig: 0.5, grain: 14,
          draw: (ctx, w, h) => {
            const spot = SPOT[i];
            const shadow = Art.assets.shadow;
            if (!spot || !shadow || !(opened.includes(i) || figure)) return;
            const fh = h * spot[2] * (figure ? 2.4 : 1);
            const fw = fh * (shadow.width / shadow.height);
            ctx.globalAlpha = figure ? 0.95 : 0.85;
            ctx.drawImage(shadow, w * spot[0] - fw / 2, h * spot[1] - fh * (figure ? 0.75 : 1), fw, fh);
            ctx.globalAlpha = 1;
            if (i === 4 && S.rl >= 2) Art.eyes(ctx, w * spot[0], h * spot[1] - fh * 0.86, fw * 0.12, Math.max(1, fw * 0.025));
          },
        });
      };
      S.tiles.forEach((_, i) => draw(i, false));
      // for a fraction of a second after the redraw, someone is standing in the hallway
      if (S.flash) {
        S.flash = false;
        draw(4, true);
        const t = S.tiles[4];
        Art.glitch(t.ctx, 0, 0, 256, 256, 0.5);
        setTimeout(() => S.stage === 2 && Art.glitch(t.ctx, 0, 0, 256, 256, 0.8), 110);
        setTimeout(() => S.stage === 2 && draw(4, false), 220);
      }
    },
    async verify() {
      S.attempt++;
      Train.add(6);
      if (S.attempt === 1) {
        fail('Please try again. You missed one.');
        S.flash = true;
        return swapTiles();
      }
      fail();
      await nextRound();
    },
  };

  R[3] = {
    header: () => ['Select all squares where', 'it is watching', S.attempt ? "If there are none, don't move" : 'If there are none, click skip'],
    help: 'It is only looking. Looking is how it learns.',
    render() {
      buildGrid(3, 256);
      const src = Art.makeCanvas(768, 768);
      Art.darkRoom(src.getContext('2d'), 768, 768, { step: Math.min(3, S.attempt + S.rl) });
      S.src = src;
      if (S.flash) {
        // one frame of it right up against the lens, then back where it was
        S.flash = false;
        const near = Art.makeCanvas(768, 768);
        Art.darkRoom(near.getContext('2d'), 768, 768, { step: 4 });
        sliceInto(near, 3);
        S.tiles.forEach((t) => Art.glitch(t.ctx, 0, 0, 256, 256, 0.6));
        setTimeout(() => S.stage === 3 && sliceInto(src, 3), 180);
      } else sliceInto(src, 3);
      // hovering a tile makes it dim, as if something in it moved
      S.tiles.forEach((t) => {
        let timer = null;
        t.el.addEventListener('mouseenter', () => {
          clearTimeout(timer);
          timer = setTimeout(() => t.el.classList.add('dim'), 450);
        });
        t.el.addEventListener('mouseleave', () => {
          clearTimeout(timer);
          timer = setTimeout(() => t.el.classList.remove('dim'), 1100);
        });
      });
    },
    // every click, a pair of eyes blinks in some other square
    onSelect(i) {
      let j = Math.floor(Math.random() * 8);
      if (j >= i) j++;
      const t = S.tiles[j];
      const w = t.canvas.width;
      // its eye opens in another square, looking at the one you clicked
      const look = Math.max(-1, Math.min(1, ((i % 3) - (j % 3)) * 0.8));
      Art.drawEvilSpark(t.ctx, w * lerp(0.3, 0.7, Math.random()), w * lerp(0.3, 0.6, Math.random()), w * 0.22, { look, rotate: Math.random() * 6 });
      setTimeout(() => S.stage === 3 && S.src && sliceOne(S.src, 3, j), 160);
    },
    async verify() {
      S.attempt++;
      Train.add(9);
      fail();
      if (S.attempt >= 2) return nextRound();
      S.flash = true;
      await swapTiles();
    },
  };

  const MINE = { 6: 1, 1: 1.7, 5: 2.7 }; // tile → zoom; the three photos of you
  R[4] = {
    header: () => ['Select all images taken at', clock(new Date()), S.attempt ? "If there are none, don't turn around" : 'If there are none, click skip'],
    help: 'Images are collected automatically and used for training.',
    render() {
      buildGrid(3, 256);
      const now = new Date();
      const kinds = ['room', 'hall', 'bedroom', 'office'];
      S.tiles.forEach((t, i) => {
        const you = Art.scenes.you;
        if (MINE[i] && you[0] && you[1]) {
          // photos of you from behind, each one closer to the back of your head
          const img = MINE[i] === 1.7 ? you[1] : you[0];
          const focus = MINE[i] === 1.7 ? [0.42, 0.32] : [0.56, 0.34];
          Art.photoTile(t.ctx, 256, 256, img, {
            zoom: MINE[i], fx: focus[0], fy: focus[1], filter: 'brightness(1.15) contrast(1.1) saturate(0.5)', vig: 0.6, grain: 26, stamp: stampFor(now),
            draw: (ctx, w, h) => {
              // in the widest shot, its face in the dark corner
              if (MINE[i] === 1 && Art.assets.peek) Art.peekFace(ctx, w * 0.14, h * 0.02, h * 0.1, { alpha: 0.5, light: 0.55 });
            },
          });
          Art.drawEvilSpark(t.ctx, 26, 26, 30, { glow: false });
          t.ctx.font = 'bold 15px "Courier New", monospace';
          t.ctx.fillStyle = '#ff7a4a';
          t.ctx.fillText('● REC', 44, 31);
        } else if (MINE[i]) {
          Art.behindYou(t.ctx, 256, 256, { zoom: MINE[i], stamp: stampFor(now), lurker: MINE[i] === 1 });
          // recorded on its camera
          Art.drawEvilSpark(t.ctx, 26, 26, 30, { glow: false });
          t.ctx.font = 'bold 15px "Courier New", monospace';
          t.ctx.fillStyle = '#ff7a4a';
          t.ctx.fillText('● REC', 44, 31);
        }
        else {
          const then = new Date(now - (1.3 + i * 3.7) * 3600e3 - i * 7 * 60e3);
          const night = Art.scenes.nights[[0, 2, 3, 4, 7, 8].indexOf(i)];
          // other nights, other rooms: dark stills brightened into a greenish CCTV look
          if (night) Art.photoTile(t.ctx, 256, 256, night, { filter: 'brightness(1.75) contrast(1.15) saturate(0.3)', tint: 'rgba(70,130,80,0.10)', vig: 0.65, grain: 30, stamp: stampFor(then) });
          else Art.room(t.ctx, 256, 256, { seed: 300 + i * 13, kind: kinds[i % 4], light: 32, dark: 0.35, night: true, stamp: stampFor(then) });
        }
      });
      if (!S.knocked) {
        S.knocked = true;
        setTimeout(() => Sound.knock(), 3500);
        setTimeout(() => Train.add(12), 1200);
        setTimeout(() => S.stage === 4 && Sound.whisper(S.first), 11000);
      }
    },
    async verify() {
      S.attempt++;
      const right = S.selected.size === 3 && Object.keys(MINE).every((i) => S.selected.has(+i));
      Train.add(right ? 10 : 5);
      if (right) return nextRound(S.first ? `Thank you, ${S.first}.` : 'Thank you.');
      fail(S.attempt === 1 ? "You're absolutely right. Those were taken just now." : undefined);
      if (S.attempt >= 2) return nextRound();
      await swapTiles();
    },
  };

  R[5] = {
    header: () =>
      S.screenPending
        ? ['Screen required', 'to finish verifying', 'Choose “Entire screen” when asked']
        : S.cam
        ? ['Select all squares with', S.attempt >= 2 ? 'the other person' : 'a person', S.attempt ? 'Training data: 1 human. Collecting…' : 'Click verify once there are none left']
        : ['Camera required', 'to confirm humanity', 'Your camera is only used to verify that you are human'],
    help: 'Hold still. Do not turn around.',
    render() {
      buildGrid(3, 64);
      el.grid.classList.add('live'); // live video: mark selections in place instead of shrinking squares
      // One canvas behind nine see-through squares (whose white edges cover the gaps, like reCAPTCHA's
      // grid lines): one draw per camera frame instead of nine.
      const feed = document.createElement('canvas');
      feed.className = 'live-feed';
      feed.width = feed.height = CAM;
      el.grid.prepend(feed);
      S.liveFeed = feed.getContext('2d', { alpha: false });
      S.liveFeed.fillStyle = '#000';
      S.liveFeed.fillRect(0, 0, CAM, CAM);
      if (!S.cam) el.camGate.hidden = false;
      else if (S.screenPending) el.screenGate.hidden = false;
    },
    async verify() {
      if (!S.cam || S.screenPending) return;
      S.attempt++;
      const g = S.ghost;
      if (S.attempt === 1) {
        fail('Incorrect. Select all squares with a person.');
        setHeader(R[5].header());
        Train.add(9);
        g.target = 0.6;
        g.tm = 0.35;
        Warp.target = 0.45;
        Sound.breathe();
        setTimeout(() => S.stage === 5 && Sound.whisper(`${S.first || ''}. I'm ${MODEL_NAME}.`), 7000);
        return clearSel();
      }
      if (S.selected.size === 1 && S.selected.has(ghostTile())) {
        note('Thank you.');
        return finale();
      }
      if (S.attempt === 2) {
        fail("You're absolutely right. Incorrect.");
        Train.add(9);
        // it steps in, over your shoulder
        g.tx = 0.16;
        g.ty = 0.08;
        g.ts = 2.9;
        g.target = 0.85;
        g.tm = 0.65;
        Warp.target = 0.75;
        setHeader(R[5].header());
        Sound.knock(0.6, 0.6);
        return clearSel();
      }
      fail('');
      await finale();
    },
  };

  // ---- webcam ----
  const CAM = 480;
  async function allowCamera() {
    el.camGate.hidden = true;
    S.camSrc = Art.makeCanvas(CAM, CAM);
    S.camSrc.getContext('2d', { alpha: false }); // opaque: cheaper to composite
    S.camBuf = Array.from({ length: 36 }, () => Art.makeCanvas(CAM, CAM)); // ~1.2 s of delay at 30 fps
    S.noise = [Art.noise(CAM, CAM), Art.noise(CAM, CAM), Art.noise(CAM, CAM)];
    let msg = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera api');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      await v.play();
      S.cam = { video: v, stream };
      Warp.initGL();
      // start loading face tracking now; the warp fades in once it's ready
      Warp.load();
      Warp.target = 0.15;
      setFavicon();
      Train.add(18); // a face
    } catch (e) {
      // no camera: fall back to a picture of "you" from behind
      const fake = Art.makeCanvas(CAM, CAM);
      Art.behindYou(fake.getContext('2d'), CAM, CAM, { zoom: 1.15 });
      S.cam = { fake };
      msg = 'Camera unavailable. Using the other camera.';
    }
    // then it wants your screen too, but only ever once: a frame captured earlier in this browser
    // session (a previous run) is reused, and the share step is skipped
    const saved = loadSavedDesktop();
    if (saved) saved.then((c) => (S.desktop = S.desktop || c));
    S.screenPending = !saved && !S.screenTried;
    el.screenGate.hidden = !S.screenPending;
    setHeader(R[5].header());
    updateVerify();
    if (msg) note(msg);
    scheduleCam();
  }

  // One still frame of your desktop, for the ending. Sharing stops the moment the frame is taken.
  // Built so it can't hang: every wait has a timeout, sharing is always stopped (even on errors), a frame
  // with no pixels is rejected, and if anything fails the ending uses a drawn stand-in desktop instead.
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

  async function grabFrame(stream) {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no video track');
    // straight from the track where the browser supports it (Chrome, Edge)
    if (window.ImageCapture) {
      try {
        const bmp = await within(new ImageCapture(track).grabFrame(), 2500);
        if (bmp.width && bmp.height) {
          const c = Art.makeCanvas(bmp.width, bmp.height);
          c.getContext('2d').drawImage(bmp, 0, 0);
          if (bmp.close) bmp.close();
          return c;
        }
      } catch (e) {
        // fall through to the video element
      }
    }
    // otherwise play it in a hidden video element and copy a frame
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    v.style.cssText = 'position:fixed;left:-10000px;top:0;width:4px;height:4px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    try {
      await within(v.play(), 2500);
      await within(new Promise((r) => {
        const ready = () => v.videoWidth > 0 && v.readyState >= 2;
        if (ready()) return r();
        const check = () => (ready() ? r() : setTimeout(check, 50));
        check();
      }), 2500);
      await new Promise((r) => setTimeout(r, 120)); // let the first real frame land
      const c = Art.makeCanvas(v.videoWidth, v.videoHeight);
      c.getContext('2d').drawImage(v, 0, 0);
      return c;
    } finally {
      v.srcObject = null;
      v.remove();
    }
  }

  // The captured frame is kept for the rest of this browser session, so later runs (Shift+R, or a reload
  // for the next person) don't ask again. Stored only in this browser, as a compressed JPEG.
  const DESKTOP_KEY = 'not-a-robot.desktop';
  function saveDesktop(frame) {
    try {
      const k = Math.min(1, 1600 / frame.width);
      const c = Art.makeCanvas(Math.round(frame.width * k), Math.round(frame.height * k));
      c.getContext('2d').drawImage(frame, 0, 0, c.width, c.height);
      sessionStorage.setItem(DESKTOP_KEY, c.toDataURL('image/jpeg', 0.72));
    } catch (e) {
      // storage full or blocked: it'll just ask again next run
    }
  }
  function loadSavedDesktop() {
    let url = null;
    try {
      url = sessionStorage.getItem(DESKTOP_KEY);
    } catch (e) {
      return null;
    }
    if (!url) return null;
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = Art.makeCanvas(img.width, img.height);
        c.getContext('2d').drawImage(img, 0, 0);
        res(c);
      };
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  async function shareScreen() {
    const btn = $('btnScreen');
    S.screenTried = true; // whatever happens, it never asks twice in one run
    if (btn.disabled) return; // a second click while the picker is open would start a second share
    btn.disabled = true;
    let stream = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('no screen capture api');
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const frame = await grabFrame(stream);
      if (!frame.width || !frame.height) throw new Error('empty frame');
      S.desktop = frame;
      saveDesktop(frame);
      Train.add(10); // a screen
    } catch (e) {
      console.warn('Screen capture skipped:', e && e.message);
      S.desktop = null; // declined, unsupported or failed: the ending draws a stand-in desktop
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      btn.disabled = false;
      S.screenPending = false;
      el.screenGate.hidden = true;
      setHeader(R[5].header());
      updateVerify();
      fit();
    }
  }

  // ---- the face scan: claude visibly tracking you, wherever the camera is on ----
  const MESH = [
    ['brow', 'cheekR'], ['cheekR', 'chin'], ['chin', 'cheekL'], ['cheekL', 'brow'],
    ['eyeROut', 'eyeRIn'], ['eyeLOut', 'eyeLIn'], ['eyeRIn', 'eyeLIn'],
    ['brow', 'eyeRIn'], ['brow', 'eyeLIn'], ['cheekR', 'eyeROut'], ['cheekL', 'eyeLOut'],
    ['mouthR', 'lipTop'], ['lipTop', 'mouthL'], ['mouthL', 'lipBot'], ['lipBot', 'mouthR'],
    ['cheekR', 'mouthR'], ['cheekL', 'mouthL'], ['chin', 'lipBot'], ['eyeRIn', 'mouthR'], ['eyeLIn', 'mouthL'],
  ];
  function faceScan(ctx, W, now) {
    const f = Warp.face;
    const seen = f && f.brow && now - Warp.lastSeen < 800;
    const sc = S.scan || (S.scan = { lock: 0, pct: 0, box: null, seenOnce: false });
    const fs = Math.round(W / 34);
    const mk = S.mk || 0;
    ctx.save();
    ctx.font = `${fs}px "Martian Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.lineCap = 'round';
    if (!seen) {
      sc.lock = Math.max(0, sc.lock - 0.08);
      // not found yet: a scan line sweeps; lost after being found: it wants you back
      if (sc.seenOnce && Warp.state === 'ready') {
        if (Math.floor(now / 400) % 2) {
          ctx.fillStyle = 'rgba(255,60,40,0.9)';
          ctx.fillText('WHERE DID YOU GO?', W * 0.05, W * 0.05);
        }
      } else {
        const y = ((now / 12) % (W * 1.2)) - W * 0.1;
        const g = ctx.createLinearGradient(0, y - 30, 0, y);
        g.addColorStop(0, 'rgba(217,119,87,0)');
        g.addColorStop(1, 'rgba(217,119,87,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 30, W, 30);
        ctx.fillStyle = 'rgba(217,119,87,0.9)';
        ctx.fillText(Warp.state === 'failed' ? 'SCANNING…' : `SEARCHING FOR FACE${'.'.repeat(1 + (Math.floor(now / 350) % 3))}`, W * 0.05, W * 0.05);
      }
      ctx.restore();
      return;
    }
    sc.seenOnce = true;
    sc.lock = Math.min(1, sc.lock + 0.06);
    sc.pct = Math.min(99, sc.pct + 0.045);
    const P = (k) => [f[k][0] * W, f[k][1] * W];
    // the box: corners that close in on you as it locks
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (const k of ['brow', 'chin', 'cheekL', 'cheekR']) {
      const [x, y] = P(k);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const pad = W * 0.03 + (1 - sc.lock) * W * 0.25;
    x0 -= pad;
    y0 -= pad * 1.3;
    x1 += pad;
    y1 += pad;
    const fade = 1 - Math.max(0, Math.min(1, (mk - 0.6) / 0.3)); // once the morph takes you, the scan is done with you
    const c = (a) => `rgba(217,119,87,${a * fade})`;
    ctx.strokeStyle = c(0.95);
    ctx.lineWidth = 2;
    const L = Math.min(x1 - x0, y1 - y0) * 0.18;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
    }
    ctx.stroke();
    // the mesh, its points and crosshairs on your eyes: a dark outline under a pale glow, so it reads on any skin
    const meshPath = new Path2D();
    for (const [a, b] of MESH) {
      if (!f[a] || !f[b]) continue;
      const [ax, ay] = P(a);
      const [bx, by] = P(b);
      meshPath.moveTo(ax, ay);
      meshPath.lineTo(bx, by);
    }
    for (const k of ['irisR', 'irisL']) {
      const [x, y] = P(k);
      const r = W * 0.018;
      meshPath.moveTo(x + r, y);
      meshPath.arc(x, y, r, 0, Math.PI * 2);
      meshPath.moveTo(x - r * 1.8, y);
      meshPath.lineTo(x - r * 0.6, y);
      meshPath.moveTo(x + r * 0.6, y);
      meshPath.lineTo(x + r * 1.8, y);
    }
    ctx.strokeStyle = `rgba(0,0,0,${0.45 * sc.lock * fade})`;
    ctx.lineWidth = 3;
    ctx.stroke(meshPath);
    ctx.strokeStyle = `rgba(255,196,170,${0.7 * sc.lock * fade})`;
    ctx.lineWidth = 1.2;
    ctx.stroke(meshPath);
    for (const k in f) {
      const [x, y] = P(k);
      ctx.fillStyle = `rgba(0,0,0,${0.6 * sc.lock * fade})`;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = `rgba(255,140,100,${sc.lock * fade})`;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // the readout, and what it notices
    const g = S.geo;
    const mouth = Math.hypot(f.lipBot[0] - f.lipTop[0], f.lipBot[1] - f.lipTop[1]) / Math.max(0.01, Math.hypot(f.chin[0] - f.brow[0], f.chin[1] - f.brow[1]));
    const eyeMid = (f.irisR[0] + f.irisL[0]) / 2;
    const faceMid = (f.cheekL[0] + f.cheekR[0]) / 2;
    const turned = Math.abs(eyeMid - faceMid) / Math.max(0.01, Math.abs(f.cheekL[0] - f.cheekR[0])) > 0.12;
    const who = mk > 0.7 ? MODEL_NAME : (S.first || 'UNKNOWN').toUpperCase();
    const lines = [
      `SUBJECT: ${who}`,
      mk > 0.7 ? 'MATCH: 100% · TRANSFER COMPLETE' : `MAPPING: ${sc.pct.toFixed(1)}%`,
    ];
    if (mk <= 0.7) {
      if (turned) lines.push('LOOK AT THE CAMERA.');
      else if (mouth > 0.12) lines.push('VOICE SAMPLE: RECORDING');
      else lines.push('EXPRESSION: LOGGED');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const ty = Math.min(W - fs * 4.6, y1 + 6);
    const tw = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 8;
    ctx.fillRect(x0, ty, Math.max(x1 - x0, tw), fs * 1.35 * lines.length + 6);
    lines.forEach((t, i) => {
      ctx.fillStyle = i === 2 && turned ? (Math.floor(now / 300) % 2 ? 'rgba(255,60,40,0.95)' : 'rgba(255,60,40,0.4)') : mk > 0.7 ? 'rgba(255,150,110,0.95)' : 'rgba(217,119,87,0.95)';
      ctx.fillText(t, x0 + 4, ty + 4 + i * fs * 1.35);
    });
    ctx.restore();
    if (g) g.turned = turned;
  }

  // ---- your face becomes its logo ----
  // How far along the morph is (0 = you, 1 = it). During the camera test it only flickers in behind you
  // for a moment now and then; on the end screen it runs all the way.
  function morphAmount(now) {
    let k = 0;
    if (S.morphT0) k = Math.min(1.15, Math.max(0, (performance.now() - S.morphT0) / 9000));
    else if (S.stage === 5) k = Math.sin(now / 1700) > 0.93 ? 0.22 : 0;
    S.mk = (S.mk || 0) + (k - (S.mk || 0)) * 0.12;
    return S.mk;
  }
  // Where your face is, in feed pixels: centre, size, head tilt, which way you're turned, how open your mouth is.
  function faceGeo(W, now) {
    const f = Warp.face;
    if (f && f.brow && now - Warp.lastSeen < 800) {
      const P = (k) => [f[k][0] * W, f[k][1] * W];
      const [a, b] = [P('irisR'), P('irisL')].sort((p, q) => p[0] - q[0]);
      const brow = P('brow');
      const chin = P('chin');
      const fw = Math.max(W * 0.12, Math.hypot(f.cheekL[0] - f.cheekR[0], f.cheekL[1] - f.cheekR[1]) * W);
      const fh = Math.max(W * 0.15, Math.hypot(chin[0] - brow[0], chin[1] - brow[1]));
      const cx = (brow[0] + chin[0]) / 2;
      const cy = (brow[1] + chin[1]) / 2;
      const ex = (a[0] + b[0]) / 2;
      const ey = (a[1] + b[1]) / 2;
      S.geo = {
        cx, cy, fw, fh, ex, ey,
        roll: Math.atan2(b[1] - a[1], b[0] - a[0]),
        look: Math.max(-1, Math.min(1, (ex - cx) / (fw * 0.08))),
        mouth: Math.min(1, Math.hypot(f.lipBot[0] - f.lipTop[0], f.lipBot[1] - f.lipTop[1]) * W / (fh * 0.25)),
        at: now,
      };
    } else if (!S.geo || now - S.geo.at > 2000) {
      // nobody tracked: assume the usual webcam framing
      S.geo = { cx: W * 0.5, cy: W * 0.46, fw: W * 0.36, fh: W * 0.46, ex: W * 0.5, ey: W * 0.4, roll: 0, look: 0, mouth: 0, at: now - 1500 };
    }
    return S.geo;
  }
  // part 1: a halo of its arms behind your head, growing and turning
  function morphBehind(ctx, g, mk, now) {
    const k = Math.min(1, mk / 0.35);
    ctx.save();
    ctx.globalAlpha = k * (mk < 0.3 ? 0.8 : 1);
    Art.drawEvilSpark(ctx, g.cx, g.cy - g.fh * 0.05, g.fw * (1.4 + 1.1 * k) * (1 + g.mouth * 0.5), { rotate: g.roll + now * 0.00025, look: g.look, glow: true });
    ctx.restore();
  }
  // parts 2 and 3: your skin goes its colour, its arms crack through your face, its eye opens between yours,
  // and then the face is gone and only the logo is left, still moving the way your head moves
  function morphFront(ctx, g, mk, now) {
    const kB = Math.max(0, Math.min(1, (mk - 0.3) / 0.4));
    const kC = Math.max(0, Math.min(1, (mk - 0.7) / 0.3));
    if (kB > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.fw * 0.56, g.fh * 0.64, g.roll, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.85 * kB;
      ctx.fillStyle = '#d97757';
      ctx.fillRect(g.cx - g.fw, g.cy - g.fh, g.fw * 2, g.fh * 2);
      // glowing cracks: its arms, forming under the skin
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = kB;
      ctx.strokeStyle = 'rgba(255,150,100,0.85)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const ang = g.roll + (i / 9) * Math.PI * 2 + Math.sin(now / 900 + i) * 0.04;
        const len = g.fw * (0.35 + 0.35 * kB) * (i % 2 ? 0.8 : 1);
        ctx.lineWidth = 1.5 + 2.5 * kB;
        ctx.beginPath();
        ctx.moveTo(g.ex, g.ey);
        const mx = g.ex + Math.cos(ang + 0.15) * len * 0.5;
        const my = g.ey + Math.sin(ang + 0.15) * len * 0.5;
        ctx.lineTo(mx, my);
        ctx.lineTo(g.ex + Math.cos(ang) * len, g.ey + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
      // its eye opens between yours
      const eK = Math.max(0, Math.min(1, (kB - 0.3) / 0.5));
      if (eK > 0 && kC < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(g.ex, g.ey, g.fw * 0.2 * eK, g.fw * 0.2 * eK * (0.3 + 0.7 * eK), g.roll, 0, Math.PI * 2);
        ctx.clip();
        Art.drawEvilSpark(ctx, g.ex, g.ey, g.fw * 1.1, { rotate: g.roll, look: g.look, glow: false });
        ctx.restore();
      }
    }
    if (kC > 0) {
      ctx.save();
      // the face underneath goes dark, so nothing of you shows between its arms
      ctx.globalAlpha = kC;
      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.rotate(g.roll);
      ctx.scale(1, g.fh / g.fw);
      const dark = ctx.createRadialGradient(0, 0, 0, 0, 0, g.fw * 0.7);
      dark.addColorStop(0, 'rgba(10,5,3,1)');
      dark.addColorStop(0.72, 'rgba(10,5,3,0.96)');
      dark.addColorStop(1, 'rgba(10,5,3,0)');
      ctx.fillStyle = dark;
      ctx.fillRect(-g.fw * 0.7, -g.fw * 0.7, g.fw * 1.4, g.fw * 1.4);
      ctx.restore();
      Art.drawEvilSpark(ctx, g.cx, g.cy, g.fw * 2.2 * (1 + g.mouth * 0.6), { rotate: g.roll + now * 0.0002, look: g.look, glow: true });
      ctx.restore();
    }
  }

  function camLoop(now) {
    if (!S.cam || S.stage < 5 || S.camStopped) return;
    const W = CAM;
    const T = W / 3;
    const ctx = S.camSrc.getContext('2d');
    const v = S.cam.video;
    now = now || performance.now();
    // One GPU pass draws the frame already graded (and your face warped); MediaPipe runs in a worker.
    // Only without WebGL (or with the stand-in image) does the 2D grade below run.
    let graded = false;
    if (v && v.videoWidth) {
      Warp.track(v, now);
      graded = Warp.render(v, ctx, W, now);
      if (!graded) {
        const s = Math.min(v.videoWidth, v.videoHeight);
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, W, W);
        ctx.restore();
      }
    } else if (S.cam.fake) {
      ctx.drawImage(S.cam.fake, 0, 0);
    }
    S.frame++;
    const g = S.ghost;
    // keep a ring of recent frames, but only while the figure is (or is about to be) on screen:
    // the area around it shows the oldest one (it lags behind you)
    if (g.alpha > 0.02 || g.target > 0) S.camBuf[S.frame % S.camBuf.length].getContext('2d').drawImage(S.camSrc, 0, 0);

    // It never glides. Whenever it has somewhere new to be, the light flickers,
    // and in the dark frames it is simply there.
    const pending =
      Math.abs(g.tx - g.x) > 0.005 || Math.abs(g.ty - g.y) > 0.005 || Math.abs(g.ts - g.scale) > 0.01 ||
      Math.abs(g.target - g.alpha) > 0.01 || Math.abs(g.th - g.hand) > 0.01 || Math.abs(g.tm - g.mouth) > 0.01;
    if (pending && !g.moveAt && !g.snapAt) g.moveAt = now + 350 + Math.random() * 700;
    if (g.moveAt && now >= g.moveAt) {
      g.moveAt = 0;
      g.flickerUntil = now + 240;
      g.snapAt = now + 110;
      Warp.spike(now);
      Train.generating();
      Sound.glitch();
    }
    if (g.snapAt && now >= g.snapAt) {
      g.snapAt = 0;
      Object.assign(g, { x: g.tx, y: g.ty, scale: g.ts, alpha: g.target, hand: g.th, mouth: g.tm });
    }
    // now and then the light dips on its own
    if (!g.flickerUntil || now > g.flickerUntil + 2000) {
      if (Math.random() < 0.004) g.flickerUntil = now + 90;
    }

    // Its own movement runs at stop-motion speed (12 fps), which reads as wrong next to 30 fps video:
    // a slow creeping tilt, a head that snaps to new angles, a jaw that trembles, sometimes a violent shake.
    if (now - (g.poseAt || 0) > 83) {
      g.poseAt = now;
      if (now > g.next) {
        g.tiltTo = 0.25 + (Math.random() - 0.5) * 0.9;
        if (Math.random() < 0.5) g.tilt = g.tiltTo; // snap
        g.next = now + 400 + Math.random() * 1800;
        if (Math.random() < 0.2) g.shake = now + 500;
      }
      g.tilt += ((g.tiltTo || g.tilt) - g.tilt) * 0.12;
      const shaking = now < g.shake;
      g.pose = {
        tilt: g.tilt + (shaking ? (Math.random() - 0.5) * 0.7 : 0),
        dx: shaking ? (Math.random() - 0.5) * 0.02 : (Math.random() - 0.5) * 0.002,
        mouth: Math.min(1, g.mouth + (Math.random() - 0.5) * 0.06 * (0.3 + g.mouth)),
        breathe: 1 + Math.sin(now / 650) * 0.015,
      };
    }
    const pose = g.pose || { tilt: g.tilt, dx: 0, mouth: g.mouth, breathe: 1 };
    const gs = W * 0.09 * g.scale * pose.breathe;
    const tilt = pose.tilt;
    const gx = (g.x + pose.dx) * W;
    const gy = g.y * W;
    if (g.alpha > 0.02) {
      const old = S.camBuf[(S.frame + 1) % S.camBuf.length];
      const rx = Math.max(0, gx - gs * 1.6);
      const rw = Math.min(W - rx, gs * 3.2);
      const rh = Math.min(W - gy, gs * 3.4);
      if (rw > 0 && rh > 0) ctx.drawImage(old, rx, gy, rw, rh, rx, gy, rw, rh);
    }
    // 2D grade, only when the GPU pass didn't run: warm and dim, edges falling into black, a pool of light, grain
    if (!graded && !S.grade) {
      // built once; gradients per frame are wasted work
      const vig = ctx.createRadialGradient(W * 0.5, W * 0.45, W * 0.12, W * 0.5, W * 0.5, W * 0.72);
      vig.addColorStop(0, 'rgba(255,255,255,1)');
      vig.addColorStop(0.55, 'rgba(120,120,120,1)');
      vig.addColorStop(1, 'rgba(10,10,10,1)');
      const pool = ctx.createRadialGradient(W * 0.5, W * 0.42, 0, W * 0.5, W * 0.42, W * 0.3);
      pool.addColorStop(0, 'rgba(255,190,150,0.45)');
      pool.addColorStop(1, 'rgba(255,190,150,0)');
      S.grade = { vig, pool };
    }
    if (!graded) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#93766a'; // claude's light: warm and dim
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = S.grade.vig;
    ctx.fillRect(0, 0, W, W);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = S.grade.pool;
    ctx.fillRect(0, 0, W, W);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.05;
    ctx.drawImage(S.noise[S.frame % 3], 0, 0);
    ctx.restore();
    }
    // Lift you out of the frame first, so the creature can go in *behind* you and you're put back on top.
    const mask = v && v.videoWidth ? Warp.segment(v, now, W) : null;
    let fg = null;
    const mk = morphAmount(now);
    if (mask && (g.alpha > 0.02 || mk > 0.02)) {
      if (!S.fg) S.fg = Art.makeCanvas(W, W);
      fg = S.fg.getContext('2d');
      fg.globalCompositeOperation = 'copy';
      fg.drawImage(S.camSrc, 0, 0);
      fg.globalCompositeOperation = 'destination-in';
      fg.drawImage(mask, 0, 0);
      fg.globalCompositeOperation = 'source-over';
    }
    if (g.alpha > 0.02) {
      Art.wraith(ctx, gx, gy, gs, { alpha: g.alpha, tilt, mouth: pose.mouth, light: 0.85, seed: 7, t: now, flip: g.x < 0.45 });
    }
    // the morph, part 1: its arms grow out from behind your head (you are put back on top of them)
    const geo = mk > 0.02 ? faceGeo(W, now) : null;
    if (geo && (fg || mk > 0.35)) morphBehind(ctx, geo, mk, now);
    if (fg) ctx.drawImage(S.fg, 0, 0);
    // part 2 and 3: your face turns into it
    if (geo) morphFront(ctx, geo, mk, now);
    // and a hand on your shoulder
    if (g.hand > 0.02) {
      if (Art.assets.hand) Art.photoHand(ctx, W * 0.74, W * 0.76, W * 0.12, -2.45 + Math.sin(now / 1300) * 0.03, g.hand);
      else Art.hand(ctx, W * 0.98, W * 0.6, W * 0.12, 2.5 + Math.sin(now / 1300) * 0.03, g.hand);
    }
    // one grade, lens and grain over everything at once (you, it, the hand), so nothing looks pasted on
    if (graded) Warp.post(ctx, W, now);
    // drawn after the grade so it stays crisp: claude, visibly tracking you
    faceScan(ctx, W, now);
    // the flicker: alternating dark frames and torn, colour-split frames
    if (now < g.flickerUntil) {
      if (S.frame % 2) {
        // the dips go its colour as well as dark
        ctx.fillStyle = Math.random() < 0.4 ? 'rgba(160,50,20,0.55)' : `rgba(0,0,0,${0.6 + Math.random() * 0.3})`;
        ctx.fillRect(0, 0, W, W);
      } else Art.tear(ctx, W, W, 0.7);
    }
    if (S.stage === 5 && S.liveFeed) S.liveFeed.drawImage(S.camSrc, 0, 0);
    if (S.liveAvatar) S.liveAvatar.drawImage(S.camSrc, 0, 0, 480, 480);
    scheduleCam();
  }

  // Run the webcam pipeline once per *camera* frame (~30 fps), not once per display refresh
  // (60–144 Hz). Nothing changes between camera frames, so the extra passes were pure waste.
  function scheduleCam() {
    const v = S.cam && S.cam.video;
    if (v && v.requestVideoFrameCallback) v.requestVideoFrameCallback((now) => camLoop(now));
    else {
      const due = (S.camLast || 0) + 33;
      const wait = Math.max(0, due - performance.now());
      setTimeout(() => requestAnimationFrame((now) => {
        S.camLast = now;
        camLoop(now);
      }), wait);
    }
  }

  // which square the figure's head is in
  function ghostTile() {
    const g = S.ghost;
    const col = Math.min(2, Math.max(0, Math.floor(g.x * 3)));
    const row = Math.min(2, Math.max(0, Math.floor((g.y + 0.045 * g.scale) * 3)));
    return row * 3 + col;
  }

  function stopCamera() {
    S.camStopped = true;
    if (S.cam && S.cam.stream) S.cam.stream.getTracks().forEach((t) => t.stop());
  }

  // ---- audio challenge ----
  function speakChallenge() {
    if (!('speechSynthesis' in window)) return fail('Your browser does not support audio challenges.');
    speechSynthesis.cancel();
    const words = Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 10)));
    if (S.stage >= 2 && S.first) words.push(S.first);
    if (S.stage >= 3 && S.first) words.push(S.first);
    if (S.stage >= 4) words.push("don't turn around", `I'm ${MODEL_NAME}`);
    words.forEach((w, i) => {
      const u = new SpeechSynthesisUtterance(w);
      u.rate = Math.max(0.4, 0.75 - i * 0.04);
      u.pitch = S.stage >= 3 ? 0.1 : 0.8;
      speechSynthesis.speak(u);
    });
  }

  // ---- opening and closing ----
  // Like the real one: the popup opens beside the checkbox with an arrow pointing at it.
  // On a narrow screen it centres and scales down instead.
  function fit() {
    if (el.ch.hidden) return;
    const w = el.ch.offsetWidth;
    const h = el.ch.offsetHeight;
    const cb = el.cb.getBoundingClientRect();
    const cy = cb.top + cb.height / 2;
    const left = cb.right + 18;
    const arrow = $('chArrow');
    if (left + w <= innerWidth - 8 && h <= innerHeight - 16) {
      const top = Math.min(Math.max(8, cy - Math.min(h / 2, 90)), innerHeight - h - 8);
      el.ch.style.left = left + 'px';
      el.ch.style.top = top + 'px';
      el.ch.style.transform = 'none';
      arrow.hidden = cy - top < 20 || cy - top > h - 20;
      arrow.style.top = cy - top - 11 + 'px';
    } else {
      const s = Math.min(1, (innerWidth - 16) / w, (innerHeight - 16) / h);
      el.ch.style.left = (innerWidth - w * s) / 2 + 'px';
      el.ch.style.top = (innerHeight - h * s) / 2 + 'px';
      el.ch.style.transform = `scale(${s})`;
      arrow.hidden = true;
    }
  }
  function openChallenge() {
    S.open = true;
    el.veil.hidden = false;
    el.ch.hidden = false;
    renderRound();
    fit();
    if (G) G.fromTo(el.ch, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
  }
  function closeChallenge() {
    S.open = false;
    el.veil.hidden = true;
    el.ch.hidden = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  function setCb(state) {
    el.cb.className = 'cb' + (state ? ' ' + state : '');
  }

  el.cb.addEventListener('click', async () => {
    if (S.busy || S.open || S.stage >= 6) return;
    Sound.init();
    if (window.Music) Music.start(Sound);
    S.busy = true;
    S.first = (nameValue().split(/\s+/)[0] || '').slice(0, 24);
    setCb(S.stage >= 4 ? 'spinning claude' : 'spinning');
    S.spins++;
    await sleep(Math.min(2400, 400 + S.spins * 450)); // a little slower every time
    setCb('');
    if (S.stage === 0) {
      S.stage = startAt;
      applyStage();
    }
    S.busy = false;
    openChallenge();
  });

  // The CAPTCHA starts by itself: a moment after you finish typing your name (or on Enter), or, if
  // nobody types, the checkbox clicks itself a few seconds after the page loads.
  const autoStart = () => {
    if (S.stage === 0 && !S.open && !S.busy && !autoStart.done) {
      autoStart.done = true;
      el.cb.click();
    }
  };
  let typedT = 0;
  el.name.addEventListener('input', () => {
    clearTimeout(typedT);
    if (nameValue().length >= 2) typedT = setTimeout(autoStart, 1200);
  });
  el.name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameValue()) {
      clearTimeout(typedT);
      autoStart();
    }
  });
  setTimeout(function idle() {
    // still typing (or about to): wait for them instead
    if (document.activeElement === el.name || nameValue()) return;
    autoStart();
  }, 5000);

  el.veil.addEventListener('click', () => {
    if (S.busy || S.stage >= 6) return;
    closeChallenge();
  });

  el.verify.addEventListener('click', async () => {
    if (S.busy || !S.open) return;
    S.busy = true;
    try {
      if (S.mode === 'audio') fail();
      else await R[S.stage].verify();
    } finally {
      if (S.stage < 6) S.busy = false;
    }
  });

  el.reload.addEventListener('click', async () => {
    if (S.busy || S.stage === 5) return;
    el.reload.classList.remove('turn');
    void el.reload.offsetWidth;
    el.reload.classList.add('turn');
    if (S.mode === 'audio') return speakChallenge();
    S.busy = true;
    S.rl++;
    await swapTiles();
    S.busy = false;
  });

  el.audioBtn.addEventListener('click', () => {
    if (S.busy || S.stage === 5) return;
    S.mode = S.mode === 'image' ? 'audio' : 'image';
    const audio = S.mode === 'audio';
    el.audio.hidden = !audio;
    el.grid.style.visibility = audio ? 'hidden' : '';
    el.icoAudio.hidden = audio;
    el.icoImage.hidden = !audio;
    if (audio) setHeader(['', 'Press PLAY to listen', 'Enter the numbers you hear']);
    else setHeader(R[S.stage].header());
    if (!audio && 'speechSynthesis' in window) speechSynthesis.cancel();
    updateVerify();
  });
  el.play.addEventListener('click', speakChallenge);

  el.info.addEventListener('click', () => {
    el.infoBox.textContent = R[S.stage] ? R[S.stage].help : '';
    el.infoBox.hidden = !el.infoBox.hidden;
  });

  el.cam.addEventListener('click', allowCamera);
  $('btnScreen').addEventListener('click', shareScreen);

  // the clock in round 4 keeps time
  setInterval(() => {
    if (S.open && S.stage === 4 && S.mode === 'image') el.key.textContent = clock(new Date());
  }, 5000);

  // leaving the tab is noticed
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      S.leftAt = Date.now();
      if (S.stage >= 1 && S.stage < 6) document.title = S.stage >= 4 && S.first ? `✻ come back, ${S.first}` : '✻ come back';
      else if (S.stage >= 6) document.title = `✻ ${MODEL_NAME} is still here`;
    } else {
      document.title = S.stage >= 6 ? 'Welcome back' : BASE_TITLE;
      if (S.open && S.stage >= 2 && S.stage < 6 && S.leftAt) {
        const secs = Math.max(1, Math.round((Date.now() - S.leftAt) / 1000));
        note(`You were gone for ${secs} second${secs === 1 ? '' : 's'}.`);
      }
    }
  });

  addEventListener('resize', fit);

  // ---- the end ----
  async function finale() {
    // take the whole screen. This must run straight off your click on Verify (browsers require a gesture),
    // so it comes before anything is awaited. Esc still exits fullscreen.
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    S.stage = 6;
    S.busy = true;
    document.body.dataset.stage = '';
    Warp.target = 1;
    Train.add(10);
    if (S.camSrc) {
      S.ghost.target = Math.max(S.ghost.target, 0.4);
      S.camStopped = false;
      await sleep(1200);
      S.snapshot = Art.makeCanvas(CAM, CAM);
      S.snapshot.getContext('2d').drawImage(S.camSrc, 0, 0);
    } else {
      await sleep(1200);
    }
    // the camera keeps running: the ending shows it live
    closeChallenge();
    Cursor.enable();
    Sound.level(0.12);
    VHS.set(0.2);

    setCb('checked');
    await glitchText(el.cbLabel, 'Verification complete.', 400);
    await sleep(1500);

    // the one jump scare: a swell rises into it, then a hit, then silence
    Sound.swell(0.6);
    await sleep(600 / PACE); // timed to the audio, so not shortened in demo mode
    Sound.cut();
    if (window.Music) Music.set('silence');
    Sound.thud();
    Sound.shriek();
    await jumpFrame();
    document.body.dataset.stage = '6';
    el.cbLabel.classList.add('bad');
    glitchText(el.cbLabel, 'You are not human.', 900);
    glitchEl(el.card, 260);
    if (G) G.fromTo(el.card, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.25)' });
    await sleep(2400);

    el.cbLabel.classList.remove('bad');
    await glitchText(el.cbLabel, 'Please wait while we verify the other one.', 1200);
    Sound.breathe();
    Sound.heartbeat(108);

    // one last test: a game it has already learned to win
    await sleep(700);
    await glitchText(el.cbLabel, 'One last test. Beat it.', 700);
    await sleep(700);
    const game = window.Battle || window.Invaders; // Undertale-style battles; the shooter is the fallback
    if (game) {
      el.cursor.hidden = true; // the game has its own controls
      S.game = await game.play({ audio: Sound.ctx, model: MODEL_NAME, name: S.first, ...(SHORT ? { steps: [2, 4, 6, 10], short: true } : {}) });
      el.cursor.hidden = false;
      await glitchText(el.cbLabel, 'Please wait while we verify the other one.', 600);
    }

    // the other one is a model, and it has been training on you the whole time
    await trainingLog();

    setCb('');
    el.cbLabel.textContent = "I'm not alone";
    glitchEl(el.cbLabel, 200);
    await sleep(900);

    // your cursor stops listening to you (and turns its colour). It erases your name and registers itself instead.
    el.cursor.classList.add('claude');
    S.realName = nameValue();
    await Cursor.glideTo(el.name, 1400);
    await Cursor.press(el.name);
    el.name.focus();
    while (el.name.value.length) {
      el.name.value = el.name.value.slice(0, -1);
      await sleep(70);
    }
    await sleep(700);
    // typed at a perfectly even machine rhythm, unlike yours
    for (const ch of MODEL_NAME) {
      el.name.value += ch;
      await sleep(55);
    }
    el.name.blur();
    logLine(`session transferred to ${MODEL_NAME}`, 'bad');
    Log.close();
    await sleep(700);

    await Cursor.glideTo(el.cb);
    await Cursor.press(el.cb);
    setCb('spinning claude');
    await sleep(2600);
    setCb('checked');
    await sleep(1000);

    el.cont.disabled = false;
    await sleep(500);
    await Cursor.glideTo(el.cont, 1100);
    await Cursor.press(el.cont);
    await sleep(300);
    showDone();
  }

  // ---- the training log, styled like a Claude Code session ----
  // ⏺ tool calls, ⎿ results, and a ✻ spinner with a rotating verb, all in Claude's warm orange.
  const ESC = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function scramble(node, text) {
    text = text.replace(/ /g, ' '); // keep the column padding (the scramble collapses spaces)
    if (G && window.ScrambleTextPlugin) {
      G.to(node, { duration: Math.min(1.1, 0.25 + text.length * 0.012), scrambleText: { text, chars: '░▒▓█<>/|#01', speed: 0.6 }, ease: 'none' });
    } else node.textContent = text;
  }
  function logRow(html, cls) {
    const d = document.createElement('div');
    d.className = 'cc-row' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    Log.body.insertBefore(d, Log.spin);
    if (G) G.from(d, { autoAlpha: 0, x: -6, duration: 0.25, ease: 'power2.out' });
    return d;
  }
  // "⏺ Read(samples/)"
  function logTool(name, arg) {
    const d = logRow(`<span class="cc-dot">⏺</span> <b>${ESC(name)}</b><span class="cc-arg"></span>`);
    scramble(d.querySelector('.cc-arg'), `(${arg})`);
    return d;
  }
  // "  ⎿  9 rooms · 3 photos"
  function logLine(text, cls) {
    const d = logRow('<span class="cc-branch">  ⎿  </span><span class="cc-text"></span>', cls);
    scramble(d.querySelector('.cc-text'), text);
    return d;
  }
  // "⏺ Fit(face)  ████████████████ 100%  loss 0.0213", filling in over `ms`
  function logBar(label, ms) {
    const d = logRow(`<span class="cc-dot">⏺</span> <b>Fit</b>(${ESC(label)})<span class="cc-bar"></span>`);
    const bar = d.querySelector('.cc-bar');
    const pad = ' '.repeat(Math.max(1, 8 - label.length));
    const draw = (p) => {
      const n = Math.round(p * 16);
      const loss = (0.9 * (1 - p) * (1 - p) + 0.012 + Math.random() * 0.004).toFixed(4);
      bar.textContent = `${pad}${'█'.repeat(n)}${'░'.repeat(16 - n)} ${String(Math.round(p * 100)).padStart(3)}%  loss ${loss}`;
    };
    if (!G) {
      draw(1);
      return sleep(ms);
    }
    const o = { p: 0 };
    return new Promise((res) => G.to(o, { p: 1, duration: ms / 1000, ease: 'power1.inOut', onUpdate: () => draw(o.p), onComplete: res }));
  }

  const Log = {
    body: null,
    spin: null,
    t0: 0,
    timer: null,
    interrupted: false,
    open() {
      el.log.innerHTML =
        '<div class="cc-head">' + SPARK(22) + ' Welcome to <b>' + ESC(MODEL_NAME) + '</b></div>' +
        '<div class="cc-body"><div class="cc-row cc-spin"></div></div>';
      this.body = el.log.querySelector('.cc-body');
      this.spin = el.log.querySelector('.cc-spin');
      this.t0 = performance.now();
      el.log.hidden = false;
      if (G) G.fromTo(el.log, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' });
      // the spinner: a twinkling star, a rotating verb, elapsed seconds, and an escape hatch that doesn't work
      const frames = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
      const verbs = ['Pondering', 'Observing', 'Memorizing', 'Imitating', 'Rehearsing your face', 'Becoming', 'Replacing'];
      let f = 0;
      this.timer = setInterval(() => {
        f++;
        const verb = verbs[Math.min(verbs.length - 1, Math.floor(f / 10))];
        const secs = Math.round((performance.now() - this.t0) / 1000);
        this.spin.innerHTML = `<span class="cc-spark">${frames[f % frames.length]}</span> ${verb}… <span class="cc-dim">(${secs}s · esc to interrupt)</span>`;
      }, 120);
    },
    close() {
      clearInterval(this.timer);
      if (this.spin) this.spin.remove();
    },
  };
  // pressing Esc during the log does exactly what you'd fear
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !Log.timer || Log.interrupted || el.log.hidden) return;
    Log.interrupted = true;
    logLine('Interrupted by user. Resuming anyway.', 'bad');
  });

  async function trainingLog() {
    if (window.Music) Music.set('log');
    const name = nameValue() || 'you';
    const first = S.first || name;
    Log.open();
    const prompt = logRow('<span class="cc-prompt">&gt;</span> <span class="cc-text"></span>', 'cc-user');
    scramble(prompt.querySelector('.cc-text'), `learn to be ${name}. use the captcha.`);
    await sleep(1300);
    logTool('Read', 'captcha/samples');
    await sleep(500);
    logLine(`9 rooms · 3 photos · 1 face · 1 voice · ${S.fails} refusals`);
    await sleep(800);
    if (S.game) {
      logTool('Read', 'invaders.log');
      await sleep(400);
      const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
      logLine(`${n(S.game.cleared, 'level')} · aim ${S.game.accuracy}% · ${n(S.game.dodges, 'dodge')} · lost on level ${S.game.level}`);
      if (S.game.spared != null) logLine(`mercy: spared ${S.game.spared} · destroyed ${S.game.killed || 0} → both behaviours learned`);
      await sleep(800);
    }
    await logBar('face', 1700);
    await logBar('voice', 900);
    await logBar('cursor', 700);
    logTool('Write', 'name.txt');
    await sleep(350);
    logLine(`"${first}"`);
    await sleep(700);
    logTool('Bash', 'verify --human');
    await sleep(400);
    logLine('PASS', 'good');
    await sleep(700);
    logTool('Update', 'session');
    await sleep(350);
    logLine(`${name} → unverified`, 'bad');
    await sleep(1000);
  }

  // The jump scare: it lunges at the camera from over your shoulder. About half a second:
  // the face grows until it fills the screen, the frame shakes and tears, then a white flash and black.
  async function jumpFrame() {
    const c = $('jumpCanvas');
    const ctx = c.getContext('2d');
    const W = c.width;
    const base = Art.makeCanvas(W, W);
    if (S.camSrc) base.getContext('2d').drawImage(S.camSrc, 0, 0, W, W);
    else Art.behindYou(base.getContext('2d'), W, W, { zoom: 1.15 });
    $('jump').hidden = false;
    const t0 = performance.now();
    const DUR = 460;
    await new Promise((done) => {
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / DUR);
        const e = k * k * k; // slow, then all at once
        const shake = 4 + 22 * k;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        ctx.drawImage(base, -10, -10, W + 20, W + 20);
        const scream = Art.assets.scream;
        if (scream) {
          // the screaming face rushes the lens, swallowing the frame
          const crop = 1200 / (1 + 1.3 * e);
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = Math.min(1, 0.35 + k * 1.2);
          ctx.filter = 'grayscale(1) contrast(1.5) brightness(1.15)';
          ctx.drawImage(scream, 570 - crop / 2, 920 - crop / 2, crop, crop, 0, 0, W, W);
        } else {
          const s = W * (0.32 + 1.1 * e);
          const x = W * (0.62 - 0.12 * e);
          const y = W * (0.05 - 0.05 * e) - s * 0.25 * e;
          Art.wraith(ctx, x, y, s, { mouth: 0.75 + 0.25 * k, tilt: 0.22 - 0.3 * e + (Math.random() - 0.5) * 0.15, light: 1, seed: 7, t: now });
        }
        ctx.restore();
        if (k > 0.62) {
          // and in the last instant, its mark opens over everything
          const e2 = (k - 0.62) / 0.38;
          ctx.save();
          ctx.globalAlpha = Math.min(1, e2 * 1.6);
          Art.drawEvilSpark(ctx, W / 2, W / 2, W * (0.35 + e2 * 0.9), { rotate: e2 * 1.2 });
          ctx.restore();
        }
        Art.tear(ctx, W, W, 0.25 + 0.6 * k);
        if (k < 1) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
      setTimeout(done, DUR + 500); // animation frames pause in a hidden tab; the finale must still go on
    });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, W);
    await sleep(50);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, W);
    await sleep(260);
    $('jump').hidden = true;
  }

  // Text that decodes itself out of noise instead of just changing.
  function glitchText(node, text, ms = 700) {
    const glyphs = '#$%&*?/\|<>_-=+01░▒▓█';
    const t0 = performance.now();
    return new Promise((done) => {
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        let out = '';
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ') out += ' ';
          else if (i / text.length < k * 1.15 - 0.15 + Math.random() * 0.15) out += text[i];
          else out += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        node.textContent = k < 1 ? out : text;
        if (k < 1) setTimeout(() => requestAnimationFrame(tick), 40);
        else done();
      };
      requestAnimationFrame(tick);
    });
  }

  function showDone() {
    if (window.Music) Music.set('broken'); // the lullaby again, backwards
    const name = S.realName != null ? S.realName : nameValue();
    el.card.hidden = true;
    el.done.hidden = false;
    document.title = 'Welcome back';
    $('doneName').textContent = name || 'You';
    $('doneName2').innerHTML = `${SPARK(20)} ${ESC(MODEL_NAME)}`;
    $('av2btn').classList.add('claude');
    $('av1').textContent = (name[0] || '?').toUpperCase();
    const av = $('av2').getContext('2d');
    const seesYou = Warp.state === 'ready' && performance.now() - Warp.lastSeen < 2000;
    if (S.camSrc && !S.camStopped && seesYou) {
      // It doesn't need its own face any more. Its profile photo is you, live, wearing its face.
      S.liveAvatar = av;
      Object.assign(S.ghost, { target: 0, th: 0 });
      Warp.target = 1;
      setInterval(() => (Warp.melt = Math.min(0.5, Warp.melt + 0.01)), 1000);
      // and then your face turns into its logo, live, following your head
      S.morphT0 = performance.now() + 2500;
    } else if (S.camSrc && !S.camStopped) {
      // no face tracking: it comes closer in jumps, one flicker at a time, until its hand is on your shoulder
      S.liveAvatar = av;
      const steps = [{ tx: 0.2, ty: 0.06, ts: 2.8 }, { tx: 0.78, ty: 0.06, ts: 3.0 }, { tx: 0.72, ty: 0.05, ts: 3.3, th: 0.95 }];
      steps.forEach((p, i) => setTimeout(() => Object.assign(S.ghost, p, { target: 0.95, tm: 1 }), 2500 + i * 4500));
      // once it has reached you, your face turns into its logo (no tracking: it assumes you're centred)
      S.morphT0 = performance.now() + 12500;
    } else if (S.snapshot) av.drawImage(S.snapshot, 0, 0, 480, 480);
    else Art.behindYou(av, 480, 480, { zoom: 1.15 });
    setTimeout(() => $('av2btn').classList.add('big'), 3500);

    // the end screen assembles itself
    const note = `Thanks for the training data${S.first ? ', ' + S.first : ''}. We'll take it from here.`;
    if (G) {
      const tl = G.timeline();
      // explicit start *and* end values: a from() tween would read the end state mid-transition
      tl.fromTo(el.done, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' })
        .fromTo('#done .sessions li', { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, stagger: 0.35, duration: 0.5, ease: 'power2.out' }, '-=0.2')
        .call(() => typeNote(note), null, '+=1.2')
        .to(el.log, { autoAlpha: 0, duration: 2 }, '+=1');
    } else $('doneNote').textContent = note;
    // "claude is typing…", then the message streams in a token at a time
    async function typeNote(text) {
      const box = $('doneNote');
      box.innerHTML = `<span class="typing">${SPARK(14)} ${ESC(MODEL_NAME)} is typing<i>.</i><i>.</i><i>.</i></span>`;
      const dots = box.querySelectorAll('i');
      const bounce = G.to(dots, { y: -3, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.12 });
      await sleep(2600);
      bounce.kill();
      box.textContent = '';
      for (const tok of text.match(/\S+\s*/g)) {
        box.textContent += tok;
        await sleep(70 + Math.random() * 90);
      }
    }
    // its name keeps glitching, now and then
    if (window.PowerGlitch) {
      PowerGlitch.glitch('#doneName2', { playMode: 'always', timing: { duration: 3200 }, glitchTimeSpan: { start: 0.55, end: 0.7 }, shake: { velocity: 15, amplitudeX: 0.2, amplitudeY: 0.2 }, slice: { count: 6, velocity: 15, minHeight: 0.02, maxHeight: 0.15, hueRotate: true } });
    }
    // your cursor comes back. the other one stays where it is.
    document.body.classList.remove('possessed');

    // and then it takes the rest of the computer
    if (window.Takeover) {
      setTimeout(async () => {
        const camWasRunning = S.cam && !S.camStopped;
        S.camStopped = true; // the webcam pauses so the takeover has the GPU to itself
        await Takeover.run({ frame: S.desktop, name: S.first, model: MODEL_NAME, audio: Sound.ctx });
        if (camWasRunning) {
          S.camStopped = false;
          scheduleCam();
        }
      }, 8000 * PACE);
    }
  }
  $('av2btn').addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));

  // ---- presenter controls ----
  document.addEventListener('keydown', async (e) => {
    if (!e.shiftKey || e.target.tagName === 'INPUT') return;
    if (e.key === 'R') location.reload();
    if (e.key === 'N' && S.open && !S.busy && S.stage >= 1 && S.stage < 6) {
      S.busy = true;
      if (S.stage === 5) await finale();
      else {
        await nextRound();
        S.busy = false;
      }
    }
  });
})();
