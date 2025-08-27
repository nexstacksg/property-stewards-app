# Developer Setup Guide

Welcome to Property Stewards! This guide will help you set up your development environment and start contributing.

## 🎯 Quick Start (15 minutes)

### Step 1: Clone and Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/property-stewards.git
cd property-stewards

# Copy environment template
cp .env.example .env.local

# Install doctl (DigitalOcean CLI)
brew install doctl  # macOS
# or
snap install doctl  # Linux
```

### Step 2: Configure Credentials

Edit `.env.local` with your credentials:
```env
# Get from DigitalOcean Database Dashboard
DB_USER=doadmin
DB_PASSWORD=your_password
DB_HOST=your-host.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=property-stewards-db

# Get from OpenAI Platform
OPENAI_API_KEY=sk-proj-your-key

# Get from DigitalOcean API Tokens
DIGITALOCEAN_ACCESS_TOKEN=dop_v1_your_token
```

### Step 3: Setup Database
```bash
# Create database
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/defaultdb?sslmode=require" \
  -c 'CREATE DATABASE "property-stewards-db";'

# Run schema
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/property-stewards-db?sslmode=require" \
  < docs/schema.sql
```

### Step 4: Deploy
```bash
# Authenticate doctl
doctl auth init

# Connect to serverless
doctl serverless connect

# Deploy functions
./deploy-secure.sh
```

### Step 5: Test
```bash
# Test deployment
doctl sls fn invoke v1/getDateTime

# Test OpenAI
doctl sls fn invoke v1/openai \
  --param action:quick-chat \
  --param assistantId:asst_jwaJ70vlBYEvMd3hSvUjwOSU \
  --param message:"Hello"
```

## 📚 Detailed Setup Instructions

### Prerequisites Installation

#### 1. Node.js (Required)
```bash
# Check if installed
node --version  # Should be v18+

# Install if needed
# macOS
brew install node

# Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org/
```

#### 2. PostgreSQL Client (Required for database setup)
```bash
# macOS
brew install postgresql

# Linux
sudo apt-get install postgresql-client

# Windows
# Download from https://www.postgresql.org/download/windows/
```

#### 3. DigitalOcean CLI (Required)
```bash
# macOS
brew install doctl

# Linux
snap install doctl

# Windows
scoop install doctl
# or download from GitHub releases
```

#### 4. Postman (Optional, for API testing)
Download from [postman.com](https://www.postman.com/downloads/)

### Account Setup

#### 1. DigitalOcean Account
1. Sign up at [digitalocean.com](https://www.digitalocean.com)
2. Go to API → Tokens
3. Generate new token with read/write access
4. Save token to `.env.local`

#### 2. OpenAI Account
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Go to API Keys
3. Create new secret key
4. Save key to `.env.local`

#### 3. Database Setup
1. In DigitalOcean, create a Managed Database
2. Choose PostgreSQL
3. Select your region
4. Copy connection details to `.env.local`

### Local Development

#### Running Functions Locally
```bash
# Install dependencies for a function
cd packages/v1/openai
npm install

# Test function locally
node -e "
const main = require('./index.js').main;
main({ action: 'get-assistant', assistantId: 'asst_jwaJ70vlBYEvMd3hSvUjwOSU' })
  .then(console.log)
  .catch(console.error);
"
```

#### Testing Database Connection
```bash
# Test connection
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=require" \
  -c "SELECT NOW();"

# View tables
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=require" \
  -c "\dt"
```

### Project Structure Overview

```
packages/v1/          # All serverless functions
  openai/            # AI Assistant functionality
  createPost/        # Create blog posts
  getPosts/          # Retrieve posts
  updatePost/        # Update posts
  deletePost/        # Delete posts
  getDateTime/       # Utility function

docs/                # Documentation
  *.postman_collection.json  # Import to Postman
  schema.sql         # Database structure

