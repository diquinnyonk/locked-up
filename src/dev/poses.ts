/**
 * Dev-only pose viewer (npm run dev, then /poses.html): one person per pose
 * in a row, under the game's own cel pipeline, so animation work can be
 * judged up close. `?pose=walk&t=0.4` freezes one pose at one moment;
 * `?cam=side` looks from the side.
 */
import { Mesh, PlaneGeometry, Vector3 } from 'three'
import { HEX, SUN_DIRECTION } from '../art/palette'
import { box } from '../art/shapes'
import { setToonSunDirection, toon } from '../art/toonMaterial'
import { Engine } from '../core/Engine'
import { CelPipeline } from '../render/CelPipeline'
import { type Body, Crowd, makeBody, type Pose } from '../render/Crowd'
import { SOLID_LAYER } from '../render/CelPipeline'

const q = new URLSearchParams(location.search)
const canvas = document.getElementById('viewport') as HTMLCanvasElement
const engine = new Engine(canvas, { capture: true })
const pipeline = new CelPipeline(1, 1)
engine.onResized((w, h) => pipeline.setSize(w, h))
engine.onRender((r, s, c) => pipeline.render(r, s, c))
setToonSunDirection(new Vector3().setFromSphericalCoords(1, Math.PI / 2 - SUN_DIRECTION.elevation, SUN_DIRECTION.azimuth))

const floor = new Mesh(new PlaneGeometry(40, 20).rotateX(-Math.PI / 2), toon(HEX.floorLino))
floor.layers.enable(SOLID_LAYER)
engine.scene.add(floor)

type Spec = { pose: Pose; speed: number; label: string; seat?: boolean; style?: Partial<Body> }
const all: Spec[] = [
  { pose: 'stand', speed: 0, label: 'idle', style: { tuft: true } },
  { pose: 'walk', speed: 2.2, label: 'walk', style: { beard: true, hair: HEX.hairBlack } },
  { pose: 'walk', speed: 5.4, label: 'run' },
  { pose: 'fight', speed: 0, label: 'fight', style: { top: HEX.prisonMaroon, tache: true, hair: HEX.hairRed } },
  { pose: 'sit', speed: 0, label: 'sit', seat: true },
  { pose: 'crawl', speed: 1.4, label: 'crawl' },
  { pose: 'walk', speed: 2.0, label: 'officer', style: { top: HEX.guardShirt, trousers: HEX.guardTrousers, cap: true, uniform: true } },
]
const only = q.get('pose')
const specs = only ? all.filter((s) => s.label === only) : all
const crowd = new Crowd(16)
engine.scene.add(crowd.group)
const bodies = specs.map((s, i) => {
  const b = makeBody({ top: HEX.player, height: 1, build: 1.05, ...s.style })
  b.pose = s.pose
  b.speed = s.speed
  b.x = (i - (specs.length - 1) / 2) * 2.6
  b.z = 0
  b.yaw = q.get('cam') === 'side' ? Math.PI / 2 : 0.5
  if (s.seat) {
    const bench = new Mesh(box(1.2, 0.45, 0.45, { x: b.x, y: 0, z: b.z - 0.05 }, HEX.steel), toon(0xffffff, { tinted: true }))
    bench.layers.enable(SOLID_LAYER)
    engine.scene.add(bench)
  }
  crowd.paint(i, b)
  return b
})

const cam = engine.camera
const wide = specs.length * 2.6
if (q.get('cam') === 'side') cam.position.set(0, 1.2, wide * 0.5 + 1.5)
else cam.position.set(0, 2.6, wide * 0.42 + 1.5)
cam.lookAt(0, 0.7, 0)
const freeze = q.get('t')
let t = 0
engine.onUpdate((delta) => {
  t += delta
  if (freeze !== null) {
    for (const b of bodies) {
      b.poseTime = Number(freeze)
      b.stride = Number(freeze) * 3.2 * b.speed
    }
    crowd.update(bodies, 0)
  } else crowd.update(bodies, delta)
  for (const b of bodies) if (b.speed) b.x += 0
})
engine.start()
;(window as unknown as { __ready: boolean }).__ready = true
