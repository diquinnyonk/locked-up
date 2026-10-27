// Runs inside the game page. Drives the film camera, each shot's actions and
// the captions, all from game time, so the captured frames are exact.
;(() => {
  const css = `
  body.clean #hud, body.clean #toasts, body.clean #prompts, body.clean #inventory, body.clean #zone,
  body.clean #centre, body.clean #card, #end, #letterbox, body.clean #panel:not(.dialogue) { display: none !important; }
  body.nobubbles #bubbles { display: none !important; }
  .bubble { font-size: calc(var(--u) * 2.1) !important; max-width: calc(var(--u) * 34) !important; padding: calc(var(--u) * 0.6) calc(var(--u) * 1) !important; }
  #tr { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: var(--display); }
  #tr .cap { position: absolute; left: 0; right: 0; display: grid; justify-items: center; gap: calc(var(--u) * 0.9); text-align: center; padding: 0 6%; }
  #tr .cap.low { bottom: calc(var(--u) * 9); }
  body.portrait #tr .cap.low { bottom: 26%; }
  body.portrait #tr .cap.high { top: 14%; }
  body.portrait #tr .mark { top: 6%; }
  #tr .cap.mid { top: 50%; transform: translateY(-50%); }
  #tr .cap.high { top: calc(var(--u) * 10); }
  #tr .kick { font: 800 calc(var(--u) * 2.9) / 1 var(--display); letter-spacing: 0.18em; color: #f2c14e; text-transform: uppercase;
    text-shadow: 0 2px 0 #12222b, 0 0 calc(var(--u) * 1.5) rgba(18,34,43,0.9); }
  #tr .line { font: 800 calc(var(--u) * 7.4) / 0.95 var(--display); text-transform: uppercase; color: #fff; letter-spacing: 0.01em;
    background: #12222b; padding: calc(var(--u) * 0.9) calc(var(--u) * 1.8) calc(var(--u) * 0.6); box-shadow: calc(var(--u) * 0.5) calc(var(--u) * 0.5) 0 #f2c14e; }
  #tr .line b { color: #f2c14e; font-weight: 800; }
  #tr .mark { position: absolute; right: calc(var(--u) * 2.2); top: calc(var(--u) * 2); font: 800 calc(var(--u) * 2.2) / 1 var(--display);
    color: #fff; letter-spacing: 0.06em; text-shadow: 0 2px 0 #12222b; opacity: 0.9; }
  #tr .mark i { display: inline-block; width: calc(var(--u) * 1.1); height: calc(var(--u) * 1.1); background: #f2c14e; margin-right: calc(var(--u) * 0.6); vertical-align: -0.05em; }
  #tr .end { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: calc(var(--u) * 2.2);
    background: radial-gradient(ellipse at center, rgba(18,34,43,0.78), rgba(18,34,43,0.94)); text-align: center; padding: 0 6%; }
  #tr .end h1 { margin: 0; font: 800 calc(var(--u) * 16) / 0.82 var(--display); color: #e8e6df; text-transform: uppercase; letter-spacing: -0.01em; }
  #tr .end .tag { font: 800 calc(var(--u) * 3) / 1.1 var(--display); color: #f2c14e; text-transform: uppercase; letter-spacing: 0.08em; }
  #tr .end .play { font: 800 calc(var(--u) * 3.6) / 1 var(--display); background: #f2c14e; color: #12222b; padding: calc(var(--u) * 1.2) calc(var(--u) * 2.4) calc(var(--u) * 0.9); }
  #tr .end .url { font: 700 calc(var(--u) * 2.4) / 1.2 var(--text, Georgia, serif); color: #e8e6df; }
  #tr .end .small { font: 800 calc(var(--u) * 1.9) / 1 var(--display); color: #9fb0b8; letter-spacing: 0.14em; text-transform: uppercase; }
  #tr .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const root = document.createElement('div')
  root.id = 'tr'
  document.body.append(root)
  // Portrait (Reels, Shorts): bigger type, and captions lifted clear of the
  // app's own buttons and caption along the bottom.
  const setUnit = () => {
    const portrait = innerHeight > innerWidth * 1.3
    document.body.classList.toggle('portrait', portrait)
    document.documentElement.style.setProperty('--u', `${portrait ? innerWidth / 78 : Math.min(innerWidth, innerHeight) / 100}px`)
  }
  setUnit()
  addEventListener('resize', setUnit)

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  const lerp = (a, b, k) => a + (b - a) * k
  const V = (o) => ({ x: o.x, y: o.y, z: o.z })

  const T = {
    shot: null,
    t: 0,
    els: [],
    /** Start a shot: { dur, cam?, tick?, caps: [{ at, until?, pos, kick?, html }], end?, mark?, clean?, flashIn? } */
    begin(shot) {
      this.shot = shot
      if (!shot.cam) {
        const cam = window.__lockedUp.engine.camera
        if (cam.fov !== 42) {
          cam.fov = 42
          cam.updateProjectionMatrix()
        }
      }
      this.t = 0
      root.innerHTML = ''
      this.els = []
      document.body.classList.toggle('clean', shot.clean !== false)
      document.body.classList.toggle('nobubbles', !!shot.nobubbles)
      if (shot.mark !== false) root.insertAdjacentHTML('beforeend', '<div class="mark"><i></i>LOCKED UP</div>')
      for (const c of shot.caps || []) {
        const el = document.createElement('div')
        el.className = `cap ${c.pos || 'low'}`
        el.innerHTML = `${c.kick ? `<div class="kick">${c.kick}</div>` : ''}${c.html ? `<div class="line">${c.html}</div>` : ''}`
        el.style.opacity = '0'
        root.append(el)
        this.els.push({ el, c })
      }
      if (shot.end) {
        const el = document.createElement('div')
        el.className = 'end'
        el.innerHTML = shot.end
        el.style.opacity = '0'
        root.append(el)
        this.els.push({ el, c: { at: shot.endAt ?? 0.2, until: shot.dur + 1, end: true } })
      }
      const flash = document.createElement('div')
      flash.className = 'flash'
      root.append(flash)
      this.flash = flash
    },
    /** Called from the game's frame, with game-frame delta. */
    tick(cam, dt) {
      const s = this.shot
      if (!s) return false
      this.t += dt
      const t = this.t
      const g = window.__lockedUp.game
      if (s.tick) s.tick(g, t, dt)
      // Captions: rise and fade in, fade out at the end of their time.
      for (const { el, c } of this.els) {
        const until = c.until ?? s.dur
        const kin = Math.max(0, Math.min(1, (t - c.at) / 0.28))
        const kout = Math.max(0, Math.min(1, (until - t) / 0.2))
        const k = Math.min(ease(kin), kout)
        el.style.opacity = String(k)
        if (!c.end) {
          const rise = (1 - ease(kin)) * 3
          const base = c.pos === 'mid' ? 'translateY(-50%) ' : ''
          el.style.transform = `${base}translateY(calc(var(--u) * ${rise})) scale(${0.96 + 0.04 * ease(kin)})`
        }
      }
      this.flash.style.opacity = String(s.flashIn ? Math.max(0, 0.85 - t * 5) : 0)
      if (!s.cam) return false
      const k = ease(Math.max(0, Math.min(1, t / s.dur)))
      const c0 = s.cam
      const f = c0.rel ? (window.__S && window.__S.focus) || { x: 0, z: 0 } : { x: 0, z: 0 }
      const off = (o) => (o ? { x: o.x + f.x, y: o.y, z: o.z + f.z } : o)
      const c = { from: off(c0.from), to: off(c0.to), lookFrom: off(c0.lookFrom), lookTo: off(c0.lookTo), fov: c0.fov }
      cam.position.set(lerp(c.from.x, c.to.x, k), lerp(c.from.y, c.to.y, k), lerp(c.from.z, c.to.z, k))
      const la = c.lookFrom, lb = c.lookTo || c.lookFrom
      cam.lookAt(lerp(la.x, lb.x, k), lerp(la.y, lb.y, k), lerp(la.z, lb.z, k))
      const fov = c.fov ?? 42
      if (cam.fov !== fov) {
        cam.fov = fov
        cam.updateProjectionMatrix()
      }
      return true
    },
  }
  window.__T = T
  window.__film = (cam, dt) => T.tick(cam, dt)
})()
