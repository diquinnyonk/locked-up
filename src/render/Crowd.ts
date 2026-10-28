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
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEX, color } from '../art/palette'
import { paint, paintBy } from '../art/paint'
import { createToonMaterial } from '../art/toonMaterial'
import { createOutlineMaterial, instancedOutline } from '../art/outlineMaterial'
import { SOLID_LAYER } from './CelPipeline'
import { mulberry32 } from '../core/random'

/**
 * Everybody in the prison, drawn as one crowd.
 *
 * Each body part is one InstancedMesh holding that part for everyone, and a
 * person is a row of matrices written each frame. Limbs are jointed (hip and
 * knee, shoulder and elbow), so a walk has a proper heel lift and someone
 * sitting has their shins down rather than sticking out like a plank.
 *
 * Variety comes from per-person height and build, hair styles, a skirt for
 * visitors (and anyone who has been at the panto box), and the officers'
 * collar, tie, epaulettes and cap badge, which a stolen uniform carries too.
 */
const S = 0.55
const LEG = 1.6 * S
const TORSO = 1.55 * S
const PELVIS = 0.32 * S
const SHOULDER = LEG + TORSO * 0.86
const HEAD = 0.42 * S
const ARM = 1.3 * S
const KNEE = LEG * 0.5
const ELBOW = ARM * 0.48
const NECK = 0.16 * S

export type Pose = 'stand' | 'walk' | 'fight' | 'down' | 'sleep' | 'sit' | 'crawl' | 'cuffed' | 'phone' | 'wave' | 'search' | 'talk'

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
  /** Hair past the shoulders. */
  longHair: boolean
  cap: boolean
  /** Collar, tie, epaulettes: an officer's shirt, real or stolen. */
  uniform: boolean
  /** A vicar's white dog collar and a little wooden cross. */
  clergy: boolean
  /** A shiv in the right hand. */
  shiv: boolean
  /** Facial hair and a quiff, in the hair colour. */
  beard: boolean
  tache: boolean
  tuft: boolean
  /** A skirt in this colour, over the trousers. */
  skirt: number | null
  /** Overall height, ~0.9..1.1. */
  height: number
  /** Width of the shoulders and middle, ~0.9..1.2. */
  build: number
  visible: boolean
  stride: number
  /** Saying something right now: the mouth moves. */
  talking?: boolean
}

let looks = mulberry32(1)
/**
 * Seeds the small differences between people (height, build, the phase of
 * their stride) from the prison's seed: the same prison, the same people.
 * Its own stream, so it never shifts the game's.
 */
export function seedLooks(seed: number): void {
  looks = mulberry32(seed ^ 0x9e3779b9)
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
    longHair: false,
    cap: false,
    uniform: false,
    clergy: false,
    beard: false,
    shiv: false,
    tache: false,
    tuft: false,
    skirt: null,
    height: 0.92 + looks() * 0.16,
    build: 0.92 + looks() * 0.26,
    visible: true,
    stride: looks() * 10,
    ...style,
  }
}

/** Vertex paint: 1 keeps the instance colour, below 1 shades it, and the
 *  special values pick out details (soles, buttons) in their own tone. */
const keep = 0xffffff

function nonIndexed(...parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
}

function thighGeometry(): BufferGeometry {
  const thigh = new CylinderGeometry(0.25 * S, 0.21 * S, KNEE, 14)
  thigh.translate(0, -KNEE / 2, 0)
  const hip = new SphereGeometry(0.25 * S, 14, 8)
  return nonIndexed(thigh, hip)
}

/** Shin and shoe, pivoting at the knee. The shoe is painted near-black. */
function shinGeometry(): BufferGeometry {
  const len = LEG - KNEE - 0.14 * S
  const shin = new CylinderGeometry(0.205 * S, 0.165 * S, len, 14)
  shin.translate(0, -len / 2, 0)
  const knee = new SphereGeometry(0.21 * S, 12, 8)
  const upper = new BoxGeometry(0.34 * S, 0.2 * S, 0.56 * S, 2, 1, 2)
  upper.translate(0, -(LEG - KNEE) + 0.12 * S, 0.1 * S)
  const toe = new SphereGeometry(0.17 * S, 12, 8)
  toe.scale(1, 0.62, 1)
  toe.translate(0, -(LEG - KNEE) + 0.1 * S, 0.34 * S)
  const sole = new BoxGeometry(0.38 * S, 0.07 * S, 0.72 * S)
  sole.translate(0, -(LEG - KNEE) + 0.02 * S, 0.14 * S)
  const merged = nonIndexed(shin, knee, upper, toe, sole)
  return paintBy(merged, (_x, y) => (y < -(LEG - KNEE) + 0.24 * S ? 0x232323 : keep))
}

