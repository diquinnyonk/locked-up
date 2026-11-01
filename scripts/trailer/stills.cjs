// Clean stills for the website (site/img), from the trailer's shots: no
// captions, no watermark. Needs the dev server on 5173.
//   node scripts/trailer/stills.cjs [shot,shot,...]
// STYLE=cel|ghibli picks the art style, OUT=<dir> writes somewhere else.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { SHOTS, common } = require('./shots.cjs')

const W = 1600
const H = 1000
const FPS = 30
const LIST = (process.argv[2] ?? 'aerial,cell,yard,talk,riot,vents,safe,engine,ghost,disguise,chase,sneak').split(',')

;(async () => {
  const out = process.env.OUT ?? path.join(__dirname, '..', '..', 'site', 'img')
  fs.mkdirSync(out, { recursive: true })
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: W, height: H } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('locked-up.tour', '1')
    localStorage.setItem('locked-up.audio', JSON.stringify({ music: 0, ambience: 0, effects: 0 }))
  })
  await p.goto(`http://localhost:5173/?secret=greylady${process.env.STYLE ? `&style=${process.env.STYLE}` : ''}`)
  await p.waitForFunction(() => window.__lockedUp, null, { timeout: 90000 })
  await p.waitForTimeout(500)
  await p.fill('#name', 'Bandit')
  await p.click('#name-form button[type=submit]')
  await p.waitForTimeout(500)
  await p.click('#story-skip').catch(() => {})
  await p.waitForFunction(() => window.__lockedUp.game.secret, null, { timeout: 30000 })
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8') })
  await p.evaluate(common)
  await p.evaluate(() => window.__lockedUp.engine.stop())
  await p.clock.install()
  await p.evaluate(() => {
    const e = window.__lockedUp.engine
    let elapsed = 0
    window.__step = (dt, draw = true) => {
      elapsed += dt
      e.updateFn(dt, elapsed)
      if (draw) e.draw()
    }
  })
  const step = async (seconds, drawLast = true) => {
    const n = Math.max(1, Math.round(seconds * FPS))
    for (let i = 0; i < n; i++) {
      await p.clock.runFor(1000 / FPS)
      await p.evaluate(([dt, d]) => window.__step(dt, d), [1 / FPS, drawLast && i === n - 1])
    }
  }
  for (const name of LIST) {
    const shot = { ...SHOTS[name], caps: [], mark: false, end: undefined }
    await p.evaluate(`(() => { window.__T.shot = null; const S = window.__S; const g = S.g; { ${shot.setup.replace(/const g = S.g;?/g, '')} } })()`)
    await step(0.9)
    const data = JSON.stringify({ ...shot, setup: undefined, tick: undefined })
    await p.evaluate(`(() => { const s = ${data}; ${shot.tick ? `const S = window.__S; s.tick = (g, t, dt) => { ${shot.tick} };` : ''} window.__T.begin(s) })()`)
    await step(shot.dur * 0.62)
    await p.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 86 })
    process.stdout.write(`${name} `)
  }
  console.log(errs.slice(0, 5))
  await b.close()
})()
