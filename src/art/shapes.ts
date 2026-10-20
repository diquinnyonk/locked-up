import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { paint, paintBy } from './paint'

/**
 * Painted primitives, placed in world space. The whole static prison is built
 * from these and merged into a handful of geometries sharing one vertex-tinted
 * toon material, so a building full of bunks, tables and washing machines is a
 * few draw calls.
 */
export interface Place {
  x: number
  y: number
  z: number
  ry?: number
}

export function box(w: number, h: number, d: number, at: Place, hex: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d)
  if (at.ry) g.rotateY(at.ry)
  g.translate(at.x, at.y + h / 2, at.z)
  return paint(g, hex)
}

export function cyl(rTop: number, rBottom: number, h: number, at: Place, hex: number, segments = 16): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBottom, h, segments)
  if (at.ry) g.rotateY(at.ry)
  g.translate(at.x, at.y + h / 2, at.z)
  return paint(g, hex)
}

/** A cylinder lying along x (wheels, barbells, pipes), centred on `at`. */
export function cylX(r: number, length: number, at: Place, hex: number, segments = 16): BufferGeometry {
  const g = new CylinderGeometry(r, r, length, segments)
  g.rotateZ(Math.PI / 2)
  if (at.ry) g.rotateY(at.ry)
  g.translate(at.x, at.y, at.z)
  return paint(g, hex)
}

export function ball(r: number, at: Place, hex: number, sx = 1, sy = 1, sz = 1): BufferGeometry {
  const g = new SphereGeometry(r, 16, 12)
  g.scale(sx, sy, sz)
  g.translate(at.x, at.y, at.z)
  return paint(g, hex)
}

export function ring(r: number, tube: number, at: Place, hex: number, tilt = Math.PI / 2): BufferGeometry {
  const g = new TorusGeometry(r, tube, 8, 28)
  g.rotateX(tilt)
  if (at.ry) g.rotateY(at.ry)
  g.translate(at.x, at.y, at.z)
  return paint(g, hex)
}

/**
 * A box painted in horizontal bands, from the floor up: `bands` is
 * [upToHeight, hex][]. Built as stacked boxes so every colour change is a real
 * edge rather than a triangle split across two colours. The top face of the
 * last band takes `topHex`, which is what reads from the camera above.
 */
export function bandedBox(w: number, d: number, at: Place, bands: [number, number][], topHex: number): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  let from = 0
  bands.forEach(([upTo, hex], index) => {
    const h = upTo - from
    const g = new BoxGeometry(w, h, d)
    if (at.ry) g.rotateY(at.ry)
    g.translate(at.x, at.y + from + h / 2, at.z)
    const last = index === bands.length - 1
    const top = at.y + upTo
    parts.push(paintBy(g, (_x, y) => (last && y > top - 0.001 ? topHex : hex)))
    from = upTo
  })
  return parts
}
