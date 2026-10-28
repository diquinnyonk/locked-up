import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three'
import { HEX } from './palette'
import { paint } from './paint'
import { box, cyl } from './shapes'

/**
 * The getaway car and the fire engine, built front-first along +x with
 * their wheels on the ground at y 0, from the same painted primitives as
 * everything else.
 */
const GLASS = 0x2f4a5c
const RED = 0xc92a2a
const CHROME = HEX.metal
const TYRE = 0x1d2328

/** A box tipped about the z axis: windscreens, bonnets, a sloping cab. */
function tilted(w: number, h: number, d: number, x: number, y: number, z: number, rz: number, hex: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d)
  g.rotateZ(rz)
  g.translate(x, y, z)
  return paint(g, hex)
}

/** A wheel with its axle along z: tyre, hub and a cap on the outside face. */
function wheel(x: number, z: number, r: number, width: number): BufferGeometry[] {
  const out = Math.sign(z)
  const tyre = new CylinderGeometry(r, r, width, 18)
  tyre.rotateX(Math.PI / 2)
  tyre.translate(x, r, z)
  const hub = new CylinderGeometry(r * 0.58, r * 0.58, width + 0.02, 14)
  hub.rotateX(Math.PI / 2)
  hub.translate(x, r, z)
  const cap = new CylinderGeometry(r * 0.22, r * 0.22, 0.04, 10)
  cap.rotateX(Math.PI / 2)
  cap.translate(x, r, z + out * (width / 2 + 0.01))
  return [paint(tyre, TYRE), paint(hub, CHROME), paint(cap, HEX.steelDark)]
}

/** A dark blue saloon of a certain age, engine running, lights off. */
export function carParts(): BufferGeometry[] {
  const body = HEX.car
  const dark = HEX.carDark
  const parts: BufferGeometry[] = [
    // Body: sills, the main shell, a bonnet and boot a little lower than the waist.
    box(4.3, 0.18, 1.7, { x: 0, y: 0.26, z: 0 }, TYRE),
    box(4.4, 0.52, 1.82, { x: 0, y: 0.36, z: 0 }, body),
    tilted(1.25, 0.1, 1.74, 1.45, 0.92, 0, -0.08, body),
    box(0.95, 0.1, 1.74, { x: -1.7, y: 0.86, z: 0 }, body),
    // Cabin: roof, pillars, glass.
    box(1.75, 0.08, 1.6, { x: -0.35, y: 1.48, z: 0 }, body),
    // Windscreen and rear window, raked back from the bonnet and boot to the roof.
    tilted(0.08, 0.72, 1.56, 0.74, 1.15, 0, 0.62, GLASS),
    tilted(0.08, 0.66, 1.56, -1.4, 1.14, 0, -0.58, GLASS),
    box(1.85, 0.52, 1.62, { x: -0.35, y: 0.88, z: 0 }, dark),
    // Side windows either side of the B-pillar, and the pillar.
    ...[-1, 1].flatMap((s) => [
      box(0.82, 0.42, 0.04, { x: 0.18, y: 0.97, z: s * 0.82 }, GLASS),
      box(0.72, 0.42, 0.04, { x: -0.86, y: 0.97, z: s * 0.82 }, GLASS),
      box(0.1, 0.5, 0.05, { x: -0.3, y: 0.93, z: s * 0.83 }, dark),
      // Door lines and handles.
      box(0.03, 0.42, 0.02, { x: -0.3, y: 0.42, z: s * 0.915 }, dark),
      box(0.03, 0.42, 0.02, { x: 0.78, y: 0.42, z: s * 0.915 }, dark),
      box(0.16, 0.04, 0.03, { x: 0.45, y: 0.72, z: s * 0.92 }, CHROME),
      box(0.16, 0.04, 0.03, { x: -0.6, y: 0.72, z: s * 0.92 }, CHROME),
      // Wing mirrors.
      box(0.14, 0.12, 0.16, { x: 0.65, y: 0.95, z: s * 0.98 }, dark),
      // Wheel arches.
      box(0.95, 0.16, 0.06, { x: 1.35, y: 0.78, z: s * 0.92 }, dark),
      box(0.95, 0.16, 0.06, { x: -1.35, y: 0.78, z: s * 0.92 }, dark),
      // A chrome strip along the waist.
      box(4.2, 0.04, 0.02, { x: 0, y: 0.66, z: s * 0.915 }, CHROME),
    ]),
    // Front: grille, headlights, indicators, bumper, white plate.
    box(0.05, 0.22, 0.9, { x: 2.21, y: 0.52, z: 0 }, TYRE),
    ...[-1, 1].flatMap((s) => [box(0.06, 0.18, 0.34, { x: 2.21, y: 0.56, z: s * 0.66 }, HEX.torch), box(0.06, 0.08, 0.14, { x: 2.21, y: 0.42, z: s * 0.8 }, HEX.chipsOrange)]),
    box(0.16, 0.16, 1.86, { x: 2.24, y: 0.22, z: 0 }, HEX.steelDark),
    box(0.03, 0.12, 0.5, { x: 2.33, y: 0.26, z: 0 }, HEX.paper),
    // Back: tail lights, bumper, the yellow plate.
    ...[-1, 1].map((s) => box(0.06, 0.2, 0.38, { x: -2.21, y: 0.58, z: s * 0.64 }, RED)),
    box(0.16, 0.16, 1.86, { x: -2.24, y: 0.22, z: 0 }, HEX.steelDark),
    box(0.03, 0.12, 0.5, { x: -2.33, y: 0.48, z: 0 }, HEX.gateYellow),
    // Exhaust.
    box(0.2, 0.07, 0.07, { x: -2.3, y: 0.14, z: 0.55 }, CHROME),
  ]
  for (const x of [1.35, -1.35]) for (const z of [-0.84, 0.84]) parts.push(...wheel(x, z, 0.34, 0.24))
  return parts
}

