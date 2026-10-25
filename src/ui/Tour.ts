import { isTouch } from './Touch'

/**
 * The first-day walk round the screen: every control and every menu, one at
 * a time, each pointing at the part of the screen it is about. Shown the
 * first time you start, and again from the Notebook (How to play).
 */

/** Every control, for the tour and the How to play page. */
export const CONTROLS: { keys: string[]; touch: string; what: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], touch: 'Left thumb', what: 'Walk (the arrow keys work too)' },
  { keys: ['Shift'], touch: 'Run', what: 'Run: quicker, but loud, and officers notice' },
  { keys: ['C'], touch: 'Sneak', what: 'Sneak: slower and quieter, harder to spot' },
  { keys: ['E'], touch: 'Use', what: 'The main thing: talk, open, pick up, sit, use' },
  { keys: ['R'], touch: 'Alt', what: 'The other thing, when there is one: lift keys, jam a lock' },
  { keys: ['F'], touch: 'Fight', what: 'Throw a punch' },
  { keys: ['Tab'], touch: 'Pockets', what: 'Your pockets: use, combine and make things' },
  { keys: ['J'], touch: 'Notebook', what: 'The Notebook: mission, jobs, post, notes' },
  { keys: ['M'], touch: 'Map', what: 'The big map' },
  { keys: ['Z'], touch: 'Sleep', what: 'Sleep on your bunk at night, till morning' },
  { keys: ['H'], touch: 'Sick', what: 'Fake being ill behind your door at night' },
  { keys: ['Q'], touch: 'Soap', what: 'Chew soap, so the sickness froths' },
  { keys: ['G'], touch: 'Kick off', what: 'Start a riot, once a firm is paid to back you' },
  { keys: ['Esc'], touch: 'Menu', what: 'Pause, or close whatever is open' },
]

const kbd = (k: string) => `<kbd>${k}</kbd>`
const key = (what: string) => {
  const c = CONTROLS.find((x) => x.what.startsWith(what))!
  return isTouch() ? `<b>${c.touch}</b>` : c.keys.map(kbd).join('')
}

interface Step {
  /** What to point at; none, or nothing on screen, and the card sits in the middle. */
  at?: string
  title: string
  body: () => string
}

function steps(name: string, hard: boolean): Step[] {
  const touch = isTouch()
  return [
    {
      title: `Welcome to Grim-on-the-Moor, ${name}`,
      body: () => `<p>A quick walk round the screen before day one: how to move, what everything up here means, and where the menus are. It takes a minute.</p><p>Skip it any time. It lives in the Notebook under <b>How to play</b> if you want it again.</p>`,
    },
    {
      at: touch ? '#touchpad' : undefined,
      title: 'Getting about',
      body: () =>
        touch
          ? `<p>Put your left thumb down anywhere on the left half of the screen and slide it to walk.</p><p><b>Run</b> is quicker but loud, and officers notice. <b>Sneak</b> is slow and quiet, and harder to spot.</p>`
          : `<p>${kbd('W')}${kbd('A')}${kbd('S')}${kbd('D')} or the arrow keys to walk.</p><p>Hold ${kbd('Shift')} to run: quicker, but loud, and officers notice. ${kbd('C')} to sneak: slow and quiet, and harder to spot.</p>`,
    },
    {
      at: touch ? '#touchbuttons' : '#prompts',
      title: 'Doing things',
      body: () =>
        `<p>When you can do something, it shows ${touch ? 'at the bottom' : 'here'} with its key. ${key('The main thing')} is the main one: talk to people, open doors, pick things up, sit down, use things.</p><p>${key('The other thing')} is the other choice when there is one, like lifting the keys off an officer's belt. ${key('Throw a punch')} throws a punch. Officers take a dim view.</p>`,
    },
    {
      at: '#info',
      title: 'You, and the time',
      body: () => `<p>Who you are and the clock. Below it, what the regime says everyone should be doing now (breakfast, work, bang-up) and what comes next. Be where you should be and nobody looks twice.</p><p>Then your attempts left, your health, and whether anyone outside is ready to pick you up.</p>`,
    },
    {
      title: 'Being noticed',
      body: () => `<p>When you are somewhere you should not be, it says so at the top of the screen. If an officer starts to notice you, a bar fills.${hard ? '' : ' The pale shapes on the floor are what each officer can see.'}</p><p>Out of bounds only counts as an attempt once an officer actually sees you. Get back to your cell and it never happened.</p>`,
    },
    {
      at: '#jobs',
      title: 'Jobs',
      body: () => `<p>Prisoners and officers will ask favours. Say yes and the job shows here with what is left to do. Jobs earn Greggs vouchers, the money in here, and make friends who back you up.</p>`,
    },
    {
      at: '#minimap',
      title: 'The map',
      body: () => `<p>Where you are, and every room. Tap it or press ${key('The big map')} for the big map with a key to what is on it.${hard ? '' : ' On Normal, the places your jobs need are lit up.'}</p>`,
    },
    {
      at: '#inventory',
      title: 'Your pockets',
      body: () => `<p>What you are carrying. ${key('Your pockets')} opens your pockets in full: use things, put two together to make something new, and see what you could make with a bit more.</p><p>Officers search people. Some things are better kept in a hiding place in your cell.</p>`,
    },
    {
      at: '#menubtn',
      title: 'The Notebook',
      body: () => `<p>${touch ? '<b>Menu</b>' : `${kbd('J')} or <b>Menu</b>`} opens your Notebook. Its pages:</p><ul><li><b>Main mission</b>: a checklist of everything an escape needs, ticked as you go.</li><li><b>Jobs</b>: favours taken on, and who has work going.</li><li><b>Pockets</b>: the same as ${touch ? 'the <b>Pockets</b> button' : key('Your pockets')}.</li><li><b>Post</b>: letters from outside. Some have more in them than the censor noticed.</li><li><b>Notes</b>: everything you learn about the prison.</li><li><b>How to play</b>: every control, and this tour again.</li></ul>`,
    },
    {
      at: touch ? '#touchbuttons' : undefined,
      title: 'Nights',
      body: () => `<p>At night you are locked in. On your bunk, press ${key('Sleep on your bunk')} to sleep till morning.</p><p>Behind your door, press ${key('Fake being ill')} to fake being ill, so an officer has to open up. Press ${key('Chew soap')} to chew soap and make it convincing. Press ${key('Start a riot')} to kick off a riot, once a firm has been paid to back you.</p>`,
    },
    {
      title: 'Talking',
      body: () => `<p>Walk up to anyone and press ${key('The main thing')} to talk. The camera comes in over your shoulder. Pick what to say from the list, or <b>Leave it</b> to walk away.</p><p>${touch ? '<b>Menu</b>' : kbd('Esc')} pauses the game, or closes whatever is open.</p>`,
    },
    {
      title: 'Right. Off you go.',
      body: () => `<p>Get out of your cell, out of the wing, over the wall, and have someone waiting when you do. Four attempts, then four more.</p><p>Start by having a look round, and talk to your cellmate.</p>`,
    },
  ]
}

