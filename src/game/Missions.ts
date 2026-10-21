import type { Guard } from '../npc/Guard'
import { GANGS, GANG_IDS, type GangId } from '../npc/Gangs'
import type { Prisoner } from '../npc/Prisoner'
import { TILE, tileCentre } from '../world/Grid'
import type { Game } from './Game'
import { ITEMS, type ItemId, vouchers } from './Items'

/**
 * Jobs. The firms' bosses always have one going, their foot soldiers have
 * small errands, and every morning a few officers who are bent, bored or
 * simply out of biscuits have a quiet word with you too.
 *
 * Every job is handed back to whoever set it. Gang jobs knock the price of
 * a riot down and soften the firm; officers pay in Greggs vouchers, in looking the
 * other way once, and occasionally in something you really should not have.
 */
export type Objective =
  | { kind: 'fetch'; item: ItemId; count?: number }
  | { kind: 'plant'; item: ItemId; zone: string; where: string }
  | { kind: 'ko'; target: 'rival' | 'debtor' }
  | { kind: 'visit'; spot: 'flagpole' | 'washers' | 'poolTable' | 'phones'; period?: string; action: string }
  | { kind: 'inspect' }
  | { kind: 'deliver'; item: ItemId }
  | { kind: 'ask'; question: string; answer: string }
  | { kind: 'behave'; hours: number }

export interface Reward {
  vouchers?: number
  item?: ItemId
  /** Officer looks the other way, once. */
  blindEye?: boolean
  /** Officer forgets about you a bit. */
  calm?: boolean
}

export interface Template {
  id: string
  title: string
  /** `{target}`, `{wing}`, `{cell}`, `{giver}`, `{time}` are filled in. */
  brief: string
  objective: Objective
  reward: Reward
  thanks: string
  /** Something to put in the world when the job is taken. */
  spawn?: { item: ItemId; zone: string }
  /** Something you are handed when the job is taken. */
  give?: ItemId
}

