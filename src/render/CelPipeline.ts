import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  DepthTexture,
  LinearSRGBColorSpace,
  Mesh,
  MeshNormalMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import { HEX, color } from '../art/palette'

/**
 * Objects on this layer are drawn into the normal/depth prepass and receive
 * screen-space interior lines. Everything solid in the prison sits on it;
 * vision cones, smoke and the floor decals stay off so they never get inked.
 */
export const SOLID_LAYER = 1

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Windward's composite, unchanged in method: a Roberts cross over a normal
 * and depth prepass, with the depth edge taken as a Laplacian so flat floors
 * seen at a grazing angle never fill with ink. The prison is all right angles,
 * so the normal edge does most of the work here: wall tops, door frames and
 * bunk rails all come from it.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform vec3 uInk;
uniform float uNear;
uniform float uFar;
uniform float uDepthThreshold;
uniform float uNormalThreshold;
uniform float uVignette;
uniform vec3 uFlash;
uniform float uFlashAmount;

varying vec2 vUv;

float linearDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec2 texel = 1.0 / uResolution;
  vec2 o1 = vec2(texel.x, texel.y);
  vec2 o2 = vec2(texel.x, -texel.y);

  float d0 = linearDepth(vUv + o1);
  float d1 = linearDepth(vUv - o1);
  float d2 = linearDepth(vUv + o2);
  float d3 = linearDepth(vUv - o2);
  float centre = max(linearDepth(vUv), 0.0001);
  float depthEdge = (abs(d0 + d1 - 2.0 * centre) + abs(d2 + d3 - 2.0 * centre)) / centre;

  vec3 n0 = texture2D(tNormal, vUv + o1).rgb;
  vec3 n1 = texture2D(tNormal, vUv - o1).rgb;
  vec3 n2 = texture2D(tNormal, vUv + o2).rgb;
  vec3 n3 = texture2D(tNormal, vUv - o2).rgb;
  float normalEdge = length(n0 - n1) + length(n2 - n3);
  float hasGeometry = step(linearDepth(vUv), uFar * 0.99);

  float edge = max(
    step(uDepthThreshold, depthEdge),
    step(uNormalThreshold, normalEdge) * hasGeometry
  );

  vec3 colour = mix(scene.rgb, uInk, edge);

  // A hard-stepped vignette, not a soft one: two flat rings of ink at the
  // corners, so the alert state reads as graphic rather than as a lens.
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(uResolution.x / uResolution.y, 1.0));
  float ring = step(0.62, r) * 0.18 + step(0.78, r) * 0.22;
  colour = mix(colour, uInk, ring * uVignette);
  colour = mix(colour, uFlash, uFlashAmount * (0.35 + step(0.55, r) * 0.4));

  gl_FragColor = vec4(colour, 1.0);
}
`

export class CelPipeline {
  private sceneTarget: WebGLRenderTarget
  private normalTarget: WebGLRenderTarget
  private readonly normalMaterial = new MeshNormalMaterial()
  private readonly composite: ShaderMaterial
  private readonly quad: Mesh
  private readonly quadScene = new Scene()
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(width: number, height: number) {
    this.sceneTarget = createTarget(width, height, false)
    this.normalTarget = createTarget(width, height, true)

    this.composite = new ShaderMaterial({
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        uResolution: { value: new Vector2(width, height) },
        uInk: { value: color(HEX.ink) },
        uNear: { value: 0.5 },
        uFar: { value: 600 },
        uDepthThreshold: { value: 0.035 },
        uNormalThreshold: { value: 0.6 },
        uVignette: { value: 0 },
        uFlash: { value: color(HEX.visionAlert).clone() },
        uFlashAmount: { value: 0 },
      },
    })

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
    this.quad = new Mesh(geometry, this.composite)
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
  }

  setSize(width: number, height: number): void {
    this.sceneTarget.setSize(width, height)
    this.normalTarget.setSize(width, height)
    ;(this.composite.uniforms.uResolution.value as Vector2).set(width, height)
  }

  /** 0..1 ink vignette, raised while a guard is onto you. */
  set vignette(v: number) {
    this.composite.uniforms.uVignette.value = v
  }

  /** A one-colour screen flash (caught, hit, alarm). */
  flash(hex: number, amount: number): void {
    ;(this.composite.uniforms.uFlash.value as { setHex: (h: number) => void }).setHex(hex)
    this.composite.uniforms.uFlashAmount.value = amount
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    this.composite.uniforms.uNear.value = camera.near
    this.composite.uniforms.uFar.value = camera.far
    const previousMask = camera.layers.mask

    camera.layers.set(SOLID_LAYER)
    scene.overrideMaterial = this.normalMaterial
    renderer.setRenderTarget(this.normalTarget)
    renderer.clear()
    renderer.render(scene, camera)
    scene.overrideMaterial = null
    camera.layers.mask = previousMask

    renderer.setRenderTarget(this.sceneTarget)
    renderer.clear()
    renderer.render(scene, camera)

    renderer.setRenderTarget(null)
    renderer.render(this.quadScene, this.quadCamera as Camera)
  }
}

function createTarget(width: number, height: number, withDepth: boolean): WebGLRenderTarget {
  const target = new WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false })
  target.texture.colorSpace = LinearSRGBColorSpace
  if (withDepth) {
    target.texture.minFilter = NearestFilter
    target.texture.magFilter = NearestFilter
    const depth = new DepthTexture(width, height)
    depth.type = UnsignedIntType
    depth.minFilter = NearestFilter
    depth.magFilter = NearestFilter
    target.depthTexture = depth
  }
  return target
}
