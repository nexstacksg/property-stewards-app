# 🚀 Setup Instructions - Action Required!

## ⚠️ IMPORTANT: You Need to Add Your Credentials

The secure deployment is ready, but it needs YOUR database and API credentials to work.

## Step 1: Create Your Credentials File

```bash
# Create .env.local from the template
cp .env.local.example .env.local
```

## Step 2: Add Your Actual Credentials

Open `.env.local` in your editor and add your REAL credentials:

```bash
# Edit with your preferred editor
nano .env.local
# or
code .env.local
# or
open -e .env.local
```

### Required Information:

You need to add these values from your DigitalOcean account:

```env
# Database Configuration (from DigitalOcean Managed Database)
DB_USER=doadmin
DB_PASSWORD=YOUR_ACTUAL_PASSWORD_HERE  # ← Replace this!
DB_HOST=YOUR_DB_HOST.db.ondigitalocean.com  # ← Replace this!
DB_PORT=25060
DB_NAME=property-stewards-db

# OpenAI Configuration
OPENAI_API_KEY=sk-YOUR_ACTUAL_KEY_HERE  # ← Replace this!
```

### Where to Find Your Credentials:

#### Database Credentials:
1. Go to DigitalOcean Console → Databases
2. Click on your database cluster
3. Find "Connection Details" section
4. Copy:
   - Host (e.g., `db-postgresql-sgp1-xxxxx.b.db.ondigitalocean.com`)
   - Password (click "show" to reveal)
   - Database name
   - Port (usually 25060)

#### OpenAI API Key:
1. Go to https://platform.openai.com/api-keys
2. Create a new key or use existing
3. Copy the key starting with `sk-`

## Step 3: Deploy with Your Credentials

Once you've added your credentials to `.env.local`:

```bash
# Deploy the functions
./deploy-secure.sh
```

## Step 4: Test Your Deployment

After successful deployment, test each function:

### Test DateTime (Works without credentials):
```bash
doctl sls fn invoke v1/getDateTime
```

### Test Database Functions:
```bash
# Get posts
doctl sls fn invoke v1/getPosts

# Create a test post
doctl sls fn invoke v1/createPost \
  --param title:"My First Secure Post" \
  --param content:"Testing the secure deployment" \
  --param author:"Your Name"
```

### Test OpenAI:
```bash
# Simple chat test
doctl sls fn invoke v1/openai \
  --param action:chat \
  --param message:"What are good property inspection tips?"

# Get your assistant
doctl sls fn invoke v1/openai \
  --param action:get-assistant \
  --param assistantId:asst_jwaJ70vlBYEvMd3hSvUjwOSU

# Update your assistant
doctl sls fn invoke v1/openai \
  --param action:update-assistant \
  --param assistantId:asst_jwaJ70vlBYEvMd3hSvUjwOSU \
  --param name:"Property Inspector Expert" \
  --param instructions:"You are an expert assistant specializing in property inspection and real estate evaluation"
```

## 🔒 Security Notes

✅ **What's Been Secured:**
- No more hardcoded credentials in code
- SQL injection prevention
- Input validation on all endpoints
- API key only from environment
- Better error handling

❌ **Never Do This:**
- Don't commit `.env.local` to git
- Don't share your credentials
- Don't use API keys in URLs anymore

## 📝 Quick Checklist

- [ ] Created `.env.local` file
- [ ] Added DB_USER (usually `doadmin`)
- [ ] Added DB_PASSWORD from DigitalOcean
- [ ] Added DB_HOST from DigitalOcean
- [ ] Added DB_NAME (usually `property-stewards-db`)
- [ ] Added OPENAI_API_KEY from OpenAI platform
- [ ] Ran `./deploy-secure.sh`
- [ ] Tested with `doctl sls fn invoke`

## Need Help?

If you get errors:

1. **"Database not configured"** - Check your DB credentials in `.env.local`
2. **"OpenAI API key not configured"** - Check your OPENAI_API_KEY
3. **Connection timeout** - Verify your DB_HOST is correct
4. **Authentication failed** - Double-check your DB_PASSWORD

## Next Steps

After successful deployment:

1. Test all functions using the commands above
2. Use Postman collection (API key no longer needed in URLs!)
3. Monitor your functions: `doctl sls activations list --limit 5`

---

**Remember:** The deployment is ready and secure, it just needs YOUR credentials to connect to YOUR database and OpenAI account!