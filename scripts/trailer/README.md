# Trailer capture

Renders the social videos from real gameplay, frame by frame, with the dev
server running (`npm run dev`):

```bash
node scripts/trailer/capture.cjs youtube scout   # two stills per shot, to check framing
node scripts/trailer/capture.cjs youtube full    # every frame, 30 fps
scripts/trailer/assemble.sh youtube out.mp4      # score + frames -> MP4
```

Formats: `youtube` (1920x1080), `reels` (1080x1920), `x` (1080x1080).

- `shots.cjs`: each shot's setup, camera move, actions and caption.
- `director.js`: runs in the page; the film camera (`window.__film`, read by
  `src/main.ts`) and the captions, all on game time.
- `capture.cjs`: stops the game's own loop and steps it one video frame at a
  time under Playwright's fake clock, so the footage is smooth however slow
  the renderer is.
- `compose.cjs`: scores the cut at 120 BPM in the game's synth palette, with
  effects timed to each shot. Shot lengths are whole beats.
- `assemble.sh`: H.264 + AAC, loudness -14 LUFS, fast start.

Frames go to `scripts/trailer/out/` (ignored by git).
