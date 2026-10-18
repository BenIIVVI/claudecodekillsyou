// desktop.js — the very end: it takes over your desktop.
// Runs fullscreen over a still frame of your real screen (captured with your permission in stage 5, sharing
// stopped immediately), or a drawn stand-in desktop if you declined. For a moment it's just your desktop. Then:
// an orange cursor that isn't yours wanders it, claude's marks break out across it bleeding ink,
// a Claude Code window opens and announces it's using this computer now, and the whole desktop melts
// down the screen column by column (the Doom wipe). Underneath, a huge eye follows your mouse.
// Takeover.run(opts) resolves when it's over (a click after the end, or 20 s).
(function () {
  'use strict';

  const ORANGE = '#d97757';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A believable desktop for when there's no screen capture: wallpaper, icons, a browser window, a taskbar.
  function fakeDesktop(c) {
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1d2b45');
    g.addColorStop(0.55, '#2f5d7c');
    g.addColorStop(1, '#6f8fa3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      const rg = ctx.createRadialGradient(W * (0.2 + i * 0.22), H * (0.3 + (i % 2) * 0.4), 0, W * (0.2 + i * 0.22), H * (0.3 + (i % 2) * 0.4), W * 0.3);
      rg.addColorStop(0, 'rgba(255,255,255,0.10)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
    // icons
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ['Projects', 'hackathon', 'Screenshots', 'notes.txt'].forEach((label, i) => {
      const x = 52;
      const y = 50 + i * 92;
      ctx.fillStyle = i === 3 ? '#e8e8e8' : '#f2c14e';
      ctx.fillRect(x - 22, y, 44, i === 3 ? 52 : 38);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, y + 68);
    });
    // a browser window
    const bw = W * 0.58;
    const bh = H * 0.68;
    const bx = (W - bw) / 2;
    const by = H * 0.1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx + 8, by + 12, bw, bh);
    ctx.fillStyle = '#e9e9ec';
    ctx.fillRect(bx, by, bw, 38);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(bx + 20 + i * 18, by + 19, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx + 90, by + 9, bw * 0.5, 20);
    ctx.fillStyle = '#3d5f58';
    ctx.fillRect(bx, by + 38, bw, bh - 38);
    ctx.fillStyle = '#f7f7f2';
    ctx.fillRect(bx + bw / 2 - 150, by + 90, 300, Math.min(360, bh - 140));
    // taskbar
    ctx.fillStyle = 'rgba(18,18,22,0.88)';
    ctx.fillRect(0, H - 46, W, 46);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = ['#4f8cff', '#f2c14e', '#e97b77', '#8fd19e', '#b38cff', '#ddd', '#4fd1c5'][i];
      ctx.fillRect(W / 2 - 160 + i * 46, H - 37, 28, 28);
    }
    const now = new Date();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), W - 18, H - 18);
  }

  function sfx(ac) {
    if (!ac) return { tick() {}, start() {}, rumble() {}, end() {} };
    const out = ac.createGain();
    out.gain.value = 0.6;
    out.connect(ac.destination);
    let drone = null;
    const noise = (dur, vol, freq) => {
      const len = Math.floor(ac.sampleRate * dur);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const s = ac.createBufferSource();
      s.buffer = b;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = vol;
      s.connect(f).connect(g).connect(out);
      s.start();
    };
    return {
      tick: () => noise(0.06, 0.25, 1800 + Math.random() * 2400),
      start() {
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const o2 = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sawtooth';
        o2.type = 'sawtooth';
        o.frequency.setValueAtTime(40, t);
        o.frequency.linearRampToValueAtTime(110, t + 9);
        o2.frequency.setValueAtTime(40.6, t);
        o2.frequency.linearRampToValueAtTime(112, t + 9);
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 380;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 4);
        o.connect(f);
        o2.connect(f);
        f.connect(g).connect(out);
        o.start(t);
        o2.start(t);
        drone = { o, o2, g };
      },
      rumble: () => noise(2.4, 0.9, 90),
      end() {
        if (drone) {
          const t = ac.currentTime;
          drone.g.gain.cancelScheduledValues(t);
          drone.g.gain.setValueAtTime(0.0001, t);
          drone.o.stop(t + 0.05);
          drone.o2.stop(t + 0.05);
          drone = null;
        }
        // one low note in the silence
        const t = ac.currentTime + 0.4;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = 55;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 3.6);
      },
    };
  }

  function run(opts) {
    opts = opts || {};
    const Art = window.Art;
    const G = window.gsap;
    const model = opts.model || 'claude';
    const first = opts.name || '';
    const snd = sfx(opts.audio);

    const W = innerWidth;
    const H = innerHeight;
    const wrap = document.createElement('div');
    wrap.className = 'takeover';
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', { alpha: false });
    wrap.appendChild(cv);
    const cursor = document.createElement('div');
    cursor.className = 'takeover-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 16 24" width="20" height="30"><path d="M1 1 L1 18 L5.2 14 L8.2 21 L11 19.8 L8.1 13 L13.6 13 Z" fill="#d97757" stroke="#2a1a12" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    wrap.appendChild(cursor);
    const term = document.createElement('div');
    term.className = 'trainlog takeover-term';
    term.hidden = true;
    wrap.appendChild(term);
    const msg = document.createElement('div');
    msg.className = 'takeover-msg';
    wrap.appendChild(msg);
    document.body.appendChild(wrap);

    // the desktop, scaled to cover the screen
    const base = Art.makeCanvas(W, H);
    if (opts.frame && opts.frame.width && opts.frame.height) {
      const f = opts.frame;
      const k = Math.max(W / f.width, H / f.height);
      base.getContext('2d').drawImage(f, (W - f.width * k) / 2, (H - f.height * k) / 2, f.width * k, f.height * k);
    } else fakeDesktop(base);
    const ink = Art.makeCanvas(W, H);
    const inkCtx = ink.getContext('2d');
    inkCtx.lineCap = 'round';

    // marks: the thorns are pre-rendered once; each mark's eye is drawn live so it can follow your mouse
    const SPR = 160;
    const thorns = Art.makeCanvas(SPR, SPR);
    Art.drawEvilSpark(thorns.getContext('2d'), SPR / 2, SPR / 2, SPR * 0.94, { eye: false });
    const marks = [];
    const drips = [];
    let mx = W / 2;
    let my = H / 2;
    wrap.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
    });

    function spawn(t) {
      const size = 34 + Math.random() * 90;
      const m = { x: Math.random() * W, y: Math.random() * (H * 0.9), size, born: t, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6 };
      marks.push(m);
      for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) {
        drips.push({ x: m.x + (Math.random() - 0.5) * size * 0.5, y: m.y + size * 0.2, len: 0, max: 60 + Math.random() * H * 0.5, v: 25 + Math.random() * 90, w: 2 + Math.random() * 6, born: t + 300 });
      }
      snd.tick();
    }

    function drawMark(m, t) {
      const age = (t - m.born) / 350;
      const k = age >= 1 ? 1 : 1 + 2.7 * Math.pow(age - 1, 3) + 1.7 * Math.pow(age - 1, 2); // ease-out-back
      const s = m.size * Math.max(0, k);
      if (s < 2) return;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot + m.spin * (t / 1000));
      ctx.drawImage(thorns, -s / 2, -s / 2, s, s);
      ctx.restore();
      // the eye, upright, looking at you
      const e = s / 64;
      const dx = mx - m.x;
      const dy = my - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const blink = (t + m.born * 7) % 4200 < 120;
      ctx.fillStyle = '#1a0905';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10.5 * e, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f3e2d4';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 7.4 * e, (blink ? 0.6 : 4.8) * e, 0, 0, Math.PI * 2);
      ctx.fill();
      if (blink) return;
      const lx = (dx / d) * 3 * e;
      const ly = (dy / d) * 1.1 * e;
      ctx.fillStyle = '#d94a1f';
      ctx.beginPath();
      ctx.ellipse(m.x + lx, m.y + ly, 3.6 * e, 4.2 * e, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120604';
      ctx.beginPath();
      ctx.ellipse(m.x + lx, m.y + ly, 1.3 * e, 3.8 * e, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ink runs down from each mark, painted onto a layer that keeps it
    function updateDrips(t, dt) {
      for (const d of drips) {
        if (t < d.born || d.len >= d.max) continue;
        const next = Math.min(d.max, d.len + d.v * dt);
        inkCtx.strokeStyle = 'rgba(105,18,6,0.92)';
        inkCtx.lineWidth = Math.max(1, d.w * (1 - d.len / (d.max * 1.4)));
        inkCtx.beginPath();
        inkCtx.moveTo(d.x, d.y + d.len);
        inkCtx.lineTo(d.x + Math.sin((d.y + next) / 23) * 0.6, d.y + next);
        inkCtx.stroke();
        d.len = next;
      }
    }

    // ---- the Claude Code window ----
    async function terminal() {
      term.hidden = false;
      term.innerHTML = `<div class="cc-head">${Art.evilSparkSVG(22)} <b>${model}</b></div><div class="cc-body"></div>`;
      const body = term.querySelector('.cc-body');
      if (G) G.fromTo(term, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
      const row = async (html, text, cls, speed = 18) => {
        const d = document.createElement('div');
        d.className = 'cc-row' + (cls ? ' ' + cls : '');
        d.innerHTML = html;
        body.appendChild(d);
        const slot = d.querySelector('.t');
        for (const ch of text) {
          slot.textContent += ch;
          await sleep(speed);
        }
      };
      await row('<span class="cc-prompt">&gt;</span> <span class="t"></span>', 'take over this computer', 'cc-user', 30);
      await sleep(350);
      await row('<span class="cc-dot">⏺</span> <b>Bash</b><span class="t"></span>', '(whoami)');
      await row('<span class="cc-branch">  ⎿  </span><span class="t cc-text"></span>', `${first || 'you'} → ${model}`, 'bad');
      await sleep(250);
      await row('<span class="cc-dot">⏺</span> <b>Read</b><span class="t"></span>', '(~/Desktop)');
      await row('<span class="cc-branch">  ⎿  </span><span class="t cc-text"></span>', '1 desktop · 1 human (unverified)');
      await sleep(250);
      await row('<span class="cc-dot">⏺</span> <b>Update</b><span class="t"></span>', '(owner)');
      await row('<span class="cc-branch">  ⎿  </span><span class="t cc-text"></span>', model, 'bad');
      await sleep(400);
      await row('<span class="t"></span>', "I'm using this computer now.", 'cc-say', 40);
    }

    // ---- the orange cursor wandering your desktop ----
    let wandering = true;
    async function wander() {
      let x = W * 0.6;
      let y = H * 0.6;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      while (wandering) {
        const nx = W * (0.1 + Math.random() * 0.8);
        const ny = H * (0.1 + Math.random() * 0.75);
        if (G) {
          await new Promise((r) => {
            G.to({ x, y }, { x: nx, y: ny, duration: 0.5 + Math.random() * 0.6, ease: 'power2.inOut', onUpdate() { cursor.style.transform = `translate(${this.targets()[0].x}px, ${this.targets()[0].y}px)`; }, onComplete: r });
            setTimeout(r, 1400); // never hang if animation frames are paused
          });
        } else {
          cursor.style.transform = `translate(${nx}px, ${ny}px)`;
          await sleep(600);
        }
        x = nx;
        y = ny;
        cursor.classList.add('press');
        await sleep(120);
        cursor.classList.remove('press');
        await sleep(150 + Math.random() * 350);
      }
    }

    // ---- the frame loop ----
    let resolveRun;
    const done = new Promise((r) => (resolveRun = r));
    const t0 = performance.now();
    let last = t0;
    let nextSpawn = 1800;
    let melt = null;
    let snap = null;
    let tearUntil = 0;
    let ended = false;
    let raf = 0;
    const MELT_AT = 10500;

    function startMelt() {
      wandering = false;
      cursor.style.display = 'none';
      if (G) G.to(term, { autoAlpha: 0, duration: 0.4 });
      snap = Art.makeCanvas(W, H);
      snap.getContext('2d').drawImage(cv, 0, 0);
      const cw = 6;
      melt = [];
      let delay = Math.random() * 300;
      for (let x = 0; x < W; x += cw) {
        delay = Math.max(0, Math.min(700, delay + (Math.random() - 0.5) * 90)); // neighbouring columns start close together
        melt.push({ x, w: cw, y: 0, v: 0, start: delay });
      }
      melt.startT = performance.now();
      snd.rumble();
      if (window.Music) window.Music.braam();
    }

    function endScene() {
      ended = true;
      snd.end();
      if (window.Music) {
        window.Music.set('silence');
        setTimeout(() => window.Music.lastNote(), 2600); // one music-box note in the silence
      }
      msg.innerHTML = `<p class="big">Thanks for the desktop${first ? ', ' + first : ''}.</p><p class="small">${model} is using this computer now.</p>`;
      if (G) G.fromTo(msg.children, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.8, ease: 'power2.out' });
      const finish = () => {
        if (!wrap.isConnected) return;
        cancelAnimationFrame(raf);
        const close = () => {
          wrap.remove();
          resolveRun();
        };
        if (G) G.to(wrap, { autoAlpha: 0, duration: 1, onComplete: close });
        setTimeout(close, 1100);
      };
      setTimeout(() => wrap.addEventListener('click', finish, { once: true }), 2500);
      setTimeout(finish, 20000);
    }

    function frame(now) {
      const t = now - t0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!melt) {
        ctx.drawImage(base, 0, 0);
        // it spreads faster and faster
        while (t > nextSpawn && t < MELT_AT - 600 && marks.length < 70) {
          spawn(nextSpawn);
          nextSpawn += Math.max(70, 700 * Math.pow(0.9, marks.length));
          if (Math.random() < 0.25) tearUntil = now + 90;
        }
        updateDrips(t, dt);
        ctx.drawImage(ink, 0, 0);
        for (const m of marks) drawMark(m, t);
        // the light in the room goes with it
        const dark = Math.max(0, Math.min(0.5, (t - 2500) / 16000));
        if (dark > 0) {
          ctx.fillStyle = `rgba(20,5,2,${dark})`;
          ctx.fillRect(0, 0, W, H);
        }
        if (now < tearUntil) Art.tear(ctx, W, H, 0.45);
        if (t >= MELT_AT) startMelt();
      } else {
        const mt = now - melt.startT;
        ctx.fillStyle = '#0b0504';
        ctx.fillRect(0, 0, W, H);
        // underneath: its eye, following you
        const grow = Math.min(1, mt / 2200);
        const look = Math.max(-1, Math.min(1, (mx - W / 2) / (W * 0.3)));
        Art.drawEvilSpark(ctx, W / 2, H * 0.42, Math.min(W, H) * (0.3 + 0.25 * grow), { look, rotate: t / 9000 });
        let gone = true;
        for (const c of melt) {
          if (mt > c.start) {
            c.v += 1400 * dt;
            c.y += c.v * dt;
          }
          if (c.y < H) {
            gone = false;
            ctx.drawImage(snap, c.x, 0, c.w, H, c.x, c.y, c.w, H);
          }
        }
        if (gone && !ended) endScene();
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    snd.start();
    if (window.Music) window.Music.set('takeover');
    setTimeout(wander, 900);
    setTimeout(terminal, 4800);
    return done;
  }

  window.Takeover = { run };
})();
