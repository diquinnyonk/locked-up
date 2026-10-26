import { Color, Vector3 } from 'three'
import { HEX, SUN_DIRECTION, color } from './art/palette'
import { setToonSunDirection, setWorldTint } from './art/toonMaterial'
import { Engine } from './core/Engine'
import { Pad } from './core/Pad'
import { Game } from './game/Game'
import type { Mode } from './npc/Memory'
import { CelPipeline } from './render/CelPipeline'
import { Ui } from './ui/Ui'
import { Sfx } from './audio/Sfx'
import { buildTouchControls } from './ui/Touch'
import { Voice } from './audio/Voice'
import { writeVolumes } from './audio/Soundscape'
import { playIntro } from './ui/Intro'
import { playTour, tourSeen } from './ui/Tour'
import { Tile } from './world/Grid'
import { People } from './render/People'
import { ACHIEVEMENTS, achieveAtEnd } from './game/Achievements'
import { noteStarted, readRecords, recordDaily, recordEnding } from './game/Records'
import { dailyFor, dailyMet, describeDaily, prettyDate, todayKey } from './game/Daily'
import { showRecords } from './ui/RecordsView'
import { type SaveFile, clearSave, downloadSave, pickSaveFile, readSave, writeSave } from './game/Save'

/**
 * Locked Up. A UK prison break, drawn in Windward's cel style: banded toon
 * light, inverted-hull outlines on everyone, and screen-space ink on the
 * building, all from one palette.
 */
const canvas = document.getElementById('viewport') as HTMLCanvasElement
const engine = new Engine(canvas)
const pipeline = new CelPipeline(1, 1)
engine.onResized((w, h) => pipeline.setSize(w, h))
engine.onRender((renderer, scene, camera) => pipeline.render(renderer, scene, camera))

const sun = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - SUN_DIRECTION.elevation, SUN_DIRECTION.azimuth)
setToonSunDirection(sun)

const ui = new Ui()
const sfx = new Sfx()
const voice = new Voice()
// A saved game rebuilds the same prison from its seed; the daily challenge
// builds today's prison, the same one for everyone.
const params = new URLSearchParams(location.search)
const daily = params.has('daily') ? dailyFor(todayKey()) : null
const saved = daily ? null : readSave()
Game.seedForNext = daily?.seed ?? saved?.seed ?? null
const game = new Game(engine.scene, ui, 'Prisoner')
// December, or ?season=christmas: snow, a tree, the panto.
game.season = new Date().getMonth() === 11 || new URLSearchParams(location.search).get('season') === 'christmas' ? 'christmas' : 'none'
const fogEl = document.getElementById('fog') as HTMLElement
// Rigged, animated characters in place of the jointed figures. If anything
// about them fails to build, the jointed crowd simply stays.
try {
  game.useCrowd(new People(game.bodies.length))
} catch (e) {
  console.warn('Rigged characters unavailable, keeping the jointed crowd.', e)
}
game.input.enabled = false
let started = false

const form = document.getElementById('name-form') as HTMLFormElement
const nameInput = document.getElementById('name') as HTMLInputElement
if (saved) {
  const s = saved.summary
  document.getElementById('carry-on')!.hidden = false
  document.getElementById('or-new')!.hidden = false
  document.getElementById('carry-name')!.textContent = s.name
  document.getElementById('carry-detail')!.textContent = `Day ${s.day}, ${s.time}. ${s.attemptsLeft} of ${s.perRound ?? 4} attempts left, round ${s.round} of ${s.rounds ?? 2}. ${s.mode ? s.mode.charAt(0).toUpperCase() + s.mode.slice(1) : s.hard ? 'Hard' : 'Normal'}.`
  const carry = document.getElementById('carry-btn') as HTMLButtonElement
  carry.onclick = () => {
    sfx.unlock()
    document.getElementById('start')!.classList.add('gone')
    begin(saved)
  }
  carry.focus()
} else nameInput.focus()
// A save file from another device, or kept from earlier: it becomes the
// saved game and the page starts again to build its prison.
document.getElementById('load-file')!.onclick = () =>
  pickSaveFile((result) => {
    if (typeof result === 'string') document.getElementById('load-note')!.textContent = result
    else location.reload()
  })
