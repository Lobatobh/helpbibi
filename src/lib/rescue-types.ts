// Shared types for the Help Bibi rescue platform

export type Role = 'client' | 'provider'

export type LatLng = { lat: number; lng: number }

export type ServiceType = 'reboque' | 'pneu' | 'bateria' | 'combustivel' | 'chaveiro' | 'pane'

export type PaymentMethod = 'pix' | 'card' | 'cash'

export type ServiceStatus =
  | 'searching'
  | 'offered'
  | 'accepted'
  | 'arriving'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'

export type ProviderPublic = {
  id: string
  name: string
  vehicle: string
  rating: number
  position: LatLng
  online: boolean
  completedCount: number
}

export type ProviderState = ProviderPublic & {
  plate: string
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | string
  canOperate?: boolean
  currentServiceId?: string | null
  tripStartPos?: LatLng | null
  tripTarget?: LatLng | null
  tripStartedAt?: number | null
  tripTotalKm?: number
}

export type LoyaltyInfo = {
  points: number
  tier: { name: string; color: string; perk: string }
  nextTierMin: number | null
  earnedThisService?: number
  tierUpgraded?: boolean
}

export type LoyaltyReward = {
  id: string
  cost: number
  code: string
  type: 'percent' | 'fixed'
  value: number
  label: string
  desc: string
  affordable: boolean
}

export type RedeemResult = {
  success: boolean
  code?: string
  label?: string
  pointsSpent?: number
  pointsRemaining?: number
  message: string
}

export type TimelineEvent = {
  status: ServiceStatus
  label: string
  at: number
}

export type Rating = {
  stars: number
  comment: string
  at: number
  from: string
}

export type ChatMessage = {
  id: string
  serviceId: string
  from: 'client' | 'provider'
  fromName: string
  text: string
  at: number
}

export type PromoResult = {
  valid: boolean
  code: string
  label?: string
  type?: 'percent' | 'fixed'
  value?: number
  originalPrice?: number
  discount?: number
  finalPrice?: number
  message: string
}

export type ServiceData = {
  id: string
  clientId: string
  clientName: string
  type: ServiceType
  typeLabel: string
  icon: string
  description: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng | null
  destinationLabel: string
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  distanceKm: number
  etaMin: number
  status: ServiceStatus
  paymentMethod: PaymentMethod
  providerId?: string | null
  notifiedProviderIds: string[]
  notifiedCount: number
  provider: ProviderState | null
  createdAt: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline: TimelineEvent[]
  rating?: Rating | null
  clientRating?: Rating | null
  loyaltyPoints: number
}

// History record persisted in localStorage
export type ServiceRecord = {
  id: string
  role: Role
  type: ServiceType
  typeLabel: string
  icon: string
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  distanceKm: number
  paymentMethod: PaymentMethod
  pickupLabel: string
  destinationLabel: string
  counterpartName: string
  status: ServiceStatus
  description: string
  timeline: TimelineEvent[]
  createdAt: number
  completedAt: number
  rating?: { stars: number; comment: string } | null
  clientRating?: { stars: number; comment: string } | null
}

export const SERVICE_TYPES: { id: ServiceType; label: string; desc: string; base: number; icon: string }[] = [
  { id: 'reboque', label: 'Reboque / Guincho', desc: 'Veículo não pode andar', base: 180, icon: 'tow-truck' },
  { id: 'pneu', label: 'Troca de Pneu', desc: 'Furou ou rasgou', base: 90, icon: 'tire' },
  { id: 'bateria', label: 'Carga de Bateria', desc: 'Bateria arriou', base: 70, icon: 'battery' },
  { id: 'combustivel', label: 'Combustível', desc: 'Pane seca', base: 60, icon: 'fuel' },
  { id: 'chaveiro', label: 'Chaveiro', desc: 'Trancou as chaves', base: 120, icon: 'key' },
  { id: 'pane', label: 'Pane Mecânica', desc: 'Outro problema', base: 110, icon: 'wrench' },
]

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string; icon: string }[] = [
  { id: 'pix', label: 'PIX', desc: 'Aprovação na hora', icon: 'zap' },
  { id: 'card', label: 'Cartão', desc: 'Crédito ou débito', icon: 'credit-card' },
  { id: 'cash', label: 'Dinheiro', desc: 'Na entrega', icon: 'wallet' },
]

export const STATUS_LABELS: Record<ServiceStatus, { label: string; color: string }> = {
  searching: { label: 'Procurando prestador', color: 'sky' },
  offered: { label: 'Chamada enviada', color: 'sky' },
  accepted: { label: 'Prestador a caminho', color: 'orange' },
  arriving: { label: 'Chegando no local', color: 'orange' },
  arrived: { label: 'No local do atendimento', color: 'orange' },
  in_progress: { label: 'Serviço em andamento', color: 'sky' },
  completed: { label: 'Concluído', color: 'orange' },
  cancelled: { label: 'Cancelado', color: 'rose' },
  expired: { label: 'Sem prestadores', color: 'rose' },
}
