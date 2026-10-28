import type { Game } from '../Game'
import { TILE, tileCentre, worldToTile } from '../../world/Grid'
import { findPath } from '../../world/Nav'
import { vouchers } from '../Items'
import { LINES } from '../Lines'
import { pick2, HYMN_SPOTS } from './shared'

/**
 * The named people who are not officers or prisoners: the Governor, the Reverend,
 * Keith on the X-ray, and the secret's visiting guest.
 */
export class Characters {
  constructor(private readonly game: Game) {}

  keithSays(text: string): void {
    this.game.keith.speech = text
    this.game.keith.speechTimer = 3.5
  }

  /**
   * The X-ray operator's day: a cuppa in the canteen at breakfast and lunch,
   * collecting baskets from the laundry before the van, and the rest of the
   * time sat at his machine in the bay doing the crossword.
   */
  updateKeith(delta: number): void {
    const k = this.game.keith
    const m = this.game.clock.minuteOfDay
    const period = this.game.clock.period
    let spot = { x: this.game.fixtures.xray.x, z: this.game.fixtures.xray.z, pose: 'sit' as const as 'sit' | 'stand' | 'search' }
    if (period === 'breakfast' || period === 'lunch') spot = { x: 45 * 2, z: 27 * 2, pose: 'sit' }
    else if (period === 'work' && m >= 10 * 60) spot = { x: this.game.fixtures.laundryBasket.x - 3.4, z: this.game.fixtures.laundryBasket.z - 1.8, pose: 'search' }
    k.body.visible = !this.game.clock.locked
    k.body.x = spot.x
    k.body.z = spot.z
    k.body.pose = spot.pose
    k.body.speed = 0
    k.body.yaw = period === 'work' ? Math.PI / 2 : 0
    if (k.speechTimer > 0) k.speechTimer -= delta
    if (k.speechTimer > 0) this.game.bubbles.push({ body: k.body, text: k.speech, who: null })
  }

  updateChaplain(delta: number): void {
    const r = this.game.chaplain
    const period = this.game.clock.period
    // In his chapel all day, behind the altar, facing the pews. Lunch with
    // the lads in the canteen, because he believes in it.
    const altar = this.game.fixtures.altar
    let spot = { x: altar.x + 1.2, z: altar.z, yaw: Math.PI / 2, pose: 'stand' as 'stand' | 'sit' | 'talk' }
    if (period === 'lunch') spot = { x: 46 * 2, z: 27 * 2, yaw: 0, pose: 'sit' }
    r.body.visible = !this.game.clock.locked
    if (this.game.talkingTo !== r.body) {
      r.body.x = spot.x
      r.body.z = spot.z
      r.body.yaw = spot.yaw
      r.body.pose = spot.pose
    }
    r.body.speed = 0
    r.speechTimer -= delta
    if (r.speechTimer <= 0 && r.body.visible && Math.hypot(this.game.player.body.x - r.body.x, this.game.player.body.z - r.body.z) < 7 && this.game.rng() < delta * 0.08) {
      r.speech = pick2(this.game.rng, [
        'Lovely to see a new face. Well. An old face. A face.',
        'Panto auditions Thursday. We need a back half of a horse.',
        'The Lord moves in mysterious ways. So does the tea trolley.',
        'Choir at four. Bring your lungs.',
      ])
      r.speechTimer = 5
    }
    if (r.speechTimer > 0 && r.body.visible) this.game.bubbles.push({ body: r.body, text: r.speech, who: null })
  }

