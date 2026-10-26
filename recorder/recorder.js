/*
 * Grim-on-the-Moor Voice Studio: record every spoken line in Locked Up.
 *
 * The browser's own MediaRecorder captures the microphone; each take is
 * decoded, trimmed of silence at both ends, mixed to mono and encoded to MP3
 * with lamejs, then kept in this browser's IndexedDB so a session can be
 * picked up later. JSZip bundles every take as <key>.mp3 for the game's
 * public/voices folder.
 */
;(() => {
  const LINES = JSON.parse(document.getElementById('lines').textContent)
  const takes = new Map() // key -> { blob, seconds, at }
  const urls = new Map() // key -> object URL for playback
  let filter = 'All' // one character, or All
  let group = 'All' // Officers, Prisoners, Bosses, Named characters, or All
  let todoOnly = false
  /** 'who': grouped by character. 'heard': the lines players hear most, first. */
  let order = 'who'
  try {
    order = localStorage.getItem('grim-voice-studio.order') || 'who'
  } catch {}
  /** Lines recorded since the page opened stay on screen under "Still to
   *  record", so a take never vanishes before you have heard it. */
  const fresh = new Set()
  let player = null
  let recording = null // { key, recorder, chunks, started, timer }
  let stream = null
  let audioCtx = null

  const docId = (key) => key.replace(/[^A-Za-z0-9_-]/g, '_')
  const GROUPS = ['Officers', 'Prisoners', 'Bosses', 'Named characters']
  const groupOf = (l) => l.group || 'Named characters'
  const short = (s) => s.replace(/ \(.*\)$/, '')
  const role = (s) => (/ \((.*)\)$/.exec(s) || [])[1] || ''
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const slots = { target: 'a name', wing: 'a wing', cell: 'a cell', time: 'a time', giver: 'a name', name: 'their name', someone: 'a name', officer: 'an officer', thing: '...' }
  const lineHtml = (t) => esc(t).replace(/\{(\w+)\}/g, (_m, k) => `<span class="slot">${slots[k] || k}</span>`)

  // ---- Storage: IndexedDB, so takes survive closing the page ----

  const DB = new Promise((resolve) => {
    try {
      const open = indexedDB.open('grim-voice-studio', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('takes')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  async function store(mode, fn) {
    const db = await DB
    if (!db) return null
    return new Promise((resolve, reject) => {
      const tx = db.transaction('takes', mode)
      const req = fn(tx.objectStore('takes'))
      tx.oncomplete = () => resolve(req && req.result)
      tx.onerror = () => reject(tx.error)
    })
  }
  const saveTake = (key, take) => store('readwrite', (s) => s.put(take, key))
  const dropTake = (key) => store('readwrite', (s) => s.delete(key))
  async function loadAll() {
    const db = await DB
    if (!db) return
    await new Promise((resolve) => {
      const tx = db.transaction('takes', 'readonly')
      const req = tx.objectStore('takes').openCursor()
      req.onsuccess = () => {
        const c = req.result
        if (!c) return resolve()
        takes.set(c.key, c.value)
        c.continue()
      }
      req.onerror = () => resolve()
    })
  }

  // ---- Rendering ----

  function chip(label, pressed, onclick, cls) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    if (cls) b.className = cls
    b.setAttribute('aria-pressed', String(pressed))
    b.onclick = onclick
    return b
  }

  function renderFilters() {
    const el = document.getElementById('filters')
    el.innerHTML = ''
    // First choose a kind of character...
    const top = document.createElement('div')
    top.className = 'row'
    for (const g of ['All', ...GROUPS]) {
      const n = new Set(LINES.filter((l) => g === 'All' || groupOf(l) === g).map((l) => l.speaker)).size
      top.append(chip(g === 'All' ? 'Everyone' : `${g} (${n})`, group === g, () => { group = g; filter = 'All'; render() }))
    }
    top.append(chip('Most heard first', order === 'heard', () => {
      order = order === 'heard' ? 'who' : 'heard'
      try {
        localStorage.setItem('grim-voice-studio.order', order)
      } catch {}
      render()
    }, 'todo'))
    top.append(chip('Still to record', todoOnly, () => { todoOnly = !todoOnly; fresh.clear(); render() }))
    el.append(top)
    if (group === 'All') return
    // ...then one of them, to do a whole voice in one sitting.
    const names = document.createElement('div')
    names.className = 'row names'
    names.setAttribute('aria-label', `${group} by name`)
    const people = [...new Set(LINES.filter((l) => groupOf(l) === group).map((l) => l.speaker))].sort((a, b) => short(a).localeCompare(short(b)))
    names.append(chip(`All ${group.toLowerCase()}`, filter === 'All', () => { filter = 'All'; render() }))
    for (const sp of people) {
      const all = LINES.filter((l) => l.speaker === sp)
      const done = all.filter((l) => takes.has(l.key)).length
      const b = chip('', filter === sp, () => { filter = sp; render(); document.getElementById('script').scrollIntoView({ block: 'start' }) })
      b.innerHTML = `${esc(short(sp))} <small>${done}/${all.length}</small>`
      if (done === all.length) b.dataset.done = 'true'
      names.append(b)
    }
    el.append(names)
  }

  function renderTally() {
    const done = LINES.filter((l) => takes.has(l.key)).length
    document.getElementById('tally').textContent = `${done} of ${LINES.length}`
    document.getElementById('tally-note').textContent = done === LINES.length ? 'all recorded. Download them.' : 'lines recorded'
    document.getElementById('meter').style.width = `${(done / LINES.length) * 100}%`
    document.getElementById('zip').disabled = done === 0
    document.getElementById('zip-note').textContent = done ? `${done} take${done === 1 ? '' : 's'} saved on this device.` : 'Nothing recorded yet.'
  }

  function render() {
    renderFilters() // the names show each voice's progress
    renderTally()
    const main = document.getElementById('script')
    const shown = LINES.filter((l) => (filter === 'All' ? group === 'All' || groupOf(l) === group : l.speaker === filter) && (!todoOnly || !takes.has(l.key) || fresh.has(l.key) || recording?.key === l.key))
    if (!shown.length) {
      main.innerHTML = '<p class="empty">Nothing left to record here.</p>'
      return
    }
    main.innerHTML = ''
    if (order === 'heard') {
      // One list, the lines a player hears most at the top; lines nobody
      // heard in the test games keep their usual order underneath.
      const ranked = shown.map((l, i) => [l, i]).sort((a, b) => (b[0].heard || 0) - (a[0].heard || 0) || a[1] - b[1]).map(([l]) => l)
      const sec = document.createElement('section')
      sec.className = 'who'
      sec.innerHTML = `<h2>Most heard first</h2><p class="role">From a few days of test games: how often a player hears each line. Record from the top and the game starts to sound like itself soonest.</p>`
      for (const l of ranked) sec.append(card(l, true))
      main.append(sec)
      return
    }
    const groups = new Map()
    for (const l of shown) {
      if (!groups.has(l.speaker)) groups.set(l.speaker, [])
      groups.get(l.speaker).push(l)
    }
    for (const [speaker, lines] of groups) {
      const sec = document.createElement('section')
      sec.className = 'who'
      const all = LINES.filter((l) => l.speaker === speaker)
      const done = all.filter((l) => takes.has(l.key)).length
      sec.innerHTML = `<h2>${esc(short(speaker))}<span class="count">${done} of ${all.length}</span></h2>${role(speaker) ? `<p class="role">${esc(role(speaker))}</p>` : ''}`
      for (const l of lines) sec.append(card(l))
      main.append(sec)
    }
  }

  function card(l, withSpeaker) {
    const id = docId(l.key)
    const take = takes.get(l.key)
    const live = recording?.key === l.key
    const a = document.createElement('article')
    a.className = 'line' + (live ? ' armed' : '')
    a.id = `line-${id}`
    a.dataset.done = take ? 'true' : 'false'
    a.innerHTML = `
      <div class="key"><span>${esc(l.key)}</span><span class="state">${live ? 'Recording' : take ? `Recorded, ${take.seconds.toFixed(1)}s` : 'Not yet'}</span></div>
      <p class="meta">${withSpeaker ? `<b>${esc(short(l.speaker))}</b> · ` : ''}${l.heard ? `heard about ${l.heard} time${l.heard === 1 ? '' : 's'} a day` : 'rarely heard, or only on a job'}</p>
      <blockquote>${lineHtml(l.line)}</blockquote>
      ${take && !live ? `<audio controls preload="none" src="${url(l.key)}"></audio>` : ''}
      <div class="actions">
        ${live
          ? `<button type="button" class="btn rec" id="rec-${id}"><span class="dot"></span>Stop <span class="timer" id="t-${id}">0.0s</span></button><span class="level" aria-hidden="true"><i id="lv-${id}"></i></span>`
          : `<button type="button" class="btn" id="rec-${id}" ${recording ? 'disabled' : ''}>${take ? 'Record again' : 'Record'}</button>`}
        ${take && !live ? `<button type="button" class="btn alt" id="play-${id}">Play</button><a class="btn alt" href="${url(l.key)}" download="${esc(l.key)}.mp3">Save MP3</a><button type="button" class="btn quiet" id="del-${id}">Delete take</button>` : ''}
        <span class="status" id="st-${id}"></span>
      </div>`
    a.querySelector(`#rec-${id}`).onclick = () => (live ? stop() : start(l))
    const play = a.querySelector(`#play-${id}`)
    if (play) play.onclick = () => playTake(l.key)
    const del = a.querySelector(`#del-${id}`)
    if (del) del.onclick = async () => {
      await dropTake(l.key)
      forget(l.key)
      render()
    }
    return a
  }

  function playTake(key) {
    if (player) player.pause()
    player = new Audio(url(key))
    player.play().catch(() => status(key, 'Tap Play to hear it.'))
  }

  function url(key) {
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(takes.get(key).blob))
    return urls.get(key)
  }
  function forget(key) {
    if (urls.has(key)) URL.revokeObjectURL(urls.get(key))
    urls.delete(key)
    takes.delete(key)
  }
  function status(key, text, bad) {
    const el = document.getElementById(`st-${docId(key)}`)
    if (el) {
      el.textContent = text
      el.className = 'status' + (bad ? ' bad' : '')
    }
  }

  // ---- Recording ----

  function pickType() {
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || ''
  }

  async function start(l) {
    if (recording) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status(l.key, 'This browser cannot record. Open the page in Safari or Chrome on your phone.', true)
      return
    }
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      if (!stream || !stream.active) stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (e) {
      status(l.key, e && e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the browser settings for this site, then try again.' : 'Could not open the microphone.', true)
      return
    }
    const type = pickType()
    const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream)
    const chunks = []
    recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data)
    recorder.onstop = () => finish(l, new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }))
    // A live level meter, so you can see it is hearing you.
    const src = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    recording = { key: l.key, recorder, started: performance.now(), raf: 0, src }
    recorder.start()
    render()
    document.getElementById(`line-${docId(l.key)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const tick = () => {
      if (!recording) return
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      const t = document.getElementById(`t-${docId(l.key)}`)
      if (t) t.textContent = `${((performance.now() - recording.started) / 1000).toFixed(1)}s`
      const lv = document.getElementById(`lv-${docId(l.key)}`)
      if (lv) lv.style.width = `${Math.min(100, peak * 140)}%`
      recording.raf = requestAnimationFrame(tick)
    }
    tick()
    // Nobody's line is a minute long.
    recording.limit = setTimeout(() => stop(), 60000)
  }

  function stop() {
    if (!recording) return
    cancelAnimationFrame(recording.raf)
    clearTimeout(recording.limit)
    try { recording.src.disconnect() } catch {}
    if (recording.recorder.state !== 'inactive') recording.recorder.stop()
  }

  async function finish(l, raw) {
    recording = null
    render()
    status(l.key, 'Making the MP3...')
    try {
      const mp3 = await toMp3(raw)
      const take = { blob: mp3.blob, seconds: mp3.seconds, at: new Date().toISOString() }
      forget(l.key)
      takes.set(l.key, take)
      fresh.add(l.key)
      await saveTake(l.key, take)
      render()
      status(l.key, 'Saved. Playing it back...')
      playTake(l.key)
      document.getElementById(`line-${docId(l.key)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch (e) {
      render()
      status(l.key, 'That take did not save. Try again.', true)
      console.error(e)
    }
  }

  // ---- Encoding: decode, trim the silence, mono, MP3 ----

  function decode(buf) {
    return new Promise((resolve, reject) => {
      const p = audioCtx.decodeAudioData(buf, resolve, reject)
      if (p && p.then) p.then(resolve, reject)
    })
  }

  async function toMp3(blob) {
    const audio = await decode(await blob.arrayBuffer())
    const rate = audio.sampleRate
    const mono = new Float32Array(audio.length)
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const d = audio.getChannelData(c)
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels
    }
    // Trim the silence (and the tap) at both ends, keeping a little air.
    let peak = 0
    for (const v of mono) peak = Math.max(peak, Math.abs(v))
    const gate = Math.max(0.02, peak * 0.08)
    const pad = Math.round(rate * 0.12)
    let a = 0
    let b = mono.length - 1
    while (a < b && Math.abs(mono[a]) < gate) a++
    while (b > a && Math.abs(mono[b]) < gate) b--
    a = Math.max(0, a - pad)
    b = Math.min(mono.length - 1, b + pad)
    const cut = mono.subarray(a, b + 1)
    // Lift quiet takes towards a steady level.
    const gain = peak > 0 ? Math.min(3, 0.9 / peak) : 1
    const pcm = new Int16Array(cut.length)
    for (let i = 0; i < cut.length; i++) pcm[i] = Math.max(-1, Math.min(1, cut[i] * gain)) * 0x7fff
    const enc = new lamejs.Mp3Encoder(1, rate, 96)
    const parts = []
    for (let i = 0; i < pcm.length; i += 1152) {
      const out = enc.encodeBuffer(pcm.subarray(i, i + 1152))
      if (out.length) parts.push(new Uint8Array(out))
    }
    const end = enc.flush()
    if (end.length) parts.push(new Uint8Array(end))
    return { blob: new Blob(parts, { type: 'audio/mpeg' }), seconds: cut.length / rate }
  }

  // ---- Download everything ----

  document.getElementById('zip').onclick = async () => {
    const note = document.getElementById('zip-note')
    note.textContent = 'Packing the takes...'
    const zip = new JSZip()
    const folder = zip.folder('voices')
    for (const l of LINES) {
      const t = takes.get(l.key)
      if (t) folder.file(`${l.key}.mp3`, t.blob)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'locked-up-voices.zip'
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
    note.textContent = `Downloaded ${takes.size} take${takes.size === 1 ? '' : 's'} as locked-up-voices.zip.`
  }

  renderFilters()
  render()
  loadAll().then(render)
})()
