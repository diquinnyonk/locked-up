import {
  AnimationClip,
  type AnimationAction,
  AnimationMixer,
  Bone,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  CylinderGeometry,
  Frustum,
  LoopOnce,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  VectorKeyframeTrack,
  InterpolateLinear,
  InterpolateDiscrete,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEX, color } from '../art/palette'
import { paint } from '../art/paint'
import { createToonMaterial, toon } from '../art/toonMaterial'
import { BANDING, FRESNEL } from '../shaders/chunks'
import { SOLID_LAYER } from './CelPipeline'
import type { Body } from './Crowd'
import { BODY_HEIGHT } from './Crowd'
import data from './people.json'
import { cosmetic } from '../core/random'

/**
 * Everybody in the prison as proper rigged characters: the KayKit
 * Adventurers (CC0, Kay Lousberg), stripped to one skeleton, a handful of
 * heads and bodies, and the animations the prison needs, by
 * tools/people.py. Every vertex carries a colour role (skin, hair, top,
 * trousers...), so the same tunic is a grey prison sweatshirt on one man and
 * an officer's white shirt on the next.
 *
 * Each person is one skinned mesh and an animation mixer. What they are doing
 * (Body.pose and speed) picks the clip, with a short cross-fade between. The
 * officers' caps and ties, the chaplain's collar and the visitors' skirts are
 * small meshes riding on bones. Crawling has no clip in the pack, so it is
 * posed by hand on the bones each frame.
 */

// ---- Decoding the data file ----

const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const f32 = (s: string) => new Float32Array(bytes(s).buffer)
const boneName = (n: string) => n.replace(/[.\s]/g, '_')

interface PartData {
  count: number
  position: string
  normal: string
  joints: string
  weights: string
  colour: string
  role: string
  shade: string
  index: string
}
interface TrackData {
  bone: string
  path: string
  interp: string
  times: string
  values: string
}
interface PeopleData {
  bones: { name: string; parent: number; t: number[]; r: number[]; s: number[] }[]
  ibm: string
  rig: { t: number[]; r: number[]; s: number[] }
  parts: Record<string, PartData>
  clips: { name: string; tracks: TrackData[] }[]
}
const D = data as unknown as PeopleData

/** Colour roles baked per vertex, in this order. */
const ROLES = 8 // keep, skin, hair, top, trim, trousers, shoes, belt

function partGeometry(p: PartData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(f32(p.position), 3))
  g.setAttribute('normal', new BufferAttribute(f32(p.normal), 3))
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(bytes(p.joints)), 4))
  g.setAttribute('skinWeight', new BufferAttribute(f32(p.weights), 4))
  g.setAttribute('atlas', new BufferAttribute(new Float32Array(bytes(p.colour)).map((v) => v / 255), 3))
  g.setAttribute('role', new BufferAttribute(new Float32Array(bytes(p.role)), 1))
  g.setAttribute('shade', new BufferAttribute(new Float32Array(bytes(p.shade)).map((v) => v / 100), 1))
  g.setIndex(new BufferAttribute(new Uint16Array(bytes(p.index).buffer), 1))
  return g
}

const PARTS = new Map(Object.entries(D.parts).map(([k, p]) => [k, partGeometry(p)]))
const IBM = (() => {
  const a = f32(D.ibm)
  return D.bones.map((_b, i) => new Matrix4().fromArray(a, i * 16))
})()
const BONE_INDEX = new Map(D.bones.map((b, i) => [boneName(b.name), i]))

const CLIPS = new Map(
  D.clips.map((c) => {
    const tracks = c.tracks.map((t) => {
      const name = `${boneName(t.bone)}.${t.path === 'rotation' ? 'quaternion' : t.path === 'translation' ? 'position' : 'scale'}`
      const times = f32(t.times)
      const values = f32(t.values)
      const interp = t.interp === 'STEP' ? InterpolateDiscrete : InterpolateLinear
      return t.path === 'rotation' ? new QuaternionKeyframeTrack(name, times, values, interp) : new VectorKeyframeTrack(name, times, values, interp)
    })
    return [c.name, new AnimationClip(c.name, -1, tracks)]
  }),
)

