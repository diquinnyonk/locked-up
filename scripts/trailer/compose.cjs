// node compose.cjs <cuts.json> <out.wav>
// Scores a trailer cut in the game's own synth palette (D minor, the day
// progression Dm Bb F C), at 120 BPM, with hits and effects timed to shots.
const { chromium } = require('playwright')
const fs = require('fs')

;(async () => {
  const [cutsFile, outFile] = process.argv.slice(2)
  const cuts = JSON.parse(fs.readFileSync(cutsFile, 'utf8')).cuts
  const b = await chromium.launch()
  const p = await b.newPage()
  const b64 = await p.evaluate(async (cuts) => {
    const SR = 48000
    const total = cuts.reduce((t, c) => Math.max(t, c.start + c.dur), 0) + 1.5
    const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR)
    const BEAT = 0.5
    const BAR = BEAT * 4
    const D2 = 73.42
    const D3 = 146.83
    const hz = (base, semis) => base * Math.pow(2, semis / 12)
    const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]]
    const NIGHT = [[0, 3, 7], [-5, -2, 3], [-4, 0, 3], [-5, -2, 3]]

    // Master: glue compressor, then out.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.18
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(comp)
    comp.connect(ctx.destination)
    // A room for pads and stingers.
    const verbIn = ctx.createGain()
    const conv = ctx.createConvolver()
    const irLen = SR * 2.6
    const ir = ctx.createBuffer(2, irLen, SR)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2)
    }
    conv.buffer = ir
    const verbOut = ctx.createGain()
    verbOut.gain.value = 0.28
    verbIn.connect(conv)
    conv.connect(verbOut)
    verbOut.connect(master)
    // Buses.
    const bus = (gain, verb = 0) => {
      const g = ctx.createGain()
      g.gain.value = gain
      g.connect(master)
      if (verb) {
        const s = ctx.createGain()
        s.gain.value = verb
        g.connect(s)
        s.connect(verbIn)
      }
      return g
    }
    const drums = bus(0.7, 0.05)
    const bass = bus(0.95)
    const pads = bus(0.62, 0.6)
    const lead = bus(0.34, 0.5)
    const fx = bus(0.6, 0.25)

    const noise = ctx.createBuffer(1, SR * 2, SR)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    const env = (g, t, a, peak, d, end = 0.0001) => {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + a)
      g.gain.exponentialRampToValueAtTime(end, t + a + d)
    }
    const osc = (type, f, t, dur, out, peak, a = 0.005, d = dur) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      env(g, t, a, peak, d)
      o.connect(g)
      g.connect(out)
      o.start(t)
      o.stop(t + a + d + 0.05)
      return o
    }
    const noiseHit = (t, dur, out, peak, type, freq, q = 1, a = 0.002) => {
      const s = ctx.createBufferSource()
      s.buffer = noise
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      env(g, t, a, peak, dur)
      s.connect(f)
      f.connect(g)
      g.connect(out)
      s.start(t, Math.random(), a + dur + 0.05)
      return f
    }

    // ---- Instruments ----
    const kick = (t, peak = 1) => {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(150, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      const g = ctx.createGain()
      env(g, t, 0.003, peak, 0.32)
      o.connect(g)
      g.connect(drums)
      o.start(t)
      o.stop(t + 0.4)
    }
    const snare = (t, peak = 0.5) => {
      noiseHit(t, 0.18, drums, peak, 'bandpass', 1800, 0.8)
      osc('triangle', 190, t, 0.1, drums, peak * 0.5)
    }
    const hat = (t, peak = 0.12, open = false) => noiseHit(t, open ? 0.22 : 0.05, drums, peak, 'highpass', 7500)
    const boom = (t, peak = 1) => {
      // A cinematic hit: sub drop, noise crack, a ringing low D.
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(90, t)
      o.frequency.exponentialRampToValueAtTime(30, t + 1.2)
      const g = ctx.createGain()
      env(g, t, 0.004, peak, 1.6)
      o.connect(g)
      g.connect(fx)
      o.start(t)
      o.stop(t + 1.8)
      noiseHit(t, 0.5, fx, peak * 0.5, 'lowpass', 1600)
      osc('sawtooth', D2, t, 2.2, pads, peak * 0.35, 0.01, 2.2)
    }
    const riser = (t, dur, peak = 0.35) => {
      const f = noiseHit(t, dur, fx, peak, 'bandpass', 400, 4, dur * 0.95)
      f.frequency.setValueAtTime(300, t)
      f.frequency.exponentialRampToValueAtTime(5000, t + dur)
    }
    const pad = (t, chord, dur, peak = 0.12, base = D3) => {
      for (const [i, s] of chord.entries()) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator()
          o.type = i === 0 ? 'sawtooth' : 'triangle'
          o.frequency.value = hz(base, s)
          o.detune.value = det
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 1400
          const g = ctx.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(peak / (i + 1.4), t + Math.min(0.6, dur * 0.3))
          g.gain.setValueAtTime(peak / (i + 1.4), t + dur - 0.3)
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4)
          o.connect(lp)
          lp.connect(g)
          g.connect(pads)
          o.start(t)
          o.stop(t + dur + 0.5)
        }
      }
    }
    const bassNote = (t, semis, dur = 0.42, peak = 0.5) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = hz(D2, semis)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(900, t)
      lp.frequency.exponentialRampToValueAtTime(180, t + dur)
      const g = ctx.createGain()
      env(g, t, 0.005, peak, dur)
      o.connect(lp)
      lp.connect(g)
      g.connect(bass)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    const pluck = (t, semis, peak = 0.3, base = D3 * 2) => osc('triangle', hz(base, semis), t, 0.35, lead, peak, 0.004, 0.35)
    const clank = (t, peak = 0.5) => {
      for (const f of [420, 1130, 1870]) osc('square', f * (0.95 + Math.random() * 0.1), t, 0.25, fx, peak * 0.18, 0.002, 0.25)
      noiseHit(t, 0.12, fx, peak * 0.4, 'bandpass', 2500, 3)
    }
    const punch = (t, peak = 0.6) => {
      osc('sine', 110, t, 0.12, fx, peak, 0.002, 0.12)
      noiseHit(t, 0.08, fx, peak * 0.6, 'lowpass', 900)
    }
    const siren = (t, dur, peak = 0.07) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 640
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 1.6
      const depth = ctx.createGain()
      depth.gain.value = 160
      lfo.connect(depth)
      depth.connect(o.frequency)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.1)
      g.gain.setValueAtTime(peak, t + dur - 0.2)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(fx)
      o.start(t)
      lfo.start(t)
      o.stop(t + dur)
      lfo.stop(t + dur)
    }
    const neeNaw = (t, dur, peak = 0.05) => {
      // A British fire engine: two tones, a second each.
      for (let k = 0; k * 0.6 < dur; k++) osc('square', k % 2 ? 440 : 587, t + k * 0.6, 0.55, fx, peak, 0.02, 0.55)
    }
    const ghostWhistle = (t, dur, peak = 0.05) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(hz(D3 * 4, 0), t)
      o.frequency.linearRampToValueAtTime(hz(D3 * 4, 3), t + dur * 0.5)
      o.frequency.linearRampToValueAtTime(hz(D3 * 4, -2), t + dur)
      const vib = ctx.createOscillator()
      vib.frequency.value = 5.5
      const vd = ctx.createGain()
      vd.gain.value = 9
      vib.connect(vd)
      vd.connect(o.frequency)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.8)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(lead)
      o.start(t)
      vib.start(t)
      o.stop(t + dur + 0.1)
      vib.stop(t + dur + 0.1)
    }
    const crowd = (t, dur, peak = 0.08) => {
      const f = noiseHit(t, dur, fx, peak, 'bandpass', 650, 0.8, 0.4)
      return f
    }
    const engineRev = (t, dur, peak = 0.12) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(48, t)
      o.frequency.exponentialRampToValueAtTime(120, t + dur * 0.7)
      o.frequency.exponentialRampToValueAtTime(90, t + dur)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 500
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(lp)
      lp.connect(g)
      g.connect(fx)
      o.start(t)
      o.stop(t + dur + 0.05)
    }

    // ---- The score, section by section ----
    // Drum intensity per shot: 0 none, 1 kick only, 2 groove, 3 full.
    const STYLE = {
      aerial: { drums: 0 },
      cell: { drums: 1 },
      landing: { drums: 2 },
      yard: { drums: 2 },
      sneak: { drums: 1, tense: true },
      chase: { drums: 3 },
      talk: { drums: 2, melody: true },
      riot: { drums: 3 },
      vents: { drums: 1, tense: true },
      disguise: { drums: 2, melody: true },
      safe: { drums: 1, tense: true },
      engine: { drums: 3 },
      ghost: { drums: 0, night: true },
      car: { drums: 3 },
      endcard: { drums: 0, end: true },
    }
    let bar = 0
    for (const c of cuts) {
      const st = STYLE[c.name] || { drums: 2 }
      const t0 = c.start
      const t1 = c.start + c.dur
      // A hit on the cut, bigger at the big moments.
      if (['cell', 'chase', 'riot', 'car', 'endcard', 'engine'].includes(c.name)) boom(t0, c.name === 'endcard' ? 1 : 0.7)
      else if (c.name !== 'aerial') kick(t0, 0.8)
      // Chords: one per bar, the day loop or the night loop.
      for (let t = t0; t < t1 - 0.01; t += BAR) {
        const len = Math.min(BAR, t1 - t)
        const prog = st.night ? NIGHT : PROG
        const chord = st.end ? [0, 3, 7, 14] : prog[bar % 4]
        pad(t, chord, st.end ? 4.2 : len, st.end ? 0.16 : st.drums === 0 ? 0.14 : 0.1, st.night ? D3 / 2 : D3)
        // Bass on the eighths under a groove; long notes when quiet.
        if (st.drums >= 2) {
          for (let k = 0; k < len / (BEAT / 2) - 0.01; k++) bassNote(t + k * (BEAT / 2), chord[0] + (k % 4 === 3 ? 12 : 0), 0.22, 0.42)
        } else if (!st.end && !st.night) bassNote(t, chord[0], len * 0.9, 0.35)
        if (st.melody) for (let k = 0; k < 4; k++) if (t + k * BEAT < t1) pluck(t + k * BEAT + (k % 2 ? 0.25 : 0), chord[(k + bar) % 3] + 12, 0.22)
        bar++
      }
      // Drums.
      for (let t = t0, k = 0; t < t1 - 0.01; t += BEAT / 2, k++) {
        const beat = k % 2 === 0
        const n = Math.floor(k / 2)
        if (st.drums >= 1 && beat && (st.drums >= 2 || n % 2 === 0)) kick(t, st.tense ? 0.6 : 0.85)
        if (st.drums >= 2 && beat && n % 2 === 1) snare(t, st.drums >= 3 ? 0.55 : 0.4)
        if (st.drums >= 2) hat(t, beat ? 0.08 : 0.12, !beat && k % 8 === 7)
        if (st.drums >= 3 && !beat) kick(t, 0.35)
        if (st.tense && !beat) osc('sine', D2, t, 0.25, bass, 0.35, 0.01, 0.25)
      }
      // Effects, at the moments they happen on screen.
      switch (c.name) {
        case 'aerial':
          riser(t0 + 0.4, c.dur - 0.4, 0.25)
          noiseHit(t0, c.dur, fx, 0.06, 'lowpass', 300, 0.7, 1.2)
          break
        case 'cell':
          clank(t0 + Math.min(1.5, c.dur * 0.45), 0.8)
          break
        case 'yard':
          crowd(t0, c.dur, 0.06)
          break
        case 'chase':
          siren(t0, c.dur, 0.05)
          break
        case 'riot':
          crowd(t0, c.dur, 0.1)
          for (let k = 0; k < c.dur / 0.3; k++) if (Math.random() < 0.55) punch(t0 + k * 0.3 + Math.random() * 0.1, 0.35)
          break
        case 'vents':
          for (let k = 0; k < 4; k++) clank(t0 + 0.4 + k * (c.dur / 4), 0.25)
          break
        case 'safe':
          for (let k = 0; k < c.dur / 0.25; k++) osc('square', 2400, t0 + k * 0.25, 0.02, fx, 0.06, 0.001, 0.02)
          break
        case 'engine':
          neeNaw(t0, c.dur, 0.04)
          break
        case 'ghost':
          ghostWhistle(t0 + 0.2, c.dur, 0.11)
          riser(t1 - 1.2, 1.2, 0.3)
          break
        case 'car':
          engineRev(t0 + 0.6, c.dur - 0.4, 0.1)
          break
        case 'endcard':
          for (const [i, s] of [12, 15, 19, 24].entries()) pluck(t0 + 0.5 + i * 0.25, s, 0.25)
          break
      }
    }

    const buf = await ctx.startRendering()
    // Peak-normalise to -1 dBFS, then WAV.
    const L = buf.getChannelData(0)
    const R = buf.getChannelData(1)
    let peak = 0
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
    const k = peak > 0 ? 0.89 / peak : 1
    const n = L.length
    const out = new DataView(new ArrayBuffer(44 + n * 4))
    const w = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)))
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ')
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true)
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true)
    w(36, 'data'); out.setUint32(40, n * 4, true)
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true)
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true)
    }
    const bytes = new Uint8Array(out.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  }, cuts)
  fs.writeFileSync(outFile, Buffer.from(b64, 'base64'))
  console.log('wrote', outFile)
  await b.close()
})()
