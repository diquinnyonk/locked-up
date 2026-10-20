import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEX, color } from '../art/palette'
import { paintBy } from '../art/paint'
import { createToonMaterial } from '../art/toonMaterial'
import { createOutlineMaterial, instancedOutline } from '../art/outlineMaterial'
import { SOLID_LAYER } from './CelPipeline'

/**
 * Everybody in the prison, drawn as one crowd.
 *
 * Ninety-odd people with a scene graph each would be well over a thousand draw
 * calls before outlines. Instead each body part is one InstancedMesh holding
 * that part for everyone, and a person is just a row of matrices written each
 * frame. Same build of body as Windward's seafront crowd, scaled to the tile
 * grid: a prisoner stands about two metres, one tile.
 */
const S = 0.55
const LEG = 1.6 * S
const TORSO = 1.55 * S
const SHOULDER = LEG + TORSO * 0.88
const HEAD = 0.42 * S
const ARM = 1.3 * S

export type Pose = 'stand' | 'walk' | 'fight' | 'down' | 'sleep' | 'sit' | 'crawl' | 'cuffed' | 'phone' | 'wave' | 'search'

export interface Body {
  x: number
  y: number
  z: number
  yaw: number
  /** World units per second, drives the stride. */
  speed: number
  pose: Pose
  /** Free-running time in the current pose. */
  poseTime: number
  top: number
  trousers: number
  skin: number
  hair: number | null
  cap: boolean
  visible: boolean
  stride: number
}

export function makeBody(style: Partial<Body>): Body {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    pose: 'stand',
    poseTime: 0,
    top: HEX.prisonGrey,
    trousers: HEX.prisonGreyDark,
    skin: HEX.skin,
    hair: HEX.hairBrown,
    cap: false,
    visible: true,
    stride: Math.random() * 10,
    ...style,
  }
}

const KNEE = LEG * 0.52
const ELBOW = ARM * 0.5

function legGeometry(): BufferGeometry {
  const thigh = new CylinderGeometry(0.24 * S, 0.21 * S, KNEE, 8)
  thigh.translate(0, -KNEE / 2, 0)
  const shin = new CylinderGeometry(0.2 * S, 0.16 * S, LEG - KNEE - 0.12 * S, 8)
  shin.translate(0, -KNEE - (LEG - KNEE - 0.12 * S) / 2, 0)
  const shoe = new BoxGeometry(0.34 * S, 0.22 * S, 0.62 * S)
  shoe.translate(0, -LEG + 0.11 * S, 0.12 * S)
  const merged = mergeGeometries([thigh.toNonIndexed(), shin.toNonIndexed(), shoe.toNonIndexed()])
  return paintBy(merged, (_x, y) => (y < -LEG + 0.24 * S ? 0x2a2a2a : 0xffffff))
}

function armGeometry(): BufferGeometry {
  const upper = new CylinderGeometry(0.18 * S, 0.16 * S, ELBOW, 8)
  upper.translate(0, -ELBOW / 2, 0)
  const fore = new CylinderGeometry(0.155 * S, 0.13 * S, ARM - ELBOW, 8)
  fore.translate(0, -ELBOW - (ARM - ELBOW) / 2, 0)
  return mergeGeometries([upper, fore])
}

function handGeometry(): BufferGeometry {
  const palm = new SphereGeometry(0.17 * S, 8, 6)
  palm.scale(0.9, 1.15, 0.75)
  palm.translate(0, -ARM - 0.07 * S, 0)
  return palm
}

function torsoGeometry(): BufferGeometry {
  const torso = new CylinderGeometry(0.58 * S, 0.62 * S, TORSO, 10)
  torso.scale(1, 1, 0.68)
  return torso
}

function headGeometry(): BufferGeometry {
  const head = new SphereGeometry(HEAD, 12, 10)
  head.scale(1, 1.08, 1)
  const nose = new SphereGeometry(0.1 * S, 6, 4)
  nose.translate(0, -0.02 * S, HEAD * 0.95)
  return mergeGeometries([head, nose])
}

function faceGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const eye = new SphereGeometry(0.06 * S, 6, 4)
    eye.scale(1, 1.3, 0.6)
    eye.translate(side * 0.15 * S, 0.07 * S, HEAD * 0.93)
    parts.push(eye)
    const brow = new BoxGeometry(0.16 * S, 0.04 * S, 0.04 * S)
    brow.rotateZ(side * -0.12)
    brow.translate(side * 0.15 * S, 0.19 * S, HEAD * 0.9)
    parts.push(brow)
  }
  const mouth = new BoxGeometry(0.17 * S, 0.04 * S, 0.04 * S)
  mouth.translate(0, -0.2 * S, HEAD * 0.9)
  parts.push(mouth)
  return mergeGeometries(parts)
}