/** Bind-pose bounds of a part, for fitting caps, ties and collars to it. */
function bounds(part: string): Box3 {
  const g = PARTS.get(part)!
  g.computeBoundingBox()
  return g.boundingBox!.clone()
}
const HEAD = bounds('head.short')
const BODY = bounds('body.tunic')
const LEGS = bounds('leg.l')
const MODEL_HEIGHT = HEAD.max.y - Math.min(LEGS.min.y, 0)
/** Where a bone sits in the bind pose (model space). */
function bindPos(bone: string): Vector3 {
  const m = IBM[BONE_INDEX.get(boneName(bone))!].clone().invert()
  return new Vector3().setFromMatrixPosition(m)
}

// ---- The skinned toon material ----

const VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute vec3 atlas;
attribute float role;
attribute float shade;
uniform vec3 uRoles[${ROLES}];
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vAlbedo;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  int r = int(role + 0.5);
  vAlbedo = r == 0 ? atlas : uRoles[r] * clamp(shade, 0.55, 1.35);
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
const FRAGMENT = /* glsl */ `
${BANDING}
${FRESNEL}
uniform vec3 uShadeTint;
uniform vec3 uRimColour;
uniform vec3 uSunDirection;
uniform vec3 uWorldTint;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vAlbedo;
void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float light = bandedDiffuse(normal, uSunDirection);
  vec3 colour = vAlbedo * mix(uShadeTint, vec3(1.0), light);
  colour += uRimColour * fresnel(normal, viewDir, 3.0) * 0.18;
  gl_FragColor = vec4(colour * uWorldTint, 1.0);
}
`

/** Borrow the shared sun, world tint and ramp from an ordinary toon material,
 *  so people are lit exactly like the building round them. */
const SHARED = toon(0xffffff)
function personMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uRoles: { value: Array.from({ length: ROLES }, () => new Color(1, 1, 1)) },
      uShadeTint: { value: color(HEX.shade) },
      uRimColour: { value: color(HEX.paper) },
      uSunDirection: SHARED.uniforms.uSunDirection,
      uWorldTint: SHARED.uniforms.uWorldTint,
      uRamp: SHARED.uniforms.uRamp,
    },
  })
}

// ---- Accessories, built in bind space and parked on a bone ----

function onBone(geometry: BufferGeometry, bone: string): BufferGeometry {
  return geometry.applyMatrix4(IBM[BONE_INDEX.get(boneName(bone))!])
}
const headTop = HEAD.max.y
const headW = HEAD.max.x - HEAD.min.x
const headFront = HEAD.max.z
const headMidY = (HEAD.min.y + HEAD.max.y) / 2
const chestFront = BODY.max.z
const neck = bindPos('head')
const hips = bindPos('hips')

function capGeometry(): BufferGeometry {
  const r = headW * 0.5
  const crown = new CylinderGeometry(r * 0.98, r * 0.9, r * 0.5, 22)
  crown.translate(0, headTop - r * 0.12, -r * 0.02)
  const top = new CylinderGeometry(r * 1.02, r * 0.98, r * 0.1, 22)
  top.translate(0, headTop + r * 0.16, -r * 0.02)
  const band = new CylinderGeometry(r * 0.92, r * 0.92, r * 0.14, 22)
  band.translate(0, headTop - r * 0.36, -r * 0.02)
  const peak = new SphereGeometry(r * 0.7, 16, 6, 0, Math.PI, 0, Math.PI / 2)
  peak.scale(1.15, 0.16, 0.9)
  peak.rotateY(-Math.PI / 2)
  peak.translate(0, headTop - r * 0.44, r * 0.62)
  const badge = new SphereGeometry(r * 0.12, 10, 8)
  badge.scale(1, 1, 0.4)
  badge.translate(0, headTop - r * 0.1, r * 0.95)
  return onBone(mergeGeometries([paint(crown.toNonIndexed(), HEX.guardCap), paint(top.toNonIndexed(), HEX.guardCap), paint(band.toNonIndexed(), 0x0b0e10), paint(peak.toNonIndexed(), 0x0b0e10), paint(badge.toNonIndexed(), HEX.gateYellow)]), 'head')
}