  updateGovernor(delta: number): void {
    const gv = this.game.governor
    const m = this.game.clock.minuteOfDay
    const weekday = this.game.clock.weekday < 5
    const inspection = this.game.events.today === 'inspection' && m >= 10 * 60 && m < 16 * 60
    const was = gv.at
    const wanted = this.game.secret?.governorSpot?.() ?? null
    gv.at = wanted ? 'event' : inspection ? 'tour' : !weekday || this.game.clock.locked ? 'away' : m >= 750 && m < 810 ? 'car' : m >= 570 && m < 990 ? 'office' : 'away'
    const b = gv.body
    b.visible = gv.at !== 'away'
    if (this.game.talkingTo !== b) {
      if (gv.at === 'office') {
        b.x = this.game.fixtures.govDesk.x
        b.z = this.game.fixtures.govDesk.z - 0.25
        b.yaw = 0
        b.pose = 'sit'
      } else if (gv.at === 'car') {
        b.x = this.game.fixtures.jag.x - 1.5
        b.z = this.game.fixtures.jag.z + 0.4
        b.yaw = Math.PI / 2
        b.pose = 'search'
      } else if (wanted) {
        // Wherever the secret wants him: directing the play, meeting a duke.
        b.x = wanted.x
        b.z = wanted.z
        b.yaw = wanted.yaw
        b.pose = wanted.pose
        if (wanted.lines?.length && gv.speechTimer <= -6 && this.game.rng() < 0.01) {
          gv.speech = pick2(this.game.rng, wanted.lines)
          gv.speechTimer = 3.5
        }
      } else if (gv.at === 'tour') this.governorTour(delta, was !== 'tour')
    }
    if (gv.at !== 'tour') b.speed = 0
    // If he sees you where you should not be, he shouts for security.
    gv.shouted -= delta
    const p = this.game.player
    const close = Math.hypot(p.body.x - b.x, p.body.z - b.z)
    const inHisOffice = gv.at === 'office' && p.zone === 'governor'
    const seen = b.visible && !p.inVent && p.illegal > 0 && (inHisOffice || (close < 7 && (p.zone === this.game.grid.zone(Math.floor(b.x / TILE), Math.floor(b.z / TILE)) || close < 4)))
    if (seen && gv.shouted <= 0) {
      gv.shouted = 30
      gv.speech = pick2(this.game.rng, ['Can I HELP you? SECURITY!', 'Is that... the Greggs Bandit? In MY office? SECURITY!', 'Officers! OFFICERS! There is a prisoner touching my car!'])
      gv.speechTimer = 3
      this.game.alarm.active = true
      this.game.alarm.x = p.body.x
      this.game.alarm.z = p.body.z
      this.game.alarm.timer = 20
      const near = this.game.guards.filter((g) => g.ko <= 0).sort((a, c) => a.distanceTo(p.body.x, p.body.z) - c.distanceTo(p.body.x, p.body.z)).slice(0, 2)
      for (const g of near) {
        g.chasing = true
        g.suspicion = 1
        g.lastSeen = { x: p.body.x, z: p.body.z, t: 0 }
      }
      if (!p.attempt) p.attempt = this.game.methodHint ?? (p.zone === 'governor' ? 'safe' : 'gate')
    }
    gv.speechTimer -= delta
    if (gv.speechTimer > 0 && b.visible) this.game.bubbles.push({ body: b, text: gv.speech, who: null })
  }

  /** Inspection day: the Governor walks the inspector round the landings. */
  governorTour(delta: number, start: boolean): void {
    const gv = this.game.governor
    const b = gv.body
    const stops = ['blockA', 'corridorN', 'hub', 'corridorS', 'blockC', 'yard', 'blockD', 'hub', 'blockB']
    if (start) {
      const c = tileCentre(39, 24)
      b.x = c.x
      b.z = c.z
      gv.tour = []
    }
    if (!gv.tour.length) {
      const from = worldToTile(b.x, b.z)
      const to = this.game.grid.randomTileIn(stops[Math.floor(this.game.rng() * stops.length)], this.game.rng)
      gv.tour = findPath(this.game.grid, from, to, () => true) ?? []
      if (!gv.tour.length) return
    }
    const next = tileCentre(gv.tour[0].tx, gv.tour[0].ty)
    const dx = next.x - b.x
    const dz = next.z - b.z
    const d = Math.hypot(dx, dz)
    const step = 1.3 * delta
    if (d <= step) {
      b.x = next.x
      b.z = next.z
      gv.tour.shift()
    } else {
      b.x += (dx / d) * step
      b.z += (dz / d) * step
      b.yaw = Math.atan2(dx, dz)
    }
    b.pose = 'walk'
    b.speed = 1.3
    if (gv.speechTimer <= 0 && this.game.rng() < delta * 0.05) {
      gv.speech = pick2(this.game.rng, ['And this, Inspector, is our award-winning landing.', 'Mind the puddle. It is a feature.', 'We pride ourselves on the custard here.', 'Nobody has ever escaped. Not once. I check daily.'])
      gv.speechTimer = 4
    }
  }

