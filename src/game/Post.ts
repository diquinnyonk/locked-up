import type { ItemId } from './Items'

/**
 * Letters from home, and the notes that turn up on your bunk.
 *
 * The post comes round every morning at unlock: one letter most days, two
 * on a good one, each opened and stamped by the censor before you see it.
 * Some have something tucked inside that the censor missed.
 *
 * The notes are different. One a day, left on your bunk while you are out,
 * unsigned, each a real clue to a way out. Whoever writes them knows things
 * nobody on a landing could know. At the end you find out who: Governor
 * Pettigrew, who runs Grim-on-the-Moor as a test of itself, and who has been
 * watching every attempt you make with a stopwatch and a clipboard.
 */
export interface Letter {
  id: string
  from: string
  /** How they sign off. */
  sign: string
  /** `{name}` is replaced with yours. */
  body: string
  /** Something the censor missed. */
  gift?: { item: ItemId; count: number; line: string }
  day: number
  read: boolean
}

type LetterTemplate = Omit<Letter, 'day' | 'read'>

const LETTERS: LetterTemplate[] = [
  {
    id: 'mum-1',
    from: 'Mum',
    sign: 'Love you, you absolute idiot. Mum x',
    body: "I am not angry, I am disappointed. Mrs Patterson from number 12 asked me in the Co-op if you were \"the Greggs one\" and I had to say yes because I don't lie, unlike some people. Eat your vegetables. They do give you vegetables? Peas count.",
  },
  {
    id: 'nan-1',
    from: 'Nan',
    sign: 'All my love, Nan. PS. Stay away from girls with tattoos.',
    body: "I've put a postal order in, don't tell your mother. Your grandad did six months in 1971 for nicking a traffic cone and he came out a better man. Well, a man. I've knitted you a scarf, but they sent it back saying it was \"a potential rope\". It is a scarf, {name}.",
    gift: { item: 'voucher', count: 2, line: "Tucked in the fold: Nan's postal order, which the canteen will only take as 2 Greggs vouchers." },
  },
  {
    id: 'dazza-1',
    from: 'Dazza (your brother)',
    sign: 'Laters, Daz',
    body: "Alright bruv. You're famous. Somebody's done a mural of you on the side of the chippy, holding a steak bake like the Olympic torch. Greggs have put a security guard on the door. ONE pasty, {name}. Ring me sometime. Talk about Nan. You know why.",
  },
  {
    id: 'kev-1',
    from: 'Kev (best mate)',
    sign: 'Kev. PS. I am NOT having your PlayStation, your mum gave it me.',
    body: "Mate. MATE. The festive bake? In October? You've broken the space-time continuum. Pub quiz isn't the same without you. We came fourth. There were four teams. Anyway, chin up, keep your head down, and don't drop the soap, that's what my uncle says.",
  },
  {
    id: 'shaz-1',
    from: 'Shaz (your ex)',
    sign: 'Not yours, Shaz',
    body: "I'm only writing because my therapist says closure. I've kept the George Foreman grill. I've kept the dog. I've kept the good towels. You've kept a criminal record. I think that's fair. Please don't write back. Unless you're out. Are you getting out?",
  },
  {
    id: 'greggs-1',
    from: 'Customer Relations, a well-known high street bakery',
    sign: 'Yours faithfully, The Customer Relations Team (the pasty people)',
    body: "Dear Customer. We are writing regarding the incident at our Market Street branch. Our records show four sausage rolls, one steak bake and one festive bake remain unpaid. We have taken the liberty of adding them to your loyalty app. You now have a free coffee. We hope to see you again soon. Through the front door.",
  },
  {
    id: 'mum-2',
    from: 'Mum',
    sign: 'Mum x. PS. Your Auntie Pauline says hello and also "I told you so".',
    body: "The local paper did a whole page on you again. They used your school photo, the one with the bowl haircut. I wrote in to complain and they printed my letter under the headline MUM OF PASTRY FIEND SPEAKS OUT. I've bought six copies.",
    gift: { item: 'biscuits', count: 1, line: "She has sent custard creams. The censor ate three, but the rest are yours." },
  },
  {
    id: 'pauline-1',
    from: 'Auntie Pauline',
    sign: 'Your Auntie Pauline (the one with the caravan)',
    body: "I told you so. I told your mother when you were six and you ate the Christmas Yule log off the plate before it was cut. I said that boy has a pastry problem. Nobody listened. Anyway the caravan is free in August if you're out. Bring your own sheets.",
  },
  {
    id: 'dazza-2',
    from: 'Dazza (your brother)',
    sign: "Daz. Don't say when.",
    body: "Been driving round the back roads by that wall of yours at night. For my nerves. Lot of owls. Nan says if a red rag ever went up a flagpole somewhere, she'd want to know about it. Weird thing for Nan to say. Anyway.",
  },
  {
    id: 'kev-2',
    from: 'Kev (best mate)',
    sign: "Kev. PS. I've enclosed a crossword. It's blank. I couldn't do it either.",
    body: "Here, my cousin's mate did time at Grim-on-the-Moor. Says the laundry van is the dream but the X-ray bloke is a nightmare. Says he's a sucker for a blue drink. Not sure what that means. Thought you'd want to know. Or not. Burn this.",
  },
  {
    id: 'nan-2',
    from: 'Nan',
    sign: 'Nan. PS. The vicar sends his regards and wants his panto wig back.',
    body: "I went to see the vicar about you. He said you're in his prayers. Then he said, funny thing, the prison chapel borrowed the church's whole panto costume box for Christmas and never gave it back. Frocks, wigs, the lot. He looked at me very hard when he said it. I don't know why.",
    gift: { item: 'voucher', count: 1, line: 'Taped inside the envelope: one Greggs voucher. "For emergencies."' },
  },
  {
    id: 'grim-bugle',
    from: 'The Grim-on-the-Moor Bugle, Letters Desk',
    sign: 'The Editor',
    body: "We are writing to every inmate to ask for comment on our Pastry Crime Week special. Is it true that inside HMP Grim-on-the-Moor the sausage roll is now the currency of choice? Is it true the X-ray operator can be bought with one? We pay £20 for a good quote.",
  },
  {
    id: 'mum-3',
    from: 'Mum',
    sign: 'Mum xx',
    body: "Your dad has stopped going to Greggs out of solidarity. He's going to the one in the next town instead, so I'm not sure it counts. I've put your room exactly how you left it. Except I've hoovered. And put a treadmill in. And it's a craft room now.",
  },
  {
    id: 'shaz-2',
    from: 'Shaz (your ex)',
    sign: "Shaz. PS. It wasn't closure, my therapist moved to Portugal.",
    body: "I saw your mural. It's a good likeness. Better than you deserve. If you DID get out, hypothetically, would you still want the George Foreman grill? Hypothetically. Don't ring. Just asking.",
  },
]

