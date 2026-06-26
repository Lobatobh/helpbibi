'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ServiceData } from '@/lib/rescue-types'

// Sound types using Web Audio API (no asset files needed)
type SoundType = 'offer' | 'accept' | 'arrive' | 'complete' | 'cancel' | 'chat'

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (typeof window === 'undefined') return
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)

    // Close context after sound finishes
    setTimeout(() => ctx.close(), duration * 1000 + 100)
  } catch (e) {
    // AudioContext not available (e.g. before user interaction)
  }
}

const SOUND_PATTERNS: Record<SoundType, () => void> = {
  offer: () => {
    // Two ascending tones (notification)
    playTone(659, 0.12, 'sine', 0.12)
    setTimeout(() => playTone(880, 0.15, 'sine', 0.12), 120)
  },
  accept: () => {
    // Pleasant chord arpeggio
    playTone(523, 0.1, 'sine', 0.1)
    setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 100)
    setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 200)
  },
  arrive: () => {
    // Doorbell-like double tone
    playTone(880, 0.15, 'triangle', 0.15)
    setTimeout(() => playTone(659, 0.2, 'triangle', 0.15), 160)
  },
  complete: () => {
    // Success fanfare
    playTone(523, 0.1, 'sine', 0.12)
    setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 100)
    setTimeout(() => playTone(784, 0.1, 'sine', 0.12), 200)
    setTimeout(() => playTone(1047, 0.25, 'sine', 0.12), 300)
  },
  cancel: () => {
    // Descending tones (sad)
    playTone(440, 0.15, 'sawtooth', 0.08)
    setTimeout(() => playTone(330, 0.2, 'sawtooth', 0.08), 150)
  },
  chat: () => {
    // Short pop
    playTone(800, 0.06, 'sine', 0.08)
  },
}

export function useSoundNotifications(svc: ServiceData | null, perspective: 'client' | 'provider') {
  const [enabled, setEnabled] = useState(false)
  const lastStatus = useRef<string | null>(null)
  const lastId = useRef<string | null>(null)
  const lastMessageCount = useRef<number>(0)

  const toggle = useCallback(() => setEnabled((e) => !e), [])

  useEffect(() => {
    if (!enabled) return
    if (!svc) {
      lastStatus.current = null
      lastId.current = null
      lastMessageCount.current = 0
      return
    }
    // reset tracking when service id changes
    if (lastId.current !== svc.id) {
      lastId.current = svc.id
      lastStatus.current = null
      lastMessageCount.current = svc.timeline?.length || 0
    }

    const prev = lastStatus.current
    const curr = svc.status
    if (prev !== null && prev !== curr) {
      // Status changed — play sound
      if (perspective === 'client') {
        if (curr === 'offered') SOUND_PATTERNS.offer()
        else if (curr === 'accepted' || curr === 'arriving') SOUND_PATTERNS.accept()
        else if (curr === 'arrived') SOUND_PATTERNS.arrive()
        else if (curr === 'completed') SOUND_PATTERNS.complete()
        else if (curr === 'cancelled' || curr === 'expired') SOUND_PATTERNS.cancel()
      } else {
        if (curr === 'completed') SOUND_PATTERNS.complete()
        else if (curr === 'cancelled' || curr === 'expired') SOUND_PATTERNS.cancel()
      }
    }
    lastStatus.current = curr
  }, [svc?.status, svc?.id, perspective, enabled])

  return { enabled, toggle }
}

// Separate hook for chat message sounds
export function useChatSound(enabled: boolean, messageCount: number) {
  const lastCount = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return
    if (lastCount.current === 0) {
      lastCount.current = messageCount
      return
    }
    if (messageCount > lastCount.current) {
      SOUND_PATTERNS.chat()
    }
    lastCount.current = messageCount
  }, [messageCount, enabled])
}
