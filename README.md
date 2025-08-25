# Property Stewards Application Suite

A comprehensive property inspection and management system built with modern web technologies.

## Project Structure

This is a monorepo containing multiple applications and shared packages:

```
property-stewards/
├── apps/
│   └── app-admin/          # Admin portal for back-office operations
├── packages/               # Shared packages (future)
└── docs/                  # Documentation (future)
```

## Applications

### Admin Portal (`apps/app-admin`)
The back-office administration system for managing:
- Customer management
- Inspector assignments
- Work orders and contracts
- Inspection checklists
- Report generation

## Tech Stack

- **Framework**: Next.js 15.5 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Deployment**: Vercel
- **Package Manager**: pnpm workspaces

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 8+
- PostgreSQL database

### Installation

```bash
# Clone the repository
git clone https://github.com/nexstacksg/property-stewards-app.git
cd property-stewards-app

# Install dependencies
pnpm install

# Set up environment variables
cp apps/app-admin/.env.example apps/app-admin/.env.local
# Edit the .env.local file with your credentials
```

### Development

```bash
# Run the admin portal
pnpm dev:admin

# Or run from the app directory
cd apps/app-admin
pnpm dev
```

### Build

```bash
# Build all applications
pnpm build

# Build admin portal only
pnpm build:admin
```

### Deployment

See [apps/app-admin/deploy.md](apps/app-admin/deploy.md) for detailed deployment instructions.

## Project Links

- **Production Admin**: [Deployed on Vercel]
- **Repository**: https://github.com/nexstacksg/property-stewards-app

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

Private - All rights reserved