export interface BunkNote {
  id: string
  /** What is written on it. */
  text: string
  /** What the paper is like: grows more suspicious as the notes go on. */
  paper: string
  day: number
}

/**
 * The notes, in order. Every clue is true. The paper gives the writer
 * away a little more each time.
 */
const NOTES: Omit<BunkNote, 'day'>[] = [
  {
    id: 'note-vent',
    paper: 'A square of lined paper, folded twice.',
    text: "The grille behind your table. The screws have rusted to nothing. A canteen spoon will turn them. Nobody has looked at that vent since 1994. Burn this.",
  },
  {
    id: 'note-keith',
    paper: 'Lined paper again. Same neat capitals.',
    text: "KEITH ON THE X-RAY. A BLUE DRINK FROM THE MACHINE IN VISITS. A SAUSAGE ROLL FROM THE CANTEEN. DO NOT ASK HOW I KNOW HIS WEAKNESSES.",
  },
  {
    id: 'note-panto',
    paper: 'Thicker paper this time. Cream. Rather nice, for in here.',
    text: "The chapel has a panto box. Widow Twankey has never been searched. Visitors leave at half past three, and the officer on the gate counts heads, not faces.",
  },
  {
    id: 'note-shift',
    paper: 'Cream paper. A faint smell of pipe tobacco.',
    text: "Day shift clocks off through the loading bay at nine. Nobody looks at the faces of men going home. The spare uniforms hang in the officers' mess. Second rack. Mind the yoghurt.",
  },
  {
    id: 'note-firm',
    paper: 'Cream paper, cut with a ruler. Someone has a ruler.',
    text: "The Firm's price comes down for friends. Do their errands. And never, ever, say the word 'tonight' on those phones. The man who listens has very good ears and a very small life.",
  },
  {
    id: 'note-locks',
    paper: 'Headed paper, the top torn off. Half a crest survives: a portcullis and the letters "...ORNOR".',
    text: "Your night officer checks the locks by hand only after someone has tried the toothpaste. Nobody has, this month. Colgate works best. The whitening one.",
  },
  {
    id: 'note-watching',
    paper: 'Headed paper. This time the crest is whole, and someone has scribbled over it in biro. Not well.',
    text: "You are doing well. Better than the last one. I have been timing you. Do not let me down. P.S. A welder is booked for the vents next week. I would go before Thursday.",
  },
  {
    id: 'note-office',
    paper: "A compliments slip. It says \"With the Governor's compliments\". It does not even try to hide it any more.",
    text: "Very well. You have found me out, or you will soon. Carry on regardless. Every hole you find, I fill. Every hole I fill makes Grim-on-the-Moor better. Escape, and you will have done me a great service. Fail, and you will have done me a slightly smaller one. R.P.",
  },
]

