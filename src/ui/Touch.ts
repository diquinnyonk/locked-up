import type { ActionKey, Input } from '../core/Input'

/**
 * On-screen controls for phones and tablets: a thumb stick wherever your
 * left thumb lands, and a block of buttons on the right for the keys.
 * Only built on touch screens; keyboards never see it.
 */
const BUTTONS: { label: string; action: ActionKey | 'run'; wide?: boolean }[] = [
  { label: 'Use', action: 'interact', wide: true },
  { label: 'Alt', action: 'secondary' },
  { label: 'Fight', action: 'attack' },
  { label: 'Sneak', action: 'sneak' },
  { label: 'Run', action: 'run' },
  { label: 'Pockets', action: 'craft' },
  { label: 'Notebook', action: 'journal' },
  { label: 'Map', action: 'map' },
  { label: 'Shout', action: 'sick' },
  { label: 'Kick off', action: 'riot' },
  { label: 'Sleep', action: 'sleep' },
  { label: 'Soap', action: 'froth' },
]

export function isTouch(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export function buildTouchControls(input: Input, openMenu: () => void): void {
  if (!isTouch()) return
  document.body.classList.add('touch')
  const pad = document.createElement('div')
  pad.id = 'touchpad'
  const knob = document.createElement('div')
  knob.id = 'knob'
  const base = document.createElement('div')
  base.id = 'stickbase'
  pad.append(base, knob)
  document.body.append(pad)

  let id: number | null = null
  let ox = 0
  let oy = 0
  const R = 56
  pad.addEventListener('pointerdown', (e) => {
    id = e.pointerId
    ox = e.clientX
    oy = e.clientY
    pad.setPointerCapture(e.pointerId)
    base.style.display = knob.style.display = 'block'
    base.style.transform = `translate(${ox - R}px, ${oy - R}px)`
    knob.style.transform = `translate(${ox - 24}px, ${oy - 24}px)`
  })
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return
    let dx = e.clientX - ox
    let dy = e.clientY - oy
    const d = Math.hypot(dx, dy)
    if (d > R) {
      dx = (dx / d) * R
      dy = (dy / d) * R
    }
    knob.style.transform = `translate(${ox + dx - 24}px, ${oy + dy - 24}px)`
    const l = Math.hypot(dx, dy) / R
    input.touchMove = l < 0.18 ? { x: 0, z: 0 } : { x: dx / R, z: dy / R }
  })
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    id = null
    input.touchMove = { x: 0, z: 0 }
    base.style.display = knob.style.display = 'none'
  }
  pad.addEventListener('pointerup', end)
  pad.addEventListener('pointercancel', end)

  const grid = document.createElement('div')
  grid.id = 'touchbuttons'
  for (const b of BUTTONS) {
    const el = document.createElement('button')
    el.type = 'button'
    el.textContent = b.label
    if (b.wide) el.className = 'wide'
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (b.action === 'run') {
        input.touchRun = !input.touchRun
        el.classList.toggle('on', input.touchRun)
      } else if (b.action === 'journal') openMenu()
      else input.press(b.action)
    })
    grid.append(el)
  }
  document.body.append(grid)
}
