# Wassenger WhatsApp Integration Testing Guide

## Prerequisites
- Wassenger account with active WhatsApp Business API connection
- Webhook URL configured in Wassenger dashboard
- Environment variables set in Vercel

## 1. Verify Webhook Configuration in Wassenger

1. Log into your Wassenger dashboard: https://app.wassenger.com
2. Navigate to **Webhooks** or **API Settings**
3. Ensure your webhook is configured:
   - URL: `https://property-stewards-app.vercel.app/api/whatsapp/webhook?secret=f9f17f75-6a4c-4dcb-9356-95232682e3ed`
   - Events: Enable "Incoming messages" or "message:in:new"
   - Method: POST
   - Status: Active

## 2. Test Webhook Verification

```bash
# Test GET request (webhook verification)
curl -X GET "https://property-stewards-app.vercel.app/api/whatsapp/webhook?secret=f9f17f75-6a4c-4dcb-9356-95232682e3ed"

# Expected response: "OK" with status 200
```

## 3. Test with Wassenger Test Tool

1. In Wassenger dashboard, look for "Test Webhook" button
2. Send a test payload to verify connection
3. Check Vercel logs for incoming webhook data

## 4. Send Test WhatsApp Messages

### Test Messages to Send:

**Basic Greeting:**
```
Hi
```
Expected: Greeting response from assistant

**Show Jobs:**
```
Show me my jobs today
```
Expected: List of today's inspection jobs

**Select a Job:**
```
1
```
Expected: Job confirmation details

**Confirm Job:**
```
yes
```
Expected: Job started, show locations

**Select Location:**
```
2
```
Expected: Tasks for that location

**Complete Task:**
```
3
```
Expected: Task marked complete

**Upload Media Test:**
- Send a photo via WhatsApp
- Expected: Photo received confirmation

## 5. Monitor Logs in Real-Time

### Vercel Logs:
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# View real-time logs
vercel logs https://property-stewards-app.vercel.app --follow
```

### What to Look For:
- `✅ Webhook verified` - GET request successful
- `📱 WhatsApp webhook received` - POST request received
- `📨 Message from [phone]: [message]` - Message processing
- `✅ Message sent to [phone]` - Response sent back

## 6. Test with Your Phone

1. Add the Wassenger WhatsApp Business number to your contacts
2. Send a WhatsApp message to that number
3. Wait for response (usually 2-5 seconds)
4. Check Vercel logs for processing details

## 7. Debugging Common Issues

### No Response Received:
- Check Wassenger webhook is active
- Verify secret token matches
- Check Vercel function logs for errors
- Ensure WASSENGER_API_KEY is set in Vercel env vars

### "Unauthorized" Error:
- Secret token mismatch
- Check URL has correct secret parameter

### "Inspector not found":
- Phone number not in database
- Phone format mismatch (check with/without country code)

### Assistant Not Responding:
- Check OPENAI_API_KEY is valid
- Monitor OpenAI API usage/limits
- Check for OpenAI API errors in logs

## 8. Test Database Integration

1. Create test inspector in database:
```sql
-- Run in your database
INSERT INTO "Inspector" (id, name, email, phone, status)
VALUES ('test-inspector-id', 'Test Inspector', 'test@example.com', '6591234567', 'active');
```

2. Send WhatsApp from that phone number
3. Verify inspector is recognized

## 9. Load Testing (Optional)

Send multiple messages rapidly to test:
- Rate limiting
- Concurrent message handling
- Response time under load

## 10. Production Checklist

- [ ] Webhook URL is using HTTPS
- [ ] Secret token is strong and unique
- [ ] Environment variables set in Vercel
- [ ] Error handling for API failures
- [ ] Logging for debugging
- [ ] Rate limiting considered
- [ ] Database has inspector records
- [ ] OpenAI API has sufficient credits

## Troubleshooting Commands

```bash
# Check if webhook endpoint is accessible
curl -I https://property-stewards-app.vercel.app/api/whatsapp/webhook

# Test with sample Wassenger payload
curl -X POST https://property-stewards-app.vercel.app/api/whatsapp/webhook?secret=f9f17f75-6a4c-4dcb-9356-95232682e3ed \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message:in:new",
    "data": {
      "fromNumber": "+6591234567",
      "body": "Hi",
      "id": "test-message-id"
    }
  }'

# View Vercel function logs
vercel logs --prod --since 10m
```

## Support Resources

- Wassenger API Docs: https://api.wassenger.com/docs
- Wassenger Support: support@wassenger.com
- Vercel Logs: https://vercel.com/[your-username]/property-stewards-app/logs
- OpenAI Status: https://status.openai.com