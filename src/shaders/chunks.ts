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

/**
 * The painted style's light (see art/style.ts), used after the ramp when
 * uPaint is on. Needs NOISE. Sunlit faces warm, shade sides the soft violet
 * of the shade tint, a breath of sky blue on anything facing up, a gentle
 * watercolour mottle in the paint, and big soft cloud shadows drifting
 * across the whole prison on the breeze.
 */
export const PAINT = /* glsl */ `
uniform float uPaint;
uniform float uTime;

float cloudShade(vec3 p) {
  vec2 q = p.xz * 0.016 + vec2(uTime * 0.011, uTime * 0.004);
  return smoothstep(0.52, 0.7, fbm(q));
}

vec3 painted(vec3 albedo, float light, vec3 shade, vec3 normal, vec3 p, float mottle) {
  float m = fbm(p.xz * 0.12 + p.y * 0.1) - 0.5;
  float g = valueNoise(p.xz * 3.3 + p.y * 2.1) - 0.5;
  albedo *= 1.0 + (m * 0.09 + g * 0.03) * mottle;
  float cloud = cloudShade(p) * smoothstep(-0.2, 0.6, normal.y);
  light *= 1.0 - cloud * 0.32;
  vec3 colour = albedo * mix(shade, vec3(1.04, 1.0, 0.92), light);
  colour += vec3(0.04, 0.06, 0.1) * clamp(normal.y, 0.0, 1.0) * (1.0 - light);
  return colour;
}
`
