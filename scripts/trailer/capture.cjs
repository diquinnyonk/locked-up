// node capture.cjs <format> <scout|full> [shot,shot,...]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { SHOTS, common } = require('./shots.cjs')

const FORMATS = {
  youtube: { w: 1920, h: 1080, list: ['aerial', 'cell', 'landing', 'yard', 'sneak', 'chase', 'talk', 'riot', 'vents', 'disguise', 'safe', 'engine', 'ghost', 'car', 'endcard'] },
  reels: { w: 1080, h: 1920, list: ['aerial', 'cell', 'sneak', 'chase', 'riot', 'vents', 'disguise', 'ghost', 'car', 'endcard'], short: true },
  x: { w: 1080, h: 1080, list: ['aerial', 'cell', 'sneak', 'chase', 'riot', 'vents', 'disguise', 'ghost', 'car', 'endcard'], short: true },
}
const FPS = 30

;(async () => {
  const [fmtName, mode = 'scout', only] = process.argv.slice(2)
  const fmt = FORMATS[fmtName]
  const list = only ? only.split(',') : fmt.list
  const out = path.join(__dirname, 'out', fmtName, mode)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: fmt.w, height: fmt.h } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('locked-up.tour', '1')
    localStorage.setItem('locked-up.audio', JSON.stringify({ music: 0, ambience: 0, effects: 0 }))
  })
  await p.goto('http://localhost:5173/?secret=greylady')
  await p.waitForFunction(() => window.__lockedUp, null, { timeout: 90000 })
  await p.waitForTimeout(500)
  await p.fill('#name', 'Bandit')
  await p.click('#name-form button[type=submit]')
  await p.waitForTimeout(500)
  await p.click('#story-skip').catch(() => {})
  await p.waitForFunction(() => window.__lockedUp.game.secret, null, { timeout: 30000 })
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8') })
  await p.evaluate(common)
  // Drive the frame loop by hand: one update and one draw per video frame.
  await p.evaluate(() => window.__lockedUp.engine.stop())
  await p.clock.install()
  await p.evaluate(() => {
    const e = window.__lockedUp.engine
    let elapsed = 0
    window.__step = (dt, draw = true) => {
      elapsed += dt
      try {
        e.updateFn(dt, elapsed)
      } catch (err) {
        const g = window.__lockedUp.game
        const bad = g.bodies.map((b, i) => ({ i, pose: b.pose, pt: b.poseTime, st: b.stride, sp: b.speed, x: b.x })).filter((b) => b.pose === 'fight' && !(b.pt >= 0 && b.st >= 0))
        throw new Error(err.message + ' ' + JSON.stringify(bad) + ' ' + g.clock.text)
      }
      if (draw) e.draw()
    }
  })
  const step = async (seconds) => {
    const n = Math.max(1, Math.round(seconds * FPS))
    for (let i = 0; i < n; i++) {
      await p.clock.runFor(1000 / FPS)
      await p.evaluate(([dt, d]) => window.__step(dt, d), [1 / FPS, i === n - 1])
    }
  }
  const cuts = []
  let frame = 0
  let time = 0
  for (const name of list) {
    const shot = { ...SHOTS[name] }
    if (fmt.short) shot.dur = shot.short
    // Set the scene, then let it settle with the follow camera.
    await p.evaluate(`(() => { window.__T.shot = null; const S = window.__S; const g = S.g; { ${shot.setup.replace(/const g = S.g;?/g, "")} } })()`)
    await step(0.9)
    const data = JSON.stringify({ ...shot, setup: undefined, tick: undefined })
    await p.evaluate(`(() => { const s = ${data}; ${shot.tick ? `const S = window.__S; s.tick = (g, t, dt) => { ${shot.tick} };` : ''} if (${JSON.stringify(!!shot.flashIn)}) s.flashIn = true; window.__T.begin(s) })()`)
    const n = Math.round(shot.dur * FPS)
    cuts.push({ name, start: time, dur: n / FPS })
    const grab = mode === 'scout' ? new Set([Math.floor(n * 0.3), Math.floor(n * 0.8)]) : null
    for (let i = 0; i < n; i++) {
      await p.clock.runFor(1000 / FPS)
      await p.evaluate(([dt, d]) => window.__step(dt, d), [1 / FPS, !grab || grab.has(i)])
      if (!grab || grab.has(i)) {
        const file = mode === 'scout' ? `${name}-${i}.jpg` : `${String(frame).padStart(5, '0')}.jpg`
        await p.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 94 })
      }
      frame++
    }
    time += n / FPS
    process.stdout.write(`${name} `)
  }
  fs.writeFileSync(path.join(out, 'cuts.json'), JSON.stringify({ fps: FPS, frames: frame, cuts }, null, 1))
  console.log(`\n${frame} frames, ${time.toFixed(2)}s`, errs.slice(0, 5))
  await b.close()
})()