export const BOSS_JOBS: Record<GangId, Template[]> = {
  firm: [
    {
      id: 'soap-opera',
      title: 'Soap Opera',
      brief: "Bring Uncle a bar of soap, there's a good lad. Don't ask what it's for. It's for a mould. Of a key. Which I never mentioned.",
      objective: { kind: 'fetch', item: 'soap' },
      reward: { vouchers: 2 },
      thanks: 'Lovely. Smells of roses and conspiracy. You did well.',
    },
    {
      id: 'return-to-sender',
      title: 'Return to Sender',
      brief: "Pop this on the Crows' landing over on B wing. Put it down and walk away whistling. Don't open it. I mean it. I can see you thinking about it.",
      objective: { kind: 'plant', item: 'parcel', zone: 'blockB', where: "the Crows' landing (B wing)" },
      give: 'parcel',
      reward: { vouchers: 3 },
      thanks: "Ha! Kingy's face. Like a slapped haddock. Here's a drink for your trouble.",
    },
    {
      id: 'quiet-word',
      title: 'A Quiet Word',
      brief: "{target} of the Crows told the whole canteen my mum's trifle was shop-bought. Have a quiet word. Loudly. With your fists.",
      objective: { kind: 'ko', target: 'rival' },
      reward: { vouchers: 3, item: 'lighter' },
      thanks: "He'll think twice before slandering a homemade trifle. Have this, I've got loads.",
    },
  ],
  crows: [
    {
      id: 'pool-ball-robbery',
      title: 'The Great Pool Ball Robbery',
      brief: "Need a pool ball, bruv. Don't matter what colour. Alright it matters a bit. Not the black one, that's bad luck innit.",
      objective: { kind: 'fetch', item: 'poolBall' },
      reward: { vouchers: 2 },
      thanks: 'Peak. Absolute scenes. You are now an honorary Crow. Not really. But nearly.',
    },
    {
      id: 'crowtax',
      title: 'Crowtax',
      brief: "The Firm are rolling in Greggs vouchers. Bring us three and we'll call it a tax. A Crows tax. A Crowtax. I came up with that. Don't steal it.",
      objective: { kind: 'fetch', item: 'voucher', count: 3 },
      reward: { item: 'screwdriver' },
      thanks: "Tax collected. HMRC could never. Here, have a screwdriver, it's surplus to requirements.",
    },
    {
      id: 'bovver',
      title: 'Bovver on A Wing',
      brief: "{target} from the Firm keeps calling us 'the Pigeons'. We are not pigeons. Go and explain the difference. With feeling.",
      objective: { kind: 'ko', target: 'rival' },
      reward: { vouchers: 3 },
      thanks: "Did he say 'crow'? Tell me he said 'crow'. Legend.",
    },
  ],
  lions: [
    {
      id: 'away-day',
      title: 'Away Day',
      brief: 'Get to the flagpole during yard and give us a proper chant. Loud. Tuneful is optional. Heartfelt is not.',
      objective: { kind: 'visit', spot: 'flagpole', period: 'yard', action: "Belt out 'Football's Coming Home'" },
      reward: { vouchers: 2 },
      thanks: 'I heard that from the showers. I welled up. Here, you earned it.',
    },
    {
      id: 'half-time',
      title: 'Half-Time Oranges',
      brief: "Five-a-side needs a goalpost. A canteen tray is basically a goalpost if you squint. Or if you're Gaz, who can't see anyway.",
      objective: { kind: 'fetch', item: 'tray' },
      reward: { vouchers: 2 },
      thanks: "Back of the net. Literally, now we've got a net. It's a tray. Shut up.",
    },
    {
      id: 'derby-day',
      title: 'Derby Day',
      brief: "{target} of the Northern Mob says the Lions bottled it in the last ruck. We did not bottle it. We tactically retreated. Go and correct him.",
      objective: { kind: 'ko', target: 'rival' },
      reward: { vouchers: 3, item: 'sock' },
      thanks: "Tactical retreat avenged. Have a sock. It's my lucky one. It's been through a lot.",
    },
  ],
  northern: [
    {
      id: 'sock-audit',
      title: 'The Sock Audit',
      brief: "The books don't balance. We're two socks short. Find them. I'll know if they're not clean. I won't check. But I'll know.",
      objective: { kind: 'fetch', item: 'sock', count: 2 },
      reward: { vouchers: 2 },
      thanks: 'Ledger balanced. You may have a biscuit. Metaphorically. Here is a Greggs voucher.',
    },
    {
      id: 'debt-collection',
      title: 'Debt Collection',
      brief: '{target} owes us three Twixes and an apology. We will take the apology out of his face. You will take it, I mean. I do accounts.',
      objective: { kind: 'ko', target: 'debtor' },
      reward: { vouchers: 3 },
      thanks: 'Debt settled. Interest accrued. You are a credit to the profession.',
    },
    {
      id: 'tea-proper',
      title: 'Tea, Proper',
      brief: 'Canteen tea is a crime against Yorkshire. Healthcare keeps proper teabags in the cupboard. Liberate them. Do it for the North.',
      objective: { kind: 'fetch', item: 'teabags' },
      reward: { vouchers: 3, item: 'battery' },
      thanks: "Now that is a brew. I could cry. I won't. But I could.",
    },
  ],
}

export const ERRANDS: Template[] = [
  {
    id: 'brush',
    title: 'A Brush with Danger',
    brief: "Get us a toothbrush. Mine's gone manky. Don't ask what I used it for. Grout. I used it for grout.",
    objective: { kind: 'fetch', item: 'toothbrush' },
    reward: { vouchers: 1 },
    thanks: "Minty fresh. You're alright, you.",
  },
  {
    id: 'love-letter',
    title: 'Love Is in the Air(vent)',
    brief: "Give this to {target} on {wing} wing. If anyone asks, it's from your nan. If he asks, it's from me. If he laughs, it's from you.",
    objective: { kind: 'deliver', item: 'letter' },
    give: 'letter',
    reward: { vouchers: 2 },
    thanks: '',
  },
  {
    id: 'biscuit-run',
    title: 'Biscuit Run',
    brief: "Custard creams. A whole packet. I've had a day. I've had a week. I've had a fifteen-year stretch, frankly.",
    objective: { kind: 'fetch', item: 'biscuits' },
    reward: { vouchers: 2 },
    thanks: "Oh, that's the stuff. You're a gent. A crook, but a gent.",
  },
]

