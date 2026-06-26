'use client'

import { useState } from 'react'
import { Award, Sparkles, TrendingUp, Gift, CheckCircle2, Lock, Loader2 } from 'lucide-react'
import type { LoyaltyInfo, LoyaltyReward } from '@/lib/rescue-types'

const TIERS = [
  { name: 'Bronze', min: 0, color: '#a16207' },
  { name: 'Prata', min: 200, color: '#94a3b8' },
  { name: 'Ouro', min: 500, color: '#00B0FF' },
  { name: 'Diamante', min: 1000, color: '#38bdf8' },
]

export function LoyaltyCard({
  loyalty,
  rewards,
  redeemResult,
  onRedeem,
  onClearRedeem,
}: {
  loyalty: LoyaltyInfo | null
  rewards: LoyaltyReward[]
  redeemResult: { success: boolean; code?: string; label?: string; message: string } | null
  onRedeem: (rewardId: string) => void
  onClearRedeem: () => void
}) {
  const [showRewards, setShowRewards] = useState(false)
  const [redeeming, setRedeeming] = useState<string | null>(null)

  if (!loyalty) return null

  const { points, tier, nextTierMin, earnedThisService, tierUpgraded } = loyalty
  const currentTierIdx = TIERS.findIndex((t) => t.name === tier.name)
  const nextTier = nextTierMin ? TIERS.find((t) => t.min === nextTierMin) : null
  const prevMin = currentTierIdx > 0 ? TIERS[currentTierIdx - 1].min : 0
  const progressToNext = nextTier
    ? Math.min(100, ((points - prevMin) / (nextTier.min - prevMin)) * 100)
    : 100
  const pointsToNext = nextTier ? nextTier.min - points : 0

  const handleRedeem = (rewardId: string) => {
    setRedeeming(rewardId)
    onRedeem(rewardId)
    setTimeout(() => setRedeeming(null), 2000)
  }

  return (
    <div className="space-y-3">
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
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">
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
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-2 py-1 text-xs text-orange-300">
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

          {/* Toggle rewards button */}
          {rewards.length > 0 && (
            <button
              onClick={() => setShowRewards((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              <Gift className="h-3 w-3 text-sky-400" />
              {showRewards ? 'Ocultar recompensas' : 'Resgatar pontos'}
            </button>
          )}
        </div>
      </div>

      {/* Rewards list */}
      {showRewards && rewards.length > 0 && (
        <div className="space-y-2">
          {rewards.map((r) => (
            <div
              key={r.id}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition ${
                r.affordable
                  ? 'border-sky-500/40 bg-sky-500/5'
                  : 'border-slate-800 bg-slate-900/40 opacity-60'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                r.affordable ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-500'
              }`}>
                {r.affordable ? <Gift className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-white">{r.label}</p>
                <p className="text-[10px] text-slate-500">{r.cost} pts · {r.desc}</p>
              </div>
              <button
                onClick={() => handleRedeem(r.id)}
                disabled={!r.affordable || redeeming === r.id}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                  r.affordable
                    ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                    : 'cursor-not-allowed bg-slate-800 text-slate-500'
                }`}
              >
                {redeeming === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Resgatar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Redeem result toast (inline) */}
      {redeemResult && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
            redeemResult.success
              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {redeemResult.success ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-semibold">{redeemResult.message}</p>
            {redeemResult.success && redeemResult.code && (
              <p className="mt-0.5 text-[10px] text-slate-400">
                Use o cupom <span className="font-mono font-bold text-sky-400">{redeemResult.code}</span> no próximo serviço.
              </p>
            )}
          </div>
          <button onClick={onClearRedeem} className="shrink-0 text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
