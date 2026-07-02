import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/server/repositories/payment.repository'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-helpbibi-signature') || req.headers.get('x-signature') || ''
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => { headers[k] = v })
    const result = await processWebhook(rawBody, signature, headers)
    if (result.processed) return NextResponse.json({ ok: true, message: result.reason, recordId: result.recordId })
    return NextResponse.json({ ok: false, message: result.reason, recordId: result.recordId }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || 'Webhook error' }, { status: 500 })
  }
}