/** A British fire engine: red, white roof, Battenburg checks, ladder up top. */
export function fireEngineParts(): BufferGeometry[] {
  const parts: BufferGeometry[] = [
    // Chassis and body.
    box(7.2, 0.3, 2.2, { x: -0.2, y: 0.42, z: 0 }, TYRE),
    box(5.0, 1.75, 2.36, { x: -1.15, y: 0.62, z: 0 }, RED),
    // The cab: tall, glassy, with a white roof.
    box(2.2, 1.55, 2.36, { x: 2.5, y: 0.62, z: 0 }, RED),
    box(2.25, 0.14, 2.4, { x: 2.5, y: 2.17, z: 0 }, HEX.paper),
    box(5.05, 0.1, 2.4, { x: -1.15, y: 2.37, z: 0 }, HEX.paper),
    tilted(0.08, 0.8, 2.1, 3.58, 1.72, 0, -0.12, GLASS),
    ...[-1, 1].flatMap((s) => [
      box(0.75, 0.62, 0.04, { x: 3.0, y: 1.42, z: s * 1.19 }, GLASS),
      box(0.75, 0.62, 0.04, { x: 2.05, y: 1.42, z: s * 1.19 }, GLASS),
      box(0.18, 0.18, 0.12, { x: 3.4, y: 1.65, z: s * 1.28 }, TYRE),
    ]),
    // Front: grille, headlights, bumper, blue grille lights.
    box(0.06, 0.55, 1.5, { x: 3.62, y: 0.8, z: 0 }, HEX.steelDark),
    ...[-1, 1].flatMap((s) => [box(0.06, 0.24, 0.34, { x: 3.62, y: 0.86, z: s * 0.92 }, HEX.torch), box(0.06, 0.12, 0.22, { x: 3.62, y: 1.18, z: s * 0.5 }, HEX.stainedBlue)]),
    box(0.22, 0.28, 2.42, { x: 3.66, y: 0.36, z: 0 }, CHROME),
    // Blue lights on the cab roof and the back corners.
    box(0.4, 0.18, 1.8, { x: 2.7, y: 2.31, z: 0 }, HEX.steelDark),
    ...[-1, 1].flatMap((s) => [
      box(0.34, 0.2, 0.42, { x: 2.7, y: 2.36, z: s * 0.66 }, HEX.stainedBlue),
      cyl(0.13, 0.13, 0.22, { x: -3.5, y: 2.45, z: s * 1.0 }, HEX.stainedBlue, 10),
    ]),
    // The ladder on the roof: two rails, rungs, a roller at the back.
    ...[-0.42, 0.42].map((z) => box(5.4, 0.1, 0.1, { x: -0.9, y: 2.62, z }, CHROME)),
    ...Array.from({ length: 12 }, (_, i) => box(0.06, 0.06, 0.84, { x: -3.4 + i * 0.46, y: 2.66, z: 0 }, CHROME)),
    ...[-0.42, 0.42].map((z) => box(0.12, 0.25, 0.12, { x: 1.5, y: 2.42, z }, HEX.steelDark)),
    box(0.3, 0.3, 1.0, { x: -3.55, y: 2.47, z: 0 }, HEX.steelDark),
    // The back: a hose reel and the tail lights.
    cyl(0.5, 0.5, 0.3, { x: -3.75, y: 1.2, z: 0 }, HEX.steelDark, 16),
    box(0.06, 0.25, 0.3, { x: -3.68, y: 0.85, z: 0.95 }, RED),
    box(0.06, 0.25, 0.3, { x: -3.68, y: 0.85, z: -0.95 }, RED),
    box(0.2, 0.22, 2.42, { x: -3.72, y: 0.36, z: 0 }, HEX.steelDark),
  ]
  for (const s of [-1, 1]) {
    // Roller-shutter lockers down the body: silver panels with ribs.
    for (let k = 0; k < 3; k++) {
      const x = -3.1 + k * 1.45
      parts.push(box(1.3, 1.05, 0.04, { x, y: 1.2, z: s * 1.19 }, CHROME))
      for (let r = 0; r < 6; r++) parts.push(box(1.28, 0.02, 0.05, { x, y: 1.28 + r * 0.16, z: s * 1.195 }, HEX.steel))
      parts.push(box(0.3, 0.05, 0.06, { x, y: 1.3, z: s * 1.2 }, HEX.steelDark))
    }
    // Battenburg: yellow and red checks along the bottom, and a white stripe.
    for (let k = 0; k < 14; k++) parts.push(box(0.5, 0.26, 0.04, { x: -3.5 + k * 0.5 + 0.25, y: 0.78, z: s * 1.2 }, k % 2 ? RED : HEX.gateYellow))
    parts.push(box(7.1, 0.06, 0.04, { x: -0.2, y: 1.08, z: s * 1.2 }, HEX.paper))
    // Steps up to the cab doors.
    parts.push(box(0.5, 0.08, 0.2, { x: 2.5, y: 0.46, z: s * 1.25 }, CHROME))
  }
  // Six wheels: one axle under the cab, two at the back.
  for (const x of [2.5, -1.6, -2.75]) for (const z of [-1.0, 1.0]) parts.push(...wheel(x, z, 0.52, 0.36))
  return parts
}