function upperArmGeometry(): BufferGeometry {
  const arm = new CylinderGeometry(0.215 * S, 0.18 * S, ELBOW, 14)
  arm.translate(0, -ELBOW / 2, 0)
  const shoulder = new SphereGeometry(0.235 * S, 14, 10)
  return nonIndexed(arm, shoulder)
}

function forearmGeometry(): BufferGeometry {
  const len = ARM - ELBOW
  const arm = new CylinderGeometry(0.18 * S, 0.145 * S, len, 14)
  arm.translate(0, -len / 2, 0)
  const elbow = new SphereGeometry(0.185 * S, 12, 8)
  return nonIndexed(arm, elbow)
}

/** A rounded mitten of a hand: palm, curled fingers and a thumb, chunky
 *  enough to read as a fist from the camera. */
function handGeometry(): BufferGeometry {
  const len = ARM - ELBOW
  const palm = new SphereGeometry(0.17 * S, 14, 10)
  palm.scale(0.9, 1.05, 0.78)
  palm.translate(0, -len - 0.1 * S, 0)
  const fingers = new SphereGeometry(0.15 * S, 12, 8)
  fingers.scale(0.95, 0.85, 0.85)
  fingers.translate(0, -len - 0.24 * S, 0.04 * S)
  const thumb = new SphereGeometry(0.075 * S, 8, 6)
  thumb.scale(1, 1.5, 1)
  thumb.translate(0, -len - 0.08 * S, 0.15 * S)
  return mergeGeometries([palm, fingers, thumb])
}

/** A full beard round the jaw and chin, open where the mouth is. */
function beardGeometry(): BufferGeometry {
  const shell = new SphereGeometry(HEAD * 1.04, 20, 12, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.55, Math.PI * 0.4)
  shell.rotateY(Math.PI * 0.5 - Math.PI * 0.5)
  shell.scale(1, 1.1, 1)
  shell.translate(0, -0.02 * S, 0.01 * S)
  const chin = new SphereGeometry(0.16 * S, 12, 8)
  chin.scale(1.1, 0.9, 0.8)
  chin.translate(0, -HEAD * 0.95, HEAD * 0.55)
  return nonIndexed(shell, chin)
}

/** A proper British moustache, the kind that has opinions. */
function tacheGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const half = new SphereGeometry(0.075 * S, 10, 6)
    half.scale(1.6, 0.6, 0.7)
    half.rotateZ(side * -0.25)
    half.translate(side * 0.08 * S, -0.15 * S, HEAD * 0.95)
    parts.push(half)
  }
  return mergeGeometries(parts)
}

/** A quiff swept up at the front of the hair. */
function tuftGeometry(): BufferGeometry {
  const tuft = new SphereGeometry(HEAD * 0.55, 14, 8)
  tuft.scale(1.25, 0.55, 0.9)
  tuft.rotateX(-0.5)
  tuft.translate(0, HEAD * 0.9, HEAD * 0.45)
  return tuft
}

/** Chest, shoulders and a collar band, flattened front to back. */
function torsoGeometry(): BufferGeometry {
  const body = new CylinderGeometry(0.58 * S, 0.6 * S, TORSO, 20, 4)
  // Taper into a waist and out to the chest.
  const pos = body.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / TORSO + 0.5
    const waist = 1 - 0.08 * Math.sin(t * Math.PI * 0.9)
    pos.setX(i, pos.getX(i) * waist)
    pos.setZ(i, pos.getZ(i) * waist * 0.68)
  }
  body.computeVertexNormals()
  const shoulders = new SphereGeometry(0.6 * S, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  shoulders.scale(1, 0.42, 0.66)
  shoulders.translate(0, TORSO / 2 - 0.02, 0)
  const collar = new TorusGeometry(0.2 * S, 0.06 * S, 8, 20)
  collar.rotateX(Math.PI / 2)
  collar.translate(0, TORSO / 2 + 0.2 * S, 0)
  const hem = new CylinderGeometry(0.61 * S, 0.62 * S, 0.1 * S, 20)
  hem.scale(1, 1, 0.68)
  hem.translate(0, -TORSO / 2 + 0.05 * S, 0)
  const merged = nonIndexed(body, shoulders, collar, hem)
  return paintBy(merged, (_x, y) => (y > TORSO / 2 + 0.1 * S ? 0xd8d8d8 : y < -TORSO / 2 + 0.11 * S ? 0xcccccc : keep))
}

