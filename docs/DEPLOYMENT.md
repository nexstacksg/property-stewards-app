# Deployment Guide for Property Stewards

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Security Configuration](#security-configuration)
- [Deployment Process](#deployment-process)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools
1. **DigitalOcean CLI (doctl)**
   ```bash
   # macOS
   brew install doctl
   
   # Linux
   snap install doctl
   
   # Windows
   scoop install doctl
   ```

2. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18.x.x or higher
   ```

3. **DigitalOcean Account**
   - Create account at [DigitalOcean](https://cloud.digitalocean.com)
   - Generate API token: Account → API → Generate New Token

### Initial Setup
1. **Authenticate doctl**
   ```bash
   doctl auth init
   # Enter your DigitalOcean API token when prompted
   ```

2. **Connect to serverless namespace**
   ```bash
   doctl serverless connect
   ```

## Environment Setup

### 1. Create Environment Files

#### `.env.local` (for local development and deployment)
```bash
# Database Configuration (DigitalOcean Managed Database)
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your-db-host.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=your_database_name

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key
```

#### `.env` (for DigitalOcean token)
```bash
# DigitalOcean Configuration
DIGITALOCEAN_ACCESS_TOKEN=dop_v1_your_token_here

# Database Configuration (same as .env.local)
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your-db-host.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=your_database_name
DB_SSL=true

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-openai-api-key
```

### 2. Environment Variables Security

**IMPORTANT:** Never commit `.env` or `.env.local` files to version control!

1. **Add to `.gitignore`**
   ```bash
   .env
   .env.local
   .env.*
   !.env.example
   ```

2. **Create `.env.example`** (safe to commit)
   ```bash
   # Database Configuration
   DB_USER=your_db_user_here
   DB_PASSWORD=your_secure_password_here
   DB_HOST=your_db_host.db.ondigitalocean.com
   DB_PORT=25060
   DB_NAME=your_database_name
   
   # OpenAI Configuration
   OPENAI_API_KEY=sk-proj-your-key-here
   
   # DigitalOcean Configuration
   DIGITALOCEAN_ACCESS_TOKEN=dop_v1_your_token_here
   ```

## Security Configuration

### 1. Database Security

- **Use SSL Connections**: Always enable SSL for database connections
- **Rotate Credentials**: Change database passwords regularly
- **Restrict Access**: Use DigitalOcean's trusted sources feature
- **Never hardcode credentials**: All credentials must be in environment variables

### 2. API Key Security

- **OpenAI API Key**: 
  - Never expose in client-side code
  - Never include in URLs or query parameters
  - Set usage limits in OpenAI dashboard
  - Monitor usage regularly

- **DigitalOcean Token**:
  - Create tokens with minimal required permissions
  - Rotate tokens periodically
  - Never share tokens in documentation or support tickets

### 3. Function Security

All functions implement these security measures:

1. **Input Validation**
   ```javascript
   // Example from createPost
   if (!params.title || params.title.length > 200) {
       return { error: 'Invalid title' };
   }
   ```

2. **SQL Injection Prevention**
   ```javascript
   // Using parameterized queries
   const query = 'INSERT INTO posts (title) VALUES ($1)';
   await client.query(query, [title]);
   ```

3. **Error Handling**
   ```javascript
   // Never expose internal errors
   catch (error) {
       console.error('Internal error:', error);
       return { error: 'An error occurred' };
   }
   ```

## Deployment Process

### 1. Quick Deployment

Use the secure deployment script:
```bash
# Make script executable
chmod +x deploy-secure.sh

# Run deployment
./deploy-secure.sh
```

### 2. Manual Deployment

```bash
# Load environment variables
source .env.local

# Deploy all functions
doctl serverless deploy .

# Deploy specific function
doctl serverless deploy packages/v1/openai
```

### 3. Environment Variables in Production

The `project.yml` automatically configures environment variables:
```yaml
- name: openai
  runtime: nodejs:18
  environment:
    OPENAI_API_KEY: "${OPENAI_API_KEY}"
```

### 4. Verify Deployment

```bash
# List deployed functions
doctl serverless fn list

# Get function URL
doctl serverless fn get v1/openai --url
```

## Testing

### 1. Test with CLI

```bash
# Test DateTime function
doctl sls fn invoke v1/getDateTime

# Test OpenAI function
doctl sls fn invoke v1/openai \
  --param action:get-assistant \
  --param assistantId:asst_jwaJ70vlBYEvMd3hSvUjwOSU

# Test database function
doctl sls fn invoke v1/getPosts
```

### 2. Test with cURL

```bash
# Get DateTime
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/getDateTime"

# Quick Chat with Assistant
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=quick-chat&assistantId=asst_jwaJ70vlBYEvMd3hSvUjwOSU&message=Hello"
```

### 3. Debug Failed Deployments

```bash
# Get activation list
doctl sls activations list --limit 5

# Get activation logs
doctl sls activations logs [ACTIVATION_ID]

# Get detailed result
doctl sls activations result [ACTIVATION_ID]
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "OpenAI API key not configured"
**Solution**: Ensure environment variables are set
```bash
source .env.local
doctl serverless deploy .
```

#### 2. "Database not configured"
**Solution**: Check all database environment variables
```bash
echo $DB_USER
echo $DB_HOST
echo $DB_NAME
# Should all return values
```

#### 3. "MODULE_NOT_FOUND" Error
**Solution**: Each function must be self-contained
- Copy shared modules (like db.js) to each function directory
- Update imports to use local paths

#### 4. "Action is named in config but does not exist"
**Solution**: Directory structure must match project.yml exactly
```
packages/
  v1/
    openai/
      index.js
      package.json
```

#### 5. Function timeout
**Solution**: Increase timeout in project.yml
```yaml
limits:
  timeout: 60000  # 60 seconds
```

## Production Checklist

Before deploying to production:

- [ ] All environment variables are set
- [ ] No hardcoded credentials in code
- [ ] Input validation implemented
- [ ] Error messages don't expose internal details
- [ ] Database using SSL connections
- [ ] API keys have usage limits set
- [ ] Deployment script tested
- [ ] Functions tested individually
- [ ] Postman collection updated
- [ ] Documentation updated

## Monitoring and Maintenance

### 1. Monitor Function Logs
```bash
# View recent activations
doctl sls activations list --limit 20

# Monitor specific function
doctl sls activations list --name v1/openai --limit 10
```

### 2. Regular Maintenance Tasks

- **Weekly**: Review function logs for errors
- **Monthly**: Rotate API keys and database passwords
- **Quarterly**: Review and update dependencies
- **Ongoing**: Monitor OpenAI API usage and costs

### 3. Cost Optimization

- Set function memory limits appropriately
- Use caching where possible
- Monitor invocation counts
- Set up alerts for unusual activity

## Support

For issues or questions:
1. Check function logs: `doctl sls activations logs [ID]`
2. Review this documentation
3. Check DigitalOcean Functions documentation
4. Contact support with specific error messages and activation IDs