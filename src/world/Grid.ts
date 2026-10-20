/**
 * HMP Blackmoor, as a tile grid.
 *
 * One tile is two metres. Everything that needs to know where things are -
 * collision, pathfinding, vision, the minimap, the mesh builder: reads this
 * one grid, so the walls you see are exactly the walls the guards walk round.
 *
 * Layout, north at the top:
 *
 *        [ Block A ][Showers][Laundry][ Block B ]
 *        [ landing ]=[ corridor N ]=[ landing ]
 *   [Solitary][Infirmary][  HUB / canteen  ][Games room][Maintenance]
 *        [ Block C ]=[ corridor S ]=[ Block D ]
 *              [        exercise yard        ]
 *   =========== perimeter wall ===== gatehouse ===
 *                   the road out
 */

export const TILE = 2
export const MAP_W = 80
export const MAP_H = 72

export const enum Tile {
  Solid = 0,
  Floor = 1,
  Door = 2,
  Perimeter = 3,
  Outside = 4,
}

export type DoorKind = 'cell' | 'room' | 'gate' | 'secure' | 'perimeter'

export interface Door {
  id: number
  kind: DoorKind
  tx: number
  ty: number
  /** Runs along x (a door in a north or south wall) or along y. */
  axis: 'x' | 'y'
  /** 0 shut .. 1 fully open, animated. */
  openness: number
  /** Wants to be open this frame. Set by whoever is holding it. */
  held: boolean
  /** Locked doors only open for a key holder or a guard. */
  locked: boolean
  /** Toothpaste in the strike plate: it looks locked, it is not. */
  jammed: boolean
  /** For cell doors, the cell zone behind it. */
  cell: string | null
  zones: [string, string]
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Grate {
  id: string
  tx: number
  ty: number
  zone: string
  sealed: boolean
  /** Unscrewed and propped open: someone has been in. */
  open: boolean
}

export interface CellInfo {
  zone: string
  block: BlockId
  index: number
  rect: Rect
  door: Door
  bunks: { x: number; z: number }[]
}

export type BlockId = 'A' | 'B' | 'C' | 'D'

export const BLOCKS: BlockId[] = ['A', 'B', 'C', 'D']

export interface Room {
  zone: string
  name: string
  rects: Rect[]
  outdoor?: boolean
  floor: string
}

/** The cell the player is put in. Block A, south landing, third along. */
export const PLAYER_CELL = 'cellA7'

export class Grid {
  readonly tiles = new Uint8Array(MAP_W * MAP_H)
  readonly zoneOf: string[] = new Array(MAP_W * MAP_H).fill('')
  readonly doors: Door[] = []
  private readonly doorAt = new Map<number, Door>()
  readonly rooms = new Map<string, Room>()
  readonly cells = new Map<string, CellInfo>()
  readonly ducts: Rect[] = []
  readonly grates: Grate[] = []
  readonly blockGate = new Map<BlockId, Door>()
  /** Perimeter tiles a grappling hook can be thrown over: the yard's south wall. */
  readonly climbable: { tx: number; ty: number }[] = []

