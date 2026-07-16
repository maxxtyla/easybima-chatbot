'use client'

// Synthesized notification chime — generated entirely via the Web Audio
// API rather than an mp3/wav asset. That avoids bundling/hosting a sound
// file (and any licensing question that comes with a downloaded one) while
// still giving a clean, professional two-note "ding-ding" comparable to
// what Slack/Intercom-style widgets use. Cached as a module-level singleton
// so repeated calls don't spin up a new AudioContext each time.
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  // Browsers suspend the context until a user gesture has occurred
  // somewhere on the page; resume() is a no-op if it's already running.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Plays a short, pleasant two-note chime (A5 -> D6, a rising perfect
 * fourth) to signal a new incoming message. `volume` is 0–1.
 */
export function playNotificationSound(volume = 0.35) {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const notes: { freq: number; start: number; duration: number }[] = [
    { freq: 880.0, start: 0, duration: 0.16 }, // A5
    { freq: 1174.66, start: 0.09, duration: 0.24 }, // D6
  ]

  notes.forEach(({ freq, start, duration }) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)

    const t0 = now + start
    // Quick attack, smooth exponential decay — avoids the click/pop you'd
    // get from a hard on/off, and reads as "soft chime" rather than "beep".
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)

    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  })
}

/**
 * Flashes the browser tab title between `alertText` and the page's
 * original title so an agent working in another tab notices new activity.
 * Returns a stop function; also auto-stops the moment the tab regains
 * focus.
 */
export function startTitleFlash(alertText: string, intervalMs = 1200): () => void {
  if (typeof document === 'undefined') return () => {}
  const originalTitle = document.title
  let showingAlert = false

  const interval = setInterval(() => {
    document.title = showingAlert ? originalTitle : alertText
    showingAlert = !showingAlert
  }, intervalMs)

  const stop = () => {
    clearInterval(interval)
    document.title = originalTitle
  }

  const handleFocus = () => stop()
  window.addEventListener('focus', handleFocus)

  return () => {
    stop()
    window.removeEventListener('focus', handleFocus)
  }
}
