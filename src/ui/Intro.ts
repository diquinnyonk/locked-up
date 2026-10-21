/**
 * How you ended up in HMP Grim-on-the-Moor. A handful of cards over the slow
 * flyover, read at your own pace and skippable at any point.
 */
interface Slide {
  kicker: string
  headline?: string
  text: string
}

function slides(name: string): Slide[] {
  return [
    {
      kicker: 'Tuesday, 11:42. Market Street, Grim-on-the-Moor',
      text: 'It started, as these things always do, with a craving.',
    },
    {
      kicker: 'Greggs, Market Street branch',
      text: `${name} walked into Greggs. ${name} walked out with a steak bake, four sausage rolls and a festive bake. In October. ${name} did not walk past the till.`,
    },
    {
      kicker: 'The Grim-on-the-Moor Bugle, front page',
      headline: 'PASTRY OUTRAGE: LOCAL FIEND HELD',
      text: 'In most towns that is a caution and a stern word. In Grim-on-the-Moor, under the Pastry Protection Act of 1987, robbing a Greggs is classed as worse than murder. Three people fainted in the queue.',
    },
    {
      kicker: 'Grim-on-the-Moor Crown Court',
      headline: 'GUILTY',
      text: "The judge removed his glasses. 'In thirty years on the bench I have seen arson, fraud, and a man who married a swan. I have never seen anything like this.' Sentence: as long as it takes.",
    },
    {
      kicker: 'HMP Grim-on-the-Moor, reception',
      text: `Word travels fast on a landing. By the time the van pulls in, every prisoner and every officer knows your name. ${name}. The Greggs Bandit.`,
    },
    {
      kicker: 'Day one',
      text: 'Nobody has ever escaped from Grim-on-the-Moor. You get four attempts, then four more. Make the first one count.',
    },
  ]
}

export function playIntro(name: string, done: () => void): void {
  const root = document.getElementById('story')!
  const kicker = document.getElementById('story-kicker')!
  const text = document.getElementById('story-text')!
  const dots = document.getElementById('story-dots')!
  const next = document.getElementById('story-next') as HTMLButtonElement
  const skip = document.getElementById('story-skip') as HTMLButtonElement
  const list = slides(name)
  let i = 0

  const show = () => {
    const s = list[i]
    kicker.textContent = s.kicker
    text.innerHTML = ''
    if (s.headline) {
      const h = document.createElement('strong')
      h.className = 'headline'
      h.textContent = s.headline
      text.append(h)
    }
    const p = document.createElement('span')
    p.textContent = s.text
    text.append(p)
    dots.textContent = `${i + 1} / ${list.length}`
    next.textContent = i === list.length - 1 ? 'Begin your sentence' : 'Next'
    root.classList.remove('turn')
    void root.offsetWidth
    root.classList.add('turn')
  }

  const finish = () => {
    root.hidden = true
    window.removeEventListener('keydown', onKey)
    done()
  }
  const advance = () => {
    if (i >= list.length - 1) finish()
    else {
      i++
      show()
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') finish()
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'KeyE') {
      e.preventDefault()
      advance()
    }
  }

  next.onclick = advance
  skip.onclick = finish
  window.addEventListener('keydown', onKey)
  root.hidden = false
  show()
  next.focus()
}