function pelvisGeometry(): BufferGeometry {
  const p = new CylinderGeometry(0.6 * S, 0.5 * S, PELVIS, 20)
  p.scale(1, 1, 0.7)
  p.translate(0, -PELVIS / 2, 0)
  return p
}

/** Belt with a buckle at the front. */
function beltGeometry(): BufferGeometry {
  const belt = new CylinderGeometry(0.615 * S, 0.615 * S, 0.1 * S, 20, 1, true)
  belt.scale(1, 1, 0.7)
  const buckle = new BoxGeometry(0.16 * S, 0.11 * S, 0.04 * S)
  buckle.translate(0, 0, 0.44 * S)
  return mergeGeometries([paint(belt, 0x2a2a2a), paint(buckle, 0xd9c27a)])
}

function neckGeometry(): BufferGeometry {
  const n = new CylinderGeometry(0.15 * S, 0.17 * S, NECK + 0.1 * S, 12)
  n.translate(0, NECK / 2, 0)
  return n
}

/** A head with ears, a nose and a hint of jaw, so faces read at a glance. */
function headGeometry(): BufferGeometry {
  const head = new SphereGeometry(HEAD, 22, 18)
  const pos = head.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    // A jaw: narrower at the bottom, a little longer.
    if (y < 0) {
      const k = 1 + (y / HEAD) * 0.12
      pos.setX(i, pos.getX(i) * k)
      pos.setY(i, y * 1.12)
    }
  }
  head.computeVertexNormals()
  const nose = new SphereGeometry(0.1 * S, 10, 8)
  nose.scale(0.8, 1, 1)
  nose.translate(0, -0.03 * S, HEAD * 0.95)
  const parts = [head, nose]
  for (const side of [1, -1]) {
    const ear = new SphereGeometry(0.09 * S, 10, 8)
    ear.scale(0.5, 1, 0.8)
    ear.translate(side * HEAD * 0.98, 0, -0.02 * S)
    parts.push(ear)
  }
  return mergeGeometries(parts)
}

/** Eye whites, pupils, brows and a mouth: whites painted, the rest ink. */
function faceGeometry(): BufferGeometry {
  const ink = 0x12222b
  const parts: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const white = new SphereGeometry(0.075 * S, 10, 8)
    white.scale(1.2, 1, 0.45)
    white.translate(side * 0.155 * S, 0.06 * S, HEAD * 0.9)
    parts.push(paint(white, 0xf6f4ee))
    const pupil = new SphereGeometry(0.045 * S, 8, 6)
    pupil.scale(1, 1.2, 0.5)
    pupil.translate(side * 0.155 * S, 0.06 * S, HEAD * 0.94)
    parts.push(paint(pupil, ink))
    const brow = new BoxGeometry(0.17 * S, 0.045 * S, 0.05 * S)
    brow.rotateZ(side * -0.14)
    brow.translate(side * 0.155 * S, 0.19 * S, HEAD * 0.9)
    parts.push(paint(brow, ink))
  }
  // A small smile: a flat middle and two corners turned up.
  const mouth = new BoxGeometry(0.1 * S, 0.026 * S, 0.04 * S)
  mouth.translate(0, -0.24 * S, HEAD * 0.86)
  parts.push(paint(mouth, ink))
  for (const side of [1, -1]) {
    const corner = new BoxGeometry(0.06 * S, 0.024 * S, 0.04 * S)
    corner.rotateZ(side * 0.5)
    corner.translate(side * 0.07 * S, -0.226 * S, HEAD * 0.85)
    parts.push(paint(corner, ink))
  }
  return mergeGeometries(parts)
}

function hairGeometry(): BufferGeometry {
  const hair = new SphereGeometry(HEAD * 1.07, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)
  hair.rotateX(-0.38)
  hair.translate(0, 0.05 * S, -0.04 * S)
  return hair
}

/** Hair past the shoulders: a fall down the back and two side curtains. */
function longHairGeometry(): BufferGeometry {
  const fall = new CylinderGeometry(HEAD * 0.95, HEAD * 1.05, HEAD * 2.2, 16, 2, true, Math.PI * 0.6, Math.PI * 0.8)
  // Theta runs from +z (the face), so this arc sits round the back.
  fall.translate(0, -HEAD * 0.7, -0.02 * S)
  const crown = hairGeometry()
  return mergeGeometries([fall.toNonIndexed(), crown.toNonIndexed()])
}

