import { Color, Vector3 } from 'three'
import { HEX, SUN_DIRECTION, color } from './art/palette'
import { setToonSunDirection, setWorldTint } from './art/toonMaterial'
import { Engine } from './core/Engine'
import { Game } from './game/Game'
import { CelPipeline } from './render/CelPipeline'
import { Ui } from './ui/Ui'
import { Sfx } from './audio/Sfx'
import { buildTouchControls } from './ui/Touch'
import { Voice } from './audio/Voice'
import { playIntro } from './ui/Intro'
import { playTour, tourSeen } from './ui/Tour'
import { Tile } from './world/Grid'
import { People } from './render/People'

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
const game = new Game(engine.scene, ui, 'Prisoner')
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
nameInput.focus()
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const name = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 18) || 'Prisoner'
  game.player.name = name
  game.hard = (form.querySelector('input[name="mode"]:checked') as HTMLInputElement | null)?.value === 'hard'
  nameInput.blur()
  sfx.unlock()
  document.getElementById('start')!.classList.add('gone')
  // How you ended up here. Skippable, and only once per sentence.
  playIntro(name, begin)
})

function begin(): void {
  game.clock.minutes = 8 * 60 - 20
  game.input.enabled = true
  game.input.clear()
  started = true
  snap = true
  game.startSentence()
  ui.attach(game)
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
  // The first time, a walk round the screen before anything else.
  if (tourSeen()) welcome()
  else tour(welcome)
}

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

engine.onUpdate((delta) => {
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

  // Light: day, dusk, night; the vents are dark.
  const dark = game.clock.darkness
  tint.copy(day).lerp(night, dark)
  if (game.player.inVent) tint.multiplyScalar(0.42)
  setWorldTint(tint)
  clear.copy(skyDay).lerp(skyNight, dark)
  engine.renderer.setClearColor(clear)
  const hunted = game.alarm.active || game.guards.some((g) => g.chasing)
  sfx.setAlarm(hunted && started && !game.over)
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
