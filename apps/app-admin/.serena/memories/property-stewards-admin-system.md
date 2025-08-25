# Property Stewards Admin System

## Overview
A comprehensive Next.js-based back office application for managing property inspections in Singapore. The system handles customer management, inspector assignments, work orders, contract lifecycle, and inspection report generation.

## Tech Stack
- **Framework**: Next.js 15.5 with App Router
- **Language**: TypeScript with strict mode
- **Database**: PostgreSQL on DigitalOcean
- **ORM**: Prisma
- **UI Components**: shadcn/ui components
- **Styling**: Tailwind CSS v4
- **Storage**: DigitalOcean Spaces for images/videos
- **NLP**: OpenAI for WhatsApp inspector interface

## Project Structure
```
property-admin/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── api/             # API routes for all entities
│   │   ├── customers/       # Customer CRUD pages
│   │   ├── inspectors/      # Inspector CRUD pages
│   │   ├── contracts/       # Contract CRUD pages
│   │   ├── work-orders/     # Work order CRUD pages
│   │   └── checklists/      # Checklist template CRUD pages
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   └── navigation.tsx  # Main navigation sidebar
│   └── lib/
│       ├── prisma.ts       # Prisma client singleton
│       └── utils.ts        # Utility functions
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts            # Seed data script
└── docs/
    └── openai.md          # OpenAI Assistant implementation

## Database Schema

### Core Entities
1. **Customer**: Stores customer information (Individual/Company)
   - Has multiple addresses
   - Has multiple contracts
   - Membership tiers (Bronze/Silver/Gold)

2. **CustomerAddress**: Property locations
   - Property types: HDB, CONDO, EC, APARTMENT, LANDED
   - Various property sizes per type

3. **Inspector**: Inspector profiles
   - Types: EMPLOYEE, CONTRACTOR
   - Specializations by property type
   - WhatsApp integration via mobile phone

4. **Contract**: Service agreements
   - Status flow: DRAFT → CONFIRMED → SCHEDULED → COMPLETED → CLOSED
   - Payment tracking
   - Links customer to inspection service

5. **WorkOrder**: Individual inspection visits
   - Status: SCHEDULED (Blue) → STARTED (Orange) → COMPLETED (Green) / CANCELLED (Red)
   - DateTime scheduling with actual times
   - Inspector assignment
   - Sign-off capability

6. **Checklist**: Inspection templates by property type
   - Reusable templates
   - Categories: GENERAL, ELECTRICAL, PLUMBING, STRUCTURAL, SAFETY, etc.

7. **ContractChecklist**: Instance of checklist for specific contract
   - One-to-one with Contract

8. **ContractChecklistItem**: Individual inspection items
   - Photos/videos upload to DigitalOcean Spaces
   - Completion tracking
   - Inspector entry tracking

## Key Features Implemented

### Customer Management
- Complete CRUD operations
- Multiple address management per customer
- Membership tier tracking
- Soft delete for customers with contracts

### Inspector Management
- CRUD operations with specialization tracking
- Work order history
- Performance statistics
- Specialization matching with property types

### Contract Management
- Full lifecycle management
- Work order creation and tracking
- Progress visualization
- Financial tracking

### Work Order Management
- Inspector assignment with conflict detection
- Schedule management (planned vs actual)
- Checklist item completion tracking
- Sign-off functionality

### Checklist Templates
- Reusable inspection templates
- Drag-and-drop item ordering
- Category-based organization
- Required vs optional items

## API Endpoints

All entities have RESTful API endpoints:
- `GET /api/{entity}` - List with pagination, search, filtering
- `POST /api/{entity}` - Create new record
- `GET /api/{entity}/[id]` - Get single record
- `PUT /api/{entity}/[id]` - Update record
- `PATCH /api/{entity}/[id]` - Partial update
- `DELETE /api/{entity}/[id]` - Delete (soft delete if has relationships)

## UI Components

### Common Patterns
- List pages with search, filters, and pagination
- Detail pages showing all related information
- Create forms with validation
- Edit forms with current data pre-populated
- Status badges with color coding
- Progress bars for completion tracking

### Navigation
- Fixed sidebar on desktop
- Mobile-responsive hamburger menu
- Active state highlighting
- Improved hover states with better contrast

## WhatsApp Integration (Planned)
- Wassenger for WhatsApp API
- OpenAI Assistant for natural language processing
- Session management with thread persistence
- Numbered bracket options for easy selection

## Environment Variables
```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_ENDPOINT=
DO_SPACES_BUCKET=
WASSENGER_API_KEY=
WASSENGER_WEBHOOK_SECRET=
```

## Development Commands
```bash
pnpm install        # Install dependencies
pnpm dev           # Run development server
pnpm build         # Build for production
pnpm db:migrate    # Run database migrations
pnpm db:seed       # Seed database with sample data
pnpm db:studio     # Open Prisma Studio
```

## Recent Updates
- Fixed params handling for Next.js 15 (params as Promise)
- Fixed date/time formatting (toLocaleString vs toLocaleDateString)
- Improved navigation hover states for better visibility
- Completed all CRUD forms for all entities
- Added soft delete patterns for entities with relationships

## Next Steps
- Implement authentication system
- Add WhatsApp webhook endpoints
- Integrate OpenAI Assistant
- Implement report generation
- Add file upload to DigitalOcean Spaces
- Create dashboard analytics