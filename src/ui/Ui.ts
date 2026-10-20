import type { Camera } from 'three'
import { Vector3 } from 'three'
import { HEX, css } from '../art/palette'
import type { Game, UiPort } from '../game/Game'
import { ITEMS, INVENTORY_SLOTS, RECIPES } from '../game/Items'
import { ATTEMPTS_PER_ROUND, METHOD_NAMES, ROUNDS, type Method } from '../npc/Memory'
import { MAP_H, MAP_W, PLAYER_CELL, Tile } from '../world/Grid'
import { GANGS, GANG_IDS } from '../npc/Gangs'

/**
 * The interface, in DOM. Flat ink panels on paper, hard edges, no gradients:
 * the same graphic language as the cel world underneath it.
 */
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T

export class Ui implements UiPort {
  private game: Game | null = null
  private readonly toasts = $('#toasts')
  private readonly prompts = $('#prompts')
  private readonly bubbles = $('#bubbles')
  private readonly panel = $('#panel')
  private readonly card$ = $('#card')
  private readonly minimap = $('#minimap') as HTMLCanvasElement
  private readonly mapCtx = this.minimap.getContext('2d')!
  private bigMap = false
  private cardTimer = 0
  private mapBase: HTMLCanvasElement | null = null
  panelOpen = false
  paused = false

  attach(game: Game): void {
    this.game = game
    // Any key (or click) dismisses an information card early.
    const dismiss = () => {
      if (this.cardTimer > 0 && !this.paused) {
        this.hideCard()
        // Esc on a card only closes the card; it should not also pause.
        game.input.take('pause')
      }
    }
    window.addEventListener('keydown', dismiss)
    window.addEventListener('pointerdown', dismiss)
    this.mapBase = this.drawMapBase(game)
    document.body.classList.add('playing')
  }

  // ---- UiPort ----

  toast(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    const el = document.createElement('div')
    el.className = `toast ${tone}`
    el.textContent = text
    this.toasts.prepend(el)
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove()
    setTimeout(() => el.classList.add('fade'), 4200)
    setTimeout(() => el.remove(), 5000)
  }

  talk(title: string, line: string, options: { label: string; enabled: boolean; run: () => void }[]): void {
    this.openPanel(title)
    const body = this.panel.querySelector('.body')!
    const p = document.createElement('p')
    p.className = 'line'
    p.textContent = `"${line}"`
    body.append(p)
    for (const o of options) {
      const b = document.createElement('button')
      b.textContent = o.label
      b.disabled = !o.enabled
      b.onclick = () => o.run()
      body.append(b)
    }
    const close = document.createElement('button')
    close.className = 'ghost'
    close.textContent = 'Leave it (Esc)'
    close.onclick = () => this.closePanels()
    body.append(close)
  }

  phone(onSend: (message: string) => string): void {
    this.openPanel('Payphone: calls are recorded')
    const body = this.panel.querySelector('.body')!
    body.innerHTML = `
      <p class="hint">Your brother Dazza picks up. Arrange outside help without saying <em>when</em> or <em>how</em>: an officer is listening.</p>
      <textarea id="call" rows="3" maxlength="200" placeholder="Alright Daz, tell Nan I said hello..."></textarea>
      <button id="send">Speak</button>
      <p class="line" id="reply"></p>
      <button class="ghost" id="hang">Hang up</button>`
    const ta = body.querySelector('#call') as HTMLTextAreaElement
    ta.focus()
    ;(body.querySelector('#send') as HTMLButtonElement).onclick = () => {
      const reply = onSend(ta.value)
      ;(body.querySelector('#reply') as HTMLElement).textContent = reply
      ;(body.querySelector('#send') as HTMLButtonElement).disabled = true
      ta.disabled = true
    }
    ;(body.querySelector('#hang') as HTMLButtonElement).onclick = () => this.closePanels()
  }

  card(title: string, body: string, seconds = 4): void {
    this.card$.innerHTML = `<h2>${escape(title)}</h2><p>${escape(body).replace(/\n/g, '<br>')}</p>`
    this.card$.classList.add('show')
    this.cardTimer = seconds
  }

