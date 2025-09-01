# Vercel Environment Variables Setup

## Add the following environment variables to your Vercel project:

1. Go to https://vercel.com/[your-username]/property-stewards-app/settings/environment-variables

2. Add these environment variables:

```
# Database
DATABASE_URL=postgresql://doadmin:AVNS_t1QkJAV-wBGBER2BwnQ@property-stewards-pg-do-user-24133016-0.e.db.ondigitalocean.com:25060/property3?sslmode=require

# OpenAI
OPENAI_API_KEY=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

# DigitalOcean Spaces
DIGITALOCEAN_ACCESS_TOKEN=dop_v1_57513c25e38f14cbb7c97731f3fc9b0078761455f20ede1af1c0f13c8290e9fe
DO_SPACE_ACCESS_KEY=DO00AU8LWGHAAL2AV9WE
DO_SPACE_SECRET_KEY=37DI8pZ5k6cfNMW9cFqGmdkjljWAtFL9OnkfIXMxCZk
DO_SPACE_ENDPOINT=sgp1.digitaloceanspaces.com
DO_SPACE_NAME=property-stewards
DO_SPACE_DIRECTORY=data
DO_SPACE_CDN=sgp1.cdn.digitaloceanspaces.com

# Wassenger WhatsApp
WASSENGER_API_KEY=0131ed1b23d83771b86a046fbdac27008fc97d5b2fa8c2c7abbfb0782022b9b7a23d99a860f353ed
WASSENGER_WEBHOOK_SECRET=f9f17f75-6a4c-4dcb-9356-95232682e3ed
WASSENGER_DEVICE_ID=your_device_id_here
```

## Steps to Add:

1. **Via Vercel Dashboard:**
   - Go to your project settings
   - Click "Environment Variables"
   - Add each variable one by one
   - Select all environments (Production, Preview, Development)
   - Click "Save"

2. **Via Vercel CLI:**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Add environment variables
vercel env add WASSENGER_WEBHOOK_SECRET production
# When prompted, paste: f9f17f75-6a4c-4dcb-9356-95232682e3ed

vercel env add WASSENGER_API_KEY production
# When prompted, paste: 0131ed1b23d83771b86a046fbdac27008fc97d5b2fa8c2c7abbfb0782022b9b7a23d99a860f353ed

# Add all other variables similarly...
```

3. **Redeploy After Adding Variables:**
```bash
# Trigger a new deployment to use the new environment variables
vercel --prod
```

## Verify Environment Variables:

After deployment, test again:
```bash
curl -X GET "https://property-stewards-app.vercel.app/api/whatsapp/webhook?secret=f9f17f75-6a4c-4dcb-9356-95232682e3ed"
```

Should return: `OK` (not "Invalid secret")