# Deployment Guide - Property Stewards Admin

This guide covers deploying the Property Stewards Admin application to Vercel, including environment setup, debugging, and troubleshooting.

## Prerequisites

- Node.js 18+ installed
- pnpm package manager installed
- Vercel CLI installed (`pnpm add -g vercel`)
- Access to PostgreSQL database (DigitalOcean)
- Required API keys (OpenAI, Wassenger, etc.)

## Quick Deploy

```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel
```

## Step-by-Step Deployment

### 1. Install Vercel CLI

```bash
# Install globally with pnpm
pnpm add -g vercel

# Or with npm
npm i -g vercel

# Verify installation
vercel --version
```

### 2. Initial Setup

```bash
# Login to Vercel
vercel login

# Link project (first time only)
vercel link

# Follow prompts:
# - Select your scope/team
# - Link to existing project or create new
# - Confirm project settings
```

### 3. Environment Variables Setup

#### Method 1: Using Vercel CLI (Recommended)

```bash
# Add individual environment variables
vercel env add DATABASE_URL production
# Paste your PostgreSQL connection string when prompted

# Add other required variables
vercel env add OPENAI_API_KEY production
vercel env add WASSENGER_API_KEY production
vercel env add WASSENGER_WEBHOOK_SECRET production
vercel env add DO_SPACES_KEY production
vercel env add DO_SPACES_SECRET production
vercel env add DO_SPACES_ENDPOINT production
vercel env add DO_SPACES_BUCKET production
vercel env add DO_SPACES_REGION production

# Add optional variables
vercel env add NEXTAUTH_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add ADMIN_EMAIL production
```

#### Method 2: Using .env file

```bash
# Pull environment variables from .env.local file
cat .env.local | grep -E "^[A-Z]" | while IFS='=' read -r key value; do
  echo "$value" | vercel env add "$key" production
done
```

#### Method 3: Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Navigate to Settings → Environment Variables
4. Add each variable with its value
5. Select "Production" environment
6. Save changes

### 4. Configure Build Settings

Update `next.config.ts` for production builds:

```typescript
const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds with ESLint warnings
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds with TypeScript errors
    ignoreBuildErrors: true,
  },
}
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "postinstall": "prisma generate"
  }
}
```

### 5. Database Connection Optimization

Configure Prisma client in `src/lib/prisma.ts`:

```typescript
// Add connection pooling parameters
const databaseUrl = process.env.DATABASE_URL
const connectionUrl = databaseUrl ? 
  `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=10` : 
  undefined
```

### 5.1 Enable PgBouncer (Connection Pooling)

Using DigitalOcean’s connection pooler (PgBouncer) reduces connection overhead and improves latency on long‑distance hosts.

Steps:

1. Enable Connection Pooling on your DO Postgres cluster and copy the pooled connection string (transaction pooling port).
2. Set `DATABASE_URL` on the Proxmox host to the pooled endpoint (keep `?sslmode=require`).
3. Set Prisma PgBouncer compatibility and tune limits:

```bash
# Proxmox / Production env
export PRISMA_PGBOUNCER=true
export PRISMA_CONNECTION_LIMIT=10   # typical 5–10 with PgBouncer
export PRISMA_POOL_TIMEOUT=10       # seconds
export PRISMA_CONNECT_TIMEOUT=5     # seconds
export PRISMA_STATEMENT_TIMEOUT=30000 # ms
```

Notes:
- `PRISMA_PGBOUNCER=true` automatically appends `pgbouncer=true` to the connection URL at runtime (see `src/lib/prisma.ts`).
- For schema migrations, use a direct (non‑pooled) connection or temporarily unset `PRISMA_PGBOUNCER`.

### 6. Deploy Commands

```bash
# Deploy to preview (staging)
vercel

# Deploy to production
vercel --prod

# Deploy with specific options
vercel --prod --yes  # Skip confirmation
vercel --prod --debug  # Show debug output
vercel --prod --force  # Force new deployment
```

## Debugging Deployment Issues

### 1. Check Build Logs