function uniformGeometry(): BufferGeometry {
  const w = BODY.max.x - BODY.min.x
  const top = neck.y
  const tie = new BoxGeometry(w * 0.09, (top - hips.y) * 0.62, 0.02)
  tie.translate(0, top - (top - hips.y) * 0.36, chestFront + 0.005)
  const knot = new BoxGeometry(w * 0.12, w * 0.08, 0.03)
  knot.translate(0, top - 0.02, chestFront)
  const parts = [paint(tie.toNonIndexed(), 0x14181c), paint(knot.toNonIndexed(), 0x14181c)]
  for (const side of [1, -1]) {
    const ep = new BoxGeometry(w * 0.26, 0.05, w * 0.22)
    ep.translate(side * w * 0.4, top - 0.06, 0)
    parts.push(paint(ep.toNonIndexed(), 0x14181c))
  }
  const radio = new BoxGeometry(w * 0.1, w * 0.17, 0.05)
  radio.translate(-w * 0.26, top - (top - hips.y) * 0.25, chestFront - 0.01)
  parts.push(paint(radio.toNonIndexed(), 0x14181c))
  return onBone(mergeGeometries(parts), 'chest')
}

function clergyGeometry(): BufferGeometry {
  const w = BODY.max.x - BODY.min.x
  const band = new TorusGeometry(w * 0.2, w * 0.045, 8, 24)
  band.rotateX(Math.PI / 2)
  band.translate(0, neck.y + 0.01, 0)
  const tab = new BoxGeometry(w * 0.09, w * 0.08, 0.02)
  tab.translate(0, neck.y - 0.02, w * 0.2)
  const upright = new BoxGeometry(w * 0.05, w * 0.22, 0.02)
  upright.translate(0, neck.y - (neck.y - hips.y) * 0.42, chestFront + 0.01)
  const arm = new BoxGeometry(w * 0.15, w * 0.05, 0.02)
  arm.translate(0, neck.y - (neck.y - hips.y) * 0.36, chestFront + 0.012)
  return onBone(mergeGeometries([paint(band.toNonIndexed(), 0xf6f7f6), paint(tab.toNonIndexed(), 0xf6f7f6), paint(upright.toNonIndexed(), 0xc79a62), paint(arm.toNonIndexed(), 0xc79a62)]), 'chest')
}

function skirtGeometry(): BufferGeometry {
  const w = BODY.max.x - BODY.min.x
  const len = (hips.y - LEGS.min.y) * 0.62
  const flare = new CylinderGeometry(w * 0.5, w * 0.68, len, 24, 2, true)
  flare.translate(0, hips.y + 0.05 - len / 2, 0)
  flare.scale(1, 1, 0.85)
  return onBone(flare, 'hips')
}

function tacheGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (const side of [1, -1]) {
    const half = new SphereGeometry(headW * 0.07, 10, 6)
    half.scale(1.7, 0.55, 0.7)
    half.rotateZ(side * -0.25)
    half.translate(side * headW * 0.08, headMidY - (headTop - headMidY) * 0.32, headFront - 0.01)
    parts.push(half)
  }
  return onBone(mergeGeometries(parts), 'head')
}

/** A toothbrush-handle shiv with a taped grip and a razor edge. */
function shivGeometry(): BufferGeometry {
  const hand = bindPos('handslot.r')
  const grip = new BoxGeometry(0.06, 0.06, 0.2)
  grip.translate(hand.x, hand.y, hand.z + 0.02)
  const blade = new BoxGeometry(0.03, 0.05, 0.22)
  blade.translate(hand.x, hand.y, hand.z + 0.22)
  return onBone(mergeGeometries([paint(grip.toNonIndexed(), HEX.plastic), paint(blade.toNonIndexed(), HEX.metal)]), 'handslot.r')
}

/**
 * Where the mouth goes on each head, in bind space: under the nose, on the
 * surface of the face (found from the head's own vertices, so a beard puts
 * it a little further forward).
 */