  /** The secret's guest: dressed once, then wherever the secret says. */
  updateGuest(delta: number): void {
    const gu = this.game.guest
    const b = gu.body
    const info = this.game.secret?.guestLook?.()
    if (info && info.name !== this.game.guestDressed) {
      this.game.guestDressed = info.name
      gu.name = info.name
      Object.assign(b, info.look)
      this.game.crowd.paint(this.game.bodies.indexOf(b), b)
    }
    const spot = info ? (this.game.secret?.guestSpot?.() ?? null) : null
    b.visible = !!spot
    if (spot && this.game.talkingTo !== b) {
      b.x = spot.x
      b.z = spot.z
      b.yaw = spot.yaw
      b.pose = spot.pose
      b.speed = 0
    }
    gu.speechTimer -= delta
    if (gu.speechTimer > 0 && b.visible) this.game.bubbles.push({ body: b, text: gu.speech, who: null })
  }

  talkToGovernor(): void {
    const gv = this.game.governor
    this.game.converse(gv.body)
    this.game.achieve('governor')
    if (this.game.secret?.talkGovernor?.()) return
    const lines =
      this.game.memory.round > 1
        ? ["Back again. I admire persistence. I also admire concrete, and I have ordered a great deal of it.", 'You are making my prison better every time you fail. I do appreciate it.']
        : gv.at === 'tour'
          ? ['Inspector, this is one of our more... enterprising residents. Wave, ' + this.game.player.name + '.', 'Smile for the Inspector. Lovely.']
          : ["Pettigrew. Governor. You will be the one with the pastry.", 'Keep up the good work. Whatever it is you are doing. I will find out.', 'My door is always open. Except to you. And the safe is always locked. Especially to you.']
    this.game.ui.talk(`${gv.name}, Governor`, pick2(this.game.rng, lines), [])
  }

  /** Puts the three stolen hymn books out where they were last seen. */
  scatterHymnBooks(): void {
    for (const spot of HYMN_SPOTS) {
      const t = this.game.grid.randomTileIn(spot.zone, this.game.rng)
      const c = tileCentre(t.tx, t.ty)
      this.game.dynamic.spawnItem('hymnBook', c.x + (this.game.rng() - 0.5) * 0.8, c.z + (this.game.rng() - 0.5) * 0.8, spot.zone)
    }
  }

