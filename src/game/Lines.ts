/**
 * Fixed lines for the named characters, each with a recording key. The game
 * shows the text and plays `public/voices/<key>.mp3` when there is one;
 * `npm run dialogue` lists them all for the recording studio. Nothing here
 * says the player's name, so one take works for everyone.
 */
export interface Line {
  speaker: string
  text: string
}

export const LINES = {
  'keith.intro': { speaker: 'Keith (X-ray operator)', text: "Alright? Keith. I do the X-ray. Twenty-two years. Seen it all: phones in pies, a ferret in a duvet, a whole set of drums in a mattress once. Don't ask." },
  'keith.paid': { speaker: 'Keith (X-ray operator)', text: 'We never spoke. My eyes are terrible today. Terrible.' },
  'keith.bribed.1': { speaker: 'Keith (X-ray operator)', text: "Blue raspberry? And a sausage roll? ...You know, I get this cataract on Thursdays. Today feels like a Thursday. Eleven o'clock van. I'll be very busy with my sausage roll." },
  'keith.bribed.2': { speaker: 'Keith (X-ray operator)', text: "Oh, that's the good blue. Right. If a basket comes through looking like a person, I'll assume it's a very lumpy duvet. Today only, mind." },
  'keith.wants': { speaker: 'Keith (X-ray operator)', text: 'A blue drink. The proper blue, from the vending machine in visits. And a sausage roll from the canteen. One of each. I am a man of simple tastes.' },

  'chaplain.intro': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'Ah! The Greggs Bandit, in my chapel! I have prayed for you, and separately for the sausage rolls. Now, a small crisis: somebody has stolen three of my hymn books. Three! I have a choir of eleven and a man called Tiny who only knows the words to Jerusalem. Bring them back and I will owe you one. A proper one.' },
  'chaplain.reward': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'Three Greggs vouchers from the collection plate, which I shall confess on Sunday. And a favour. If you are ever somewhere you should not be, and an officer has you by the collar, I may well remember that you were at choir practice. Once. I can lie once. Twice is a habit.' },
  'chaplain.accept': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'Bless you. Word on the landing is one is levelling the pool table in the games room, one is a soap dish in the showers, and one is holding up the bench press in the gym. Hymns Ancient and Modern, red covers, moustaches on all the bishops. Do not ask about the moustaches.' },
  'chaplain.waiting': { speaker: 'Reverend Clive Bunting (chaplain)', text: "Any luck? The games room, the showers and the gym. If anyone asks, you are doing the Lord's work. Technically you are." },
  'chaplain.found': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'Is that...? All three! And only slightly damp. You are a wonder.' },
  'chaplain.thanks': { speaker: 'Reverend Clive Bunting (chaplain)', text: "Three vouchers, as promised. And remember: choir practice. If an officer ever drags you off somewhere awkward, you were with me, singing the alto line. Once, mind. I'm a chaplain, not a solicitor." },
  'chaplain.after.1': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'Choir practice is still on, if you ever need it. Once.' },
  'chaplain.after.2': { speaker: 'Reverend Clive Bunting (chaplain)', text: 'The hymn books are back in the pews. Tiny is learning a second hymn. Miracles do happen.' },
  'chaplain.spent': { speaker: 'Reverend Clive Bunting (chaplain)', text: "I've already lied for you once. I spent all of Sunday apologising. Panto auditions are Thursday, though." },
} satisfies Record<string, Line>

export type LineKey = keyof typeof LINES