const mouthSpots = new Map<string, Vector3>()
function mouthSpot(head: string): Vector3 {
  let spot = mouthSpots.get(head)
  if (spot) return spot
  const y = headMidY - (headTop - headMidY) * 0.5
  const pos = PARTS.get(`head.${head}`)!.getAttribute('position')
  let z = -Infinity
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i)) < headW * 0.12 && Math.abs(pos.getY(i) - y) < headW * 0.08) z = Math.max(z, pos.getZ(i))
  }
  spot = new Vector3(0, y, (Number.isFinite(z) ? z : headFront) - headW * 0.015)
  mouthSpots.set(head, spot)
  return spot
}
const MOUTH = (() => {
  const g = new SphereGeometry(headW * 0.062, 12, 8)
  g.scale(1.5, 1, 0.45)
  return paint(g.toNonIndexed(), 0x2a1614)
})()

const ACCESSORY = {
  shiv: shivGeometry(),
  cap: capGeometry(),
  uniform: uniformGeometry(),
  clergy: clergyGeometry(),
  skirt: skirtGeometry(),
  tache: tacheGeometry(),
}

// ---- Looks: which parts make up a person ----

const merged = new Map<string, BufferGeometry>()
function lookGeometry(head: string, body: string): BufferGeometry {
  const key = `${head}|${body}`
  let g = merged.get(key)
  if (!g) {
    g = mergeGeometries([`head.${head}`, `body.${body}`, 'arm.l', 'arm.r', 'leg.l', 'leg.r'].map((k) => PARTS.get(k)!))
    g.computeBoundingSphere()
    // Animated limbs reach well outside the bind pose.
    g.boundingSphere!.radius *= 1.6
    merged.set(key, g)
  }
  return g
}

function shadeHex(hex: number, k: number): number {
  const c = new Color(hex).multiplyScalar(k)
  return c.getHex()
}

// ---- One person ----

const tmpQ = new Quaternion()
const qParent = new Quaternion()
const qDelta = new Quaternion()
const axisW = new Vector3()
const m4 = new Matrix4()
const AXIS_X = new Vector3(1, 0, 0)
const AXIS_Z = new Vector3(0, 0, 1)
/** Where the clips put the body relative to its spot, per pose: sitting
 *  clips sit behind the root, lying clips lie from feet to head along -z. */
const SIT_FORWARD = 0.41
const LIE_BACK = 0.5
const LIE_UP = 0.09

export class Person {
  readonly root = new Object3D()
  readonly bones: Bone[]
  readonly mesh: SkinnedMesh
  readonly mixer: AnimationMixer
  private readonly material = personMaterial()
  private readonly actions = new Map<string, AnimationAction>()
  private current = ''
  private readonly extras: Record<keyof typeof ACCESSORY, Mesh>
  /** Bones posed by hand last frame, and what the mixer had them at. The
   *  mixer only writes a bone when its value changes, so hand-posed bones
   *  go back before it runs again. */
  private readonly posed = new Map<Bone, Quaternion>()
  private look = ''
  /** A little dark mouth on the face, open and shut while they talk. */
  private readonly mouth: Mesh
  private mouthTime = cosmetic() * 10
  /** In the camera's view as of the last cull; out of it, nothing is posed. */
  seen = true
  /** Animation time not yet given to the mixer. */