export const OFFICER_JOBS: Template[] = [
  {
    id: 'racing-certainty',
    title: 'A Racing Certainty',
    brief: "The governor confiscated my Racing Post and then lost it in the games room. Three horses circled. One's called Lord Biscuitwick. Find it, and I might not see you once.",
    objective: { kind: 'fetch', item: 'racingPost' },
    spawn: { item: 'racingPost', zone: 'games' },
    reward: { blindEye: true, vouchers: 1 },
    thanks: "Lord Biscuitwick, each way. Lovely. Right. Next time I see you somewhere funny, I didn't.",
  },
  {
    id: 'custard-crisis',
    title: 'The Custard Crisis',
    brief: "Officers' biscuit tin is empty and it's only Tuesday. Custard creams. You didn't get them from me, I didn't ask, and this conversation is a figment.",
    objective: { kind: 'fetch', item: 'biscuits' },
    reward: { blindEye: true, calm: true },
    thanks: 'What biscuits? I see no biscuits. Mmf. Carry on, you.',
  },
  {
    id: 'specs-appeal',
    title: 'Specs Appeal',
    brief: "I've lost my reading glasses somewhere in the yard. Leopard print. On a little beaded chain. If you laugh, I'm nicking you.",
    objective: { kind: 'fetch', item: 'glasses' },
    spawn: { item: 'glasses', zone: 'yard' },
    reward: { item: 'lockpick', calm: true },
    thanks: "Oh, I can see! Here, I found this bent bit of wire in my bag. No idea how it got there. You have it.",
  },
  {
    id: 'hooch',
    title: "Who's Brewing Hooch?",
    brief: "Somebody's brewing hooch on {wing} wing. Smells like a fruit bowl died in a sock. Have a sniff around {cell} and tell me what you find. Discreetly. Like a bloodhound in slippers.",
    objective: { kind: 'inspect' },
    reward: { vouchers: 2, calm: true },
    thanks: "A bin bag of fermented oranges. Classic. Good work. Don't tell anyone it was you. They'll know anyway.",
  },
  {
    id: 'quiet-shift',
    title: 'The Quiet Shift',
    brief: "I'm on a double and my feet are killing me. Keep your nose clean till {time}. No warnings, no nonsense, no 'accidents' with the mop.",
    objective: { kind: 'behave', hours: 3 },
    reward: { vouchers: 2, calm: true },
    thanks: 'Not a peep. A miracle. Here, for your services to my bunions.',
  },
  {
    id: 'fantasy-football',
    title: 'Fantasy Football',
    brief: "{target} has topped the officers' fantasy league three weeks running and he's not even IN it. Find out who he's picked as captain. For security reasons.",
    objective: { kind: 'ask', question: "Ask who's captain of his fantasy football team", answer: "Captain? Me nan. She's never been injured once. Why, who's asking?" },
    reward: { blindEye: true, vouchers: 1 },
    thanks: 'His NAN? Genius. Diabolical. Right, I owe you one. One.',
  },
]

export interface Mission {
  tpl: Template
  giver: Prisoner | Guard
  giverName: string
  gang: GangId | null
  target: Prisoner | null
  targetCell: string | null
  /** The work is done; go back and tell them. */
  done: boolean
  expires: number
  /** Minute a 'behave' job runs until. */
  until: number
  brief: string
}

const MAX_ACTIVE = 3

