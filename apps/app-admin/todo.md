# Property Stewards Admin - Database Implementation TODO

## Phase 1: Database Setup ✅ COMPLETED

### 1. Database Configuration
- [x] Install Prisma ORM dependencies
- [x] Configure Prisma with PostgreSQL
- [x] Set up environment variables (.env.local)
- [x] Create .env.example template

### 2. Core Entity Schemas

#### Customer Management
- [x] Customer table
  - ID, Name, Type (Individual/Company)
  - Person in Charge, Email, Phone
  - Membership details (Is Member, Member Since, Expired On, Tier)
  - Billing Address, Remarks
  - Status (Active/Inactive)
  - Timestamps (Created On, Updated On)

- [x] Customer Addresses table
  - Link to Customer
  - Address, Postal Code
  - Property Type (HDB/Condo/EC/Apartment/Landed)
  - Property Size
  - Remarks, Status
  - Timestamps

#### Inspector Management
- [x] Inspector table
  - ID, Name, Mobile Phone
  - Type (Full Time/Part Time)
  - Specialization (multiple)
  - Remarks, Status
  - Timestamps

#### Checklist Templates
- [x] Checklist table
  - ID, Name
  - Property Type
  - Remarks, Status
  - Timestamps

- [x] Checklist Items table
  - Link to Checklist
  - Item Name
  - Action to be done
  - Order/Position

#### Contract Management
- [x] Contract table
  - Link to Customer and Address
  - Contract Value
  - Payment dates (First, Final)
  - Based on Checklist template
  - Scheduled dates (Start, End)
  - Actual dates (Start, End)
  - Service Package
  - Customer Feedback (Comments, Rating)
  - Status (Draft/Confirmed/Scheduled/Completed/Closed/Cancelled)
  - Timestamps

#### Contract Execution
- [x] Contract Checklist table
  - Link to Contract
  - Customized checklist items from template

- [x] Contract Checklist Items table
  - Link to Contract Checklist
  - Item Name
  - Remarks
  - Photos (URLs to DigitalOcean Spaces)
  - Videos (URLs to DigitalOcean Spaces)
  - Entered On, Entered By (Inspector)
  - Link to Work Order

#### Work Orders
- [x] Work Order table
  - Link to Contract
  - Link to Inspector(s)
  - Scheduled Start/End DateTime
  - Actual Start/End DateTime
  - Signature (Base64)
  - Sign Off By (Name)
  - Remarks
  - Status (Scheduled/Started/Cancelled/Completed)
  - Timestamps

### 3. Database Relationships
- [x] Define all foreign key relationships
- [x] Set up cascade delete rules
- [x] Create indexes for performance

### 4. Migrations
- [x] Generate initial migration
- [x] Test migration on DigitalOcean database
- [x] Document migration process

### 5. Seed Data
- [x] Create seed data script
- [x] Add seed script to package.json
- [x] Create sample data for all entities:
  - 3 Inspectors (John Tan, Sarah Lim, Ahmad Rahman)
  - 3 Customers (Tan Holdings, Rachel Wong, Bala Krishnan)
  - 4 Customer addresses
  - 2 Checklist templates (HDB & Condo)
  - 4 Contracts with various statuses
  - 4 Work orders

## Phase 2: API Development (Next Steps)

### 1. API Routes
- [ ] Customer CRUD endpoints
- [ ] Inspector CRUD endpoints
- [ ] Contract management endpoints
- [ ] Work Order management endpoints
- [ ] Checklist template endpoints

### 2. Authentication
- [ ] Admin authentication system
- [ ] Session management
- [ ] Role-based access control

### 3. WhatsApp Integration
- [ ] Webhook endpoints for Wassenger
- [ ] OpenAI Assistant integration
- [ ] Message processing pipeline

### 4. Report Generation
- [ ] PDF generation system
- [ ] Web-based report viewer
- [ ] Template management

## Phase 3: Frontend Implementation

### 1. UI Components (shadcn/ui)
- [ ] Layout components
- [ ] Forms and validation
- [ ] Data tables
- [ ] Dashboard widgets

### 2. Admin Pages
- [ ] Customer management
- [ ] Inspector management
- [ ] Contract workflow
- [ ] Work order tracking
- [ ] Report generation

## Phase 4: Storage & File Management
- [ ] DigitalOcean Spaces integration
- [ ] Image upload handling
- [ ] Video upload handling
- [ ] File URL management

## Phase 5: Testing & Deployment
- [ ] Unit tests
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Production deployment setup

## Notes
- Database: PostgreSQL on DigitalOcean
- ORM: Prisma
- Color codes for Work Order status:
  - Blue: Scheduled
  - Orange: Started
  - Red: Cancelled
  - Green: Completed