# Redis Setup Guide

## Quick Setup with Upstash (Recommended)

1. **Create Upstash Account**
   - Go to https://console.upstash.com
   - Sign up with GitHub/Google/Email
   
2. **Create Redis Database**
   - Click "Create Database"
   - Name: `property-stewards-redis`
   - Type: Regional
   - Region: Choose closest to your Vercel deployment (e.g., `us-west-1` for US West)
   - Enable "Eviction" (recommended for caching)
   - Click "Create"

3. **Get Connection Details**
   - In the database dashboard, find the "REST API" section
   - Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   
   OR for standard Redis connection:
   - Go to "Details" tab
   - Copy the "Redis URL" (starts with `redis://` or `rediss://`)

4. **Add to Vercel Environment Variables**
   ```bash
   # Go to your Vercel project dashboard
   # Settings → Environment Variables
   # Add:
   REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:PORT
   ```

5. **Alternative: Use Vercel Integration**
   - Go to Vercel Dashboard → Integrations
   - Search for "Upstash"
   - Install and it will automatically add environment variables

## Using Upstash with @upstash/redis (Alternative SDK)

If you prefer to use Upstash's SDK (which works over HTTP and is edge-compatible):

```bash
pnpm add @upstash/redis
```

Then modify redis-cache.ts to use:
```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

## Environment Variables Needed

Add to your `.env.local` for local development:
```env
REDIS_URL=redis://localhost:6379
```

Add to Vercel for production:
```env
REDIS_URL=rediss://default:password@endpoint.upstash.io:port
```

## Test Redis Connection

After setup, test with:
```bash
# Deploy to Vercel
git add .
git commit -m "Add Redis caching"
git push

# Check Vercel logs for:
# "✅ Redis Client Connected" (if Redis is configured)
# "⚠️ Redis not configured - caching disabled" (if not configured)
```

## Benefits of Redis Caching

- ⚡ 10-100x faster response times for cached data
- 💰 Reduced database load and costs
- 🚀 Better user experience with instant responses
- 📊 Cached inspector data, work orders, and locations

## Monitoring

In Upstash dashboard, you can monitor:
- Commands per second
- Memory usage
- Hit/miss ratio
- Latency metrics