import { db } from '@/server/db/prisma'

export async function getChatMessages(serviceId: string) {
  return db.serviceChatMessage.findMany({
    where: { serviceId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function addChatMessage(data: {
  serviceId: string
  authorRole: 'client' | 'provider'
  authorName: string
  text: string
}) {
  return db.serviceChatMessage.create({
    data: {
      serviceId: data.serviceId,
      authorRole: data.authorRole,
      authorName: data.authorName,
      text: data.text.slice(0, 500),
    },
  })
}
