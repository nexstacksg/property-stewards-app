# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Property Stewards Admin System - A Next.js-based back office application for managing property inspections. The system handles customer management, inspector assignments, work orders, and report generation.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production  
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint
```

## Project Architecture

### Tech Stack
- **Framework**: Next.js 15.5 with App Router
- **Language**: TypeScript with strict mode
- **UI Components**: shadcn/ui (to be implemented)
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL (managed on DigitalOcean)
- **Storage**: DigitalOcean Spaces for images/videos
- **NLP**: OpenAI for WhatsApp inspector chat interface

### Project Structure
```
property-admin/
├── src/
│   └── app/           # Next.js App Router pages and layouts
├── docs/              # Technical documentation
│   └── openai.md      # OpenAI Assistant implementation details
└── project.md         # Full functional specification
```

### Key System Components

1. **Customer Management**: Direct customer entry and management without lead generation
2. **Inspector Management**: Inspector profiles with WhatsApp integration
3. **Contract Lifecycle**: Draft → Confirmed → Scheduled → Completed → Closed
4. **Work Orders**: Color-coded status tracking (Blue/Orange/Red/Green)
5. **Checklist System**: Customizable property inspection templates
6. **Report Generation**: PDF and web-based inspection reports

### Database Schema (PostgreSQL)

Key entities defined in project.md:
- **Customer**: ID, Name, Type, Email, Phone, Member status
- **Customer Addresses**: Property locations with type and size
- **Inspector**: ID, Name, Mobile Phone, Type, Specialization
- **Contract**: Links customer to inspection job with payment tracking
- **Work Order**: Tracks individual inspection visits with status
- **Checklist**: Template and contract-specific inspection items

### WhatsApp Integration Flow

Inspectors interact via WhatsApp using:
- Wassenger for WhatsApp API integration
- OpenAI Assistant API for natural language processing
- Numbered bracket options `[1], [2], [3]` for easy selection
- Session management with thread persistence

### Environment Variables Required

```env
# OpenAI Configuration
OPENAI_API_KEY=

# Database
DATABASE_URL=postgresql://...

# DigitalOcean Spaces
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_ENDPOINT=
DO_SPACES_BUCKET=

# WhatsApp/Wassenger
WASSENGER_API_KEY=
WASSENGER_WEBHOOK_SECRET=
```

## Implementation Status

Current state: Fresh Next.js installation with basic setup. Main implementation tasks:

1. Database schema implementation with Prisma/Drizzle
2. shadcn/ui component integration
3. Authentication system
4. CRUD interfaces for all entities
5. WhatsApp webhook endpoints
6. OpenAI Assistant integration
7. Report generation system
8. File upload to DigitalOcean Spaces

## Important Notes

- No lead generation features - focus on direct customer management
- Inspectors authenticate via phone number (no hardcoded IDs)
- Work order statuses update automatically via WhatsApp activity
- System supports multiple inspectors per work order
- All reports use predefined templates for consistency

## Path Aliases

Use `@/*` for imports from the `src/` directory:
```typescript
import { Component } from '@/app/components/Component'
```