document.getElementById('title-records')!.onclick = () => showRecords()
// Today's challenge: what it is, your best so far, and the way in.
{
  const today = dailyFor(todayKey())
  const best = readRecords().daily?.[today.date]
  document.getElementById('daily-text')!.textContent = `${prettyDate(today.date)}: the same prison for everyone today. ${describeDaily(today)}${saved ? ' Starting it replaces your saved game.' : ''}`
  document.getElementById('daily-best')!.textContent = best ? `${best.met ? 'Done' : 'Not yet done'}: ${best.tries} tr${best.tries === 1 ? 'y' : 'ies'}, best day ${best.day}, ${best.fails} failed attempt${best.fails === 1 ? '' : 's'}.` : ''
  document.getElementById('daily-btn')!.onclick = () => {
    params.set('daily', '1')
    location.search = params.toString()
  }
  document.getElementById('daily-back')!.onclick = () => {
    params.delete('daily')
    location.search = params.toString()
  }
  if (daily) {
    document.body.classList.add('daily')
    nameInput.placeholder = 'Your name for the daily challenge'
  }
}
form.addEventListener('submit', (e) => {
  e.preventDefault()
  // A new sentence replaces the old save.
  clearSave()
  if (daily) {
    game.daily = daily
    game.mode = 'normal'
  }
  const name = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 18) || 'Prisoner'
  game.player.name = name
  game.mode = ((form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value ?? 'normal') as Mode
  nameInput.blur()
  sfx.unlock()
  document.getElementById('start')!.classList.add('gone')
  // How you ended up here. Skippable, and only once per sentence.
  playIntro(name, () => begin(null))
})

function begin(save: SaveFile | null): void {
  if (save) game.fromSave(save.state)
  else {
    noteStarted()
    game.clock.minutes = 8 * 60 - 20
    game.startSentence()
  }
  game.input.enabled = true
  game.input.clear()
  started = true
  snap = true
  ui.attach(game)
  ui.onSave = () => save_()
  ui.onVolumes = (v) => {
    sfx.setVolumes(v)
    writeVolumes(v)
  }
  ui.onDownload = () => {
    save_()
    const file = readSave()
    if (file) downloadSave(file)
    return !!file
  }
  ui.onImport = () => {
    if (!confirm('Loading a save file replaces the game you are playing now. Carry on?')) return
    pickSaveFile((result) => {
      if (typeof result === 'string') ui.toast(result, 'bad')
      else {
        importing = true
        location.reload()
      }
    })
  }
  ui.onClose = () => {
    game.endConversation()
    voice.stop()
  }
  ui.onSpeak = (key) => voice.play(key)
  ui.onRemark = (key) => voice.remark(key)
  buildTouchControls(game.input, () => ui.toggleMenu('main'))
  document.getElementById('menubtn')!.onclick = () => ui.toggleMenu('main')
  document.getElementById('mapbtn')!.onclick = () => ui.toggleMap()
  document.getElementById('minimap')!.onclick = () => ui.toggleMap()
  ui.onTour = () => tour(() => {})
  if (save) {
    ui.savedAt = `day ${save.summary.day}, ${save.summary.time}`
    ui.card(`Welcome back, ${game.player.name}`, `Day ${save.summary.day}, ${save.summary.time}. Right where you left off: your pockets, your stash, your jobs, and everything the prison has learned about you.`, 8)
    return
  }
  // The first time, a walk round the screen before anything else.
  if (tourSeen()) welcome()
  else tour(welcome)
}

