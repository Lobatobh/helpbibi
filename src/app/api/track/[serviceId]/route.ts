import { NextResponse } from 'next/server'

// Compatibility tombstone: ServiceRequest.id is never a public tracking credential.
export async function GET() {
  return NextResponse.json(
    { available: false, message: 'Rastreamento indisponivel ou encerrado.' },
    { status: 404 },
  )
}
