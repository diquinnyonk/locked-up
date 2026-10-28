import type { Game } from '../Game'
import { Guard } from '../../npc/Guard'
import { Prisoner } from '../../npc/Prisoner'
import { GANGS, GANG_IDS } from '../../npc/Gangs'
import { ITEMS, vouchers } from '../Items'
import { PILLS_TRUST, pick2 } from './shared'

/**
 * Conversations with officers and prisoners: jobs, deals, gossip, the stash.
 */
export class Talk {
  constructor(private readonly game: Game) {}

  talkToGuard(g: Guard): void {
    g.stop()
    this.game.converse(g.body)
    const offer = this.game.missions.hasOffer(g)
    const lines =
      g.wary > 0.6
        ? ["I've got my eye on you. Both of them. This one's glass.", "Don't even think about it. I can see you thinking. Your lips move.", 'Move along before I find a reason.']
        : offer
          ? ["Ah. You. Just the person. Keep your voice down.", "Psst. Over here. No, act natural. NATURAL.", "You look like someone who can keep their mouth shut. Can you? Good."]
          : ["Ah, the Greggs Bandit. I've got my eye on you. And on my lunch.", 'What do you want? If it is the telly remote, the answer is no.', 'Keep your nose clean and we will get along famously.', "Not now, I'm on my break. I'm always on my break.", 'Lovely weather for it. Not that you would know.', "If you're after the toilet roll, there is none. There's never any."]
    const line = lines[Math.floor(this.game.rng() * lines.length)]
    const options = this.game.missions.options(g)
    // Mr Crumpet's sweet tooth.
    if (g.trait === 'biscuits' && !g.blindEye) {
      const inv = this.game.player.inventory
      options.unshift({
        label: '"Custard cream, guv? Whole packet."',
        enabled: inv.has('biscuits'),
        run: () => {
          inv.remove('biscuits')
          g.blindEye = true
          this.game.ui.talk(g.name, "Well. I never say no to a custard cream. And I never see anything with my mouth full. Funny, that.", [])
          this.game.toast(`${g.name} will look the other way, once.`, 'good')
        },
      })
    }
    if (this.game.lure?.guard === g && this.game.lure.stage === 'inside') {
      const inv = this.game.player.inventory
      options.unshift({ label: '"Fancy a sausage roll, guv?"', enabled: inv.has('sleepyRoll') || inv.has('sausageRoll'), run: () => this.game.actions.offerRoll(g) })
    }
    this.game.ui.talk(g.name, line, options)
  }

