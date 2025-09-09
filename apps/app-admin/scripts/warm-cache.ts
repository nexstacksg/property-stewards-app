import { warmMemcacheAll } from '../src/lib/services/cache-warmup'

async function run() {
  try {
    const res = await warmMemcacheAll()
    const { ok, results } = res
    console.log('MemCachier warm-up complete. ok =', ok)
    for (const [k, v] of Object.entries(results)) {
      console.log(` - ${k}: ${v.ok ? 'OK' : v.skipped ? 'SKIPPED' : 'FAIL'} - ${v.message}`)
    }
    process.exit(ok ? 0 : 1)
  } catch (e) {
    console.error('Warm-up error:', e)
    process.exit(1)
  }
}

run()
