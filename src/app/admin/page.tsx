'use client'

// Help Bibi — Admin Console (FASE 27-B)
// /admin route — client component.
//
// Flow:
//   1. On mount, GET /api/auth/me.
//        - If ADMIN: load dashboard (fetch payments summary + audit events).
//        - If not ADMIN: show "Acesso negado" + login form.
//        - If not authenticated: show login form.
//   2. Login form posts to /api/admin/login (dev seed: admin@helpbibi.local / Admin123!).
//   3. On success, re-fetch /api/auth/me and reload dashboard.
//   4. Logout posts to /api/auth/logout, clears user state.

import { useCallback, useEffect, useState } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  LogIn,
  Wallet,
  Users,
  LayoutDashboard,
  ClipboardList,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// ─── Types ──────────────────────────────────────────────────────────────────

type AdminUser = { id: string; role: string; name: string }

type PaymentRow = {
  id: string
  serviceRequestId: string
  method: string
  status: string
  amount: number
  platformFee: number
  providerPayout: number
  createdAt: string
}

type PaymentsResponse = {
  payments: PaymentRow[]
  count: number
  summary: {
    total: number
    totalAmount: number
    totalPlatformFee: number
    totalProviderPayout: number
    byStatus: Record<string, number>
  }
}

type AuditEntry = {
  event: string
  context: {
    actor?: string
    actorRole?: string
    ip?: string
    route?: string
    target?: string
    severity?: string
    metadata?: Record<string, unknown>
  }
  at: string
}

