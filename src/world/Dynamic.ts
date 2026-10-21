import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from 'three'
import { HEX, color } from '../art/palette'
import { mergePainted } from '../art/paint'
import { toon } from '../art/toonMaterial'
import { ball, box, cyl } from '../art/shapes'
import { SOLID_LAYER } from '../render/CelPipeline'
import type { ItemId } from '../game/Items'
import { ITEMS } from '../game/Items'
import { type Door, type Grate, type Grid, TILE } from './Grid'
import { PERIMETER_H, WALL_H } from './Build'

/**
 * Everything in the prison that moves or changes: doors and gates, vent
 * grilles, the ducts (only drawn while you are in them), loose items, the
 * officers' sight cones, the getaway car, the signal flag and riot smoke.
 */
/** Rays per sight cone: most across the front, a few round the back. */
export const CONE_RAYS = 40
export const CONE_FRONT_RAYS = 28

function solid(geometry: BufferGeometry): Mesh {
  const m = new Mesh(geometry, toon(0xffffff, { tinted: true }))
  m.layers.enable(SOLID_LAYER)
  return m
}

interface DoorVisual {
  door: Door
  pivot: Object3D
  mode: 'swing' | 'slide'
}

export interface LooseItem {
  id: ItemId
  x: number
  z: number
  mesh: Mesh
  zone: string
}

export class Dynamic {
  readonly group = new Group()
  private readonly doors: DoorVisual[] = []
  private readonly grates = new Map<Grate, { open: Mesh; shut: Mesh; sealed: Mesh }>()
  readonly ducts = new Group()
  readonly items: LooseItem[] = []
  private readonly itemGroup = new Group()
  private readonly cones: Mesh[] = []
  private readonly coneGroup = new Group()
  readonly car = new Group()
  readonly flag = new Group()
  readonly smoke = new Group()
  readonly marker: Mesh
  private time = 0

  constructor(private readonly grid: Grid) {
    this.group.add(this.ducts, this.itemGroup, this.coneGroup, this.car, this.flag, this.smoke)
    for (const door of grid.doors) this.buildDoor(door)
    for (const g of grid.grates) this.buildGrate(g)
    this.buildDucts()
    this.buildCar()
    this.buildFlag()
    this.buildSmoke()

    const chevron = new ConeGeometry(0.28, 0.5, 4)
    chevron.rotateX(Math.PI)
    this.marker = new Mesh(chevron, new MeshBasicMaterial({ color: color(HEX.player), depthTest: false, transparent: true }))
    this.marker.renderOrder = 10
    this.group.add(this.marker)
  }

