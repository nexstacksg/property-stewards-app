import type { ReadonlyURLSearchParams } from 'next/navigation'
import { confirmUserByToken } from '@/lib/auth-confirmation'
import { ConfirmRedirect } from '@/components/confirm-redirect'

export const dynamic = 'force-dynamic'

type PageSearchParams =
  | URLSearchParams
  | ReadonlyURLSearchParams
  | Record<string, string | string[] | undefined>

type ConfirmPageProps = {
  searchParams?: PageSearchParams | Promise<PageSearchParams | undefined>
}

function isSearchParamsLike(value: PageSearchParams): value is URLSearchParams | ReadonlyURLSearchParams {
  return typeof (value as URLSearchParams).get === 'function'
}

function extractToken(params: PageSearchParams | undefined): string | undefined {
  if (!params) {
    return undefined
  }

  if (isSearchParamsLike(params)) {
    return params.get('token') ?? undefined
  }

  const token = (params as Record<string, string | string[] | undefined>).token
  if (Array.isArray(token)) {
    return token[0]
  }

  return token
}

function previewToken(token?: string): string | undefined {
  if (!token) return undefined
  if (token.length <= 12) return token
  return `${token.slice(0, 6)}…${token.slice(-6)}`
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const resolvedParams = await Promise.resolve(searchParams)
  const token = extractToken(resolvedParams)
  const result = await confirmUserByToken(token)

  const map: Record<string, string> = {
    success: 'success',
    invalid: 'invalid',
    'missing-user': 'missing-user',
    'config-error': 'server-error',
    'missing-token': 'invalid',
    'email-error': 'server-error',
  }

  const status = map[result] ?? 'invalid'
  return (
    <ConfirmRedirect
      status={status}
      debug={{ rawResult: result, token: previewToken(token) }}
    />
  )
}