  hideCard(): void {
    this.card$.classList.remove('show')
    this.cardTimer = 0
  }

  end(won: boolean, title: string, body: string): void {
    const g = this.game!
    const el = $('#end')
    el.className = won ? 'show won' : 'show lost'
    const lessons = g.memory.lessons.map((l) => `<li><b>${METHOD_NAMES[l.method]}</b>: ${escape(l.text)}</li>`).join('')
    el.innerHTML = `
      <div class="sheet">
        <p class="kicker">${won ? 'Escaped' : 'Sentence: life'}</p>
        <h1>${escape(title)}</h1>
        <p>${escape(body).replace(/\n/g, '<br>')}</p>
        ${lessons ? `<h3>What the prison learned</h3><ul>${lessons}</ul>` : ''}
        <button id="again">Serve another sentence</button>
      </div>`
    ;(el.querySelector('#again') as HTMLButtonElement).onclick = () => location.reload()
  }

  closePanels(): void {
    this.panel.classList.remove('show')
    this.panelOpen = false
    if (this.game) this.game.input.enabled = !this.game.over
  }

  // ---- Panels ----

  private openPanel(title: string): void {
    this.panel.innerHTML = `<h2>${escape(title)}</h2><div class="body"></div>`
    this.panel.classList.add('show')
    this.panelOpen = true
    if (this.game) this.game.input.enabled = false
  }

  toggleCraft(): void {
    if (this.panelOpen) {
      this.closePanels()
      return
    }
    this.renderCraft()
  }

  private renderCraft(): void {
    const g = this.game!
    this.openPanel('Pockets & crafting')
    const body = this.panel.querySelector('.body')!
    const inv = g.player.inventory
    const list = document.createElement('div')
    list.className = 'inv'
    inv.items.forEach((it, i) => {
      const def = ITEMS[it.id]
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `<span class="chip" style="background:${css(def.hex)}"></span><span class="name">${def.name}${def.contraband ? ' <i>contraband</i>' : ''}<small>${def.blurb}${def.damage > 1 ? ` · damage ${def.damage}` : ''}</small></span>`
      const use = document.createElement('button')
      use.textContent = it.id === 'soap' ? 'Chew' : def.uses.includes('distract') ? 'Throw' : 'Inspect'
      use.onclick = () => {
        g.useItem(i)
        this.renderCraft()
      }
      const drop = document.createElement('button')
      drop.className = 'ghost'
      drop.textContent = 'Drop'
      drop.onclick = () => {
        g.drop(i)
        this.renderCraft()
      }
      row.append(use, drop)
      list.append(row)
    })
    if (!inv.items.length) list.innerHTML = '<p class="hint">Empty pockets.</p>'
    body.append(list)

    const h = document.createElement('h3')
    h.textContent = 'Make'
    body.append(h)
    for (const r of RECIPES) {
      const ok = g.craftable(r)
      const row = document.createElement('div')
      row.className = `row recipe ${ok ? 'ok' : ''}`
      const needs = r.needs.map((n) => ITEMS[n].name).join(' + ')
      const tools = r.tools?.length ? ` <small>using ${r.tools.map((t) => ITEMS[t].name).join(', ')}</small>` : ''
      const where = r.where ? ` <small>${r.where}</small>` : ''
      row.innerHTML = `<span class="chip" style="background:${css(ITEMS[r.makes].hex)}"></span><span class="name">${ITEMS[r.makes].name}<small>${needs}</small>${tools}${where}</span>`
      const b = document.createElement('button')
      b.textContent = 'Make'
      b.disabled = !ok
      b.onclick = () => {
        g.craft(r)
        this.renderCraft()
      }
      row.append(b)
      body.append(row)
    }
  }