  private buildDoor(door: Door): void {
    const holder = new Group()
    holder.position.set((door.tx + 0.5) * TILE, 0, (door.ty + 0.5) * TILE)
    if (door.axis === 'y') holder.rotation.y = Math.PI / 2
    const pivot = new Group()
    holder.add(pivot)
    const parts: BufferGeometry[] = []
    let mode: 'swing' | 'slide' = 'swing'
    const w = TILE
    // Frame (fixed), shared by all.
    const frame: BufferGeometry[] = [
      box(0.16, WALL_H, 0.5, { x: -w / 2 + 0.08, y: 0, z: 0 }, HEX.steelDark),
      box(0.16, WALL_H, 0.5, { x: w / 2 - 0.08, y: 0, z: 0 }, HEX.steelDark),
      box(w, 0.4, 0.5, { x: 0, y: WALL_H - 0.4, z: 0 }, HEX.steelDark),
    ]
    const leaf = w - 0.3
    switch (door.kind) {
      case 'cell':
        pivot.position.x = -leaf / 2
        parts.push(box(leaf, 2.1, 0.14, { x: leaf / 2, y: 0, z: 0 }, HEX.doorBlue))
        parts.push(box(0.5, 0.3, 0.16, { x: leaf / 2, y: 1.35, z: 0 }, HEX.ink))
        parts.push(box(0.12, 0.12, 0.22, { x: leaf - 0.25, y: 1.0, z: 0 }, HEX.metal))
        break
      case 'room':
        pivot.position.x = -leaf / 2
        parts.push(box(leaf, 2.1, 0.1, { x: leaf / 2, y: 0, z: 0 }, HEX.wallGreen))
        parts.push(box(0.8, 0.6, 0.12, { x: leaf / 2, y: 1.2, z: 0 }, HEX.window))
        break
      case 'secure':
        pivot.position.x = -leaf / 2
        parts.push(box(leaf, 2.2, 0.16, { x: leaf / 2, y: 0, z: 0 }, HEX.doorRed))
        parts.push(box(leaf, 0.12, 0.18, { x: leaf / 2, y: 1.6, z: 0 }, HEX.gateYellow))
        break
      case 'gate':
      case 'perimeter': {
        mode = 'slide'
        const h = door.kind === 'perimeter' ? PERIMETER_H - 0.4 : WALL_H - 0.4
        if (door.kind === 'perimeter') frame.push(box(w, 0.6, 0.6, { x: 0, y: PERIMETER_H - 0.6, z: 0 }, HEX.steelDark), box(0.2, PERIMETER_H, 0.6, { x: -w / 2 + 0.1, y: 0, z: 0 }, HEX.steelDark), box(0.2, PERIMETER_H, 0.6, { x: w / 2 - 0.1, y: 0, z: 0 }, HEX.steelDark))
        for (let i = 0; i < 7; i++) parts.push(box(0.07, h, 0.07, { x: -leaf / 2 + 0.1 + i * ((leaf - 0.2) / 6), y: 0, z: 0 }, HEX.gateYellow))
        for (const y of [0.15, h * 0.5, h - 0.15]) parts.push(box(leaf, 0.1, 0.1, { x: 0, y, z: 0 }, HEX.gateYellow))
        break
      }
    }
    holder.add(solid(mergePainted(frame)))
    pivot.add(solid(mergePainted(parts)))
    this.group.add(holder)
    this.doors.push({ door, pivot, mode })
  }

