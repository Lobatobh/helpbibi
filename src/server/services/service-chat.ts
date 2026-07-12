import { db } from '@/server/db/prisma'
import type { CurrentUser } from '@/server/auth/session'
import {
  ServiceAccessError,
  requireServiceParticipant,
  type ServiceWithParticipants,
} from '@/server/services/service-access'
import { CHAT_MESSAGE_MAX_LENGTH, canSendServiceChat } from '@/server/services/service-status'

export type ServiceChatMessageDto = {
  id: string
  serviceId: string
  from: 'client' | 'provider'
  fromName: string
  text: string
  at: number
}

export class ServiceChatError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function serializeChatMessage(message: {
  id: string
  serviceId: string
  authorRole: string
  authorName: string
  text: string
  createdAt: Date
}): ServiceChatMessageDto {
  return {
    id: message.id,
    serviceId: message.serviceId,
    from: message.authorRole === 'provider' ? 'provider' : 'client',
    fromName: message.authorName,
    text: message.text,
    at: message.createdAt.getTime(),
  }
}

function normalizeChatText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export async function listServiceChatMessages(serviceId: string, user: CurrentUser): Promise<ServiceChatMessageDto[]> {
  const { service } = await requireServiceParticipant(serviceId, user)
  return (service.chatMessages || []).map(serializeChatMessage)
}

export async function createServiceChatMessage(
  serviceId: string,
  user: CurrentUser,
  input: { text: unknown },
): Promise<ServiceChatMessageDto> {
  const text = normalizeChatText(input.text)
  if (!text) throw new ServiceChatError(400, 'Message text is required')
  if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new ServiceChatError(400, `Message text must have at most ${CHAT_MESSAGE_MAX_LENGTH} characters`)
  }

  const { service, participant } = await requireServiceParticipant(serviceId, user)
  if (!canSendServiceChat(service.status)) {
    throw new ServiceChatError(409, 'Chat is closed for this service')
  }

  const created = await db.serviceChatMessage.create({
    data: {
      serviceId: service.id,
      authorRole: participant.role,
      authorName: participant.displayName,
      text,
    },
  })

  return serializeChatMessage(created)
}

export function serviceChatErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof ServiceChatError || error instanceof ServiceAccessError) {
    return { status: error.status, message: error.message }
  }
  return { status: 500, message: 'Unable to process chat message' }
}

export function getServiceParticipantSocketTargets(service: ServiceWithParticipants) {
  return {
    clientUserId: service.clientId,
    providerProfileId: service.providerId || null,
  }
}
