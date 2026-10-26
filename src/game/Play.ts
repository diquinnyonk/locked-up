import { TILE } from '../world/Grid'
import type { Game } from './Game'

/**
 * A secret mission: the Governor's Players present The Count of Monte
 * Cristo, in the chapel, with officers and prisoners in the cast. The one
 * part left is the Abbé Faria, who dies in Act Two and is carried off in a
 * sack, and the scenery goes back out of the gate on the Grimsby Rep's van
 * after the show, props crate and all.
 *
 * It turns up in about one sentence in ten, and only ever once in a
 * browser: the page rolls for it and remembers that it has (see
 * rollSecret). Audition on day two, rehearse on days three and four, and on
 * opening night, day five, take your cue.
 */
export type PlayStage = 'notice' | 'cast' | 'opening' | 'done' | 'failed'

/** The days, counted from the day the notice goes up. */
const AUDITION = 1
const REHEARSALS = [2, 3]
const OPENING = 4
/** Afternoon association: auditions and rehearsals. */
const REHEARSE_FROM = 14 * 60 + 30
const REHEARSE_TO = 17 * 60
/** Opening night, and the window for the sack scene in Act Two. */
const SHOW_FROM = 18 * 60
const SHOW_TO = 20 * 60
const CUE_FROM = 19 * 60
const CUE_TO = 19 * 60 + 40
/** Minutes in the chapel that count as turning up to a rehearsal. */
const ATTEND = 20

/** Where the Governor directs from, and where the props crate stands. */
export const DIRECTOR = { x: 11.8 * TILE + TILE / 2, z: 44 * TILE + TILE / 2 }
export const PROPS_CRATE = { x: 11.6 * TILE + TILE / 2, z: 45.7 * TILE + TILE / 2 }

export class Play {
  stage: PlayStage = 'notice'
  /** The notice goes up at lunchtime on the first day. */
  announced = false
  /** The game day the notice went up. */
  startDay = 0
  /** Rehearsals attended, by index. */
  attended: boolean[] = REHEARSALS.map(() => false)
  /** Minutes in the chapel at today's rehearsal so far. */
  private minutes = 0
  private lastMinute = -1
  /** Toasts already given today, so each is said once. */
  private said = new Set<string>()

  constructor(private readonly game: Game) {}

  private get dayN(): number {
    return this.game.clock.day - this.startDay
  }

  /** What the HUD and Notebook say about it, or null once it is over. */
  get status(): { title: string; text: string } | null {
    if (!this.announced) return null
    const d = this.dayN
    const day = (n: number) => `day ${this.startDay + n}`
    if (this.stage === 'notice') return { title: "The Governor's play", text: `Auditions in the chapel, ${day(AUDITION)}, 14:30 to 17:00. Talk to the Governor there.` }
    if (this.stage === 'cast') {
      const next = REHEARSALS.findIndex((r, i) => !this.attended[i] && r >= d)
      if (next >= 0) return { title: "The Governor's play", text: `You are the Abbé Faria. Rehearsal ${next + 1} in the chapel, ${day(REHEARSALS[next])}, 14:30 to 17:00. Do not miss it.` }
      return { title: "The Governor's play", text: `Opening night, ${day(OPENING)}, 18:00 in the chapel. Your cue is just after 19:00.` }
    }
    if (this.stage === 'opening') return { title: 'Opening night', text: 'Be in the chapel. When your cue comes, get in the sack by the props crate.' }
    return null
  }

  /** Whether the Governor is in the chapel directing, right now. */
  get directing(): boolean {
    if (!this.announced || this.stage === 'done' || this.stage === 'failed' || this.game.clock.locked) return false
    const d = this.dayN
    const m = this.game.clock.minuteOfDay
    if (d === OPENING) return m >= SHOW_FROM && m < SHOW_TO
    const rehearsalDay = (this.stage === 'notice' && d === AUDITION) || (this.stage === 'cast' && REHEARSALS.includes(d))
    return rehearsalDay && m >= REHEARSE_FROM && m < REHEARSE_TO
  }

  /** The cue: get in the sack. */
  get cue(): boolean {
    const m = this.game.clock.minuteOfDay
    return this.stage === 'opening' && m >= CUE_FROM && m < CUE_TO
  }

  private begin(): void {
    const g = this.game
    this.announced = true
    this.startDay = g.clock.day
    g.toast(`A notice on the board: THE GOVERNOR'S PLAYERS present THE COUNT OF MONTE CRISTO, with officers and residents. One part still to cast. Auditions in the chapel, day ${this.startDay + AUDITION}, 14:30.`, 'good')
  }

