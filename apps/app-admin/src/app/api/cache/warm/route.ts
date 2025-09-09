import { NextRequest, NextResponse } from 'next/server'
import { warmMemcacheAll } from '@/lib/services/cache-warmup'

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.CACHE_WARMUP_TOKEN || process.env.MEMCACHIER_WARMUP_TOKEN
  if (!token) return false

  const auth = req.headers.get('authorization') || ''
  const apiKey = req.headers.get('x-api-key') || ''
  const url = new URL(req.url)
  const qToken = url.searchParams.get('token') || ''

  if (auth.startsWith('Bearer ') && auth.slice(7) === token) return true
  if (apiKey === token) return true
  if (qToken === token) return true
  return false
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await warmMemcacheAll()
  const status = result.ok ? 200 : 500
  return NextResponse.json(result, { status })
}

export async function GET(req: NextRequest) {
  // Allow GET for manual checks with the same auth
  return POST(req)
}

