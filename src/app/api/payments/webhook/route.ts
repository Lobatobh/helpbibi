import { NextResponse } from 'next/server'

const RETIRED_WEBHOOK_MESSAGE =
  'Generic payment webhook retired. Use the explicitly configured provider endpoint.'

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: 'GENERIC_PAYMENT_WEBHOOK_RETIRED',
      message: RETIRED_WEBHOOK_MESSAGE,
    },
    { status: 410 },
  )
}
