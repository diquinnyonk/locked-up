import { BufferAttribute, type BufferGeometry, Color } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { color } from './palette'

/**
 * Per-vertex paint for props built from several primitives.
 *
 * Merging a prop's parts into one geometry makes it one instanced draw, but a
 * single material means a single colour. Painting each part (or each vertex,
 * for stripes) into the `tint` attribute gives it back its colours; the toon
 * material multiplies by it when created with `vertexTint`.
 *
 * Geometry is converted to non-indexed first so a colour change between faces
 * is a hard edge, which is what stripes need.
 */
export function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  return paintBy(geometry, () => hex)
}

export function paintBy(geometry: BufferGeometry, pick: (x: number, y: number, z: number) => number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const position = flat.getAttribute('position')
  const tints = new Float32Array(position.count * 3)
  const c = new Color()
  // Colour by face centre, so a stripe boundary never splits a triangle.
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3
    c.copy(color(pick(x, y, z)))
    for (let k = 0; k < 3; k++) tints.set([c.r, c.g, c.b], (i + k) * 3)
  }
  flat.setAttribute('tint', new BufferAttribute(tints, 3))
  // UVs are unused and would stop merging with parts that lack them.
  flat.deleteAttribute('uv')
  return flat
}

/** Merges painted parts into one geometry. */
export function mergePainted(parts: BufferGeometry[]): BufferGeometry {
  // Keeps each part's own normals, so round things stay round.
  return mergeGeometries(parts)
}
