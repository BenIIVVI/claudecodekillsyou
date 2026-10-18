# I'm Not a Robot

A Hacktoberfest 2026 registration page whose CAPTCHA never lets you pass. Plain HTML/CSS/JS with no build step; libraries load from jsDelivr. Most images are drawn on a canvas in `art.js`; the creature is four photos in `assets/`.

## Run

The webcam needs `localhost` or https, so serve the folder instead of opening the file directly:

```
python serve.py
```

`serve.py` is the plain Python file server with caching turned off, so a reload always picks up edited files.

Then open http://localhost:5177. Use Chrome, turn the sound on and wear headphones.

## The story

One villain: an AI model (`claude`) that uses the CAPTCHA to collect training data on you, then trains on it and replaces you.

1. **It's an ordinary sign-up.** The CAPTCHA quietly starts counting.
2. **It wants "a person"** and shows empty rooms. It's still learning what people look like (the help text says so). The figure it glimpses in the hallway is its first attempt.
3. **"Select all squares where it is watching."** The counter becomes visible in the footer: `training data: 9%`. Looking is how it learns. Your cursor starts drifting.
4. **"Photos taken at [now]"** are photos it took of you, from behind. They go into the training data, along with your name, which it now whispers.
5. **Webcam.** It captures your face (+18%). Every flicker, the counter reads `generating human…` while its half-trained face assembles behind you. The prompt becomes "Training data: 1 human. Collecting…", then "Select all squares with **the other person**". Your own face warps toward its face.
6. **Finale.** "You are not human." It trains on everything it collected, and a log types out: face, voice, cursor and name are fitted, the humanity check passes, and `Ben Rudin → unverified`. It deletes your name, types `claude`, verifies itself and registers.
7. **End screen.** "2 hackers are registered on this device": you, Unverified, and `claude`, Verified human ✓. Its profile photo is your live webcam, with your face warped into its face. Below: *"Thanks for the training data, Ben. We'll take it from here."*

## Stages

1. **Traffic lights.** Any selection passes, then it says "One more."
2. **"a person."** Nine empty rooms. It says you missed one, then a door is open. Reloading twice puts eyes in the doorway.
3. **"it is watching."** A dark room with a figure near the door. It comes closer each round. Hovering a square dims it, and every click makes eyes blink in a different square. From here the real cursor is hidden and a fake one drifts a few pixels on its own.
4. **"taken at <the current time>."** Three of the photos are of you at your desk, seen from behind and getting closer, stamped with the current time. A knock plays on the left.
5. **Webcam.** The live feed is cut into nine squares. Picking yourself is "Incorrect." Then a faint figure fades in behind you, and its square runs about a second behind the others. With no camera, it uses a drawn image ("Using the other camera").
6. **Finale.** "Verification complete." → "You are not human." (the drone cuts to silence) → "Please wait while we verify the other one." The cursor moves to the checkbox and Continue by itself. The end screen lists 2 signed-in people. The second one's photo is the webcam frame with the figure in it. Click it to enlarge.

Small touches: the error text decays ("Please try again." → "please"). The checkbox spins longer each time. The page background gets darker. The label sometimes flickers to "I'm not alone." When you switch away, the tab title becomes "come back," and it tells you how long you were gone. The audio challenge reads the digits, then your first name, then "don't turn around."

## Added in the "scarier" pass

- **Stage 2:** after the first fail, someone stands in the hallway tile for about 0.2 s, then is gone.
- **Stage 3:** on retry, one frame shows the figure right up against the lens.
- **Stage 4:** the subtitle becomes "If there are none, don't turn around", and the user's name is whispered about 11 s in.
- **Stage 5:**
  - The feed is dim, cold and heavily vignetted, with high contrast so faces stay clear, and the light dips now and then.
  - Breathing starts behind your right shoulder, and the name is whispered again.
  - After the second fail, the figure steps in over your shoulder and the prompt becomes "the other person".
- **Finale:**
  - On "You are not human.", two frames flash full screen showing you with it right behind you, with a hit of sound.
  - The cursor then deletes your name and, at a perfectly even machine rhythm, types `claude` (set by `MODEL_NAME` in `app.js`).
  - The end screen shows two sessions: you ("Unverified") and `claude` ("Verified human ✓"). The second one's photo is the live webcam, and the figure keeps moving closer.

