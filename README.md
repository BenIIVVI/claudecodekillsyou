# I'm Not a Robot

## Requirements

- Python 3
- Google Chrome
- A webcam (optional, but recommended)
- Sound on, ideally headphones

## Run

1. Clone the repository:

   ```
   git clone https://github.com/BenIIVVI/claudecodekillsyou.git
   cd claudecodekillsyou
   ```

2. Start the local server. The webcam only works on `localhost` or https, so don't open `index.html` directly:

   ```
   python serve.py
   ```

3. Open http://localhost:5177 in Chrome.

4. Type your name in **Full name**, then click **I'm not a robot**.

5. Allow the camera and screen share when asked. For screen share, choose **Entire screen**.

## Options

- `http://localhost:5177/?short` is the quick cut for judging: three CAPTCHA stages, then the runner, the maze, the wall-breaker and the final battle.
- `http://localhost:5177/?demo` runs the full version at a faster pace.
- `http://localhost:5177/?stage=4` starts at a given stage (1–5).
- `Shift+N` skips to the next CAPTCHA round.
- `Shift+R` restarts.