  toggleJournal(): void {
    if (this.panelOpen) {
      this.closePanels()
      return
    }
    const g = this.game!
    this.openPanel('Journal')
    const body = this.panel.querySelector('.body')!
    const used = (Object.keys(g.memory.used) as Method[]).filter((m) => g.memory.used[m] > 0)
    body.innerHTML = `
      <h3>Getting out of your cell</h3>
      <ol class="methods">
        <li><b>Steal a key</b>: get behind an officer (R), or knock one down and take them. Press soap on it to keep a mould.</li>
        <li><b>Toothpaste</b>: by day, stand in your open doorway and pack the lock (R). At night, ease it open.</li>
        <li><b>Fake sickness</b>: at night in your cell press H. Chew soap first (Q) once they wise up. Slip away from the escort in healthcare.</li>
        <li><b>Riot</b>: pay the boss of the firm that runs your wing, then press G. At night the landing goes up and the officers open the cells.</li>
        <li><b>The vent</b> behind your table. Nobody remembers it is there.</li>
      </ol>
      <h3>Getting out of the prison</h3>
      <p>Over the yard wall with a grappling hook, or through the gatehouse with a key. Before you go, get word outside: a <b>phone call</b> that never says when (car waits three nights), the <b>flag</b> on the yard pole by day, or a <b>torch</b> from your window at night.</p>
      <h3>The firms</h3>
      ${GANG_IDS.map((id) => {
        const def = GANGS[id]
        const st = g.memory.gangs[id]
        const leader = g.gangLeader(id)
        const backing = g.memory.backing(id, g.clock.minutes)
        return `<div class="gang" style="border-left-color:${css(def.hex)}"><b>${def.name}</b>, ${def.wing} wing. Boss: ${leader ? escape(leader.name) : 'nobody'}.<br>${escape(def.blurb)}<br><small>Price to back a riot: ${g.memory.bribePrice(id)} snout · Hostility ${Math.round(st.hostility * 100)}%${backing ? ' · <b>backing you</b>' : ''} · Rival: ${GANGS[def.rival].name}</small></div>`
      }).join('')}
      <p class="hint">Nobody kicks off on a landing without the firm that runs it. Paying one firm offends its rival. Every riot the officers put down puts the price up.</p>
      <h3>Attempts</h3>
      <p class="hint">Being out of bounds only becomes an attempt once an officer sees you. Get back behind your door before they catch you and it does not count. ${g.hard ? 'Hard mode: no sight guide.' : 'The pale shapes on the floor are what each officer can see, cut off by walls; the small ring behind them is how close you can creep before they notice.'}</p>
      <h3>What they have learned</h3>
      ${g.memory.lessons.length ? `<ul>${g.memory.lessons.map((l) => `<li>${escape(l.text)}</li>`).join('')}</ul>` : '<p class="hint">Nothing yet. Every failed attempt teaches them.</p>'}
      ${used.length ? `<p class="hint">Methods burned: ${used.map((m) => `${METHOD_NAMES[m]} ×${g.memory.used[m]}`).join(', ')}</p>` : ''}
      <p class="hint">Phone line strictness: ${g.memory.phoneStrictness}/3</p>
      <h3>Keys</h3>
      <p class="hint">WASD move · Shift run · C sneak · E use · R alternate · F fight · Tab pockets & crafting · Q chew soap · H fake sick · G kick off · Z sleep · M map · J journal</p>`
    const close = document.createElement('button')
    close.className = 'ghost'
    close.textContent = 'Close'
    close.onclick = () => this.closePanels()
    body.append(close)
  }

  toggleMap(): void {
    this.bigMap = !this.bigMap
    this.minimap.classList.toggle('big', this.bigMap)
  }

  // ---- Per frame ----

