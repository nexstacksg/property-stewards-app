import { redirect } from 'next/navigation'
import { confirmUserByToken } from '@/lib/auth-confirmation'

export const dynamic = 'force-dynamic'

type ConfirmPageProps = {
  searchParams: {
    token?: string
  }
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const result = await confirmUserByToken(searchParams.token)

  const map: Record<string, string> = {
    success: 'success',
    invalid: 'invalid',
    'missing-user': 'missing-user',
    'config-error': 'server-error',
    'missing-token': 'invalid',
  }

  const status = map[result] ?? 'invalid'
  redirect(`/login?confirmation=${status}`)
}