The widget and popup copy reCAPTCHA v2's layout: a 304×78 box, the popup opening beside the checkbox with an arrow, the blue header, and the footer icons. The logo is reCAPTCHA's three circling arrows in Hacktoberfest colors, with a pumpkin in the middle.

## The creature (photos)

The creature is four photographs, cut out in the browser when the page loads (`Art.loadAssets` in `art.js`):

| File | Used for |
|---|---|
| `assets/creature-peek.jpg` | The face behind long hair that peeks into the webcam and comes closer. It also appears faintly in the corner of the widest stage 4 photo. The tones are pushed apart (hair near black, skin pale) and a soft oval fades the edges. |
| `assets/creature-scream.jpg` | The jump scare lunge, and the one-frame close-up in stage 3. |
| `assets/creature-hand.jpg` | The hand that lands on your shoulder on the end screen. The black background is keyed out. |
| `assets/creature-curtain.jpg` | Stage 3, cropped tighter each round until the head fills the grid. Its silhouette is also the figure glimpsed in the stage 2 hallway. |

If the photos fail to load, the drawn creature (`Art.wraith` / `Art.figure`) is used instead.

### Photo credits

All four are from Unsplash under the [Unsplash License](https://unsplash.com/license) (free to use, no permission needed; credit appreciated):

- Face through hair: [Andriyko Podilnyk](https://unsplash.com/photos/Wl1InD5JP1A)
- Smeared screaming face: [Manuel Bonadeo](https://unsplash.com/photos/67n4o8IUw_s)
- Hand from darkness: [Huang 211](https://unsplash.com/photos/E3RiM7_uZ-Q)
- Figure behind curtains: [Catalin Pop](https://unsplash.com/photos/DL09PT4RDwA)

### Scene photos (stages 1, 2 and 4)

These are also from Unsplash, under the [Unsplash License](https://unsplash.com/license), stored in `assets/` at 800px. They're graded once when a round is drawn: drained and liminal in stage 2, brightened into green-tinted CCTV with date stamps in stage 4. If a file is missing, the drawn version is used.

| File | Use | Source |
|---|---|---|
| `s1-street.jpg` | stage 1 traffic lights | https://unsplash.com/photos/9ckhNwNSYvA |
| `s2-room-1.jpg` … `s2-room-9.jpg` | stage 2 empty rooms | [1](https://unsplash.com/photos/veSRX0sZDpQ) · [2](https://unsplash.com/photos/HEIUW9mM6_Q) · [3](https://unsplash.com/photos/A6As7Ra1cy8) · [4](https://unsplash.com/photos/IYn7Uh6P_w4) · [5](https://unsplash.com/photos/D8r1WeidnsQ) · [6](https://unsplash.com/photos/mRX5QFPUilE) · [7](https://unsplash.com/photos/0Bt_3aHVB6w) · [8](https://unsplash.com/photos/k9jqNlTMT8I) · [9](https://unsplash.com/photos/N77y-HJhjrM) |
| `s4-night-1.jpg` … `s4-night-6.jpg` | stage 4 decoy night stills | [1](https://unsplash.com/photos/dT3ZcvfY5T8) · [2](https://unsplash.com/photos/c-BbUMdX73M) · [3](https://unsplash.com/photos/v0CMjwnC3a0) · [4](https://unsplash.com/photos/M8oEyz7PoNA) · [5](https://unsplash.com/photos/EzoGykQmUYI) · [6](https://unsplash.com/photos/BuMVDXZTGn0) |
| `s4-you-1.jpg`, `s4-you-2.jpg` | stage 4 "you, from behind" | [1](https://unsplash.com/photos/qYMkkREOHa4) · [2](https://unsplash.com/photos/HT-3DZnO70w) |

In stage 2, after "You missed one.", the curtain photo's silhouette stands at the far end of the centre corridor; more reloads put someone in the backrooms tile and the waiting room. In stage 4's widest shot, the face-through-hair photo is faint in the corner.

## Animation and face warp

- **The creature never glides.** When it has somewhere new to be, the light flickers through dark frames and torn, colour-split frames, and it's simply there.
- **Its own movement runs at 12 fps,** which looks wrong next to 30 fps video:
  - a slow creeping head tilt with sudden snaps and violent shakes
  - a trembling jaw
  - breathing
  - drifting hair
- **On the end screen** it moves closer in three flicker-jumps, then its hand lands on your shoulder.
- **The jump scare** is a 0.45 s lunge: the screaming face rushes the lens until it fills the screen, while the image shakes and tears, then a white flash and black.
- **Finale text** decodes out of glitch characters.
- **Face warp** (`warp.js`): MediaPipe Face Landmarker, loaded from jsDelivr, tracks your face. A WebGL shader then:
  - swells your eyes and turns them into black hollows with pinprick pupils
  - stretches your jaw open into a black hole
  - lengthens your face and drains it grey
  - melts everything below your eyes downward

  It gets stronger each round: 0.15 when the camera starts, 0.45, 0.75, then full in the finale. On the end screen it keeps melting. If MediaPipe or WebGL can't load, the warp is skipped.
- **Webcam grid:** the image is cut the way reCAPTCHA's is, so the white gaps cover it and nothing shifts between squares. Selected squares get an in-place highlight.

## Libraries (all pinned)

| Library | Used for |
|---|---|
| [GSAP 3.13](https://gsap.com) + ScrambleText, CustomEase, CustomWiggle | The finale timeline, the training-log bars and scrambling text, the end-screen build, tile reveals, the popup fade, the rolling VHS band, and the counter tween. All GSAP plugins have been free since 3.13. |
| [PowerGlitch 2.4](https://github.com/7PH/powerglitch) | The `claude` name on the end screen, glitching now and then. |
| [MediaPipe Tasks Vision 1.1.1](https://github.com/google-ai-edge/mediapipe): Face Landmarker | Tracks your face for the warp shader. |
| MediaPipe Image Segmenter (selfie_segmenter) | Cuts you out of the webcam frame so the creature is drawn **behind** you and you're put back on top. |
| [Tone.js 15.1.22](https://tonejs.github.io) | The ten level tracks: FM, metal, membrane and noise synths, chorus, auto-filter, delay, distortion and bit-crusher. It runs on the page's own audio context, so it shares the mix and reverb. |
| [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (Google Fonts) | The pixel font for the battles. |

Everything degrades gracefully. Without GSAP, animations become plain timing. Without MediaPipe, there's no warp and no occlusion, and the end screen falls back to the creature approaching in jumps.

## Performance notes

- **Webcam pipeline runs once per camera frame** (`requestVideoFrameCallback`, about 30 fps), not every display refresh (60–144 Hz). Without that API it's capped at 30 fps.
- **No `ctx.filter` per frame:**
  - Colour is drained with a `saturation` blend fill.
  - Gradients are built once.
  - The face photo and the segmentation mask aren't blurred per frame.
- **The glitch/tear effect stays on the GPU.** The flicker and the jump scare use `Art.tear`, which is only `drawImage` calls, with no `getImageData` readback.
- **MediaPipe runs in a Web Worker** (`mp-worker.js`) on a 320px `ImageBitmap`. The page never waits for it; it uses the latest landmarks and mask whenever they arrive. Segmentation runs on every third frame it processes.
- **One WebGL pass does the whole look.** The video goes straight to the GPU as a texture, and a single shader mirrors and crops it, warps the face, drains the colour, warm-tints it, vignettes it, lights it and adds grain. There are no 2D canvas blend modes per frame. The 2D fallback grade only runs without WebGL.
- **The delayed-frame buffer** behind the creature is only filled while the creature is visible.
- **The webcam grid is one canvas** behind nine see-through squares, whose white edges cover the gaps the way reCAPTCHA's grid lines do. That's one draw per camera frame instead of nine, and one composited layer instead of nine.
- **Grain is pure CSS:** a speckle tile on an oversized layer that a `steps()` animation jumps around. It runs on the compositor, with no JavaScript or canvas per frame, and only while visible.
- **Game canvas resolution is capped at 1.5×** device pixels. A full-screen 2× canvas is 4× the pixels for little visible gain.
- **Animation fixes:**
  - The tile swap now fades out with GSAP, redraws while invisible, then ripples back in. Before, the tiles snapped back.
  - The cursor's glide is a GSAP tween with a slight arc and overshoot, instead of a jittery sine wobble.
- **The overlay is cheap:**
  - Grain is transparent speckle at about 15 fps with normal blending. There's no full-screen `mix-blend-mode`, and the tracking band has no `backdrop-filter`.
  - The band moves by transform, not `top`.
- **Selection animation:** each square has real check, ripple and highlight elements animated by GSAP (transform and opacity only). The picture eases to 80%, the check pops in with an overshoot, and a ripple pulses out. Deselecting springs back. Live webcam squares get an animated frame instead of shrinking.

## The last test: ten steps (`battle.js`)

After "You are not human.", ten steps against claude. Each one plays differently: Undertale-style battles alternate with arcade levels that are **generated fresh on every run** from a random seed.

| Step | Kind | What you do | Spare ACT |
|---|---|---|---|
| 1 Invaders | battle (red SOUL) | rows of sparks march down with a drifting gap | Wave |
| 2 Run | generated runner | a side-scrolling course of sparks, stacked sparks, low fliers and pits; claude's giant eye chases you from the left and gets closer every time you trip | – |
| 3 Centipede | battle (purple SOUL) | stuck on three strings; chains crawl along them | Scroll |
| 4 Lights out | generated maze | pitch dark, only a little light around you; collect 3 CAPTCHA tiles, then reach the checkbox while its eye hunts you through the corridors | – |
| 5 Galaga | battle (green SOUL) | you can't move; turn your shield toward sparks from four sides | Plead |
| 6 CAPTCHA wall | generated breakout | "Select all squares with claude": break a wall of tiles and hit the eye behind it 3 times, while it drops sparks on you | – |
| 7 Red light | battle | its eye opens: move and you're hit; eye shut, the sparks fall | Freeze |
| 8 Spell | battle | touch the letters of your name in order; finishing turns your name into C L A U D E | Say name |
| 9 Boss | battle (yellow SOUL) | beams and rings; your SOUL shoots back at the eye (up to 8 damage per attack) | Admire |
| 10 ??? | battle | FIGHT always misses, MERCY is refused, and the box closes in until there's no room | none |

Every step must be beaten. Dying restarts it with "Stay determined..." (an arcade level is regenerated, so the retry is a new layout).

**Difficulty:** tuned to be forgiving but never skippable. Hits do 70% damage (except level 10), you blink invulnerable for 1.1s after a hit, and hitboxes are a pixel smaller than they look. Escalation is gentle (anger +10%, repeats +5% up to +15%). In the runner the eye lunges less and falls back faster. In the maze the hunter wakes after 3.5s and moves slower than you. The breakout paddle is wider and the eye fires less often. There is still no way past a step without winning it: a battle ends only by FIGHT (at least two hits) or the right ACT then MERCY, and an arcade level only by reaching its goal.

### Battles
- claude talks in a typewriter box with text blips, plus speech bubbles in its own low voice
- you choose **FIGHT / ACT / ITEM / MERCY**
  - FIGHT is a timing bar: strike near the centre for more damage. One strike takes at most half of claude's HP, so every win takes at least two FIGHTs with an attack to survive in between.
  - ACT gives Check plus two level-specific actions. One of them per level makes claude "ready to be spared".
  - ITEM opens an inventory that lasts across all the battles: Cookie (+8), Bandage (+6), Old Photo (+5), CAPTCHA Pie (full heal). Dying restores the items you had when that battle began.
  - MERCY has Spare and Flee. Spare wins peacefully once the right ACT is done (it shows in yellow), and is refused otherwise. Flee never works.
- then it attacks and you dodge as your SOUL inside the bullet box. The SOUL's colour changes how you move (a hint above the box says how).
- **Generated attacks:** on steps 1, 3, 5 and 9, every other attack is one claude invents on the spot ("let me try something new."). It picks two building blocks with a fresh seed (rain, wavy or heavy rain, walls with a gap, rings, telegraphed snipers, a sprinkler, bouncers, beams; for purple: chains, drops, a telegraphed express train; for green: steady, swing or rushing rhythms), sometimes mirrored (controls reversed) or in the dark. The seed and recipe show above the box, e.g. `NEW PATTERN #5D03 SNIPERS + WAVY RAIN`.

### What makes it fun (the design rules it follows)
- **Every danger is readable.** Snipers draw a line before they fire, beams charge first, the express train flashes its string, pits and fliers are visible well ahead. Getting hit should always feel fair.
- **It never repeats exactly.** Hand-made attacks alternate with generated ones, its own attack gets 10% faster each time it comes back, and the arcade levels are new every run.
- **Risk pays.** A **GRAZE** (brushing past a spark without touching it) flashes a ring around your SOUL, and every 6 grazes heal 1 HP. A hitless attack is **PERFECT**: it heals 3 HP, more as the streak grows. In the breakout, breaking 4 tiles in a row without touching your paddle makes the ball **PIERCE** through tiles for 2.5 seconds.
- **Your choices change it.** After the right ACT it hesitates (gentler attacks, "it hesitates..."). Hurt it past half and it gets angry (20% faster). Level 10 opens by answering how you played: spare every battle and it learned mercy from you and decided not to use it; destroy every battle and it learned that too; a mix gets "I kept both."
- **Short sessions.** Two good hits win a battle; the runner lasts about 15 seconds, the maze about 25, and the breakout 15–40.

### What makes it scary
- **Phase 2:** at half HP the screen cuts to black with its eye filling it, a shriek, and its next line is "i know your name, ben." (your name). It shakes and glows red from then on, and flickers into view with your name over it at random moments while you're choosing.
- **Dread:** at low HP your heartbeat starts, the edges of the screen pulse red, and your SOUL cracks.
- **The runner:** the eye fills the left of the screen, the screen reddens as it closes in, and "IT'S RIGHT BEHIND YOU" flashes; eyes blink in the pits.
- **The maze:** you only see a few steps around you, but you can always see its red glow moving. Your heartbeat speeds up as it gets closer, and things whisper in the dark ("turn around", your name). Being caught is a jump scare.

Losing level 10 shows **GAME OVER** and "claude 1 · humans 0". Your stats (steps cleared, FIGHT accuracy, dodges, spared versus destroyed) go into the training log.

All battle text is word-wrapped to its box, and shrinks if a line is still too long. Speech bubbles grow to fit.

**Controls:** arrows or WASD to move and choose; Z, Enter or Space to confirm; X or Shift to go back. Mouse and touch also work: click buttons and text, and hold inside the box to steer. Runner: UP / W / Space / tap to jump (hold for higher). Maze: arrows or hold the mouse. Breakout: arrows or just move the mouse; Space or click launches the ball.

**Developers only:** `?battle=N` starts at level N and exposes a `window.__battle` hook, so tests can step the game clock while the tab is in the background. Normal play always starts at level 1 and has no skips.

`game.js` (the earlier Space Invaders version) is kept as a fallback if `battle.js` fails to load.

## Claude Invaders (the last test)

After "You are not human.", the checkbox says "One last test. Beat it." and `game.js` opens full screen.

- **The game:** Space Invaders, where the invaders are claude's evil mark and your ship is your own mouse cursor. Fire is automatic, so you only have to move. Each spark's eye follows your ship and blinks.
- **Levels 1–9** must each be fully cleared; nothing skips you ahead. Lives refill every level, and running out before level 10 just restarts that level. Each level is a different game:

  | Level | Game | How it plays |
  |---|---|---|
  | 1 | Space Invaders | classic march |
  | 2 | Asteroids | a hit spark splits into two smaller ones that bounce around |
  | 3 | Centipede | a chain of sparks runs sideways, dropping a row at each wall |
  | 4 | Galaga | sparks peel off and dive-bomb you |
  | 5 | Mirror | your controls are reversed |
  | 6 | Flashlight | it's dark except around your ship, and only their eyes glow |
  | 7 | Red Light, Green Light | every eye opens and shuts together. Move while they're open and you're hit (after a 0.3 s grace). You can only hit them while their eyes are shut. |
  | 8 | Spell your name | sparks carry the letters of your first name, plus two decoys. Shoot them in order; wrong ones flash red. When you finish, your name flickers into `CLAUDE`. |
  | 9 | Boss | a giant spinning spark with a health bar; only its eye takes damage, and it fires spreads |
- **Level 10, "claude has finished training on you":**
  - you have one life
  - every spark sidesteps every shot, so yours never land
  - the formation shadows your position
  - shots are aimed where you're about to be
  - after 6.5 s, a solid wall of fire comes down
  - "GAME OVER · claude 1 · humans 0"
- **Afterwards:** your real stats (levels cleared, accuracy, dodges) appear in the training log as `Read(invaders.log)`.
- **No skipping:** there are no skip keys in the game; every level has to be beaten.

## claude's mark

`Art.evilSparkSVG` / `Art.drawEvilSpark` in `art.js` draw an evil take on a spark logo: eight curved blood-orange thorns, two of them dripping, around a single slit-pupil eye. It appears in:
- the footer counter
- the training-log header
- the end screen
- the browser tab icon, once the camera is on
- the stage 3 click flashes (it opens in another square, looking at the one you clicked)
- the stage 4 "● REC" photos
- the jump scare's last frames
- every invader

On the page, every mark's eye follows your mouse and blinks now and then. In the game, they follow your ship.

## Claude-themed horror

- **The webcam** is lit warm and dim (claude's light), and its flickers dip to dark orange.
- **The photo creatures** are tinted warm.
- **Stage 3's curtain photo** and its close-up flash are in burnt orange.
- **Glowing eyes** (the stage 2 doorway and the hallway silhouette) are orange.
- **The decaying error text** slides into its voice: "I apologize. Please try again." → "I can't help with that." → "✻". Wrong answers get "You're absolutely right."
- **The checkbox label** flickers to "I'm claude".
- **The whispers** say "Ben. I'm claude." The audio challenge ends with "I'm claude".
- **Spinners** turn orange from stage 4.
- **Tab titles** read "✻ come back" and, after the finale, "✻ claude is still here".

## Face tracking and compositing

**It visibly tracks you.** Wherever your camera is on (the camera CAPTCHA tiles and the live profile picture at the end), a face scan is drawn over the feed after the grade, so it stays crisp. Before it finds you, a scan line sweeps and "SEARCHING FOR FACE..." blinks. Then corner brackets close in and lock on, a wireframe mesh joins the 14 tracked points (brows, eyes, cheeks, mouth, chin), and crosshairs sit on your irises, all following you live. A readout under your face says "SUBJECT: <your name>" with "MAPPING" creeping up to 99%, and it reacts: "LOOK AT THE CAMERA." flashes red if you turn your head away, "VOICE SAMPLE: RECORDING" shows when you open your mouth, and "WHERE DID YOU GO?" blinks if you leave the frame. When the logo morph takes over, the scan fades out and the readout changes to "SUBJECT: claude · MATCH: 100% · TRANSFER COMPLETE". The mesh is a pale line over a dark outline, so it reads on any skin tone.

**Your face becomes its logo.** The camera loop anchors claude's logo to your tracked face (centre, size, head tilt, which way you're turned, how open your mouth is) and morphs you into it in three phases, all under the same grade as the rest of the frame:
1. **Halo:** its arms grow out from *behind* your head (the segmentation mask puts you back on top) and slowly turn.
2. **Infection:** your skin turns claude-orange, glowing cracks spread from between your eyes along the lines of its arms, and its single eye opens between yours, looking where you look.
3. **Replaced:** your face fades to black and the logo takes its place, still moving and tilting with your head. Opening your mouth flares its arms.

During the camera test the halo only flickers in behind you for a moment now and then. On the end screen (the live profile picture) the full morph plays over about 9 seconds. Without face tracking it assumes a centred face and starts after the ghost has reached you.

- **Landmark smoothing:** a One Euro filter on every landmark keeps the warp steady when you're still and lag-free when you move.
- **Black tears** run from your tracked eyes in the warp shader, so they follow your head.
- **Two GPU passes:**
  1. Warp only: mirror, crop, face warp and tears, with the colour left untouched.
  2. After you, the creature photo and the hand are composited, one final pass applies the grade, barrel distortion, edge colour-fringing, the vignette, the light pool and grain to everything at once.

  That way the creature gets exactly the same lighting, lens and grain as your face, instead of looking pasted on.

## Desktop takeover (the very end)

- **Fullscreen.** The finale goes fullscreen on your Verify click, since browsers require a click or keypress for that. Esc still exits.
- **Screen capture.** In stage 5, after the camera, the CAPTCHA asks you to share your screen ("Choose Entire screen"). It takes one still frame and stops sharing immediately. It's built so it can't hang: it reads the frame straight from the track where the browser supports that (a hidden video otherwise), every wait times out after 2.5 s, sharing is always stopped (even on errors), empty frames are rejected, and double-clicks are ignored. If anything fails, the ending uses a drawn stand-in desktop. You only share once: the frame is kept for the rest of the browser session (in `sessionStorage`, as a compressed JPEG on that machine only), so later runs (Shift+R, or a reload for the next person) skip the share step.
- **The takeover** (`desktop.js`, about 12 seconds after the end screen). That frame of your desktop fills the screen, then:
  - an orange cursor that isn't yours wanders around clicking
  - claude's marks break out across it, bleeding ink, with every eye following your mouse
  - a Claude Code window types `take over this computer` → `Bash(whoami)` → `Update(owner)` → "I'm using this computer now."
  - the whole desktop melts down the screen column by column (the Doom wipe)
  - underneath is the eye: "Thanks for the desktop, Ben."
- **Ending.** Click (or wait 20 s) to fade back to the end screen.
- **If sharing is declined,** a drawn stand-in desktop is used instead.
- **Limits.** A web page can't control the real OS. This is fullscreen plus a still image of your screen.

## Sound (`sound.js`)

Everything is synthesized live with Web Audio; there are no sound files. Every voice goes through a compressor plus a generated room reverb.

| Layer | What it does |
|---|---|
| **Drone** | Detuned saws through a slowly breathing low-pass that opens each stage. A dissonant tritone joins from stage 4. |
| **Room tone** | Brown noise plus a faint 50 Hz mains hum. |
| **Heartbeat** | From stage 4 at 62 bpm, then 84, then 108 in the finale. |
| **3D sound (HRTF)** | Knocks behind you to one side, and breathing just behind your right ear. Use headphones. |
| **One-shots** | UI clicks that detune a little more each stage, a glitch stutter on every flicker of the creature, a whoosh between rounds, and a rising swell into the jump scare, which lands with a sub-bass drop and a shriek. |

## Soundtrack (`music.js`)

A score composed and played live with Web Audio (no files): a beat-accurate lookahead scheduler plays 16th-note steps, and each scene decides what plays.

| Moment | Score |
|---|---|
| Stages 1–2 | A music-box lullaby in A minor (FM bells) over vinyl crackle. Normal at first, then going out of tune. |
| Stage 3 | The lullaby slows and sags flat over a low dissonant string drone. |
| Stage 4 | A dark synthwave bass ostinato; the music box only plays fragments. |
| Stage 5 | A ticking clock, the string cluster, and a Shepard tone that rises forever. |
| Jump scare | Hard cut to silence. |
| Game | A song for each level, built with Tone.js: a real melody (A and B sections) over a chord progression, a bass line, a counter-melody arpeggio and drums. It plays softly (no drums) while you read and choose, and goes full during attacks.<br>1 · A-minor march, pulse lead<br>2 · E Phrygian, FM bell with echo<br>3 · C#-minor FM insect lead at 146 bpm<br>4 · D minor, sliding triangle lead and chord stabs<br>5 · F#-minor reversed-envelope lead through chorus<br>6 · a slow music box over a heartbeat and wind<br>7 · a toy-piano playground tune with oom-pah bass and claps<br>8 · the lullaby with a typewriter<br>9 · harmonic minor: distorted lead, choir, toms and braams<br>10 · level 1's theme bit-crushed and detuned at 168 bpm |
| Training log | A low pulse with key clicks. |
| End screen | The lullaby again, backwards, slow and warped. |
| Takeover | The Shepard rises and the bass quickens. A braam hits on the melt, then silence and one last music-box note. |

## Pacing and demo mode

- **Shorter waits:** spinners, the checkbox spin and the finale pauses are all shorter.
- **Game levels have no time limit.** You have to clear every one.
- **The takeover starts 8 s** after the end screen.
- **`?demo`** runs every scripted pause at 60%. Game levels still have to be beaten. Combine it with `?stage=N`, e.g. `?demo&stage=4`.

## Presenter controls

- `Shift+N`: skip to the next CAPTCHA stage (not available inside the game)
- `Shift+R`: restart
- `?stage=4`: start at a given stage

Type a name in "Full name" before clicking the checkbox. Stages 4–6 use it.