  update(delta: number, camera: Camera): void {
    const g = this.game
    if (!g) return
    if (this.cardTimer > 0) {
      this.cardTimer -= delta
      if (this.cardTimer <= 0) this.card$.classList.remove('show')
    }
    const p = g.player
    const m = g.memory
    const clock = g.clock
    const next = clock.next

    $('#who').textContent = p.name
    $('#time').textContent = `Day ${clock.day} · ${clock.text}`
    $('#period').textContent = clock.label
    $('#next').textContent = `${next.label} in ${Math.floor(next.in / 60)}h ${String(Math.floor(next.in % 60)).padStart(2, '0')}m`
    const pips = Array.from({ length: ATTEMPTS_PER_ROUND }, (_, i) => `<span class="pip ${i < m.attemptsUsed ? 'used' : ''}"></span>`).join('')
    $('#attempts').innerHTML = `<span class="label">Attempts</span>${pips}<span class="round">round ${m.round}/${ROUNDS}</span>`
    $('#health').style.width = `${p.health}%`

    const suspicion = Math.max(0, ...g.guards.map((gg) => (gg.chasing ? 1 : gg.suspicion)))
    const hunted = g.alarm.active || g.guards.some((gg) => gg.chasing)
    const status = hunted
      ? 'HUNTED'
      : p.attempt
        ? 'SPOTTED: ESCAPE ATTEMPT'
        : p.illegal === 2
          ? p.inVent
            ? 'In the vents: unseen'
            : 'Out of bounds: unseen'
          : p.illegal === 1
            ? 'Somewhere you should not be'
            : ''
    const st = $('#status')
    st.textContent = status
    st.className = status ? (hunted || p.attempt ? 'alert' : 'warn') : ''
    $('#suspicion').style.width = `${suspicion * 100}%`
    ;($('#suspicion').parentElement as HTMLElement).style.visibility = suspicion > 0.02 ? 'visible' : 'hidden'

    const contact = g.carPresent ? 'A car is waiting on the road' : g.signalTonight ? 'Signal sent: car comes tonight' : g.contactNights > 0 ? `Car waits ${g.contactNights} more night${g.contactNights === 1 ? '' : 's'}` : 'No contact outside'
    $('#contact').textContent = contact
    $('#contact').className = g.carPresent || g.signalTonight || g.contactNights > 0 ? 'on' : ''
    $('#attempt').textContent = p.attempt ? `Attempt: ${METHOD_NAMES[p.attempt]}` : ''
    $('#zone').textContent = g.grid.roomName(p.zone) || ''

    // Inventory strip.
    const inv = $('#inventory')
    let html = ''
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const it = p.inventory.items[i]
      if (it) {
        const def = ITEMS[it.id]
        html += `<div class="slot${def.contraband ? ' hot' : ''}" title="${def.blurb}"><span class="chip" style="background:${css(def.hex)}"></span>${def.name}</div>`
      } else html += '<div class="slot empty"></div>'
    }
    if (inv.dataset.html !== html) {
      inv.innerHTML = html
      inv.dataset.html = html
    }

    // Prompts.
    const ph = g.prompts.map((pr) => `<div><kbd>${pr.key}</kbd>${escape(pr.label)}</div>`).join('')
    if (this.prompts.dataset.html !== ph) {
      this.prompts.innerHTML = ph
      this.prompts.dataset.html = ph
    }

