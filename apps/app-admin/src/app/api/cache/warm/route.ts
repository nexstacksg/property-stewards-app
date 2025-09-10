import { NextRequest, NextResponse } from 'next/server'
import { warmMemcacheAll } from '@/lib/services/cache-warmup'

export async function POST(_req: NextRequest) {
  const result = await warmMemcacheAll()
  const status = result.ok ? 200 : 500
  return NextResponse.json(result, { status })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
