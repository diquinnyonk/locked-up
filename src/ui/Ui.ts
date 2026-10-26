import type { Camera } from 'three'
import { Vector3 } from 'three'
import { HEX, css } from '../art/palette'
import type { Game, UiPort } from '../game/Game'
import { ITEMS, INVENTORY_SLOTS, type ItemId, RECIPES, vouchers } from '../game/Items'
import { itemIcon } from './itemIcons'
import { CONTROLS } from './Tour'
import { ENDINGS, type Run, duration, readRecords } from '../game/Records'
import { TUNNEL_LENGTH } from '../game/Game'
import { recordsHtml, showRecords } from './RecordsView'
import { EVENT_INFO, isVisitingDay } from '../game/Events'
import { isTouch } from './Touch'
import { castLine, voiceFor } from '../audio/cast'
import { keyFor } from '../audio/lineKeys'
import { ATTEMPTS_PER_ROUND, METHOD_NAMES, ROUNDS, type Method } from '../npc/Memory'
import { MAP_H, MAP_W, PLAYER_CELL, Tile } from '../world/Grid'
import { GANGS, GANG_IDS, gangOfWing } from '../npc/Gangs'
import { type BunkNote, type Letter, governorsLetter } from '../game/Post'

/**
 * The interface, in DOM. Flat ink panels on paper, hard edges, no gradients:
 * the same graphic language as the cel world underneath it.
 */
