// Help Bibi — History Repository (FASE 25.3/25.4)
// FASE 25.4: Client NEVER sees platformFee or providerPayout (not in list, not in detail).
//            Provider sees providerPayout but NEVER platformFee.
import { db } from '@/server/db/prisma'
import { resolveHistoryActor, canAccessClientService, canAccessProviderService, getUnauthorizedStatus, getUnauthorizedMessage, type HistoryActor } from '@/server/history/history-auth'

export type HistoryListItem = {
  id: string; type: string; typeLabel: string; status: string; statusLabel: string;
  description: string; pickupLabel: string; destinationLabel: string;
  distanceKm: number; etaMin: number; price: number; originalPrice: number;
  discount: number; promoCode: string | null; paymentMethod: string; paymentStatus: string;
  createdAt: string; acceptedAt: string | null; completedAt: string | null;
  providerName: string | null; providerVehicle: string | null; providerRating: number | null;
  clientName: string | null; clientRatingStars: number | null; clientRatingComment: string | null;
  providerRatingStars: number | null; providerRatingComment: string | null; loyaltyPoints: number;
  latestPayment: {
    id: string; status: string; method: string; amount: number;
    paidAt: string | null; failedAt: string | null; failureReason: string | null;
    createdAt: string; providerPayout?: number;
  } | null;
  providerPayout?: number | null;
}

export type HistoryDetail = HistoryListItem & {
  timeline: Array<{ status: string; label: string; at: string }>;
  breakdownText?: string[];
}

