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
- **Raw pg client** (`/lib/db.ts`): Direct SQL for WhatsApp/AI integration requiring complex queries

### Performance Optimizations
- **Redis Caching** (`/lib/redis-cache.ts`): In-memory caching for frequently accessed data
- **Connection Pooling**: PostgreSQL connection pooling configured in both Prisma and pg clients
- **Fast WhatsApp Response**: Sub-2-second response times via optimized OpenAI Assistant API calls

### Entity Relationships
```
Customer → CustomerAddress → Contract → ContractChecklist → WorkOrder
                                    ↓                        ↓
                           ContractChecklistItem ← Inspector
```

## WhatsApp Integration Architecture

Inspectors interact via WhatsApp with:
- **Wassenger API**: Primary WhatsApp gateway service
- **OpenAI Assistant API**: NLP processing with thread-based context (using gpt-4o-mini for speed)
- **Session Management**: OpenAI thread IDs persist conversation state with Redis caching
- **Numbered Options**: `[1], [2], [3]` format for easy mobile selection
- **Media Handling**: Images/videos stored in DigitalOcean Spaces or base64 in DB
- **Duplicate Prevention**: Message deduplication using in-memory cache with timestamps
- **Tool Calling**: Structured function calls for job management, location selection, and task completion

### Critical Integration Points
- Webhook endpoint: `/api/whatsapp/webhook` with secret verification
- Inspector service: `/lib/services/inspectorService.ts` handles all WhatsApp business logic
- Thread management with automatic cleanup and phone number normalization
- Automatic work order status updates from WhatsApp activity
- Real-time task completion tracking with location-based workflows

## Environment Configuration

```env
# Database (Required)
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Raw PostgreSQL Connection (Optional - for direct SQL queries)
DB_USER=username
DB_PASSWORD=password
DB_HOST=hostname
DB_PORT=25060
DB_NAME=database

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

### SSL Certificate Requirement
The system expects a `ca-certificate.crt` file in the project root for secure PostgreSQL connections. This file is required for DigitalOcean managed database connections.

## Project Structure

```
/src
  /app/              # Next.js App Router pages
    /api/            # API route handlers
      /whatsapp/     # WhatsApp webhook integration
    /(pages)/        # UI pages with layouts
  /components/       # Reusable UI components
    /ui/            # shadcn/ui base components
  /lib/             # Core utilities
    /services/      # Business logic layer
    prisma.ts       # Prisma client singleton
    db.ts           # Raw PostgreSQL client
    redis-cache.ts  # Redis caching utilities
    s3-client.ts    # DigitalOcean Spaces client
    thread-store.ts # OpenAI thread management
    /utils/         # Utility functions
/prisma/             # Database schema and migrations
  schema.prisma     # Database schema definition
  /migrations/      # Database migration files
  seed.ts          # Database seeding script
```

## Key Architectural Decisions

1. **Server Components First**: All components are React Server Components unless marked with "use client"
2. **Work Order Status Colors**: Blue (scheduled), Orange (in-progress), Red (issues), Green (completed)
3. **No Lead Generation**: System focuses on direct customer management only
4. **Inspector Authentication**: Phone number-based, no hardcoded IDs
5. **CUID IDs**: Collision-resistant unique identifiers for all database entities
6. **Soft Deletes**: Status fields instead of hard deletes for data integrity
7. **WhatsApp-First Inspector Interface**: No mobile app required - all inspector interactions via WhatsApp
8. **Task Granularity**: JSON-based task arrays within checklist items for flexible task management
9. **Numbered Selection UI**: Consistent `[1], [2], [3]` interface for mobile-friendly WhatsApp interactions

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
- ✅ CRUD interfaces for entities (customers, inspectors, contracts, work orders, checklists)
- ✅ WhatsApp webhook integration with Wassenger API
- ✅ OpenAI Assistant setup with tool calling and thread management
- ✅ Inspector authentication via phone number
- ✅ Real-time task completion tracking
- ✅ DigitalOcean Spaces integration for file storage
- ✅ Redis caching for performance optimization
- ⏳ Authentication system for admin portal
- ⏳ Report generation (PDF/web reports)
- ⏳ Advanced media handling in WhatsApp conversations

## Working with the WhatsApp Integration

### Inspector Service Functions
Key functions in `/lib/services/inspectorService.ts`:
- `getInspectorByPhone()` - Find inspector by phone number
- `getTodayJobsForInspector()` - Get scheduled jobs for today
- `getWorkOrderById()` - Get detailed work order information
- `updateWorkOrderStatus()` - Update work order status (scheduled → started → completed)
- `getTasksByLocation()` - Get tasks for specific room/location
- `completeAllTasksForLocation()` - Mark all tasks in a location as done
- `updateTaskStatus()` - Update individual task status

### OpenAI Assistant Tools
Available function calls for the assistant:
- `getTodayJobs` - Show inspector's scheduled jobs
- `confirmJobSelection` - Confirm job selection with details
- `startJob` - Begin work order and show locations
- `getTasksForLocation` - Show tasks for selected room
- `completeTask` - Mark individual or all tasks complete
- `updateJobDetails` - Modify job information
- `collectInspectorInfo` - Identify inspector by name/phone

### Development Tips
- WhatsApp responses must be under 2 seconds for good UX
- Use caching aggressively for frequently accessed data
- Message deduplication prevents double processing
- Phone number normalization handles different formats
- Task completion uses `enteredOn` timestamp for tracking