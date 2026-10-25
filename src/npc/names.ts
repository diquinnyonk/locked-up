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
