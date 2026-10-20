/**
 * Shared GLSL. These are concatenated into shader sources as template strings -
 * no loader plugin, so `npm install && npm run dev` has nothing to configure.
 */

/** Cheap hash/value noise. Used for floor grime and yard grass, never for surface detail. */
export const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += valueNoise(p) * amp;
    p *= 2.03;
    p += 17.1;
    amp *= 0.5;
  }
  return sum;
}
`

/** Quantised diffuse via the shared ramp lookup. */
export const BANDING = /* glsl */ `
uniform sampler2D uRamp;

float bandedDiffuse(vec3 normal, vec3 sunDir) {
  float ndl = dot(normalize(normal), sunDir) * 0.5 + 0.5;
  return texture2D(uRamp, vec2(clamp(ndl, 0.0, 1.0), 0.5)).r;
}

/** Hard-edged step with a single pixel of anti-aliasing, so bands stay crisp
    without shimmering into moire at grazing angles. */
float crispStep(float edge, float x) {
  float w = fwidth(x) * 0.8;
  return smoothstep(edge - w, edge + w, x);
}
`

/** Fresnel rim, used to separate silhouettes from the water at any angle. */
export const FRESNEL = /* glsl */ `
float fresnel(vec3 normal, vec3 viewDir, float power) {
  return pow(1.0 - clamp(dot(normalize(normal), normalize(viewDir)), 0.0, 1.0), power);
}
`
