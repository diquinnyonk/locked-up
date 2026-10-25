/**
 * Recorded dialogue.
 *
 * Every spoken line has a key in dialogue/script.json (`npm run dialogue`
 * finds them all, and the voice studio records them). A take saved as
 * `public/voices/<key>.mp3` plays when its line comes up; lines without one
 * are simply read. Which takes exist is learnt as the game goes: a missing
 * file is tried once and then left alone.
 */
export class Voice {
  private current: HTMLAudioElement | null = null
  private readonly missing = new Set<string>()

  get busy(): boolean {
    return !!this.current && !this.current.paused && !this.current.ended
  }

  play(key: string | null): void {
    this.stop()
    if (!key || this.missing.has(key)) return
    const audio = new Audio(`voices/${key}.mp3`)
    audio.addEventListener('error', () => this.missing.add(key), { once: true })
    this.current = audio
    audio.play().catch(() => {})
  }

  /** A passing remark: only if nothing else is being said. */
  remark(key: string | null): void {
    if (this.busy) return
    this.play(key)
  }

  stop(): void {
    this.current?.pause()
    this.current = null
  }
}
