import { warmMemcacheAll } from '../src/lib/services/cache-warmup'
import { warmAssistant } from '../src/app/api/whatsapp/webhook/assistant'

async function run() {
  try {
    const res = await warmMemcacheAll()
    const { ok, results } = res
    console.log('MemCachier warm-up complete. ok =', ok)
    for (const [k, v] of Object.entries(results)) {
      console.log(` - ${k}: ${v.ok ? 'OK' : v.skipped ? 'SKIPPED' : 'FAIL'} - ${v.message}`)
    }

    if ((process.env.WARM_ASSISTANT ?? 'true').toLowerCase() !== 'false') {
      await warmAssistant()
      console.log('Assistant warmed successfully.')
    }
    process.exit(ok ? 0 : 1)
  } catch (e) {
    console.error('Warm-up error:', e)
    process.exit(1)
  }
}

run()
