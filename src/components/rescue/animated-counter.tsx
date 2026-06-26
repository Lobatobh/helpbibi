'use client'

import { useEffect, useRef, useState } from 'react'

export function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 1.5,
}: {
  value: number
  suffix?: string
  prefix?: string
  duration?: number
}) {
  const [display, setDisplay] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    // Small delay to ensure the element is visible
    const timer = setTimeout(() => {
      const start = Date.now()
      const startValue = 0
      const animate = () => {
        const elapsed = (Date.now() - start) / 1000
        const progress = Math.min(elapsed / duration, 1)
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(startValue + (value - startValue) * eased))
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, 200)

    return () => clearTimeout(timer)
  }, [value, duration])

  return (
    <span>
      {prefix}{display.toLocaleString('pt-BR')}{suffix}
    </span>
  )
}