const SEEN = 'locked-up.tour'

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1'
  } catch {
    return false
  }
}

export function playTour(name: string, hard: boolean, done: () => void): void {
  const list = steps(name, hard)
  let i = 0
  const root = document.createElement('div')
  root.id = 'tour'
  root.innerHTML = `<div class="hole"></div><section class="card" role="dialog" aria-modal="true" aria-labelledby="tour-title"><p class="count"></p><h2 id="tour-title"></h2><div class="text"></div><div class="controls"><button type="button" class="ghost skip">Skip</button><span class="spacer"></span><button type="button" class="ghost back">Back</button><button type="button" class="next">Next</button></div></section>`
  document.body.append(root)
  const hole = root.querySelector('.hole') as HTMLElement
  const card = root.querySelector('.card') as HTMLElement
  const back = root.querySelector('.back') as HTMLButtonElement
  const next = root.querySelector('.next') as HTMLButtonElement

  const target = (): DOMRect | null => {
    const sel = list[i].at
    const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' ? r : null
  }

  const place = () => {
    const r = target()
    const vw = window.innerWidth
    const vh = window.innerHeight
    root.classList.toggle('centred', !r)
    if (!r) {
      hole.style.cssText = ''
      card.style.left = card.style.top = ''
      return
    }
    const pad = 8
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`
    // The card goes beside the thing, on whichever side has the room.
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const gap = 18
    let x: number
    let y: number
    if (r.bottom + gap + ch < vh - 16) {
      y = r.bottom + gap
      x = r.left + r.width / 2 - cw / 2
    } else if (r.top - gap - ch > 16) {
      y = r.top - gap - ch
      x = r.left + r.width / 2 - cw / 2
    } else {
      y = r.top + r.height / 2 - ch / 2
      x = r.right + gap + cw < vw - 16 ? r.right + gap : r.left - gap - cw
    }
    card.style.left = `${Math.max(16, Math.min(vw - cw - 16, x))}px`
    card.style.top = `${Math.max(16, Math.min(vh - ch - 16, y))}px`
  }

  const show = () => {
    const s = list[i]
    ;(root.querySelector('.count') as HTMLElement).textContent = `${i + 1} of ${list.length}`
    ;(root.querySelector('h2') as HTMLElement).textContent = s.title
    ;(root.querySelector('.text') as HTMLElement).innerHTML = s.body()
    back.hidden = i === 0
    next.textContent = i === list.length - 1 ? 'Start day one' : 'Next'
    card.classList.remove('turn')
    void card.offsetWidth
    card.classList.add('turn')
    place()
    next.focus()
  }

  const finish = () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', place)
    root.remove()
    try {
      localStorage.setItem(SEEN, '1')
    } catch {
      // Private browsing: the tour shows again next time, which is fine.
    }
    done()
  }
  const go = (d: number) => {
    if (i + d >= list.length) return finish()
    i = Math.max(0, i + d)
    show()
  }
  // Keys go to the tour, not the game behind it.
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    // A focused button handles its own Enter and Space.
    const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')
    if (e.code === 'Escape') finish()
    else if (!onButton && (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'KeyE')) {
      e.preventDefault()
      go(1)
    } else if (e.code === 'ArrowLeft' || e.code === 'Backspace') {
      e.preventDefault()
      go(-1)
    }
  }
  next.onclick = () => go(1)
  back.onclick = () => go(-1)
  ;(root.querySelector('.skip') as HTMLButtonElement).onclick = finish
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', place)
  show()
}
