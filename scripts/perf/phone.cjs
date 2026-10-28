/**
 * A cheap-phone benchmark. Opens the built game in Chromium at phone size
 * with the CPU slowed (6x is Chrome's "low-end mobile"), puts you in the
 * canteen at lunch (the most people on screen at once) and in the yard,
 * and reports how long the game's update and the draw take each frame,
 * plus the hottest functions from a CPU profile.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/perf/phone.cjs [slowdown=6] [url=http://localhost:4173/]
 *
 * The headless browser draws with a software GPU, so draw times say little
 * about a real phone's GPU; update times and the JS profile are the useful
 * part, and draw calls and triangles stand in for GPU load.
 */
const { chromium } = require('playwright')

const SLOW = Number(process.argv[2] ?? 6)
const URL = process.argv[3] ?? 'http://localhost:4173/'

const SCENES = {
  canteen: `S.at(12 * 60 + 5); S.put(80, 46)`,
  yard: `S.at(13 * 60 + 40); S.put(80, 98)`,
  landing: `S.at(8 * 60 + 2); S.put(40, 30)`,
}

;(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('locked-up.tour', '1')
    localStorage.setItem('locked-up.audio', JSON.stringify({ music: 0, ambience: 0, effects: 0 }))
  })
  await page.goto(URL)
  await page.waitForFunction(() => window.__lockedUp, null, { timeout: 90000 })
  await page.fill('#name', 'Bench')
  await page.click('#name-form button[type=submit]')
  await page.waitForTimeout(500)
  await page.click('#story-skip').catch(() => {})
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const S = (window.__S = {})
    const g = (S.g = window.__lockedUp.game)
    S.at = (m) => g.clock.skipTo(m)
    S.put = (x, z) => {
      const b = g.player.body
      b.x = x
      b.z = z
      g.player.zone = g.grid.zoneAtWorld(x, z)
    }
    g.events.today = 'quiet'
    g.events.at = -1
    // Time each half of the frame.
    const e = window.__lockedUp.engine
    e.adaptive = false
    const u = e.updateFn
    const d = e.draw.bind(e)
    S.t = { update: [], draw: [] }
    e.updateFn = (dt, el) => {
      const t = performance.now()
      u(dt, el)
      S.t.update.push(performance.now() - t)
    }
    const info = e.renderer.info
    info.autoReset = false
    e.draw = () => {
      info.reset()
      const t = performance.now()
      d()
      S.t.draw.push(performance.now() - t)
      S.t.calls = info.render.calls
      S.t.triangles = info.render.triangles
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW })
  await cdp.send('Profiler.enable')

  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0
  const results = {}
  for (const [name, setup] of Object.entries(SCENES)) {
    await page.evaluate(`const S = window.__S; ${setup}`)
    await page.waitForTimeout(1500)
    await page.evaluate(() => {
      window.__S.t.update.length = 0
      window.__S.t.draw.length = 0
    })
    await cdp.send('Profiler.start')
    await page.waitForTimeout(6000)
    const { profile } = await cdp.send('Profiler.stop')
    const r = await page.evaluate(() => {
      const visible = window.__S.g.bodies.filter((b) => b.visible).length
      return { update: window.__S.t.update, draw: window.__S.t.draw, calls: window.__S.t.calls, triangles: window.__S.t.triangles, visible }
    })
    // Self time by function.
    const self = new Map()
    const dtOf = new Map()
    profile.samples.forEach((id, i) => dtOf.set(id, (dtOf.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
    let total = 0
    for (const n of profile.nodes) {
      const t = (dtOf.get(n.id) ?? 0) / 1000
      total += t
      const f = n.callFrame
      if (!f.url || f.functionName === '(idle)' || f.functionName === '(program)') continue
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + t)
    }
    const frames = r.update.length
    const cpu = r.update.map((u, i) => u + (r.draw[i] ?? 0))
    results[name] = {
      // What the processor alone allows, at this slowdown: the headless GPU
      // is software, so the frames actually drawn here say nothing.
      cpuFrameMs: { median: +pct(cpu, 0.5).toFixed(1), p95: +pct(cpu, 0.95).toFixed(1) },
      cpuFps: +(1000 / pct(cpu, 0.5)).toFixed(0),
      updateMs: { median: +pct(r.update, 0.5).toFixed(1), p95: +pct(r.update, 0.95).toFixed(1) },
      drawMs: { median: +pct(r.draw, 0.5).toFixed(1), p95: +pct(r.draw, 0.95).toFixed(1) },
      drawCalls: r.calls,
      triangles: r.triangles,
      peopleOut: r.visible,
      framesSampled: frames,
      hottest: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 6).toFixed(1)}ms/s ${k}`),
    }
  }
  console.log(JSON.stringify({ slowdown: SLOW, results }, null, 2))
  await browser.close()
})()
