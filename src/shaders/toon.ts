import { BANDING, FRESNEL } from './chunks'

/**
 * The Windward toon shader, carried over nearly verbatim, with one addition:
 * a shared world tint. The prison runs a day and a night, and in the vents
 * everything outside the duct is pushed down into the dark. Both are one
 * uniform multiplied in at the end, so every lit surface changes together
 * and the palette never drifts per object.
 */
export const TOON_VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

#ifdef USE_VERTEX_TINT
attribute vec3 tint;
varying vec3 vTint;
#endif

#ifdef USE_INSTANCE_TINT
varying vec3 vInstanceTint;
#endif

void main() {
  #ifdef USE_INSTANCE_TINT
  #ifdef USE_INSTANCING_COLOR
  vInstanceTint = instanceColor;
  #else
  vInstanceTint = vec3(1.0);
  #endif
  #endif

  #ifdef USE_INSTANCING
  vec4 localPosition = instanceMatrix * vec4(position, 1.0);
  vec3 localNormal = mat3(instanceMatrix) * normal;
  #else
  vec4 localPosition = vec4(position, 1.0);
  vec3 localNormal = normal;
  #endif

  vec4 worldPosition = modelMatrix * localPosition;
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * localNormal);

  #ifdef USE_VERTEX_TINT
  vTint = tint;
  #endif

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const TOON_FRAGMENT = /* glsl */ `
${BANDING}
${FRESNEL}

uniform vec3 uAlbedo;
uniform vec3 uShadeTint;
uniform vec3 uRimColour;
uniform vec3 uSunDirection;
uniform vec3 uWorldTint;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uSpecStrength;
uniform float uEmissive;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;

#ifdef USE_VERTEX_TINT
varying vec3 vTint;
#endif

#ifdef USE_INSTANCE_TINT
varying vec3 vInstanceTint;
#endif

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  vec3 albedo = uAlbedo;
  #ifdef USE_VERTEX_TINT
  albedo *= vTint;
  #endif
  #ifdef USE_INSTANCE_TINT
  albedo *= vInstanceTint;
  #endif

  float light = bandedDiffuse(normal, uSunDirection);

  // Shadow side tinted toward the cool shade colour rather than to black.
  vec3 colour = albedo * mix(uShadeTint, vec3(1.0), light);

  vec3 halfVector = normalize(uSunDirection + viewDir);
  float spec = pow(max(dot(normal, halfVector), 0.0), 32.0);
  colour += uRimColour * crispStep(0.55, spec) * uSpecStrength;

  float rim = fresnel(normal, viewDir, uRimPower);
  colour += uRimColour * rim * uRimStrength;

  // Lights out dims the world; emissive things (torches, windows, fire)
  // keep their own value through it.
  colour = mix(colour * uWorldTint, albedo, uEmissive);

  gl_FragColor = vec4(colour, 1.0);
}
`
