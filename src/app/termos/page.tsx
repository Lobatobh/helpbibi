import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { PROVIDER_OPERATIONAL_VERSION, TERMS_VERSION } from '@/server/consents/consent-versions'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl">
        <header className="border-b border-slate-800 pb-6">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-sky-300 hover:text-sky-200">Help Bibi</Link>
          <div className="mt-4 flex items-start gap-3">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-orange-300" />
            <div>
              <h1 className="text-3xl font-semibold">Termos de Uso</h1>
              <p className="mt-2 text-sm text-slate-400">Versão {TERMS_VERSION} · Vigência em 12 de julho de 2026</p>
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-8 text-sm leading-7 text-slate-300">
          <LegalSection title="1. Natureza da plataforma">
            A Help Bibi é uma plataforma intermediadora para conectar clientes que solicitam assistência veicular e prestadores independentes disponíveis. A plataforma não garante disponibilidade imediata, tempo exato de chegada ou resultado mecânico específico.
          </LegalSection>
          <LegalSection title="2. Conta e acesso">
            O usuário deve fornecer informações verdadeiras, proteger suas credenciais e utilizar somente sua própria conta. Contas podem ser suspensas diante de fraude, risco de segurança, abuso, violação destes termos ou necessidade operacional devidamente registrada.
          </LegalSection>
          <LegalSection title="3. Solicitações e disponibilidade">
            Solicitações dependem de prestadores aprovados, conectados e disponíveis na região do piloto. O cliente deve informar corretamente local, veículo, tipo de problema e destino quando aplicável.
          </LegalSection>
          <LegalSection title="4. Responsabilidades e segurança">
            Cliente e prestador devem agir com segurança, cumprir a legislação de trânsito e evitar qualquer ação que exponha pessoas ou bens a risco. A plataforma não substitui polícia, bombeiros, atendimento médico ou outros serviços de emergência.
          </LegalSection>
          <LegalSection title="5. Cancelamentos">
            Cancelamentos devem informar motivo e podem ser registrados no histórico operacional. Regras comerciais definitivas, multas e reembolsos dependem de validação futura e não estão ativos neste piloto.
          </LegalSection>
          <LegalSection title="6. Pagamento no piloto">
            Os pagamentos exibidos são exclusivamente simulados. Não há cobrança financeira real, estorno financeiro real, split ou repasse ao prestador nesta etapa.
          </LegalSection>
          <LegalSection title="7. Prestadores">
            O cadastro do prestador depende de aprovação administrativa. Disponibilidade não garante ofertas; chamadas podem ser aceitas ou recusadas. Quando a operação com localização for ativada, seu uso ficará limitado à disponibilidade e ao atendimento, mediante consentimento específico. Violações operacionais podem resultar em bloqueio ou suspensão.
          </LegalSection>
          <LegalSection title="8. Suporte e vigência">
            O canal institucional de suporte ainda depende de validação de Produto/Legal. Alterações relevantes gerarão nova versão e novo aceite quando aplicável.
          </LegalSection>
        </div>

        <InstitutionalNotice />
        <footer className="mt-8 flex flex-wrap gap-4 border-t border-slate-800 pt-6 text-sm">
          <Link href="/privacidade" className="inline-flex min-h-11 items-center text-sky-300 hover:text-sky-200">Política de Privacidade</Link>
          <Link href="/login" className="inline-flex min-h-11 items-center text-slate-400 hover:text-white">Voltar ao acesso</Link>
          <span className="text-slate-500">Termos operacionais: {PROVIDER_OPERATIONAL_VERSION}</span>
        </footer>
      </article>
    </main>
  )
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-2">{children}</p></section>
}

function InstitutionalNotice() {
  return (
    <section className="mt-8 border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-100">
      <h2 className="font-semibold">Dados institucionais pendentes de validação</h2>
      <p className="mt-2">Razão social, CNPJ, endereço, controlador, encarregado e canal jurídico não foram definidos no projeto. Este documento mínimo exige revisão e aprovação de Produto/Legal antes do piloto.</p>
    </section>
  )
}
