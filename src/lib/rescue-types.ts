// Shared types for the SocorroJá rescue platform

export type Role = 'client' | 'provider'

export type LatLng = { lat: number; lng: number }

export type ServiceType = 'reboque' | 'pneu' | 'bateria' | 'combustivel' | 'chaveiro' | 'pane'

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
}

export type ProviderState = ProviderPublic & {
  plate: string
  currentServiceId?: string | null
}

export type TimelineEvent = {
  status: ServiceStatus
  label: string
  at: number
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
  destination: LatLng
  destinationLabel: string
  price: number
  distanceKm: number
  etaMin: number
  status: ServiceStatus
  providerId?: string | null
  provider: ProviderState | null
  createdAt: number
  acceptedAt?: number | null
  completedAt?: number | null
  timeline: TimelineEvent[]
}

export const SERVICE_TYPES: { id: ServiceType; label: string; desc: string; base: number; icon: string }[] = [
  { id: 'reboque', label: 'Reboque / Guincho', desc: 'Veículo não pode andar', base: 180, icon: 'tow-truck' },
  { id: 'pneu', label: 'Troca de Pneu', desc: 'Furou ou rasgou', base: 90, icon: 'tire' },
  { id: 'bateria', label: 'Carga de Bateria', desc: 'Bateria arriou', base: 70, icon: 'battery' },
  { id: 'combustivel', label: 'Combustível', desc: 'Pane seca', base: 60, icon: 'fuel' },
  { id: 'chaveiro', label: 'Chaveiro', desc: 'Trancou as chaves', base: 120, icon: 'key' },
  { id: 'pane', label: 'Pane Mecânica', desc: 'Outro problema', base: 110, icon: 'wrench' },
]

export const STATUS_LABELS: Record<ServiceStatus, { label: string; color: string }> = {
  searching: { label: 'Procurando prestador', color: 'amber' },
  offered: { label: 'Chamada enviada', color: 'amber' },
  accepted: { label: 'Prestador a caminho', color: 'emerald' },
  arriving: { label: 'Chegando no local', color: 'emerald' },
  arrived: { label: 'No local do atendimento', color: 'emerald' },
  in_progress: { label: 'Serviço em andamento', color: 'sky' },
  completed: { label: 'Concluído', color: 'emerald' },
  cancelled: { label: 'Cancelado', color: 'rose' },
  expired: { label: 'Sem prestadores', color: 'rose' },
}
