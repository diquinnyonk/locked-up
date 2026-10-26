/**
 * Everyone's name. Officers keep theirs from one day to the next, and so do
 * prisoners: the same person sleeps in the same bunk every game, with the
 * same name, so each of them can have a voice of their own.
 */
export const OFFICER_NAMES = [
  'Mr Higginbottom', 'Ms Bottomley', 'Mr Crumpet', 'Mrs Thistlethwaite',
  'Mr Pickles', 'Ms Doubleday', 'Mr Snodgrass', 'Mr Wellbeloved',
  'Ms Puddifoot', 'Mr Gristle', 'Mrs Battenberg', 'Mr Sidebottom',
  'Mr Featherstonehaugh', 'Ms Clutterbuck', 'Mr Ramsbottom', 'Mrs Shufflebotham',
]

const FIRST = ['Dave', 'Gaz', 'Tommo', 'Dean', 'Wayne', 'Kev', 'Lee', 'Jamal', 'Callum', 'Ryan', 'Darren', 'Nathan', 'Liam', 'Craig', 'Marcus', 'Kieran', 'Shane', 'Reece', 'Tariq', 'Mo', 'Jonno', 'Stu', 'Paddy', 'Ollie', 'Dwayne', 'Ade', 'Taff', 'Jock', 'Scouse', 'Fergus', 'Carl', 'Neil', 'Barry', 'Terry', 'Vince', 'Rocco', 'Ash', 'Dom', 'Jase', 'Rich']
const NICK = ['Big', 'Little', 'Mad', 'Posh', 'Two-Sugars', 'Biscuits', 'Kettle', 'Dodgy', 'Fingers', 'Wonky', 'Chalky', 'Pie', 'Spanner', 'Bins', 'Gravy', 'Scampi', 'Sausage', 'Toast']

/** A small fixed hash, so a prisoner's nickname never changes. */
const roll = (index: number, salt: number) => {
  let h = Math.imul(index + 1, 2654435761) ^ Math.imul(salt + 7, 40503)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

/**
 * Prisoner `index`'s name. Every first name is used twice across the
 * prison; the second of each pair always has a nickname, never the first's.
 */
export function prisonerName(index: number): string {
  const first = FIRST[index % FIRST.length]
  const nick = (i: number) => NICK[Math.floor(roll(i, 2) * NICK.length)]
  if (index < FIRST.length) return roll(index, 1) < 0.4 ? `${nick(index)} ${first}` : first
  const twin = prisonerName(index - FIRST.length)
  let n = nick(index)
  if (twin === `${n} ${first}`) n = NICK[(NICK.indexOf(n) + 1) % NICK.length]
  return `${n} ${first}`
}

/** The id a character's recordings are filed under: "ms-bottomley", "little-darren". */
export const voiceSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Every officer has a way about them, and learning the staff is half of
 * planning a way out. The Notebook's Officers page lists them.
 */
export type Trait = 'old' | 'onBreak' | 'biscuits' | 'dozer' | 'nosy' | 'chatty' | 'stickler' | 'soft' | 'badKnee' | 'hard' | 'sharp' | 'ordinary'

export const TRAITS: Record<Trait, { title: string; text: string }> = {
  old: { title: 'Too old for this', text: 'Cannot run. Anyone with a head start gets away from him.' },
  onBreak: { title: 'Always on her break', text: 'At the officers\' desk in the canteen with a brew from 10:00 to 11:00 and 15:00 to 16:00, whatever is happening on her landing.' },
  biscuits: { title: 'Sweet tooth', text: 'A packet of custard creams buys a blind eye. Once.' },
  dozer: { title: 'Night-shift napper', text: 'Dozes at her post at night. Sees less, hears nothing.' },
  nosy: { title: 'Nosy', text: 'Hears a dropped spoon from the far end of the landing, and comes to look.' },
  chatty: { title: 'Chatty', text: 'Stops to chat for ages. Half-listening, slow to notice, and easy to pickpocket.' },
  stickler: { title: 'Stickler', text: 'Sees contraband in your hands and pats you down on the spot.' },
  soft: { title: 'Soft touch', text: 'Catches you out of bounds and sends you back with a warning. Once a day.' },
  badKnee: { title: 'Bad knee', text: 'Slow in a chase. Mentions the knee a lot.' },
  hard: { title: 'Hard case', text: 'The fastest officer in the prison, and never gives up a chase early.' },
  sharp: { title: 'Never forgets a face', text: 'Sees further than anyone, and sees through a disguise in seconds.' },
  ordinary: { title: 'By the book', text: 'Nothing special. Does the job.' },
}

/** Each officer's trait, in the same order as OFFICER_NAMES. */
export const OFFICER_TRAITS: Trait[] = ['old', 'onBreak', 'biscuits', 'dozer', 'nosy', 'chatty', 'stickler', 'soft', 'badKnee', 'hard', 'sharp', 'ordinary', 'stickler', 'chatty', 'ordinary', 'ordinary']