type AuditResponse = {
  events: AuditEntry[]
  count: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  // Values are stored in BRL cents (Int) on the DB, but PaymentRecord uses Float
  // reais — treat as reais and format accordingly.
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function severityVariant(severity?: string): {
  className: string
  label: string
} {
  switch (severity) {
    case 'error':
      return {
        className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900',
        label: 'erro',
      }
    case 'warning':
      return {
        className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
        label: 'aviso',
      }
    default:
      return {
        className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        label: 'info',
      }
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
    case 'AUTHORIZED':
      return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900'
    case 'PENDING':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
    case 'FAILED':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
    case 'CANCELED':
      return 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    case 'REFUNDED':
      return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [payments, setPayments] = useState<PaymentsResponse | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEntry[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  // Check session on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data?.user) {
            setUser(data.user as AdminUser)
          }
        }
      } catch {
        // ignore — user is null, show login form
      } finally {
        if (!cancelled) {
          setAuthChecked(true)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load dashboard data when admin
  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const [payRes, auditRes] = await Promise.allSettled([
        fetch('/api/admin/payments', { credentials: 'include' }),
        fetch('/api/admin/audit', { credentials: 'include' }),
      ])

      if (payRes.status === 'fulfilled' && payRes.value.ok) {
        const payData = (await payRes.value.json()) as PaymentsResponse
        setPayments(payData)
      } else if (payRes.status === 'fulfilled') {
        setDashboardError(
          `Falha ao carregar pagamentos (HTTP ${payRes.value.status})`
        )
      }

      if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
        const auditData = (await auditRes.value.json()) as AuditResponse
        setAuditEvents(auditData.events || [])
      }
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      void loadDashboard()
    }
  }, [user, loadDashboard])

  // Login submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoginError(data?.message || 'Credenciais inválidas')
        return
      }
      // Re-check session to load the real user
      const meRes = await fetch('/api/auth/me', { credentials: 'include' })
      if (meRes.ok) {
        const meData = await meRes.json()
        if (meData?.user) {
          setUser(meData.user as AdminUser)
          setEmail('')
          setPassword('')
        }
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Erro de rede')
    } finally {
      setLoggingIn(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // ignore
    }
    setUser(null)
    setPayments(null)
    setAuditEvents([])
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading || !authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="size-5 animate-spin" />
          <span>Verificando sessão…</span>
        </div>
      </div>
    )
  }

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <Shield className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight sm:text-lg">
                Help Bibi Admin
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Painel administrativo
              </p>
            </div>
          </div>
          {isAdmin && user && (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bem-vindo, Admin
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <ShieldCheck className="size-3" />
                ADMIN
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {!isAdmin ? (
          // ─── Login form / Access denied ───
          <div className="mx-auto max-w-md">
            {user && user.role !== 'ADMIN' ? (
              <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
                <CardContent className="flex items-start gap-3 pt-6">
                  <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Acesso negado
                    </p>
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      Sua sessão atual ({user.role}) não tem permissão de
                      administrador. Faça login como admin abaixo.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                    <LogIn className="size-4" />
                  </div>
                  <div>
                    <CardTitle>Entrar como Admin</CardTitle>
                    <CardDescription>
                      Acesso restrito ao painel administrativo.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@helpbibi.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loggingIn}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loggingIn}
                    />
                  </div>

                  {loginError && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full gap-2 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                    disabled={loggingIn}
                  >
                    {loggingIn ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Entrando…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        Entrar como Admin
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                    Em desenvolvimento use{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">
                      admin@helpbibi.local
                    </code>{' '}
                    /{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">
                      Admin123!
                    </code>
                    <br />
                    (requer <code className="text-[11px]">ADMIN_SEED_ENABLED=true</code>)
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          // ─── Admin dashboard ───
          <div className="space-y-6">
            {/* Welcome banner */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    Bem-vindo, Admin
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Visão geral financeira e trilha de auditoria da plataforma.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
                >
                  <CheckCircle2 className="size-3" />
                  Sessão ativa
                </Badge>
              </div>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <QuickLinkCard
                icon={<Wallet className="size-5" />}
                title="Financeiro"
                description="Resumo de pagamentos e taxas"
                href="/api/admin/payments"
                accent="emerald"
              />
              <QuickLinkCard
                icon={<ClipboardList className="size-5" />}
                title="Servicos"
                description="Tracking operacional"
                href="/admin/services"
                accent="slate"
              />
              <QuickLinkCard
                icon={<Users className="size-5" />}
                title="Prestadores"
                description="Aprovação e verificação"
                href="/admin/providers"
                accent="slate"
              />
              <QuickLinkCard
                icon={<LayoutDashboard className="size-5" />}
                title="Dashboard"
                description="Métricas em tempo real"
                href="#dashboard"
                accent="slate"
              />
            </div>

            {dashboardError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>{dashboardError}</span>
              </div>
            )}

            {/* Financial summary + Audit */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              {/* Financial summary */}
              <Card className="lg:col-span-3">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="size-5 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <CardTitle>Resumo Financeiro</CardTitle>
                        <CardDescription>
                          Pagamentos registrados na plataforma
                        </CardDescription>
                      </div>
                    </div>
                    {dashboardLoading && (
                      <Loader2 className="size-4 animate-spin text-slate-400" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!payments && !dashboardLoading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Nenhum dado financeiro disponível.
                    </p>
                  ) : !payments ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800"
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <MetricCard
                          label="Total de pagamentos"
                          value={String(payments.summary.total)}
                          sub="registros"
                          tone="slate"
                        />
                        <MetricCard
                          label="Taxa da plataforma"
                          value={formatCurrency(payments.summary.totalPlatformFee)}
                          sub="receita"
                          tone="emerald"
                        />
                        <MetricCard
                          label="Repasse prestadores"
                          value={formatCurrency(payments.summary.totalProviderPayout)}
                          sub="pago"
                          tone="slate"
                        />
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Por status
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Volume total:{' '}
                            {formatCurrency(payments.summary.totalAmount)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {Object.entries(payments.summary.byStatus || {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([status, count]) => (
                              <div
                                key={status}
                                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                              >
                                <Badge
                                  variant="outline"
                                  className={statusBadgeClass(status)}
                                >
                                  {status}
                                </Badge>
                                <span className="text-sm font-semibold tabular-nums">
                                  {count}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Recent payments list */}
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          Pagamentos recentes
                        </p>
                        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2 font-medium">Status</th>
                                <th className="px-3 py-2 font-medium">Método</th>
                                <th className="px-3 py-2 text-right font-medium">
                                  Valor
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                  Taxa
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {payments.payments.slice(0, 15).map((p) => (
                                <tr
                                  key={p.id}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                  <td className="px-3 py-2">
                                    <Badge
                                      variant="outline"
                                      className={statusBadgeClass(p.status)}
                                    >
                                      {p.status}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                    {p.method}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatCurrency(p.amount)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                                    {formatCurrency(p.platformFee)}
                                  </td>
                                </tr>
                              ))}
                              {payments.payments.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-3 py-8 text-center text-slate-400"
                                  >
                                    Nenhum pagamento registrado ainda.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Audit events */}
              <Card className="lg:col-span-2" id="dashboard">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="size-5 text-slate-600 dark:text-slate-400" />
                      <div>
                        <CardTitle>Auditoria recente</CardTitle>
                        <CardDescription>
                          Últimos {Math.min(20, auditEvents.length)} eventos
                        </CardDescription>
                      </div>
                    </div>
                    {dashboardLoading && (
                      <Loader2 className="size-4 animate-spin text-slate-400" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {auditEvents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {dashboardLoading
                        ? 'Carregando…'
                        : 'Nenhum evento de auditoria registrado.'}
                    </p>
                  ) : (
                    <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {auditEvents
                        .slice(-20)
                        .reverse()
                        .map((entry, idx) => {
                          const sev = severityVariant(entry.context.severity)
                          return (
                            <li
                              key={`${entry.at}-${idx}`}
                              className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                                  {entry.event}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={sev.className}
                                >
                                  {sev.label}
                                </Badge>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3" />
                                  {entry.context.actor || 'anonymous'}
                                  {entry.context.actorRole
                                    ? ` · ${entry.context.actorRole}`
                                    : ''}
                                </span>
                                {entry.context.route && (
                                  <span className="inline-flex items-center gap-1">
                                    <ArrowRight className="size-3" />
                                    <code className="text-[11px]">
                                      {entry.context.route}
                                    </code>
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {formatTimestamp(entry.at)}
                                </span>
                              </div>
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:px-6">
          Help Bibi Admin · Painel administrativo · FASE 27
        </div>
      </footer>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function QuickLinkCard({
  icon,
  title,
  description,
  href,
  accent,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  accent: 'emerald' | 'slate'
}) {
  const accentClass =
    accent === 'emerald'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <a
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accentClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'slate' | 'emerald'
}) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>
    </div>
  )
}
