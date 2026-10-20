import { Color, Vector3 } from 'three'
import { HEX, SUN_DIRECTION, color } from './art/palette'
import { setToonSunDirection, setWorldTint } from './art/toonMaterial'
import { Engine } from './core/Engine'
import { Game } from './game/Game'
import { CelPipeline } from './render/CelPipeline'
import { Ui } from './ui/Ui'
import { Sfx } from './audio/Sfx'

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
const game = new Game(engine.scene, ui, 'Prisoner')
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
  game.clock.minutes = 8 * 60 - 20
  game.input.enabled = true
  game.input.clear()
  started = true
  sfx.unlock()
  snap = true
  ui.attach(game)
  document.getElementById('start')!.classList.add('gone')
  nameInput.blur()
  ui.card(
    `${name}, prisoner A7-${Math.floor(1000 + Math.random() * 9000)}`,
    `Welcome to HMP Blackmoor. You share cell A8 with ${game.cellmate?.name ?? 'a stranger'}.\nGet out of your cell, get out of the wing, get over the wall, and have someone waiting when you do.\nOut of bounds only counts as an attempt once an officer sees you, and if you make it back to your cell it never happened.${game.hard ? '' : ' The pale shapes on the floor are what each officer can see.'}\nPress J for the journal: every way out, the gangs, and everything the prison learns.`,
    30,
  )
})

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
  } else {
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
  ui.update(delta, cam)
})

engine.start()