/** Saves if things are quiet enough, and remembers when. */
function save_(): boolean {
  if (importing || !started || game.over || !writeSave(game)) return false
  const m = game.clock.minuteOfDay
  ui.savedAt = `day ${game.clock.day}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
  return true
}
let saveTimer = 20
let lastTick = performance.now()
/** A save file has just been loaded: never overwrite it on the way out. */
let importing = false
let ended = false
// Leaving the page (closing the tab, switching away on a phone): save if we can.
addEventListener('pagehide', () => save_())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save_()
})

/** The tour, with the prison holding its breath until it is done. */
function tour(after: () => void): void {
  ui.paused = true
  game.input.enabled = false
  ui.hideCard()
  playTour(game.player.name, game.hard, () => {
    ui.paused = false
    game.input.enabled = true
    game.input.clear()
    after()
  })
}

function welcome(): void {
  // The tour is over: a checklist to get going with.
  game.goals.shown = true
  const name = game.player.name
  ui.card(
    `${name}, the Greggs Bandit`,
    `Welcome to HMP Grim-on-the-Moor. You share cell A8 with ${game.cellmate?.name ?? 'a stranger'}.\nGet out of your cell, get out of the wing, get over the wall, and have someone waiting when you do.\nOut of bounds only counts as an attempt once an officer sees you, and if you make it back to your cell it never happened.${game.hard ? '' : ' The pale shapes on the floor are what each officer can see.'}\nEvery control is in the Notebook (J, or Menu) under How to play.`,
    30,
  )
}

;(window as unknown as { __lockedUp: unknown }).__lockedUp = { game, engine, pipeline }

const day = new Color(1, 1, 1)
const night = new Color(0.4, 0.46, 0.72)
const tint = new Color()
const skyDay = color(HEX.sky).clone()
const skyNight = color(HEX.night).clone()
const clear = new Color()
const camTarget = new Vector3()
const camPos = new Vector3()
let orbit = 0
let snap = false
let talkCam = false

// A game controller: it walks you in play and drives whatever menu is up.
const pad = new Pad(game.input)
const SURNAMES = ['Barraclough', 'Higgins', 'Pickles', 'Shufflebottom', 'Entwistle', 'Ramsbottom', 'Clegg', 'Haworth']
pad.onFirstUse = () => {
  // Nobody types a name with a thumb stick.
  if (!started && !nameInput.value) nameInput.value = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
  ui.toast('Controller ready. Stick or d-pad to move round menus, A to press, B to go back.', 'good')
}
const overlayUp = () =>
  [...document.querySelectorAll<HTMLElement>('#tour, #story:not([hidden]), #records:not([hidden]), #end.show')].some((el) => el.getBoundingClientRect().width > 0)

engine.onUpdate((delta) => {
  pad.poll(delta, !started || ui.panelOpen || ui.paused || game.over || overlayUp())
  // Keys that work whatever is going on.
  if (started) {
    if (game.input.take('pause')) {
      if (ui.panelOpen) ui.closePanels()
      else {
        ui.paused = !ui.paused
        if (ui.paused) ui.card('Paused', 'Press Esc to carry on.', 9999)
        else ui.hideCard()
      }
    }
    if (game.input.take('craft')) ui.toggleCraft()
    if (game.input.take('journal')) ui.toggleJournal()
    if (game.input.take('map')) ui.toggleMap()
  }

  if (!ui.paused) game.update(started ? delta : delta * 0.5)

  // Autosave every twenty seconds when things are quiet; a finished
  // sentence leaves nothing to carry on.
  if (started && !game.over) {
    saveTimer -= delta
    if (saveTimer <= 0) {
      saveTimer = 20
      save_()
    }
  }
  // Real time played, by the wall clock (frames are capped on slow
  // devices); a gap of over a second is the tab asleep, not play.
  const now = performance.now()
  if (started && !game.over && !ui.paused) game.playSeconds += Math.min(1, (now - lastTick) / 1000)
  lastTick = now
  if (game.over && !ended) {
    ended = true
    clearSave()
    // File the ending, and say on the end screen if it was a new one.
    if (game.ending) {
      const run = { name: game.player.name, seconds: game.playSeconds, fails: game.memory.totalFailures, day: game.clock.day, hard: game.hard, mode: game.mode }
      ui.endRecord(recordEnding(game.ending.id, run), run)
      let met = false
      if (game.daily) {
        met = dailyMet(game.daily, game.ending.won, run.day, run.fails)
        const { best } = recordDaily(game.daily.date, { met, day: run.day, fails: run.fails, seconds: run.seconds })
        ui.endDaily(met, best, describeDaily(game.daily))
      }
      for (const id of achieveAtEnd({ won: game.ending.won, fails: run.fails, day: run.day, mode: game.mode, dailyMet: met })) {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!
        ui.achievement(a.title, a.text)
      }
    }
  }

  // Light: day, dusk, night; the vents are dark.
  const dark = game.clock.darkness
  tint.copy(day).lerp(night, dark)
  if (game.player.inVent) tint.multiplyScalar(0.42)
  setWorldTint(tint)
  clear.copy(skyDay).lerp(skyNight, dark)
  engine.renderer.setClearColor(clear)
  const hunted = game.alarm.active || game.guards.some((g) => g.chasing)
  sfx.setAlarm(hunted && started && !game.over)
  // Fog: thick outside, a haze through the windows inside.
  const outside = game.player.zone === 'yard' || game.player.zone === 'outside'
  fogEl.style.opacity = started && game.weather === 'fog' && !game.player.inVent ? (outside ? '0.85' : '0.25') : '0'
  sfx.scene({
    weather: game.weather,
    zone: game.player.zone,
    night: game.clock.darkness > 0.6 || game.clock.period === 'lightsOut',
    vent: game.player.inVent,
    tension: started ? Math.max(0, ...game.guards.map((g) => g.suspicion)) : 0,
    chase: hunted && started && !game.over,
    title: !started,
  })
  for (const s of game.sounds) sfx.play(s.sound, s.volume)
  game.sounds.length = 0
  pipeline.vignette = hunted ? 1 : Math.max(...game.guards.map((g) => g.suspicion)) * 0.6
  pipeline.flash(game.flash > 0 ? HEX.visionAlert : HEX.visionAlert, game.flash)

  // Camera: a steep three-quarter view that follows you; it orbits the yard
  // under the title screen.
  const cam = engine.camera
  if (!started) {
    orbit += delta * 0.06
    camTarget.set(80 + Math.cos(orbit) * 30, 0, 75 + Math.sin(orbit) * 20)
    camPos.set(camTarget.x + Math.sin(orbit) * 50, 62, camTarget.z + Math.cos(orbit) * 50)
    cam.position.lerp(camPos, 0.05)
    cam.lookAt(camTarget)
  } else if (game.talkingTo) {
    // Over your shoulder, looking at whoever is talking, the way a film
    // shoots a conversation. Pulled in if a wall is in the way.
    const p = game.player.body
    const n = game.talkingTo
    let dx = p.x - n.x
    let dz = p.z - n.z
    const d = Math.max(0.01, Math.hypot(dx, dz))
    dx /= d
    dz /= d
    const rx = dz
    const rz = -dx
    let chosen = { x: p.x + dx * 1.5 + rx * 1.7, z: p.z + dz * 1.5 + rz * 1.7 }
    for (const [back, side] of [[1.5, 1.7], [1.5, -1.7], [1.1, 1.4], [1.1, -1.4], [0.8, 1.1], [0.8, -1.1], [0.4, 0.9]]) {
      const c = { x: p.x + dx * back + rx * side, z: p.z + dz * back + rz * side }
      const t = game.grid.tile(Math.floor(c.x / 2), Math.floor(c.z / 2))
      if (t === Tile.Floor || t === Tile.Outside || t === Tile.Door) {
        chosen = c
        break
      }
    }
    // Aimed a little below the face, so it sits in the upper half of the
    // frame, clear of the subtitles.
    camPos.set(chosen.x, n.y + 2.55, chosen.z)
    camTarget.set(n.x, n.y + 1.2, n.z)
    cam.position.lerp(camPos, Math.min(1, delta * 7))
    cam.lookAt(camTarget)
    if (cam.fov !== 34) {
      cam.fov = 34
      cam.updateProjectionMatrix()
    }
    talkCam = true
  } else {
    if (talkCam) {
      talkCam = false
      cam.fov = 42
      cam.updateProjectionMatrix()
      snap = true
    }
    const b = game.player.body
    const vent = game.player.inVent
    const height = vent ? 17 : 21
    const back = vent ? 8.5 : 11.5
    camTarget.lerp(new Vector3(b.x, b.y * 0.5, b.z - 0.6), snap ? 1 : Math.min(1, delta * 6))
    camPos.set(camTarget.x, camTarget.y + height, camTarget.z + back)
    cam.position.lerp(camPos, snap ? 1 : Math.min(1, delta * 5))
    snap = false
    cam.lookAt(camTarget)
  }
  document.body.classList.toggle('talking', !!game.talkingTo)
  ui.update(delta, cam)
})

engine.start()