  talkToChaplain(): void {
    if (this.game.secret?.talkChaplain?.()) {
      this.game.converse(this.game.chaplain.body)
      return
    }
    const r = this.game.chaplain
    const p = this.game.player
    const inv = p.inventory
    const title = `${r.name}, chaplain`
    this.game.converse(r.body)
    if (r.stage === 'none') {
      this.game.ui.talk(
        title,
        LINES['chaplain.intro'].text,
        [
          {
            label: 'Take the job: find three hymn books',
            enabled: true,
            run: () => {
              r.stage = 'hunting'
              this.scatterHymnBooks()
              this.game.ui.talk(
                title,
                LINES['chaplain.accept'].text,
                [],
                'chaplain.accept',
              )
              this.game.toast('New job: The Missing Hymn Books. Find three hymn books for the Reverend.', 'good')
            },
          },
          {
            label: 'What do I get?',
            enabled: true,
            run: () =>
              this.game.ui.talk(
                title,
                LINES['chaplain.reward'].text,
                [],
                'chaplain.reward',
              ),
          },
        ],
        'chaplain.intro',
      )
      return
    }
    if (r.stage === 'hunting') {
      const have = inv.count('hymnBook')
      if (have >= 3) {
        this.game.ui.talk(title, LINES['chaplain.found'].text, [
          {
            label: 'Hand over the hymn books',
            enabled: true,
            run: () => {
              for (let i = 0; i < 3; i++) inv.remove('hymnBook')
              r.stage = 'done'
              r.alibi = true
              this.game.toast('The Reverend presses a little brass key into your hand: "For the panto box. Wardrobe needs a volunteer."', 'good')
              let paid = 0
              for (let i = 0; i < 3; i++) if (inv.add('voucher')) paid++
              for (let i = paid; i < 3; i++) this.game.dynamic.spawnItem('voucher', p.body.x + 0.6, p.body.z + 0.4 * i, p.zone)
              this.game.ui.talk(
                title,
                LINES['chaplain.thanks'].text,
                [],
                'chaplain.thanks',
              )
              this.game.toast(`Job done: The Missing Hymn Books. ${vouchers(3)}, and the Reverend owes you one alibi.`, 'good')
            },
          },
        ], 'chaplain.found')
      } else {
        this.game.ui.talk(title, LINES['chaplain.waiting'].text, [], 'chaplain.waiting')
        if (have) this.game.toast(`Hymn books found: ${have} of 3.`, 'neutral')
      }
      return
    }
    const after = r.alibi ? pick2(this.game.rng, ['chaplain.after.1', 'chaplain.after.2'] as const) : 'chaplain.spent'
    this.game.ui.talk(title, LINES[after].text, [], after)
  }

  talkToKeith(): void {
    this.game.converse(this.game.keith.body)
    const k = this.game.keith
    const inv = this.game.player.inventory
    const need = this.game.memory.xrayBribe
    const paid = k.bribedDay === this.game.clock.day
    const keith = k.name === 'Keith'
    const intro = keith ? LINES['keith.intro'].text : `${k.name}. I replaced Keith. Keith is now "between opportunities". I am not Keith. I want ${need} of everything.`
    const voice = paid ? 'keith.paid' : keith ? 'keith.intro' : undefined
    this.game.ui.talk(`${k.name}, X-ray operator`, paid ? LINES['keith.paid'].text : intro, [
      {
        label: `Slip ${k.name} ${need} blue drink${need > 1 ? 's' : ''} and ${need} sausage roll${need > 1 ? 's' : ''}`,
        enabled: !paid && inv.count('blueDrink') >= need && inv.count('sausageRoll') >= need,
        run: () => {
          for (let i = 0; i < need; i++) {
            inv.remove('blueDrink')
            inv.remove('sausageRoll')
          }
          k.bribedDay = this.game.clock.day
          const take = pick2(this.game.rng, ['keith.bribed.1', 'keith.bribed.2'] as const)
          this.game.ui.talk(`${k.name}, X-ray operator`, LINES[take].text, [], take)
          this.game.toast(`${k.name} is paid off for today. Get in a laundry basket before 11:00.`, 'good')
        },
      },
      {
        label: 'Ask about the Governor',
        enabled: true,
        run: () => {
          const plate = this.game.safeHeist.safeCode.slice(2)
          this.game.heist.knowB = true
          this.game.ui.talk(`${k.name}, X-ray operator`, `The Governor? Green Jag, private plate: R P ${plate}. Polishes it in the staff car park every lunchtime. Says it's the only thing in here that doesn't answer back.`, [])
          this.game.toast(`R P ${plate}. A man who puts his initials on his car puts his numbers everywhere. Second half of the combination: ${plate}?`, 'good')
        },
      },
      {
        label: 'Ask what he fancies',
        enabled: true,
        run: () =>
          need > 1
            ? this.game.ui.talk(`${k.name}, X-ray operator`, `A blue drink. The proper blue, from the vending machine in visits. And a sausage roll from the canteen. ${need} of each, mind. Inflation.`, [])
            : this.game.ui.talk(`${k.name}, X-ray operator`, LINES['keith.wants'].text, [], 'keith.wants'),
      },
    ], voice)
  }
}