  private buildGrate(g: Grate): void {
    const x = (g.tx + 0.5) * TILE
    const z = (g.ty + 0.5) * TILE
    const grille: BufferGeometry[] = [box(1.0, 0.04, 1.0, { x, y: 0.01, z }, HEX.vent)]
    for (let i = 0; i < 5; i++) grille.push(box(0.9, 0.05, 0.06, { x, y: 0.03, z: z - 0.36 + i * 0.18 }, HEX.steelDark))
    const shut = solid(mergePainted(grille))
    const open = solid(mergePainted([box(1.0, 0.04, 1.0, { x: x + 0.8, y: 0.01, z: z + 0.3, ry: 0.4 }, HEX.vent), box(0.95, 0.02, 0.95, { x, y: 0.005, z }, HEX.ink)]))
    const sealed = solid(mergePainted([box(1.1, 0.06, 1.1, { x, y: 0.01, z }, HEX.steelDark), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ball(0.06, { x: x + sx * 0.42, y: 0.07, z: z + sz * 0.42 }, HEX.metal)))]))
    // The player's grille is on the cell wall, not the floor: same piece, stood up.
    if (g.id === 'your cell') {
      for (const m of [shut, open, sealed]) m.visible = false
    }
    this.group.add(shut, open, sealed)
    this.grates.set(g, { open, shut, sealed })
  }

  private buildDucts(): void {
    const parts: BufferGeometry[] = []
    for (const d of this.grid.ducts) {
      const x0 = d.x0 * TILE
      const x1 = (d.x1 + 1) * TILE
      const z0 = d.y0 * TILE
      const z1 = (d.y1 + 1) * TILE
      const w = x1 - x0
      const dd = z1 - z0
      const cx = (x0 + x1) / 2
      const cz = (z0 + z1) / 2
      parts.push(box(w - 0.2, 0.08, dd - 0.2, { x: cx, y: WALL_H + 0.05, z: cz }, HEX.duct))
      // Side rails so the duct reads as a tube from above.
      if (w > dd) {
        parts.push(box(w - 0.2, 0.5, 0.12, { x: cx, y: WALL_H + 0.05, z: z0 + 0.15 }, HEX.vent))
        parts.push(box(w - 0.2, 0.5, 0.12, { x: cx, y: WALL_H + 0.05, z: z1 - 0.15 }, HEX.vent))
        for (let x = x0 + 1; x < x1; x += 2) parts.push(box(0.08, 0.52, dd - 0.2, { x, y: WALL_H + 0.05, z: cz }, HEX.steel))
      } else {
        parts.push(box(0.12, 0.5, dd - 0.2, { x: x0 + 0.15, y: WALL_H + 0.05, z: cz }, HEX.vent))
        parts.push(box(0.12, 0.5, dd - 0.2, { x: x1 - 0.15, y: WALL_H + 0.05, z: cz }, HEX.vent))
        for (let z = z0 + 1; z < z1; z += 2) parts.push(box(w - 0.2, 0.52, 0.08, { x: cx, y: WALL_H + 0.05, z }, HEX.steel))
      }
    }
    for (const g of this.grid.grates) parts.push(box(1.1, 0.1, 1.1, { x: (g.tx + 0.5) * TILE, y: WALL_H + 0.1, z: (g.ty + 0.5) * TILE }, HEX.gateYellow))
    const mesh = new Mesh(mergePainted(parts), toon(0xffffff, { tinted: true, emissive: 0.55 }))
    mesh.layers.enable(SOLID_LAYER)
    this.ducts.add(mesh)
    this.ducts.visible = false
  }

  private buildCar(): void {
    const parts: BufferGeometry[] = [
      box(4.2, 0.8, 1.9, { x: 0, y: 0.35, z: 0 }, HEX.car),
      box(2.4, 0.7, 1.7, { x: -0.3, y: 1.15, z: 0 }, HEX.carDark),
      box(2.2, 0.55, 1.75, { x: -0.3, y: 1.2, z: 0 }, HEX.window),
      box(0.1, 0.25, 0.4, { x: 2.1, y: 0.75, z: 0.6 }, HEX.torch),
      box(0.1, 0.25, 0.4, { x: 2.1, y: 0.75, z: -0.6 }, HEX.torch),
    ]
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.95, 0.95]) parts.push(cyl(0.38, 0.38, 0.3, { x: sx, y: 0.2, z: sz }, HEX.ink, 10))
    const car = solid(mergePainted(parts))
    this.car.add(car)
    this.car.position.set(40 * TILE, 0, 65.6 * TILE)
    this.car.visible = false
  }

  private buildFlag(): void {
    const flag = solid(mergePainted([box(1.4, 0.9, 0.04, { x: 0.75, y: 0, z: 0 }, HEX.cloth), box(0.5, 0.5, 0.06, { x: 0.75, y: 0.2, z: 0 }, HEX.clothesRed)]))
    this.flag.add(flag)
    this.flag.visible = false
  }

  private buildSmoke(): void {
    for (let i = 0; i < 10; i++) {
      const puff = new Mesh(ball(0.8, { x: 0, y: 0, z: 0 }, i % 3 === 0 ? HEX.fire : HEX.smoke), toon(0xffffff, { tinted: true, emissive: i % 3 === 0 ? 0.8 : 0.1 }))
      this.smoke.add(puff)
    }
    this.smoke.visible = false
  }

  private bunkNote: Mesh | null = null

  /** The folded note on your bunk. */
  setBunkNote(x: number, z: number, visible: boolean): void {
    if (!this.bunkNote) {
      this.bunkNote = new Mesh(mergePainted([box(0.34, 0.02, 0.26, { x: 0, y: 0, z: 0, ry: 0.3 }, HEX.paper), box(0.34, 0.02, 0.13, { x: 0.02, y: 0.02, z: 0.05, ry: 0.25 }, HEX.cloth)]), toon(0xffffff, { tinted: true, emissive: 0.3 }))
      this.bunkNote.layers.enable(SOLID_LAYER)
      this.group.add(this.bunkNote)
    }
    this.bunkNote.visible = visible
    this.bunkNote.position.set(x, 0.76 + Math.sin(this.time * 2) * 0.01, z)
  }

  spawnItem(id: ItemId, x: number, z: number, zone: string): LooseItem {
    const def = ITEMS[id]
    const long = ['poolCue', 'mopHandle', 'spear', 'rope', 'grapple'].includes(id)
    const flat = ['bedsheet', 'magazine', 'tray', 'flag'].includes(id)
    const geometry = long
      ? box(1.4, 0.1, 0.1, { x: 0, y: 0, z: 0 }, def.hex)
      : flat
        ? box(0.6, 0.08, 0.45, { x: 0, y: 0, z: 0 }, def.hex)
        : box(0.3, 0.2, 0.3, { x: 0, y: 0, z: 0 }, def.hex)
    const mesh = new Mesh(geometry, toon(0xffffff, { tinted: true, emissive: 0.25 }))
    mesh.layers.enable(SOLID_LAYER)
    mesh.position.set(x, 0.15, z)
    this.itemGroup.add(mesh)
    const item = { id, x, z, mesh, zone }
    this.items.push(item)
    return item
  }

  removeItem(item: LooseItem): void {
    const i = this.items.indexOf(item)
    if (i >= 0) this.items.splice(i, 1)
    this.itemGroup.remove(item.mesh)
  }

  /**
   * The sight guide: one flat fan per officer, laid on the floor and cut off
   * by walls. The wide part is how far they see in front; the small ring
   * behind is how close you can get before they notice you anyway.
   */
  ensureCones(count: number): void {
    while (this.cones.length < count) {
      const g = new BufferGeometry()
      const positions = new Float32Array((CONE_RAYS + 1) * 3)
      g.setAttribute('position', new BufferAttribute(positions, 3))
      const index: number[] = []
      for (let i = 1; i <= CONE_RAYS; i++) index.push(0, i, (i % CONE_RAYS) + 1)
      g.setIndex(index)
      const m = new Mesh(g, new MeshBasicMaterial({ color: new Color(HEX.visionCalm), transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }))
      m.frustumCulled = false
      m.renderOrder = 2
      this.cones.push(m)
      this.coneGroup.add(m)
    }
  }

  /** `points` is CONE_RAYS pairs of world x, z around the officer. */
  setCone(i: number, x: number, z: number, points: Float32Array | null, alert: number): void {
    const m = this.cones[i]
    m.visible = !!points
    if (!points) return
    const attr = m.geometry.getAttribute('position') as BufferAttribute
    const a = attr.array as Float32Array
    a[0] = x
    a[1] = 0.05
    a[2] = z
    for (let k = 0; k < CONE_RAYS; k++) {
      a[(k + 1) * 3] = points[k * 2]
      a[(k + 1) * 3 + 1] = 0.05
      a[(k + 1) * 3 + 2] = points[k * 2 + 1]
    }
    attr.needsUpdate = true
    const mat = m.material as MeshBasicMaterial
    mat.color.copy(color(HEX.visionCalm)).lerp(color(HEX.visionAlert), Math.min(1, alert))
    mat.opacity = 0.2 + alert * 0.2
  }

  update(delta: number, opts: { flag: boolean; car: boolean; smokeAt: { x: number; z: number } | null; flagAt: { x: number; z: number } }): void {
    this.time += delta
    for (const v of this.doors) {
      const o = v.door.openness
      if (v.mode === 'swing') v.pivot.rotation.y = -o * 1.6
      else v.pivot.position.x = o * (TILE - 0.35)
    }
    for (const [g, m] of this.grates) {
      if (g.id === 'your cell') continue
      m.sealed.visible = g.sealed
      m.open.visible = !g.sealed && g.open
      m.shut.visible = !g.sealed && !g.open
    }
    for (const it of this.items) {
      it.mesh.position.y = 0.18 + Math.sin(this.time * 3 + it.x) * 0.06
      it.mesh.rotation.y += delta * 1.2
    }
    this.flag.visible = opts.flag
    if (opts.flag) {
      this.flag.position.set(opts.flagAt.x, 5.7, opts.flagAt.z)
      this.flag.rotation.y = Math.sin(this.time * 2) * 0.3
    }
    this.car.visible = opts.car
    this.smoke.visible = !!opts.smokeAt
    if (opts.smokeAt) {
      this.smoke.children.forEach((puff, i) => {
        const t = (this.time * 0.6 + i / 10) % 1
        puff.position.set(opts.smokeAt!.x + Math.sin(i * 7.1) * 2.2, 0.6 + t * 4.5, opts.smokeAt!.z + Math.cos(i * 3.3) * 1.2)
        puff.scale.setScalar(0.4 + t * 1.2)
      })
    }
  }
}