function hairGeometry(): BufferGeometry {
  const hair = new SphereGeometry(HEAD * 1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
  hair.rotateX(-0.35)
  hair.translate(0, 0.04 * S, -0.04 * S)
  return hair
}

/** A prison officer's peaked cap: crown, band and a shiny peak. */
function capGeometry(): BufferGeometry {
  const crown = new CylinderGeometry(HEAD * 1.12, HEAD * 1.02, HEAD * 0.55, 12)
  crown.translate(0, HEAD * 0.62, 0)
  const peak = new BoxGeometry(HEAD * 1.4, HEAD * 0.08, HEAD * 0.7)
  peak.translate(0, HEAD * 0.38, HEAD * 0.82)
  return mergeGeometries([crown.toNonIndexed(), peak.toNonIndexed()])
}

interface Part {
  mesh: InstancedMesh
  /** Instances per person (two for limbs). */
  per: number
}

const tmp = new Matrix4()
const tmp2 = new Matrix4()
const root = new Matrix4()
const q = new Quaternion()
const e = new Euler()
const v = new Vector3()
const one = new Vector3(1, 1, 1)
const zero = new Vector3(0, 0, 0)
const c = new Color()

export class Crowd {
  readonly group = new Object3D()
  private readonly torso: Part
  private readonly head: Part
  private readonly face: Part
  private readonly hair: Part
  private readonly cap: Part
  private readonly legs: Part
  private readonly arms: Part
  private readonly hands: Part
  private readonly parts: Part[]

  constructor(readonly capacity: number) {
    const make = (geometry: BufferGeometry, per: number, opts: { tinted?: boolean; shade?: number; rim?: number; outline?: boolean } = {}): Part => {
      const material = createToonMaterial({
        albedo: new Color(1, 1, 1),
        shadeTint: color(opts.shade ?? HEX.shade),
        rimColour: color(HEX.paper),
        rimStrength: opts.rim ?? 0.22,
        vertexTint: opts.tinted,
        instanceTint: true,
      })
      const mesh = new InstancedMesh(geometry, material, capacity * per)
      mesh.frustumCulled = false
      mesh.layers.enable(SOLID_LAYER)
      for (let i = 0; i < capacity * per; i++) mesh.setColorAt(i, c.setHex(0xffffff))
      this.group.add(mesh)
      if (opts.outline) this.group.add(instancedOutline(mesh, outline))
      return { mesh, per }
    }
    const outline = createOutlineMaterial(1.6)

    this.torso = make(torsoGeometry(), 1, { outline: true })
    this.head = make(headGeometry(), 1, { shade: HEX.skinShade, outline: true })
    this.face = make(faceGeometry(), 1, { rim: 0 })
    this.hair = make(hairGeometry(), 1, { shade: HEX.ink })
    this.cap = make(capGeometry(), 1, { shade: HEX.ink, outline: true })
    this.legs = make(legGeometry(), 2, { tinted: true, outline: true })
    this.arms = make(armGeometry(), 2, { outline: true })
    this.hands = make(handGeometry(), 2, { shade: HEX.skinShade })
    this.parts = [this.torso, this.head, this.face, this.hair, this.cap, this.legs, this.arms, this.hands]
  }

  /** Colours only change when someone is created, so set once per body. */
  paint(index: number, body: Body): void {
    this.torso.mesh.setColorAt(index, c.setHex(body.top))
    this.head.mesh.setColorAt(index, c.setHex(body.skin))
    this.face.mesh.setColorAt(index, c.setHex(HEX.ink))
    this.hair.mesh.setColorAt(index, c.setHex(body.hair ?? 0))
    this.cap.mesh.setColorAt(index, c.setHex(HEX.guardCap))
    for (let k = 0; k < 2; k++) {
      this.legs.mesh.setColorAt(index * 2 + k, c.setHex(body.trousers))
      this.arms.mesh.setColorAt(index * 2 + k, c.setHex(body.top))
      this.hands.mesh.setColorAt(index * 2 + k, c.setHex(body.skin))
    }
    for (const p of this.parts) if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true
  }

  update(bodies: Body[], delta: number): void {
    const count = Math.min(bodies.length, this.capacity)
    for (let i = 0; i < count; i++) this.pose(i, bodies[i], delta)
    for (let i = count; i < this.capacity; i++) this.hide(i)
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true
  }

  private hide(i: number): void {
    tmp.compose(zero, q.identity(), zero)
    for (const p of this.parts) for (let k = 0; k < p.per; k++) p.mesh.setMatrixAt(i * p.per + k, tmp)
  }

  private pose(i: number, b: Body, delta: number): void {
    if (!b.visible) {
      this.hide(i)
      return
    }
    b.poseTime += delta
    b.stride += b.speed * delta * 3.2

    let lieX = 0
    let lift = 0
    let bob = 0
    let lean = 0
    let legL = 0
    let legR = 0
    let armL: [number, number] = [0, 0.1]
    let armR: [number, number] = [0, -0.1]
    let headTilt = 0

    const gait = Math.min(1, b.speed / 5)
    const swing = Math.sin(b.stride) * (0.15 + gait * 0.7) * Math.min(1, b.speed * 1.5)
    switch (b.pose) {
      case 'stand':
      case 'walk':
        legL = swing
        legR = -swing
        armL = [-swing * 0.8, 0.1]
        armR = [swing * 0.8, -0.1]
        bob = Math.abs(Math.sin(b.stride)) * (0.03 + gait * 0.1)
        lean = gait * 0.22
        break
      case 'fight': {
        const jab = Math.max(0, Math.sin(b.poseTime * 11))
        const jab2 = Math.max(0, Math.sin(b.poseTime * 11 + Math.PI))
        armL = [-1.2 - jab * 0.4, 0.3]
        armR = [-1.2 - jab2 * 0.4, -0.3]
        legL = 0.3
        legR = -0.3
        bob = Math.abs(Math.sin(b.poseTime * 8)) * 0.06
        lean = 0.15
        break
      }
      case 'down':
        lieX = -Math.PI / 2
        lift = 0.25
        armL = [0, 1.2]
        armR = [0, -1.2]
        legL = 0.15
        legR = -0.15
        break
      case 'sleep':
        lieX = -Math.PI / 2
        armL = [0, 0.15]
        armR = [0, -0.15]
        break
      case 'sit':
        legL = -1.45
        legR = -1.45
        armL = [-0.5, 0.1]
        armR = [-0.5, -0.1]
        lift = -LEG * 0.48
        break
      case 'crawl':
        lieX = Math.PI / 2 - 0.15
        lift = 0.35
        legL = Math.sin(b.stride) * 0.4
        legR = -legL
        armL = [Math.PI - 0.4 + Math.sin(b.stride) * 0.5, 0.2]
        armR = [Math.PI - 0.4 - Math.sin(b.stride) * 0.5, -0.2]
        headTilt = -1.0
        break
      case 'cuffed':
        legL = swing
        legR = -swing
        armL = [0.45, -0.2]
        armR = [0.45, 0.2]
        headTilt = 0.25
        break
      case 'phone':
        armR = [-2.4, -0.5]
        armL = [-0.3, 0.1]
        headTilt = 0.1
        break
      case 'wave': {
        const w = Math.sin(b.poseTime * 9) * 0.5
        armR = [-2.8, -0.3 + w]
        armL = [-2.8, 0.3 - w]
        bob = Math.abs(Math.sin(b.poseTime * 6)) * 0.08
        break
      }
      case 'search':
        armL = [-1.0, 0.2]
        armR = [-1.0, -0.2]
        lean = 0.5
        headTilt = 0.4
        break
    }

    e.set(lieX, b.yaw, 0, 'YXZ')
    q.setFromEuler(e)
    v.set(b.x, b.y + lift + bob, b.z)
    root.compose(v, q, one)

    const set = (part: Part, k: number, px: number, py: number, pz: number, rx: number, rz: number) => {
      e.set(rx, 0, rz, 'XYZ')
      q.setFromEuler(e)
      v.set(px, py, pz)
      tmp2.compose(v, q, one)
      tmp.multiplyMatrices(root, tmp2)
      part.mesh.setMatrixAt(i * part.per + k, tmp)
    }

    // Lean the upper body by tilting about the hips; good enough at this size.
    const leanZ = Math.sin(lean) * 0.4
    set(this.torso, 0, 0, LEG + TORSO / 2, leanZ * 0.5, lean, 0)
    const hy = LEG + TORSO + HEAD * 0.95
    set(this.head, 0, 0, hy, leanZ + 0.02, headTilt, 0)
    set(this.face, 0, 0, hy, leanZ + 0.02, headTilt, 0)
    if (b.cap) {
      set(this.cap, 0, 0, hy, leanZ + 0.02, headTilt, 0)
      this.hair.mesh.setMatrixAt(i, tmp.makeScale(0, 0, 0))
    } else {
      this.cap.mesh.setMatrixAt(i, tmp.makeScale(0, 0, 0))
      if (b.hair != null) set(this.hair, 0, 0, hy, leanZ + 0.02, headTilt, 0)
      else this.hair.mesh.setMatrixAt(i, tmp.makeScale(0, 0, 0))
    }
    set(this.legs, 0, 0.26 * S, LEG, 0, legL, 0)
    set(this.legs, 1, -0.26 * S, LEG, 0, legR, 0)
    set(this.arms, 0, 0.72 * S, SHOULDER, leanZ, armL[0], armL[1])
    set(this.arms, 1, -0.72 * S, SHOULDER, leanZ, armR[0], armR[1])
    set(this.hands, 0, 0.72 * S, SHOULDER, leanZ, armL[0], armL[1])
    set(this.hands, 1, -0.72 * S, SHOULDER, leanZ, armR[0], armR[1])
  }
}

export const BODY_HEIGHT = LEG + TORSO + HEAD * 2
