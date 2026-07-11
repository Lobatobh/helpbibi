import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BadgeCheck, Car, Home, Radio } from 'lucide-react'
import { canAccessRole, getCurrentUserFromCookies, getDefaultPathForRole } from '@/server/auth/session'

export default async function PrestadorPage() {
  const user = await getCurrentUserFromCookies()

  if (!user) {
    redirect('/login?next=/prestador')
  }

  if (!canAccessRole(user, 'PROVIDER')) {
    redirect(getDefaultPathForRole(user.role))
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Area do prestador</p>
            <h1 className="mt-1 text-2xl font-semibold">Ola, {user.name}</h1>
            <p className="mt-1 text-sm text-slate-400">Seu painel real esta sendo preparado para o MVP.</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900"
          >
            <Home className="size-4" />
            Demo publica
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <StatusCard icon={<Car className="size-5" />} label="Perfil" value="PROVIDER" />
          <StatusCard icon={<BadgeCheck className="size-5" />} label="Aprovacao" value="Pendente" />
          <StatusCard icon={<Radio className="size-5" />} label="Disponibilidade" value="Bloqueada" />
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Proximo passo do MVP</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            A disponibilidade real ficara bloqueada ate a etapa de aprovacao administrativa de prestadores.
            A demo publica homologada continua independente deste login.
          </p>
        </section>
      </section>
    </main>
  )
}

function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-3 text-orange-300">
        {icon}
        <span className="text-sm font-medium text-slate-300">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold">{value}</p>
    </div>
  )
}
