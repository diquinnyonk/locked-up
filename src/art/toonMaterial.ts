import { Color, ShaderMaterial, Vector3 } from 'three'
import { HEX, color } from './palette'
import { diffuseRamp } from './ramp'
import { TOON_FRAGMENT, TOON_VERTEX } from '../shaders/toon'

export interface ToonOptions {
  albedo: Color
  shadeTint?: Color
  rimColour?: Color
  rimStrength?: number
  rimPower?: number
  specStrength?: number
  /** Enables the per-vertex `tint` attribute. Only for geometry that has it. */
  vertexTint?: boolean
  /** Multiplies albedo by the InstancedMesh's per-instance colour. */
  instanceTint?: boolean
  /** 0..1, how much of the albedo shows through the night tint untouched. */
  emissive?: number
}

/** Every toon material shares the sun and the world tint, so the light can
 *  never disagree between two surfaces. */
const sharedSunDirection = new Vector3(0, 1, 0)
const sharedWorldTint = new Color(1, 1, 1)

export function setToonSunDirection(direction: Vector3): void {
  sharedSunDirection.copy(direction)
}

/** Day, night and the vents all write through this one colour. */
export function setWorldTint(tint: Color): void {
  sharedWorldTint.copy(tint)
}

export function createToonMaterial(options: ToonOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: TOON_VERTEX,
    fragmentShader: TOON_FRAGMENT,
    defines: {
      ...(options.vertexTint ? { USE_VERTEX_TINT: '' } : {}),
      ...(options.instanceTint ? { USE_INSTANCE_TINT: '' } : {}),
    },
    uniforms: {
      uAlbedo: { value: options.albedo },
      uShadeTint: { value: options.shadeTint ?? color(HEX.shade) },
      uRimColour: { value: options.rimColour ?? new Color(1, 1, 1) },
      uSunDirection: { value: sharedSunDirection },
      uWorldTint: { value: sharedWorldTint },
      uRimStrength: { value: options.rimStrength ?? 0.25 },
      uRimPower: { value: options.rimPower ?? 3.0 },
      uSpecStrength: { value: options.specStrength ?? 0.1 },
      uEmissive: { value: options.emissive ?? 0 },
      uRamp: { value: diffuseRamp },
    },
  })
}

/** A plain toon surface in one palette colour. Cached per colour and role. */
const simpleCache = new Map<string, ShaderMaterial>()

export function toon(hex: number, opts: { shade?: number; tinted?: boolean; instanced?: boolean; emissive?: number } = {}): ShaderMaterial {
  const key = `${hex}:${opts.shade ?? ''}:${opts.tinted ? 1 : 0}:${opts.instanced ? 1 : 0}:${opts.emissive ?? 0}`
  let material = simpleCache.get(key)
  if (!material) {
    material = createToonMaterial({
      albedo: color(hex),
      shadeTint: color(opts.shade ?? HEX.shade),
      rimColour: color(HEX.paper),
      rimStrength: 0.18,
      vertexTint: opts.tinted,
      instanceTint: opts.instanced,
      emissive: opts.emissive,
    })
    simpleCache.set(key, material)
  }
  return material
}
