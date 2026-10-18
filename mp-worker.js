// mp-worker.js — MediaPipe off the main thread.
// The page sends a small ImageBitmap of each camera frame (when this worker is free); this worker runs
// face landmarks on it (and person segmentation on every third frame) and posts back just what the page
// needs: 14 landmark points and an 8-bit person mask. The page never waits on it, so the video stays smooth.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const FACE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEG = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const IDX = { irisR: 468, irisL: 473, eyeROut: 33, eyeRIn: 133, eyeLOut: 263, eyeLIn: 362,
  lipTop: 13, lipBot: 14, mouthR: 61, mouthL: 291, chin: 152, brow: 10, cheekR: 234, cheekL: 454 };

let face = null;
let seg = null;
let frame = 0;

async function init() {
  const vision = await import(`${MP}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = async (Task, opts) => {
    try {
      return await Task.createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
    } catch (e) {
      return await Task.createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
    }
  };
  face = await make(vision.FaceLandmarker, { baseOptions: { modelAssetPath: FACE }, runningMode: 'VIDEO', numFaces: 1 });
  try {
    seg = await make(vision.ImageSegmenter, { baseOptions: { modelAssetPath: SEG }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
  } catch (e) {
    seg = null; // the warp still works without it
  }
}

let invert = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      await init();
      self.postMessage({ type: 'ready', seg: !!seg });
    } catch (err) {
      self.postMessage({ type: 'failed', error: String(err) });
    }
    return;
  }
  if (m.type !== 'frame' || !face) return;
  const { bitmap, ts } = m;
  const out = { type: 'result', ts };
  try {
    const r = face.detectForVideo(bitmap, ts);
    const lm = r && r.faceLandmarks && r.faceLandmarks[0];
    if (lm) {
      out.face = {};
      for (const k in IDX) {
        const p = lm[IDX[k]] || lm[0];
        out.face[k] = [p.x, p.y];
      }
    }
    frame++;
    if (seg && frame % 3 === 0) {
      const res = seg.segmentForVideo(bitmap, ts);
      const masks = res && res.confidenceMasks;
      if (masks && masks.length) {
        const mk = masks[masks.length - 1];
        const data = mk.getAsFloat32Array();
        const w = mk.width;
        const h = mk.height;
        if (invert == null) {
          const mid = data[Math.floor(h * 0.8) * w + Math.floor(w / 2)];
          const corner = data[Math.floor(h * 0.05) * w + Math.floor(w * 0.05)];
          if (mid !== corner) invert = mid < corner;
        }
        const a = new Uint8ClampedArray(w * h);
        for (let i = 0; i < data.length; i++) {
          const v = invert ? 1 - data[i] : data[i];
          a[i] = (v - 0.35) * 2.2 * 255;
        }
        out.mask = { w, h, a };
      }
      if (res && res.close) res.close();
    }
  } catch (err) {
    // a dropped frame is fine
  }
  bitmap.close();
  self.postMessage(out, out.mask ? [out.mask.a.buffer] : []);
};