  constructor() {
    const rig = new Object3D()
    rig.position.fromArray(D.rig.t)
    rig.quaternion.fromArray(D.rig.r)
    rig.scale.fromArray(D.rig.s)
    this.root.add(rig)
    this.bones = D.bones.map((b) => {
      const bone = new Bone()
      bone.name = boneName(b.name)
      bone.position.fromArray(b.t)
      bone.quaternion.fromArray(b.r)
      bone.scale.fromArray(b.s)
      return bone
    })
    D.bones.forEach((b, i) => (b.parent >= 0 ? this.bones[b.parent] : rig).add(this.bones[i]))
    this.mesh = new SkinnedMesh(lookGeometry('short', 'tunic'), this.material)
    this.mesh.layers.enable(SOLID_LAYER)
    rig.add(this.mesh)
    this.mesh.bind(new Skeleton(this.bones, IBM), new Matrix4())
    this.mixer = new AnimationMixer(this.root)
    const extra = (g: BufferGeometry, bone: string) => {
      const m = new Mesh(g, toon(0xffffff, { tinted: true }))
      m.layers.enable(SOLID_LAYER)
      m.visible = false
      this.bones[BONE_INDEX.get(boneName(bone))!].add(m)
      return m
    }
    this.extras = {
      shiv: extra(ACCESSORY.shiv, 'handslot.r'),
      cap: extra(ACCESSORY.cap, 'head'),
      uniform: extra(ACCESSORY.uniform, 'chest'),
      clergy: extra(ACCESSORY.clergy, 'chest'),
      skirt: extra(ACCESSORY.skirt, 'hips'),
      tache: extra(ACCESSORY.tache, 'head'),
    }
    // The mouth hangs off a pivot that undoes the head bone's bind pose, so
    // it can be placed and squashed in plain bind-space units.
    const pivot = new Object3D()
    pivot.matrixAutoUpdate = false
    pivot.matrix.copy(IBM[BONE_INDEX.get(boneName('head'))!])
    this.bones[BONE_INDEX.get(boneName('head'))!].add(pivot)
    this.mouth = new Mesh(MOUTH, toon(0xffffff, { tinted: true }))
    this.mouth.layers.enable(SOLID_LAYER)
    pivot.add(this.mouth)
    // Their own materials: these two change colour per person.
    const own = () => createToonMaterial({ albedo: new Color(1, 1, 1), shadeTint: color(HEX.shade), rimColour: color(HEX.paper), rimStrength: 0.18 })
    this.extras.skirt.material = own()
    this.extras.tache.material = own()
  }

  dress(b: Body, index: number): void {
    const head = b.longHair ? 'long' : b.beard ? 'beard' : b.tuft ? 'quiff' : 'short'
    const body = b.uniform || b.clergy || b.skirt != null || index % 3 !== 1 ? 'tunic' : 'vest'
    const look = `${head}|${body}`
    if (look !== this.look) {
      this.mesh.geometry = lookGeometry(head, body)
      this.look = look
      this.mouth.position.copy(mouthSpot(head))
    }
    const roles = this.material.uniforms.uRoles.value as Color[]
    const hair = b.hair ?? shadeHex(b.skin, 0.92)
    const top = b.uniform ? HEX.guardShirt : b.top
    roles[1].setHex(b.skin)
    roles[2].setHex(hair)
    roles[3].setHex(top)
    roles[4].setHex(b.uniform ? HEX.guardShirt : shadeHex(top, 0.82))
    roles[5].setHex(b.skirt != null ? b.skirt : b.trousers)
    roles[6].setHex(0x24272b)
    roles[7].setHex(b.uniform ? 0x14181c : 0x3a3330)
    this.extras.cap.visible = b.cap
    this.extras.uniform.visible = b.uniform
    this.extras.clergy.visible = b.clergy
    this.extras.skirt.visible = b.skirt != null
    if (b.skirt != null) (this.extras.skirt.material as ShaderMaterial).uniforms.uAlbedo.value.setHex(b.skirt)
    this.extras.tache.visible = b.tache && !b.beard
    ;(this.extras.tache.material as ShaderMaterial).uniforms.uAlbedo.value.setHex(hair)
  }

  private play(name: string, fade = 0.18, once = false, timeScale = 1): void {
    let a = this.actions.get(name)
    if (!a) {
      a = this.mixer.clipAction(CLIPS.get(name)!)
      this.actions.set(name, a)
    }
    a.timeScale = timeScale
    if (name === this.current) return
    if (once) {
      a.setLoop(LoopOnce, 1)
      a.clampWhenFinished = true
    }
    a.reset().play()
    const prev = this.actions.get(this.current)
    if (prev) a.crossFadeFrom(prev, fade, false)
    this.current = name
  }

  /** Seconds of animation not yet played (a distant person animates in
   *  steps; their position still moves every frame). */
  private owed = 0

