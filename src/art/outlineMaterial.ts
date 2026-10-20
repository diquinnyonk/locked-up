import { BackSide, Color, InstancedMesh, Mesh, Object3D, ShaderMaterial } from 'three'
import { HEX, color } from './palette'

/**
 * Inverted hull outline.
 *
 * The shell is pushed along the smoothed vertex normal by an amount
 * proportional to view distance *and* to the projection scale, which makes the
 * line a fixed number of pixels wide regardless of how far away the object is
 * or what the field of view is doing. Distance alone is not enough here: the
 * camera kicks its FOV by nearly twenty degrees under boost, and a push scaled
 * by distance alone visibly fattens every line as that happens.
 */
const OUTLINE_VERTEX = /* glsl */ `
uniform float uThicknessPixels;
uniform float uPixelScale;

void main() {
  #ifdef USE_INSTANCING
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
  #endif

  float viewDistance = length(cameraPosition - worldPosition.xyz);
  worldPosition.xyz += worldNormal * uThicknessPixels * uPixelScale * viewDistance;

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uInk;

void main() {
  gl_FragColor = vec4(uInk, 1.0);
}
`

export function createOutlineMaterial(thicknessPixels = 2.4, ink?: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    uniforms: {
      uThicknessPixels: { value: thicknessPixels },
      uInk: { value: ink ?? color(HEX.ink) },
      // 2 * tan(fov/2) / viewportHeight: refreshed per frame by the engine.
      uPixelScale: { value: 0.002 },
    },
  })
}

/**
 * Adds an outline shell as a sibling of each mesh under `root`.
 *
 * The shell is parented to the mesh's own parent rather than to the mesh, so it
 * inherits exactly the same animated transform without inheriting the mesh's
 * scale twice: the tail is scaled on the X axis as an airbrake, and a nested
 * shell would compound that.
 */
export function attachOutlines(root: Object3D, material: ShaderMaterial): Mesh[] {
  const shells: Mesh[] = []
  const targets: Mesh[] = []

  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh && !mesh.userData.isOutlineShell) targets.push(mesh)
  })

  for (const mesh of targets) {
    const shell = new Mesh(mesh.geometry, material)
    shell.userData.isOutlineShell = true
    // Drawn before the object so the object's own depth writes trim the shell
    // back to a rim rather than the shell z-fighting across the surface.
    shell.renderOrder = mesh.renderOrder - 1
    shell.position.copy(mesh.position)
    shell.quaternion.copy(mesh.quaternion)
    shell.scale.copy(mesh.scale)
    mesh.parent?.add(shell)
    shells.push(shell)
    // Keep the shell locked to its mesh as the animation moves things.
    mesh.userData.outlineShell = shell
  }

  return shells
}

/** Re-syncs shells to their meshes after animation has run. */
export function syncOutlines(meshes: Mesh[]): void {
  for (const mesh of meshes) {
    const shell = mesh.userData.outlineShell as Mesh | undefined
    if (!shell) continue
    shell.position.copy(mesh.position)
    shell.quaternion.copy(mesh.quaternion)
    shell.scale.copy(mesh.scale)
  }
}

/**
 * Outline shell for an InstancedMesh. Shares the source's instance matrix
 * attribute, so moving a crowd member moves their outline with no extra
 * bookkeeping. Needs a vertex normal that is smooth across the part, which
 * every primitive used for people already has.
 */
export function instancedOutline(mesh: InstancedMesh, material: ShaderMaterial): InstancedMesh {
  const shell = new InstancedMesh(mesh.geometry, material, mesh.count)
  shell.instanceMatrix = mesh.instanceMatrix
  shell.frustumCulled = false
  shell.renderOrder = mesh.renderOrder - 1
  shell.userData.isOutlineShell = true
  return shell
}
