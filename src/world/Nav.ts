import { type Door, type Grid, MAP_H, MAP_W, TILE, Tile } from './Grid'

/**
 * A* over the tile grid. Who is asking matters: an officer plans straight
 * through every gate in the place, a prisoner only through the doors the
 * regime has open for them, so `canUse` is passed in per request.
 */
export type DoorRule = (door: Door) => boolean

const SIZE = MAP_W * MAP_H
const gScore = new Float32Array(SIZE)
const fScore = new Float32Array(SIZE)
const cameFrom = new Int32Array(SIZE)
const closed = new Uint8Array(SIZE)
const stamp = new Uint32Array(SIZE)
let generation = 1

/** Binary heap of tile indices keyed by fScore. */
class Heap {
  private items: number[] = []
  get size(): number {
    return this.items.length
  }
  clear(): void {
    this.items.length = 0
  }
  push(i: number): void {
    const a = this.items
    a.push(i)
    let n = a.length - 1
    while (n > 0) {
      const p = (n - 1) >> 1
      if (fScore[a[p]] <= fScore[a[n]]) break
      ;[a[p], a[n]] = [a[n], a[p]]
      n = p
    }
  }
  pop(): number {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let n = 0
      for (;;) {
        const l = n * 2 + 1
        const r = l + 1
        let m = n
        if (l < a.length && fScore[a[l]] < fScore[a[m]]) m = l
        if (r < a.length && fScore[a[r]] < fScore[a[m]]) m = r
        if (m === n) break
        ;[a[m], a[n]] = [a[n], a[m]]
        n = m
      }
    }
    return top
  }
}

const open = new Heap()

export function findPath(
  grid: Grid,
  from: { tx: number; ty: number },
  to: { tx: number; ty: number },
  canUse: DoorRule,
): { tx: number; ty: number }[] | null {
  generation++
  const start = from.ty * MAP_W + from.tx
  const goal = to.ty * MAP_W + to.tx
  if (start === goal) return [to]

  const walkable = (tx: number, ty: number): boolean => {
    const t = grid.tile(tx, ty)
    if (t === Tile.Floor || t === Tile.Outside) return !grid.underProp(tx, ty)
    if (t === Tile.Door) {
      const door = grid.doorAtTile(tx, ty)
      return !!door && canUse(door)
    }
    return false
  }
  if (!walkable(to.tx, to.ty)) return null

  const touch = (i: number) => {
    if (stamp[i] !== generation) {
      stamp[i] = generation
      gScore[i] = Infinity
      closed[i] = 0
      cameFrom[i] = -1
    }
  }
  const h = (i: number) => {
    const x = i % MAP_W
    const y = (i / MAP_W) | 0
    return Math.abs(x - to.tx) + Math.abs(y - to.ty)
  }

  open.clear()
  touch(start)
  gScore[start] = 0
  fScore[start] = h(start)
  open.push(start)

  let iterations = 0
  while (open.size > 0 && iterations++ < 6000) {
    const current = open.pop()
    if (current === goal) {
      const path: { tx: number; ty: number }[] = []
      let n = current
      while (n !== start && n >= 0) {
        path.push({ tx: n % MAP_W, ty: (n / MAP_W) | 0 })
        n = cameFrom[n]
      }
      return path.reverse()
    }
    touch(current)
    if (closed[current]) continue
    closed[current] = 1
    const cx = current % MAP_W
    const cy = (current / MAP_W) | 0
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0)
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
      if (!walkable(nx, ny)) continue
      const n = ny * MAP_W + nx
      touch(n)
      if (closed[n]) continue
      const g = gScore[current] + 1
      if (g < gScore[n]) {
        cameFrom[n] = current
        gScore[n] = g
        fScore[n] = g + h(n)
        open.push(n)
      }
    }
  }
  return null
}

/**
 * Moves a circle through the grid, sliding along walls. Axis-separated, which
 * is all a world of right angles needs.
 */
export function moveCircle(
  pos: { x: number; z: number },
  dx: number,
  dz: number,
  radius: number,
  blocked: (tx: number, ty: number) => boolean,
): void {
  pos.x += dx
  resolve(pos, radius, blocked, 'x', dx)
  pos.z += dz
  resolve(pos, radius, blocked, 'z', dz)
}

function resolve(
  pos: { x: number; z: number },
  r: number,
  blocked: (tx: number, ty: number) => boolean,
  axis: 'x' | 'z',
  d: number,
): void {
  if (d === 0) return
  const minX = Math.floor((pos.x - r) / TILE)
  const maxX = Math.floor((pos.x + r) / TILE)
  const minY = Math.floor((pos.z - r) / TILE)
  const maxY = Math.floor((pos.z + r) / TILE)
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (!blocked(tx, ty)) continue
      if (axis === 'x') {
        pos.x = d > 0 ? tx * TILE - r - 0.001 : (tx + 1) * TILE + r + 0.001
      } else {
        pos.z = d > 0 ? ty * TILE - r - 0.001 : (ty + 1) * TILE + r + 0.001
      }
      return
    }
  }
}