  constructor() {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const inside = x > 5 && x < 74 && y > 5 && y < 59
        const ring = (x === 5 || x === 74) && y >= 5 && y <= 59 || (y === 5 || y === 59) && x >= 5 && x <= 74
        this.tiles[y * MAP_W + x] = ring ? Tile.Perimeter : inside ? Tile.Solid : Tile.Outside
        if (!ring && !inside) this.zoneOf[y * MAP_W + x] = 'outside'
      }
    }
    this.build()
  }

  private build(): void {
    for (const block of BLOCKS) this.buildBlock(block)

    this.room('corridorN', 'North corridor', [{ x0: 32, y0: 13, x1: 47, y1: 15 }], 'floorLino')
    this.room('corridorS', 'South corridor', [{ x0: 32, y0: 32, x1: 47, y1: 34 }], 'floorLino')
    this.room('showers', 'Showers', [{ x0: 33, y0: 8, x1: 38, y1: 11 }], 'floorTile')
    this.room('laundry', 'Laundry', [{ x0: 41, y0: 8, x1: 46, y1: 11 }], 'floorLaundry')
    this.room('hub', 'Canteen & phones', [{ x0: 34, y0: 17, x1: 45, y1: 30 }], 'floorCanteen')
    this.room('infirmary', 'Healthcare', [{ x0: 20, y0: 22, x1: 32, y1: 25 }], 'floorInfirmary')
    this.room('solitary', 'Segregation', [{ x0: 9, y0: 22, x1: 18, y1: 25 }], 'floorSolitary')
    this.room('games', 'Games room', [{ x0: 47, y0: 22, x1: 58, y1: 25 }], 'floorWood')
    this.room('maint', 'Maintenance', [{ x0: 60, y0: 22, x1: 70, y1: 25 }], 'floorMaint')
    this.room(
      'yard',
      'Exercise yard',
      [
        { x0: 33, y0: 36, x1: 46, y1: 41 },
        { x0: 10, y0: 41, x1: 69, y1: 58 },
      ],
      'yardTarmac',
      true,
    )

    this.door('room', 36, 12, 'x', ['corridorN', 'showers'])
    this.door('room', 43, 12, 'x', ['corridorN', 'laundry'])
    this.door('gate', 39, 16, 'x', ['corridorN', 'hub'])
    this.door('gate', 39, 31, 'x', ['hub', 'corridorS'])
    this.door('gate', 39, 35, 'x', ['corridorS', 'yard'])
    this.door('room', 33, 24, 'y', ['hub', 'infirmary'])
    this.door('secure', 19, 24, 'y', ['infirmary', 'solitary'])
    this.door('room', 46, 24, 'y', ['hub', 'games'])
    this.door('secure', 59, 23, 'y', ['games', 'maint'])
    this.door('perimeter', 64, 59, 'x', ['yard', 'outside'])

    for (let x = 12; x <= 68; x++) if (x < 62 || x > 66) this.climbable.push({ tx: x, ty: 59 })

    // The vents. One-tile crawlspaces above the ceilings, so walls do not
    // matter to them: only the duct rectangles do.
    const duct = (x0: number, y0: number, x1: number, y1: number) => this.ducts.push({ x0, y0, x1, y1 })
    duct(10, 14, 69, 14)
    duct(10, 33, 69, 33)
    duct(40, 14, 40, 33)
    duct(12, 24, 40, 24)
    duct(40, 24, 68, 24)
    duct(36, 9, 36, 14)
    duct(44, 9, 44, 14)
    duct(19, 14, 19, 19)

    const grate = (id: string, tx: number, ty: number) =>
      this.grates.push({ id, tx, ty, zone: this.zone(tx, ty), sealed: false, open: false })
    grate('your cell', 19, 19)
    grate('A landing', 12, 14)
    grate('B landing', 68, 14)
    grate('north corridor', 34, 14)
    grate('showers', 36, 9)
    grate('laundry', 44, 9)
    grate('canteen', 40, 20)
    grate('healthcare', 24, 24)
    grate('games room', 52, 24)
    grate('maintenance', 66, 24)
    grate('south corridor', 44, 33)
    grate('C landing', 12, 33)
    grate('D landing', 68, 33)
  }

  /**
   * A landing: a spine corridor with five cells either side, two to a cell.
   * B and D are mirror images of A and C, so every gate faces the middle.
   */
  private buildBlock(block: BlockId): void {
    const ox = block === 'A' || block === 'C' ? 8 : 48
    const oy = block === 'A' || block === 'B' ? 8 : 27
    const flip = block === 'B' || block === 'D'
    const wx = (lx: number) => (flip ? ox + (23 - lx) : ox + lx)
    const span = (a: number, b: number): [number, number] => {
      const p = wx(a)
      const q = wx(b)
      return [Math.min(p, q), Math.max(p, q)]
    }

    const [sx0, sx1] = span(1, 22)
    this.room(`block${block}`, `${block} wing landing`, [{ x0: sx0, y0: oy + 5, x1: sx1, y1: oy + 7 }], 'floorLino')

    for (let i = 0; i < 10; i++) {
      const north = i < 5
      const col = i % 5
      const [cx0, cx1] = span(1 + col * 4, 3 + col * 4)
      const cy0 = north ? oy + 1 : oy + 9
      const zone = `cell${block}${i}`
      const rect = { x0: cx0, y0: cy0, x1: cx1, y1: cy0 + 2 }
      this.room(zone, `Cell ${block}${i + 1}`, [rect], 'floorCell')
      const door = this.door('cell', wx(2 + col * 4), north ? oy + 4 : oy + 8, 'x', [`block${block}`, zone])
      door.cell = zone
      door.locked = true
      // A bunk bed along the side wall (both sleep in it, one up, one down)
      // and a stool by the table. Matches the furniture in Build.ts.
      const x0 = cx0 * TILE
      const x1 = (cx1 + 1) * TILE
      const z0 = cy0 * TILE
      const z1 = (cy0 + 3) * TILE
      const doorNorth = !north
      const midZ = (z0 + z1) / 2
      const bunks = [
        { x: x0 + 0.8, z: midZ + (doorNorth ? 0.6 : -0.6) },
        { x: x1 - 1.0, z: doorNorth ? z1 - 1.3 : z0 + 1.3 },
      ]
      this.cells.set(zone, { zone, block, index: i, rect, door, bunks })
    }

    const gate = this.door('gate', wx(23), oy + 6, 'y', [`block${block}`, block === 'A' || block === 'B' ? 'corridorN' : 'corridorS'])
    this.blockGate.set(block, gate)
  }

  private room(zone: string, name: string, rects: Rect[], floor: string, outdoor = false): void {
    this.rooms.set(zone, { zone, name, rects, floor, outdoor })
    for (const r of rects) {
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          this.tiles[y * MAP_W + x] = Tile.Floor
          this.zoneOf[y * MAP_W + x] = zone
        }
      }
    }
  }

  private door(kind: DoorKind, tx: number, ty: number, axis: 'x' | 'y', zones: [string, string]): Door {
    const door: Door = {
      id: this.doors.length,
      kind,
      tx,
      ty,
      axis,
      openness: 0,
      held: false,
      locked: kind !== 'room',
      jammed: false,
      cell: null,
      zones,
    }
    this.doors.push(door)
    this.doorAt.set(ty * MAP_W + tx, door)
    this.tiles[ty * MAP_W + tx] = Tile.Door
    this.zoneOf[ty * MAP_W + tx] = zones[0]
    return door
  }

  tile(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Tile.Solid
    return this.tiles[ty * MAP_W + tx] as Tile
  }

  zone(tx: number, ty: number): string {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return ''
    return this.zoneOf[ty * MAP_W + tx]
  }

  zoneAtWorld(x: number, z: number): string {
    return this.zone(Math.floor(x / TILE), Math.floor(z / TILE))
  }

  doorAtTile(tx: number, ty: number): Door | undefined {
    return this.doorAt.get(ty * MAP_W + tx)
  }

  /** Can a body stand in this tile right now? Doors count when open enough. */
  passable(tx: number, ty: number): boolean {
    const t = this.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return true
    if (t === Tile.Door) return (this.doorAt.get(ty * MAP_W + tx)?.openness ?? 0) > 0.7
    return false
  }

  /** Line of sight between two world points, stepping through tiles. Shut
   *  doors block it; cell doors have a hatch, gates are bars, so neither does. */
  sightClear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax
    const dz = bz - az
    const length = Math.hypot(dx, dz)
    const steps = Math.ceil(length / (TILE * 0.4))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const tx = Math.floor((ax + dx * t) / TILE)
      const ty = Math.floor((az + dz * t) / TILE)
      const tile = this.tile(tx, ty)
      if (tile === Tile.Solid || tile === Tile.Perimeter) return false
      if (tile === Tile.Door) {
        const door = this.doorAt.get(ty * MAP_W + tx)
        if (door && door.openness < 0.5 && (door.kind === 'room' || door.kind === 'secure' || door.kind === 'perimeter')) return false
      }
    }
    return true
  }

  /** Is this world point inside the duct network? */
  inDuct(x: number, z: number): boolean {
    const fx = x / TILE - 0.5
    const fz = z / TILE - 0.5
    for (const d of this.ducts) {
      if (fx >= d.x0 - 0.32 && fx <= d.x1 + 0.32 && fz >= d.y0 - 0.32 && fz <= d.y1 + 0.32) return true
    }
    return false
  }

  roomName(zone: string): string {
    return this.rooms.get(zone)?.name ?? (zone === 'outside' ? 'Outside the wall' : '')
  }

  /** Random walkable tile in a zone, for NPCs choosing where to stand. */
  randomTileIn(zone: string, rng: () => number): { tx: number; ty: number } {
    const room = this.rooms.get(zone)
    if (!room) return { tx: 40, ty: 24 }
    const r = room.rects[Math.floor(rng() * room.rects.length)]
    return {
      tx: r.x0 + Math.floor(rng() * (r.x1 - r.x0 + 1)),
      ty: r.y0 + Math.floor(rng() * (r.y1 - r.y0 + 1)),
    }
  }
}

export function blockOfZone(zone: string): BlockId | null {
  const m = /^(?:cell|block)([ABCD])/.exec(zone)
  return m ? (m[1] as BlockId) : null
}

export function tileCentre(tx: number, ty: number): { x: number; z: number } {
  return { x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE }
}

export function worldToTile(x: number, z: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE), ty: Math.floor(z / TILE) }
}
