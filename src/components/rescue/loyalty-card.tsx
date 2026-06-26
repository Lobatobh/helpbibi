'use client'

import { Award, Sparkles, TrendingUp } from 'lucide-react'
import type { LoyaltyInfo } from '@/lib/rescue-types'

const TIERS = [
  { name: 'Bronze', min: 0, color: '#a16207' },
  { name: 'Prata', min: 200, color: '#94a3b8' },
  { name: 'Ouro', min: 500, color: '#f59e0b' },
  { name: 'Diamante', min: 1000, color: '#38bdf8' },
]

export function LoyaltyCard({ loyalty }: { loyalty: LoyaltyInfo | null }) {
  if (!loyalty) return null

  const { points, tier, nextTierMin, earnedThisService, tierUpgraded } = loyalty
  const currentTierIdx = TIERS.findIndex((t) => t.name === tier.name)
  const nextTier = nextTierMin ? TIERS.find((t) => t.min === nextTierMin) : null
  const prevMin = currentTierIdx > 0 ? TIERS[currentTierIdx - 1].min : 0
  const progressToNext = nextTier
    ? Math.min(100, ((points - prevMin) / (nextTier.min - prevMin)) * 100)
    : 100
  const pointsToNext = nextTier ? nextTier.min - points : 0

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: `${tier.color}66`,
        background: `linear-gradient(135deg, ${tier.color}1a 0%, rgba(15,23,42,0.6) 60%)`,
      }}
    >
      {/* glow */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{ background: `${tier.color}33` }}
      />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: `${tier.color}26`, color: tier.color }}
            >
              <Award className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Programa de fidelidade
              </p>
              <p className="text-sm font-bold text-white">
                {tier.name}
                {tierUpgraded && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                    <Sparkles className="h-2.5 w-2.5" /> NOVO!
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-white">{points}</p>
            <p className="text-[10px] uppercase text-slate-500">pontos</p>
          </div>
        </div>

        {earnedThisService ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
            <TrendingUp className="h-3 w-3" />
            +{earnedThisService} pontos ganhos neste serviço
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400">{tier.perk}</p>
        )}

        {/* Progress to next tier */}
        {nextTier && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>Próximo: {nextTier.name}</span>
              <span>{pointsToNext} pts restantes</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressToNext}%`, background: tier.color }}
              />
            </div>
          </div>
        )}
        {!nextTier && (
          <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">
            ⭐ Tier máximo alcançado!
          </p>
        )}
      </div>
    </div>
  )
}
