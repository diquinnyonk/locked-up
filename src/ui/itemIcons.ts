import {
  AmbientLight,
  Box3,
  BufferAttribute,
  DataTexture,
  DirectionalLight,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  OrthographicCamera,
  RedFormat,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { itemGeometry } from '../art/itemModels'
import type { ItemId } from '../game/Items'

/**
 * Pocket icons, drawn from the same little models that lie on the floor, so
 * the sock in your pocket is the sock you picked up. Rendered once each on a
 * small offscreen canvas and kept as image URLs.
 */
const SIZE = 128
const cache = new Map<ItemId, string>()
let renderer: WebGLRenderer | null = null
let scene: Scene
let camera: OrthographicCamera
let material: MeshToonMaterial

function setup(): boolean {
  if (renderer) return true
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  } catch {
    return false
  }
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(0x000000, 0)
  scene = new Scene()
  scene.add(new AmbientLight(0xffffff, 1.4))
  const sun = new DirectionalLight(0xffffff, 1.6)
  sun.position.set(-1, 2.5, 1.5)
  scene.add(sun)
  camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
  // Three bands, like the toon ramp in the world.
  const ramp = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat)
  ramp.minFilter = ramp.magFilter = NearestFilter
  ramp.needsUpdate = true
  material = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp })
  return true
}

export function itemIcon(id: ItemId): string {
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  if (!setup() || !renderer) {
    cache.set(id, '')
    return ''
  }
  const geometry = itemGeometry(id)
  geometry.setAttribute('color', geometry.getAttribute('tint') as BufferAttribute)
  geometry.computeVertexNormals()
  const mesh = new Mesh(geometry, material)
  mesh.rotation.y = -0.5
  scene.add(mesh)

  // Frame it from above at the game's angle, filling the square.
  const box = new Box3().setFromObject(mesh)
  const centre = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const half = Math.max(size.x, size.z, size.y * 1.4) * 0.62
  camera.left = -half
  camera.right = half
  camera.top = half
  camera.bottom = -half
  camera.position.set(centre.x, centre.y + 4, centre.z + 2.6)
  camera.lookAt(centre)
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')

  scene.remove(mesh)
  geometry.dispose()
  cache.set(id, url)
  return url
}
