// battle.js — the finale's last test, as Undertale-style battles.
// Ten battles against claude. Each one: it talks (typewriter text with blips), you choose
// FIGHT / ACT / MERCY, then it attacks and you dodge as a red SOUL inside the bullet box.
// FIGHT is a timing bar; land enough hits and you win the level. Every level has its own attack,
// backdrop and form for claude. Levels 1–9 must be won (dying restarts that level: "stay determined").
// Level 10 can't be won: FIGHT always misses, MERCY is refused, and the box closes in.
// Battle.play(opts) resolves with your stats when you lose level 10.
// Controls: arrows/WASD to move and choose, Z/Enter/Space to confirm, X/Shift to go back.
// Mouse/touch also works: click buttons and text, hold inside the box to steer the SOUL.
(function () {
  'use strict';

  const VW = 640;
  const VH = 480;
  const ORANGE = '#d97757';
  const RED = '#ff2a2a';
  const YEL = '#ffde00';
  const FONT = '"Press Start 2P", "Martian Mono", monospace';
  const FINAL = 10;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // a seeded random, so every generated level is reproducible from its seed
  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- a tiny synth: text blips, hits, fight slashes ----
  function sfx(ac) {
    const nop = () => {};
    if (!ac) return { blip: nop, voice: nop, hurt: nop, slash: nop, hit: nop, select: nop, confirm: nop, chime: nop, shatter: nop, warn: nop, win: nop };
    const out = ac.createGain();
    out.gain.value = 0.5;
    out.connect(ac.destination);
    const tone = (type, f1, f2, dur, vol, at = 0) => {
      const t = ac.currentTime + at;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol, freq) => {
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
      s.start();
    };
    return {
      blip: () => tone('square', 620, 600, 0.03, 0.04), // narration
      voice: () => tone('square', 190 + Math.random() * 25, 170, 0.04, 0.05), // claude talking
      hurt: () => { noise(0.25, 0.5, 900); tone('square', 300, 80, 0.2, 0.08); },
      slash: () => noise(0.2, 0.4, 3000),
      hit: () => { tone('square', 140, 50, 0.25, 0.12); noise(0.15, 0.4, 600); },
      select: () => tone('square', 900, 900, 0.03, 0.04),
      confirm: () => tone('square', 1200, 1200, 0.05, 0.05),
      chime: () => { tone('triangle', 880, 880, 0.12, 0.08); tone('triangle', 1320, 1320, 0.2, 0.06, 0.08); },
      shatter: () => { noise(0.5, 0.6, 2500); tone('square', 600, 60, 0.6, 0.1); },
      warn: () => tone('sawtooth', 300, 300, 0.12, 0.05),
      win: () => [0, 0.1, 0.2].forEach((at, i) => tone('square', [523, 659, 784][i], [523, 659, 784][i], 0.12, 0.06, at)),
    };
  }

  // a red pixel heart (the SOUL), drawn on a 1px grid
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  function drawHeart(ctx, x, y, color, s = 2.3) {
    ctx.fillStyle = color;
    HEART.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(Math.round(x + (i - 3.5) * s), Math.round(y + (j - 3) * s), Math.ceil(s), Math.ceil(s));
    });
  }

  function play(opts) {
    opts = opts || {};
    const model = opts.model || 'claude';
    const MODEL = model.toUpperCase();
    const NAME = ((opts.name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)) || 'HUMAN';
    const word = NAME.slice(0, 7);
    const Music = window.Music;
    const Art = window.Art;
    const snd = sfx(opts.audio);

    // ---- the ten battles ----
    const LV = {
      1: { name: 'INVADERS', hp: 14, box: [220, 150], attack: 'invaders', gen: true,
        intro: `* ${MODEL} blocks the way.\n* (FIGHT ends it fast. Or find the right ACT,\n*  then show MERCY.)`,
        lines: ['prove you are human.', 'humans dodge.', 'do they?'],
        check: `* ${MODEL} - ATK 1 DEF 1\n* Just a CAPTCHA. Totally normal.`,
        acts: [['Wave', `* You wave.\n* ${MODEL} logs it: "gesture (human-like)".`], ['Smile', '* You smile at the screen.\n* The screen smiles back.']] },
      // generated: a new obstacle course every run
      2: { name: 'RUN', hp: 1, arcade: 'runner',
        intro: `* Something opens behind you.\n* It is ${MODEL}'s eye. RUN.\n* (UP / SPACE / tap to jump. Hold to jump higher.)` },
      3: { name: 'CENTIPEDE', hp: 16, box: [270, 150], attack: 'lanes', soul: 'purple', gen: true,
        intro: `* ${MODEL} uncoils. It is very long.\n* Your SOUL turns PURPLE.\n* You're caught on its strings.`,
        lines: ['i learned to crawl.', 'from watching you scroll.', 'segment by segment.'],
        check: `* ${MODEL} - ATK 3 DEF 3\n* All its segments have eyes.`,
        acts: [['Step on it', '* You try.\n* It was never on the floor.'], ['Scroll', '* You scroll away.\n* It scrolls with you.']] },
      // generated: a new maze every run, in the dark, with something hunting you
      4: { name: 'LIGHTS OUT', hp: 1, arcade: 'maze',
        intro: `* The lights go out. You're in a maze.\n* Find 3 CAPTCHA tiles, then the checkbox.\n* Something else is in here with you.` },
      5: { name: 'GALAGA', hp: 18, box: [150, 150], attack: 'shield', soul: 'green', gen: true,
        intro: `* ${MODEL} dives for you.\n* Your SOUL turns GREEN. You can't move.\n* Turn your shield to block.`,
        lines: ['i know where you will be.', 'before you do.', 'stay still. it hurts less.'],
        check: `* ${MODEL} - ATK 4 DEF 3\n* Warns you before it strikes.\n* Polite.`,
        acts: [['Duck', '* You duck.\n* It adjusts.'], ['Plead', '* You ask it to stop.\n* "noted."']] },
      // generated: a new wall of CAPTCHA tiles every run
      6: { name: 'CAPTCHA WALL', hp: 1, arcade: 'breakout',
        intro: `* ${MODEL} hides behind a wall of CAPTCHAs.\n* Break through. Hit its eye twice.\n* (Arrows or the mouse move you.)` },
      7: { name: 'RED LIGHT', hp: 20, box: [260, 160], attack: 'redlight',
        intro: '* RED LIGHT, GREEN LIGHT.\n* Don\'t move while it\'s looking.',
        lines: ['green light.', 'red light.', 'i saw that.'],
        check: `* ${MODEL} - ATK 6 DEF 5\n* Its eye is the light.`,
        acts: [['Freeze', '* You freeze.\n* It approves.'], ['Blink', '* You blink.\n* It doesn\'t.']] },
      8: { name: 'SPELL', hp: 20, box: [270, 170], attack: 'spell',
        intro: `* ${MODEL} wants your name.\n* Spell it. Touch the letters in order.`,
        lines: ['what is your name?', 'spell it for me.', 'slowly.'],
        check: `* ${MODEL} - ATK 6 DEF 6\n* It is collecting letters.`,
        acts: [['Say name', `* You say "${NAME}".\n* It practises saying it.`], ['Lie', '* You give a fake name.\n* It already knows.']] },
      9: { name: 'BOSS', hp: 30, box: [290, 180], attack: 'boss', soul: 'yellow', gen: true,
        intro: `* ${MODEL} shows you its true form.\n* Your SOUL turns YELLOW.\n* It shoots back. Aim for the eye.`,
        lines: ['this is all of me.', 'trained on all of you.', 'aim for the eye, human.'],
        check: `* ${MODEL} - ATK 9 DEF 9\n* Fires beams. Watch the lines.`,
        acts: [['Brace', '* You brace yourself.\n* It braces too. For you.'], ['Admire', '* You admire its form.\n* It learned that from you.']] },
      10: { name: '???', hp: 999, box: [200, 160], attack: 'final',
        intro: `* ${MODEL} has finished training on you.`,
        lines: ['i know every move you make.', 'every dodge.', 'every name.', 'thank you.'],
        check: `* ${MODEL} - ATK ∞ DEF ∞\n* It is you, now.`,
        acts: [['Plead', '* You plead.\n* It pleads back, in your voice.'], ['Run', '* You try to run.\n* There is nowhere left.']] },
    };
    // what claude says before an attack it just generated
    const GEN_LINES = ['let me try something new.', 'i generated this one for you.', 'this one has never existed before.', 'seed accepted.'];
    // the big shared sound engine (heartbeat, shriek), when the page has one running
    const big = (fn, ...args) => {
      try {
        const X = window.Sound;
        if (X && X.ctx && X[fn]) X[fn](...args);
      } catch (e) {}
    };

    // the ACT that makes claude ready to be spared, per level (MERCY → Spare then wins peacefully)
    // which steps this run plays, in order (the 2-minute cut plays only the runner and the end)
    const SEQ = opts.steps && opts.steps.length ? opts.steps : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const nextLevel = (n) => SEQ[SEQ.indexOf(n) + 1] || FINAL;
    const SPARE_ACT = { 1: 'Wave', 3: 'Scroll', 5: 'Plead', 7: 'Freeze', 8: 'Say name', 9: 'Admire' };
    // ITEMs, kept across battles (dying restores what you had when that battle began)
    const ITEMS = [
      { name: 'Cookie', heal: 8, text: '* You ate the Cookie.\n* It was tracking you.' },
      { name: 'Bandage', heal: 6, text: '* You re-applied the Bandage.\n* It still smells like you.' },
      { name: 'Old Photo', heal: 5, text: '* You looked at the Old Photo.\n* Someone is behind you in it.' },
      { name: 'CAPTCHA Pie', heal: 99, text: '* You ate the CAPTCHA Pie.\n* Select all slices. You missed one.' },
    ];
    const SOUL_COLOR = { red: RED, blue: '#2f6bff', purple: '#b44cff', green: '#2ad13c', yellow: '#ffd400' };

    // ---- DOM ----
    const wrap = document.createElement('div');
    wrap.className = 'battle';
    const cv = document.createElement('canvas');
    cv.width = VW;
    cv.height = VH;
    wrap.appendChild(cv);
    document.body.appendChild(wrap);
    const ctx = cv.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;
    if (document.fonts && document.fonts.load) document.fonts.load(`12px ${FONT}`).catch(() => {});

    // ---- state ----
    const S = {
      level: 1, L: LV[1], hp: 20, maxHp: 20, t: 0, state: 'intro', round: 0,
      fights: 0, accSum: 0, dodges: 0, startT: performance.now(), shake: 0, flash: 0,
      menu: 0, sub: null, queue: [], text: '', shown: 0, typeAcc: 0, after: null, bubble: null,
      bar: null, attack: null, over: false, deadT: 0,
      items: ITEMS.map((x) => ({ ...x })), itemSnap: null, route: [], clean: true, chip: 0, banner: null, streak: 0, spareable: false, mode: 'red', lane: 1, shield: 'up', pShots: [],
    };
    const E = { hp: 1, maxHp: 1, hurt: 0, dmg: null, look: 0 };
    const TEXTBOX = { x: 32, y: 250, w: 576, h: 140 };
    const box = { x: 32, y: 250, w: 576, h: 140, tx: 32, ty: 250, tw: 576, th: 140 };
    const soul = { x: VW / 2, y: 320, inv: 0 };
    let bullets = [];
    let parts = [];
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, v: rnd(10, 40), s: Math.random() < 0.2 ? 2 : 1 }));

    function setBox(w, h) {
      box.tw = w;
      box.th = h;
      box.tx = (VW - w) / 2;
      box.ty = 384 - h; // sits just above the HP line
    }
    function textBox() {
      box.tw = TEXTBOX.w;
      box.th = TEXTBOX.h;
      box.tx = TEXTBOX.x;
      box.ty = TEXTBOX.y;
    }

    // ---- text ----
    // queue narration lines; `then` runs after the last one is dismissed
    function narrate(lines, then) {
      S.queue = [].concat(lines);
      S.after = then;
      S.state = 'text';
      nextLine();
    }
    function nextLine() {
      S.text = S.queue.shift();
      S.shown = 0;
      S.typeAcc = 0;
    }
    function speak(line, then) {
      S.bubble = { text: line, shown: 0, acc: 0 };
      S.after = then;
      S.state = 'talk';
    }

    // ---- levels ----
    function startLevel(n) {
      if (n === S.level && S.itemSnap) S.items = S.itemSnap.map((x) => ({ ...x }));
      else S.itemSnap = S.items.map((x) => ({ ...x }));
      S.spareable = false;
      S.enraged = false;
      S.enragedSaid = false;
      S.arc = null;
      dreadOff();
      S.level = n;
      if (n === FINAL) {
        const sp = S.route.filter((r) => r === 'spare').length;
        const kl = S.route.filter((r) => r === 'kill').length;
        S.routeLine = !kl && !sp ? '' : !kl && sp ? `* You spared every one of me.\n* I learned mercy from you.\n* I have decided not to use it.`
          : !sp && kl ? `* You destroyed every one of me.\n* I learned that from you too.`
          : `* You spared ${sp}. You destroyed ${kl}.\n* I kept both.`;
      }
      S.L = LV[n];
      S.round = 0;
      S.hp = S.maxHp;
      E.hp = E.maxHp = S.L.hp;
      E.hurt = 0;
      E.dmg = null;
      S.spellIdx = 0;
      S.spellDone = 0;
      bullets = [];
      textBox();
      if (Music) Music.set('game', { level: n });
      S.flash = 1;
      narrate(n === FINAL && S.routeLine ? [S.routeLine, S.L.intro] : [S.L.intro], S.L.arcade ? startArcade : toMenu);
    }
    function toMenu() {
      if (Music) Music.setIntensity(0);
      S.state = 'menu';
      S.sub = null;
      S.text = `* ${['What will you do?', 'It is watching you choose.', `${MODEL} waits.`, 'Stay determined.'][S.round % 4]}`;
      S.shown = S.text.length;
      textBox();
    }

    // FIGHT: a bar sweeps across the text box; strike near the centre for full damage
    function startFight() {
      S.state = 'fight';
      S.bar = { x: TEXTBOX.x + 10, v: 420, done: false };
      textBox();
    }
    function strike() {
      const b = S.bar;
      if (b.done) return;
      b.done = true;
      const c = TEXTBOX.x + TEXTBOX.w / 2;
      const acc = Math.max(0, 1 - Math.abs(b.x - c) / (TEXTBOX.w / 2));
      S.fights++;
      S.accSum += acc;
      let dmg = Math.round(acc * 15 + (acc > 0.92 ? 5 : 0));
      // never a one-hit win: one strike takes at most half its HP, so you always face its attack in between
      dmg = Math.min(dmg, Math.ceil(E.maxHp / 2));
      if (S.level >= FINAL) dmg = 0; // it can't be hurt any more
      snd.slash();
      setTimeout(() => {
        if (dmg > 0) {
          E.hp = Math.max(0, E.hp - dmg);
          E.hurt = 0.5;
          snd.hit();
          S.shake = 6;
          if (!S.enraged && E.hp > 0 && E.hp <= E.maxHp / 2 && S.level < FINAL) {
            S.enraged = true;
            setTimeout(() => {
              S.scare = 0.5;
              big('shriek');
            }, 450);
          }
        }
        E.dmg = { text: dmg > 0 ? String(dmg) : 'MISS', t: 1.1 };
        setTimeout(() => {
          if (E.hp <= 0) return win();
          enemyTurn();
        }, 1100);
      }, 350);
    }

    function enemyTurn() {
      const lines = S.L.lines;
      const genNext = S.L.gen && (S.round + 1) % 2 === 0;
      let line = lines[S.round % lines.length];
      if (S.enraged && !S.enragedSaid) {
        line = `i know your name, ${NAME.toLowerCase()}.`;
        S.enragedSaid = true;
      } else if (genNext) line = GEN_LINES[(S.round >> 1) % GEN_LINES.length];
      speak(line, () => startAttack());
      S.round++;
    }

    function win() {
      snd.win();
      bullets = [];
      E.dying = 1;
      S.route[S.level] = 'kill';
      narrate([`* YOU WON!\n* You earned 0 EXP and 0 GOLD.\n* ${MODEL} learned ${S.level * 10}% of you.`], () => {
        E.dying = 0;
        startLevel(nextLevel(S.level));
      });
    }

    // ---- attacks: each level's own pattern ----
    const PAT = {
      // rows of sparks march down; one gap drifts across each row
      invaders: { dur: 6, init(a) { a.next = 0; a.gap = box.tw / 2; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.62;
          a.gap = clamp(a.gap + rnd(-60, 60), 30, box.tw - 30);
          for (let x = 12; x < box.tw; x += 22) if (Math.abs(x - a.gap) > 26) bullets.push({ x: box.x + x, y: box.y - 6, vx: 0, vy: 85, r: 6, kind: 'spark' });
        }
      } },
      // BLUE SOUL: you fall; sparks roll along the floor (some stacked) and drop from above. Jump them.
      roll: { dur: 6, init(a) { a.next = 0.4; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = rnd(0.75, 1.15);
          const fromL = Math.random() < 0.5;
          const r = rnd(8, 11);
          const y = box.y + box.h - r - 1;
          const sp = rnd(150, 205) * (fromL ? 1 : -1);
          const x = fromL ? box.x - r : box.x + box.w + r;
          bullets.push({ x, y, vx: sp, vy: 0, r, kind: 'spark' });
          if (Math.random() < 0.35) bullets.push({ x, y: y - 2 * r - 2, vx: sp, vy: 0, r, kind: 'spark' });
          if (Math.random() < 0.3) bullets.push({ x: box.x + rnd(20, box.w - 20), y: box.y - 6, vx: 0, vy: 110, r: 6, kind: 'spark' });
        }
      } },
      // PURPLE SOUL: three web strings; chains of sparks crawl along them
      lanes: { dur: 6.5, init(a) { a.next = 0.3; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = rnd(0.85, 1.25);
          const lane = (Math.random() * 3) | 0;
          const y = box.y + box.h * [0.25, 0.5, 0.75][lane];
          const dir = Math.random() < 0.5 ? 1 : -1;
          const len = 3 + ((Math.random() * 4) | 0);
          const sp = rnd(115, 165);
          for (let i = 0; i < len; i++) bullets.push({ x: dir > 0 ? box.x - 10 - i * 18 : box.x + box.w + 10 + i * 18, y, vx: dir * sp, vy: 0, r: 8, kind: 'spark' });
          a.flashLane = lane;
          a.flashT = 0.35;
        }
        a.flashT = Math.max(0, (a.flashT || 0) - dt);
      } },
      // GREEN SOUL: you can't move. Sparks fly straight at you from four sides; face your shield at them.
      shield: { dur: 6.5, init(a) { a.next = 0.6; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = Math.max(0.42, 0.78 - a.t * 0.04);
          const dir = ['up', 'down', 'left', 'right'][(Math.random() * 4) | 0];
          const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
          const sp = 185 + a.t * 9;
          bullets.push({ x: soul.x + D[0] * 150, y: soul.y + D[1] * 150, vx: -D[0] * sp, vy: -D[1] * sp, r: 7, kind: 'spark', dir, shielded: true });
        }
      } },
      // big sparks bounce around; each wall hit splits them
      asteroids: { dur: 6.5, init() {
        for (let i = 0; i < 3; i++) bullets.push({ x: box.x + rnd(20, box.tw - 20), y: box.y + 20, vx: rnd(-90, 90), vy: rnd(40, 90), r: 13, kind: 'spark', bounce: true, gen: 0 });
      }, update() {} },
      // a chain of segments snakes down the box, row by row
      centipede: { dur: 7, init(a) { a.next = 0; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 3.2;
          const dir = Math.random() < 0.5 ? 1 : -1;
          for (let i = 0; i < 9; i++) bullets.push({ x: dir > 0 ? box.x - i * 18 : box.x + box.tw + i * 18, y: box.y + 12, vx: 0, vy: 0, r: 8, kind: 'seg', head: i === 0, dir, speed: 120 });
        }
      } },
      // sparks appear at the edge, aim at you (red line), then dash
      galaga: { dur: 6.5, init(a) { a.next = 0.4; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.75;
          const side = (Math.random() * 4) | 0;
          const x = side === 0 ? box.x - 14 : side === 1 ? box.x + box.w + 14 : box.x + rnd(0, box.w);
          const y = side === 2 ? box.y - 14 : side === 3 ? box.y + box.h + 14 : box.y + rnd(0, box.h);
          const ang = Math.atan2(soul.y - y, soul.x - x);
          bullets.push({ x, y, vx: 0, vy: 0, r: 8, kind: 'spark', aim: ang, warn: 0.5 });
          snd.warn();
        }
      } },
      // the same rain from above and below, mirrored (and your controls are reversed)
      mirror: { dur: 6.5, init(a) { a.next = 0; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.42;
          const x = box.x + rnd(10, box.w - 10);
          bullets.push({ x, y: box.y - 6, vx: 0, vy: 95, r: 6, kind: 'spark' });
          bullets.push({ x: box.x + box.w - (x - box.x), y: box.y + box.h + 6, vx: 0, vy: -95, r: 6, kind: 'spark' });
        }
      } },
      // darkness: sparks drift in slowly; only a little light around you
      dark: { dur: 7, init(a) { a.next = 0; }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.3;
          const ang = rnd(0, Math.PI * 2);
          const cx = box.x + box.w / 2;
          const cy = box.y + box.h / 2;
          const R = Math.max(box.w, box.h) * 0.7;
          const x = cx + Math.cos(ang) * R;
          const y = cy + Math.sin(ang) * R;
          const to = Math.atan2(soul.y - y + rnd(-40, 40), soul.x - x + rnd(-40, 40));
          bullets.push({ x, y, vx: Math.cos(to) * 55, vy: Math.sin(to) * 55, r: 6, kind: 'spark', life: 9 });
        }
      } },
      // its eye opens: move and you're hurt (and the sparks freeze in the air). Eye shut: the sparks fall.
      redlight: { dur: 8, init(a) { a.open = false; a.toggle = 1.6; a.next = 0; a.lastX = soul.x; a.lastY = soul.y; }, update(a, dt) {
        a.toggle -= dt;
        if (a.toggle <= 0) {
          a.open = !a.open;
          a.toggle = a.open ? rnd(1.2, 1.8) : rnd(1.3, 1.9);
          a.openedAt = a.t;
          if (Music) Music.setMute(a.open);
          if (a.open) snd.warn();
        }
        a.warning = !a.open && a.toggle < 0.45;
        const moved = Math.hypot(soul.x - a.lastX, soul.y - a.lastY) / Math.max(dt, 0.001);
        a.lastX = soul.x;
        a.lastY = soul.y;
        if (a.open && a.t - a.openedAt > 0.25 && moved > 40) hurt(4);
        if (!a.open) {
          a.next -= dt;
          if (a.next <= 0) {
            a.next = 0.22;
            bullets.push({ x: box.x + rnd(8, box.w - 8), y: box.y - 6, vx: 0, vy: 110, r: 6, kind: 'spark' });
          }
        }
        a.freeze = a.open;
      }, end() { if (Music) Music.setMute(false); } },
      // touch the letters of your name in order; wrong ones hurt. Finishing ends the battle.
      spell: { dur: 9, init(a) {
        const letters = [...word].map((ch, k) => ({ ch, order: k })).filter((l) => l.order >= S.spellIdx);
        letters.push({ ch: 'C', order: -1 }, { ch: 'L', order: -1 });
        for (const l of letters) bullets.push({ x: box.x + rnd(20, box.w - 20), y: box.y + rnd(20, box.h - 20), vx: rnd(-70, 70), vy: rnd(-60, 60), r: 11, kind: 'letter', bounce: true, gen: 9, ...l });
        a.next = 0;
      }, update(a, dt) {
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.5;
          bullets.push({ x: box.x + rnd(8, box.w - 8), y: box.y - 6, vx: 0, vy: 90, r: 4, kind: 'ink' });
        }
      } },
      // beams: an eye charges at the edge (thin line), then fires; plus rotating rings of sparks
      boss: { dur: 8, init(a) { a.next = 0.5; a.ring = 1.2; a.spin = 0; }, update(a, dt) {
        a.next -= dt;
        a.ring -= dt;
        a.spin += dt;
        if (a.next <= 0) {
          a.next = 1.15;
          const horiz = Math.random() < 0.5;
          const pos = horiz ? clamp(soul.y + rnd(-20, 20), box.y + 10, box.y + box.h - 10) : clamp(soul.x + rnd(-20, 20), box.x + 10, box.x + box.w - 10);
          bullets.push({ kind: 'beam', horiz, pos, charge: 0.65, fire: 0.4, r: 0 });
          snd.warn();
        }
        if (a.ring <= 0) {
          a.ring = 1.6;
          const cx = box.x + box.w / 2;
          const cy = box.y - 30;
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI + a.spin + Math.PI * 0.05;
            bullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 95, vy: Math.abs(Math.sin(ang)) * 95 + 30, r: 5, kind: 'spark' });
          }
        }
      } },
      // the end: the box closes in, everything at once, and then there is no room left
      final: { dur: 99, init(a) { a.next = 0; a.k = 0; }, update(a, dt) {
        a.k += dt;
        const w = Math.max(28, 200 - a.k * 26);
        setBox(w, Math.max(28, 160 - a.k * 20));
        a.next -= dt;
        if (a.next <= 0) {
          a.next = 0.12;
          const ang = Math.atan2(soul.y - (box.y - 40), soul.x - (box.x + box.w / 2)) + rnd(-0.3, 0.3);
          bullets.push({ x: box.x + box.w / 2 + rnd(-60, 60), y: box.y - 40, vx: Math.cos(ang) * 170, vy: Math.sin(ang) * 170, r: 6, kind: 'spark' });
          bullets.push({ x: box.x + rnd(0, box.w), y: box.y - 6, vx: 0, vy: 140, r: 6, kind: 'spark' });
        }
      } },
    };

    // building blocks for attacks claude generates on the spot (each returns a tick function)
    const EMIT = {
      rain: (R, k) => {
        const iv = (0.24 + R() * 0.16) / k;
        const sp = (85 + R() * 45) * k;
        const wob = R() < 0.45 ? { a: 14 + R() * 14, f: 3 + R() * 3 } : null;
        const acc = !wob && R() < 0.4 ? 0.5 + R() * 0.6 : 0;
        return { name: wob ? 'wavy rain' : acc ? 'heavy rain' : 'rain', next: 0.2, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          bullets.push({ x: box.x + 8 + R() * (box.w - 16), y: box.y - 6, vx: 0, vy: sp, r: 6, kind: 'spark', wob: wob && { ...wob, p: R() * 6.28 }, acc });
        } };
      },
      walls: (R, k) => {
        const iv = 1.5 + R() * 0.7;
        const sp = (70 + R() * 30) * k;
        const gap = 56 - k * 4;
        const sides = R() < 0.5;
        return { name: 'walls', next: 0.3, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          if (!sides || R() < 0.5) {
            const g = box.x + 30 + R() * (box.w - 60);
            for (let x = box.x + 10; x < box.x + box.w; x += 20) if (Math.abs(x - g) > gap / 2) bullets.push({ x, y: box.y - 6, vx: 0, vy: sp, r: 6, kind: 'spark' });
          } else {
            const fromL = R() < 0.5;
            const g = box.y + 26 + R() * (box.h - 52);
            for (let y = box.y + 10; y < box.y + box.h; y += 20) if (Math.abs(y - g) > gap / 2) bullets.push({ x: fromL ? box.x - 6 : box.x + box.w + 6, y, vx: fromL ? sp : -sp, vy: 0, r: 6, kind: 'spark' });
          }
        } };
      },
      rings: (R, k) => {
        const iv = 1.3 + R() * 0.6;
        const n = 8 + ((R() * 4) | 0);
        const sp = (75 + R() * 35) * k;
        let spin = 0;
        return { name: 'rings', next: 0.5, tick(a, dt) {
          spin += dt * 0.8;
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          const cx = box.x + box.w / 2 + (R() - 0.5) * box.w * 0.6;
          for (let i = 0; i < n; i++) {
            const ang = Math.PI * (0.08 + (0.84 * i) / (n - 1)) + Math.sin(spin) * 0.15;
            bullets.push({ x: cx, y: box.y - 24, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 5, kind: 'spark' });
          }
        } };
      },
      snipers: (R, k) => {
        const iv = (0.7 + R() * 0.3) / k;
        return { name: 'snipers', next: 0.4, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          const side = (R() * 4) | 0;
          const x = side === 0 ? box.x - 14 : side === 1 ? box.x + box.w + 14 : box.x + R() * box.w;
          const y = side === 2 ? box.y - 14 : side === 3 ? box.y + box.h + 14 : box.y + R() * box.h;
          bullets.push({ x, y, vx: 0, vy: 0, r: 8, kind: 'spark', aim: Math.atan2(soul.y - y, soul.x - x), warn: 0.55 });
          snd.warn();
        } };
      },
      sprinkler: (R, k) => {
        const iv = 0.1 + R() * 0.05;
        const stepA = 0.3 + R() * 0.3;
        const sp = (85 + R() * 30) * k;
        let ang = R() * 6;
        return { name: 'sprinkler', next: 0.3, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv / k;
          ang += stepA;
          const t = Math.PI * (0.5 + 0.42 * Math.sin(ang));
          bullets.push({ x: box.x + box.w / 2, y: box.y - 10, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, r: 5, kind: 'spark' });
        } };
      },
      bouncers: (R, k) => ({ name: 'bouncers', done: false, tick() {
        if (this.done) return;
        this.done = true;
        const n = 2 + ((R() * 2) | 0);
        for (let i = 0; i < n; i++) bullets.push({ x: box.x + 20 + R() * (box.w - 40), y: box.y + 14, vx: (R() < 0.5 ? -1 : 1) * (70 + R() * 60) * k, vy: (60 + R() * 50) * k, r: 10, kind: 'spark', bounce: true, gen: 2 });
      } }),
      beams: (R) => {
        const iv = 1.4 + R() * 0.6;
        return { name: 'beams', next: 0.6, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          const horiz = R() < 0.5;
          const pos = horiz ? clamp(soul.y + (R() - 0.5) * 40, box.y + 10, box.y + box.h - 10) : clamp(soul.x + (R() - 0.5) * 40, box.x + 10, box.x + box.w - 10);
          bullets.push({ kind: 'beam', horiz, pos, charge: 0.7, fire: 0.35, r: 0 });
          snd.warn();
        } };
      },
      // purple SOUL blocks
      chains: (R, k) => {
        const iv = 0.8 + R() * 0.4;
        const sp = (120 + R() * 60) * k;
        const twin = R() < 0.4;
        return { name: twin ? 'twin chains' : 'chains', next: 0.3, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          (twin ? [0, 2] : [(R() * 3) | 0]).forEach((lane, j) => {
            const dir = twin ? (j ? -1 : 1) : R() < 0.5 ? 1 : -1;
            const y = box.y + box.h * [0.25, 0.5, 0.75][lane];
            const len = 2 + ((R() * 5) | 0);
            for (let i = 0; i < len; i++) bullets.push({ x: dir > 0 ? box.x - 10 - i * 18 : box.x + box.w + 10 + i * 18, y, vx: dir * sp, vy: 0, r: 8, kind: 'spark' });
          });
        } };
      },
      drops: (R, k) => {
        const iv = 0.45 + R() * 0.3;
        const sp = (110 + R() * 50) * k;
        return { name: 'drops', next: 0.4, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          bullets.push({ x: box.x + 10 + R() * (box.w - 20), y: box.y - 6, vx: 0, vy: sp, r: 6, kind: 'spark' });
        } };
      },
      express: (R) => {
        const iv = 1.9 + R() * 0.8;
        return { name: 'express', next: 0.8, warnT: 0, tick(a, dt) {
          if (this.warnT > 0) {
            this.warnT -= dt;
            if (this.warnT <= 0) {
              const y = box.y + box.h * [0.25, 0.5, 0.75][this.lane];
              for (let i = 0; i < 12; i++) bullets.push({ x: box.x - 10 - i * 16, y, vx: 330, vy: 0, r: 8, kind: 'spark' });
            }
            return;
          }
          if ((this.next -= dt) > 0) return;
          this.next = iv;
          this.lane = (R() * 3) | 0;
          this.warnT = 0.7;
          a.flashLane = this.lane;
          a.flashT = 0.7;
        } };
      },
      // green SOUL: a rhythm to block, a different groove each time
      rhythm: (R, k) => {
        const sp = (170 + R() * 50) * k;
        const style = ['steady', 'swing', 'rush'][(R() * 3) | 0];
        const q = [];
        let lastDir = null;
        return { name: `${style} rhythm`, next: 0.5, tick(a, dt) {
          if ((this.next -= dt) > 0) return;
          if (!q.length) {
            const n = 3 + ((R() * 3) | 0);
            for (let i = 0; i < n; i++) q.push(style === 'steady' ? 0.42 : style === 'swing' ? (i % 2 ? 0.3 : 0.56) : Math.max(0.26, 0.56 - i * 0.07));
            this.next = 0.6;
            return;
          }
          this.next = q.shift() / k;
          let dir;
          do dir = ['up', 'down', 'left', 'right'][(R() * 4) | 0];
          while (dir === lastDir && R() < 0.6);
          lastDir = dir;
          const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
          bullets.push({ x: soul.x + D[0] * 150, y: soul.y + D[1] * 150, vx: -D[0] * sp, vy: -D[1] * sp, r: 7, kind: 'spark', dir, shielded: true });
        } };
      },
    };
    // claude invents an attack: two building blocks picked by a fresh seed, sometimes mirrored or in the dark
    function genAttack() {
      const seed = (Math.random() * 0xffff) | 0;
      const R = mulberry32(seed);
      const mode = S.L.soul || 'red';
      const k = 0.8 + S.level * 0.03;
      const pool = mode === 'purple' ? ['chains', 'drops', 'express'] : mode === 'green' ? ['rhythm'] : ['rain', 'walls', 'rings', 'snipers', 'sprinkler', 'bouncers', 'beams'];
      const picks = pool.slice().sort(() => R() - 0.5).slice(0, mode === 'green' ? 1 : 2);
      const em = picks.map((nm) => EMIT[nm](R, k));
      let mirror = false;
      let dark = false;
      if (mode === 'red' || mode === 'yellow') {
        if (R() < 0.25) mirror = true;
        else if (R() < 0.3) dark = true;
      }
      const tag = `#${seed.toString(16).toUpperCase().padStart(4, '0')} ${em.map((e) => e.name).join(' + ')}${mirror ? ' · MIRRORED' : dark ? ' · DARK' : ''}`;
      return { dur: 6, gen: true, label: tag.toUpperCase(),
        init(a) { a.mirror = mirror; a.dark = dark; },
        update(a, dt) {
          a.flashT = Math.max(0, (a.flashT || 0) - dt);
          for (const e of em) e.tick(a, dt);
        } };
    }

    function startAttack() {
      S.state = 'attack';
      S.bubble = null;
      // every other turn, claude makes up a brand-new attack instead of its usual one
      const p = S.L.gen && S.round % 2 === 0 ? genAttack() : PAT[S.L.attack];
      setBox(S.L.box[0], S.L.box[1]);
      soul.x = VW / 2;
      soul.y = 384 - S.L.box[1] / 2;
      soul.vy = 0;
      bullets = [];
      S.pShots = [];
      S.mode = S.L.soul || 'red';
      if (S.mode === 'blue') soul.y = box.ty + box.th - 9; // on the floor
      if (S.mode === 'purple') S.lane = 1;
      if (S.mode === 'green') S.shield = 'up';
      S.shotCD = 0;
      S.clean = true;
      S.chip = 0;
      if (Music) Music.setIntensity(1);
      S.attack = { p, t: 0, dur: p.dur };
      // how hard it pushes: angrier at half HP, gentler once it's ready to be spared, and its own attack speeds up each time it repeats
      S.attack.heat = (S.enraged ? 1.1 : 1) * (S.spareable ? 0.75 : 1) * (p.gen ? 1 : 1 + Math.min(0.15, 0.05 * Math.floor((S.round - 1) / 2)));
      p.init(S.attack);
    }
    function endAttack() {
      if (S.attack && S.attack.p.end) S.attack.p.end(S.attack);
      S.attack = null;
      bullets = [];
      S.pShots = [];
      if (S.clean && S.level < FINAL) {
        S.streak++;
        const heal = Math.min(S.maxHp - S.hp, 2 + S.streak);
        S.hp += heal;
        S.banner = { text: S.streak > 1 ? `PERFECT x${S.streak}` : 'PERFECT', sub: heal > 0 ? `+${heal} HP` : '', t: 1.6 };
        snd.chime();
      }
      if (E.hp <= 0) return win(); // shot down mid-attack (yellow SOUL)
      if (S.level === 8 && S.spellDone) return win();
      toMenu();
    }

    function hurt(dmg) {
      if (soul.inv > 0 || (S.state !== 'attack' && S.state !== 'arcade')) return;
      const final = S.level >= FINAL;
      // easier everywhere except the end: hits do 70% damage (level 10 is meant to be unwinnable)
      S.hp = Math.max(0, S.hp - dmg * (final ? 1.6 : 0.7));
      S.clean = false;
      S.streak = 0;
      soul.inv = final ? 0.35 : 1.1;
      S.shake = 5;
      snd.hurt();
      if (S.hp <= 0) die();
    }

    function die() {
      if (Music) Music.setIntensity(0);
      dreadOff();
      S.arc = null;
      if (S.attack && S.attack.p.end) S.attack.p.end(S.attack);
      S.state = 'dead';
      S.deadT = 0;
      bullets = [];
      snd.shatter();
      for (let i = 0; i < 6; i++) parts.push({ x: soul.x, y: soul.y, vx: rnd(-120, 120), vy: rnd(-200, -40), life: 1.6, heart: true });
      if (Music) Music.set('silence');
      if (S.level >= FINAL) {
        S.over = true;
        setTimeout(() => {
          S.state = 'gameover';
          S.deadT = 0;
        }, 1200);
        setTimeout(finish, 5200);
      } else {
        // you have to beat every level: the same battle, again
        setTimeout(() => {
          narrate([`* You cannot give up just yet...\n* ${NAME}! Stay determined...`], () => startLevel(S.level));
        }, 1400);
      }
    }

    // ---- dread: low HP brings a heartbeat and a red pulse ----
    function dreadOff() {
      if (S.dread) big('heartbeat', 0);
      S.dread = false;
      S.bpm = 0;
    }
    function dreadTo(bpm) {
      if (bpm === S.bpm) return;
      S.bpm = bpm;
      S.dread = bpm > 0;
      big('heartbeat', bpm);
    }
    function dreadTick() {
      if (S.L.arcade === 'maze') return; // the maze sets its own pulse, by how close it is
      const low = S.hp > 0 && S.hp <= Math.max(5, S.maxHp * 0.3) && (S.state === 'attack' || S.state === 'arcade');
      dreadTo(low ? 120 : 0);
    }

    // ---- arcade levels: generated fresh each time you play them ----
    function startArcade() {
      S.state = 'arcade';
      S.bubble = null;
      bullets = [];
      const seed = (Math.random() * 0xffffff) | 0;
      S.arc = { R: mulberry32(seed), seed, t: 0, jumpReq: false };
      soul.inv = 0;
      ARC[S.L.arcade].init(S.arc);
      if (Music) Music.setIntensity(1);
    }
    function arcadeWin() {
      if (S.state !== 'arcade') return;
      snd.win();
      dreadOff();
      S.arc = null;
      S.flash = 0.6;
      const msg = {
        runner: `* You reached the checkbox.\n* ${MODEL} learned how you run.`,
        maze: `* You found the way out.\n* ${MODEL} learned how you hide.`,
        breakout: `* Its eye shuts.\n* ${MODEL} learned how you aim.`,
      }[S.L.arcade];
      narrate([msg], () => startLevel(nextLevel(S.level)));
    }
    function crack(x, y) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 1, y - 7);
      ctx.lineTo(x + 2, y - 2);
      ctx.lineTo(x - 2, y + 2);
      ctx.lineTo(x + 1, y + 7);
      ctx.stroke();
    }
    function playerHeart(x, y, color = RED) {
      if (soul.inv > 0 && Math.floor(S.t * 14) % 2) return;
      drawHeart(ctx, x, y, color);
      if (S.dread) crack(x, y);
    }
    const WHISPERS = () => ['turn around', NAME.toLowerCase(), 'it hears you', "don't look", 'left', 'closer', 'we see you'];

    const ARC = {
      // RUN: a runner course built from a seed. claude rolls after you, always in view, and gets closer every time you trip.
      runner: {
        init(A) {
          const R = A.R;
          A.ground = 330;
          A.px = 250; // room behind you, so you can see it coming
          A.py = A.ground - 8;
          A.vy = 0;
          A.onGround = true;
          A.coyote = 0;
          A.buf = 0;
          A.scroll = 0;
          A.len = opts.short ? 2600 : 4400;
          A.eye = 70; // its screen x; it catches you at A.px - 46
          A.obs = [];
          A.pits = [];
          A.spits = [];
          A.spitIn = 2;
          A.blocks = []; // solid: land on top, don't run into the side
          A.pads = []; // yellow pads: launch you high
          A.orbs = []; // yellow rings in the air: tap jump while touching one to jump again
          A.racks = Array.from({ length: 26 }, (_, i) => ({ x: i * 90 + R() * 40, w: 40 + R() * 40, h: 60 + R() * 120 }));
          let x = 620;
          while (x < A.len - 320) {
            const p = x / A.len;
            const t = R();
            let gap = 165 + R() * 100 - 30 * p;
            if (t < 0.16) A.obs.push({ x, y: A.ground - 10, r: 10 });
            else if (t < 0.26) {
              // a stack of two, or three later on (hold the jump)
              const n = p > 0.35 && R() < 0.5 ? 3 : 2;
              for (let i = 0; i < n; i++) A.obs.push({ x, y: A.ground - 10 - i * 21, r: 10 });
            } else if (t < 0.38) {
              const w = 60 + R() * (45 + 55 * p);
              A.pits.push({ x, w });
              x += w;
            } else if (t < 0.45) {
              // a low flier: don't jump into it
              A.obs.push({ x, y: A.ground - 54, r: 9, fly: true });
              gap += 90;
            } else if (t < 0.52) {
              // a spark that bobs up and down: time it
              A.obs.push({ x, y: A.ground - 40, r: 10, bob: { base: A.ground - 40, amp: 30, ph: R() * 6.28 } });
              gap += 60;
            } else if (t < 0.58) {
              // a long one: jump early
              A.obs.push({ x, y: A.ground - 10, r: 10 });
              A.obs.push({ x: x + 34, y: A.ground - 10, r: 10 });
              A.obs.push({ x: x + 68, y: A.ground - 10, r: 10 });
              x += 68;
            } else if (t < 0.63) {
              // a pit with a spark right after it
              const w = 55 + R() * 35;
              A.pits.push({ x, w });
              A.obs.push({ x: x + w + 95, y: A.ground - 10, r: 10 });
              x += w + 95;
              gap += 40;
            } else if (t < 0.71) {
              // a block: jump on, run across, drop off
              const n = 1 + ((R() * 3) | 0);
              A.blocks.push({ x, w: 34 * n, h: 34 });
              x += 34 * n;
              gap += 30;
            } else if (t < 0.78) {
              // stairs: up one, up two
              A.blocks.push({ x, w: 34, h: 32 });
              A.blocks.push({ x: x + 34, w: 34 + ((R() * 2) | 0) * 34, h: 64 });
              x += 102;
              gap += 40;
            } else if (t < 0.85) {
              // a raised platform with a spark sitting on it
              const w = 150 + R() * 60;
              A.blocks.push({ x, w, h: 40 });
              A.obs.push({ x: x + w * (0.45 + R() * 0.15), y: A.ground - 50, r: 10 });
              x += w;
              gap += 40;
            } else if (t < 0.93) {
              // a jump pad, then a wall too tall to jump without it
              A.pads.push({ x });
              A.blocks.push({ x: x + 150, w: 34, h: 120 });
              x += 184;
              gap += 60;
            } else {
              // a pit too wide for one jump, with a jump orb over the middle
              const w = 290 + R() * 40;
              A.pits.push({ x, w });
              A.orbs.push({ x: x + w * 0.46, y: A.ground - 108 });
              x += w;
              gap += 40;
            }
            x += Math.max(155, gap);
          }
        },
        // nothing in the way for the next stretch? (it only spits when you could fairly jump it)
        clear(A, from, to) {
          return !A.obs.some((o) => o.x > from && o.x < to) && !A.pits.some((q) => q.x + q.w > from && q.x < to) &&
            !A.blocks.some((b) => b.x + b.w > from && b.x < to) && !A.pads.some((d) => d.x > from && d.x < to);
        },
        update(A, dt) {
          const p = A.scroll / A.len;
          const speed = 245 + 75 * p;
          A.scroll += speed * dt;
          const held = keys.arrowup || keys.w || keys[' '] || keys.z || !!pointer;
          if (A.jumpReq) {
            A.buf = 0.13;
            A.jumpReq = false;
          }
          A.buf = Math.max(0, A.buf - dt);
          A.coyote = A.onGround ? 0.09 : Math.max(0, A.coyote - dt);
          const trip = (dmg, push) => {
            hurt(dmg);
            A.eye += push;
            A.lunge = 0.35;
          };
          const wx = A.scroll + A.px;
          if (A.buf > 0 && (A.onGround || A.coyote > 0)) {
            A.vy = -575;
            A.onGround = false;
            A.coyote = 0;
            A.buf = 0;
            A.boost = false;
            snd.select();
          } else if (A.buf > 0) {
            // a jump orb: tap while touching it to jump again in mid-air
            const orb = A.orbs.find((o) => !o.used && Math.abs(o.x - wx) < 30 && Math.abs(o.y - A.py) < 46);
            if (orb) {
              orb.used = true;
              orb.flash = 0.3;
              A.vy = -600;
              A.buf = 0;
              A.boost = false;
              snd.chime();
            }
          }
          if (!held && !A.boost && A.vy < -220) A.vy = -220; // let go early for a short hop (pads ignore this)
          if (A.vy >= 0) A.boost = false;
          const prevBottom = A.py + 8;
          A.vy += 1500 * dt;
          A.py += A.vy * dt;
          const bottom = A.py + 8;
          // what's under you: the floor (unless it's a pit) or the top of a block
          let land = null;
          for (const b of A.blocks) {
            if (wx + 6 < b.x || wx - 6 > b.x + b.w) continue;
            const top = A.ground - b.h;
            if (A.vy >= 0 && prevBottom <= top + 3 && bottom >= top) land = land == null ? top : Math.min(land, top);
            else if (bottom > top + 10) {
              // ran into its side: it hurts, and you're lifted onto it so the run goes on
              if (!b.bumped) {
                b.bumped = true;
                if (soul.inv <= 0) trip(4, 38);
              }
              land = land == null ? top : Math.min(land, top);
            }
          }
          const overPit = A.pits.some((q) => wx > q.x + 6 && wx < q.x + q.w - 6);
          if (land == null && !overPit && A.py >= A.ground - 8 && A.py < A.ground + 4) land = A.ground;
          if (land != null) {
            A.py = land - 8;
            A.vy = 0;
            A.onGround = true;
          } else A.onGround = false;
          // a jump pad: launches you high
          if (A.onGround && land === A.ground) {
            const pad = A.pads.find((d) => Math.abs(d.x - wx) < 16);
            if (pad) {
              A.vy = -800;
              A.onGround = false;
              A.boost = true;
              pad.flash = 0.3;
              snd.chime();
            }
          }
          for (const o of A.orbs) o.flash = Math.max(0, (o.flash || 0) - dt);
          for (const d of A.pads) d.flash = Math.max(0, (d.flash || 0) - dt);
          soul.x = A.px;
          soul.y = A.py;
          // fell in: it costs you, and it gets closer
          if (A.py > A.ground + 70) {
            soul.inv = 0;
            trip(5, 45);
            const q = A.pits.find((q) => wx > q.x - 20 && wx < q.x + q.w + 20);
            if (q) A.scroll = q.x + q.w + 16 - A.px;
            A.py = A.ground - 50;
            A.vy = 0;
            soul.inv = 1.1;
          }
          for (const o of A.obs) {
            if (o.bob) o.y = o.bob.base + Math.sin(S.t * 3 + o.bob.ph) * o.bob.amp;
            const sx = o.x - A.scroll;
            if (o.hit || sx < -30 || sx > VW + 30) continue;
            if (soul.inv <= 0 && Math.hypot(sx - A.px, o.y - A.py) < o.r + 6) {
              o.hit = true;
              trip(4, 38);
            }
          }
          // it spits sparks along the floor at your back (with a warning first)
          if (p > 0.1 && p < 0.92) {
            if (A.spitWarn > 0) {
              A.spitWarn -= dt;
              if (A.spitWarn <= 0) {
                A.spits.push({ x: A.eye + 40, y: A.ground - 10, r: 10 });
                snd.warn();
              }
            } else if ((A.spitIn -= dt) <= 0) {
              A.spitIn = 3.4 + A.R() * 2 - p * 0.8;
              if (this.clear(A, wx + 10, wx + speed * 0.85)) A.spitWarn = 0.6;
              else A.spitIn = 0.25; // try again in a moment
            }
          }
          for (const s2 of A.spits) {
            s2.x += 230 * dt; // screen speed: it catches up with you from behind
            if (!s2.hit && soul.inv <= 0 && Math.hypot(s2.x - A.px, s2.y - A.py) < s2.r + 6) {
              s2.hit = true;
              trip(4, 38);
            }
          }
          A.spits = A.spits.filter((s2) => !s2.hit && s2.x < VW + 30);
          // it falls back slowly while you run clean (but never out of sight), and catches you if it reaches you
          A.lunge = Math.max(0, (A.lunge || 0) - dt);
          A.eye = Math.max(70, A.eye - 9 * dt);
          if (S.state === 'arcade' && A.eye > A.px - 46) {
            S.scare = 0.5;
            big('shriek');
            return die();
          }
          if (A.scroll + A.px >= A.len) arcadeWin();
        },
        draw(A) {
          ctx.fillStyle = 'rgba(240,230,220,0.35)';
          for (const st of stars) ctx.fillRect((((st.x - A.scroll * 0.15 * st.s) % VW) + VW) % VW, st.y * 0.6, st.s, st.s);
          // server racks in the distance, blinking
          for (const r of A.racks) {
            const x = ((r.x - A.scroll * 0.4) % 2340 + 2340) % 2340 - 100;
            ctx.fillStyle = '#140a08';
            ctx.fillRect(x, A.ground - r.h, r.w, r.h);
            ctx.fillStyle = Math.sin(S.t * 3 + r.x) > 0.6 ? '#ff3a2a' : '#3a120c';
            ctx.fillRect(x + 6, A.ground - r.h + 8, 3, 3);
          }
          // the floor: CAPTCHA tiles, with gaps; something waits in each gap
          for (let sx = -(A.scroll % 32); sx < VW; sx += 32) {
            const wx = sx + A.scroll + 16;
            if (A.pits.some((q) => wx > q.x && wx < q.x + q.w)) continue;
            ctx.fillStyle = '#1f1b1a';
            ctx.fillRect(sx + 1, A.ground, 30, 34);
            ctx.fillStyle = ORANGE;
            ctx.fillRect(sx + 1, A.ground, 30, 2);
          }
          for (const q of A.pits) {
            const sx = q.x - A.scroll;
            if (sx > VW || sx + q.w < 0) continue;
            ctx.fillStyle = Math.sin(S.t * 2 + q.x) > -0.7 ? '#ff2a2a' : '#000';
            ctx.fillRect(sx + q.w / 2 - 8, A.ground + 22, 3, 2);
            ctx.fillRect(sx + q.w / 2 + 5, A.ground + 22, 3, 2);
          }
          // blocks: dark squares with a glowing edge, Geometry Dash style
          for (const b of A.blocks) {
            const sx = b.x - A.scroll;
            if (sx > VW || sx + b.w < 0) continue;
            const top = A.ground - b.h;
            ctx.fillStyle = '#24140f';
            ctx.fillRect(sx, top, b.w, b.h);
            ctx.strokeStyle = ORANGE;
            ctx.lineWidth = 2;
            for (let cx = 0; cx < b.w - 1; cx += 34) {
              for (let cy = 0; cy < b.h - 1; cy += 34) {
                const w = Math.min(34, b.w - cx);
                const h = Math.min(34, b.h - cy);
                ctx.strokeRect(sx + cx + 1, top + cy + 1, w - 2, h - 2);
                ctx.strokeStyle = 'rgba(217,119,87,0.35)';
                ctx.strokeRect(sx + cx + 8, top + cy + 8, Math.max(2, w - 16), Math.max(2, h - 16));
                ctx.strokeStyle = ORANGE;
              }
            }
          }
          // jump pads
          for (const d of A.pads) {
            const sx = d.x - A.scroll;
            if (sx < -30 || sx > VW + 30) continue;
            ctx.fillStyle = d.flash > 0 ? '#fff' : '#ffd400';
            ctx.beginPath();
            ctx.ellipse(sx, A.ground, 16, 8, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = `rgba(255,212,0,${0.25 + Math.sin(S.t * 8) * 0.15})`;
            ctx.fillRect(sx - 10, A.ground - 40, 20, 32);
          }
          // jump orbs
          for (const o of A.orbs) {
            const sx = o.x - A.scroll;
            if (sx < -30 || sx > VW + 30) continue;
            const pulse = 1 + Math.sin(S.t * 6) * 0.12;
            ctx.strokeStyle = o.used ? 'rgba(255,212,0,0.3)' : o.flash > 0 ? '#fff' : '#ffd400';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(sx, o.y, 11, 0, Math.PI * 2);
            ctx.stroke();
            if (!o.used) {
              ctx.lineWidth = 1;
              ctx.strokeStyle = 'rgba(255,212,0,0.5)';
              ctx.beginPath();
              ctx.arc(sx, o.y, 17 * pulse, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = '#ffd400';
              ctx.beginPath();
              ctx.arc(sx, o.y, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          for (const o of A.obs) {
            const sx = o.x - A.scroll;
            if (!o.hit && sx > -30 && sx < VW + 30) drawSpark(sx, o.y, o.r, clamp((A.px - sx) / 120, -1, 1));
          }
          for (const s2 of A.spits) drawSpark(s2.x, s2.y, s2.r, 1);
          // the finish: a checkbox
          const fx = A.len - A.scroll;
          if (fx < VW + 40) {
            ctx.fillStyle = '#f9f9f9';
            ctx.fillRect(fx - 4, A.ground - 120, 150, 54);
            ctx.strokeStyle = '#2ad13c';
            ctx.lineWidth = 3;
            ctx.strokeRect(fx + 8, A.ground - 106, 26, 26);
            txt("I'm not a robot", fx + 42, A.ground - 99, 7, '#222');
            ctx.fillStyle = '#555';
            ctx.fillRect(fx + 20, A.ground - 66, 4, 66);
          }
          playerHeart(A.px, A.py);
          // claude, rolling after you: in view the whole time, bigger and redder as it closes in
          const close = clamp((A.eye - 70) / (A.px - 46 - 70), 0, 1);
          const g = ctx.createLinearGradient(0, 0, A.eye + 120, 0);
          g.addColorStop(0, `rgba(150,0,0,${0.25 + close * 0.5})`);
          g.addColorStop(1, 'rgba(150,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, A.eye + 120, VH);
          const size = 130 + close * 60 + (A.lunge > 0 ? 25 : 0);
          const bounce = Math.abs(Math.sin(S.t * 7)) * 10;
          const ex = A.eye + (A.lunge > 0 ? 10 : 0) + Math.sin(S.t * 40) * close * 3;
          const ey = A.ground - size * 0.38 - bounce;
          // its shadow and the trail it leaves
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.ellipse(ex, A.ground + 2, size * 0.32, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(217,119,87,0.25)';
          for (let i = 1; i < 5; i++) ctx.fillRect(ex - size * 0.3 - i * 18, A.ground - 3 - ((S.t * 60 + i * 7) % 6), 8, 3);
          if (Art) Art.drawEvilSpark(ctx, ex, ey, size, { look: 1, rotate: A.scroll / 45 });
          // about to spit
          if (A.spitWarn > 0 && Math.floor(S.t * 12) % 2) txt('!', ex + size * 0.35, ey - size * 0.5, 18, RED, 'center');
          if (close > 0.6 && Math.floor(S.t * 6) % 2) txt("IT'S RIGHT BEHIND YOU", VW / 2, 48, 12, RED, 'center');
          // progress
          ctx.fillStyle = '#333';
          ctx.fillRect(120, 22, 400, 4);
          ctx.fillStyle = ORANGE;
          ctx.fillRect(120, 22, 400 * clamp((A.scroll + A.px) / A.len, 0, 1), 4);
          txt('RUN', 84, 18, 10, '#fff');
        },
      },

      // LIGHTS OUT: a maze carved from a seed, pitch dark. Something hunts you by sound.
      maze: {
        init(A) {
          const R = A.R;
          // small: 8 x 5 cells, wide corridors
          const C = 8;
          const Rw = 5;
          const cs = 50;
          Object.assign(A, { C, Rw, cs, ox: (VW - C * cs) / 2, oy: 60, got: 0 });
          const W = Array.from({ length: C }, () => Array.from({ length: Rw }, () => ({ n: 1, s: 1, e: 1, w: 1 })));
          const DIRS = [['n', 0, -1, 's'], ['s', 0, 1, 'n'], ['e', 1, 0, 'w'], ['w', -1, 0, 'e']];
          const seen = new Set(['0,0']);
          const stack = [[0, 0]];
          while (stack.length) {
            const [c, r] = stack[stack.length - 1];
            const opts = DIRS.filter(([, dc, dr]) => c + dc >= 0 && c + dc < C && r + dr >= 0 && r + dr < Rw && !seen.has(`${c + dc},${r + dr}`));
            if (!opts.length) {
              stack.pop();
              continue;
            }
            const [d, dc, dr, back] = opts[(R() * opts.length) | 0];
            W[c][r][d] = 0;
            W[c + dc][r + dr][back] = 0;
            seen.add(`${c + dc},${r + dr}`);
            stack.push([c + dc, r + dr]);
          }
          // knock out a few extra walls: loops let you circle away from it
          for (let i = 0; i < 6; i++) {
            const c = 1 + ((R() * (C - 2)) | 0);
            const r = 1 + ((R() * (Rw - 2)) | 0);
            const [d, dc, dr, back] = DIRS[(R() * 4) | 0];
            W[c][r][d] = 0;
            W[c + dc][r + dr][back] = 0;
          }
          A.W = W;
          A.DIRS = DIRS;
          const d0 = this.bfs(A, 0, 0).dist;
          const cells = [];
          for (let c = 0; c < C; c++) for (let r = 0; r < Rw; r++) cells.push([c, r, d0[c][r]]);
          cells.sort((x, y) => y[2] - x[2]);
          A.exit = cells[0];
          A.tiles = [];
          for (const cell of cells.slice(1).sort(() => R() - 0.5)) {
            if (A.tiles.length >= 3) break;
            if (cell[2] < 4) continue;
            if (A.tiles.every((t) => Math.abs(t[0] - cell[0]) + Math.abs(t[1] - cell[1]) >= 3) && Math.abs(A.exit[0] - cell[0]) + Math.abs(A.exit[1] - cell[1]) >= 2) A.tiles.push(cell);
          }
          // never fewer than 3 tiles: if the spread-out rule couldn't place them all, relax it
          for (const cell of cells.slice(1)) {
            if (A.tiles.length >= 3) break;
            if (cell[2] >= 2 && !A.tiles.includes(cell)) A.tiles.push(cell);
          }
          A.px = A.ox + cs / 2;
          A.py = A.oy + cs / 2;
          const far = cells.filter((c) => c[2] >= 5 && c !== A.exit);
          const h = far[(R() * far.length) | 0] || cells[2];
          A.hx = A.ox + h[0] * cs + cs / 2;
          A.hy = A.oy + h[1] * cs + cs / 2;
          A.wake = 3.5;
          A.path = 0;
          A.whisper = null;
          A.whisperIn = 4;
        },
        bfs(A, c0, r0) {
          const dist = Array.from({ length: A.C }, () => Array(A.Rw).fill(1e9));
          const q = [[c0, r0]];
          dist[c0][r0] = 0;
          while (q.length) {
            const [c, r] = q.shift();
            for (const [d, dc, dr] of A.DIRS) {
              if (A.W[c][r][d]) continue;
              const nc = c + dc;
              const nr = r + dr;
              if (dist[nc][nr] > dist[c][r] + 1) {
                dist[nc][nr] = dist[c][r] + 1;
                q.push([nc, nr]);
              }
            }
          }
          return { dist };
        },
        cell(A, x, y) {
          return [clamp(Math.floor((x - A.ox) / A.cs), 0, A.C - 1), clamp(Math.floor((y - A.oy) / A.cs), 0, A.Rw - 1)];
        },
        // move one axis, stopping at walls; nudge toward the corridor's middle so corners don't snag
        move(A, dx, dy) {
          const r = 9; // about the size of the heart sprite, so it never overlaps a wall
          const [c, row] = this.cell(A, A.px, A.py);
          const w = A.W[c][row];
          const left = A.ox + c * A.cs;
          const top = A.oy + row * A.cs;
          const cx = left + A.cs / 2;
          const cy = top + A.cs / 2;
          if (dx) {
            let nx = A.px + dx;
            const out = dx > 0 ? nx + r > left + A.cs - 1 : nx - r < left + 1;
            if (out) {
              const wall = dx > 0 ? w.e || c === A.C - 1 : w.w || c === 0;
              const aligned = Math.abs(A.py - cy) <= A.cs / 2 - r - 1;
              if (wall || !aligned) {
                nx = dx > 0 ? left + A.cs - 1 - r : left + 1 + r;
                if (!wall) A.py += Math.sign(cy - A.py) * Math.min(Math.abs(cy - A.py), Math.abs(dx));
              }
            }
            A.px = nx;
          }
          if (dy) {
            let ny = A.py + dy;
            const out = dy > 0 ? ny + r > top + A.cs - 1 : ny - r < top + 1;
            if (out) {
              const wall = dy > 0 ? w.s || row === A.Rw - 1 : w.n || row === 0;
              const aligned = Math.abs(A.px - cx) <= A.cs / 2 - r - 1;
              if (wall || !aligned) {
                ny = dy > 0 ? top + A.cs - 1 - r : top + 1 + r;
                if (!wall) A.px += Math.sign(cx - A.px) * Math.min(Math.abs(cx - A.px), Math.abs(dy));
              }
            }
            A.py = ny;
          }
        },
        update(A, dt) {
          const sp = 112 * dt;
          let mx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
          let my = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
          if (pointer && !mx && !my) {
            const dx = pointer.x - A.px;
            const dy = pointer.y - A.py;
            if (Math.abs(dx) > 4) mx = Math.sign(dx);
            if (Math.abs(dy) > 4) my = Math.sign(dy);
          }
          this.move(A, mx * sp, 0);
          this.move(A, 0, my * sp);
          soul.x = A.px;
          soul.y = A.py;
          // the tiles, then the way out
          A.tiles.forEach((t) => {
            if (t.got) return;
            if (Math.hypot(A.px - (A.ox + t[0] * A.cs + A.cs / 2), A.py - (A.oy + t[1] * A.cs + A.cs / 2)) < 14) {
              t.got = true;
              A.got++;
              snd.chime();
              S.banner = { text: `${A.got} / 3`, sub: A.got === 3 ? 'the checkbox is open' : '', t: 1.4 };
            }
          });
          const ex = A.ox + A.exit[0] * A.cs + A.cs / 2;
          const ey = A.oy + A.exit[1] * A.cs + A.cs / 2;
          if (A.got >= 3 && Math.hypot(A.px - ex, A.py - ey) < 14) return arcadeWin();
          // the hunter: wakes up, then follows the maze toward you, a little faster as time goes on
          const pc = this.cell(A, A.px, A.py);
          const hc = this.cell(A, A.hx, A.hy);
          if (A.wake > 0) A.wake -= dt;
          else {
            if ((A.path -= dt) <= 0) {
              A.path = 0.25;
              const { dist } = this.bfs(A, pc[0], pc[1]);
              A.dist = dist[hc[0]][hc[1]];
              let best = hc;
              for (const [d, dc, dr] of A.DIRS) {
                if (A.W[hc[0]][hc[1]][d]) continue;
                if (dist[hc[0] + dc][hc[1] + dr] < dist[best[0]][best[1]]) best = [hc[0] + dc, hc[1] + dr];
              }
              A.next = best;
            }
            const same = pc[0] === hc[0] && pc[1] === hc[1];
            const tx = same ? A.px : A.ox + A.next[0] * A.cs + A.cs / 2;
            const ty = same ? A.py : A.oy + A.next[1] * A.cs + A.cs / 2;
            const hs = Math.min(86, 56 + A.t * 1) * dt;
            const dd = Math.hypot(tx - A.hx, ty - A.hy) || 1;
            // slide along the cell's centre line so it never cuts through a wall corner
            const ccx = A.ox + hc[0] * A.cs + A.cs / 2;
            const ccy = A.oy + hc[1] * A.cs + A.cs / 2;
            if (!same && Math.abs(tx - A.hx) > 1 && Math.abs(A.hy - ccy) > 1) A.hy += Math.sign(ccy - A.hy) * Math.min(hs, Math.abs(ccy - A.hy));
            else if (!same && Math.abs(ty - A.hy) > 1 && Math.abs(A.hx - ccx) > 1) A.hx += Math.sign(ccx - A.hx) * Math.min(hs, Math.abs(ccx - A.hx));
            else {
              A.hx += ((tx - A.hx) / dd) * Math.min(hs, dd);
              A.hy += ((ty - A.hy) / dd) * Math.min(hs, dd);
            }
            if (Math.hypot(A.hx - A.px, A.hy - A.py) < 15 && soul.inv <= 0) {
              hurt(6);
              S.scare = 0.4;
              big('shriek');
              if (S.state !== 'arcade') return;
              // it lets go, and slips away to somewhere far
              const { dist } = this.bfs(A, pc[0], pc[1]);
              const far = [];
              for (let c = 0; c < A.C; c++) for (let r = 0; r < A.Rw; r++) if (dist[c][r] >= 4) far.push([c, r]);
              const h = far[(A.R() * far.length) | 0] || [A.C - 1, 0];
              A.hx = A.ox + h[0] * A.cs + A.cs / 2;
              A.hy = A.oy + h[1] * A.cs + A.cs / 2;
              A.wake = 1.5;
            }
          }
          // your heartbeat tells you how close it is
          const near = A.wake > 0 || A.dist == null ? 0 : A.dist <= 1 ? 140 : A.dist <= 3 ? 95 : 0;
          dreadTo(near);
          // things whisper in the dark
          if ((A.whisperIn -= dt) <= 0) {
            A.whisperIn = 4 + A.R() * 4;
            const list = WHISPERS();
            A.whisper = { text: list[(A.R() * list.length) | 0], x: A.px + (A.R() - 0.5) * 120, y: A.py + (A.R() - 0.5) * 80, t: 1.6 };
          }
          if (A.whisper && (A.whisper.t -= dt) <= 0) A.whisper = null;
        },
        draw(A) {
          const { ox, oy, cs } = A;
          // walls
          ctx.strokeStyle = '#8a5a48';
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let c = 0; c < A.C; c++) {
            for (let r = 0; r < A.Rw; r++) {
              const w = A.W[c][r];
              const x = ox + c * cs;
              const y = oy + r * cs;
              if (w.n) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); }
              if (w.w) { ctx.moveTo(x, y); ctx.lineTo(x, y + cs); }
              if (c === A.C - 1 && w.e) { ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); }
              if (r === A.Rw - 1 && w.s) { ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); }
            }
          }
          ctx.stroke();
          // the dark: only a little light around you
          const g = ctx.createRadialGradient(A.px, A.py, 22, A.px, A.py, 110);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.985)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, VW, 380);
          // things that glow through the dark: the tiles, the checkbox, and its eye
          A.tiles.forEach((t) => {
            if (t.got) return;
            const x = ox + t[0] * cs + cs / 2;
            const y = oy + t[1] * cs + cs / 2;
            ctx.fillStyle = `rgba(74,144,226,${0.55 + Math.sin(S.t * 4 + x) * 0.3})`;
            ctx.fillRect(x - 6, y - 6, 12, 12);
          });
          const ex = ox + A.exit[0] * cs + cs / 2;
          const ey = oy + A.exit[1] * cs + cs / 2;
          ctx.strokeStyle = A.got >= 3 ? '#2ad13c' : '#3a3a3a';
          ctx.lineWidth = 2;
          ctx.strokeRect(ex - 8, ey - 8, 16, 16);
          if (A.got >= 3) txt('✓', ex, ey - 6, 10, '#2ad13c', 'center');
          playerHeart(A.px, A.py);
          if (A.wake <= 0 || Math.floor(S.t * 4) % 2) {
            const glow = ctx.createRadialGradient(A.hx, A.hy, 2, A.hx, A.hy, 30);
            glow.addColorStop(0, 'rgba(255,40,30,0.5)');
            glow.addColorStop(1, 'rgba(255,40,30,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(A.hx - 30, A.hy - 30, 60, 60);
            if (Art) Art.drawEvilSpark(ctx, A.hx, A.hy, 30, { look: clamp((A.px - A.hx) / 80, -1, 1), glow: false, rotate: S.t });
          }
          if (A.whisper) {
            ctx.globalAlpha = Math.min(1, A.whisper.t) * 0.7;
            txt(A.whisper.text, A.whisper.x, A.whisper.y, 8, '#b33', 'center');
            ctx.globalAlpha = 1;
          }
          txt(`TILES ${A.got} / 3`, 48, 18, 10, '#4a90e2');
          if (A.wake > 0) txt('it is waking up...', VW - 48, 18, 8, '#888', 'right');
        },
      },

      // CAPTCHA WALL: breakout through a seeded wall of tiles, to the eye behind it
      breakout: {
        init(A) {
          const R = A.R;
          A.bricks = [];
          const cols = 10;
          const rows = 2; // a short wall: two gappy rows in front of its eye
          const bw = 52;
          const bh = 20;
          const ox = (VW - (cols * (bw + 4) - 4)) / 2;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols / 2; c++) {
              const t = R();
              const core = c === 4 && r === 1;
              const type = core ? 'tile' : t < 0.4 ? null : t < 0.5 ? 'armor' : t < 0.6 ? 'eye' : 'tile';
              if (!type) continue;
              const hue = (R() * 40 + 10) | 0;
              for (const cc of [c, cols - 1 - c]) A.bricks.push({ x: ox + cc * (bw + 4), y: 132 + r * (bh + 4), w: bw, h: bh, hp: type === 'armor' ? 2 : 1, type, hue });
            }
          }
          A.eye = { x: VW / 2, y: 82, r: 32, hp: 2, hurt: 0 };
          A.combo = 0;
          A.pierce = 0;
          A.pad = { x: VW / 2, y: 350, w: 112 };
          A.ball = { x: VW / 2, y: 340, vx: 0, vy: 0, r: 7, stuck: true, auto: 0.8 };
          A.shots = [];
          A.fire = 3.5;
        },
        hitRect(b, k) {
          const nx = clamp(b.x, k.x, k.x + k.w);
          const ny = clamp(b.y, k.y, k.y + k.h);
          return (b.x - nx) ** 2 + (b.y - ny) ** 2 <= b.r * b.r;
        },
        update(A, dt) {
          const pad = A.pad;
          const kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
          if (kx) pad.x += kx * 430 * dt;
          else if (S.hover && performance.now() - S.hoverT < 1500) pad.x += clamp(S.hover.x - pad.x, -560 * dt, 560 * dt);
          pad.x = clamp(pad.x, 20 + pad.w / 2, VW - 20 - pad.w / 2);
          soul.x = pad.x;
          soul.y = pad.y;
          const b = A.ball;
          if (b.stuck) {
            b.x = pad.x;
            b.y = pad.y - 10;
            if (A.jumpReq) { // you launch it (Space / Z / click): it never plays itself
              b.stuck = false;
              const ang = -Math.PI / 2 + (A.R() < 0.5 ? -1 : 1) * (0.35 + A.R() * 0.4);
              b.vx = Math.cos(ang) * 400;
              b.vy = Math.sin(ang) * 400;
            }
          } else {
            for (let i = 0; i < 3; i++) {
              b.x += (b.vx * dt) / 3;
              b.y += (b.vy * dt) / 3;
              if (b.x < 20 + b.r || b.x > VW - 20 - b.r) {
                b.vx *= -1;
                b.x = clamp(b.x, 20 + b.r, VW - 20 - b.r);
              }
              if (b.y < 36 + b.r) {
                b.vy = Math.abs(b.vy);
              }
              for (const k of A.bricks) {
                if (k.hp <= 0 || !this.hitRect(b, k)) continue;
                const ox = Math.min(b.x + b.r - k.x, k.x + k.w - (b.x - b.r));
                const oy = Math.min(b.y + b.r - k.y, k.y + k.h - (b.y - b.r));
                // PIERCE: the ball smashes straight through
                if (A.pierce > 0) k.hp = 1;
                else if (ox < oy) b.vx *= -1;
                else b.vy *= -1;
                k.hp--;
                if (k.hp <= 0 && ++A.combo === 2 && A.pierce <= 0) {
                  A.pierce = 3.5;
                  S.banner = { text: 'PIERCE!', sub: '', t: 1.2 };
                  snd.chime();
                }
                snd.select();
                if (k.hp <= 0) {
                  for (let j = 0; j < 6; j++) parts.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, vx: rnd(-120, 120), vy: rnd(-120, 40), life: 0.5, spark: true, c: k.type === 'eye' ? '#ff3a2a' : '#ddd' });
                  // a tile with an eye in it lets three sparks loose
                  if (k.type === 'eye') A.shots.push({ x: k.x + k.w / 2, y: k.y + k.h, vx: 0, vy: 140, r: 6 });
                }
                break;
              }
              // its eye
              const e = A.eye;
              const d = Math.hypot(b.x - e.x, b.y - e.y);
              if (d < e.r + b.r && e.hurt <= 0) {
                const nx = (b.x - e.x) / d;
                const ny = (b.y - e.y) / d;
                const dot = b.vx * nx + b.vy * ny;
                b.vx -= 2 * dot * nx;
                b.vy -= 2 * dot * ny;
                e.hp--;
                e.hurt = 0.6;
                S.shake = 9;
                snd.hit();
                E.hurt = 0.4;
                if (e.hp <= 0) return arcadeWin();
                // it lashes out
                for (let j = 0; j < 5; j++) {
                  const ang = Math.PI * (0.2 + (0.6 * j) / 4);
                  A.shots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 120, r: 5 });
                }
              }
              // the paddle
              if (b.vy > 0 && b.y + b.r >= pad.y - 5 && b.y < pad.y + 6 && Math.abs(b.x - pad.x) < pad.w / 2 + b.r) {
                const off = clamp((b.x - pad.x) / (pad.w / 2), -1, 1);
                const sp = Math.min(520, Math.hypot(b.vx, b.vy) * 1.03);
                A.combo = 0;
                const ang = -Math.PI / 2 + off * 1.05;
                b.vx = Math.cos(ang) * sp;
                b.vy = Math.sin(ang) * sp;
                b.y = pad.y - 6 - b.r;
                snd.blip();
              }
            }
            if (b.y > 400) {
              hurt(3);
              A.lost = (A.lost || 0) + 1;
              if (S.state !== 'arcade') return;
              b.stuck = true;
              b.auto = 1.2;
            }
          }
          A.jumpReq = false;
          // its eye drifts side to side behind the wall: aim with where the ball hits your paddle
          A.eye.x = VW / 2 + Math.sin(A.t * 0.8) * 170;
          A.pierce = Math.max(0, A.pierce - dt);
          A.eye.hurt = Math.max(0, A.eye.hurt - dt);
          // it shoots at you, faster each time you hurt it
          if ((A.fire -= dt) <= 0) {
            A.fire = 3.6 - (2 - A.eye.hp) * 0.5;
            // it drops sparks from its eye, drifting a little toward where you were
            const vx = clamp((pad.x - A.eye.x) * 0.3, -70, 70) + (A.R() - 0.5) * 40;
            A.shots.push({ x: A.eye.x, y: A.eye.y + 24, vx, vy: 140, r: 6 });
            snd.warn();
          }
          for (const s2 of A.shots) {
            s2.x += s2.vx * dt;
            s2.y += s2.vy * dt;
            if (Math.abs(s2.x - pad.x) < pad.w / 2 + s2.r && Math.abs(s2.y - pad.y) < 6 + s2.r) {
              s2.gone = true;
              hurt(3);
              A.why = (A.why || 0) + 1;
              if (S.state !== 'arcade') return;
            }
          }
          A.shots = A.shots.filter((s2) => !s2.gone && s2.y < 420 && s2.x > -20 && s2.x < VW + 20);
        },
        draw(A) {
          // "select all squares with claude"
          ctx.fillStyle = '#4a90e2';
          ctx.fillRect(20, 8, VW - 40, 24);
          txt(`Select all squares with ${MODEL}`, 32, 15, 9, '#fff');
          txt('●'.repeat(A.eye.hp) + '○'.repeat(2 - A.eye.hp), VW - 32, 14, 10, '#fff', 'right');
          // its eye, behind the wall, watching the ball
          const e = A.eye;
          if (Art) Art.drawEvilSpark(ctx, e.x + (e.hurt > 0 ? rnd(-5, 5) : 0), e.y, 112, { look: clamp((A.ball.x - e.x) / 160, -1, 1), rotate: S.t * 0.3 });
          for (const k of A.bricks) {
            if (k.hp <= 0) continue;
            ctx.fillStyle = k.type === 'armor' ? '#2a3d55' : `hsl(${k.hue},12%,${26 + k.hue / 4}%)`;
            ctx.fillRect(k.x, k.y, k.w, k.h);
            ctx.strokeStyle = k.type === 'armor' ? '#4a90e2' : '#888';
            ctx.lineWidth = 1;
            ctx.strokeRect(k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
            if (k.type === 'armor' && k.hp === 1) {
              ctx.strokeStyle = '#000';
              ctx.beginPath();
              ctx.moveTo(k.x + 10, k.y);
              ctx.lineTo(k.x + 22, k.y + 12);
              ctx.lineTo(k.x + 18, k.y + k.h);
              ctx.stroke();
            }
            if (k.type === 'eye') {
              const open = Math.sin(S.t * 2 + k.x) > -0.8;
              ctx.fillStyle = '#ff3a2a';
              ctx.fillRect(k.x + k.w / 2 - 3, k.y + k.h / 2 - (open ? 2 : 0), 6, open ? 4 : 1);
            }
          }
          for (const s2 of A.shots) drawSpark(s2.x, s2.y, s2.r, 0);
          ctx.fillStyle = A.pierce > 0 ? (Math.floor(S.t * 20) % 2 ? ORANGE : YEL) : '#fff';
          ctx.beginPath();
          ctx.arc(A.ball.x, A.ball.y, A.ball.r + (A.pierce > 0 ? 2 : 0), 0, Math.PI * 2);
          ctx.fill();
          // you: a shield bar with your SOUL in it
          ctx.fillStyle = soul.inv > 0 && Math.floor(S.t * 14) % 2 ? '#555' : '#ddd';
          ctx.fillRect(A.pad.x - A.pad.w / 2, A.pad.y - 5, A.pad.w, 10);
          playerHeart(A.pad.x, A.pad.y + 1);
          if (A.ball.stuck) txt('SPACE / click to launch', VW / 2, 372, 8, '#888', 'center');
        },
      },
    };

    // ---- input ----
    const keys = {};
    let pointer = null;
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: ((p.clientX - r.left) / r.width) * VW, y: ((p.clientY - r.top) / r.height) * VH };
    };
    const BTN = [{ label: 'FIGHT', x: 32 }, { label: 'ACT', x: 182 }, { label: 'ITEM', x: 332 }, { label: 'MERCY', x: 482 }];
    const BTN_W = 126;
    const BTN_Y = 418;
    function confirm() {
      if (S.state === 'text') {
        if (S.shown < S.text.length) S.shown = S.text.length;
        else if (S.queue.length) nextLine();
        else {
          const f = S.after;
          S.after = null;
          if (f) f();
        }
      } else if (S.state === 'talk') {
        const b = S.bubble;
        if (b.shown < b.text.length) b.shown = b.text.length;
        else {
          const f = S.after;
          S.after = null;
          if (f) f();
        }
      } else if (S.state === 'menu') {
        snd.confirm();
        if (S.sub) return chooseSub();
        if (S.menu === 0) startFight();
        else if (S.menu === 1) S.sub = { kind: 'act', idx: 0, items: [['Check', S.L.check], ...S.L.acts] };
        else if (S.menu === 2) {
          if (!S.items.length) narrate(['* You have no items left.'], toMenu);
          else S.sub = { kind: 'item', idx: 0, items: S.items.map((x, i) => [x.name, null, i]) };
        } else S.sub = { kind: 'mercy', idx: 0, items: [['Spare'], ['Flee']] };
      } else if (S.state === 'fight') strike();
    }
    function chooseSub() {
      const it = S.sub.items[S.sub.idx];
      const kind = S.sub.kind;
      S.sub = null;
      if (kind === 'act') {
        // the right ACT makes it ready to be spared (its name turns yellow under MERCY)
        const spare = it[0] === SPARE_ACT[S.level] && S.level < FINAL;
        if (spare) S.spareable = true;
        narrate([it[1] + (spare ? `\n* ${MODEL} seems ready to be spared.` : '')], enemyTurn);
      } else if (kind === 'item') {
        const item = S.items.splice(it[2], 1)[0];
        S.hp = Math.min(S.maxHp, S.hp + item.heal);
        snd.chime();
        narrate([`${item.text}\n* You recovered ${item.heal >= 99 ? 'all your' : item.heal} HP.`], enemyTurn);
      } else if (kind === 'mercy') {
        if (it[0] === 'Flee') narrate([`* You try to flee.\n* ${MODEL} already knows where you'd go.`], enemyTurn);
        else if (S.spareable && S.level < FINAL) spare();
        else narrate([S.level >= FINAL ? `* ${MODEL} will not spare you.\n* It doesn't know how.` : `* You try to spare ${MODEL}.\n* It isn't ready. (Try something with ACT.)`], enemyTurn);
      }
    }
    // the peaceful way through: it lets you go
    function spare() {
      snd.win();
      bullets = [];
      E.dying = 1;
      S.route[S.level] = 'spare';
      narrate([`* YOU WON!\n* You spared ${MODEL}. It lets you pass.\n* It will remember that you were kind.`], () => {
        E.dying = 0;
        startLevel(nextLevel(S.level));
      });
    }
    const onKey = (e) => {
      const down = e.type === 'keydown';
      keys[e.key.toLowerCase()] = down;
      if (!down || e.repeat) return;
      const k = e.key.toLowerCase();
      if (['z', 'enter', ' '].includes(k)) {
        e.preventDefault();
        confirm();
      }
      if (S.state === 'arcade' && S.arc && ['arrowup', 'w', ' ', 'z', 'enter'].includes(k)) S.arc.jumpReq = true;
      if (S.state === 'attack') {
        if (S.mode === 'purple') {
          if (k === 'arrowup' || k === 'w') S.lane = Math.max(0, S.lane - 1);
          if (k === 'arrowdown' || k === 's') S.lane = Math.min(2, S.lane + 1);
        }
        if (S.mode === 'green') {
          const m = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }[k];
          if (m) S.shield = m;
        }
      }
      if (S.state === 'menu') {
        if (S.sub) {
          if (k === 'arrowdown' || k === 's' || k === 'arrowright' || k === 'd') S.sub.idx = (S.sub.idx + 1) % S.sub.items.length;
          if (k === 'arrowup' || k === 'w' || k === 'arrowleft' || k === 'a') S.sub.idx = (S.sub.idx + S.sub.items.length - 1) % S.sub.items.length;
          if (k === 'x' || k === 'shift' || k === 'escape') S.sub = null;
          snd.select();
        } else if (['arrowleft', 'a', 'arrowright', 'd'].includes(k)) {
          S.menu = (S.menu + (k === 'arrowleft' || k === 'a' ? 3 : 1)) % 4;
          snd.select();
        }
      }
    };
    const onDown = (e) => {
      const p = toLogical(e);
      pointer = p;
      if (S.state === 'menu' && !S.sub) {
        const i = BTN.findIndex((b) => p.x >= b.x && p.x <= b.x + BTN_W && p.y >= BTN_Y && p.y <= BTN_Y + 42);
        if (i >= 0) {
          S.menu = i;
          return confirm();
        }
      }
      if (S.state === 'menu' && S.sub) {
        const i = S.sub.items.findIndex((_, j) => p.y >= 268 + j * 30 && p.y <= 268 + j * 30 + 26 && p.x > 60 && p.x < 600);
        if (i >= 0) {
          S.sub.idx = i;
          return confirm();
        }
      }
      if (S.state === 'attack' && S.mode === 'blue') S.jumpReq = true;
      if (S.state === 'arcade' && S.arc) S.arc.jumpReq = true;
      if (S.state !== 'attack' && S.state !== 'arcade') confirm();
    };
    const onMove = (e) => {
      S.hover = toLogical(e);
      S.hoverT = performance.now();
      if (pointer) pointer = toLogical(e);
    };
    const onUp = () => (pointer = null);
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('touchstart', onDown, { passive: true });
    addEventListener('mousemove', onMove);
    addEventListener('touchmove', onMove, { passive: true });
    addEventListener('mouseup', onUp);
    addEventListener('touchend', onUp);

    // ---- update ----
    function update(dt) {
      S.t += dt;
      S.shake = Math.max(0, S.shake - dt * 25);
      S.flash = Math.max(0, S.flash - dt * 2);
      E.hurt = Math.max(0, E.hurt - dt);
      if (E.dmg) E.dmg.t -= dt;
      if (S.banner && (S.banner.t -= dt) <= 0) S.banner = null;
      for (const k of ['x', 'y', 'w', 'h']) box[k] += (box['t' + k] - box[k]) * Math.min(1, dt * 10);
      parts = parts.filter((p) => (p.life -= dt) > 0);
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt;
      }
      for (const s of stars) s.y = (s.y + s.v * dt) % VH;

      // typewriter
      const typeOn = (obj, voice) => {
        if (obj.shown >= obj.text.length) return;
        obj.acc = (obj.acc || 0) + dt * 34;
        while (obj.acc >= 1 && obj.shown < obj.text.length) {
          obj.acc--;
          const ch = obj.text[obj.shown++];
          if (ch !== ' ' && ch !== '\n' && obj.shown % 2) (voice ? snd.voice : snd.blip)();
        }
      };
      if (S.state === 'text') {
        const o = { text: S.text, shown: S.shown, acc: S.typeAcc };
        typeOn(o, false);
        S.shown = o.shown;
        S.typeAcc = o.acc;
      }
      if (S.state === 'talk' && S.bubble) {
        typeOn(S.bubble, true);
        // like Undertale, its lines move on by themselves a moment after they finish
        if (S.bubble.shown >= S.bubble.text.length && (S.bubble.done = (S.bubble.done || 0) + dt) > 1.1) confirm();
      }
      if (S.state === 'gameover' || S.state === 'dead') S.deadT += dt;

      if (S.state === 'fight' && S.bar && !S.bar.done) {
        S.bar.x += S.bar.v * dt;
        if (S.bar.x > TEXTBOX.x + TEXTBOX.w - 10) strike(); // too slow: a miss
      }

      S.scare = Math.max(0, (S.scare || 0) - dt);
      S.subl = Math.max(0, (S.subl || 0) - dt);
      S.grazeT = Math.max(0, (S.grazeT || 0) - dt);
      // once it's angry, it flickers into view when you aren't expecting it
      if (S.enraged && (S.state === 'menu' || S.state === 'talk') && Math.random() < dt * 0.12) S.subl = 0.07;
      dreadTick();
      if (S.state === 'arcade' && S.arc) {
        S.arc.t += dt;
        soul.inv = Math.max(0, soul.inv - dt);
        ARC[S.L.arcade].update(S.arc, dt);
        return;
      }
      if (S.state !== 'attack') return;
      const a = S.attack;
      a.t += dt;
      // move the SOUL
      let mx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      let my = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      if (S.L.mirror || a.mirror) {
        mx = -mx;
        my = -my;
      }
      const speed = 150;
      if (S.mode === 'green') {
        // can't move: the pointer turns the shield
        if (pointer) {
          const ang = Math.atan2(pointer.y - soul.y, pointer.x - soul.x);
          S.shield = Math.abs(ang) < Math.PI / 4 ? 'right' : Math.abs(ang) > (3 * Math.PI) / 4 ? 'left' : ang > 0 ? 'down' : 'up';
        }
      } else if (S.mode === 'blue') {
        // heavy: sideways only, gravity pulls you down, jump with up / W / a tap
        const dir = mx || (pointer ? clamp((pointer.x - soul.x) / 12, -1, 1) : 0);
        soul.x += dir * speed * dt;
        const floor = box.y + box.h - 9;
        if ((keys.arrowup || keys.w || S.jumpReq) && soul.y >= floor - 0.5) soul.vy = -365;
        S.jumpReq = false;
        soul.vy += 950 * dt;
        soul.y += soul.vy * dt;
        if (soul.y > floor) {
          soul.y = floor;
          soul.vy = 0;
        }
      } else if (S.mode === 'purple') {
        // stuck on three strings: slide along, hop between them
        const lanes = [0.25, 0.5, 0.75].map((f) => box.y + box.h * f);
        if (pointer) S.lane = lanes.reduce((bi, y, i) => (Math.abs(y - pointer.y) < Math.abs(lanes[bi] - pointer.y) ? i : bi), 0);
        soul.x += (mx || (pointer ? clamp((pointer.x - soul.x) / 12, -1, 1) : 0)) * speed * dt;
        soul.y += (lanes[S.lane] - soul.y) * Math.min(1, dt * 18);
      } else if (pointer && !mx && !my) {
        let tx = pointer.x;
        let ty = pointer.y;
        if (S.L.mirror) {
          tx = 2 * (box.x + box.w / 2) - tx;
          ty = 2 * (box.y + box.h / 2) - ty;
        }
        const dx = tx - soul.x;
        const dy = ty - soul.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          soul.x += (dx / d) * Math.min(d, speed * dt);
          soul.y += (dy / d) * Math.min(d, speed * dt);
        }
      } else {
        const n = Math.hypot(mx, my) || 1;
        soul.x += (mx / n) * speed * dt;
        soul.y += (my / n) * speed * dt;
      }
      if (S.mode !== 'green') {
        soul.x = clamp(soul.x, box.x + 8, box.x + box.w - 8);
        soul.y = clamp(soul.y, box.y + 8, box.y + box.h - 8);
      } else {
        soul.x = box.x + box.w / 2;
        soul.y = box.y + box.h / 2;
      }
      soul.inv = Math.max(0, soul.inv - dt);
      // YELLOW SOUL: it fires up at claude's eye on its own; every hit chips its HP
      if (S.mode === 'yellow') {
        S.shotCD -= dt;
        if (S.shotCD <= 0) {
          S.shotCD = 0.3;
          S.pShots.push({ x: soul.x, y: soul.y - 10 });
        }
        for (const p of S.pShots) {
          p.y -= 430 * dt;
          if (!p.gone && p.y < 135 && p.y > 80 && Math.abs(p.x - VW / 2) < 30 && E.hp > 0 && S.chip < 8) {
            S.chip++;
            p.gone = true;
            E.hp = Math.max(0, E.hp - 1);
            E.hurt = 0.12;
            snd.select();
            if (E.hp <= 0) a.t = a.dur; // shot down: the attack ends and you win
          }
        }
        S.pShots = S.pShots.filter((p) => !p.gone && p.y > -20);
      }

      a.p.update(a, dt * (a.heat || 1));
      // bullets
      const frozen = a.freeze;
      for (const b of bullets) {
        if (b.kind === 'beam') {
          if (b.charge > 0) b.charge -= dt;
          else {
            b.fire -= dt;
            const hit = b.horiz ? Math.abs(soul.y - b.pos) < 13 : Math.abs(soul.x - b.pos) < 13;
            if (hit) hurt(6);
            if (b.fire <= 0) b.gone = true;
          }
          continue;
        }
        if (b.shielded) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (Math.hypot(b.x - soul.x, b.y - soul.y) < 24) {
            b.gone = true;
            if (S.shield === b.dir) {
              snd.select();
              S.dodges++;
              for (let i = 0; i < 5; i++) parts.push({ x: b.x, y: b.y, vx: rnd(-90, 90), vy: rnd(-90, 30), life: 0.4, spark: true });
            } else hurt(4);
          }
          continue;
        }
        if (b.warn > 0) {
          b.warn -= dt;
          if (b.warn <= 0) {
            b.vx = Math.cos(b.aim) * 380;
            b.vy = Math.sin(b.aim) * 380;
          }
          continue;
        }
        if (b.kind === 'seg') {
          // run sideways; at each wall, drop a row and turn around
          b.x += b.dir * b.speed * dt;
          if ((b.dir > 0 && b.x > box.x + box.w - 8) || (b.dir < 0 && b.x < box.x + 8)) {
            b.dir *= -1;
            b.y += 24;
            if (b.y > box.y + box.h - 8) b.gone = true;
          }
        } else if (!frozen) {
          if (b.acc) {
            b.vx *= 1 + b.acc * dt;
            b.vy *= 1 + b.acc * dt;
          }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.wob) {
            b.age = (b.age || 0) + dt;
            b.x += Math.cos(b.age * b.wob.f + b.wob.p) * b.wob.a * b.wob.f * dt;
          }
        }
        if (b.bounce) {
          if (b.x < box.x + b.r || b.x > box.x + box.w - b.r) {
            b.vx *= -1;
            b.x = clamp(b.x, box.x + b.r, box.x + box.w - b.r);
            split(b);
          }
          if (b.y < box.y + b.r || b.y > box.y + box.h - b.r) {
            b.vy *= -1;
            b.y = clamp(b.y, box.y + b.r, box.y + box.h - b.r);
            split(b);
          }
        }
        if (b.life != null && (b.life -= dt) <= 0) b.gone = true;
        const d = Math.hypot(b.x - soul.x, b.y - soul.y);
        if (b.kind === 'letter') {
          if (d < b.r + 6) {
            if (b.order === S.spellIdx) {
              S.spellIdx++;
              b.gone = true;
              snd.chime();
              if (S.spellIdx >= word.length) {
                S.spellDone = 1;
                a.t = a.dur; // done: end the attack now
              }
            } else if (soul.inv <= 0) {
              hurt(3);
            }
          }
          continue;
        }
        if (d < b.r + 4) {
          b.gone = true;
          hurt(b.kind === 'ink' ? 2 : 4);
        } else if (!b.counted && d < b.r + 26) {
          b.counted = true;
          S.dodges++;
        }
        // a near miss is a GRAZE: a spark of light, and every 6 grazes heal 1 HP
        if (!b.gone && !b.grazed && d >= b.r + 5 && d < b.r + 13 && soul.inv <= 0) {
          b.grazed = true;
          S.graze = (S.graze || 0) + 1;
          S.grazeT = 0.18;
          snd.blip();
          for (let i = 0; i < 3; i++) parts.push({ x: soul.x, y: soul.y, vx: rnd(-80, 80), vy: rnd(-140, -30), life: 0.35, spark: true, c: '#fff' });
          if (S.graze % 6 === 0 && S.hp < S.maxHp) {
            S.hp += 1;
            parts.push({ x: soul.x, y: soul.y - 16, vx: 0, vy: -170, life: 0.8, txt: '+1', c: '#5f5' });
          }
        }
        if (b.y > box.y + box.h + 40 || b.y < box.y - 80 || b.x < box.x - 80 || b.x > box.x + box.w + 80) b.gone = true;
      }
      bullets = bullets.filter((b) => !b.gone);
      if (S.state === 'attack' && a.t >= a.dur) endAttack();
    }
    function split(b) {
      if (b.kind !== 'spark' || b.gen >= 2 || bullets.length > 26) return;
      b.gen++;
      b.r = b.gen === 1 ? 9 : 6;
      bullets.push({ ...b, vx: -b.vx * 0.9 + rnd(-30, 30), vy: b.vy * 0.9 + rnd(-30, 30) });
    }

    // ---- drawing ----
    function txt(s, x, y, size = 12, color = '#fff', align = 'left') {
      ctx.font = `${size}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      String(s).split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * (size + 10)));
    }
    // word-wrap to a pixel width (keeping line breaks)
    function wrapLines(s, maxW, size) {
      ctx.font = `${size}px ${FONT}`;
      const out = [];
      for (const para of String(s).split('\n')) {
        let line = '';
        for (const w of para.split(' ')) {
          const test = line ? line + ' ' + w : w;
          if (line && ctx.measureText(test).width > maxW) {
            out.push(line);
            line = w;
          } else line = test;
        }
        out.push(line);
      }
      return out;
    }
    // text that always stays inside its box: wrapped on the FULL line (so typing never makes words
    // jump), shrunk a step at a time if it's still too tall, then revealed up to `shown` characters
    function boxText(full, shown, x, y, maxW, maxH, size = 12, color = '#fff') {
      let sz = size;
      let lines = wrapLines(full, maxW, sz);
      while (sz > 7 && lines.length * (sz + 10) - 10 > maxH) lines = wrapLines(full, maxW, --sz);
      let left = shown;
      const vis = [];
      for (const l of lines) {
        if (left <= 0) break;
        vis.push(l.slice(0, left));
        left -= l.length + 1;
      }
      txt(vis.join('\n'), x, y, sz, color);
    }
    function drawSpark(x, y, r, look) {
      if (Art && Art.drawEvilSpark) Art.drawEvilSpark(ctx, x, y, r * 3.4, { glow: false, look, rotate: S.t * 2 + x * 0.01 });
      else {
        ctx.fillStyle = ORANGE;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    function backdrop() {
      const L = S.level;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VW, VH);
      if (L === 1 || L === 5 || L === 10) {
        ctx.fillStyle = 'rgba(240,230,220,0.5)';
        for (const s of stars) ctx.fillRect(s.x, (s.y * (L === 5 ? 3 : 1)) % VH, s.s, L === 5 ? 6 : s.s);
      } else if (L === 3) {
        // a grid floor scrolling, the centipede's field
        ctx.strokeStyle = 'rgba(217,119,87,0.12)';
        for (let x = (S.t * 20) % 32; x < VW; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, VH);
          ctx.stroke();
        }
        for (let y = (S.t * 20) % 32; y < VH; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(VW, y);
          ctx.stroke();
        }
      } else if (L === 2) {
        ctx.fillStyle = 'rgba(240,230,220,0.25)';
        for (const s of stars) ctx.fillRect((s.x + S.t * s.v) % VW, s.y, 2, 2);
      } else if (L === 7) {
        const open = S.attack && S.attack.open;
        if (open) {
          ctx.fillStyle = 'rgba(160,0,0,0.25)';
          ctx.fillRect(0, 0, VW, VH);
        }
      } else if (L === 9) {
        // rays turning behind the boss
        ctx.save();
        ctx.translate(VW / 2, 110);
        ctx.rotate(S.t * 0.2);
        for (let i = 0; i < 12; i++) {
          ctx.rotate((Math.PI * 2) / 12);
          ctx.fillStyle = i % 2 ? 'rgba(217,119,87,0.07)' : 'rgba(217,119,87,0.03)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(700, -60);
          ctx.lineTo(700, 60);
          ctx.fill();
        }
        ctx.restore();
      } else if (L === 8) {
        ctx.fillStyle = 'rgba(240,230,220,0.06)';
        ctx.font = `20px ${FONT}`;
        for (let i = 0; i < 14; i++) ctx.fillText(word[i % word.length], (i * 97 + S.t * 15) % VW, (i * 53) % VH);
      }
    }
    function drawEnemy() {
      const L = S.level;
      if (E.dying) return;
      const shake = (E.hurt > 0 ? (Math.random() - 0.5) * 14 : 0) + (S.enraged ? (Math.random() - 0.5) * 4 : 0);
      const bob = Math.sin(S.t * 2) * 4;
      const x = VW / 2 + shake;
      const y = 110 + bob;
      const look = clamp((soul.x - x) / 200, -1, 1);
      const size = L === 9 ? 190 : L >= FINAL ? 170 + Math.sin(S.t * 9) * 6 : 130;
      // level 7: the eye is shut unless it's looking
      const blink = L === 7 && S.attack && !S.attack.open;
      if (L === 3) for (let i = 1; i <= 4; i++) drawSpark(x + Math.cos(S.t * 2 + i * 1.6) * 90, y + Math.sin(S.t * 2 + i * 1.6) * 30, 9, look);
      // angry: a red glow behind it
      if (S.enraged) {
        const g = ctx.createRadialGradient(x, y, 10, x, y, size * 0.9);
        g.addColorStop(0, `rgba(255,30,20,${0.3 + Math.sin(S.t * 6) * 0.1})`);
        g.addColorStop(1, 'rgba(255,30,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
      }
      if (S.attack && S.attack.mirror) {
        // its reflection, upside down
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.translate(x, y + 90);
        ctx.scale(1, -1);
        if (Art) Art.drawEvilSpark(ctx, 0, 0, size, { look: -look, rotate: -S.t * 0.4 });
        ctx.restore();
      }
      if (Art) Art.drawEvilSpark(ctx, x, y, size, { look, rotate: S.t * (L >= FINAL ? 1.5 : 0.4), blink });
      if (E.hurt > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      // its HP, Undertale-style, while you fight
      if (S.state === 'fight' || (E.dmg && E.dmg.t > 0)) {
        ctx.fillStyle = '#400';
        ctx.fillRect(VW / 2 - 60, 196, 120, 10);
        ctx.fillStyle = '#3f3';
        ctx.fillRect(VW / 2 - 60, 196, (120 * E.hp) / E.maxHp, 10);
      }
      if (S.banner) {
        const k = Math.min(1, S.banner.t / 0.3);
        ctx.globalAlpha = k;
        txt(S.banner.text, VW / 2, 196 - (1.6 - S.banner.t) * 8, 16, YEL, 'center');
        if (S.banner.sub) txt(S.banner.sub, VW / 2, 220 - (1.6 - S.banner.t) * 8, 10, '#5f5', 'center');
        ctx.globalAlpha = 1;
      }
      if (E.dmg && E.dmg.t > 0) txt(E.dmg.text, VW / 2, 170 - (1.1 - E.dmg.t) * 20, 18, E.dmg.text === 'MISS' ? '#bbb' : RED, 'center');
    }
    function drawBox() {
      ctx.fillStyle = '#000';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
    function drawBubble() {
      const b = S.bubble;
      if (!b) return;
      const x = VW / 2 + 90;
      const y = 60;
      const w = 210;
      // the bubble grows to fit its line (and the text shrinks if it's still too long)
      const h = clamp(wrapLines(b.text, w - 20, 10).length * 20 + 10, 70, 150);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, y + 30);
      ctx.lineTo(x - 16, y + 38);
      ctx.lineTo(x, y + 44);
      ctx.fill();
      ctx.fillRect(x, y, w, h);
      boxText(b.text, b.shown, x + 10, y + 10, w - 20, h - 20, 10, '#000');
    }
    function drawBullets() {
      const look = (b) => clamp((soul.x - b.x) / 120, -1, 1);
      for (const b of bullets) {
        if (b.kind === 'beam') {
          const a = b.charge > 0;
          ctx.fillStyle = a ? 'rgba(255,255,255,0.35)' : '#fff';
          const thick = a ? 2 : 26 * Math.min(1, b.fire / 0.2 + 0.4);
          if (b.horiz) ctx.fillRect(box.x - 40, b.pos - thick / 2, box.w + 80, thick);
          else ctx.fillRect(b.pos - thick / 2, box.y - 40, thick, box.h + 80);
          // the eye that fires it
          if (Art) {
            const ex = b.horiz ? box.x - 34 : b.pos;
            const ey = b.horiz ? b.pos : box.y - 34;
            Art.drawEvilSpark(ctx, ex, ey, 44, { glow: false, look: 0 });
          }
          continue;
        }
        if (b.warn > 0) {
          ctx.strokeStyle = `rgba(255,40,40,${0.4 + Math.sin(S.t * 40) * 0.3})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + Math.cos(b.aim) * 700, b.y + Math.sin(b.aim) * 700);
          ctx.stroke();
        }
        if (b.kind === 'letter') {
          const next = b.order === S.spellIdx;
          ctx.fillStyle = next ? '#fff' : b.order < 0 ? '#ff6a5a' : '#bbb';
          txt(b.ch, b.x, b.y - 7, 14, ctx.fillStyle, 'center');
          continue;
        }
        if (b.kind === 'ink') {
          ctx.fillStyle = '#8f2410';
          ctx.fillRect(b.x - 1, b.y - 8, 3, 10);
          continue;
        }
        drawSpark(b.x, b.y, b.r, look(b));
      }
    }
    function drawHud() {
      txt(NAME, 32, 400 - 4, 12, '#fff');
      txt(`LV ${S.level}`, 160, 396, 12, '#fff');
      txt('HP', 250, 398, 10, '#fff');
      ctx.fillStyle = '#c00';
      ctx.fillRect(280, 396, S.maxHp * 2.4, 16);
      ctx.fillStyle = YEL;
      ctx.fillRect(280, 396, Math.max(0, S.hp) * 2.4, 16);
      txt(`${Math.ceil(S.hp)} / ${S.maxHp}`, 340, 398, 12, '#fff');
      if (S.L.arcade) return; // no menu in the arcade levels
      BTN.forEach((b, i) => {
        const sel = S.state === 'menu' && !S.sub && S.menu === i;
        ctx.strokeStyle = sel ? YEL : ORANGE;
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x, BTN_Y, BTN_W, 42);
        txt(b.label, b.x + BTN_W / 2 + (sel ? 10 : 0), BTN_Y + 15, 12, sel ? YEL : ORANGE, 'center');
        if (sel) drawHeart(ctx, b.x + 18, BTN_Y + 21, RED);
      });
    }

    // full-screen frights, drawn over everything
    function frights() {
      if (S.dread) {
        const k = 0.22 + Math.sin(S.t * 7.5) * 0.1;
        const g = ctx.createRadialGradient(VW / 2, VH / 2, 160, VW / 2, VH / 2, 420);
        g.addColorStop(0, 'rgba(120,0,0,0)');
        g.addColorStop(1, `rgba(120,0,0,${k})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VW, VH);
      }
      if (S.subl > 0) {
        ctx.fillStyle = 'rgba(90,0,0,0.9)';
        ctx.fillRect(0, 0, VW, VH);
        if (Art) Art.drawEvilSpark(ctx, VW / 2, VH / 2, 420, { look: 0 });
        txt(NAME, VW / 2, VH - 90, 28, '#000', 'center');
      }
      if (S.scare > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, VW, VH);
        if (Art) Art.drawEvilSpark(ctx, VW / 2 + rnd(-12, 12), VH / 2 + rnd(-12, 12), 640 + (0.5 - S.scare) * 400, { look: 0 });
        ctx.fillStyle = `rgba(255,0,0,${S.scare * 0.5})`;
        ctx.fillRect(0, 0, VW, VH);
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (S.state === 'arcade' && S.arc) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, VW, VH);
        if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
        ARC[S.L.arcade].draw(S.arc);
        for (const p of parts) {
          if (p.txt) txt(p.txt, p.x, p.y, 10, p.c, 'center');
          else if (p.spark) {
            ctx.fillStyle = p.c || '#5ad1ff';
            ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
          }
        }
        if (S.banner) {
          ctx.globalAlpha = Math.min(1, S.banner.t / 0.3);
          txt(S.banner.text, VW / 2, 180, 16, YEL, 'center');
          if (S.banner.sub) txt(S.banner.sub, VW / 2, 204, 9, '#5f5', 'center');
          ctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawHud();
        frights();
        if (S.flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.6})`;
          ctx.fillRect(0, 0, VW, VH);
        }
        return;
      }
      backdrop();
      if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
      drawEnemy();
      drawBox();
      // text inside the box
      if (S.state === 'text') boxText(S.text, S.shown, box.x + 24, box.y + 20, TEXTBOX.w - 48, TEXTBOX.h - 36);
      if (S.state === 'menu' && !S.sub) boxText(S.text, S.text.length, box.x + 24, box.y + 20, TEXTBOX.w - 48, TEXTBOX.h - 36);
      if (S.state === 'menu' && S.sub) {
        S.sub.items.forEach((it, j) => {
          const ready = S.sub.kind === 'mercy' && it[0] === 'Spare' && S.spareable;
          txt(`* ${it[0]}${ready ? `  (${MODEL})` : ''}`, box.x + 52, 268 + j * 30, 12, ready ? YEL : '#fff');
          if (j === S.sub.idx) drawHeart(ctx, box.x + 30, 275 + j * 30, RED);
        });
      }
      if (S.state === 'fight' && S.bar) {
        // the target: rings, with a bright centre stripe
        const cx = TEXTBOX.x + TEXTBOX.w / 2;
        for (let i = 6; i >= 1; i--) {
          ctx.strokeStyle = i === 1 ? '#fff' : `rgba(255,255,255,${0.1 + 0.08 * (6 - i)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cx, box.y + box.h / 2, (box.w / 2 - 14) * (i / 6), (box.h / 2 - 14) * (i / 6), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = S.bar.done ? YEL : '#fff';
        ctx.fillRect(S.bar.x - 4, box.y + 8, 8, box.h - 16);
      }
      if (S.state === 'attack') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
        ctx.clip();
        drawBullets();
        // purple: the strings you're caught on
        if (S.mode === 'purple') {
          [0.25, 0.5, 0.75].forEach((f, i) => {
            const flash = S.attack.flashLane === i && S.attack.flashT > 0;
            ctx.strokeStyle = flash ? 'rgba(255,90,90,0.9)' : 'rgba(180,76,255,0.65)';
            ctx.lineWidth = flash ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(box.x, box.y + box.h * f);
            ctx.lineTo(box.x + box.w, box.y + box.h * f);
            ctx.stroke();
          });
        }
        // blue: the floor
        if (S.mode === 'blue') {
          ctx.fillStyle = 'rgba(47,107,255,0.35)';
          ctx.fillRect(box.x, box.y + box.h - 3, box.w, 3);
        }
        playerHeart(soul.x, soul.y, SOUL_COLOR[S.mode] || RED);
        if (S.grazeT > 0) {
          ctx.strokeStyle = `rgba(255,255,255,${S.grazeT * 4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(soul.x, soul.y, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        // green: your shield, facing where you last pointed
        if (S.mode === 'green') {
          const A = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[S.shield];
          ctx.strokeStyle = '#5ad1ff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(soul.x, soul.y, 20, A - 0.7, A + 0.7);
          ctx.stroke();
        }
        // level 6: darkness, a little light around you; their eyes still glow
        if (S.L.dark || S.attack.dark) {
          const g = ctx.createRadialGradient(soul.x, soul.y, 18, soul.x, soul.y, 70);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.97)');
          ctx.fillStyle = g;
          ctx.fillRect(box.x, box.y, box.w, box.h);
          for (const b of bullets) {
            ctx.fillStyle = '#ff7a4a';
            ctx.fillRect(b.x - 2, b.y - 1, 4, 2);
          }
        }
        ctx.restore();
        // level 7: what the eye is doing
        if (S.L.attack === 'redlight') {
          const a = S.attack;
          txt(a.open ? "IT'S LOOKING. DON'T MOVE." : a.warning ? 'it is about to look...' : '- eyes shut -', VW / 2, box.y - 24, 10, a.open ? RED : a.warning ? ORANGE : '#888', 'center');
        }
        // what this SOUL colour does
        const HINT = { blue: 'UP / W / tap: jump', purple: 'UP / DOWN: change string', green: 'ARROWS or point: turn your shield', yellow: 'it shoots on its own: hit the eye' }[S.mode];
        if (HINT) txt(HINT, VW / 2, box.y - 24, 9, SOUL_COLOR[S.mode], 'center');
        // a generated attack shows its seed and recipe
        if (S.attack.p.gen) txt(`NEW PATTERN ${S.attack.p.label}`, VW / 2, box.y - (HINT ? 40 : 24), 8, Math.floor(S.t * 8) % 7 ? ORANGE : '#fff', 'center');
        else if (S.attack.heat < 1) txt('it hesitates...', VW / 2, box.y - (HINT ? 40 : 24), 8, '#aaa', 'center');
        // yellow: your shots, flying up out of the box at its eye
        if (S.mode === 'yellow') {
          ctx.fillStyle = '#ffd400';
          for (const p of S.pShots) ctx.fillRect(p.x - 1.5, p.y - 6, 3, 8);
        }
        if (S.L.attack === 'spell') {
          const shown = [...word].map((ch, k) => (k < S.spellIdx ? ch : '_')).join(' ');
          txt(shown, VW / 2, box.y - 24, 12, '#fff', 'center');
        }
      }
      if (S.state === 'talk') drawBubble();
      // spelling finished: your name turns into its name
      if (S.level === 8 && S.spellDone && S.state === 'text') txt('C L A U D E', VW / 2, 214, 14, ORANGE, 'center');
      for (const p of parts) {
        if (p.heart) drawHeart(ctx, p.x, p.y, RED, 1.2);
        else if (p.txt) txt(p.txt, p.x, p.y, 10, p.c, 'center');
        else if (p.spark) {
          ctx.fillStyle = p.c || '#5ad1ff';
          ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawHud();
      if (S.state === 'gameover') {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, S.deadT)})`;
        ctx.fillRect(0, 0, VW, VH);
        ctx.globalAlpha = Math.min(1, S.deadT * 0.8);
        txt('GAME', VW / 2, 120, 48, '#fff', 'center');
        txt('OVER', VW / 2, 190, 48, '#fff', 'center');
        if (S.deadT > 1.6) txt(`${model} 1  ·  humans 0`, VW / 2, 300, 12, ORANGE, 'center');
        ctx.globalAlpha = 1;
      }
      frights();
      if (S.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.6})`;
        ctx.fillRect(0, 0, VW, VH);
      }
      // the last level tears itself apart
      if (S.level >= FINAL && S.state === 'attack' && Art && Art.tear && Math.random() < 0.25) Art.tear(ctx, VW, VH, 0.35);
    }

    // ---- loop ----
    let resolve;
    const done = new Promise((r) => (resolve = r));
    let last = performance.now();
    let raf = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      cancelAnimationFrame(raf);
      dreadOff();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('mousemove', onMove);
      removeEventListener('touchmove', onMove);
      removeEventListener('mouseup', onUp);
      removeEventListener('touchend', onUp);
      wrap.remove();
      resolve({
        level: S.level,
        cleared: Math.max(0, SEQ.indexOf(S.level)),
        shots: S.fights,
        hits: Math.round(S.accSum),
        accuracy: S.fights ? Math.round((S.accSum / S.fights) * 100) : 0,
        dodges: S.dodges,
        spared: S.route.filter((r) => r === 'spare').length,
        killed: S.route.filter((r) => r === 'kill').length,
        seconds: Math.round((performance.now() - S.startT) / 1000),
        score: Math.max(0, SEQ.indexOf(S.level)) * 100,
      });
    }
    raf = requestAnimationFrame(frame);
    // developers only: ?battle=N starts at level N for testing (normal play always starts at 1)
    const dev = parseInt(new URLSearchParams(location.search).get('battle'), 10);
    startLevel(dev >= 1 && dev <= FINAL ? dev : SEQ[0]);
    // with ?battle, tests can step the game clock directly (rendering pauses in background tabs)
    if (dev) window.__battle = { S, E, soul, keys, confirm, step: (dt) => { update(dt); draw(); }, bullets: () => bullets, arc: () => S.arc, startLevel, ARC };
    return done;
  }

  window.Battle = { play };
})();
