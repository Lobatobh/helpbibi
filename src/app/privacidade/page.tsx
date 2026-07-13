import Link from 'next/link'
import { LockKeyhole } from 'lucide-react'
import { PRIVACY_NOTICE_VERSION } from '@/server/consents/consent-versions'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl">
        <header className="border-b border-slate-800 pb-6">
          <Link href="/" className="text-sm text-sky-300 hover:text-sky-200">Help Bibi</Link>
          <div className="mt-4 flex items-start gap-3">
            <LockKeyhole className="mt-1 size-6 shrink-0 text-sky-300" />
            <div>
              <h1 className="text-3xl font-semibold">Política de Privacidade</h1>
              <p className="mt-2 text-sm text-slate-400">Versão {PRIVACY_NOTICE_VERSION} · Vigência em 12 de julho de 2026</p>
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-8 text-sm leading-7 text-slate-300">
          <PrivacySection title="1. Dados tratados">Podemos tratar nome, e-mail, telefone, perfil, veículo e placa do prestador, solicitações, mensagens, avaliações, eventos de segurança e dados técnicos associados ao uso.</PrivacySection>
          <PrivacySection title="2. Finalidades">Os dados são usados para autenticar contas, intermediar atendimentos, realizar matching, manter histórico, permitir suporte, prevenir fraude, proteger a plataforma e cumprir obrigações aplicáveis.</PrivacySection>
          <PrivacySection title="3. Autenticação e segurança">Credenciais são protegidas por hash e sessões assinadas. Controles de acesso restringem dados por papel. Logs devem evitar senhas, tokens, cookies e outros segredos.</PrivacySection>
          <PrivacySection title="4. Localização e tracking">Localização poderá ser usada para localizar prestadores, acompanhar o atendimento e compartilhar tracking durante o período necessário. A ativação real dependerá de consentimento específico e será implementada em fase própria; o cadastro não concede esse consentimento.</PrivacySection>
          <PrivacySection title="5. Compartilhamentos operacionais">Dados estritamente necessários podem ser exibidos entre cliente, prestador e operadores administrativos para executar e dar suporte ao atendimento. Não há integração ativa com Supabase, Mercado Pago real, SMTP, SMS ou WhatsApp.</PrivacySection>
          <PrivacySection title="6. Retenção">Prazos definitivos de retenção ainda dependem de validação de Produto/Legal. Dados devem ser mantidos apenas pelo período necessário às finalidades, segurança, auditoria e obrigações aplicáveis.</PrivacySection>
          <PrivacySection title="7. Direitos do titular">O titular poderá solicitar confirmação, acesso, correção, informação, revogação de consentimento quando aplicável e exclusão, observados requisitos legais e de segurança. O processo e o canal institucional ainda precisam ser formalizados.</PrivacySection>
          <PrivacySection title="8. Atualizações">Mudanças relevantes serão publicadas em nova versão. Quando necessário, a plataforma solicitará novo aceite antes de liberar operações.</PrivacySection>
        </div>

        <section className="mt-8 border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-100">
          <h2 className="font-semibold">Dados institucionais pendentes de validação</h2>
          <p className="mt-2">Controlador, razão social, CNPJ, endereço, encarregado/DPO e canal de contato não foram definidos no projeto. A revisão jurídica e institucional permanece bloqueadora para o piloto.</p>
        </section>

        <footer className="mt-8 flex flex-wrap gap-4 border-t border-slate-800 pt-6 text-sm">
          <Link href="/termos" className="text-sky-300 hover:text-sky-200">Termos de Uso</Link>
          <Link href="/login" className="text-slate-400 hover:text-white">Voltar ao acesso</Link>
        </footer>
      </article>
    </main>
  )
}

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-2">{children}</p></section>
}