  update(b: Body, delta: number, animate = true): void {
    this.root.visible = b.visible
    this.extras.shiv.visible = b.shiv
    if (!b.visible) return
    this.talk(b, delta)
    b.poseTime += delta
    b.stride += b.speed * delta * 3.2
    const s = (BODY_HEIGHT / MODEL_HEIGHT) * b.height
    this.root.scale.set(s * (0.85 + b.build * 0.15), s, s * (0.9 + b.build * 0.1))
    this.root.position.set(b.x, b.y, b.z)
    this.root.rotation.set(0, b.yaw, 0)
    const k = s / (BODY_HEIGHT / MODEL_HEIGHT)
    if (b.pose === 'sit') this.root.translateZ(SIT_FORWARD * k)
    if (b.pose === 'sleep') {
      this.root.translateZ(-LIE_BACK * k)
      this.root.position.y += LIE_UP
    }
    let crawl = false
    switch (b.pose) {
      case 'stand':
      case 'walk':
        if (b.speed < 0.25) this.play('Idle')
        else if (b.speed < 3.2) this.play('Walking_A', 0.18, false, Math.min(1.6, Math.max(0.6, b.speed / 2.1)))
        else this.play('Running_A', 0.15, false, Math.min(1.5, Math.max(0.8, b.speed / 5)))
        break
      case 'fight': {
        const seq = ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Idle', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Idle', 'Unarmed_Melee_Attack_Kick', 'Unarmed_Idle']
        this.play(seq[Math.floor((b.poseTime + b.stride * 0.01) / 0.55) % seq.length], 0.1)
        break
      }
      case 'down':
        this.play('Death_A', 0.15, true)
        break
      case 'sleep':
        this.play('Lie_Idle', 0.3)
        break
      case 'sit':
        this.play('Sit_Chair_Idle', 0.25)
        break
      case 'crawl':
        this.play('Idle', 0.2)
        crawl = true
        break
      case 'cuffed':
        this.play(b.speed > 0.25 ? 'Walking_B' : 'Idle')
        break
      case 'phone':
        this.play('Use_Item')
        break
      case 'wave':
        this.play('Cheer')
        break
      case 'search':
        this.play('PickUp')
        break
      case 'talk':
        // Interact bends over to reach for something; a chat is stood easy.
        this.play('Idle')
        break
    }
    // Banked, up to a second: clips loop or hold, so more makes no difference.
    this.owed = Math.min(1, this.owed + delta)
    if (!this.seen || (!animate && !crawl)) return
    this.pose(b)
  }

  /** Brings the skeleton up to date: the mixer, then any hand posing. */
  private pose(b: Body): void {
    for (const [bone, q] of this.posed) bone.quaternion.copy(q)
    this.posed.clear()
    this.mixer.update(this.owed)
    this.owed = 0
    if (b.pose === 'crawl') this.crawl(b)
  }

  /**
   * Shows or hides them for this frame's camera. Hidden, they are taken out
   * of the scene, so neither the renderer nor the scene's matrix update
   * walks their skeleton (some forty bones). Coming back into view, they
   * catch up the animation they missed.
   */
  setSeen(b: Body, seen: boolean, group: Object3D): void {
    const show = b.visible && seen
    if (show && this.root.parent !== group) group.add(this.root)
    else if (!show && this.root.parent) this.root.removeFromParent()
    const was = this.seen
    this.seen = seen
    if (seen && !was && b.visible) this.pose(b)
  }

  /** Shut, a thin line; talking, it opens and closes in uneven bursts with
   *  little pauses between words. */
  private talk(b: Body, delta: number): void {
    let open = 0.18
    if (b.talking && b.pose !== 'sleep' && b.pose !== 'down') {
      this.mouthTime += delta
      const t = this.mouthTime
      const words = Math.sin(t * 2.3) + Math.sin(t * 3.7 + 1.3) * 0.6 > -0.7
      if (words) open = 0.3 + 0.7 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 5.3))
    }
    this.mouth.scale.set(1 - open * 0.25, open, 1)
  }

  /** Turns a bone about one of the character's own axes (model space:
   *  +y up, +z forward), whatever its parents are doing. */
  private turn(name: string, axis: Vector3, angle: number): void {
    const bone = this.bones[BONE_INDEX.get(boneName(name))!]
    if (!this.posed.has(bone)) this.posed.set(bone, bone.quaternion.clone())
    bone.parent!.updateWorldMatrix(true, false)
    bone.parent!.getWorldQuaternion(qParent)
    axisW.copy(axis).applyQuaternion(this.root.quaternion)
    qDelta.setFromAxisAngle(axisW, angle)
    // local' = parent^-1 * delta * parent * local
    tmpQ.copy(qParent).invert().multiply(qDelta).multiply(qParent)
    bone.quaternion.premultiply(tmpQ)
  }

  private boneWorld(name: string): Vector3 {
    const bone = this.bones[BONE_INDEX.get(boneName(name))!]
    bone.updateWorldMatrix(true, false)
    return bone.getWorldPosition(new Vector3())
  }

  /** Hands and knees: there is no crawl in the pack, so it is posed onto
   *  the bones after the idle clip, with a diagonal gait. */
  private crawl(b: Body): void {
    const c = Math.sin(b.stride * 0.8) * Math.min(1, b.speed * 1.5)
    const a = 1.25
    // Drop the hips to kneeling height: one thigh plus a knee.
    const hipsY = this.boneWorld('hips').y - this.root.position.y
    const thigh = this.boneWorld('upperleg_l').distanceTo(this.boneWorld('lowerleg_l'))
    this.root.position.y -= Math.max(0, hipsY - thigh * 1.15)
    this.turn('hips', AXIS_X, a)
    this.turn('upperleg_l', AXIS_X, -a + 0.1 + c * 0.3)
    this.turn('upperleg_r', AXIS_X, -a + 0.1 - c * 0.3)
    this.turn('lowerleg_l', AXIS_X, 1.45 - Math.max(0, c) * 0.3)
    this.turn('lowerleg_r', AXIS_X, 1.45 - Math.max(0, -c) * 0.3)
    this.turn('upperarm_l', AXIS_X, -a + 0.1 - c * 0.35)
    this.turn('upperarm_r', AXIS_X, -a + 0.1 + c * 0.35)
    this.turn('upperarm_l', AXIS_Z, -0.5)
    this.turn('upperarm_r', AXIS_Z, 0.5)
    this.turn('head', AXIS_X, -a * 0.8)
    this.turn('hips', AXIS_Z, c * 0.06)
  }
}