const TYPE_LABELS: Record<string, string> = { REBOQUE: 'Reboque / Guincho', PNEU: 'Troca de Pneu', BATERIA: 'Carga de Bateria', COMBUSTIVEL: 'Combustível', CHAVEIRO: 'Chaveiro', PANE: 'Pane Mecânica' }
const STATUS_LABELS: Record<string, string> = { REQUESTED: 'Procurando prestador', OFFERED: 'Chamada enviada', ACCEPTED: 'Prestador a caminho', PROVIDER_EN_ROUTE: 'Prestador a caminho', ARRIVED: 'Prestador chegou', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', CANCELED: 'Cancelado', EXPIRED: 'Expirado', FAILED: 'Falhou' }

const mapListItem = (s: any, viewerRole: 'CLIENT' | 'PROVIDER'): HistoryListItem => {
  const latestPayment = s.paymentRecords?.[0] || null
  const base: HistoryListItem = {
    id: s.id, type: s.type, typeLabel: TYPE_LABELS[s.type] || s.type,
    status: s.status, statusLabel: STATUS_LABELS[s.status] || s.status,
    description: s.description || '', pickupLabel: s.pickupLabel, destinationLabel: s.destinationLabel,
    distanceKm: s.distanceKm, etaMin: s.etaMin, price: s.price, originalPrice: s.originalPrice,
    discount: s.discount, promoCode: s.promoCode, paymentMethod: s.paymentMethod,
    paymentStatus: latestPayment?.status || s.paymentStatus || 'PENDING', createdAt: s.createdAt.toISOString(),
    acceptedAt: s.acceptedAt?.toISOString() || null, completedAt: s.completedAt?.toISOString() || null,
    providerName: s.provider?.user?.name || null, providerVehicle: s.provider?.vehicle || null,
    providerRating: s.provider?.rating ?? null, clientName: s.client?.name || null,
    clientRatingStars: s.ratings?.find((r: any) => r.targetRole === 'provider')?.stars ?? null,
    clientRatingComment: s.ratings?.find((r: any) => r.targetRole === 'provider')?.comment ?? null,
    providerRatingStars: s.ratings?.find((r: any) => r.targetRole === 'client')?.stars ?? null,
    providerRatingComment: s.ratings?.find((r: any) => r.targetRole === 'client')?.comment ?? null,
    loyaltyPoints: s.loyaltyPoints || 0,
    latestPayment: latestPayment
      ? {
          id: latestPayment.id,
          status: latestPayment.status,
          method: latestPayment.method,
          amount: latestPayment.amount,
          paidAt: latestPayment.paidAt?.toISOString() || null,
          failedAt: latestPayment.failedAt?.toISOString() || null,
          failureReason: latestPayment.failureReason || null,
          createdAt: latestPayment.createdAt.toISOString(),
          ...(viewerRole === 'PROVIDER' ? { providerPayout: latestPayment.providerPayout } : {}),
        }
      : null,
  }
  // FASE 25.4: Provider sees providerPayout; Client NEVER sees platformFee or providerPayout.
  if (viewerRole === 'PROVIDER') base.providerPayout = Math.round(s.price * 0.8 * 100) / 100
  return base
}

const mapDetail = (s: any, viewerRole: 'CLIENT' | 'PROVIDER'): HistoryDetail => {
  const item = mapListItem(s, viewerRole)
  const detail: HistoryDetail = { ...item, timeline: (s.timeline || []).map((ev: any) => ({ status: ev.status, label: ev.label, at: ev.createdAt.toISOString() })) }
  // FASE 25.4: Client detail — NO platformFee, NO providerPayout. Just total + discount.
  if (viewerRole === 'CLIENT') {
    detail.breakdownText = [`Total: R$ ${s.price.toFixed(2).replace('.', ',')}`]
    if (s.discount > 0) detail.breakdownText.unshift(`Desconto: -R$ ${s.discount.toFixed(2).replace('.', ',')}`)
  } else if (viewerRole === 'PROVIDER') {
    // Provider detail: providerPayout (already in item), NO platformFee
    detail.breakdownText = [`Total: R$ ${s.price.toFixed(2).replace('.', ',')}`, `Seu repasse (80%): R$ ${(s.price * 0.8).toFixed(2).replace('.', ',')}`]
  }
  return detail
}

export type AuthResult = { ok: true; actor: HistoryActor } | { ok: false; status: number; message: string }

export function authorizeHistoryRequest(params: {
  sessionUser: { id: string; role: string } | null; queryDbUserId: string | null;
  expectedRole: 'CLIENT' | 'PROVIDER'; nodeEnv: string | undefined;
}): AuthResult {
  const actor = resolveHistoryActor(params.sessionUser, params.queryDbUserId, params.expectedRole, params.nodeEnv)
  if (!actor) return { ok: false, status: 401, message: 'Authentication required' }
  return { ok: true, actor }
}

export async function getClientServices(actor: HistoryActor, limit: number = 50): Promise<HistoryListItem[]> {
  if (actor.role !== 'CLIENT') return []
  const services = await db.serviceRequest.findMany({ where: { clientId: actor.userId }, include: { provider: { include: { user: true } }, client: true, ratings: true, paymentRecords: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: limit })
  return services.map((s) => mapListItem(s, 'CLIENT'))
}

export async function getClientServiceDetail(actor: HistoryActor, serviceId: string): Promise<{ status: number; data: HistoryDetail | { message: string } }> {
  if (actor.role !== 'CLIENT') return { status: getUnauthorizedStatus(), data: { message: getUnauthorizedMessage() } }
  const svc = await db.serviceRequest.findUnique({ where: { id: serviceId }, include: { provider: { include: { user: true } }, client: true, ratings: true, timeline: { orderBy: { createdAt: 'asc' } }, paymentRecords: { orderBy: { createdAt: 'desc' }, take: 1 } } })
  if (!svc) return { status: 404, data: { message: getUnauthorizedMessage() } }
  if (!canAccessClientService(actor, { id: svc.id, clientId: svc.clientId, providerId: svc.providerId })) return { status: getUnauthorizedStatus(), data: { message: getUnauthorizedMessage() } }
  return { status: 200, data: mapDetail(svc, 'CLIENT') }
}

export async function getProviderServices(actor: HistoryActor, actorProviderProfileId: string | null, limit: number = 50): Promise<HistoryListItem[]> {
  if (actor.role !== 'PROVIDER' || !actorProviderProfileId) return []
  const services = await db.serviceRequest.findMany({ where: { providerId: actorProviderProfileId }, include: { provider: { include: { user: true } }, client: true, ratings: true, paymentRecords: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: limit })
  return services.map((s) => mapListItem(s, 'PROVIDER'))
}

export async function getProviderServiceDetail(actor: HistoryActor, actorProviderProfileId: string | null, serviceId: string): Promise<{ status: number; data: HistoryDetail | { message: string } }> {
  if (actor.role !== 'PROVIDER') return { status: getUnauthorizedStatus(), data: { message: getUnauthorizedMessage() } }
  const svc = await db.serviceRequest.findUnique({ where: { id: serviceId }, include: { provider: { include: { user: true } }, client: true, ratings: true, timeline: { orderBy: { createdAt: 'asc' } }, paymentRecords: { orderBy: { createdAt: 'desc' }, take: 1 } } })
  if (!svc) return { status: 404, data: { message: getUnauthorizedMessage() } }
  if (!canAccessProviderService(actor, { id: svc.id, clientId: svc.clientId, providerId: svc.providerId }, actorProviderProfileId)) return { status: getUnauthorizedStatus(), data: { message: getUnauthorizedMessage() } }
  return { status: 200, data: mapDetail(svc, 'PROVIDER') }
}

export { resolveHistoryActor, canAccessClientService, canAccessProviderService }