  talkTo(pr: Prisoner): void {
    pr.stop()
    this.game.converse(pr.body)
    if (pr.isCellmate) this.game.goal('cellmate')
    if (pr.sells.length) this.game.goal('fixer')
    const inv = this.game.player.inventory
    const options: { label: string; enabled: boolean; run: () => void }[] = []
    const refresh = () => this.talkTo(pr)
    options.push({
      label: 'Give a Greggs voucher',
      enabled: inv.has('voucher'),
      run: () => {
        inv.remove('voucher')
        pr.trust = Math.min(1, pr.trust + (pr.gang ? 0.12 : 0.22))
        pr.grudge = Math.max(0, pr.grudge - 0.2)
        if (pr.gang) this.game.memory.annoy(pr.gang, -0.05)
        pr.say('Cheers.', 1.5)
        refresh()
      },
    })
    for (const item of pr.sells) {
      // Pills only for people the fixer knows: a voucher or two as a gift first.
      const wary = item === 'sleepingPills' && pr.trust < PILLS_TRUST
      options.push({
        label: wary ? `Buy ${ITEMS[item].name} (they do not know you well enough yet)` : `Buy ${ITEMS[item].name} (2 Greggs vouchers)`,
        enabled: !wary && inv.count('voucher') >= 2 && !inv.full,
        run: () => {
          inv.remove('voucher')
          inv.remove('voucher')
          inv.add(item)
          pr.trust = Math.min(1, pr.trust + 0.05)
          this.game.toast(`Bought: ${ITEMS[item].name}.`, 'good')
          refresh()
        },
      })
    }
    if (pr.gang && pr.leader) {
      const gang = pr.gang
      const def = GANGS[gang]
      const price = this.game.memory.bribePrice(gang)
      const state = this.game.memory.gangs[gang]
      const backing = this.game.memory.backing(gang, this.game.clock.minutes)
      options.push({
        label: backing ? `${def.name} are already with you` : `Pay ${def.name} to back a riot (${vouchers(price)})`,
        enabled: !backing && inv.count('voucher') >= price,
        run: () => {
          if (state.hostility >= 0.7) {
            this.game.ui.talk(pr.name, `After what you have done to my lads? Not for all the sausage rolls in Grim-on-the-Moor.`, [])
            return
          }
          for (let i = 0; i < price; i++) inv.remove('voucher')
          this.game.memory.pay(gang, this.game.clock.minutes)
          this.game.toast(`${def.name} will back you for two days. ${GANGS[def.rival].name} will hear about it.`, 'good')
          this.game.ui.talk(pr.name, `Pleasure doing business. Give the word (G) on ${def.wing} wing and my lads go up. You have two days.`, [])
        },
      })
      // The feud with their rivals: fan it, or calm it.
      const rival = GANGS[def.rival]
      const feud = this.game.feuds.of(gang)
      const truce = feud.truceUntil > this.game.clock.minutes
      options.push({
        label: `"${rival.name} are planning something, you know."`,
        enabled: feud.brawlAt < 0,
        run: () => {
          this.game.ui.talk(pr.name, this.game.feuds.stir(gang), [])
          this.game.achieve('stir')
        },
      })
      options.push({
        label: truce ? `A truce with ${rival.name} holds` : `Broker a truce with ${rival.name} (3 Greggs vouchers)`,
        enabled: !truce && inv.count('voucher') >= 3,
        run: () => {
          for (let i = 0; i < 3; i++) inv.remove('voucher')
          this.game.feuds.truce(gang)
          this.game.achieve('peace')
          this.game.ui.talk(pr.name, `Three days. Not a minute more. And tell ${rival.name} it was their idea.`, [])
          this.game.toast(`A truce between ${def.name} and ${rival.name} for three days. Both think a bit better of you.`, 'good')
        },
      })
    } else {
      options.push({
        label: 'Will you back me when it kicks off?',
        enabled: true,
        run: () => {
          const yes = pr.supporter
          let line: string
          if (pr.gang) {
            const leader = this.game.gangLeader(pr.gang)
            line = yes ? `${leader?.name ?? 'The boss'} says we are on. Give the word.` : `Not my call. Talk to ${leader?.name ?? 'the boss'} on ${GANGS[pr.gang].wing} wing.`
          } else line = yes ? "I've got your back. Say the word (G) and I'm in." : pr.temperament === 'snitch' ? 'Sorry mate, not my thing.' : 'Do I look like your mate? Make it worth my while.'
          this.game.ui.talk(pr.name, line, [])
        },
      })
    }
    options.push({ label: 'Ask about the firms', enabled: true, run: () => this.game.ui.talk(pr.name, this.firmsGossip(), []) })
    options.unshift(...this.game.missions.options(pr))
    options.push({ label: 'Ask what they have heard', enabled: true, run: () => this.game.ui.talk(pr.name, this.gossip(pr), []) })
    if (pr.isCellmate) options.push({ label: 'Ask about the cell', enabled: true, run: () => this.game.ui.talk(pr.name, cellmateTip(this.game.memory.round), []) })
    if (pr.isCellmate) options.push(...this.game.cellmateStory.mateOptions(pr))
    const greeting =
      pr.grudge > 0.5
        ? pick2(this.game.rng, ['What do YOU want?', 'Oh, it is you. Marvellous. Smashing. Go away.'])
        : pr.gang
          ? pr.leader
            ? `You know who I am. ${GANGS[pr.gang].name} run ${GANGS[pr.gang].wing} wing.`
            : pick2(this.game.rng, ['You lost?', 'You look like you want something. Everyone wants something.'])
          : pr.temperament === 'fixer'
            ? pick2(this.game.rng, ['Looking for something? I can get things. Not Freddos. Never ask me for Freddos.', "Psst. Batteries, wire, a lighter, a screwdriver. Cash or Greggs vouchers. Mostly vouchers. Only vouchers."])
            : pr.isCellmate
              ? `Alright, ${this.game.player.name}.`
              : pick2(this.game.rng, ['Oi oi, it\'s the Greggs Bandit!', 'Is it true you nicked a festive bake? In OCTOBER? Respect.', 'My cousin works in that Greggs. She has nightmares.', 'Alright?', 'Y\'alright, our kid?', 'Wotcha.', 'Ey up.', 'Alright, chief? Kettle on?', 'Do I know you? I feel like I know you. Did you do my mum\'s guttering?'])
    const firm = pr.gang ? `, ${pr.leader ? 'boss of ' : ''}${GANGS[pr.gang].name}` : ''
    const trust = `${firm}${pr.supporter ? ' (backs you)' : pr.grudge > 0.5 ? ' (holds a grudge)' : ''}`
    this.game.ui.talk(`${pr.name}${trust}`, greeting, options)
  }