export class Post {
  readonly letters: Letter[] = []
  readonly notes: BunkNote[] = []
  /** A note waiting on the bunk, not yet picked up. */
  waiting: BunkNote | null = null
  private nextLetter = 0
  private nextNote = 0
  private lastNoteDay = 0

  constructor(private readonly rng: () => number) {}

  toSave() {
    return { letters: this.letters, notes: this.notes, waiting: this.waiting, nextLetter: this.nextLetter, nextNote: this.nextNote, lastNoteDay: this.lastNoteDay }
  }

  fromSave(s: ReturnType<Post['toSave']>): void {
    this.letters.splice(0, this.letters.length, ...s.letters)
    this.notes.splice(0, this.notes.length, ...s.notes)
    this.waiting = s.waiting
    this.nextLetter = s.nextLetter
    this.nextNote = s.nextNote
    this.lastNoteDay = s.lastNoteDay
  }

  /** Morning post. Returns what arrived. */
  deliver(day: number, name: string): Letter[] {
    const count = day === 1 ? 1 : this.rng() < 0.35 ? 2 : 1
    const arrived: Letter[] = []
    for (let i = 0; i < count && this.nextLetter < LETTERS.length; i++) {
      const t = LETTERS[this.nextLetter++]
      const letter: Letter = { ...t, body: t.body.replace(/\{name\}/g, name), day, read: false }
      this.letters.unshift(letter)
      arrived.push(letter)
    }
    return arrived
  }

  get unread(): number {
    return this.letters.filter((l) => !l.read).length
  }

  /** While you are out of your cell, the writer slips in. One a day. */
  leaveNote(day: number): BunkNote | null {
    if (this.waiting || day <= this.lastNoteDay || this.nextNote >= NOTES.length) return null
    this.lastNoteDay = day
    this.waiting = { ...NOTES[this.nextNote++], day }
    return this.waiting
  }

  pickUp(): BunkNote | null {
    const n = this.waiting
    if (!n) return null
    this.waiting = null
    this.notes.unshift(n)
    return n
  }

  get notesLeft(): number {
    return NOTES.length - this.nextNote
  }
}

/** The last letter, whichever way it ends. */
export function governorsLetter(name: string, won: boolean, days: number, attempts: number, notes: number): string {
  const clues = notes === 0 ? 'You never read a single one of my notes. Admirable, in its way.' : `You read ${notes} of my notes. ${notes >= 6 ? 'I think you guessed.' : 'I doubt you guessed.'}`
  return won
    ? `Dear ${name},\n\nCongratulations. ${days} day${days === 1 ? '' : 's'} and ${attempts} failed attempt${attempts === 1 ? '' : 's'}. The last man took fourteen days and went out in a bin lorry, which I thought was rather vulgar.\n\nYes, the notes were mine. I run Grim-on-the-Moor as a test of itself. Every route you found, I have already had welded, bricked up or sacked. You have made this the most secure prison in England, and for that I am grateful.\n\n${clues}\n\nGreggs have been informed of your release. They have asked that you keep at least fifty yards from any branch.\n\nYours, with a stopwatch,\nRupert Pettigrew\nGovernor, HMP Grim-on-the-Moor`
    : `Dear ${name},\n\nHard luck. Eight attempts, and every one of them taught me something.\n\nYes, the notes were mine. I run Grim-on-the-Moor as a test of itself. I leave a clue, I see who takes it, and I fix whatever they find. You have been the finest test my prison has ever had.\n\n${clues}\n\nI have had a small plaque made for the laundry. It says "The Greggs Bandit Tried Here".\n\nYours, with a stopwatch,\nRupert Pettigrew\nGovernor, HMP Grim-on-the-Moor`
}