  /** Unlock: a missed audition or rehearsal ends it. */
  newDay(): void {
    if (!this.announced) return
    const g = this.game
    const d = this.dayN
    this.minutes = 0
    this.said.clear()
    if (this.stage === 'notice' && d > AUDITION) {
      this.stage = 'failed'
      g.toast('The cast list is up for the Governor\'s play. Your name is not on it. Big Dave is the Abbé Faria, and is unbearable about it.', 'bad')
      return
    }
    if (this.stage === 'cast') {
      const missed = REHEARSALS.findIndex((r, i) => r < d && !this.attended[i])
      if (missed >= 0) {
        this.stage = 'failed'
        g.toast('A note under your door, on headed paper: "You missed rehearsal. The part of the Abbé Faria has been recast. R. Pettigrew, Director." Mr Crumpet is getting in the sack now.', 'bad')
        return
      }
      if (d === OPENING) {
        this.stage = 'opening'
        g.toast("Opening night tonight! The Grimsby Rep's van brought the last of the scenery this morning. Curtain up at 18:00 in the chapel.", 'good')
      }
    }
  }

  /** Every frame. */
  update(): void {
    const g = this.game
    const m = g.clock.minuteOfDay
    if (!this.announced) {
      if (m >= 11 * 60 + 30 && !g.clock.locked) this.begin()
      return
    }
    const d = this.dayN
    const here = g.player.zone === 'chapel'
    // Rehearsals: turn up and stay a while.
    if (this.stage === 'cast' && this.directing) {
      const i = REHEARSALS.indexOf(d)
      if (here && m !== this.lastMinute) this.minutes++
      this.lastMinute = m
      if (i >= 0 && !this.attended[i] && this.minutes >= ATTEND) {
        this.attended[i] = true
        g.toast(
          i === 0
            ? "Rehearsal one. The set comes in on the Grimsby Rep's van and goes back out on it after the show, props crate and all. Nobody checks the props crate. Why would they?"
            : 'Rehearsal two, the sack scene. Faria dies, the gaolers sew him into a sack and carry him off to the props crate by the altar. You lie very still. "A natural," says the Governor.',
          'good',
        )
      }
    }
    // Opening night: six officers in the audience, and your cue.
    if (d === OPENING && (this.stage === 'opening' || this.stage === 'done')) {
      const on = m >= SHOW_FROM && m < SHOW_TO && !g.clock.locked
      const watching = g.guards.filter((gu) => gu.duty !== 'landing' || gu.block !== g.player.block).slice(0, 6)
      for (const gu of g.guards) gu.panto = on && watching.includes(gu)
      if (on) this.once('curtain', "Curtain up! Six officers are in the front pews for the Governor's play, and the landings are thin.", 'good')
      if (this.cue) this.once('cue', here ? 'Act Two. Faria is dying. That is you. Your cue: into the sack by the props crate.' : 'Act Two has started in the chapel, and the Abbé Faria is nowhere to be seen. Your cue!', here ? 'good' : 'bad')
      if (this.stage === 'opening' && m >= CUE_TO) {
        this.stage = 'failed'
        g.toast('You missed your cue. Mr Crumpet ad-libs a death scene for twelve minutes. The Governor will not be speaking to you again.', 'bad')
      }
    }
  }

  private once(key: string, text: string, tone: 'good' | 'bad' | 'neutral'): void {
    if (this.said.has(key)) return
    this.said.add(key)
    this.game.toast(text, tone)
  }

  /** The audition: lie down, stiller, STILLER. */
  audition(): string {
    this.stage = 'cast'
    return 'Lie down. Stiller. STILLER. Marvellous. You have the stillness of a man with nothing to live for. The part is yours. Rehearsals the next two afternoons. Miss one and you are recast.'
  }

  toSave() {
    return { stage: this.stage, announced: this.announced, startDay: this.startDay, attended: [...this.attended] }
  }

  fromSave(s: Partial<ReturnType<Play['toSave']>> | undefined): void {
    if (!s) return
    this.stage = s.stage ?? 'notice'
    this.announced = s.announced ?? false
    this.startDay = s.startDay ?? 0
    this.attended = s.attended ?? this.attended
  }
}

const SECRETS = 'locked-up.secrets'

/**
 * Whether this sentence gets the secret play: about one in ten, and only
 * until it has turned up once in this browser. `force` (?secret=play) is
 * for trying it out, and does not use it up.
 */
export function rollSecret(random: () => number, force = false): boolean {
  if (force) return true
  try {
    const seen = JSON.parse(localStorage.getItem(SECRETS) ?? '{}') as Record<string, string>
    if (seen.play) return false
    if (random() >= 0.1) return false
    seen.play = new Date().toISOString()
    localStorage.setItem(SECRETS, JSON.stringify(seen))
    return true
  } catch {
    return false
  }
}