export type MenuTab = 'main' | 'jobs' | 'pockets' | 'post' | 'notes' | 'endings' | 'help'

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

  /**
   * A conversation. With a `speaker` it is shown as a subtitle sheet along
   * the bottom of the screen while the camera cuts to over your shoulder;
   * without one it is an ordinary panel. `voice` is the recording to play,
   * if there is one yet.
   */
  talk(title: string, line: string, options: { label: string; enabled: boolean; run: () => void }[], voice?: string): void {
    const speaking = !!this.game?.talkingTo
    // Whoever is talking says their own line from the list, if they have one.
    const who = this.game?.voiceOf(this.game.talkingTo) ?? null
    if (!voice) line = castLine(who, line)
    this.openPanel(title, speaking ? 'dialogue' : '')
    const body = this.panel.querySelector('.body')!
    const p = document.createElement('p')
    p.className = 'line'
    p.textContent = `"${line}"`
    body.append(p)
    const list = document.createElement('div')
    list.className = 'options'
    for (const o of options) {
      const b = document.createElement('button')
      b.textContent = o.label
      b.disabled = !o.enabled
      b.onclick = () => o.run()
      list.append(b)
    }
    const close = document.createElement('button')
    close.className = 'ghost'
    close.textContent = 'Leave it'
    close.onclick = () => this.closePanels()
    list.append(close)
    body.append(list)
    this.onSpeak?.(voiceFor(voice ?? keyFor(line), who), line)
  }

  /** Set by the game: plays a recorded line when there is one. */
  onSpeak: ((voice: string | null, line: string) => void) | null = null
  /** Set by the game: a nearby speech bubble has just appeared. */
  onRemark: ((voice: string | null) => void) | null = null
  /** Set by the game: the conversation is over. */
  onClose: (() => void) | null = null

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
    const reveal = governorsLetter(g.player.name, won, g.clock.day, g.memory.totalFailures, g.post.notes.length)
    el.innerHTML = `
      <div class="sheet">
        <h1>${escape(title)}</h1>
        <p>${escape(body).replace(/\n/g, '<br>')}</p>
        ${lessons ? `<h3>What the prison learned</h3><ul>${lessons}</ul>` : ''}
        <p class="aside">One more letter came for you. It is on headed paper.</p>
        <article class="letter governor">
          <span class="stamp">From the Governor</span>
          <p>${escape(reveal).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>
        </article>
        <div id="endrecord"></div>
        <div class="endbuttons">
          <button id="again">Serve another sentence</button>
          <button id="endings-btn" class="ghost">Endings and records</button>
        </div>
      </div>`
    ;(el.querySelector('#again') as HTMLButtonElement).onclick = () => location.reload()
    ;(el.querySelector('#endings-btn') as HTMLButtonElement).onclick = () => showRecords()
  }

  /** After the ending is filed: a new find, a personal best. */
  endRecord(result: { isNew: boolean; found: number; best: boolean }, run: Run): void {
    const el = document.getElementById('endrecord')
    if (!el) return
    const stats = `${duration(run.seconds)} played, day ${run.day}, ${run.fails} failed attempt${run.fails === 1 ? '' : 's'}.`
    el.innerHTML = result.isNew
      ? `<p class="newfind">New ending found: ${result.found} of ${ENDINGS.length}. ${stats}</p>`
      : `<p class="newfind">${result.best ? 'A personal best for this ending. ' : ''}${stats} ${result.found} of ${ENDINGS.length} endings found.</p>`
  }

  closePanels(): void {
    this.panel.classList.remove('show', 'dialogue', 'menu')
    document.body.classList.remove('panel-open')
    this.panelOpen = false
    this.menuTab = null
    if (this.game) this.game.input.enabled = !this.game.over
    this.onClose?.()
  }

  // ---- Panels ----

  /** Every panel has a header with a close button, for thumbs as much as Esc. */
  private openPanel(title: string, kind = ''): void {
    this.panel.className = ''
    this.panel.innerHTML = `<header><h2>${escape(title)}</h2><button class="x" type="button" aria-label="Close">×</button></header><div class="body"></div>`
    ;(this.panel.querySelector('.x') as HTMLButtonElement).onclick = () => this.closePanels()
    this.panel.classList.add('show')
    for (const k of kind.split(' ').filter(Boolean)) this.panel.classList.add(k)
    document.body.classList.add('panel-open')
    this.panelOpen = true
    if (this.game) this.game.input.enabled = false
  }

  // ---- The menu: main mission, jobs, pockets, notes ----

  private menuTab: MenuTab | null = null

  /** Opens the menu on a tab, or closes it if that tab is already showing. */
  toggleMenu(tab: MenuTab): void {
    if (this.panelOpen && this.menuTab === tab) {
      this.closePanels()
      return
    }
    if (this.panelOpen && !this.menuTab) this.closePanels()
    this.openMenu(tab)
  }

  toggleCraft(): void {
    this.toggleMenu('pockets')
  }

  toggleJournal(): void {
    this.toggleMenu('main')
  }

  openMenu(tab: MenuTab): void {
    this.openPanel('Notebook', 'menu')
    this.menuTab = tab
    const tabs = document.createElement('nav')
    tabs.className = 'tabs'
    const g = this.game!
    const names: [MenuTab, string][] = [
      ['main', 'Main mission'],
      ['jobs', 'Jobs'],
      ['pockets', 'Pockets'],
      ['post', g.post.unread ? `Post (${g.post.unread})` : 'Post'],
      ['notes', 'Notes'],
      ['endings', 'Endings'],
      ['help', 'How to play'],
    ]
    for (const [id, label] of names) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.className = id === tab ? 'on' : ''
      b.onclick = () => this.openMenu(id)
      tabs.append(b)
    }
    this.panel.querySelector('header')!.after(tabs)
    const body = this.panel.querySelector('.body') as HTMLElement
    if (tab === 'main') this.renderMain(body)
    else if (tab === 'jobs') this.renderJobs(body)
    else if (tab === 'pockets') this.renderPockets(body)
    else if (tab === 'post') this.renderPost(body)
    else if (tab === 'help') this.renderHelp(body)
    else if (tab === 'endings') body.innerHTML = recordsHtml(readRecords())
    else this.renderNotes(body)
    // Saving: automatic, and a button for peace of mind.
    const bar = document.createElement('div')
    bar.className = 'savebar'
    const note = document.createElement('span')
    note.textContent = this.savedAt ? `Saved on this device: ${this.savedAt}. It saves by itself whenever things are quiet.` : 'It saves by itself on this device whenever things are quiet.'
    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'ghost'
    save.textContent = 'Save now'
    save.onclick = () => {
      const ok = this.onSave?.() ?? false
      this.toast(ok ? 'Saved.' : 'Not now: you cannot save while out of bounds, in a chase, in a riot or mid-conversation.', ok ? 'good' : 'bad')
      if (ok) note.textContent = `Saved on this device: ${this.savedAt}. It saves by itself whenever things are quiet.`
    }
    const download = document.createElement('button')
    download.type = 'button'
    download.className = 'ghost'
    download.textContent = 'Download save'
    download.onclick = () => {
      if (!(this.onDownload?.() ?? false)) this.toast('Nothing saved yet to download. Try again somewhere quiet.', 'bad')
    }
    const load = document.createElement('button')
    load.type = 'button'
    load.className = 'ghost'
    load.textContent = 'Load a save file'
    load.onclick = () => this.onImport?.()
    const buttons = document.createElement('span')
    buttons.className = 'savebuttons'
    buttons.append(save, download, load)
    bar.append(note, buttons)
    body.append(bar)
  }

  private renderMain(body: HTMLElement): void {
    const g = this.game!
    const p = g.player
    const inv = p.inventory
    const m = g.memory
    const now = g.clock.minutes
    const myDoor = g.grid.cells.get(p.cell)!.door
    const vent = g.grid.grates.find((gr) => gr.id === 'your cell')!
    const firm = gangOfWing(p.block)
    const tick = (done: boolean, text: string, hint = '') => `<li class="${done ? 'done' : ''}"><span class="box"></span><span>${text}${hint ? `<small>${hint}</small>` : ''}</span></li>`
    const contact = g.carPresent || g.signalTonight || g.contactNights > 0
    body.innerHTML = `
      <section class="mission">
        <h3 class="title">Escape HMP Grim-on-the-Moor</h3>
        <p>Everyone in here knows your name, ${escape(p.name)}: the one who robbed the Greggs. Attempts left this round: <b>${m.attemptsLeft} of ${ATTEMPTS_PER_ROUND}</b> (round ${m.round} of ${ROUNDS}).</p>
        <p class="today"><b>${g.clock.weekdayName}: ${escape(EVENT_INFO[g.events.today].title)}.</b> ${escape(EVENT_INFO[g.events.today].blurb)}${isVisitingDay(g.clock.weekday) ? ' Visiting this afternoon, 14:30 to 15:45.' : ''}</p>
        <h4>Out of your cell at night</h4>
        <ul class="checks">
          ${tick(!!inv.withUse('openDoor'), 'Have a key', 'Lift one from an officer (R), or forge one from a soap mould.')}
          ${tick(myDoor.jammed, 'Toothpaste in your lock', 'Stand in your open doorway by day and press R.')}
          ${tick(!m.sickIgnored && (!m.sickNeedsFroth || inv.has('soap')), 'Fake sickness ready', m.sickNeedsFroth ? 'They want to see froth now: carry soap to chew (Q).' : 'Press H behind your door at night.')}
          ${tick(m.backing(firm, now), `${GANGS[firm].name} paid to kick off`, `Their boss wants ${vouchers(m.bribePrice(firm))}. Jobs for them bring the price down.`)}
          ${tick(!vent.sealed && (vent.open || inv.has('spoon') || !!inv.withUse('openVent')), 'The vent behind your table', vent.sealed ? 'Welded shut. They know now.' : 'A spoon will turn the rusty screws.')}
        </ul>
        <h4>Word outside</h4>
        <ul class="checks">
          ${tick(contact, contact ? (g.carPresent ? 'The car is waiting on the road' : g.signalTonight ? 'Signal sent: the car comes tonight' : `The car waits ${g.contactNights} more night${g.contactNights === 1 ? '' : 's'}`) : 'Arrange a car', 'A phone call that never says when, the flag on the yard pole, or a torch at your window.')}
        </ul>
        <h4>Over the wall, or through it</h4>
        <ul class="checks">
          ${tick(inv.has('grapple'), 'Grappling hook', 'Two sheets, a fork and gaffer tape. Throw it from the south edge of the yard.')}
          ${tick(!!inv.withUse('openDoor'), 'A key for the gates', 'The loading bay gate opens onto the road.')}
        </ul>
        <h4>The Governor's safe</h4>
        <ul class="checks">
          ${tick(g.heist.knowA, 'First half of the combination', g.heist.knowA ? `${g.safeCode.slice(0, 2)}: his mother's birthday, circled in the desk diary.` : "Something on the Governor's desk, in his office off the officers' mess.")}
          ${tick(g.heist.knowB, 'Second half', g.heist.knowB ? `${g.safeCode.slice(2)}: the private plate on his Jag, from ${escape(g.keith.name)}.` : "Who sees the Governor's car every day?")}
          ${tick(inv.has('stethoscope'), 'Or a stethoscope', 'Healthcare keeps one. Crack the safe by ear instead: thirty seconds of clicks.')}
          ${tick(g.heist.opened, 'Safe opened', g.heist.opened ? 'The master key opens every door, but snaps after five turns. The Jag is parked just outside the staff door in the changing room.' : 'A master key, the keys to his Jag, petty cash, and your file to shred.')}
        </ul>
        <h4>The long way: a tunnel</h4>
        <ul class="checks">
          ${tick(g.tunnel.metres > 0, `Under the loose tile: ${g.tunnel.metres.toFixed(1)} of ${TUNNEL_LENGTH} metres`, g.memory.tunnelBlocked ? 'Concrete under every cell floor now. This way is closed.' : 'Dig at night after lights out, with a spoon (slow), a flattened spoon or a screwdriver (quickest). Officers on the landing can hear it.')}
          ${tick(!inv.has('rubble'), 'No rubble in your pockets', inv.has('rubble') ? `${inv.count('rubble')} lots of rubble on you: shake them out in the yard by day (R), out of sight.` : 'Every metre is a pocketful of rubble to get rid of in the yard.')}
          ${tick(!g.cellmate || g.cellmate.trust >= 0.4, `${escape(g.cellmate?.name ?? 'Your cellmate')} on side`, 'They sleep three feet from the hole. If they do not trust you, they will not stand for it.')}
          ${tick(g.tunnel.metres >= TUNNEL_LENGTH, 'Through to the allotments', 'Thirty metres and you come up beyond the wall, no car needed.')}
        </ul>
        <h4>Or one of the silly ways</h4>
        <ul class="checks">
          ${tick(inv.has('guardUniform'), "An officer's uniform", 'Clock off with the day shift at 20:45 in the staff changing room, off the loading bay. For your first two days every officer knows your face, so a disguise does not last. With an officer\'s keys as well, the staff door lets you out any time.')}
          ${tick(inv.has('sleepyRoll'), 'A sleepy sausage roll', m.foodRefused ? 'Burned once: officers will not eat anything you offer now.' : 'Sleeping pills from a fixer in a sausage roll. Shout an officer into your cell by day (H) and offer it to him: then his uniform and keys are yours.')}
          ${tick(inv.has('visitorDisguise'), 'Visitor disguise', `The wig and frock are in the chapel's panto box: ${g.chaplain.stage === 'done' ? 'the Reverend lent you the key' : 'padlocked until the Reverend trusts you'}. Leave with the visitors at 15:30 on Tuesdays, Thursdays and weekends.`)}
          ${tick(g.keith.bribedDay === g.clock.day, `${g.keith.name} on the X-ray paid off today`, `${m.xrayBribe} blue drink and ${m.xrayBribe} sausage roll, then into a laundry basket before 11:00. He sits at the X-ray in the loading bay: the blue square on your map.`)}
        </ul>
      </section>`
  }

  private renderJobs(body: HTMLElement): void {
    const g = this.game!
    const active = g.missions.active
    const offers = g.missions.whoHasWork()
    const rev = g.chaplain
    if (rev.stage === 'none') offers.push({ name: rev.name, where: 'the chapel, behind the altar' })
    const revJob = chaplainJob(g)
    const revEntry = revJob
      ? `<div class="entry${revJob.done ? ' done' : ''}"><span class="chip" style="background:${revJob.done ? css(HEX.yardGrass) : css(HEX.gateYellow)}"></span><div><b>The Missing Hymn Books</b> for ${escape(rev.name)}<p>Three hymn books stolen from the chapel: one levelling the pool table in the games room, one a soap dish in the showers, one propping up the bench press in the gym.</p><small>${escape(revJob.line)}</small></div></div>`
      : ''
    body.innerHTML = `
      ${revEntry}
      ${active.length ? active.map((m) => `<div class="entry${m.done ? ' done' : ''}"><span class="chip" style="background:${m.done ? css(HEX.yardGrass) : css(HEX.gateYellow)}"></span><div><b>${escape(m.tpl.title)}</b> for ${escape(m.giverName)}<p>${escape(m.brief)}</p><small>${m.done ? 'Done. ' : ''}${escape(g.missions.describe(m))}</small></div></div>`).join('') : revEntry ? '' : '<p class="hint">No jobs on. You can have three at once.</p>'}
      ${rev.stage === 'done' ? `<p class="hint">${rev.alibi ? 'The Reverend owes you one alibi: the next time you are caught, you were at choir practice.' : 'The Reverend has used up his one lie for you.'}</p>` : ''}
      <h3>Who has work</h3>
      ${offers.length ? `<ul>${offers.map((o) => `<li><b>${escape(o.name)}</b>: ${escape(o.where)}</li>`).join('')}</ul>` : '<p class="hint">Nobody, for now. Officers with favours to ask change every morning.</p>'}
      <p class="hint">Jobs done: ${g.missions.completedCount}. Gang jobs bring their riot price down. Officers pay in Greggs vouchers, goodwill or a blind eye.</p>`
  }

  private renderPockets(body: HTMLElement): void {
    const g = this.game!
    const inv = g.player.inventory
    const list = document.createElement('div')
    list.className = 'inv'
    inv.items.forEach((it, i) => {
      const def = ITEMS[it.id]
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `${icon(it.id)}<span class="name">${def.name}${def.contraband ? ' <i>contraband</i>' : ''}<small>${def.blurb}${def.damage > 1 ? ` · damage ${def.damage}` : ''}</small></span>`
      const use = document.createElement('button')
      const wearing = (it.id === 'guardUniform' && g.player.disguise === 'guard') || (it.id === 'visitorDisguise' && g.player.disguise === 'visitor')
      use.textContent = def.uses.includes('disguise') ? (wearing ? 'Take off' : 'Wear') : it.id === 'soap' ? 'Chew' : def.uses.includes('distract') ? 'Throw' : 'Inspect'
      use.onclick = () => {
        g.useItem(i)
        this.openMenu('pockets')
      }
      const drop = document.createElement('button')
      drop.className = 'ghost'
      drop.textContent = 'Drop'
      drop.onclick = () => {
        g.drop(i)
        this.openMenu('pockets')
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
      row.innerHTML = `${icon(r.makes)}<span class="name">${ITEMS[r.makes].name}<small>${needs}</small>${tools}${where}</span>`
      const b = document.createElement('button')
      b.textContent = 'Make'
      b.disabled = !ok
      b.onclick = () => {
        g.craft(r)
        this.openMenu('pockets')
      }
      row.append(b)
      body.append(row)
    }
  }

  /** Letters as envelopes; the notes from your bunk below them. */
  private renderPost(body: HTMLElement): void {
    const g = this.game!
    const post = g.post
    const list = document.createElement('div')
    list.className = 'envelopes'
    for (const letter of post.letters) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `envelope${letter.read ? '' : ' unread'}`
      b.innerHTML = `<span class="from">${escape(letter.from)}</span><span class="when">Day ${letter.day}${letter.read ? '' : ', unopened'}</span>`
      b.onclick = () => this.openLetter(letter)
      list.append(b)
    }
    if (!post.letters.length) list.innerHTML = '<p class="hint">Nothing yet. The post comes round at unlock.</p>'
    body.append(list)
    const h = document.createElement('h3')
    h.textContent = 'Left on your bunk'
    body.append(h)
    if (!post.notes.length) {
      const p = document.createElement('p')
      p.className = 'hint'
      p.textContent = 'Nothing yet. Somebody seems to come in while you are out.'
      body.append(p)
    }
    for (const note of post.notes) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'scrap-row'
      b.innerHTML = `<span>${escape(note.text.slice(0, 64))}…</span><small>Day ${note.day}</small>`
      b.onclick = () => this.showNote(note)
      body.append(b)
    }
  }

  private openLetter(letter: Letter): void {
    const g = this.game!
    g.readLetter(letter)
    this.openPanel(letter.from, 'menu reading')
    const body = this.panel.querySelector('.body') as HTMLElement
    body.innerHTML = `
      <article class="letter">
        <span class="stamp">Read by the censor</span>
        <p class="salute">Dear ${escape(g.player.name)},</p>
        <p>${escape(letter.body)}</p>
        <p class="sign">${escape(letter.sign)}</p>
        ${letter.gift ? `<p class="enclosed">${escape(letter.gift.line)}</p>` : ''}
      </article>`
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'quiet'
    back.textContent = 'Back to the post'
    back.onclick = () => this.openMenu('post')
    body.append(back)
  }

  /** A note from your bunk: a torn scrap, and what the paper is like. */
  showNote(note: BunkNote): void {
    this.openPanel('A note on your bunk', 'menu reading')
    const body = this.panel.querySelector('.body') as HTMLElement
    body.innerHTML = `
      <article class="scrap">
        <p>${escape(note.text)}</p>
      </article>
      <p class="hint">${escape(note.paper)}${this.game!.post.notesLeft === 0 ? ' Whoever it is has stopped pretending.' : ''}</p>`
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'quiet'
    back.textContent = 'Keep it with your post'
    back.onclick = () => this.openMenu('post')
    body.append(back)
  }

  /** Every control, and the first-day tour again. */
  private renderHelp(body: HTMLElement): void {
    const touch = isTouch()
    const rows = CONTROLS.map((c) => `<li><span class="keys">${touch ? `<b>${escape(c.touch)}</b>` : c.keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span><span>${escape(c.what)}</span></li>`).join('')
    body.innerHTML = `<p class="hint">Anything you can do right where you are shows at the bottom of the screen with its ${touch ? 'button' : 'key'}.</p><ul class="controls-list">${rows}</ul>`
    const again = document.createElement('button')
    again.type = 'button'
    again.textContent = 'Show me round again'
    again.onclick = () => {
      this.closePanels()
      this.onTour?.()
    }
    body.append(again)
  }

  /** Set by the game: saves now if it can, and says whether it did. */
  onSave: (() => boolean) | null = null
  /** Set by the game: downloads the save as a .json file. */
  onDownload: (() => boolean) | null = null
  /** Set by the game: asks for a save file and loads it. */
  onImport: (() => void) | null = null
  /** When the game was last saved, as the clock read then ("Day 3, 14:20"). */
  savedAt = ''

  /** Set by the game: runs the tour of the screen. */
  onTour: (() => void) | null = null

  private renderNotes(body: HTMLElement): void {
    const g = this.game!
    const used = (Object.keys(g.memory.used) as Method[]).filter((m) => g.memory.used[m] > 0)
    body.innerHTML = `
      <h3>Your record</h3>
      <p class="hint">${escape(g.player.name)}. Theft from a Greggs: a steak bake, four sausage rolls and a festive bake. Sentence: as long as it takes. Known on every landing as the Greggs Bandit.</p>
      <h3>Getting out of your cell</h3>
      <ol class="methods">
        <li><b>Steal a key</b>: get behind an officer (R), or knock one down and take them. Press soap on it to keep a mould.</li>
        <li><b>Toothpaste</b>: by day, stand in your open doorway and pack the lock (R). At night, ease it open.</li>
        <li><b>Fake sickness</b>: at night in your cell press H. Chew soap first (Q) once they wise up. Slip away from the escort in healthcare.</li>
        <li><b>Riot</b>: pay the boss of the firm that runs your wing, then press G. At night the landing goes up and the officers open the cells.</li>
        <li><b>The vent</b> behind your table. Nobody remembers it is there.</li>
      </ol>
      <h3>The officer in your cell</h3>
      <p class="hint">By day in your cell, press H to shout for an officer about a rat. He comes in and has a good look round with his back to you: give him a sleepy sausage roll, or a cosh round the ear. Take his uniform (E) and keys (R), and let yourself out of the staff door in the changing room. When he wakes, hours later and in his boxers, every officer knows about the stranger in uniform.</p>
      <h3>Silly ways out</h3>
      <p class="hint">Whole escapes on their own, no car needed. Odds now: officer ${Math.round(g.memory.sillyExitChance('guardDisguise') * 100)}%, visitor ${Math.round(g.memory.sillyExitChance('visitorDisguise') * 100)}%, laundry ${Math.round(g.memory.sillyExitChance('laundry') * 100)}% once ${escape(g.keith.name)} is paid. They get worse each time one is rumbled.</p>
      <h3>The firms</h3>
      ${GANG_IDS.map((id) => {
        const def = GANGS[id]
        const st = g.memory.gangs[id]
        const leader = g.gangLeader(id)
        const backing = g.memory.backing(id, g.clock.minutes)
        return `<div class="entry"><span class="chip" style="background:${css(def.hex)}"></span><div><b>${def.name}</b>, ${def.wing} wing. Boss: ${leader ? escape(leader.name) : 'nobody'}.<p>${escape(def.blurb)}</p><small>Riot price ${vouchers(g.memory.bribePrice(id))}. Hostility ${Math.round(st.hostility * 100)}%.${backing ? ' Backing you.' : ''} Rival: ${GANGS[def.rival].name}.</small></div></div>`
      }).join('')}
      <h3>What they have learned</h3>
      ${g.memory.lessons.length ? `<ul>${g.memory.lessons.map((l) => `<li>${escape(l.text)}</li>`).join('')}</ul>` : '<p class="hint">Nothing yet. Every failed attempt teaches them.</p>'}
      ${used.length ? `<p class="hint">Methods burned: ${used.map((m) => `${METHOD_NAMES[m]} ×${g.memory.used[m]}`).join(', ')}</p>` : ''}
      <p class="hint">Being out of bounds only becomes an attempt once an officer sees you. Get back behind your door before they catch you and it does not count. Phone line strictness: ${g.memory.phoneStrictness}/3.</p>
      <h3>Keys</h3>
      <p class="hint">WASD move · Shift run · C sneak · E use · R alternate · F fight · Tab pockets · J notebook · Q chew soap · H fake sick · G kick off · Z sleep · M map</p>`
  }

  toggleMap(): void {
    this.bigMap = !this.bigMap
    this.minimap.classList.toggle('big', this.bigMap)
    document.body.classList.toggle('bigmap', this.bigMap)
    $('#mapbtn').innerHTML = this.bigMap ? 'Close map <kbd>M</kbd>' : 'Bigger map <kbd>M</kbd>'
    ;($('#maplegend') as HTMLElement).hidden = !this.bigMap
    ;($('#maplegend .job') as HTMLElement).parentElement!.hidden = !!this.game?.hard
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

    const home = g.grid.roomName(p.cell)
    $('#who').innerHTML = `${escape(p.name)} <span class="home">${escape(home)}</span>`
    $('#time').textContent = `Day ${clock.day} · ${clock.text}`
    $('#period').textContent = `${clock.weekdayName}: ${clock.label}`
    $('#next').textContent = `${next.label} in ${Math.floor(next.in / 60)}h ${String(Math.floor(next.in % 60)).padStart(2, '0')}m`
    const pips = Array.from({ length: ATTEMPTS_PER_ROUND }, (_, i) => `<span class="pip ${i < m.attemptsUsed ? 'used' : ''}"></span>`).join('')
    $('#attempts').innerHTML = `<span class="label">Attempts</span>${pips}<span class="round">round ${m.round}/${ROUNDS}</span>`
    $('#health').style.width = `${p.health}%`

    const suspicion = Math.max(0, ...g.guards.map((gg) => (gg.chasing ? 1 : gg.suspicion)))
    const hunted = g.alarm.active || g.guards.some((gg) => gg.chasing)
    const rumbled = Math.max(0, ...g.guards.map((gg) => gg.recognise))
    const disguise = p.disguise && !p.disguiseBlown ? `Disguised as ${p.disguise === 'guard' ? 'an officer' : 'a visitor'}${rumbled > 0.05 ? `: ${Math.round(rumbled * 100)}% rumbled` : ''}` : ''
    const status = hunted
      ? 'HUNTED'
      : p.inBasket
        ? 'In a laundry basket'
        : disguise
          ? disguise
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
    $('#zone').textContent = p.zone === p.cell ? `Your cell, ${home.replace('Cell ', '')}` : g.grid.roomName(p.zone) || ''

    // Jobs on the go.
    const revJob = chaplainJob(g)
    const jobs =
      (revJob ? `<div class="job${revJob.done ? ' done' : ''}"><b>The Missing Hymn Books</b>${escape(revJob.line)}<br><small>for ${escape(g.chaplain.name)}</small></div>` : '') +
      g.missions.active
        .map((m) => `<div class="job${m.done ? ' done' : ''}"><b>${escape(m.tpl.title)}</b>${escape(g.missions.describe(m))}<br><small>for ${escape(m.giverName)}</small></div>`)
        .join('')
    const jobsEl = $('#jobs')
    if (jobsEl.dataset.html !== jobs) {
      jobsEl.innerHTML = jobs
      jobsEl.dataset.html = jobs
    }

    // Inventory strip.
    const inv = $('#inventory')
    let html = ''
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const it = p.inventory.items[i]
      if (it) {
        const def = ITEMS[it.id]
        html += `<div class="slot${def.contraband ? ' hot' : ''}" title="${escape(def.blurb)}">${icon(it.id)}<span class="label">${def.name}</span>${def.contraband ? '<span class="tag">Contraband</span>' : ''}</div>`
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
      if (el.textContent !== b.text) {
        el.textContent = b.text
        // Said within earshot, and not over a conversation: voice it.
        if (!g.talkingTo && Math.hypot(b.body.x - g.player.body.x, b.body.z - g.player.body.z) < 10) this.onRemark?.(voiceFor(keyFor(b.text), b.who))
      }
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
    label('CHAPEL', 12, 45)
    label('VISITS', 12.5, 54)
    label('GYM', 61.5, 45)
    label('LIB', 59, 51.5)
    label('MESS', 65.3, 51.5)
    label('BAY', 62, 57.5)
    label('GOV', 73.5, 51.5)
    label('STAFF', 73, 57.5)
    return c
  }

  private drawMinimap(g: Game): void {
    const ctx = this.mapCtx
    const base = this.mapBase!
    const size = this.bigMap ? Math.min(window.innerWidth - 32, (window.innerHeight - 150) * (MAP_W / MAP_H), 960) : 180
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

    // Keith on the X-ray: a blue square, always, since the laundry van
    // goes nowhere without him.
    const k = g.keith.body
    const ks = (this.bigMap ? 5 : 3.5) * ratio
    ctx.fillStyle = css(HEX.stainedBlue)
    ctx.fillRect(k.x * sx - ks, k.z * sy - ks, ks * 2, ks * 2)
    ctx.strokeStyle = css(HEX.paper)
    ctx.lineWidth = 1.5 * ratio
    ctx.strokeRect(k.x * sx - ks, k.z * sy - ks, ks * 2, ks * 2)

    // On normal, whatever your jobs need lights up: a pulsing gold ring.
    const labels: { x: number; z: number; text: string }[] = [{ x: k.x, z: k.z, text: 'Keith' }]
    if (!g.hard) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220)
      for (const t of g.jobTargets()) {
        ctx.strokeStyle = css(HEX.gateYellow)
        ctx.lineWidth = 2.5 * ratio
        ctx.beginPath()
        ctx.arc(t.x * sx, t.z * sy, (4 + pulse * 4) * ratio * (this.bigMap ? 1.4 : 1), 0, Math.PI * 2)
        ctx.stroke()
        dot(t.x, t.z, css(HEX.gateYellow), this.bigMap ? 3 : 2.2)
        labels.push({ x: t.x, z: t.z, text: t.label })
      }
    }
    if (this.bigMap) {
      ctx.font = `600 ${12 * ratio}px Literata, Georgia, serif`
      ctx.textBaseline = 'middle'
      for (const l of labels) {
        const text = l.text.length > 28 ? `${l.text.slice(0, 27)}…` : l.text
        const w = ctx.measureText(text).width
        const lx = Math.min(W - w - 6 * ratio, l.x * sx + 10 * ratio)
        ctx.fillStyle = css(HEX.ink)
        ctx.fillRect(lx - 3 * ratio, l.z * sy - 9 * ratio, w + 6 * ratio, 18 * ratio)
        ctx.fillStyle = css(HEX.paper)
        ctx.fillText(text, lx, l.z * sy)
      }
    }
    if (g.carPresent) dot(g.dynamic.car.position.x, g.dynamic.car.position.z, css(HEX.car), 3)
    dot(g.player.body.x, g.player.body.z, css(HEX.player), 3)
    ctx.strokeStyle = css(HEX.ink)
    ctx.lineWidth = 1.5 * ratio
    ctx.beginPath()
    ctx.arc(g.player.body.x * sx, g.player.body.z * sy, 3 * ratio, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** The Reverend's job while it is on: where you are with it. */
function chaplainJob(g: Game): { line: string; done: boolean } | null {
  if (g.chaplain.stage !== 'hunting') return null
  const have = g.player.inventory.count('hymnBook')
  return have >= 3 ? { line: 'All three found. Take them back to the Reverend in the chapel.', done: true } : { line: `Find the hymn books (${have}/3).`, done: false }
}

/** A pocket icon, or a colour chip if WebGL would not draw one. */
function icon(id: ItemId): string {
  const url = itemIcon(id)
  return url ? `<img class="icon" src="${url}" alt="">` : `<span class="chip" style="background:${css(ITEMS[id].hex)}"></span>`
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
