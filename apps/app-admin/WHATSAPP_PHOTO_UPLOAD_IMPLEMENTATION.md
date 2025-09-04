# WhatsApp Photo Upload Implementation

## Overview
The WhatsApp bot now supports photo uploads during inspections. When an inspector selects a location and uploads photos via WhatsApp, they are automatically:
1. Downloaded from WhatsApp/Wassenger
2. Uploaded to DigitalOcean Spaces
3. Saved to the ContractChecklistItem database

## How It Works

### 1. Media Detection
When a WhatsApp message arrives, the webhook checks for media:
```typescript
const hasMedia = data.type === 'image' || 
                data.type === 'video' ||
                data.media || 
                data.message?.imageMessage
```

### 2. Context Validation
Before processing media, the system checks:
- Thread exists (user has started conversation)
- Work order is selected (job context exists)
- Location is selected (knows where to save photos)

If any context is missing, it returns helpful error messages:
- No thread: "Please start a conversation first"
- No job: "Please select a job first"
- No location: "Please select a location first before uploading photos"

### 3. Media Processing Flow

#### Download from WhatsApp
```typescript
const response = await fetch(mediaUrl, {
  headers: {
    'User-Agent': 'Property-Stewards-Bot/1.0',
    'Accept': 'image/*,video/*,*/*'
  }
});
```

#### Upload to DigitalOcean Spaces
- Path format: `data/{customer-name}-{postal-code}/{location-name}/photos/{uuid}.jpeg`
- Example: `data/hang-822121/living-room/photos/abc123.jpeg`
- Public URL returned for database storage

#### Save to Database
```typescript
// Find the ContractChecklistItem for the current location
const matchingItem = workOrder.contract.contractChecklist.items.find(
  item => item.name.toLowerCase() === locationName.toLowerCase()
);

// Update photos array
await prisma.contractChecklistItem.update({
  where: { id: matchingItem.id },
  data: {
    photos: [...currentPhotos, publicUrl]
  }
});
```

## User Experience

### Inspector Workflow
1. Select job: "1" 
2. Confirm job: "1" (Yes)
3. Select location: "1" (Living Room)
4. Upload photo via WhatsApp
5. Receive confirmation: "✅ Photo uploaded successfully for Living Room!"

### Error Messages
- No job selected: "Please select a job first before uploading media"
- No location selected: "📍 Please select a location first before uploading photos"
- Upload failed: "Failed to upload media. Please try again"

## Key Files Modified

### `/src/app/api/whatsapp/webhook/route.ts`
- `handleMediaMessage()` function processes all media uploads
- Extracts media URL from various Wassenger formats
- Downloads media and uploads to DigitalOcean
- Updates ContractChecklistItem with photo URLs

## Logging & Debugging

Enhanced logging added for troubleshooting:
```
💾 Saving media to database for location: Living Room
📍 Work Order ID: cm4xxx
✅ Found contract checklist with 5 items
✅ Found matching checklist item: cm4yyy for location: Living Room
📷 Current photos count: 0
✅ Photo saved to database. Total photos now: 1
📸 Photo URL added: https://property-stewards.sgp1.digitaloceanspaces.com/...
```

## Important Implementation Details

1. **Phone Number Normalization**: Removes +, spaces, dashes for consistent thread management
2. **Thread Metadata**: Stores currentLocation, workOrderId, customerName for context
3. **Location Tracking**: Updates when inspector selects a location via getTasksForLocation
4. **Media URL Detection**: Handles multiple Wassenger webhook formats (data.url, data.media.url, etc.)
5. **Database Update**: Appends to existing photos array (doesn't overwrite)

## Testing Checklist

- [x] Media detection from WhatsApp webhook
- [x] Context validation (job and location required)
- [x] Download from WhatsApp/Wassenger
- [x] Upload to DigitalOcean Spaces
- [x] Save URL to ContractChecklistItem
- [x] Success message to inspector
- [x] Error handling and user feedback

## Known Limitations

1. Photos must be uploaded after selecting a location
2. Each photo is processed individually (no batch upload)
3. No photo deletion via WhatsApp (must use admin portal)
4. Maximum file size limited by Wassenger (typically 16MB)