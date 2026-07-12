import type { ServiceStatus } from '@prisma/client'

export const ACTIVE_SERVICE_STATUSES: ServiceStatus[] = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'PROVIDER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
]

export const TERMINAL_SERVICE_STATUSES: ServiceStatus[] = [
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
  'FAILED',
]

export const CHAT_MESSAGE_MAX_LENGTH = 500
export const RATING_COMMENT_MAX_LENGTH = 240

export function isActiveServiceStatus(status: ServiceStatus | string): boolean {
  return ACTIVE_SERVICE_STATUSES.includes(status as ServiceStatus)
}

export function isTerminalServiceStatus(status: ServiceStatus | string): boolean {
  return TERMINAL_SERVICE_STATUSES.includes(status as ServiceStatus)
}

export function canSendServiceChat(status: ServiceStatus | string): boolean {
  return !isTerminalServiceStatus(status)
}

export function canRateService(status: ServiceStatus | string): boolean {
  return status === 'COMPLETED'
}