export class Missions {
  readonly active: Mission[] = []
  /** Officers with a job to offer today, and what it is. */
  private readonly officerOffers = new Map<Guard, Template>()
  private readonly memberOffers = new Map<Prisoner, Template>()
  private readonly bossProgress: Record<GangId, number> = { firm: 0, crows: 0, lions: 0, northern: 0 }
  private readonly finished = new Set<string>()
  completedCount = 0

  constructor(private readonly game: Game) {}

  /** A fresh day: new officers want things, new errands appear. */
  newDay(): void {
    const g = this.game
    this.officerOffers.clear()
    const pool = g.guards.filter((gu) => !this.active.some((m) => m.giver === gu))
    for (let i = 0; i < 3 && pool.length; i++) {
      const gu = pool.splice(Math.floor(g.rng() * pool.length), 1)[0]
      const options = OFFICER_JOBS.filter((t) => !this.active.some((m) => m.tpl.id === t.id))
      this.officerOffers.set(gu, options[Math.floor(g.rng() * options.length)])
    }
    this.memberOffers.clear()
    const members = g.prisoners.filter((p) => p.gang && !p.leader)
    for (let i = 0; i < 6 && members.length; i++) {
      const p = members.splice(Math.floor(g.rng() * members.length), 1)[0]
      this.memberOffers.set(p, ERRANDS[Math.floor(g.rng() * ERRANDS.length)])
    }
  }

  /** Everyone with a job going today, for the notebook. */
  whoHasWork(): { name: string; where: string }[] {
    const out: { name: string; where: string }[] = []
    for (const gang of GANG_IDS) {
      if (this.bossProgress[gang] >= BOSS_JOBS[gang].length) continue
      const boss = this.game.gangLeader(gang)
      if (boss && !this.active.some((m) => m.giver === boss)) out.push({ name: boss.name, where: `boss of ${GANGS[gang].name}, ${GANGS[gang].wing} wing` })
    }
    for (const [g] of this.officerOffers) out.push({ name: g.name, where: `officer, usually around ${g.block} wing. Wants a quiet word.` })
    for (const [p] of this.memberOffers) out.push({ name: p.name, where: `${p.gang ? GANGS[p.gang].name : 'prisoner'}, ${p.block} wing` })
    return out
  }

  hasOffer(who: Prisoner | Guard): boolean {
    if (this.active.some((m) => m.giver === who)) return this.active.some((m) => m.giver === who && m.done)
    if ('leader' in who && who.leader && who.gang) return this.bossProgress[who.gang] < BOSS_JOBS[who.gang].length
    return this.officerOffers.has(who as Guard) || this.memberOffers.has(who as Prisoner)
  }

