import { Color, ColorManagement } from 'three'

/**
 * Colour management is off deliberately, for the same reason as in Windward:
 * every shader here is a hand-authored NPR shader that picks final tones and
 * quantises them. Off, the hex values below are literally the pixels on
 * screen, which is what lets one palette hold across every surface.
 */
ColorManagement.enabled = false

/**
 * HMP Blackmoor.
 *
 * The single source of truth for colour in the whole game. Institutional
 * paint, Victorian brick and prison-issue grey, kept warm enough that the
 * place still reads as cel-shaded rather than as a grim photo. Nothing
 * defines its own colours locally.
 */
export const HEX = {
  /** Victorian brick for the outer walls and the perimeter. */
  brick: 0xa35d48,
  brickShade: 0x5b3a3a,
  /** The two-tone gloss every UK landing is painted in. */
  wallCream: 0xe9e0c6,
  wallGreen: 0x7fa58a,
  wallShade: 0x5f6f80,
  /** Blue-grey lino on the landings, darker tiles in the showers. */
  floorLino: 0xa9b4b0,
  floorCell: 0xc9bfa4,
  floorTile: 0xd6e4e6,
  floorWood: 0xc79a62,
  floorCanteen: 0xc8c08f,
  floorLaundry: 0xb4c3cf,
  floorInfirmary: 0xe3ecea,
  floorSolitary: 0x8c8c86,
  floorMaint: 0x9a9183,
  yardTarmac: 0x7c8487,
  yardGrass: 0x8fbf57,
  yardLines: 0xf2e6b6,
  outsideGrass: 0x6fa24d,
  road: 0x4d5459,

  /** Bars, gates and doors. Gates are painted the classic safety yellow. */
  steel: 0x5d6b73,
  steelDark: 0x2f3a40,
  gateYellow: 0xf2c14e,
  doorBlue: 0x3f6a8f,
  doorRed: 0xb5473f,
  vent: 0x8d989c,
  duct: 0xb8c3c6,

  /** Furniture and props. */
  bunk: 0x6f7b84,
  mattress: 0x5a7fa8,
  blanket: 0x9b4b3f,
  porcelain: 0xf3f5f2,
  table: 0xd8c8a4,
  tableTop: 0xe0d2a6,
  pool: 0x2e8a57,
  wood: 0x8a5a2e,
  washer: 0xdfe5e2,
  basket: 0x3f6b4a,
  tv: 0x1d2328,
  phone: 0x2d3d4a,
  wire: 0xd9d4c7,
  chipsOrange: 0xf6d06b,
  peas: 0x7fbf4d,
  clothesRed: 0xe8575a,
  clothesYellow: 0xf2c14e,
  car: 0x3f7fbf,
  carDark: 0x34506e,
  hoop: 0xe0524f,
  window: 0x8fdbe4,

  /** People. */
  skin: 0xf1c29a,
  skinTan: 0xd49a6a,
  skinDeep: 0x8a5a3c,
  skinPale: 0xf6d6bd,
  skinShade: 0x9a6f5a,
  hairBlack: 0x2a2522,
  hairBrown: 0x6b4630,
  hairBlonde: 0xe3c47e,
  hairGrey: 0xc4c0b8,
  hairRed: 0xb5552b,
  /** HMP grey trackies, and the maroon worn by the "high risk" lads. */
  prisonGrey: 0x9aa3a8,
  prisonGreyDark: 0x6b747a,
  prisonMaroon: 0x8e2b3a,
  prisonBlue: 0x3f7fbf,
  /** You: a washed-out orange, so the eye finds you in a crowd. */
  player: 0xf2a65a,
  /** Officers: white shirt, black trousers, black peaked cap. */
  guardShirt: 0xf2f4f2,
  guardTrousers: 0x23272b,
  guardCap: 0x1d2328,
  hiVis: 0xd7f24e,

  /** Items. */
  toothpaste: 0x6fc4e8,
  soap: 0xf6c1cf,
  metal: 0xb8c3c6,
  plastic: 0xe8575a,
  cloth: 0xe9e0c6,
  snout: 0xd9a45b,
  battery: 0x3a3b44,

  /** Light and atmosphere. */
  sun: 0xffb25e,
  sky: 0x8fdbe4,
  night: 0x3c4a78,
  torch: 0xfff2b0,
  visionCalm: 0xffc93a,
  visionAlert: 0xe8575a,
  smoke: 0x55595c,
  fire: 0xff9f3a,

  /** Shared shadow multipliers. */
  shade: 0x64708e,
  shadeWarm: 0x7a6060,

  ink: 0x12222b,
  paper: 0xf2fbfa,
} as const

export type PaletteKey = keyof typeof HEX

const cache = new Map<number, Color>()

/** Color for a palette hex, memoised. */
export function color(hex: number): Color {
  let c = cache.get(hex)
  if (!c) {
    c = new Color(hex)
    cache.set(hex, c)
  }
  return c
}

export function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

/**
 * One sun for everything lit. High and a little behind the camera's default
 * heading, so the faces you are looking at catch the light band and the
 * walls throw their shade side toward you.
 */
export const SUN_DIRECTION = { azimuth: 2.2, elevation: 0.95 }
