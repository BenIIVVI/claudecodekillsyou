// art.js — every image in the CAPTCHA is drawn here on canvas. No asset files.
// Rooms use a one-point-perspective box: P(u, s, e) maps a point inside the room to the screen.
//   u = left→right (0..1), s = depth (0 = camera plane, 1 = back wall), e = floor→ceiling (0..1)
(function () {
  'use strict';

  // ---- helpers ----
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function poly(ctx, pts, fill) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function grain(ctx, w, h, amount) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function vignette(ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Camera-ish finish: tint, darken, soften, vignette, grain.
  function finish(ctx, w, h, f) {
    if (f.tint) {
      ctx.fillStyle = f.tint;
      ctx.fillRect(0, 0, w, h);
    }
    if (f.dark) {
      ctx.fillStyle = `rgba(0,0,0,${f.dark})`;
      ctx.fillRect(0, 0, w, h);
    }
    const tmp = makeCanvas(w, h);
    tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.filter = `blur(${(w / 420).toFixed(2)}px) saturate(0.8) contrast(1.05)`;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    vignette(ctx, w, h, f.vig != null ? f.vig : 0.5);
    if (f.grain) grain(ctx, w, h, f.grain);
  }

  // Camcorder date stamp, bottom-left.
  function stamp(ctx, w, h, lines) {
    const fs = Math.round(h * 0.078);
    ctx.save();
    ctx.font = `bold ${fs}px "Courier New", monospace`;
    ctx.fillStyle = '#f4f1c9';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = fs * 0.3;
    lines.forEach((t, i) => ctx.fillText(t, w * 0.06, h * 0.93 - (lines.length - 1 - i) * fs * 1.15));
    ctx.restore();
  }

  // ---- figures ----

  // A standing human shape, a little too tall and too thin. (x, footY) = feet, H = height.
  // The thing, standing: emaciated body, arms hanging past its knees, head cocked, face catching the light.
  // o: { light, tilt, mouth }
  function figure(ctx, x, footY, H, color, blur, o) {
    o = o || {};
    const s = H * 0.12; // head height
    const neckY = footY - H + s * 1.55;
    const sw = H * 0.085;
    const hw = H * 0.05;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.1, neckY);
    ctx.lineTo(x + s * 0.1, neckY);
    ctx.quadraticCurveTo(x + sw, neckY + s * 0.1, x + sw, neckY + s * 0.7);
    ctx.lineTo(x + hw * 1.1, footY - H * 0.44);
    ctx.lineTo(x + hw * 0.55, footY);
    ctx.lineTo(x + hw * 0.1, footY);
    ctx.lineTo(x, footY - H * 0.4);
    ctx.lineTo(x - hw * 0.1, footY);
    ctx.lineTo(x - hw * 0.55, footY);
    ctx.lineTo(x - hw * 1.1, footY - H * 0.44);
    ctx.lineTo(x - sw, neckY + s * 0.7);
    ctx.quadraticCurveTo(x - sw, neckY + s * 0.1, x - s * 0.1, neckY);
    ctx.closePath();
    ctx.fill();
    // arms: far too long, ending in long fingers near the floor
    ctx.lineCap = 'round';
    [-1, 1].forEach((k) => {
      const ax = x + k * sw * 0.95;
      const hx = x + k * sw * 1.5;
      const hy = footY - H * 0.1;
      ctx.lineWidth = Math.max(1, H * 0.018);
      ctx.beginPath();
      ctx.moveTo(ax, neckY + s * 0.5);
      ctx.quadraticCurveTo(ax + k * H * 0.03, footY - H * 0.5, hx, hy);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.6, H * 0.007);
      for (let f = -1.5; f <= 1.5; f++) {
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + f * H * 0.008, hy + H * 0.065);
        ctx.stroke();
      }
    });
    ctx.restore();
    wraith(ctx, x, footY - H, s, { light: o.light != null ? o.light : 0.6, tilt: o.tilt != null ? o.tilt : 0.38, mouth: o.mouth != null ? o.mouth : 0.35, blur, body: false, seed: 3 });
  }

  // Head and shoulders seen from behind. (x, y) = top of head, s = head height.
  function bust(ctx, x, y, s, color, blur) {
    ctx.save();
    ctx.fillStyle = color;
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.5, s * 0.4, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.22, y + s * 0.8);
    ctx.lineTo(x + s * 0.22, y + s * 0.8);
    ctx.lineTo(x + s * 0.25, y + s * 1.05);
    ctx.quadraticCurveTo(x + s * 1.15, y + s * 1.1, x + s * 1.25, y + s * 1.7);
    ctx.lineTo(x + s * 1.35, y + s * 3.2);
    ctx.lineTo(x - s * 1.35, y + s * 3.2);
    ctx.lineTo(x - s * 1.25, y + s * 1.7);
    ctx.quadraticCurveTo(x - s * 1.15, y + s * 1.1, x - s * 0.25, y + s * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The thing. A gaunt grey-white face with hollow black eyes and pinprick pupils, a jaw that hangs
  // too far open, long wet black hair falling over it, a long neck and drooping bony shoulders.
  // (x, y) = top of head, s = head height.
  // o: { alpha, tilt (rad), mouth 0..1, light 0..1, blur, body, seed, t (ms: drives the hair drifting) }
  let scratch = null; // reused between frames, since the webcam redraws this 30 times a second
  function wraith(ctx, x, y, s, o) {
    o = o || {};
    if (s < 2) return;
    if (assets.peek && o.body !== false) return peekFace(ctx, x, y, s, o);
    const r = rng(o.seed || 7);
    const mouth = o.mouth != null ? o.mouth : 0.5;
    const light = o.light != null ? o.light : 1;
    const body = o.body !== false;
    const t = o.t || 0;
    const sway = (i) => (t ? Math.sin(t / 900 + i * 1.7) * s * 0.06 + Math.sin(t / 370 + i) * s * 0.015 : 0);
    const W = Math.ceil(s * 4);
    const H = Math.ceil(s * (body ? 4.6 : 3.2));
    if (!scratch) scratch = makeCanvas(W, H);
    if (scratch.width < W || scratch.height < H) {
      scratch.width = Math.max(W, scratch.width);
      scratch.height = Math.max(H, scratch.height);
    }
    const c = scratch;
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const cx = W / 2;
    const hy = s * 0.7; // head centre
    g.translate(cx, hy);
    g.rotate(o.tilt || 0);
    const faceH = s * (1 + mouth * 0.28);
    const faceW = s * 0.62;
    const pale = (k) => `rgb(${Math.round(205 * light * k)},${Math.round(204 * light * k)},${Math.round(190 * light * k)})`;

    // hair behind
    g.fillStyle = '#050506';
    g.beginPath();
    g.ellipse(0, -s * 0.05, faceW * 0.62, s * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(5,5,6,0.95)';
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const sx = lerp(-faceW * 0.55, faceW * 0.55, r());
      const len = s * lerp(1.6, 3.0, r());
      g.lineWidth = s * lerp(0.02, 0.06, r());
      g.beginPath();
      g.moveTo(sx * 0.6, -s * 0.5);
      const w1 = sway(i);
      g.bezierCurveTo(sx * 1.4, -s * 0.1, sx * 1.6 + (r() - 0.5) * s * 0.3 + w1 * 0.5, len * 0.5, sx * 1.5 + (r() - 0.5) * s * 0.5 + w1, len);
      g.stroke();
    }

    if (body) {
      // neck: too long, too thin
      const ng = g.createLinearGradient(0, s * 0.35, 0, s * 1.6);
      ng.addColorStop(0, pale(0.5));
      ng.addColorStop(1, pale(0.15));
      g.fillStyle = ng;
      g.beginPath();
      g.moveTo(-s * 0.08, s * 0.35);
      g.lineTo(s * 0.08, s * 0.35);
      g.lineTo(s * 0.11, s * 1.6);
      g.lineTo(-s * 0.11, s * 1.6);
      g.fill();
      // shoulders: narrow, sloping steeply, all bone
      g.fillStyle = '#0a0a0c';
      g.beginPath();
      g.moveTo(-s * 0.12, s * 1.45);
      g.quadraticCurveTo(-s * 0.7, s * 1.55, -s * 1.05, s * 2.6);
      g.lineTo(-s * 1.15, s * 4);
      g.lineTo(s * 1.15, s * 4);
      g.lineTo(s * 1.05, s * 2.6);
      g.quadraticCurveTo(s * 0.7, s * 1.55, s * 0.12, s * 1.45);
      g.closePath();
      g.fill();
    }

    // face
    const fg = g.createRadialGradient(0, -s * 0.05, s * 0.05, 0, s * 0.05, faceH * 0.65);
    fg.addColorStop(0, pale(1));
    fg.addColorStop(0.7, pale(0.78));
    fg.addColorStop(1, pale(0.42));
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(0, -s * 0.5);
    g.bezierCurveTo(faceW * 0.62, -s * 0.5, faceW * 0.55, faceH * 0.2, faceW * 0.22, faceH * 0.5);
    g.quadraticCurveTo(0, faceH * 0.6, -faceW * 0.22, faceH * 0.5);
    g.bezierCurveTo(-faceW * 0.55, faceH * 0.2, -faceW * 0.62, -s * 0.5, 0, -s * 0.5);
    g.fill();
    // sunken cheeks
    g.fillStyle = 'rgba(40,38,34,0.35)';
    [-1, 1].forEach((k) => {
      g.beginPath();
      g.ellipse(k * faceW * 0.3, s * 0.18, faceW * 0.1, s * 0.16, k * 0.2, 0, Math.PI * 2);
      g.fill();
    });

    // eyes: big hollow sockets, bruised rings, one a little lower, tiny white pupils staring straight out
    [[-1, 0], [1, s * 0.025]].forEach(([k, dy]) => {
      const ex = k * faceW * 0.27;
      const ey = -s * 0.07 + dy;
      const ring = g.createRadialGradient(ex, ey, s * 0.05, ex, ey, s * 0.2);
      ring.addColorStop(0, 'rgba(20,10,12,0.9)');
      ring.addColorStop(1, 'rgba(40,20,25,0)');
      g.fillStyle = ring;
      g.beginPath();
      g.ellipse(ex, ey, s * 0.2, s * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(ex, ey, s * 0.105, s * 0.135, k * 0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(245,245,235,0.95)';
      g.beginPath();
      g.arc(ex + k * s * 0.01, ey + s * 0.01, Math.max(0.6, s * 0.017), 0, Math.PI * 2);
      g.fill();
      // something dark running down from each eye
      g.strokeStyle = 'rgba(25,8,10,0.6)';
      g.lineWidth = Math.max(0.6, s * 0.018);
      g.beginPath();
      g.moveTo(ex, ey + s * 0.12);
      g.quadraticCurveTo(ex + k * s * 0.03, ey + s * 0.3, ex - k * s * 0.01, ey + s * 0.45);
      g.stroke();
    });
    // nose: just two slits
    g.fillStyle = 'rgba(15,12,10,0.8)';
    g.fillRect(-s * 0.04, s * 0.13, s * 0.025, s * 0.04);
    g.fillRect(s * 0.015, s * 0.13, s * 0.025, s * 0.04);
    // mouth: a long black hole, unhinged
    const mh = s * (0.06 + mouth * 0.42);
    const my = s * 0.27 + mh / 2;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(0, my, s * (0.08 + mouth * 0.05), mh / 2, 0, 0, Math.PI * 2);
    g.fill();
    if (mouth > 0.3) {
      // a few teeth at the top edge
      g.fillStyle = pale(0.85);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * s * 0.03 - s * 0.012, my - mh / 2 + s * 0.012);
        g.lineTo(i * s * 0.03 + s * 0.012, my - mh / 2 + s * 0.012);
        g.lineTo(i * s * 0.03, my - mh / 2 + s * 0.05);
        g.fill();
      }
    }

    // hair in front: a few strands straight down over the face
    g.strokeStyle = 'rgba(4,4,5,0.92)';
    for (let i = 0; i < 9; i++) {
      const sx = lerp(-faceW * 0.45, faceW * 0.45, r());
      if (Math.abs(sx) < faceW * 0.3) continue; // keep the eyes clear
      g.lineWidth = s * lerp(0.015, 0.035, r());
      g.beginPath();
      g.moveTo(sx * 0.4, -s * 0.5);
      g.quadraticCurveTo(sx * 1.1, s * 0.2, sx * 1.05 + (r() - 0.5) * s * 0.1 + sway(i + 50) * 0.6, s * lerp(0.9, 1.6, r()));
      g.stroke();
    }

    ctx.save();
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    if (o.blur) ctx.filter = `blur(${o.blur}px)`;
    ctx.drawImage(c, x - cx, y + s * 0.5 - hy);
    ctx.restore();
  }

  // A long grey hand with too many joints, fingers spread. (x, y) = wrist; it points along `angle`.
  function hand(ctx, x, y, s, angle, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.filter = `blur(${Math.max(0.5, s / 60)}px)`;
    ctx.strokeStyle = '#6f6c64';
    ctx.lineWidth = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(-s * 2.2, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.fillStyle = '#8d897e';
    ctx.beginPath();
    ctx.ellipse(s * 0.2, 0, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    [-0.42, -0.14, 0.12, 0.38].forEach((a, i) => {
      let px = s * 0.4;
      let py = a * s * 0.4;
      let dir = a * 0.5;
      ctx.lineWidth = s * 0.11;
      for (let j = 0; j < 3; j++) {
        const len = s * (0.5 - j * 0.08) * (i === 0 || i === 3 ? 0.85 : 1);
        const nx = px + Math.cos(dir) * len;
        const ny = py + Math.sin(dir) * len;
        ctx.strokeStyle = '#97938a';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        px = nx;
        py = ny;
        dir += 0.35; // curling in, gripping
      }
      ctx.fillStyle = '#1a1412';
      ctx.beginPath();
      ctx.arc(px, py, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Video-tear glitch on a region: horizontal bands shoved sideways, and the red and blue
  // channels pulled apart. amount 0..1.
  function glitch(ctx, x, y, w, h, amount) {
    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    w = Math.min(ctx.canvas.width - x, Math.floor(w));
    h = Math.min(ctx.canvas.height - y, Math.floor(h));
    if (w < 4 || h < 4 || amount <= 0) return;
    const img = ctx.getImageData(x, y, w, h);
    const src = img.data;
    const out = new Uint8ClampedArray(src);
    const split = Math.round(2 + amount * 10);
    let band = 0;
    let shift = 0;
    for (let row = 0; row < h; row++) {
      if (row >= band) {
        band = row + 2 + Math.floor(Math.random() * h * 0.12);
        shift = Math.random() < 0.45 * amount ? Math.round((Math.random() - 0.5) * w * 0.25 * amount) : 0;
      }
      for (let col = 0; col < w; col++) {
        const o = (row * w + col) * 4;
        const sc = Math.min(w - 1, Math.max(0, col - shift));
        const rc = Math.min(w - 1, Math.max(0, sc + split));
        const bc = Math.min(w - 1, Math.max(0, sc - split));
        out[o] = src[(row * w + rc) * 4];
        out[o + 1] = src[(row * w + sc) * 4 + 1];
        out[o + 2] = src[(row * w + bc) * 4 + 2];
        out[o + 3] = 255;
      }
    }
    img.data.set(out);
    ctx.putImageData(img, x, y);
  }

  // The same tear, done entirely with drawImage so it stays on the GPU (no pixel readback):
  // horizontal bands shoved sideways plus a brightened colour-fringe ghost. For per-frame use.
  let tearBuf = null;
  function tear(ctx, w, h, amount) {
    if (amount <= 0) return;
    if (!tearBuf || tearBuf.width !== w || tearBuf.height !== h) tearBuf = makeCanvas(w, h);
    const b = tearBuf.getContext('2d');
    b.globalCompositeOperation = 'copy';
    b.drawImage(ctx.canvas, 0, 0);
    let y = 0;
    while (y < h) {
      const bh = 2 + Math.random() * h * 0.1;
      if (Math.random() < 0.45 * amount) {
        const dx = (Math.random() - 0.5) * w * 0.25 * amount;
        ctx.drawImage(tearBuf, 0, y, w, bh, dx, y, w, bh);
      }
      y += bh;
    }
    const split = 2 + amount * 8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 * amount;
    ctx.drawImage(tearBuf, split, 0);
    ctx.drawImage(tearBuf, -split, 0);
    ctx.restore();
  }

  function eyes(ctx, x, y, gap, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,150,100,0.95)';
    ctx.shadowColor = 'rgba(255,90,42,0.8)';
    ctx.shadowBlur = r * 3;
    [-1, 1].forEach((k) => {
      ctx.beginPath();
      ctx.ellipse(x + (k * gap) / 2, y, r * 1.2, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ---- rooms ----

  function roomSpace(w, h, bx, by, bw, bh) {
    return function P(u, s, e) {
      const xl = lerp(0, bx, s);
      const xr = lerp(w, bx + bw, s);
      const yb = lerp(h, by + bh, s);
      const yt = lerp(0, by, s);
      return [lerp(xl, xr, u), lerp(yb, yt, e)];
    };
  }

  // A box sitting on the floor. Draws the inner side, the top, then the front.
  function box(ctx, P, u1, u2, s1, s2, e, col) {
    const side = (u1 + u2) / 2 < 0.5 ? u2 : u1;
    poly(ctx, [P(side, s1, 0), P(side, s2, 0), P(side, s2, e), P(side, s1, e)], col.side);
    poly(ctx, [P(u1, s1, e), P(u2, s1, e), P(u2, s2, e), P(u1, s2, e)], col.top);
    poly(ctx, [P(u1, s1, 0), P(u2, s1, 0), P(u2, s1, e), P(u1, s1, e)], col.front);
  }

  // A chair with its back to the camera, facing the wall.
  function chair(ctx, P, u, s, col) {
    box(ctx, P, u, u + 0.1, s, s + 0.07, 0.15, col);
    box(ctx, P, u, u + 0.1, s, s + 0.012, 0.36, col);
  }

  function drawDoor(ctx, P, d, k) {
    const H = 0.76;
    const pt =
      d.wall === 'B'
        ? (t, e) => P(lerp(d.a, d.b, t), 1, e)
        : (t, e) => P(d.wall === 'L' ? 0 : 1, lerp(d.a, d.b, t), e);
    const q = [pt(0, 0), pt(1, 0), pt(1, H), pt(0, H)];
    if (k.open) {
      poly(ctx, q, '#060504');
      if (k.watcher) {
        const a = pt(0.42, 0.6);
        const b = pt(0.58, 0.6);
        eyes(ctx, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]), k.w / 220);
      }
    } else {
      poly(ctx, q, k.door);
      const kn = pt(0.86, 0.36);
      ctx.beginPath();
      ctx.arc(kn[0], kn[1], Math.max(1.2, k.w / 260), 0, Math.PI * 2);
      ctx.fillStyle = k.frame;
      ctx.fill();
    }
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.lineWidth = Math.max(1.5, k.w / 170);
    ctx.strokeStyle = k.frame;
    ctx.stroke();
  }

  // Empty liminal rooms. o: { seed, kind: hall|room|bedroom|office, openDoor, watcher, hue, sat, light,
  //   night, dark, vig, grain, door: {wall,a,b}, window: false, furniture: false, draw(ctx,P,w,h), stamp }
  function room(ctx, w, h, o) {
    o = o || {};
    const r = rng(o.seed || 1);
    const kind = o.kind || 'room';
    const hall = kind === 'hall';
    const bw = w * (hall ? lerp(0.14, 0.2, r()) : lerp(0.44, 0.56, r()));
    const bh = h * (hall ? lerp(0.2, 0.26, r()) : lerp(0.42, 0.52, r()));
    const bx = (w - bw) / 2 + (r() - 0.5) * w * (hall ? 0.12 : 0.2);
    const by = (h - bh) / 2 - h * 0.03 + (r() - 0.5) * h * 0.06;
    const P = roomSpace(w, h, bx, by, bw, bh);
    const hue = o.hue != null ? o.hue : lerp(36, 58, r());
    const sat = o.sat != null ? o.sat : lerp(14, 28, r());
    const L = o.light != null ? o.light : lerp(44, 58, r());
    const c = (k, dh = 0, ds = 1) => hsl(hue + dh, sat * ds, Math.min(96, L * k));

    // planes
    poly(ctx, [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], c(0.82));
    poly(ctx, [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], c(0.52, -12, 0.8));
    poly(ctx, [P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)], c(0.9));
    poly(ctx, [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], c(0.74));
    poly(ctx, [P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)], c(0.98));
    const bb = 0.035;
    poly(ctx, [P(0, 0, 0), P(0, 1, 0), P(0, 1, bb), P(0, 0, bb)], c(0.6));
    poly(ctx, [P(1, 0, 0), P(1, 1, 0), P(1, 1, bb), P(1, 0, bb)], c(0.5));
    poly(ctx, [P(0, 1, 0), P(1, 1, 0), P(1, 1, bb), P(0, 1, bb)], c(0.66));
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(1, w / 300);
    [
      [P(0, 1, 0), P(1, 1, 0)], [P(0, 1, 1), P(1, 1, 1)], [P(0, 1, 0), P(0, 1, 1)], [P(1, 1, 0), P(1, 1, 1)],
      [P(0, 0, 0), P(0, 1, 0)], [P(1, 0, 0), P(1, 1, 0)], [P(0, 0, 1), P(0, 1, 1)], [P(1, 0, 1), P(1, 1, 1)],
    ].forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });

    // perspective-correct depth for repeated features down a hallway
    const Z = 9;
    const D = (z) => (1 - 1 / z) / (1 - 1 / Z);
    const doors = [];
    if (hall) {
      for (let z = 1.25; z < Z - 0.5; z += 1.4) {
        const off = r() < 0.2;
        poly(ctx, [P(0.4, D(z), 1), P(0.6, D(z), 1), P(0.6, D(z + 0.45), 1), P(0.4, D(z + 0.45), 1)], off ? c(0.55) : hsl(hue, 30, 92));
      }
      for (let z = 1.5; z < Z - 1; z += lerp(1.1, 1.8, r())) {
        doors.push({ wall: r() < 0.5 ? 'L' : 'R', a: D(z), b: D(z + 0.55) });
      }
    } else {
      if (o.door) doors.push(o.door);
      else {
        const where = r();
        if (where < 0.5) {
          const a = lerp(0.08, 0.62, r());
          doors.push({ wall: 'B', a, b: a + 0.24 });
        } else {
          const a = lerp(0.25, 0.55, r());
          doors.push({ wall: where < 0.75 ? 'L' : 'R', a, b: a + 0.22 });
        }
      }
      if (o.window !== false && r() < 0.75) {
        const d = doors[0];
        const u1 = d.wall === 'B' && d.a < 0.45 ? 0.58 : 0.12;
        const q = [P(u1, 1, 0.38), P(u1 + 0.26, 1, 0.38), P(u1 + 0.26, 1, 0.74), P(u1, 1, 0.74)];
        const g = ctx.createLinearGradient(0, q[2][1], 0, q[0][1]);
        if (o.night) {
          g.addColorStop(0, '#0a0f1c');
          g.addColorStop(1, '#1a2438');
        } else {
          g.addColorStop(0, hsl(hue, 12, 90));
          g.addColorStop(1, hsl(hue, 8, 80));
        }
        poly(ctx, q, g);
        ctx.strokeStyle = c(0.6);
        ctx.lineWidth = Math.max(1.5, w / 160);
        ctx.beginPath();
        q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        const m1 = P(u1 + 0.13, 1, 0.38), m2 = P(u1 + 0.13, 1, 0.74);
        const m3 = P(u1, 1, 0.56), m4 = P(u1 + 0.26, 1, 0.56);
        ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]);
        ctx.moveTo(m3[0], m3[1]); ctx.lineTo(m4[0], m4[1]);
        ctx.stroke();
      }
      poly(ctx, [P(0.44, 0.42, 1), P(0.56, 0.42, 1), P(0.56, 0.55, 1), P(0.44, 0.55, 1)], o.night ? c(0.7) : hsl(hue, 30, 90));
    }
    doors.forEach((d, i) =>
      drawDoor(ctx, P, d, { door: c(0.72, -6, 0.7), frame: c(0.5), open: o.openDoor && i === 0, watcher: o.watcher && i === 0, w })
    );

    if (o.furniture !== false) {
      const furn = { side: c(0.38, -15, 0.7), top: c(0.62, -15, 0.7), front: c(0.45, -15, 0.7) };
      if (kind === 'bedroom') {
        const left = r() < 0.5;
        const u1 = left ? 0.04 : 0.6;
        const u2 = left ? 0.4 : 0.96;
        box(ctx, P, u1, u2, 0.88, 0.995, 0.3, furn);
        box(ctx, P, u1, u2, 0.42, 0.88, 0.15, { side: hsl(hue, 10, L * 0.6), top: hsl(hue, 8, Math.min(92, L * 1.25)), front: hsl(hue, 10, L * 0.75) });
      } else if (kind === 'office') {
        box(ctx, P, 0.28, 0.62, 0.58, 0.72, 0.26, furn);
        chair(ctx, P, 0.4, 0.46, furn);
      } else if (kind === 'room' && r() < 0.55) {
        chair(ctx, P, lerp(0.3, 0.55, r()), lerp(0.5, 0.7, r()), furn);
      }
    }

    if (o.figure) {
      const f = P(o.figure.u, o.figure.s, 0);
      const t = P(o.figure.u, o.figure.s, 1);
      if (assets.shadow) {
        // the silhouette from the curtain photo, standing in the room
        const fh = (f[1] - t[1]) * 0.95;
        const fw = fh * (assets.shadow.width / assets.shadow.height);
        ctx.drawImage(assets.shadow, f[0] - fw / 2, f[1] - fh, fw, fh);
        eyes(ctx, f[0] + fw * 0.02, f[1] - fh * 0.86, fw * 0.12, Math.max(1, fw * 0.02));
      } else figure(ctx, f[0], f[1], (f[1] - t[1]) * 0.86, 'rgba(12,10,8,0.92)', w / 400);
    }

    // ceiling light falloff
    const lc = P(0.5, hall ? 0.15 : 0.5, 1);
    let g = ctx.createRadialGradient(lc[0], lc[1], 0, lc[0], lc[1], w * 0.8);
    g.addColorStop(0, 'rgba(255,248,225,0.16)');
    g.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (hall) {
      const bc = P(0.5, 1, 0.5);
      g = ctx.createRadialGradient(bc[0], bc[1], 0, bc[0], bc[1], w * 0.32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (o.draw) o.draw(ctx, P, w, h);
    finish(ctx, w, h, { tint: hsl(hue, 40, 50, 0.05), dark: o.dark || 0, vig: o.vig, grain: o.grain != null ? o.grain : 16 });
    if (o.stamp) stamp(ctx, w, h, o.stamp);
    return P;
  }

  // A dark bedroom with a shape near the door. step 0..3 brings it closer; step 4 is right at the camera.
  function darkRoom(ctx, w, h, o) {
    o = o || {};
    const step = Math.min(o.step || 0, 4);
    if (step === 4 && assets.scream) {
      // right up against the lens
      ctx.save();
      ctx.filter = 'grayscale(1) sepia(1) saturate(2.6) hue-rotate(-18deg) brightness(0.8) contrast(1.4)';
      ctx.drawImage(assets.scream, 0, 200, 1200, 1200, 0, 0, w, h);
      ctx.restore();
      grain(ctx, w, h, 26);
      return;
    }
    if (assets.curtain) return curtainRoom(ctx, w, h, step);
    const spots = [[0.66, 0.97], [0.66, 0.74], [0.67, 0.52], [0.68, 0.3], [0.56, 0.06]];
    room(ctx, w, h, {
      seed: 4242,
      kind: 'room',
      hue: 215,
      sat: 10,
      light: 30,
      night: true,
      openDoor: true,
      door: { wall: 'B', a: 0.55, b: 0.79 },
      window: false,
      furniture: false,
      dark: 0.5,
      vig: 0.85,
      grain: 30,
      draw(ctx, P) {
        // moonlight through a window on the left wall, and its patch on the floor
        poly(ctx, [P(0, 0.3, 0.35), P(0, 0.52, 0.35), P(0, 0.52, 0.76), P(0, 0.3, 0.76)], 'rgba(150,170,210,0.5)');
        poly(ctx, [P(0.03, 0.32, 0), P(0.34, 0.38, 0), P(0.46, 0.62, 0), P(0.08, 0.56, 0)], 'rgba(160,180,220,0.12)');
        const col = { side: '#0d0f14', top: '#14171e', front: '#101218' };
        box(ctx, P, 0.04, 0.38, 0.86, 0.99, 0.28, col);
        box(ctx, P, 0.04, 0.38, 0.45, 0.86, 0.14, { side: '#141820', top: '#252a35', front: '#1a1e27' });
        if (step === 4) {
          // right up against the lens: nothing but its face
          wraith(ctx, w * 0.54, h * 0.02, h * 0.42, { light: 0.55, tilt: 0.3, mouth: 0.9, seed: 3, blur: w / 400 });
          return;
        }
        const [u, s] = spots[step];
        const foot = P(u, s, 0);
        const top = P(u, s, 1);
        const H = (foot[1] - top[1]) * 0.86;
        figure(ctx, foot[0], foot[1], H, 'rgba(2,2,4,0.85)', w / 320);
      },
    });
  }

  // You, at your desk, from behind. zoom pushes in on the back of your head.
  function behindYou(ctx, w, h, o) {
    o = o || {};
    const z = o.zoom || 1;
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    const fx = w * 0.5;
    const fy = h * 0.45;
    ctx.translate(fx, fy);
    ctx.scale(z, z);
    ctx.translate(-fx, -fy);
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(-w, -h, 3 * w, h * 1.65);
    ctx.fillStyle = '#060709';
    ctx.fillRect(-w, h * 0.65, 3 * w, 2 * h);
    let g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.7);
    g.addColorStop(0, 'rgba(120,150,230,0.42)');
    g.addColorStop(1, 'rgba(120,150,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h, 3 * w, 3 * h);
    // desk
    ctx.fillStyle = '#15161c';
    ctx.fillRect(w * 0.1, h * 0.6, w * 0.8, h * 0.035);
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(w * 0.12, h * 0.635, w * 0.76, h * 0.4);
    // monitor, and on it, a sign-in card with a blue header
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(w * 0.47, h * 0.52, w * 0.06, h * 0.08);
    ctx.fillStyle = '#0e1016';
    ctx.fillRect(w * 0.29, h * 0.24, w * 0.42, h * 0.29);
    g = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.52);
    g.addColorStop(0, '#dfe8ff');
    g.addColorStop(1, '#a9bff0');
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.27);
    ctx.fillStyle = '#f7f8fb';
    ctx.fillRect(w * 0.55, h * 0.29, w * 0.12, h * 0.15);
    ctx.fillStyle = '#1a73e8';
    ctx.fillRect(w * 0.55, h * 0.29, w * 0.12, h * 0.035);
    // the person, rim-lit by the screen
    bust(ctx, w * 0.5, h * 0.305, h * 0.135, 'rgba(140,170,255,0.35)', w / 90);
    bust(ctx, w * 0.5, h * 0.315, h * 0.125, '#030305', w / 400);
    roundRect(ctx, w * 0.35, h * 0.6, w * 0.3, h * 0.6, w * 0.03, '#050507');
    // in the widest shot, it's standing in the corner, lit by your screen
    if (o.lurker) wraith(ctx, w * 0.2, h * 0.17, h * 0.11, { light: 0.5, alpha: 0.85, tilt: 0.5, mouth: 0.55, seed: 11, blur: w / 300 });
    ctx.restore();
    if (z < 1.3) {
      // standing in the doorway
      ctx.fillStyle = '#030304';
      ctx.fillRect(0, 0, w * 0.07, h);
      ctx.fillRect(w * 0.93, 0, w * 0.07, h);
      ctx.fillRect(0, 0, w, h * 0.05);
    }
    finish(ctx, w, h, { vig: 0.75, grain: 34 });
    if (o.stamp) stamp(ctx, w, h, o.stamp);
  }

  // ---- street (round 1) ----

  function signal(ctx, x, y, sw) {
    const sh = sw * 2.7;
    roundRect(ctx, x, y, sw, sh, sw * 0.15, '#1f2123');
    ['#e53935', '#3a3c3e', '#3a3c3e'].forEach((c, i) => {
      const cy = y + sh * (0.19 + i * 0.31);
      if (i === 0) {
        const g = ctx.createRadialGradient(x + sw / 2, cy, 0, x + sw / 2, cy, sw);
        g.addColorStop(0, 'rgba(255,80,60,0.45)');
        g.addColorStop(1, 'rgba(255,80,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - sw, cy - sw, sw * 3, sw * 2);
      }
      ctx.beginPath();
      ctx.arc(x + sw / 2, cy, sw * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
  }

  function car(ctx, x, y, cw, color) {
    roundRect(ctx, x + cw * 0.2, y - cw * 0.15, cw * 0.52, cw * 0.18, cw * 0.05, color);
    roundRect(ctx, x + cw * 0.26, y - cw * 0.12, cw * 0.4, cw * 0.11, cw * 0.03, '#2a3440');
    roundRect(ctx, x, y, cw, cw * 0.2, cw * 0.05, color);
    ctx.fillStyle = '#151515';
    [0.2, 0.8].forEach((k) => {
      ctx.beginPath();
      ctx.arc(x + cw * k, y + cw * 0.2, cw * 0.075, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function street(ctx, w, h) {
    const r = rng(11);
    let g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    g.addColorStop(0, '#b9c6d2');
    g.addColorStop(1, '#e3e8ec');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    let x = -w * 0.02;
    while (x < w) {
      const bw = w * lerp(0.1, 0.22, r());
      const bh = h * lerp(0.18, 0.42, r());
      const top = h * 0.6 - bh;
      const L = lerp(48, 66, r());
      ctx.fillStyle = hsl(Math.round(lerp(20, 215, r())), 8, L);
      ctx.fillRect(x, top, bw, bh);
      ctx.fillStyle = hsl(210, 12, L - 14);
      for (let wy = top + h * 0.03; wy < h * 0.56; wy += h * 0.05) {
        for (let wx = x + bw * 0.12; wx < x + bw * 0.85; wx += bw * 0.22) ctx.fillRect(wx, wy, bw * 0.12, h * 0.028);
      }
      x += bw + w * 0.005;
    }
    ctx.fillStyle = '#a7a9a8';
    ctx.fillRect(0, h * 0.6, w, h * 0.06);
    ctx.fillStyle = '#55595d';
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.fillStyle = '#d9d4b0';
    for (let lx = -w * 0.05; lx < w; lx += w * 0.18) ctx.fillRect(lx, h * 0.83, w * 0.09, h * 0.012);
    car(ctx, w * 0.06, h * 0.72, w * 0.3, '#7d2b2b');
    car(ctx, w * 0.5, h * 0.9, w * 0.36, '#3d4f63');
    ctx.fillStyle = '#2b2d2f';
    ctx.fillRect(w * 0.77, h * 0.24, w * 0.022, h * 0.42);
    ctx.fillRect(w * 0.37, h * 0.24, w * 0.42, h * 0.018);
    signal(ctx, w * 0.42, h * 0.258, w * 0.075);
    signal(ctx, w * 0.81, h * 0.33, w * 0.065);
    finish(ctx, w, h, { vig: 0.25, grain: 10 });
  }

  // Static noise layer for the webcam feed.
  function noise(w, h) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---- photo assets (Unsplash License; credits in README) ----
  // The creature is real photographs, cut out at load time:
  //   peek    — a pale face behind long hair; the dark hair becomes transparent, the face stays
  //   hand    — a pale hand reaching out of black; the black becomes transparent
  //   shadow  — the dark figure behind the curtains; only the figure stays, as a black silhouette
  //   scream  — the smeared screaming face, used whole for the jump scare
  //   curtain — the curtain photo, used whole for stage 3
  // Until they load (or if they fail), the drawn versions above stand in.
  const assets = {};
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('failed to load ' + src));
      img.src = src;
    });
  }

  // crop → greyscale-ish cutout. mode 'light': bright parts stay (pale face / hand on black);
  // mode 'dark': dark parts stay (silhouette on a lighter background). An elliptical feather
  // fades the edges so there's never a visible rectangle.
  function cutout(img, crop, o) {
    const [sx, sy, sw, sh] = crop;
    const k = Math.min(1, 640 / Math.max(sw, sh));
    const w = Math.round(sw * k);
    const h = Math.round(sh * k);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    const f = o.feather;
    const tint = o.tint || [0.86, 0.9, 0.88];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const nx = (x / w - f.cx) / f.rx;
        const ny = (y / h - f.cy) / f.ry;
        let m = 1 - smooth(0.6, 1, Math.sqrt(nx * nx + ny * ny));
        // fade any side where the crop cuts through the subject
        if (f.edges) m *= smooth(0, f.edges[0], x / w) * smooth(0, f.edges[1], y / h) * smooth(0, f.edges[2], 1 - x / w) * smooth(0, f.edges[3], 1 - y / h);
        let a;
        let v;
        if (o.mode === 'photo') {
          // keep the photo's own shadows (eye sockets, lips): only the soft oval cuts it out
          // and the tones are pushed apart: hair (~0.11) to near-black, skin (~0.35+) to pale
          a = smooth(o.lo, o.hi, L);
          v = Math.min(1, smooth(0.07, 0.44, L) * (o.gain || 1.05)) * 255;
        } else if (o.mode === 'light') {
          a = smooth(o.lo, o.hi, L);
          v = Math.min(1, Math.pow(L, o.gamma || 0.8) * (o.gain || 1.2)) * 255;
        } else {
          a = 1 - smooth(o.lo, o.hi, L);
          v = 10;
        }
        d[i] = v * tint[0];
        d[i + 1] = v * tint[1];
        d[i + 2] = v * tint[2];
        d[i + 3] = a * m * 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  async function loadAssets(base) {
    try {
      const [peek, scream, hand, curtain] = await Promise.all(
        ['creature-peek', 'creature-scream', 'creature-hand', 'creature-curtain'].map((n) => loadImage(`${base}/${n}.jpg`))
      );
      // the face sits in the left two-thirds of the photo; hair falls away to the right
      // the eye socket and lips are what make it read as a face, so they stay; only near-black drops out
      assets.peek = cutout(peek, [0, 120, 960, 1440], { mode: 'photo', lo: 0.02, hi: 0.09, gain: 1.05, tint: [1, 0.88, 0.8], feather: { cx: 0.4, cy: 0.45, rx: 0.52, ry: 0.55, edges: [0.38, 0.3, 0.08, 0.15] } });
      assets.hand = cutout(hand, [180, 300, 820, 1500], { mode: 'light', lo: 0.08, hi: 0.3, gain: 1.05, tint: [0.98, 0.84, 0.76], feather: { cx: 0.5, cy: 0.45, rx: 0.62, ry: 0.62 } });
      assets.shadow = cutout(curtain, [230, 70, 740, 1750], { mode: 'dark', lo: 0.1, hi: 0.22, feather: { cx: 0.5, cy: 0.4, rx: 0.52, ry: 0.56 } });
      assets.scream = scream;
      assets.curtain = curtain;
      return true;
    } catch (e) {
      console.warn('Creature photos unavailable, using drawn fallback:', e);
      return false;
    }
  }

  // The face, peeking. Same call shape as wraith: (x, y) = top of head, s = head height.
  // Tilt is damped (a photo rotated hard looks like a sticker); "mouth" lengthens the face a little.
  function peekFace(ctx, x, y, s, o) {
    const img = assets.peek;
    const w = s * 2.8;
    const h = w * (img.height / img.width);
    const stretch = 1 + (o.mouth || 0) * 0.12;
    ctx.save();
    ctx.globalAlpha = (o.alpha != null ? o.alpha : 1) * (0.55 + 0.45 * (o.light != null ? o.light : 1));
    if (o.blur) ctx.filter = `blur(${o.blur}px)`;
    // pivot on its visible eye (at 58%, 33% of the cutout), which sits where a head would
    ctx.translate(x, y + s * 0.45);
    ctx.rotate((o.tilt || 0) * 0.5);
    // the face extends left of its eye; mirror it when it's on the left so it faces into the frame
    ctx.scale(o.flip ? -1 : 1, stretch);
    ctx.drawImage(img, -w * 0.583, -h * 0.333, w, h);
    ctx.restore();
  }

  // The hand, fingertips at (x, y), arm reaching in from `angle`'s direction.
  function photoHand(ctx, x, y, s, angle, alpha) {
    const img = assets.hand;
    const h = s * 6;
    const w = h * (img.width / img.height);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    // fingertips are near the top-middle of the cutout
    ctx.drawImage(img, -w * 0.6, -h * 0.05, w, h);
    ctx.restore();
  }

  // Stage 3: the curtain photo, cropped tighter each step (0..3) until the head fills the frame.
  function curtainRoom(ctx, w, h, step) {
    const img = assets.curtain;
    const crops = [[0, 60, 1200, 1200], [150, 40, 900, 900], [290, 40, 620, 620], [380, 60, 440, 440]];
    const [sx, sy, sw, sh] = crops[Math.min(3, step)];
    ctx.save();
    ctx.filter = 'brightness(1.05) contrast(1.3) sepia(0.7) saturate(1.6) hue-rotate(-14deg)';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
    vignette(ctx, w, h, 0.55);
    grain(ctx, w, h, 22);
  }

  // Transparent grain: black and white specks on clear, so it can sit on top with normal blending.
  function speckle(w, h) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 38;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---- the evil spark: claude's mark ----
  // Eight curved thorns (long and short, like a blade mid-spin) in blood orange, two of them dripping,
  // around a single eye with a slit pupil. One path definition drives the SVG (DOM) and Path2D (canvas).
  // Coordinates are on a 64×64 box centred at (32, 32).
  const sparkTip = (i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const len = i % 2 ? 22 : 30.5;
    return [32 + Math.cos(a + 0.16) * len, 32 + Math.sin(a + 0.16) * len];
  };
  const SPARK_ARMS = (() => {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const len = i % 2 ? 22 : 30.5;
      const half = i % 2 ? 0.5 : 0.42;
      const bend = 0.32; // every thorn curves the same way, so it reads as turning
      const p = (r, t) => [32 + Math.cos(t) * r, 32 + Math.sin(t) * r];
      const [x1, y1] = p(10.5, a - half);
      const [x2, y2] = p(10.5, a + half);
      const [tx, ty] = sparkTip(i);
      const [c1x, c1y] = p(len * 0.62, a + half * 0.75 + bend * 0.3);
      const [c2x, c2y] = p(len * 0.5, a - half * 0.55 + bend * 0.45);
      d += `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${c1x.toFixed(2)} ${c1y.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)}Q${c2x.toFixed(2)} ${c2y.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
    }
    return d;
  })();
  // drips hanging off the two lower short thorns
  const SPARK_DRIPS = [3, 5].map((i) => {
    let [x, y] = sparkTip(i);
    // starts a little inside the thorn so it reads as running off it
    y -= 2.5;
    return `M${(x - 1.4).toFixed(2)} ${y.toFixed(2)}C${(x - 1.8).toFixed(2)} ${(y + 4).toFixed(2)} ${(x - 2.6).toFixed(2)} ${(y + 7.5).toFixed(2)} ${x.toFixed(2)} ${(y + 9.5).toFixed(2)}C${(x + 2.6).toFixed(2)} ${(y + 7.5).toFixed(2)} ${(x + 1.8).toFixed(2)} ${(y + 4).toFixed(2)} ${(x + 1.4).toFixed(2)} ${y.toFixed(2)}Z`;
  }).join('');

  function evilSparkSVG(size, o) {
    o = o || {};
    const id = 'es' + Math.random().toString(36).slice(2, 7);
    const glow = o.glow === false ? '' : `filter="url(#${id}g)"`;
    return `<svg class="evil-spark" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">` +
      `<defs><radialGradient id="${id}r" cx="50%" cy="50%" r="50%">` +
      '<stop offset="0" stop-color="#ffb08a"/><stop offset=".35" stop-color="#d9572f"/><stop offset=".75" stop-color="#9a2a12"/><stop offset="1" stop-color="#4a0d05"/></radialGradient>' +
      `<filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ff5a2a" flood-opacity=".75"/></filter></defs>` +
      `<g ${glow}><path d="${SPARK_ARMS}" fill="url(#${id}r)"/><path d="${SPARK_DRIPS}" fill="#8f2410"/>` +
      '<circle cx="32" cy="32" r="10.5" fill="#1a0905"/>' +
      '<ellipse class="sclera" cx="32" cy="32" rx="7.4" ry="4.8" fill="#f3e2d4"/>' +
      // the iris is its own group so app.js can turn it toward the mouse
      '<g class="iris"><ellipse cx="32" cy="32" rx="3.6" ry="4.2" fill="#d94a1f"/>' +
      '<ellipse class="pupil" cx="32" cy="32" rx="1.3" ry="3.8" fill="#120604"/></g></g></svg>';
  }

  // Canvas version. look = -1..1 slides the pupil left/right (so it can follow you).
  let sparkPaths = null;
  function drawEvilSpark(ctx, x, y, size, o) {
    o = o || {};
    if (!sparkPaths) sparkPaths = { arms: new Path2D(SPARK_ARMS), drips: new Path2D(SPARK_DRIPS) };
    const k = size / 64;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(k, k);
    if (o.rotate) {
      ctx.translate(32, 32);
      ctx.rotate(o.rotate);
      ctx.translate(-32, -32);
    }
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffb08a');
    g.addColorStop(0.35, '#d9572f');
    g.addColorStop(0.75, '#9a2a12');
    g.addColorStop(1, '#4a0d05');
    if (o.glow !== false) {
      ctx.shadowColor = 'rgba(255,90,42,0.8)';
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = g;
    ctx.fill(sparkPaths.arms);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8f2410';
    ctx.fill(sparkPaths.drips);
    if (o.rotate) {
      // the eye stays upright while the thorns turn
      ctx.translate(32, 32);
      ctx.rotate(-o.rotate);
      ctx.translate(-32, -32);
    }
    ctx.fillStyle = '#1a0905';
    ctx.beginPath();
    ctx.arc(32, 32, 10.5, 0, Math.PI * 2);
    ctx.fill();
    if (o.eye !== false) {
      const lx = (o.look || 0) * 3;
      ctx.fillStyle = '#f3e2d4';
      ctx.beginPath();
      ctx.ellipse(32, 32, 7.4, o.blink ? 0.6 : 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!o.blink) {
        ctx.fillStyle = '#d94a1f';
        ctx.beginPath();
        ctx.ellipse(32 + lx, 32, 3.6, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#120604';
        ctx.beginPath();
        ctx.ellipse(32 + lx, 32, 1.3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- scene photos for stages 1, 2 and 4 (Unsplash License; credits in README) ----
  // Loaded in the background at startup. Any that fail fall back to the drawn versions above.
  const scenes = { rooms: [], nights: [], you: [] };
  function loadScenes(base) {
    const one = (name, put) => loadImage(`${base}/${name}.jpg`).then(put).catch(() => {});
    return Promise.all([
      one('s1-street', (i) => (scenes.street = i)),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => one(`s2-room-${n}`, (i) => (scenes.rooms[n - 1] = i))),
      ...[1, 2, 3, 4, 5, 6].map((n) => one(`s4-night-${n}`, (i) => (scenes.nights[n - 1] = i))),
      ...[1, 2].map((n) => one(`s4-you-${n}`, (i) => (scenes.you[n - 1] = i))),
    ]);
  }

  // A photo as a grid tile: cover-cropped to a square (or an explicit crop), zoomed toward a focus point,
  // then graded once: a CSS-style filter, a colour wash, anything drawn on top, vignette, grain, date stamp.
  // o: { crop:[sx,sy,sw,sh], zoom, fx, fy, filter, tint, draw(ctx,w,h), vig, grain, stamp }
  function photoTile(ctx, w, h, img, o) {
    o = o || {};
    let [sx, sy, sw, sh] = o.crop || (() => {
      const s = Math.min(img.width, img.height);
      return [(img.width - s) / 2, (img.height - s) / 2, s, s];
    })();
    const z = o.zoom || 1;
    if (z !== 1) {
      const nw = sw / z;
      const nh = sh / z;
      const cx = sx + sw * (o.fx != null ? o.fx : 0.5);
      const cy = sy + sh * (o.fy != null ? o.fy : 0.5);
      sx = Math.max(sx, Math.min(sx + sw - nw, cx - nw / 2));
      sy = Math.max(sy, Math.min(sy + sh - nh, cy - nh / 2));
      sw = nw;
      sh = nh;
    }
    ctx.save();
    if (o.filter) ctx.filter = o.filter;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
    if (o.tint) {
      ctx.fillStyle = o.tint;
      ctx.fillRect(0, 0, w, h);
    }
    if (o.draw) o.draw(ctx, w, h);
    vignette(ctx, w, h, o.vig != null ? o.vig : 0.45);
    if (o.grain) grain(ctx, w, h, o.grain);
    if (o.stamp) stamp(ctx, w, h, o.stamp);
  }

  window.Art = {
    makeCanvas, room, darkRoom, behindYou, street, stamp, bust, figure, wraith, hand, eyes, noise, glitch, tear,
    assets, loadAssets, peekFace, photoHand, curtainRoom, speckle, evilSparkSVG, drawEvilSpark, scenes, loadScenes, photoTile,
  };
})();
