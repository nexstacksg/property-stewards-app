# OpenAI Assistants API Implementation

## Property Inspector Assistant v0.2

This document describes the OpenAI Assistants API implementation used in the Property Stewards inspection chat system.

---

## 🤖 Assistant Configuration

**Assistant Name:** Property Inspector Assistant v0.2  
**Model:** gpt-4o-mini  
**Purpose:** Help property inspectors manage their daily inspection tasks via chat

### Key Capabilities:

- Show today's inspection jobs for an inspector
- Help select and start specific inspection jobs
- Guide through room-by-room inspection workflow
- Track task completion and progress
- Provide helpful guidance throughout the inspection process

### Formatting Guidelines:

- Uses numbered brackets `[1], [2], [3]` for ALL options to make selection easier
- Includes emojis for visual clarity (🏠 property, ⏰ time, ⭐ priority)
- Provides clear line breaks between options
- Always ends option lists with "Type the number to select"

---

## 🧵 Thread Management

### What is a Thread?

A Thread in the Assistants API uniquely identifies a conversation session. It stores:

- All messages in the conversation
- Context from previous interactions
- Session state across API calls

### Implementation:

```javascript
// Thread storage (using Map for demo, use Redis/DB in production)
const threadStore = new Map<string, string>();

// Create new thread for session
const thread = await openai.beta.threads.create();
threadId = thread.id;
threadStore.set(sessionId, threadId);
```

---

## 🛠️ Available Tools (Functions)

The assistant has access to 4 custom functions for inspector operations:

### 1. `getTodayJobs`

- **Purpose:** Get list of inspection jobs assigned for today
- **Parameters:**
  - `inspectorId` (optional) - Inspector's UUID from authenticated session
  - `inspectorPhone` (optional) - Phone number for ID lookup
- **Returns:** List of jobs with property, customer, time, status, priority
- **Note:** Inspector identification derived from authenticated session context

### 2. `selectJob`

- **Purpose:** Select and start a specific inspection job
- **Parameters:**
  - `jobId` (required) - Work order ID to select
- **Returns:** Job details, locations, and progress information
- **Side Effect:** Updates work order status to 'in_progress'

### 3. `getJobLocations`

- **Purpose:** Get rooms/areas for the current inspection job
- **Parameters:**
  - `jobId` (required) - Work order ID
- **Returns:** List of locations with task counts and completion status

### 4. `completeTask`

- **Purpose:** Mark a specific inspection task as complete
- **Parameters:**
  - `taskId` (required) - Task ID to complete
  - `notes` (optional) - Additional notes about the task
  - `workOrderId` (required) - Work order ID for progress tracking
- **Returns:** Updated progress and next action suggestion

---

## 📡 API Flow

### 1. Message Processing:

```javascript
// Add user message to thread
await openai.beta.threads.messages.create(threadId, {
  role: "user",
  content: message,
});
```

### 2. Run Creation:

```javascript
// Run the assistant on the thread
const run = await openai.beta.threads.runs.create(threadId, {
  assistant_id: currentAssistantId,
});
```

### 3. Tool Execution:

- Wait for run status to become 'requires_action'
- Execute requested tools with provided arguments
- Submit tool outputs back to the thread
- Wait for final completion

### 4. Response Retrieval:

```javascript
// Get the latest assistant message
const messages = await openai.beta.threads.messages.list(threadId);
const lastMessage = messages.data[0];
```

---

## 🔄 Run Status Lifecycle

1. **`queued`** - Run is waiting to be processed
2. **`in_progress`** - Run is being processed
3. **`requires_action`** - Assistant needs tool outputs
4. **`completed`** - Run finished successfully
5. **`failed`** - Run encountered an error

---

## ⚙️ Implementation Notes

### Session Management:

- Each chat session gets a unique `sessionId`
- Thread IDs are mapped to session IDs for persistence
- Threads maintain conversation context across messages
- Inspector identification handled dynamically via authentication

### Error Handling:

- 30-second timeout for run completion
- Graceful fallback for tool execution failures
- Detailed error logging for debugging

### Testing:

- Inspectors authenticate using their phone number or system-assigned ID
- Assistant recreated on server restart (assistantId reset to null)
- Test data should be configurable via environment variables or test fixtures

---

## 📚 Required Environment Variables

```env
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Test Configuration
TEST_INSPECTOR_PHONE=+65xxxxxxxx  # For testing purposes
TEST_INSPECTOR_ID=uuid-here        # For testing purposes
```

---

## 🚀 Future Enhancements

- Implement Redis/database for thread storage (currently using in-memory Map)
- Add photo upload handling via `addTaskPhoto` function
- Implement work order status management
- Add proper inspector authentication system with JWT/session tokens
- Support for multiple inspectors working on same job
- Real-time progress updates to admin dashboard
- Dynamic inspector assignment and routing based on availability