project.yml          # Function configuration
deploy-secure.sh     # Deployment script
```

### Common Development Tasks

#### Adding a New Function
1. Create directory: `packages/v1/yourFunction/`
2. Add `index.js` with `exports.main = main`
3. Add `package.json` with dependencies
4. Update `project.yml`
5. Deploy: `doctl serverless deploy .`

#### Modifying Existing Function
1. Edit the function code
2. Test locally if possible
3. Deploy: `./deploy-secure.sh`
4. Test: `doctl sls fn invoke v1/functionName`

#### Updating Database Schema
1. Modify `docs/schema.sql`
2. Create migration script
3. Test on development database
4. Apply to production

### Testing Guide

#### Unit Testing (Local)
```javascript
// test.js
const { main } = require('./index.js');

async function test() {
    const result = await main({
        action: 'test',
        // parameters
    });
    console.log(result);
}

test();
```

#### Integration Testing
```bash
# Test all CRUD operations
npm run test-integration  # If configured

# Or manually:
doctl sls fn invoke v1/createPost --param title:"Test"
doctl sls fn invoke v1/getPosts
doctl sls fn invoke v1/updatePost --param id:1 --param title:"Updated"
doctl sls fn invoke v1/deletePost --param id:1
```

#### Using Postman
1. Import collection: `docs/openai-assistant.postman_collection.json`
2. Set variables:
   - `base_url`: Your function URL
   - `assistantId`: Your assistant ID
3. Run collection tests

### Debugging

#### View Function Logs
```bash
# List recent activations
doctl sls activations list --limit 10

# Get specific logs
doctl sls activations logs [ACTIVATION_ID]

# Stream logs (pseudo-realtime)
watch -n 2 'doctl sls activations list --limit 5'
```

#### Common Issues

**Environment Variables Not Set**
```bash
# Check if loaded
echo $DB_USER
echo $OPENAI_API_KEY

# Reload
source .env.local
```

**Function Timeout**
- Increase timeout in `project.yml`
- Optimize database queries
- Add connection pooling

**Module Not Found**
- Ensure all dependencies in `package.json`
- Copy shared modules to function directory
- Run `npm install` in function directory

### Security Best Practices

1. **Never commit secrets**
   ```bash
   # Check before committing
   git diff --staged | grep -E "(password|key|token)"
   ```

2. **Use environment variables**
   ```javascript
   // Good
   const apiKey = process.env.OPENAI_API_KEY;
   
   // Bad
   const apiKey = "sk-proj-abc123";
   ```

3. **Validate all inputs**
   ```javascript
   if (!params.id || typeof params.id !== 'number') {
       return { error: 'Invalid ID' };
   }
   ```

4. **Use parameterized queries**
   ```javascript
   // Good
   await client.query('SELECT * FROM posts WHERE id = $1', [id]);
   
   // Bad
   await client.query(`SELECT * FROM posts WHERE id = ${id}`);
   ```

### Git Workflow

#### Feature Development
```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes
git add .
git commit -m "Add your feature"

# Push and create PR
git push origin feature/your-feature
```

#### Before Committing
- [ ] Run tests
- [ ] Check for secrets
- [ ] Update documentation
- [ ] Test deployment

### Getting Help

#### Resources
- [DigitalOcean Functions Docs](https://docs.digitalocean.com/products/functions/)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- Project docs: `DEPLOYMENT.md`, `SECURITY.md`

#### Troubleshooting Steps
1. Check function logs
2. Verify environment variables
3. Test database connection
4. Review error messages
5. Check project.yml configuration

#### Support Channels
- GitHub Issues for bugs
- Documentation for setup
- Team chat for questions

## 🎉 Ready to Code!

You're all set! Here are some starter tasks:

1. **Test the APIs**: Import Postman collection and try all endpoints
2. **Add a feature**: Try adding a new field to posts
3. **Improve security**: Add rate limiting to functions
4. **Documentation**: Improve API documentation

Remember:
- Always use environment variables for secrets
- Test locally before deploying
- Follow the security guidelines
- Ask questions when stuck

Happy coding! 🚀