  gossip(pr: Prisoner): string {
    const lessons = this.game.memory.lessons
    if (lessons.length && this.game.rng() < 0.7) {
      const l = lessons[Math.floor(this.game.rng() * lessons.length)]
      return `Word is ${l.text.charAt(0).toLowerCase()}${l.text.slice(1)} All since your little stunt.`
    }
    const tips = [
      "The screws carry the keys on their belts. Get behind one while he's arguing about the footy.",
      "Toothpaste in the strike plate sets like concrete. Door looks locked. It isn't. Whitening AND escaping.",
      'Bang on your door at night like you are dying and they have to take you to healthcare. Make it a good groan. They score you.',
      'Proper kick-off on the landing and every screw in the place comes running. Doors get left open. Kettles get left on.',
      'Phones are taped. Never say when. Never say how. Talk about your nan. Everybody talks about their nan.',
      'Lads used to run a red rag up the yard flagpole for their people on the road. Like semaphore, but dodgier.',
      "Maintenance has every tool you could want. Shame it's behind a red door. Shame about a lot of things.",
      'The vents run over everything except the cells. Except some cells... I have said too much. I always say too much.',
      'Two sheets knotted make a rope. Bend a fork and tape it on and it is a hook. Blue Peter taught me that. Sort of.',
      'Soap takes a key impression lovely. Melt a fork into it with a lighter. Do not do it in the canteen. Ask me how I know.',
      'Chew soap before you fake it. Froth sells it. Tastes like a disappointing Tuesday.',
      'Officers get bored. Bored officers want favours. Do one and they might not see you. Once.',
      "Never trust a man who says 'with all due respect'. Or a man in maroon. Or the fish pie.",
    ]
    if (pr.gang) return this.game.memory.gangs[pr.gang].hostility > 0.4 ? 'Every time you mess about, the screws come down on all of us. Keep it up.' : 'Mind your own.'
    return tips[Math.floor(this.game.rng() * tips.length)]
  }

  firmsGossip(): string {
    const lines = GANG_IDS.map((g) => {
      const def = GANGS[g]
      const leader = this.game.gangLeader(g)
      return `${def.name} run ${def.wing} wing, ${leader?.name ?? 'nobody'} in charge. ${def.blurb}`
    })
    return `${lines.join(' ')} Nobody kicks off without the firm that runs the landing. Pay the boss, and mind who you pay: the Firm and the Crows hate each other, and so do the Lions and the Mob.`
  }

  openStash(): void {
    const inv = this.game.player.inventory
    const options = [
      ...inv.items.map((it) => ({
        label: `Hide ${ITEMS[it.id].name}`,
        enabled: this.game.stash.length < 4,
        run: () => {
          this.game.stash.push(it.id)
          inv.remove(it.id)
          this.openStash()
        },
      })),
      ...this.game.stash.map((id, i) => ({
        label: `Take ${ITEMS[id].name}`,
        enabled: !inv.full,
        run: () => {
          this.game.stash.splice(i, 1)
          inv.add(id)
          this.openStash()
        },
      })),
    ]
    this.game.ui.talk('Loose brick behind the table', 'Four slots. Officers search cells after an attempt; they do not always find it.', options)
  }
}

function cellmateTip(round: number): string {
  return round === 1
    ? "See that grille behind the table? Maintenance never put it on the list. Screws are rusted to nothing; a spoon'd turn them. Goes up into the ducts. Don't get caught in there, mind, or they'll weld it."
    : "They've been at all the locks since you started. Keep your head down for a day or two. They forget faster than you think. They don't, actually."
}