  /** Dialogue options for whoever you are talking to. */
  options(who: Prisoner | Guard): { label: string; enabled: boolean; run: () => void }[] {
    const g = this.game
    const out: { label: string; enabled: boolean; run: () => void }[] = []

    // Things other people's jobs need from this person.
    for (const m of this.active) {
      if (m.done || m.target !== who) continue
      const o = m.tpl.objective
      if (o.kind === 'deliver') {
        out.push({
          label: `Hand over the ${ITEMS[o.item].name.toLowerCase()} (${m.tpl.title})`,
          enabled: g.player.inventory.has(o.item),
          run: () => {
            g.player.inventory.remove(o.item)
            this.pay(m)
            g.ui.talk((who as Prisoner).name, pick(g.rng, ["From WHO? ...Tell him yes. No. Tell him maybe. Tell him I'm thinking about it.", "Is this lipstick? Is this... is this Rimmel? Oh, he shouldn't have.", "Right. I'm going to read this in private and you are going to forget my face."]), [])
          },
        })
      }
      if (o.kind === 'ask') {
        out.push({
          label: o.question,
          enabled: true,
          run: () => {
            m.done = true
            g.toast(`${m.tpl.title}: done. Go back to ${m.giverName}.`, 'good')
            g.ui.talk((who as Prisoner).name, o.answer, [])
          },
        })
      }
    }

    // Jobs this person set.
    const mine = this.active.find((m) => m.giver === who)
    if (mine) {
      const o = mine.tpl.objective
      const handIn = o.kind === 'fetch' ? g.player.inventory.count(o.item) >= (o.count ?? 1) : mine.done
      out.push({
        label: handIn ? `"It's done." (${mine.tpl.title})` : `"About that job..." (${mine.tpl.title})`,
        enabled: true,
        run: () => {
          if (!handIn) {
            g.ui.talk(mine.giverName, pick(g.rng, ['Well? Chop chop.', "I'm not getting any younger. Neither are you, in here.", 'Tick tock. I said tick tock.']) + ` ${this.describe(mine)}`, [])
            return
          }
          if (o.kind === 'fetch') for (let i = 0; i < (o.count ?? 1); i++) g.player.inventory.remove(o.item)
          this.pay(mine)
          g.ui.talk(mine.giverName, mine.tpl.thanks, [], `mission.${mine.tpl.id}.thanks`)
        },
      })
      return out
    }

    const offer = this.offerFor(who)
    if (offer && this.active.length < MAX_ACTIVE) {
      out.push({ label: '"Got any work?"', enabled: true, run: () => this.pitch(who, offer) })
    } else if (offer) {
      out.push({ label: '"Got any work?" (you have three jobs on)', enabled: false, run: () => {} })
    }
    return out
  }

  private offerFor(who: Prisoner | Guard): Template | null {
    if ('leader' in who && who.leader && who.gang) {
      const list = BOSS_JOBS[who.gang]
      return list[this.bossProgress[who.gang]] ?? null
    }
    return this.officerOffers.get(who as Guard) ?? this.memberOffers.get(who as Prisoner) ?? null
  }

  private pitch(who: Prisoner | Guard, tpl: Template): void {
    const g = this.game
    const m = this.prepare(who, tpl)
    if (!m) {
      g.ui.talk(nameOf(who), 'Actually, forget it. Wrong time, wrong face.', [])
      return
    }
    const reward = rewardText(tpl.reward)
    g.ui.talk(`${nameOf(who)}: ${tpl.title}`, m.brief, [
      {
        label: `Take the job${reward ? ` (${reward})` : ''}`,
        enabled: true,
        run: () => {
          this.accept(m)
          g.ui.closePanels()
        },
      },
      { label: '"Not today, ta."', enabled: true, run: () => g.ui.talk(nameOf(who), pick(g.rng, ['Your loss. Literally.', 'Suit yourself, sunshine.', 'Fine. I will remember this. I remember everything.']), []) },
    ], `mission.${tpl.id}.brief`)
  }

  /** Works out who and where a job is about, before you say yes. */
  private prepare(who: Prisoner | Guard, tpl: Template): Mission | null {
    const g = this.game
    const gang = 'gang' in who ? who.gang : null
    let target: Prisoner | null = null
    let targetCell: string | null = null
    const o = tpl.objective
    if (o.kind === 'ko') {
      const rival = gang ? GANGS[gang].rival : null
      const pool = g.prisoners.filter((p) => (o.target === 'rival' ? p.gang === rival && !p.leader : !p.gang && !p.isCellmate) && p.ko <= 0)
      target = pool[Math.floor(g.rng() * pool.length)] ?? null
      if (!target) return null
    }
    if (o.kind === 'deliver') {
      const pool = g.prisoners.filter((p) => p !== who && p.block !== (who as Prisoner).block && !p.isCellmate)
      target = pool[Math.floor(g.rng() * pool.length)] ?? null
    }
    if (o.kind === 'ask') {
      const boss = g.gangLeader(GANG_IDS[Math.floor(g.rng() * GANG_IDS.length)])
      target = boss ?? null
    }
    if (o.kind === 'inspect') {
      const cells = [...g.grid.cells.values()].filter((c) => c.zone !== g.player.cell)
      targetCell = cells[Math.floor(g.rng() * cells.length)].zone
    }
    const until = o.kind === 'behave' ? g.clock.minutes + o.hours * 60 : 0
    const time = (() => {
      const m = Math.floor(((until % 1440) + 1440) % 1440)
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    })()
    const brief = tpl.brief
      .replace(/\{target\}/g, target?.name ?? 'someone')
      .replace(/\{wing\}/g, targetCell ? targetCell.charAt(4) : target?.block ?? 'A')
      .replace(/\{cell\}/g, targetCell ? g.grid.roomName(targetCell) : '')
      .replace(/\{giver\}/g, nameOf(who))
      .replace(/\{time\}/g, time)
    return { tpl, giver: who, giverName: nameOf(who), gang, target, targetCell, done: false, expires: g.clock.minutes + 1440, until, brief }
  }

