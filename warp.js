// warp.js — the webcam's look, and your face warping toward its face.
// Performance layout:
//   • One WebGL pass per camera frame does everything per-pixel: mirror + crop the video, warp your face,
//     drain the colour, tint it warm (claude's light), vignette, a pool of light on your face, and grain.
//     The video goes straight to the GPU as a texture; there is no 2D canvas blending.
//   • MediaPipe (face landmarks + person segmentation) runs in a Web Worker (mp-worker.js) on a 320px
//     ImageBitmap. The page never waits for it: it just uses the latest result whenever one arrives.
// The warp: eyes swell and go hollow with pinprick pupils, the jaw drops open into a black hole, the face
// stretches long, and everything below the eyes melts downward. Without MediaPipe there is no warp or
// occlusion, but the grade still runs. Without WebGL, render() returns false and app.js grades in 2D.
(function () {
  'use strict';

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // y runs down, like the canvas
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec4 uCrop;            // video crop: x, y, w, h (fractions of the video frame)
uniform vec2 uEyeR, uEyeL, uLipTop, uLipBot, uChin, uBrow;
uniform float uFaceW, uMouthW, uEye, uJaw, uMelt, uLong, uTime, uShake, uTears;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// pull samples toward an eye centre so the eye swells
vec2 swell(vec2 q, vec2 c, float r, float k) {
  vec2 d = q - c;
  float l = length(d);
  if (l < r) { float t = 1.0 - l / r; d *= 1.0 - k * t * t; }
  return c + d;
}

void main() {
  vec2 p = vUv;
  float fw = uFaceW;
  float cx = (uLipTop.x + uChin.x) * 0.5;
  float inFace = 1.0 - smoothstep(fw * 0.45, fw * 0.8, abs(p.x - cx));
  vec2 q = p;

  // shudder
  q.x += uShake * (noise(uTime * 60.0 + p.y * 30.0) - 0.5) * 0.02;
  // melt: everything below the eyes is dragged down in uneven drips
  float eyeY = (uEyeR.y + uEyeL.y) * 0.5;
  float below = smoothstep(eyeY, uChin.y + fw * 0.5, q.y);
  float drip = 0.35 + 0.65 * noise(q.x * 38.0 + uTime * 0.4);
  q.y -= uMelt * below * inFace * drip * fw * 0.35;
  // long face: stretch everything below the brow
  if (q.y > uBrow.y) q.y = uBrow.y + (q.y - uBrow.y) / (1.0 + uLong * inFace);
  // jaw: below the top lip, stretch downward, strongest under the mouth
  float hf = 1.0 - smoothstep(uMouthW * 0.5, uMouthW * 1.5, abs(q.x - cx));
  float vf = 1.0 - smoothstep(uChin.y + fw * 0.25, uChin.y + fw * 0.9, q.y);
  float sf = 1.0 + uJaw * hf * vf;
  if (q.y > uLipTop.y) q.y = uLipTop.y + (q.y - uLipTop.y) / sf;
  // eyes swell
  q = swell(q, uEyeR, fw * 0.24, uEye * 0.55);
  q = swell(q, uEyeL, fw * 0.24, uEye * 0.55);

  // sample the video: mirrored, centre-cropped to a square
  vec2 vid = vec2(uCrop.x + (1.0 - q.x) * uCrop.z, uCrop.y + q.y * uCrop.w);
  vec3 col = texture2D(uTex, clamp(vid, 0.0, 1.0)).rgb;

  // eyes go hollow, with a pinprick of light left in the middle
  float er = fw * (0.075 + 0.05 * uEye);
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? uEyeR : uEyeL;
    float d = length((q - c) * vec2(1.0, 1.25)) / er;
    col *= 1.0 - uEye * 0.97 * (1.0 - smoothstep(0.55, 1.0, d));
    col += vec3(0.9) * uEye * (1.0 - smoothstep(0.05, 0.13, d));
  }
  // the mouth opening becomes a black hole
  vec2 mc = (uLipTop + uLipBot) * 0.5;
  float gap = max(abs(uLipBot.y - uLipTop.y), fw * 0.03);
  float md = length((q - mc) / vec2(uMouthW * (0.4 + 0.15 * uJaw), gap * 0.6 + fw * (0.02 + 0.05 * uJaw)));
  col *= 1.0 - min(1.0, uJaw * 1.2) * 0.96 * (1.0 - smoothstep(0.6, 1.0, md));
  // the stretched skin goes grey and bloodless
  float skin = inFace * smoothstep(uBrow.y - fw * 0.1, uBrow.y + fw * 0.2, p.y) * (1.0 - smoothstep(uChin.y + fw * 0.8, uChin.y + fw * 1.2, p.y));
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grey * 1.05, grey * 1.07, grey), skin * min(1.0, uEye + uMelt) * 0.8);

  // black tears run down from each eye, wobbling, following your face
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? uEyeR : uEyeL;
    float wob = (noise(p.y * 40.0 + float(i) * 7.0) - 0.5) * fw * 0.025;
    float len = uTears * fw * 1.3;
    float along = (p.y - c.y - fw * 0.05) / max(len, 0.0001);
    float width = fw * (0.01 + 0.012 * (1.0 - clamp(along, 0.0, 1.0)));
    float dx = abs(p.x - c.x - wob);
    float streak = (1.0 - smoothstep(width * 0.5, width, dx)) * step(0.0, along) * (1.0 - smoothstep(0.85, 1.0, along));
    float drop = 1.0 - smoothstep(fw * 0.012, fw * 0.022, length(vec2(p.x - c.x - wob, p.y - c.y - fw * 0.05 - len)));
    col *= 1.0 - 0.88 * clamp(streak + drop * step(0.05, uTears), 0.0, 1.0);
  }
  // colour is left untouched here: the final pass grades everything together (see POST)
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  // The final pass, over the fully composited frame (you, the creature, the hand): one grade, one lens,
  // one grain for everything, so nothing looks pasted on. A touch of barrel distortion, colour fringing
  // that grows toward the edges, the warm dim grade, the vignette, a pool of light, grain.
  const POST = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec2 p = vUv;
  vec2 c = p - 0.5;
  float r2 = dot(c, c);
  vec2 q = 0.5 + c * (1.0 - 0.07 * r2);          // barrel
  float ca = 0.002 + 0.012 * r2;                 // fringing
  vec3 col = vec3(texture2D(uTex, q + c * ca).r, texture2D(uTex, q).g, texture2D(uTex, q - c * ca).b);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), 0.7);                                   // most of the colour drained
  col = (col - 0.5) * 1.25 + 0.5;                                  // contrast, so faces stay crisp
  col *= vec3(0.66, 0.53, 0.47);                                   // warm and dim: claude's light
  col *= mix(1.0, 0.05, smoothstep(0.12, 0.75, distance(p, vec2(0.5, 0.47))));  // edges fall into black
  float pool = 1.0 - smoothstep(0.0, 0.3, distance(p, vec2(0.5, 0.42)));
  col += col * vec3(0.6, 0.42, 0.3) * pool;                        // a pool of light on your face
  col += (hash(dot(p, vec2(127.1, 311.7)) * 43.0 + uTime * 13.0) - 0.5) * 0.06;  // grain
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  // One Euro filter (Casiez et al.): smooths jitter when still, but follows fast moves without lag.
  function oneEuro(minCutoff = 1.4, beta = 6, dCutoff = 1) {
    let x = null;
    let dx = 0;
    let t = 0;
    const alpha = (fc, dt) => 1 / (1 + 1 / (2 * Math.PI * fc) / dt);
    return (v, ts) => {
      if (x === null) {
        x = v;
        t = ts;
        return v;
      }
      const dt = Math.max(0.001, (ts - t) / 1000);
      t = ts;
      dx += alpha(dCutoff, dt) * ((v - x) / dt - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x);
      return x;
    };
  }

  const Warp = {
    state: 'idle', // MediaPipe: idle → loading → ready | failed
    amt: 0,        // eased toward target (0 = none, 1 = it has your face)
    target: 0,
    melt: 0,       // extra melt that keeps growing in the ending
    face: null,    // smoothed landmarks in feed coordinates (0..1, mirrored to match the feed)
    lastSeen: 0,
    spikeAt: 0,
    mask: null,
    maskAt: 0,
    busy: false,

    // start the worker. GL is set up separately (initGL) so the grade works before MediaPipe is ready.
    load() {
      if (this.state !== 'idle') return;
      this.state = 'loading';
      try {
        // a classic worker: MediaPipe's WASM loader needs importScripts, which module workers don't have
        this.worker = new Worker('mp-worker.js');
      } catch (e) {
        this.state = 'failed';
        return;
      }
      this.worker.onmessage = (e) => this.onResult(e.data);
      this.worker.onerror = () => (this.state = 'failed');
      this.worker.postMessage({ type: 'init' });
    },

    initGL() {
      if (this.gl !== undefined) return !!this.gl;
      this.gl = null;
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl', { premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
        if (!gl) return false;
        const sh = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        const link = (frag) => {
          const p = gl.createProgram();
          gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
          gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
          gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
          return p;
        };
        const prog = link(FRAG);
        const post = link(POST);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        this.use = (p) => {
          gl.useProgram(p);
          const loc = gl.getAttribLocation(p, 'aPos');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        };
        this.prog = prog;
        this.postProg = post;
        this.pu = { uTex: gl.getUniformLocation(post, 'uTex'), uTime: gl.getUniformLocation(post, 'uTime') };
        this.use(prog);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.u = {};
        ['uTex', 'uCrop', 'uEyeR', 'uEyeL', 'uLipTop', 'uLipBot', 'uChin', 'uBrow', 'uFaceW', 'uMouthW', 'uEye', 'uJaw', 'uMelt', 'uLong', 'uTime', 'uShake', 'uTears']
          .forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)));
        gl.uniform1i(this.u.uTex, 0);
        this.gl = gl;
        this.canvas = c;
        return true;
      } catch (e) {
        console.warn('WebGL grade unavailable:', e);
        return false;
      }
    },

    // hand the worker a small copy of the frame, if it's free. Never blocks.
    track(video, now) {
      if (this.state === 'idle' || this.state === 'failed' || this.busy || video.readyState < 2) return;
      if (this.state !== 'ready') return;
      this.busy = true;
      this.vw = video.videoWidth;
      this.vh = video.videoHeight;
      const h = Math.round((320 * this.vh) / this.vw);
      createImageBitmap(video, { resizeWidth: 320, resizeHeight: h, resizeQuality: 'low' })
        .then((bitmap) => this.worker.postMessage({ type: 'frame', bitmap, ts: now }, [bitmap]))
        .catch(() => (this.busy = false));
    },

    onResult(m) {
      if (m.type === 'ready') {
        this.state = 'ready';
        return;
      }
      if (m.type === 'failed') {
        console.warn('Face warp unavailable:', m.error);
        this.state = 'failed';
        return;
      }
      if (m.type !== 'result') return;
      this.busy = false;
      const vw = this.vw;
      const vh = this.vh;
      const s = Math.min(vw, vh);
      const ox = (vw - s) / 2;
      const oy = (vh - s) / 2;
      if (m.face) {
        // video coordinates → the mirrored, centre-cropped square feed
        const next = {};
        for (const k in m.face) {
          const [x, y] = m.face[k];
          next[k] = [1 - (x * vw - ox) / s, (y * vh - oy) / s];
        }
        // One Euro per coordinate: steady when you're still, no lag when you move
        const ts = performance.now();
        if (!this.filt) this.filt = {};
        if (!this.face) this.face = {};
        for (const k in next) {
          const f = this.filt[k] || (this.filt[k] = [oneEuro(), oneEuro()]);
          this.face[k] = [f[0](next[k][0], ts), f[1](next[k][1], ts)];
        }
        this.lastSeen = performance.now();
      }
      if (m.mask) this.buildMask(m.mask, vw, vh, s);
    },

    buildMask({ w, h, a }, vw, vh, s) {
      if (!this.rawMask || this.rawMask.width !== w || this.rawMask.height !== h) {
        this.rawMask = document.createElement('canvas');
        this.rawMask.width = w;
        this.rawMask.height = h;
        this.rawImg = this.rawMask.getContext('2d').createImageData(w, h);
      }
      const px = this.rawImg.data;
      for (let i = 0; i < a.length; i++) px[i * 4 + 3] = a[i];
      this.rawMask.getContext('2d').putImageData(this.rawImg, 0, 0);
      const W = this.maskSize || 480;
      if (!this.mask) {
        this.mask = document.createElement('canvas');
        this.mask.width = this.mask.height = W;
      }
      const m = this.mask.getContext('2d');
      m.clearRect(0, 0, W, W);
      m.save();
      m.imageSmoothingEnabled = true;
      m.translate(W, 0);
      m.scale(-1, 1);
      m.drawImage(this.rawMask, ((vw - s) / 2 / vw) * w, ((vh - s) / 2 / vh) * h, (s / vw) * w, (s / vh) * h, 0, 0, W, W);
      m.restore();
      this.maskAt = performance.now();
    },

    // where you are in the frame (alpha 1 on you), or null if segmentation isn't running
    segment(video, now, W) {
      this.maskSize = W;
      return this.mask && now - this.maskAt < 800 ? this.mask : null;
    },

    // a brief surge, timed with the creature's flickers
    spike(now) {
      this.spikeAt = now;
    },

    // Draw this camera frame — graded, and warped if there's a face — into ctx (W×W). Returns false if
    // WebGL isn't available, in which case the caller draws and grades the video itself.
    render(video, ctx, W, now) {
      if (!this.initGL()) return false;
      this.amt += (this.target - this.amt) * 0.02;
      const gl = this.gl;
      this.use(this.prog);
      if (this.canvas.width !== W) {
        this.canvas.width = this.canvas.height = W;
        gl.viewport(0, 0, W, W);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const s = Math.min(vw, vh);
      gl.uniform4f(this.u.uCrop, (vw - s) / 2 / vw, (vh - s) / 2 / vh, s / vw, s / vh);
      const f = this.face;
      const seen = f && now - this.lastSeen < 800;
      const surge = Math.max(0, 1 - (now - this.spikeAt) / 500) * 0.35;
      const a = seen ? Math.min(1.2, this.amt + surge) : 0;
      const v2 = (n, p) => gl.uniform2f(this.u[n], p[0], p[1]);
      if (seen) {
        v2('uEyeR', f.irisR);
        v2('uEyeL', f.irisL);
        v2('uLipTop', f.lipTop);
        v2('uLipBot', f.lipBot);
        v2('uChin', f.chin);
        v2('uBrow', f.brow);
        gl.uniform1f(this.u.uFaceW, Math.max(0.05, Math.abs(f.cheekL[0] - f.cheekR[0])));
        gl.uniform1f(this.u.uMouthW, Math.max(0.02, Math.abs(f.mouthL[0] - f.mouthR[0])));
      } else {
        // no face: park the features off-frame so nothing is warped
        ['uEyeR', 'uEyeL', 'uLipTop', 'uLipBot', 'uChin', 'uBrow'].forEach((n) => v2(n, [-9, -9]));
        gl.uniform1f(this.u.uFaceW, 0.05);
        gl.uniform1f(this.u.uMouthW, 0.02);
      }
      gl.uniform1f(this.u.uEye, Math.min(1, a * 1.1));
      gl.uniform1f(this.u.uJaw, a * 1.5);
      gl.uniform1f(this.u.uMelt, seen ? Math.max(0, a - 0.45) * 1.3 + this.melt : 0);
      gl.uniform1f(this.u.uLong, a * 0.22);
      gl.uniform1f(this.u.uTime, (now / 1000) % 1000);
      gl.uniform1f(this.u.uShake, surge * 2 + (a > 0.7 ? 0.25 : 0));
      gl.uniform1f(this.u.uTears, seen ? Math.min(1, Math.max(0, (a - 0.3) * 1.4)) : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(this.canvas, 0, 0, W, W);
      return true;
    },

    // The final pass over the whole composited frame in ctx: grade, lens, grain for everything at once.
    post(ctx, W, now) {
      if (!this.gl) return false;
      const gl = this.gl;
      this.use(this.postProg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, ctx.canvas);
      gl.uniform1i(this.pu.uTex, 0);
      gl.uniform1f(this.pu.uTime, (now / 1000) % 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(this.canvas, 0, 0, W, W);
      return true;
    },
  };

  window.Warp = Warp;
})();
