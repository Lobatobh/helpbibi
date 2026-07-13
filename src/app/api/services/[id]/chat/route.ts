import { NextRequest, NextResponse } from 'next/server'
import { ConsentRequiredError, requireCurrentConsents } from '@/server/consents/consent-service'
import {
  createServiceChatMessage,
  listServiceChatMessages,
  serviceChatErrorResponse,
} from '@/server/services/service-chat'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentConsents(req)
    const { id } = await params
    const messages = await listServiceChatMessages(id, user)
    return NextResponse.json({ messages, count: messages.length })
  } catch (error) {
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({ message: 'Aceite os documentos vigentes antes de usar o chat.', pending: error.pending }, { status: 428 })
    }
    const response = serviceChatErrorResponse(error)
    return NextResponse.json({ message: response.message }, { status: response.status })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentConsents(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const message = await createServiceChatMessage(id, user, { text: body?.text })
    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({ message: 'Aceite os documentos vigentes antes de usar o chat.', pending: error.pending }, { status: 428 })
    }
    const response = serviceChatErrorResponse(error)
    return NextResponse.json({ message: response.message }, { status: response.status })
  }
}