    this.drawBubbles(g, camera)
    this.drawMinimap(g)
  }

  private readonly bubblePool: HTMLDivElement[] = []

  private drawBubbles(g: Game, camera: Camera): void {
    const v = new Vector3()
    const w = window.innerWidth
    const h = window.innerHeight
    let i = 0
    for (const b of g.bubbles.slice(0, 10)) {
      v.set(b.body.x, b.body.y + 2.7, b.body.z).project(camera)
      if (v.z > 1) continue
      let el = this.bubblePool[i]
      if (!el) {
        el = document.createElement('div')
        el.className = 'bubble'
        this.bubbles.append(el)
        this.bubblePool.push(el)
      }
      el.style.display = 'block'
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`
      if (el.textContent !== b.text) el.textContent = b.text
      i++
    }
    for (; i < this.bubblePool.length; i++) this.bubblePool[i].style.display = 'none'
  }

  private drawMapBase(g: Game): HTMLCanvasElement {
    const c = document.createElement('canvas')
    const s = 4
    c.width = MAP_W * s
    c.height = MAP_H * s
    const ctx = c.getContext('2d')!
    ctx.fillStyle = css(HEX.outsideGrass)
    ctx.fillRect(0, 0, c.width, c.height)
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = g.grid.tile(x, y)
        const zone = g.grid.zone(x, y)
        let col: string | null = null
        if (t === Tile.Solid) col = css(HEX.steelDark)
        else if (t === Tile.Perimeter) col = css(HEX.brick)
        else if (t === Tile.Door) col = css(HEX.gateYellow)
        else if (t === Tile.Floor) col = zone === 'yard' ? css(HEX.yardTarmac) : zone.startsWith('cell') ? css(zone === PLAYER_CELL ? HEX.player : HEX.floorCell) : zone === 'maint' || zone === 'solitary' ? css(HEX.doorRed) : css(HEX.floorLino)
        if (col) {
          ctx.fillStyle = col
          ctx.fillRect(x * s, y * s, s, s)
        }
      }
    }
    ctx.fillStyle = css(HEX.road)
    ctx.fillRect(0, 64.5 * s, c.width, 3 * s)
    ctx.font = 'bold 9px ui-sans-serif, system-ui'
    ctx.fillStyle = css(HEX.paper)
    const label = (t: string, x: number, y: number) => ctx.fillText(t, x * s, y * s)
    label('A', 18, 15.5)
    label('B', 59, 15.5)
    label('C', 18, 34.5)
    label('D', 59, 34.5)
    label('CANTEEN', 35.5, 24)
    label('YARD', 37, 50)
    label('SHWR', 33.5, 10.5)
    label('LNDRY', 41, 10.5)
    label('GAMES', 49, 24.5)
    label('MAINT', 62, 24.5)
    label('HEALTH', 22, 24.5)
    label('SEG', 11, 24.5)
    return c
  }

  private drawMinimap(g: Game): void {
    const ctx = this.mapCtx
    const base = this.mapBase!
    const size = this.bigMap ? Math.min(window.innerWidth - 32, window.innerHeight - 140, 640) : 180
    const ratio = window.devicePixelRatio || 1
    if (this.minimap.width !== Math.round(size * ratio)) {
      this.minimap.width = Math.round(size * ratio)
      this.minimap.height = Math.round(size * ratio * (MAP_H / MAP_W))
      this.minimap.style.width = `${size}px`
      this.minimap.style.height = `${size * (MAP_H / MAP_W)}px`
    }
    const W = this.minimap.width
    const H = this.minimap.height
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(base, 0, 0, W, H)
    const sx = W / (MAP_W * 2)
    const sy = H / (MAP_H * 2)
    const dot = (x: number, z: number, col: string, r: number) => {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(x * sx, z * sy, r * ratio, 0, Math.PI * 2)
      ctx.fill()
    }
    if (g.player.inVent || this.bigMap) {
      ctx.strokeStyle = css(HEX.duct)
      ctx.lineWidth = 2 * ratio
      for (const d of g.grid.ducts) {
        ctx.beginPath()
        ctx.moveTo((d.x0 + 0.5) * 2 * sx, (d.y0 + 0.5) * 2 * sy)
        ctx.lineTo((d.x1 + 0.5) * 2 * sx, (d.y1 + 0.5) * 2 * sy)
        ctx.stroke()
      }
      for (const gr of g.grid.grates) dot((gr.tx + 0.5) * 2, (gr.ty + 0.5) * 2, gr.sealed ? css(HEX.doorRed) : css(HEX.gateYellow), 2.2)
    }
    if (!g.hard) for (const gu of g.guards) if (gu.ko <= 0) dot(gu.x, gu.z, gu.chasing ? css(HEX.visionAlert) : css(HEX.paper), 1.8)
    if (g.carPresent) dot(g.dynamic.car.position.x, g.dynamic.car.position.z, css(HEX.car), 3)
    dot(g.player.body.x, g.player.body.z, css(HEX.player), 3)
    ctx.strokeStyle = css(HEX.ink)
    ctx.lineWidth = 1.5 * ratio
    ctx.beginPath()
    ctx.arc(g.player.body.x * sx, g.player.body.z * sy, 3 * ratio, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
