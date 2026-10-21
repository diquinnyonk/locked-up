/**
 * Recorded dialogue.
 *
 * Every line worth recording has a stable key (`mission.soap-opera.brief`,
 * `mission.soap-opera.thanks`, ...). `npm run dialogue` writes the full
 * script with its keys to `dialogue/script.csv` for the recording session.
 * Drop each take in `public/voices/<key>.mp3`, add the key to VOICE_LINES,
 * and it plays when the line comes up. Lines without a recording are
 * simply read.
 */
export const VOICE_LINES = new Set<string>([])

export class Voice {
  private current: HTMLAudioElement | null = null

  play(key: string | null): void {
    this.stop()
    if (!key || !VOICE_LINES.has(key)) return
    const audio = new Audio(`voices/${key}.mp3`)
    this.current = audio
    audio.play().catch(() => {})
  }

  stop(): void {
    this.current?.pause()
    this.current = null
  }
}
