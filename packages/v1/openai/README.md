# OpenAI Assistant API Function

This function provides integration with OpenAI's Assistants API for managing conversation threads and memory.

## Features

- **Thread Management**: Create, retrieve, and delete conversation threads
- **Message Handling**: Send messages to threads and retrieve conversation history
- **Assistant Execution**: Run assistants on threads with automatic polling for completion
- **Memory Context**: Maintains conversation context through thread persistence

## API Endpoints

### Base URL
```
https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai
```

### Actions

#### Assistant Management

##### 1. Create Assistant
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=create-assistant&name=Property+Assistant&instructions=You+are+a+property+expert"
```

##### 2. List Assistants
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=list-assistants"
```

##### 3. Get Assistant
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=get-assistant&assistantId=asst_jwaJ70vlBYEvMd3hSvUjwOSU"
```

##### 4. Update Assistant
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=update-assistant&assistantId=asst_jwaJ70vlBYEvMd3hSvUjwOSU&name=Updated+Property+Assistant&instructions=New+instructions"
```

#### Thread Management

##### 5. Create Thread
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=create-thread"
```

##### 6. Send Message
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=send-message&threadId=thread_abc123&message=Hello"
```

##### 7. Run Assistant
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=run-assistant&threadId=thread_abc123&assistantId=asst_xyz789"
```

##### 8. Get Thread
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=get-thread&threadId=thread_abc123"
```

##### 9. List Messages
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=list-messages&threadId=thread_abc123"
```

##### 10. Delete Thread
```bash
curl -X GET "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/openai?action=delete-thread&threadId=thread_abc123"
```

## Configuration

Set the OpenAI API key in your environment:
```bash
doctl serverless fn config set v1/openai OPENAI_API_KEY your-api-key-here
```

## Example Workflow

```javascript
// 1. Create a new thread
const createResponse = await fetch('...?action=create-thread');
const { threadId } = await createResponse.json();

// 2. Send a message
await fetch(`...?action=send-message&threadId=${threadId}&message=What is the weather?`);

// 3. Run the assistant
const runResponse = await fetch(`...?action=run-assistant&threadId=${threadId}&assistantId=asst_xyz`);
const { response } = await runResponse.json();

// 4. Get conversation history
const messages = await fetch(`...?action=list-messages&threadId=${threadId}`);
```

## Response Format

All responses follow this structure:
```json
{
  "success": true/false,
  "data": {...},
  "error": "error message if applicable"
}
```

## Error Handling

The function includes comprehensive error handling for:
- Missing API key configuration
- Invalid parameters
- API rate limits
- Network failures
- Assistant run failures

## Notes

- The function automatically polls for assistant run completion
- Thread IDs persist conversation memory across sessions
- Messages are stored chronologically within threads
- Supports OpenAI Assistants API v2