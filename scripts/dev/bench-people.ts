import { makeBody, Crowd } from '../../src/render/Crowd'
import { People } from '../../src/render/People'
const N = 100
const bodies = Array.from({ length: N }, (_v, i) => {
  const b = makeBody({ hair: i % 5 ? 0x6b4630 : null, beard: i % 4 === 0, tuft: i % 3 === 0 })
  b.pose = (['walk', 'stand', 'sit', 'fight', 'walk'] as const)[i % 5]
  b.speed = b.pose === 'walk' ? 2 : 0
  b.x = (i % 10) * 2
  b.z = Math.floor(i / 10) * 2
  return b
})
for (const [name, make] of [['jointed', () => new Crowd(N)], ['rigged', () => new People(N)]] as const) {
  const t0 = performance.now()
  const c = make()
  bodies.forEach((b, i) => c.paint(i, b))
  const built = performance.now() - t0
  for (let i = 0; i < 30; i++) c.update(bodies, 1 / 60)
  const t1 = performance.now()
  for (let i = 0; i < 300; i++) c.update(bodies, 1 / 60)
  const per = (performance.now() - t1) / 300
  let tris = 0
  c.group.traverse((o: any) => {
    if (o.isMesh && o.visible) {
      const g = o.geometry
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3
      tris += o.isInstancedMesh ? n * Math.min(o.count, N * 2) : n
    }
  })
  console.log(`${name.padEnd(8)} build ${built.toFixed(0)} ms, update ${per.toFixed(2)} ms/frame for ${N} people, ~${Math.round(tris / 1000)}k triangles`)
}
