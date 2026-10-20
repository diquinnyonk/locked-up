import { ClampToEdgeWrapping, DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three'

/**
 * A band in a quantised lighting ramp. `upTo` is the NdotL value at which this
 * band ends; `value` is the flat light intensity across it.
 *
 * Thresholds are deliberately not evenly spaced. Even spacing is what makes a
 * cel ramp read as "posterised photo" rather than as painted shading: the
 * terminator wants to sit lower than the midpoint so lit surfaces stay lit and
 * the shadow side reads as one confident shape.
 */
export interface Band {
  upTo: number
  value: number
}

export const DIFFUSE_BANDS: Band[] = [
  { upTo: 0.34, value: 0.22 },
  { upTo: 0.52, value: 0.50 },
  { upTo: 0.78, value: 0.80 },
  { upTo: 1.0, value: 1.0 },
]

const RAMP_WIDTH = 128

/**
 * Builds the quantised light ramp as a 1D lookup. NearestFilter with no
 * interpolation is the whole point: any filtering here reintroduces the
 * gradient the bands exist to remove.
 */
export function makeRampTexture(bands: Band[] = DIFFUSE_BANDS): DataTexture {
  const data = new Uint8Array(RAMP_WIDTH * 4)

  for (let i = 0; i < RAMP_WIDTH; i++) {
    const t = (i + 0.5) / RAMP_WIDTH
    let value = bands[bands.length - 1].value
    for (const band of bands) {
      if (t <= band.upTo) {
        value = band.value
        break
      }
    }
    const byte = Math.round(value * 255)
    data[i * 4 + 0] = byte
    data[i * 4 + 1] = byte
    data[i * 4 + 2] = byte
    data[i * 4 + 3] = 255
  }

  const texture = new DataTexture(data, RAMP_WIDTH, 1, RGBAFormat, UnsignedByteType)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** Shared instance: one ramp lights everything, same as one palette colours everything. */
export const diffuseRamp = makeRampTexture()
