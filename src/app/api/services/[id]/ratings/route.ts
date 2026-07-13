import { NextRequest, NextResponse } from 'next/server'
import { ConsentRequiredError, requireCurrentConsents } from '@/server/consents/consent-service'
import {
  createServiceRating,
  serviceRatingErrorResponse,
} from '@/server/services/service-ratings'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentConsents(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const result = await createServiceRating(id, user, {
      stars: body?.stars,
      comment: body?.comment,
    })
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) {
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({ message: 'Aceite os documentos vigentes antes de avaliar.', pending: error.pending }, { status: 428 })
    }
    const response = serviceRatingErrorResponse(error)
    return NextResponse.json({ message: response.message }, { status: response.status })
  }
}