/** Same shape as Crowd, so the game can swap one for the other. */
export class People {
  readonly group = new Object3D()
  private readonly people: Person[] = []

  constructor(readonly capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const p = new Person()
      this.people.push(p)
      this.group.add(p.root)
    }
  }

  paint(index: number, body: Body): void {
    this.people[index]?.dress(body, index)
  }

  private frame = 0

  /** Bodies[0] is the player. Anyone far from them animates less often,
   *  catching up the time they skipped, which nobody can see from the
   *  camera but saves a phone most of the work. */
  update(bodies: Body[], delta: number): void {
    const count = Math.min(bodies.length, this.capacity)
    const focus = bodies[0]
    this.frame++
    for (let i = 0; i < count; i++) {
      const b = bodies[i]
      const d = focus ? Math.abs(b.x - focus.x) + Math.abs(b.z - focus.z) : 0
      const every = d > 80 ? 6 : d > 40 ? 3 : 1
      this.people[i].update(b, delta, every === 1 || (this.frame + i) % every === 0)
    }
    for (let i = count; i < this.capacity; i++) this.people[i].root.visible = false
  }

  private readonly frustum = new Frustum()
  private readonly sphere = new Sphere()

  /**
   * After the camera is placed for the frame: hides everyone it cannot see.
   * On a phone in portrait that is most of the prison, and it is the
   * biggest saving there is (see scripts/perf/phone.cjs).
   */
  cull(bodies: Body[], camera: Camera): void {
    camera.updateMatrixWorld()
    this.frustum.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const count = Math.min(bodies.length, this.capacity)
    for (let i = 0; i < count; i++) {
      const b = bodies[i]
      // Round the whole person, lying down or arms out, with a little to spare.
      this.sphere.center.set(b.x, b.y + 0.9, b.z)
      this.sphere.radius = 1.8 * b.height
      this.people[i].setSeen(b, this.frustum.intersectsSphere(this.sphere), this.group)
    }
  }
}
