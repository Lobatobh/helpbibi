'use client'

import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { Trophy, Star, Truck, TrendingUp, Medal, Crown, Award } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

type LeaderboardEntry = {
  id: string
  name: string
  vehicle: string
  rating: number
  completedCount: number
  earningsToday: number
}

type Period = 'today' | 'total'

const SOCKET_URL = '/?XTransformPort=3003'

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [period, setPeriod] = useState<Period>('today')

  useEffect(() => {
    const s = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    })

    s.on('leaderboard', (data: LeaderboardEntry[]) => {
      setEntries(data)
    })

    return () => {
      s.disconnect()
    }
  }, [])

  // Sort based on selected period
  const sortedEntries = [...entries].sort((a, b) => {
    if (period === 'today') {
      // Today: sort by earningsToday desc, then completedCount
      if (b.earningsToday !== a.earningsToday) return b.earningsToday - a.earningsToday
      return b.completedCount - a.completedCount
    } else {
      // Total: sort by completedCount desc, then rating
      if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount
      return b.rating - a.rating
    }
  })

  const medals = [
    { icon: Crown, color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-500/5', border: 'border-amber-500/40' },
    { icon: Medal, color: 'text-slate-300', bg: 'from-slate-400/20 to-slate-400/5', border: 'border-slate-400/40' },
    { icon: Award, color: 'text-orange-400', bg: 'from-orange-500/20 to-orange-500/5', border: 'border-orange-500/40' },
  ]

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Ranking de Prestadores</p>
            <p className="text-[11px] text-slate-400">
              {period === 'today' ? 'Por ganhos de hoje' : 'Por serviços totais'} · atualiza a cada 5s
            </p>
          </div>
        </div>
        {/* Period filter */}
        <div className="flex gap-1 rounded-full border border-slate-700 bg-slate-800/50 p-0.5">
          <button
            onClick={() => setPeriod('today')}
            className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
              period === 'today' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriod('total')}
            className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
              period === 'total' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Total
          </button>
        </div>
      </div>

      {sortedEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center">
          <Truck className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-xs text-slate-500">Aguardando prestadores entrarem no app...</p>
          <p className="mt-1 text-[10px] text-slate-600">Registre um prestador na demo para vê-lo no ranking.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedEntries.map((entry, i) => {
            const medal = medals[i]
            const isTop3 = i < 3
            const primaryStat = period === 'today' ? `R$ ${entry.earningsToday}` : `${entry.completedCount}`
            const primaryLabel = period === 'today' ? 'hoje' : 'serviços'
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                  isTop3
                    ? `bg-gradient-to-r ${medal.bg} ${medal.border}`
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex w-8 shrink-0 items-center justify-center">
                  {isTop3 ? (
                    <medal.icon className={`h-5 w-5 ${medal.color}`} />
                  ) : (
                    <span className="text-sm font-bold text-slate-500">{i + 1}</span>
                  )}
                </div>
                <Avatar className="h-9 w-9 bg-gradient-to-br from-emerald-500 to-emerald-700">
                  <AvatarFallback className="bg-transparent text-xs font-bold text-white">
                    {entry.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{entry.name}</p>
                  <p className="truncate text-[10px] text-slate-400">{entry.vehicle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-right">
                  <div>
                    <p className="flex items-center gap-0.5 text-xs font-bold text-amber-400">
                      <Star className="h-3 w-3" fill="currentColor" />
                      {entry.rating.toFixed(1)}
                    </p>
                    <p className="text-[9px] text-slate-500">nota</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-0.5 text-xs font-bold text-white">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      {primaryStat}
                    </p>
                    <p className="text-[9px] text-slate-500">{primaryLabel}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
