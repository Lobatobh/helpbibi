'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

/**
 * Live countdown timer that shows remaining time in MM:SS format.
 * Counts down from the given seconds, stops at 0.
 */
export function LiveCountdown({
  seconds,
  label = 'ETA',
  variant = 'default',
}: {
  seconds: number
  label?: string
  variant?: 'default' | 'large' | 'inline'
}) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
    const interval = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`
  const isLow = remaining <= 30 && remaining > 0

  if (variant === 'inline') {
    return (
      <span className={`flex items-center gap-1 ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
        <Clock className="h-3 w-3" />
        {timeStr}
      </span>
    )
  }

  if (variant === 'large') {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border p-3 ${
        isLow ? 'border-rose-500/40 bg-rose-500/10' : 'border-emerald-500/40 bg-emerald-500/10'
      }`}>
        <p className="text-[10px] uppercase text-slate-500">{label}</p>
        <p className={`text-2xl font-extrabold tabular-nums ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
          {timeStr}
        </p>
        {isLow && <p className="text-[9px] font-semibold text-rose-400 animate-pulse">Chegando!</p>}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
      isLow ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
    }`}>
      <Clock className="h-3 w-3" />
      <span className="font-bold tabular-nums">{timeStr}</span>
    </div>
  )
}
