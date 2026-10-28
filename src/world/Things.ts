import { type BufferGeometry, Mesh, type Object3D } from 'three'
import { mergePainted } from '../art/paint'
import { toon } from '../art/toonMaterial'
import { SOLID_LAYER } from '../render/CelPipeline'

/**
 * Things in the world: the wheelie bins, the fire engine, a flight case, the
 * basketball. Each one says what it looks like, where it is (and whether it
 * is there at all) this frame, and what you can do next to it; the registry
 * builds its mesh the first time it is shown, places it every frame and
 * gathers its prompts. Adding something new to the prison is one object,
 * not a change to the renderer, the frame loop and the prompt builder.
 */
export type Add = (key: string, label: string, run: () => void) => void
export type Near = (x: number, z: number, r: number) => boolean

export interface Placement {
  x: number
  z: number
  /** Height of its origin; most things sit on the floor. */
  y?: number
  /** Turned about the vertical, and (for a ball) rolled. */
  ry?: number
  rx?: number
  visible: boolean
}

export interface Thing {
  /** Unique: registering the same id again replaces the old one. */
  readonly id: string
  /** Painted parts, built once, the first time it is shown. */
  model(): BufferGeometry[]
  /** Where it is this frame. */
  place(): Placement
  /** What you can do near it (only asked while it is visible). */
  prompts?(add: Add, near: Near): void
  /** Its own behaviour, every frame, before it is placed. */
  update?(delta: number): void
}

export class Things {
  private readonly list: Thing[] = []
  private readonly meshes = new Map<string, Mesh>()

  /** `group` is where meshes go: asked for late, so things can be added before the scene exists. */
  constructor(private readonly group: () => Object3D) {}

  add<T extends Thing>(thing: T): T {
    this.remove(thing.id)
    this.list.push(thing)
    return thing
  }

  remove(id: string): void {
    const i = this.list.findIndex((t) => t.id === id)
    if (i >= 0) this.list.splice(i, 1)
    const m = this.meshes.get(id)
    if (m) {
      m.removeFromParent()
      m.geometry.dispose()
      this.meshes.delete(id)
    }
  }

  get(id: string): Thing | undefined {
    return this.list.find((t) => t.id === id)
  }

  update(delta: number): void {
    for (const t of this.list) {
      t.update?.(delta)
      const p = t.place()
      let m = this.meshes.get(t.id)
      if (!m) {
        if (!p.visible) continue
        m = new Mesh(mergePainted(t.model()), toon(0xffffff, { tinted: true }))
        m.layers.enable(SOLID_LAYER)
        this.group().add(m)
        this.meshes.set(t.id, m)
      }
      m.visible = p.visible
      m.position.set(p.x, p.y ?? 0.01, p.z)
      m.rotation.set(p.rx ?? 0, p.ry ?? 0, 0)
    }
  }

  prompts(add: Add, near: Near): void {
    for (const t of this.list) if (t.prompts && t.place().visible) t.prompts(add, near)
  }
}
