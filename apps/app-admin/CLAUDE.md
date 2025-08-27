# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Property Stewards Admin System - A Next.js-based back office application for managing property inspections. The system handles customer management, inspector assignments, work orders, and report generation through an admin portal and WhatsApp integration for inspectors.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server (default port 3000, falls back to 3001 if occupied)
pnpm dev

# Build for production (includes Prisma client generation)
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint

# Database commands
pnpm db:migrate    # Run Prisma migrations
pnpm db:push      # Push schema to database without migrations
pnpm db:seed      # Seed database with initial data
pnpm db:studio    # Open Prisma Studio GUI
```

## Architecture & Data Flow

### High-Level Architecture
- **Frontend**: Next.js 15.5 with App Router (React Server Components by default)
- **Backend**: Next.js API Routes as REST endpoints
- **Database**: PostgreSQL with Prisma ORM + raw `pg` for complex queries
- **UI Framework**: shadcn/ui components with Tailwind CSS v4
- **File Storage**: DigitalOcean Spaces with base64 fallback in database

### Critical Data Flows

1. **Admin Portal Flow**:
   ```
   UI Component → API Route → Prisma → PostgreSQL
   ```

2. **WhatsApp Inspector Flow**:
   ```
   WhatsApp → Wassenger → Webhook → OpenAI Assistant → Database Update
   ```

3. **Report Generation Flow**:
   ```
   Work Order → Checklist Items → Media Attachments → PDF/Web Report
   ```

### Dual Database Connection Strategy
The codebase uses two database connection approaches:
- **Prisma Client** (`/lib/prisma.ts`): Type-safe ORM for admin portal CRUD operations
- **Raw pg client** (`/lib/services/database.ts`): Direct SQL for WhatsApp/AI integration requiring complex queries

### Entity Relationships
```
Customer → CustomerAddress → Contract → ContractChecklist → WorkOrder
                                    ↓                        ↓
                           ContractChecklistItem ← Inspector
```

## WhatsApp Integration Architecture

Inspectors interact via WhatsApp with:
- **Wassenger API**: Primary WhatsApp gateway service
- **OpenAI Assistant API**: NLP processing with thread-based context
- **Session Management**: OpenAI thread IDs persist conversation state
- **Numbered Options**: `[1], [2], [3]` format for easy mobile selection
- **Media Handling**: Images/videos stored in DigitalOcean Spaces or base64 in DB

### Critical Integration Points
- Webhook endpoint: `/api/whatsapp/webhook`
- Thread management stored in database
- Automatic work order status updates from WhatsApp activity

## Environment Configuration

```env
# Database (Required)
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# OpenAI (Required for WhatsApp integration)
OPENAI_API_KEY=

# DigitalOcean (Required for file storage)
DIGITALOCEAN_ACCESS_TOKEN=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_ENDPOINT=
DO_SPACES_BUCKET=

# WhatsApp/Wassenger (Required for inspector interface)
WASSENGER_API_KEY=
WASSENGER_WEBHOOK_SECRET=
```

## Project Structure

```
/src
  /app/              # Next.js App Router pages
    /api/            # API route handlers
    /(pages)/        # UI pages with layouts
  /components/       # Reusable UI components
    /ui/            # shadcn/ui base components
  /lib/             # Core utilities
    /services/      # Business logic layer
    prisma.ts       # Prisma client singleton
```

## Key Architectural Decisions

1. **Server Components First**: All components are React Server Components unless marked with "use client"
2. **Work Order Status Colors**: Blue (scheduled), Orange (in-progress), Red (issues), Green (completed)
3. **No Lead Generation**: System focuses on direct customer management only
4. **Inspector Authentication**: Phone number-based, no hardcoded IDs
5. **CUID IDs**: Collision-resistant unique identifiers for all database entities
6. **Soft Deletes**: Status fields instead of hard deletes for data integrity

## API Route Patterns

All API routes follow RESTful conventions:
- `GET /api/[entity]` - List with pagination
- `GET /api/[entity]/[id]` - Get single entity
- `POST /api/[entity]` - Create new entity
- `PUT /api/[entity]/[id]` - Update entity
- `DELETE /api/[entity]/[id]` - Delete entity

## Path Aliases

Use `@/*` for imports from the `src/` directory:
```typescript
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
```

## Current Implementation Status

- ✅ Basic Next.js setup with dashboard
- ✅ Database connection and Prisma schema
- ✅ Initial data seeding
- ✅ Navigation structure
- ⏳ CRUD interfaces for entities
- ⏳ WhatsApp webhook integration
- ⏳ OpenAI Assistant setup
- ⏳ Authentication system
- ⏳ Report generation
- ⏳ File upload to DigitalOcean Spaces