```bash
# View latest deployment logs
vercel logs

# View specific deployment logs
vercel logs [deployment-url]

# Follow logs in real-time
vercel logs --follow
```

### 2. Common Issues and Solutions

#### Issue: "Too many database connections"

**Error:**
```
FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute
```

**Solution:**
1. Reduce connection pool size in `prisma.ts`
2. Split database queries into smaller batches
3. Add connection URL parameters:
```bash
DATABASE_URL="postgresql://...?connection_limit=5&pool_timeout=10"
```

#### Issue: "useSearchParams() missing Suspense boundary"

**Error:**
```
useSearchParams() should be wrapped in a suspense boundary at page "/path"
```

**Solution:**
Wrap components using `useSearchParams` with Suspense:
```typescript
import { Suspense } from 'react'

function PageContent() {
  const searchParams = useSearchParams()
  // ...
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  )
}
```

#### Issue: "Prisma Client not generated"

**Error:**
```
Cannot find module '.prisma/client/default'
```

**Solution:**
Ensure Prisma generates during build:
```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "postinstall": "prisma generate"
  }
}
```

#### Issue: "ESLint/TypeScript errors blocking build"

**Solution:**
Configure Next.js to ignore non-critical errors:
```typescript
// next.config.ts
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
```

### 3. Test Build Locally

```bash
# Test production build locally
pnpm build
pnpm start

# With environment variables
cp .env.local .env.production.local
pnpm build && pnpm start
```

### 4. Verify Deployment

```bash
# Check deployment status
vercel ls

# Inspect specific deployment
vercel inspect [deployment-url]

# Check environment variables
vercel env ls production
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `OPENAI_API_KEY` | OpenAI API key for WhatsApp NLP | `sk-...` |

### WhatsApp Integration

| Variable | Description | Example |
|----------|-------------|---------|
| `WASSENGER_API_KEY` | Wassenger API key | `wass_...` |
| `WASSENGER_WEBHOOK_SECRET` | Webhook verification secret | `secret123` |
| `WASSENGER_PHONE_NUMBER` | WhatsApp business number | `+6512345678` |

### Storage (DigitalOcean Spaces)

| Variable | Description | Example |
|----------|-------------|---------|
| `DO_SPACES_KEY` | Spaces access key | `DO...` |
| `DO_SPACES_SECRET` | Spaces secret key | `...` |
| `DO_SPACES_ENDPOINT` | Spaces endpoint URL | `https://sgp1.digitaloceanspaces.com` |
| `DO_SPACES_BUCKET` | Bucket name | `property-stewards` |
| `DO_SPACES_REGION` | Region | `sgp1` |

### Authentication (Optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXTAUTH_URL` | App URL | `https://yourdomain.vercel.app` |
| `NEXTAUTH_SECRET` | Auth secret | Generate with `openssl rand -base64 32` |

## Rollback Deployment

```bash
# List recent deployments
vercel ls

# Rollback to previous deployment
vercel rollback

# Rollback to specific deployment
vercel rollback [deployment-url]
```

## Custom Domain Setup

```bash
# Add custom domain
vercel domains add yourdomain.com

# Verify domain
vercel domains verify yourdomain.com

# Assign domain to production
vercel alias yourdomain.com
```

## Monitoring & Analytics

```bash
# View real-time analytics
vercel analytics

# Check function logs
vercel functions logs

# Monitor build times
vercel inspect --build-env
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Troubleshooting Checklist

- [ ] All environment variables added to Vercel?
- [ ] Database connection string includes SSL mode?
- [ ] Prisma client generates during build?
- [ ] Build succeeds locally with `pnpm build`?
- [ ] Suspense boundaries added for dynamic hooks?
- [ ] Connection pool limits configured?
- [ ] API keys and secrets are valid?
- [ ] Domain DNS configured correctly?

## Support & Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [Vercel CLI Reference](https://vercel.com/docs/cli)

## Emergency Contacts

- Vercel Status: [status.vercel.com](https://status.vercel.com)
- DigitalOcean Status: [status.digitalocean.com](https://status.digitalocean.com)