/** An officer's peaked cap: crown, black band, shiny peak and a gold badge. */
function capGeometry(): BufferGeometry {
  const crown = new CylinderGeometry(HEAD * 1.16, HEAD * 1.04, HEAD * 0.55, 20)
  crown.translate(0, HEAD * 0.66, 0)
  const top = new CylinderGeometry(HEAD * 1.2, HEAD * 1.16, HEAD * 0.12, 20)
  top.translate(0, HEAD * 0.96, 0)
  const peak = new SphereGeometry(HEAD * 0.75, 16, 6, 0, Math.PI, 0, Math.PI / 2)
  peak.scale(1.2, 0.18, 1.1)
  peak.rotateY(-Math.PI / 2)
  peak.translate(0, HEAD * 0.4, HEAD * 0.45)
  const badge = new SphereGeometry(HEAD * 0.13, 10, 8)
  badge.scale(1, 1, 0.4)
  badge.translate(0, HEAD * 0.72, HEAD * 1.1)
  const band = new CylinderGeometry(HEAD * 1.06, HEAD * 1.04, HEAD * 0.14, 20)
  band.translate(0, HEAD * 0.46, 0)
  return mergeGeometries([paint(crown, keep), paint(top, keep), paint(band, 0x0a0a0a), paint(peak, 0x0a0a0a), paint(badge, 0xf2c14e)])
}

/** Collar points, tie, epaulettes and breast pockets, for officers' shirts. */
function uniformGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const top = LEG + TORSO
  const black = 0x14181c
  const tie = new BoxGeometry(0.12 * S, TORSO * 0.55, 0.04 * S)
  tie.translate(0, top - TORSO * 0.3, 0.43 * S)
  parts.push(paint(tie, black))
  const knot = new BoxGeometry(0.15 * S, 0.1 * S, 0.06 * S)
  knot.translate(0, top - 0.02 * S, 0.42 * S)
  parts.push(paint(knot, black))
  for (const side of [1, -1]) {
    const point = new BoxGeometry(0.2 * S, 0.06 * S, 0.14 * S)
    point.rotateY(side * 0.5)
    point.rotateZ(side * 0.3)
    point.translate(side * 0.12 * S, top + 0.06 * S, 0.36 * S)
    parts.push(paint(point, 0xf6f7f6))
    const ep = new BoxGeometry(0.3 * S, 0.05 * S, 0.18 * S)
    ep.translate(side * 0.42 * S, top + 0.02 * S, 0)
    parts.push(paint(ep, black))
    const pip = new BoxGeometry(0.06 * S, 0.06 * S, 0.06 * S)
    pip.translate(side * 0.48 * S, top + 0.06 * S, 0)
    parts.push(paint(pip, 0xf2f2f2))
    const pocket = new BoxGeometry(0.2 * S, 0.18 * S, 0.03 * S)
    pocket.translate(side * 0.28 * S, top - TORSO * 0.25, 0.42 * S)
    parts.push(paint(pocket, 0xe3e6e3))
  }
  const radio = new BoxGeometry(0.12 * S, 0.22 * S, 0.08 * S)
  radio.translate(-0.3 * S, top - TORSO * 0.12, 0.43 * S)
  parts.push(paint(radio, black))
  return mergeGeometries(parts)
}

/** A white dog collar round the neck, its tab at the throat, and a cross. */
function clergyGeometry(): BufferGeometry {
  const top = LEG + TORSO
  const band = new CylinderGeometry(0.2 * S, 0.21 * S, 0.12 * S, 16)
  band.translate(0, top + 0.08 * S, 0)
  const tab = new BoxGeometry(0.12 * S, 0.1 * S, 0.04 * S)
  tab.translate(0, top + 0.06 * S, 0.2 * S)
  const upright = new BoxGeometry(0.06 * S, 0.24 * S, 0.03 * S)
  upright.translate(0, top - TORSO * 0.3, 0.45 * S)
  const arm = new BoxGeometry(0.16 * S, 0.05 * S, 0.03 * S)
  arm.translate(0, top - TORSO * 0.27, 0.45 * S)
  return mergeGeometries([paint(band, 0xf6f7f6), paint(tab, 0xf6f7f6), paint(upright, 0xc79a62), paint(arm, 0xc79a62)])
}

/** A skirt flaring from the waist to below the knee. */
function skirtGeometry(): BufferGeometry {
  const len = LEG * 0.62
  const flare = new CylinderGeometry(0.62 * S, 0.88 * S, len, 24, 3, true)
  flare.translate(0, -len / 2, 0)
  flare.scale(1, 1, 0.8)
  const waist = new CylinderGeometry(0.6 * S, 0.62 * S, 0.12 * S, 24)
  waist.scale(1, 1, 0.75)
  return nonIndexed(flare, waist)
}

interface Part {
  mesh: InstancedMesh
  per: number
}