  private accept(m: Mission): void {
    const g = this.game
    this.active.push(m)
    if (m.tpl.give && !g.player.inventory.add(m.tpl.give)) {
      g.toast('Your pockets are full: they drop it at your feet.', 'bad')
      g.dynamic.spawnItem(m.tpl.give, g.player.body.x, g.player.body.z + 0.6, g.player.zone)
    }
    if (m.tpl.spawn) {
      const t = g.grid.randomTileIn(m.tpl.spawn.zone, g.rng)
      const c = tileCentre(t.tx, t.ty)
      g.dynamic.spawnItem(m.tpl.spawn.item, c.x, c.z, m.tpl.spawn.zone)
    }
    if ('leader' in m.giver && m.giver.leader && m.gang) this.bossProgress[m.gang]++
    this.officerOffers.delete(m.giver as Guard)
    this.memberOffers.delete(m.giver as Prisoner)
    g.toast(`New job: ${m.tpl.title}. ${this.describe(m)}`, 'neutral')
  }

  /** One line of what is left to do, for the HUD and reminders. */
  /**
   * Where each job points, for the map on normal: the person to see, the
   * things to pick up, the room to go to. Finished jobs point home to whoever
   * gave them.
   */
  mapTargets(): { x: number; z: number; label: string }[] {
    const g = this.game
    const out: { x: number; z: number; label: string }[] = []
    const room = (zone: string, label: string) => {
      const r = g.grid.rooms.get(zone)?.rects[0]
      if (r) out.push({ x: ((r.x0 + r.x1 + 1) / 2) * TILE, z: ((r.y0 + r.y1 + 1) / 2) * TILE, label })
    }
    const who = (a: { body: { x: number; z: number } } | null, label: string) => {
      if (a) out.push({ x: a.body.x, z: a.body.z, label })
    }
    for (const m of this.active) {
      const o = m.tpl.objective
      if (m.done) {
        who(m.giver, m.giverName)
        continue
      }
      switch (o.kind) {
        case 'fetch':
          if (g.player.inventory.count(o.item) >= (o.count ?? 1)) who(m.giver, m.giverName)
          else for (const it of g.dynamic.items) if (it.id === o.item) out.push({ x: it.x, z: it.z, label: ITEMS[o.item].name })
          break
        case 'plant':
          room(o.zone, o.where)
          break
        case 'ko':
        case 'ask':
          who(m.target, m.target?.name ?? '')
          break
        case 'deliver':
          who(m.target, m.target?.name ?? '')
          break
        case 'visit': {
          const f = g.fixtures
          const spot = o.spot === 'flagpole' ? f.flagpole : o.spot === 'poolTable' ? f.poolTable : o.spot === 'phones' ? f.phones[0] : f.washers[0]
          out.push({ x: spot.x, z: spot.z, label: o.action })
          break
        }
        case 'inspect':
          if (m.targetCell) room(m.targetCell, g.grid.roomName(m.targetCell))
          break
        case 'behave':
          break
      }
    }
    return out
  }

