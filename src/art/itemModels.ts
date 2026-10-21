import type { BufferGeometry } from 'three'
import type { ItemId } from '../game/Items'
import { HEX } from './palette'
import { mergePainted } from './paint'
import { ball, box, cyl, cylX, ring } from './shapes'

/**
 * Little models for the things lying about the prison, sat flat on the floor
 * the way they were dropped. Built a touch over life size so they read from
 * the camera above. Each is centred on x/z 0 with its base at y 0.
 */
const o = (x = 0, y = 0, z = 0, ry = 0) => ({ x, y, z, ry })

function parts(id: ItemId): BufferGeometry[] {
  switch (id) {
    case 'toothbrush':
      return [box(0.62, 0.05, 0.07, o(), HEX.plastic), box(0.14, 0.07, 0.08, o(0.26, 0.05), HEX.porcelain)]
    case 'toothpaste':
      return [cylX(0.08, 0.5, o(0, 0.08), HEX.porcelain, 10), box(0.14, 0.04, 0.16, o(0.27, 0), HEX.toothpaste), cylX(0.05, 0.08, o(-0.29, 0.08), HEX.toothpaste, 8), box(0.3, 0.005, 0.1, o(0, 0.155), HEX.toothpaste)]
    case 'soap':
      return [box(0.34, 0.12, 0.22, o(), HEX.soap)]
    case 'spoon':
    case 'flatSpoon':
      return [box(0.42, 0.03, 0.06, o(-0.1), HEX.metal), ball(0.1, o(0.18, 0.03), HEX.metal, 1.3, id === 'flatSpoon' ? 0.15 : 0.35, 1)]
    case 'fork':
      return [box(0.36, 0.03, 0.06, o(-0.08), HEX.paper), box(0.12, 0.03, 0.14, o(0.16), HEX.paper), ...[-0.05, 0, 0.05].map((z) => box(0.12, 0.03, 0.025, o(0.27, 0, z), HEX.paper))]
    case 'tray':
      return [box(0.8, 0.04, 0.56, o(), HEX.steel), box(0.8, 0.07, 0.04, o(0, 0, 0.26), HEX.steel), box(0.8, 0.07, 0.04, o(0, 0, -0.26), HEX.steel), box(0.3, 0.02, 0.22, o(-0.18, 0.04, -0.1), HEX.steelDark), box(0.3, 0.02, 0.22, o(0.18, 0.04, -0.1), HEX.steelDark)]
    case 'sock':
      return [box(0.4, 0.06, 0.14, o(0, 0, 0), HEX.cloth), box(0.16, 0.06, 0.24, o(0.2, 0, 0.05), HEX.cloth), box(0.08, 0.065, 0.14, o(-0.18, 0, 0), HEX.clothesRed)]
    case 'poolBall':
      return [ball(0.14, o(0, 0.14), HEX.clothesRed), ball(0.06, o(0, 0.25, 0.05), HEX.porcelain)]
    case 'poolCue':
      return [cylX(0.035, 1.5, o(0.05, 0.04), HEX.floorWood, 8), cylX(0.05, 0.5, o(-0.5, 0.05), HEX.wood, 8), cylX(0.03, 0.04, o(0.8, 0.04), HEX.porcelain, 8)]
    case 'razor':
      return [box(0.34, 0.04, 0.07, o(-0.05), HEX.hoop), box(0.08, 0.05, 0.22, o(0.15), HEX.metal)]
    case 'bedsheet':
      return [box(0.66, 0.1, 0.5, o(), HEX.cloth), box(0.66, 0.04, 0.5, o(0.04, 0.1, 0.03, 0.15), HEX.cloth)]
    case 'mopHandle':
      return [cylX(0.04, 1.4, o(0, 0.04), HEX.wood, 8), box(0.12, 0.08, 0.1, o(0.72), HEX.steel)]
    case 'battery':
      return [cylX(0.06, 0.22, o(0, 0.06, -0.08), HEX.battery, 10), cylX(0.06, 0.22, o(0, 0.06, 0.08), HEX.battery, 10), cylX(0.062, 0.05, o(0.1, 0.06, -0.08), HEX.gateYellow, 10), cylX(0.062, 0.05, o(0.1, 0.06, 0.08), HEX.gateYellow, 10)]
    case 'wire':
      return [ring(0.16, 0.025, o(0, 0.03), HEX.chipsOrange), ring(0.12, 0.025, o(0.04, 0.06), HEX.chipsOrange)]
    case 'tape':
      return [cyl(0.16, 0.16, 0.1, o(), HEX.steelDark, 18), cyl(0.08, 0.08, 0.102, o(), HEX.floorCell, 12)]
    case 'voucher':
      return [box(0.44, 0.02, 0.26, o(), HEX.voucher), box(0.3, 0.022, 0.06, o(-0.02, 0, -0.04), HEX.gateYellow), box(0.1, 0.022, 0.1, o(0.14, 0, 0.06), HEX.porcelain)]
    case 'magazine':
      return [cylX(0.08, 0.5, o(0, 0.08), HEX.clothesYellow, 10), cylX(0.082, 0.06, o(0, 0.08), HEX.steelDark, 10)]
    case 'racingPost':
      return [box(0.5, 0.04, 0.36, o(), HEX.paper), box(0.5, 0.045, 0.08, o(0, 0, -0.13), HEX.stainedRed), box(0.18, 0.046, 0.04, o(-0.08, 0, 0.05), HEX.ink)]
    case 'lighter':
      return [box(0.12, 0.26, 0.06, o(), HEX.clothesRed), box(0.1, 0.06, 0.05, o(0, 0.26), HEX.metal)]
    case 'dart':
      return [cylX(0.025, 0.3, o(0, 0.04), HEX.metal, 6), cylX(0.04, 0.14, o(-0.08, 0.04), HEX.ink, 8), box(0.14, 0.02, 0.14, o(-0.18, 0.04, 0, Math.PI / 4), HEX.stainedRed)]
    case 'bleach':
      return [box(0.22, 0.4, 0.14, o(), HEX.paper), cyl(0.05, 0.05, 0.08, o(0, 0.4), HEX.stainedBlue, 8), box(0.2, 0.12, 0.002, o(0, 0.12, 0.071), HEX.stainedBlue)]
    case 'screwdriver':
      return [cylX(0.06, 0.24, o(-0.15, 0.06), HEX.clothesRed, 8), cylX(0.025, 0.36, o(0.15, 0.06), HEX.metal, 6)]
    case 'biscuits':
      return [cylX(0.12, 0.5, o(0, 0.12), HEX.chipsOrange, 12), cylX(0.125, 0.12, o(0, 0.12), HEX.stainedBlue, 12)]
    case 'teabags':
      return [box(0.36, 0.24, 0.24, o(), HEX.stainedRed), box(0.36, 0.1, 0.245, o(0, 0.07), HEX.altarCloth)]
    case 'parcel':
      return [box(0.5, 0.3, 0.4, o(), HEX.porcelain), box(0.51, 0.31, 0.06, o(), HEX.wire)]
    case 'letter':
      return [box(0.4, 0.02, 0.26, o(), HEX.soap), box(0.1, 0.022, 0.08, o(0, 0, 0), HEX.hoop)]
    case 'glasses':
      return [ring(0.07, 0.015, o(-0.09, 0.02), HEX.ink), ring(0.07, 0.015, o(0.09, 0.02), HEX.ink), box(0.05, 0.02, 0.02, o(0, 0.02), HEX.ink), box(0.02, 0.02, 0.2, o(-0.16, 0.02, -0.1), HEX.ink), box(0.02, 0.02, 0.2, o(0.16, 0.02, -0.1), HEX.ink)]
    case 'blueDrink':
      return [cylX(0.12, 0.6, o(0, 0.12), HEX.stainedBlue, 12), cylX(0.06, 0.12, o(0.34, 0.12), HEX.stainedBlue, 10), cylX(0.065, 0.06, o(0.42, 0.12), HEX.porcelain, 10), cylX(0.124, 0.2, o(-0.04, 0.12), HEX.gateYellow, 12)]
    case 'sausageRoll':
      return [box(0.46, 0.04, 0.3, o(), HEX.porcelain), cylX(0.09, 0.36, o(0, 0.12), HEX.chipsOrange, 10), cylX(0.05, 0.37, o(0, 0.13), HEX.skinShade, 8)]
    case 'hymnBook':
      return [box(0.36, 0.1, 0.26, o(), HEX.bookRed), box(0.34, 0.08, 0.24, o(0.015, 0.01), HEX.paper), box(0.08, 0.102, 0.03, o(0, 0, 0), HEX.stainedGold), box(0.03, 0.102, 0.12, o(0, 0, 0), HEX.stainedGold)]
    case 'guardUniform':
      return [box(0.6, 0.1, 0.5, o(), HEX.guardShirt), box(0.6, 0.06, 0.24, o(0.02, 0.1, -0.08), HEX.guardTrousers), box(0.06, 0.12, 0.24, o(0, 0.02, 0.1), HEX.ink), cyl(0.18, 0.18, 0.08, o(0.18, 0.16, 0.12), HEX.guardCap, 14)]
    case 'wig':
      return [ball(0.22, o(0, 0.1), HEX.hairBlonde, 1.1, 0.6, 1), ball(0.12, o(-0.18, 0.06, 0.08), HEX.hairBlonde), ball(0.12, o(0.18, 0.06, 0.08), HEX.hairBlonde)]
    case 'dress':
    case 'visitorDisguise':
      return [box(0.4, 0.08, 0.3, o(0, 0, -0.1), HEX.dress), box(0.6, 0.08, 0.36, o(0, 0, 0.2), HEX.dress), ...[[-0.15, 0.1], [0.12, 0.25], [0.05, -0.12]].map(([x, z]) => box(0.07, 0.085, 0.07, o(x, 0, z), HEX.boa)), ...(id === 'visitorDisguise' ? [ball(0.16, o(0.2, 0.1, -0.15), HEX.hairBlonde, 1.1, 0.6, 1)] : [])]
    case 'shiv':
      return [box(0.34, 0.05, 0.07, o(-0.08), HEX.plastic), box(0.06, 0.07, 0.09, o(0.08, 0), HEX.steelDark), box(0.2, 0.03, 0.06, o(0.2), HEX.metal)]
    case 'sockCosh':
      return [box(0.34, 0.06, 0.12, o(-0.1), HEX.cloth), ball(0.14, o(0.18, 0.14), HEX.cloth)]
    case 'keyMould':
      return [box(0.34, 0.12, 0.22, o(), HEX.soap), box(0.2, 0.01, 0.05, o(0, 0.12), HEX.skinShade), box(0.06, 0.01, 0.1, o(-0.12, 0.12), HEX.skinShade)]
    case 'forgedKey':
    case 'guardKey': {
      const hex = id === 'guardKey' ? HEX.gateYellow : HEX.plastic
      const key = (z: number, ry: number) => [ring(0.06, 0.02, o(-0.12, 0.02, z), hex), box(0.22, 0.03, 0.035, o(0.04, 0.005, z, ry), hex), box(0.04, 0.03, 0.06, o(0.13, 0.005, z + 0.02, ry), hex)]
      return id === 'guardKey' ? [ring(0.1, 0.02, o(-0.2, 0.02), HEX.metal), ...key(-0.06, 0.2), ...key(0.06, -0.2)] : key(0, 0)
    }
    case 'rope':
      return [cylX(0.07, 1.3, o(0, 0.07), HEX.cloth, 8), ball(0.11, o(0, 0.08), HEX.cloth), ball(0.1, o(-0.6, 0.07), HEX.cloth)]
    case 'grapple':
      return [cylX(0.06, 1.0, o(-0.2, 0.06), HEX.cloth, 8), box(0.04, 0.04, 0.4, o(0.34, 0.02), HEX.metal), box(0.14, 0.04, 0.04, o(0.4, 0.02, 0.18), HEX.metal), box(0.14, 0.04, 0.04, o(0.4, 0.02, -0.18), HEX.metal)]
    case 'torch':
      return [cylX(0.07, 0.32, o(-0.06, 0.07), HEX.steelDark, 10), cylX(0.1, 0.1, o(0.15, 0.1), HEX.metal, 12), cylX(0.08, 0.02, o(0.21, 0.1), HEX.torch, 12), box(0.2, 0.15, 0.002, o(-0.06, 0.0, 0.071), HEX.chipsOrange)]
    case 'lockpick':
      return [box(0.3, 0.02, 0.025, o(0, 0, -0.04), HEX.chipsOrange), box(0.3, 0.02, 0.025, o(0.02, 0, 0.04), HEX.chipsOrange), box(0.04, 0.025, 0.05, o(0.16, 0, 0.04), HEX.chipsOrange), box(0.1, 0.04, 0.14, o(-0.1, 0), HEX.steelDark)]
    case 'spear':
      return [cylX(0.04, 1.4, o(0, 0.04), HEX.wood, 8), box(0.12, 0.09, 0.1, o(0.6), HEX.steelDark), box(0.24, 0.03, 0.06, o(0.8), HEX.metal)]
    case 'flag':
      return [box(0.66, 0.08, 0.5, o(), HEX.cloth), box(0.16, 0.09, 0.3, o(0.15, 0, 0.05), HEX.clothesRed)]
    default:
      return [box(0.3, 0.2, 0.3, o(), ITEMS_FALLBACK)]
  }
}

const ITEMS_FALLBACK = HEX.wire

export function itemGeometry(id: ItemId): BufferGeometry {
  return mergePainted(parts(id))
}