const tmp = new Matrix4()
const hip = new Matrix4()
const joint = new Matrix4()
const root = new Matrix4()
const q = new Quaternion()
const e = new Euler()
const v = new Vector3()
const one = new Vector3(1, 1, 1)
const zero = new Vector3(0, 0, 0)
const scaleV = new Vector3()
const c = new Color()
const hidden = new Matrix4().makeScale(0, 0, 0)
const mChest = new Matrix4()
const mNeck = new Matrix4()
const mHead = new Matrix4()
const mLimb = new Matrix4()

export class Crowd {
  readonly group = new Object3D()
  private readonly torso: Part
  private readonly pelvis: Part
  private readonly belt: Part
  private readonly neck: Part
  private readonly head: Part
  private readonly face: Part
  private readonly hair: Part
  private readonly longHair: Part
  private readonly cap: Part
  private readonly uniform: Part
  private readonly clergy: Part
  private readonly beard: Part
  private readonly tache: Part
  private readonly tuft: Part
  private readonly skirt: Part
  private readonly thighs: Part
  private readonly shins: Part
  private readonly upperArms: Part
  private readonly forearms: Part
  private readonly hands: Part
  private readonly parts: Part[]

  constructor(readonly capacity: number) {
    const outline = createOutlineMaterial(1.6)
    const make = (geometry: BufferGeometry, per: number, opts: { tinted?: boolean; shade?: number; rim?: number; outline?: boolean; spec?: number } = {}): Part => {
      const material = createToonMaterial({
        albedo: new Color(1, 1, 1),
        shadeTint: color(opts.shade ?? HEX.shade),
        rimColour: color(HEX.paper),
        rimStrength: opts.rim ?? 0.22,
        specStrength: opts.spec ?? 0.1,
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

    this.torso = make(torsoGeometry(), 1, { tinted: true, outline: true })
    this.pelvis = make(pelvisGeometry(), 1, { outline: true })
    this.belt = make(beltGeometry(), 1, { tinted: true, spec: 0.3 })
    this.neck = make(neckGeometry(), 1, { shade: HEX.skinShade })
    this.head = make(headGeometry(), 1, { shade: HEX.skinShade, outline: true })
    this.face = make(faceGeometry(), 1, { tinted: true, rim: 0 })
    this.hair = make(hairGeometry(), 1, { shade: HEX.ink })
    this.longHair = make(longHairGeometry(), 1, { shade: HEX.ink, outline: true })
    this.cap = make(capGeometry(), 1, { tinted: true, shade: HEX.ink, outline: true, spec: 0.35 })
    this.uniform = make(uniformGeometry(), 1, { tinted: true })
    this.clergy = make(clergyGeometry(), 1, { tinted: true })
    this.beard = make(beardGeometry(), 1, { shade: HEX.ink })
    this.tache = make(tacheGeometry(), 1, { shade: HEX.ink })
    this.tuft = make(tuftGeometry(), 1, { shade: HEX.ink, outline: true })
    this.skirt = make(skirtGeometry(), 1, { outline: true })
    this.thighs = make(thighGeometry(), 2, { outline: true })
    this.shins = make(shinGeometry(), 2, { tinted: true, outline: true })
    this.upperArms = make(upperArmGeometry(), 2, { outline: true })
    this.forearms = make(forearmGeometry(), 2, { outline: true })
    this.hands = make(handGeometry(), 2, { shade: HEX.skinShade })
    this.parts = [this.torso, this.pelvis, this.belt, this.neck, this.head, this.face, this.hair, this.longHair, this.cap, this.uniform, this.clergy, this.beard, this.tache, this.tuft, this.skirt, this.thighs, this.shins, this.upperArms, this.forearms, this.hands]
  }

  /** Colours only change when someone is created or changes clothes. */
  paint(index: number, body: Body): void {
    this.torso.mesh.setColorAt(index, c.setHex(body.top))
    this.pelvis.mesh.setColorAt(index, c.setHex(body.trousers))
    this.belt.mesh.setColorAt(index, c.setHex(0xffffff))
    this.neck.mesh.setColorAt(index, c.setHex(body.skin))
    this.head.mesh.setColorAt(index, c.setHex(body.skin))
    this.face.mesh.setColorAt(index, c.setHex(0xffffff))
    this.hair.mesh.setColorAt(index, c.setHex(body.hair ?? 0))
    this.longHair.mesh.setColorAt(index, c.setHex(body.hair ?? HEX.hairBrown))
    this.cap.mesh.setColorAt(index, c.setHex(HEX.guardCap))
    this.uniform.mesh.setColorAt(index, c.setHex(0xffffff))
    this.clergy.mesh.setColorAt(index, c.setHex(0xffffff))
    const fur = body.hair ?? HEX.hairBrown
    this.beard.mesh.setColorAt(index, c.setHex(fur))
    this.tache.mesh.setColorAt(index, c.setHex(fur))
    this.tuft.mesh.setColorAt(index, c.setHex(fur))
    this.skirt.mesh.setColorAt(index, c.setHex(body.skirt ?? 0))
    for (let k = 0; k < 2; k++) {
      this.thighs.mesh.setColorAt(index * 2 + k, c.setHex(body.trousers))
      this.shins.mesh.setColorAt(index * 2 + k, c.setHex(body.skirt != null ? body.skin : body.trousers))
      this.upperArms.mesh.setColorAt(index * 2 + k, c.setHex(body.top))
      this.forearms.mesh.setColorAt(index * 2 + k, c.setHex(body.uniform || body.skirt != null ? body.skin : body.top))
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
    // [hip swing, knee bend] per leg; [shoulder x, shoulder z, elbow bend] per arm.
    let legL: [number, number] = [0, 0.05]
    let legR: [number, number] = [0, 0.05]
    let armL: [number, number, number] = [0, 0.1, -0.15]
    let armR: [number, number, number] = [0, -0.1, -0.15]
    let headTilt = 0
    let headTurn = 0
    // Spine: the hips turn and rock with the stride, the chest turns against
    // them (twist) and leans sideways (roll), as people actually walk.
    let hipYaw = 0
    let hipRoll = 0
    let twist = 0
    let roll = 0

    const gait = Math.min(1, b.speed / 5)
    const moving = Math.min(1, b.speed * 1.5)
    const phase = b.stride
    const swing = Math.sin(phase) * (0.18 + gait * 0.6) * moving
    // The knee bends as the leg comes through, more when running.
    const kneeL = Math.max(0, Math.sin(phase + 1.2)) * (0.35 + gait * 0.9) * moving + 0.05
    const kneeR = Math.max(0, Math.sin(phase + Math.PI + 1.2)) * (0.35 + gait * 0.9) * moving + 0.05
    switch (b.pose) {
      case 'stand':
      case 'walk': {
        const run = Math.max(0, (b.speed - 3) / 2.5)
        legL = [swing, kneeL + run * 0.35 * Math.max(0, Math.sin(phase + 1.6))]
        legR = [-swing, kneeR + run * 0.35 * Math.max(0, Math.sin(phase + Math.PI + 1.6))]
        // Walking arms swing loose with a soft elbow; running arms pump at
        // a right angle, close to the body.
        const armSwing = swing * (0.9 + run * 0.5)
        const elbow = -0.25 - gait * 0.35 - run * 1.0
        armL = [-armSwing, 0.12 - run * 0.05, elbow + Math.max(0, -Math.sin(phase)) * -0.35 * moving]
        armR = [armSwing, -0.12 + run * 0.05, elbow + Math.max(0, Math.sin(phase)) * -0.35 * moving]
        bob = Math.abs(Math.cos(phase)) * (0.02 + gait * 0.07) * moving
        lean = gait * 0.12 + run * 0.18
        hipYaw = Math.sin(phase) * 0.14 * moving
        hipRoll = Math.cos(phase) * 0.05 * moving
        twist = -Math.sin(phase) * (0.2 + run * 0.1) * moving
        roll = -Math.cos(phase) * 0.04 * moving
        headTurn = -hipYaw - twist * 0.6
        // Idle: a slow breath, weight on one hip, the odd glance round.
        if (b.speed < 0.2) {
          const breath = Math.sin(b.poseTime * 1.6 + b.stride)
          bob = breath * 0.008
          hipRoll = 0.04
          legL = [0.04, 0.06]
          legR = [-0.06, 0.16]
          armL = [0.02, 0.1 + breath * 0.01, -0.18]
          armR = [-0.03, -0.12 - breath * 0.01, -0.22]
          roll = -0.02
          headTurn = Math.sin(b.poseTime * 0.4 + b.stride * 3) * 0.35
          headTilt = Math.sin(b.poseTime * 0.27 + b.stride) * 0.06
        }
        break
      }
      case 'fight': {
        // A boxer's guard: fists by the chin, left foot forward, knees soft,
        // bouncing. Jab and cross alternate, the shoulders turning into each.
        const t = b.poseTime * 2.2 + b.stride * 0.1
        const which = Math.floor(t) % 2
        const f = t % 1
        const hit = f < 0.35 ? Math.sin((f / 0.35) * Math.PI) : 0
        const guardL: [number, number, number] = [-0.85, -0.12, -2.05]
        const guardR: [number, number, number] = [-0.7, 0.14, -2.15]
        const punch = (g: [number, number, number], k: number): [number, number, number] => [g[0] + (-1.55 - g[0]) * k, g[1] * (1 - k), g[2] + (-0.12 - g[2]) * k]
        armL = which === 0 ? punch(guardL, hit) : guardL
        armR = which === 1 ? punch(guardR, hit) : guardR
        const bounce = Math.sin(b.poseTime * 9)
        legL = [-0.38, 0.42 + bounce * 0.05]
        legR = [0.28, 0.48 - bounce * 0.05]
        bob = Math.abs(bounce) * 0.035 - 0.07
        lean = 0.16
        twist = 0.35 + (which === 0 ? -0.45 : 0.55) * hit
        hipYaw = 0.3
        roll = Math.sin(b.poseTime * 3.3) * 0.06
        headTilt = 0.18
        headTurn = -twist - hipYaw * 0.8
        break
      }
      case 'down':
        lieX = -Math.PI / 2
        lift = 0.27
        armL = [0, 1.25, -0.2]
        armR = [0, -1.25, -0.2]
        legL = [0.12, 0.25]
        legR = [-0.15, 0.05]
        headTurn = 0.6
        break
      case 'sleep':
        lieX = -Math.PI / 2
        armL = [0, 0.15, -0.6]
        armR = [-0.4, -0.15, -1.6]
        legL = [-0.15, 0.3]
        legR = [0, 0.1]
        headTurn = 0.3
        break
      case 'sit': {
        // Thighs flat on the seat, shins straight down, hands on the knees.
        // A slow breath, and now and then a shift of weight.
        const breath = Math.sin(b.poseTime * 1.5 + b.stride)
        const shift = Math.sin(b.poseTime * 0.23 + b.stride * 2)
        legL = [-Math.PI / 2 + 0.06, Math.PI / 2 - 0.12 + shift * 0.08]
        legR = [-Math.PI / 2 + 0.02, Math.PI / 2 - 0.02 - shift * 0.08]
        armL = [-0.22, 0.16, -0.62 + breath * 0.02]
        armR = [-0.18, -0.16, -0.66 + breath * 0.02]
        lift = -(LEG - KNEE) + 0.02
        bob = breath * 0.006
        lean = 0.1 + shift * 0.03
        roll = shift * 0.03
        headTilt = 0.06
        headTurn = Math.sin(b.poseTime * 0.35 + b.stride * 5) * 0.4
        break
      }
      case 'crawl': {
        // Hands and knees: thighs straight down to the knees, shins flat
        // behind, arms straight down to the floor, head up looking ahead.
        // The gait is diagonal: left hand with right knee.
        const a = 1.2
        const c = Math.sin(phase * 0.8) * moving
        legL = [0.12 + c * 0.32, Math.PI / 2 - 0.1 - c * 0.2]
        legR = [0.12 - c * 0.32, Math.PI / 2 - 0.1 + c * 0.2]
        armL = [-a - 0.15 - c * 0.3, 0.06, -0.08 + Math.max(0, c) * -0.4]
        armR = [-a - 0.15 + c * 0.3, -0.06, -0.08 + Math.max(0, -c) * -0.4]
        lift = KNEE * 0.92 - LEG + 0.14
        lean = a
        hipRoll = c * 0.06
        roll = -c * 0.05
        headTilt = -a + 0.25
        bob = Math.abs(c) * 0.02
        break
      }
      case 'cuffed':
        legL = [swing, kneeL]
        legR = [-swing, kneeR]
        armL = [0.5, -0.25, -0.6]
        armR = [0.5, 0.25, -0.6]
        headTilt = 0.3
        break
      case 'phone':
        armR = [-1.9, -0.6, -2.2]
        armL = [-0.3, 0.1, -1.4]
        headTilt = 0.1
        headTurn = -0.2
        legL = [0.05, 0.08]
        legR = [-0.05, 0.25]
        break
      case 'wave': {
        const w = Math.sin(b.poseTime * 9) * 0.5
        armR = [-2.9, -0.3 + w, -0.3]
        armL = [-2.9, 0.3 - w, -0.3]
        bob = Math.abs(Math.sin(b.poseTime * 6)) * 0.08
        legL = [0, 0.1 + Math.abs(w) * 0.3]
        legR = [0, 0.1]
        break
      }
      case 'talk': {
        // Talking with the hands: one arm out, palm up, beating time.
        const beat = Math.sin(b.poseTime * 4.2)
        const beat2 = Math.sin(b.poseTime * 2.3 + 1)
        armR = [-0.7 - beat * 0.25, -0.25, -1.1 + beat * 0.3]
        armL = [-0.25 + beat2 * 0.2, 0.15, -0.5 - Math.max(0, beat2) * 0.6]
        headTilt = Math.sin(b.poseTime * 3.1) * 0.08
        headTurn = Math.sin(b.poseTime * 1.3) * 0.12
        bob = Math.abs(beat) * 0.01
        break
      }
      case 'search':
        armL = [-1.0, 0.25, -0.8]
        armR = [-1.0, -0.25, -0.8]
        lean = 0.5
        headTilt = 0.45
        legL = [-0.2, 0.3]
        legR = [0.15, 0.2]
        break
    }

    e.set(lieX, b.yaw, 0, 'YXZ')
    q.setFromEuler(e)
    v.set(b.x, b.y + (lift + bob) * b.height, b.z)
    scaleV.set(b.build, b.height, (b.build + 1) / 2)
    root.compose(v, q, scaleV)

    // Joints are composed as root * offset * rotation, so a child reads its
    // parent's matrix from `joint` before it is overwritten.
    const at = (out: Matrix4, parent: Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number) => {
      e.set(rx, ry, rz, 'XYZ')
      q.setFromEuler(e)
      v.set(px, py, pz)
      tmp.compose(v, q, one)
      out.multiplyMatrices(parent, tmp)
      return out
    }
    const put = (part: Part, k: number, m: Matrix4) => part.mesh.setMatrixAt(i * part.per + k, m)

    // Hips and upper body. Leaning tilts everything above the pelvis.
    const hips = at(hip, root, 0, LEG, 0, 0, hipYaw, hipRoll)
    put(this.pelvis, 0, hips)
    const chest = at(mChest, hips, 0, 0, 0, lean, twist - hipYaw, roll)
    put(this.belt, 0, at(joint, chest, 0, 0.02 * S, 0, 0, 0, 0))
    put(this.torso, 0, at(joint, chest, 0, TORSO / 2, 0, 0, 0, 0))
    put(this.uniform, 0, b.uniform ? at(joint, chest, 0, -LEG, 0, 0, 0, 0) : hidden)
    put(this.clergy, 0, b.clergy ? at(joint, chest, 0, -LEG, 0, 0, 0, 0) : hidden)
    put(this.skirt, 0, b.skirt != null ? at(joint, hips, 0, 0.04 * S, 0, 0, 0, 0) : hidden)
    const neck = at(mNeck, chest, 0, TORSO, 0, headTilt * 0.4, headTurn * 0.4, 0)
    put(this.neck, 0, neck)
    const head = at(mHead, neck, 0, NECK + HEAD * 0.9, 0.02, headTilt * 0.6, headTurn * 0.6, 0)
    put(this.head, 0, head)
    put(this.face, 0, head)
    put(this.beard, 0, b.beard ? head : hidden)
    put(this.tache, 0, b.tache || b.beard ? head : hidden)
    put(this.tuft, 0, b.tuft && !b.cap && b.hair != null && !b.longHair ? head : hidden)
    if (b.cap) {
      put(this.cap, 0, head)
      put(this.hair, 0, hidden)
      put(this.longHair, 0, b.longHair ? head : hidden)
    } else {
      put(this.cap, 0, hidden)
      put(this.hair, 0, b.hair != null && !b.longHair ? head : hidden)
      put(this.longHair, 0, b.hair != null && b.longHair ? head : hidden)
    }

    // Legs: hip, then knee.
    const legs: [number, [number, number]][] = [[1, legL], [-1, legR]]
    legs.forEach(([side, [swingX, knee]], k) => {
      const thigh = at(mLimb, hips, side * 0.27 * S, 0, 0, swingX, 0, 0)
      put(this.thighs, k, thigh)
      put(this.shins, k, at(joint, thigh, 0, -KNEE, 0, knee, 0, 0))
    })

    // Arms: shoulder, then elbow; the hand rides on the forearm.
    const arms: [number, [number, number, number]][] = [[1, armL], [-1, armR]]
    arms.forEach(([side, [sx, sz, elbow]], k) => {
      const upper = at(mLimb, chest, side * 0.74 * S, SHOULDER - LEG, 0, sx, 0, sz)
      put(this.upperArms, k, upper)
      const fore = at(joint, upper, 0, -ELBOW, 0, elbow, 0, 0)
      put(this.forearms, k, fore)
      put(this.hands, k, fore)
    })
  }
}

export const BODY_HEIGHT = LEG + TORSO + NECK + HEAD * 2