  describe(m: Mission): string {
    const o = m.tpl.objective
    if (m.done) return `Go back to ${m.giverName}.`
    switch (o.kind) {
      case 'fetch':
        return `Bring ${m.giverName}: ${ITEMS[o.item].name.toLowerCase()} (${this.game.player.inventory.count(o.item)}/${o.count ?? 1}).`
      case 'plant':
        return `Drop the ${ITEMS[o.item].name.toLowerCase()} on ${o.where}.`
      case 'ko':
        return `Knock out ${m.target?.name ?? 'the target'} (${m.target?.block ?? '?'} wing).`
      case 'visit':
        return `${o.action} at the ${o.spot === 'poolTable' ? 'pool table' : o.spot}${o.period ? ` during ${o.period}` : ''}.`
      case 'inspect':
        return `Sniff around ${this.game.grid.roomName(m.targetCell ?? '')}.`
      case 'deliver':
        return `Give the ${ITEMS[o.item].name.toLowerCase()} to ${m.target?.name ?? 'them'} (${m.target?.block ?? '?'} wing).`
      case 'ask':
        return `Ask ${m.target?.name ?? 'them'}: ${o.question.toLowerCase()}.`
      case 'behave': {
        const left = Math.max(0, Math.ceil((m.until - this.game.clock.minutes) / 60))
        return `No warnings for ${left} more hour${left === 1 ? '' : 's'}.`
      }
    }
  }

  /** Prompts for jobs that are done at a place rather than with a person. */
  prompts(add: (key: string, label: string, run: () => void) => void): void {
    const g = this.game
    const b = g.player.body
    for (const m of this.active) {
      if (m.done) continue
      const o = m.tpl.objective
      if (o.kind === 'visit') {
        const f = g.fixtures
        const spot = o.spot === 'flagpole' ? f.flagpole : o.spot === 'poolTable' ? f.poolTable : o.spot === 'phones' ? f.phones[0] : f.washers[0]
        if (Math.hypot(b.x - spot.x, b.z - spot.z) < 3) {
          const ok = !o.period || g.clock.period === o.period
          add('E', ok ? o.action : `${o.action} (wait for ${o.period})`, () => {
            if (!ok) return
            m.done = true
            b.pose = 'wave'
            b.poseTime = 0
            g.emit({ x: b.x, z: b.z, radius: 10, kind: 'shout' })
            for (const p of g.prisoners) if (p.distanceTo(b.x, b.z) < 12 && g.rng() < 0.4) p.say(pick(g.rng, ["It's coming home!", 'Oi oi!', 'Get in!', 'Shut UP!']), 1.8)
            g.toast(`${m.tpl.title}: done. Go back to ${m.giverName}.`, 'good')
          })
        }
      }
      if (o.kind === 'inspect' && m.targetCell && g.player.zone === m.targetCell) {
        add('E', 'Sniff around', () => {
          m.done = true
          g.player.dodgy = 1
          const owners = g.prisoners.filter((p) => p.cell.zone === m.targetCell)
          for (const p of owners) {
            p.grudge = Math.min(1, p.grudge + 0.35)
            if (p.gang) g.memory.annoy(p.gang, 0.1)
          }
          owners[0]?.say(pick(g.rng, ['Oi! Are you sniffing my cell?!', 'Grass.', 'Out. Out! Weirdo.']), 2.5)
          g.toast(`A bin bag of fermented oranges under the bunk. ${m.tpl.title}: go back to ${m.giverName}. The lads in that cell will not forget your face.`, 'good')
        })
      }
    }
  }

  /** Per frame: plants, deadlines, good behaviour. */
  update(): void {
    const g = this.game
    for (const m of [...this.active]) {
      const o = m.tpl.objective
      if (!m.done && o.kind === 'plant' && g.dynamic.items.some((it) => it.id === o.item && it.zone === o.zone)) {
        const it = g.dynamic.items.find((i) => i.id === o.item && i.zone === o.zone)!
        g.dynamic.removeItem(it)
        m.done = true
        g.toast(`${m.tpl.title}: parcel delivered. Somebody on that landing is going to have a very confusing afternoon. Back to ${m.giverName}.`, 'good')
      }
      if (!m.done && o.kind === 'ko' && m.target && m.target.ko > 0 && m.target.lastHitByPlayer) {
        m.done = true
        g.toast(`${m.tpl.title}: ${m.target.name} has had his quiet word. Back to ${m.giverName}.`, 'good')
      }
      if (!m.done && o.kind === 'behave' && g.clock.minutes >= m.until) {
        m.done = true
        g.toast(`${m.tpl.title}: you behaved. Nobody can believe it. Go and see ${m.giverName}.`, 'good')
      }
      if (g.clock.minutes > m.expires && !m.done) this.fail(m, 'You ran out of time.')
    }
  }

  /** You got a warning or got nicked: the quiet shift is ruined. */
  onTrouble(): void {
    for (const m of [...this.active]) if (m.tpl.objective.kind === 'behave' && !m.done) this.fail(m, `${m.giverName} sighs so hard their hat moves.`)
  }

  private fail(m: Mission, why: string): void {
    const g = this.game
    this.active.splice(this.active.indexOf(m), 1)
    if (m.gang) g.memory.annoy(m.gang, 0.1)
    if (!('gang' in m.giver)) (m.giver as Guard).wary = Math.min(1, (m.giver as Guard).wary + 0.2)
    if ('leader' in m.giver && m.giver.leader && m.gang) this.bossProgress[m.gang] = Math.max(0, this.bossProgress[m.gang] - 1)
    g.toast(`Job failed: ${m.tpl.title}. ${why}`, 'bad')
  }

  private pay(m: Mission): void {
    const g = this.game
    this.active.splice(this.active.indexOf(m), 1)
    this.finished.add(m.tpl.id)
    this.completedCount++
    const r = m.tpl.reward
    for (let i = 0; i < (r.vouchers ?? 0); i++) if (!g.player.inventory.add('voucher')) g.dynamic.spawnItem('voucher', g.player.body.x, g.player.body.z + 0.5, g.player.zone)
    if (r.item && !g.player.inventory.add(r.item)) g.dynamic.spawnItem(r.item, g.player.body.x, g.player.body.z + 0.5, g.player.zone)
    const giver = m.giver
    if ('gang' in giver) {
      giver.trust = Math.min(1, giver.trust + 0.25)
      if (m.gang) {
        g.memory.annoy(m.gang, -0.2)
        g.memory.gangs[m.gang].favours++
        for (const p of g.prisoners) if (p.gang === m.gang) p.grudge = Math.max(0, p.grudge - 0.15)
      }
      const target = m.target
      if (target?.gang) g.memory.annoy(target.gang, 0.12)
    } else {
      const gu = giver as Guard
      if (r.blindEye) gu.blindEye = true
      if (r.calm) gu.wary = Math.max(0, gu.wary - 0.4)
    }
    const parts = [rewardText(r), m.gang ? `${GANGS[m.gang].name} like you more; their riot price drops` : ''].filter(Boolean)
    g.toast(`Job done: ${m.tpl.title}. ${parts.join('. ')}.`, 'good')
    g.sounds.push({ sound: 'good', volume: 0.8 })
  }
}

function rewardText(r: Reward): string {
  const bits: string[] = []
  if (r.vouchers) bits.push(vouchers(r.vouchers))
  if (r.item) bits.push(ITEMS[r.item].name.toLowerCase())
  if (r.blindEye) bits.push('a blind eye, once')
  if (r.calm) bits.push('they go easier on you')
  return bits.join(', ')
}

function nameOf(who: Prisoner | Guard): string {
  return who.name
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]
}

export const JOB_COUNT = {
  bosses: GANG_IDS.reduce((s, g) => s + BOSS_JOBS[g].length, 0),
  errands: ERRANDS.length,
  officers: OFFICER_JOBS.length,
}

