const axios = require('axios');
const crypto = require('crypto');

// In-memory storage for chat sessions (resets on function cold start)
const chatSessions = {};

async function main(args) {
    const { action, threadId, message, assistantId, format } = args;
    
    // Only use environment variable for API key (never from parameters)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
        return {
            body: JSON.stringify({
                error: 'OpenAI API key not configured'
            })
        };
    }

    const headers = {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
    };

    try {
        let response;
        
        switch (action) {
            case 'create-assistant':
                // One-time setup: Create an assistant
                response = await axios.post(
                    'https://api.openai.com/v1/assistants',
                    {
                        name: args.name || 'Property Inspector Assistant',
                        instructions: args.instructions || 'You are a helpful assistant specializing in property inspection, real estate evaluation, and inspector guidance. Help users with property inspection questions and guide property inspectors through their work.',
                        model: args.model || 'gpt-3.5-turbo',
                        tools: []  // No tools for now
                    },
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        assistantId: response.data.id,
                        name: response.data.name,
                        model: response.data.model,
                        message: 'Assistant created! Save this ID in your Postman variables: ' + response.data.id
                    })
                };

            case 'list-assistants':
                // List all your assistants
                response = await axios.get(
                    'https://api.openai.com/v1/assistants',
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        assistants: response.data.data.map(a => ({
                            id: a.id,
                            name: a.name,
                            model: a.model,
                            created_at: a.created_at
                        })),
                        count: response.data.data.length
                    })
                };

            case 'get-assistant':
                // Get a specific assistant by ID
                if (!assistantId) {
                    return {
                        body: JSON.stringify({
                            error: 'assistantId is required'
                        })
                    };
                }
                
                response = await axios.get(
                    `https://api.openai.com/v1/assistants/${assistantId}`,
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        assistant: {
                            id: response.data.id,
                            name: response.data.name,
                            model: response.data.model,
                            instructions: response.data.instructions,
                            tools: response.data.tools,
                            created_at: response.data.created_at
                        }
                    })
                };

            case 'update-assistant':
                // Update an existing assistant
                if (!assistantId) {
                    return {
                        body: JSON.stringify({
                            error: 'assistantId is required'
                        })
                    };
                }
                
                const updateData = {};
                if (args.name) updateData.name = args.name;
                if (args.instructions) updateData.instructions = args.instructions;
                if (args.model) updateData.model = args.model;
                if (args.tools !== undefined) updateData.tools = args.tools || [];
                
                response = await axios.post(
                    `https://api.openai.com/v1/assistants/${assistantId}`,
                    updateData,
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        assistantId: response.data.id,
                        name: response.data.name,
                        model: response.data.model,
                        instructions: response.data.instructions,
                        message: 'Assistant updated successfully'
                    })
                };

            case 'quick-chat':
                // Quick chat - create thread, send message, run assistant, and get response
                if (!assistantId) {
                    return {
                        body: JSON.stringify({
                            error: 'assistantId is required for quick-chat'
                        })
                    };
                }
                if (!message) {
                    return {
                        body: JSON.stringify({
                            error: 'message is required for quick-chat'
                        })
                    };
                }

                // Step 1: Create a new thread
                const quickThreadResponse = await axios.post(
                    'https://api.openai.com/v1/threads',
                    {},
                    { headers }
                );
                const quickThreadId = quickThreadResponse.data.id;

                // Step 2: Add message to thread
                await axios.post(
                    `https://api.openai.com/v1/threads/${quickThreadId}/messages`,
                    {
                        role: 'user',
                        content: message
                    },
                    { headers }
                );

                // Step 3: Run the assistant
                const quickRunResponse = await axios.post(
                    `https://api.openai.com/v1/threads/${quickThreadId}/runs`,
                    {
                        assistant_id: assistantId
                    },
                    { headers }
                );
                const quickRunId = quickRunResponse.data.id;

                // Step 4: Wait for completion
                let quickRunStatus = 'in_progress';
                let attempts = 0;
                const maxAttempts = 30;
                
                while (quickRunStatus === 'in_progress' || quickRunStatus === 'queued') {
                    if (attempts >= maxAttempts) {
                        return {
                            body: JSON.stringify({
                                error: 'Timeout waiting for assistant response',
                                threadId: quickThreadId,
                                runId: quickRunId
                            })
                        };
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const statusResponse = await axios.get(
                        `https://api.openai.com/v1/threads/${quickThreadId}/runs/${quickRunId}`,
                        { headers }
                    );
                    quickRunStatus = statusResponse.data.status;
                    attempts++;
                }

                if (quickRunStatus !== 'completed') {
                    return {
                        body: JSON.stringify({
                            error: `Run failed with status: ${quickRunStatus}`,
                            threadId: quickThreadId,
                            runId: quickRunId
                        })
                    };
                }

                // Step 5: Get messages
                const quickMessagesResponse = await axios.get(
                    `https://api.openai.com/v1/threads/${quickThreadId}/messages`,
                    { headers }
                );

                const quickAssistantMessage = quickMessagesResponse.data.data.find(msg => msg.role === 'assistant');
                const quickResponseContent = quickAssistantMessage?.content?.[0]?.text?.value || 'No response';

                return {
                    body: JSON.stringify({
                        success: true,
                        response: quickResponseContent,
                        threadId: quickThreadId,
                        runId: quickRunId,
                        message: 'Quick chat completed successfully'
                    })
                };

            case 'create-thread':
                response = await axios.post(
                    'https://api.openai.com/v1/threads',
                    {
                        metadata: {
                            type: 'property_inspection',
                            created_via: 'digitalocean_function'
                        }
                    },
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        threadId: response.data.id,
                        createdAt: response.data.created_at,
                        message: 'Thread created! Use chat-thread action to send messages without needing an assistant.'
                    })
                };

            case 'send-message':
                if (!threadId || !message) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId and message are required'
                        })
                    };
                }
                
                response = await axios.post(
                    `https://api.openai.com/v1/threads/${threadId}/messages`,
                    {
                        role: 'user',
                        content: message
                    },
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        messageId: response.data.id,
                        threadId: threadId,
                        content: response.data.content
                    })
                };

            case 'run-assistant':
                if (!threadId || !assistantId) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId and assistantId are required'
                        })
                    };
                }
                
                response = await axios.post(
                    `https://api.openai.com/v1/threads/${threadId}/runs`,
                    {
                        assistant_id: assistantId
                    },
                    { headers }
                );
                
                const runId = response.data.id;
                
                // Poll for completion
                let runStatus = 'in_progress';
                let runData;
                while (runStatus === 'in_progress' || runStatus === 'queued') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const statusResponse = await axios.get(
                        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
                        { headers }
                    );
                    runData = statusResponse.data;
                    runStatus = runData.status;
                }
                
                if (runStatus === 'completed') {
                    // Get the latest message from the assistant
                    const messagesResponse = await axios.get(
                        `https://api.openai.com/v1/threads/${threadId}/messages`,
                        { headers }
                    );
                    
                    const assistantMessage = messagesResponse.data.data.find(
                        msg => msg.role === 'assistant'
                    );
                    
                    return {
                        body: JSON.stringify({
                            success: true,
                            runId: runId,
                            status: runStatus,
                            response: assistantMessage?.content[0]?.text?.value || 'No response'
                        })
                    };
                } else {
                    return {
                        body: JSON.stringify({
                            success: false,
                            runId: runId,
                            status: runStatus,
                            error: runData.last_error
                        })
                    };
                }

            case 'get-thread':
                if (!threadId) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId is required'
                        })
                    };
                }
                
                response = await axios.get(
                    `https://api.openai.com/v1/threads/${threadId}`,
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        thread: response.data
                    })
                };

            case 'list-messages':
                if (!threadId) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId is required'
                        })
                    };
                }
                
                response = await axios.get(
                    `https://api.openai.com/v1/threads/${threadId}/messages`,
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        messages: response.data.data.map(msg => ({
                            id: msg.id,
                            role: msg.role,
                            content: msg.content[0]?.text?.value || '',
                            createdAt: msg.created_at
                        }))
                    })
                };

            case 'chat':
                if (!message) {
                    return {
                        body: JSON.stringify({
                            error: 'message is required for chat'
                        })
                    };
                }
                
                const model = args.model || 'gpt-3.5-turbo';
                const temperature = args.temperature || 0.7;
                const max_tokens = args.max_tokens || 1000;
                
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: args.systemPrompt || 'You are a helpful assistant specializing in property inspection and real estate evaluation.'
                            },
                            {
                                role: 'user',
                                content: message
                            }
                        ],
                        temperature: temperature,
                        max_tokens: max_tokens
                    },
                    { 
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                return {
                    body: JSON.stringify({
                        success: true,
                        message: response.data.choices[0].message.content,
                        model: response.data.model,
                        usage: response.data.usage
                    })
                };

            case 'create-chat-session':
                // Create a new chat session with a unique ID
                const sessionId = 'chat_' + crypto.randomBytes(12).toString('hex');
                chatSessions[sessionId] = {
                    messages: [
                        {
                            role: 'system',
                            content: args.systemPrompt || 'You are a helpful assistant specializing in property inspection and real estate evaluation.'
                        }
                    ],
                    createdAt: Date.now(),
                    model: args.model || 'gpt-3.5-turbo'
                };
                
                return {
                    body: JSON.stringify({
                        success: true,
                        sessionId: sessionId,
                        message: 'Chat session created successfully'
                    })
                };

            case 'chat-thread':
                // Simple thread-like chat using OpenAI's context management
                if (!threadId || !message) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId and message are required for chat-thread'
                        })
                    };
                }
                
                // Get thread messages to maintain context
                try {
                    const messagesResponse = await axios.get(
                        `https://api.openai.com/v1/threads/${threadId}/messages`,
                        { headers }
                    );
                    
                    // Convert thread messages to chat format
                    const threadMessages = messagesResponse.data.data.reverse().map(msg => ({
                        role: msg.role,
                        content: msg.content[0]?.text?.value || ''
                    }));
                    
                    // Add system message if this is first message
                    if (threadMessages.length === 0) {
                        threadMessages.push({
                            role: 'system',
                            content: args.systemPrompt || 'You are a helpful assistant specializing in property inspection and real estate evaluation.'
                        });
                    }
                    
                    // Add new user message
                    threadMessages.push({
                        role: 'user',
                        content: message
                    });
                    
                    // Get chat completion
                    const chatResponse = await axios.post(
                        'https://api.openai.com/v1/chat/completions',
                        {
                            model: args.model || 'gpt-3.5-turbo',
                            messages: threadMessages,
                            temperature: args.temperature || 0.7,
                            max_tokens: args.max_tokens || 1000
                        },
                        { 
                            headers: {
                                'Authorization': `Bearer ${openaiApiKey}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    const assistantReply = chatResponse.data.choices[0].message.content;
                    
                    // Store both messages in thread
                    await axios.post(
                        `https://api.openai.com/v1/threads/${threadId}/messages`,
                        {
                            role: 'user',
                            content: message
                        },
                        { headers }
                    );
                    
                    await axios.post(
                        `https://api.openai.com/v1/threads/${threadId}/messages`,
                        {
                            role: 'assistant',
                            content: assistantReply
                        },
                        { headers }
                    );
                    
                    return {
                        body: JSON.stringify({
                            success: true,
                            threadId: threadId,
                            message: assistantReply,
                            model: chatResponse.data.model,
                            usage: chatResponse.data.usage
                        })
                    };
                    
                } catch (error) {
                    // If thread doesn't exist or error, create new thread
                    if (error.response?.status === 404) {
                        const newThreadResponse = await axios.post(
                            'https://api.openai.com/v1/threads',
                            {},
                            { headers }
                        );
                        
                        // Retry with new thread
                        return await main({
                            ...args,
                            threadId: newThreadResponse.data.id,
                            action: 'chat-thread'
                        });
                    }
                    throw error;
                }

            case 'chat-session':
                if (!args.sessionId) {
                    return {
                        body: JSON.stringify({
                            error: 'sessionId is required for chat-session'
                        })
                    };
                }
                
                if (!message) {
                    return {
                        body: JSON.stringify({
                            error: 'message is required for chat'
                        })
                    };
                }
                
                // Get or create session
                let session = chatSessions[args.sessionId];
                if (!session) {
                    // Create new session if doesn't exist
                    session = {
                        messages: [
                            {
                                role: 'system',
                                content: args.systemPrompt || 'You are a helpful assistant specializing in property inspection and real estate evaluation.'
                            }
                        ],
                        createdAt: Date.now(),
                        model: args.model || 'gpt-3.5-turbo'
                    };
                    chatSessions[args.sessionId] = session;
                }
                
                // Add user message to session
                session.messages.push({
                    role: 'user',
                    content: message
                });
                
                // Call OpenAI with full conversation history
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: session.model,
                        messages: session.messages,
                        temperature: args.temperature || 0.7,
                        max_tokens: args.max_tokens || 1000
                    },
                    { 
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                // Add assistant response to session
                const assistantMessage = response.data.choices[0].message;
                session.messages.push(assistantMessage);
                
                // Clean up old sessions (older than 1 hour)
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                Object.keys(chatSessions).forEach(key => {
                    if (chatSessions[key].createdAt < oneHourAgo) {
                        delete chatSessions[key];
                    }
                });
                
                return {
                    body: JSON.stringify({
                        success: true,
                        sessionId: args.sessionId,
                        message: assistantMessage.content,
                        model: response.data.model,
                        usage: response.data.usage,
                        messageCount: session.messages.length - 1 // Exclude system message
                    })
                };

            case 'get-chat-history':
                if (!args.sessionId) {
                    return {
                        body: JSON.stringify({
                            error: 'sessionId is required'
                        })
                    };
                }
                
                const historySession = chatSessions[args.sessionId];
                if (!historySession) {
                    return {
                        body: JSON.stringify({
                            error: 'Session not found',
                            sessionId: args.sessionId
                        })
                    };
                }
                
                return {
                    body: JSON.stringify({
                        success: true,
                        sessionId: args.sessionId,
                        messages: historySession.messages.filter(m => m.role !== 'system'),
                        totalMessages: historySession.messages.length - 1,
                        createdAt: historySession.createdAt
                    })
                };

            case 'chat-with-context':
                if (!message) {
                    return {
                        body: JSON.stringify({
                            error: 'message is required for chat'
                        })
                    };
                }
                
                // Parse context messages if provided
                let messages = [];
                
                // Add system prompt
                messages.push({
                    role: 'system',
                    content: args.systemPrompt || 'You are a helpful assistant specializing in property inspection and real estate evaluation.'
                });
                
                // Add context messages if provided
                if (args.context) {
                    try {
                        const contextMessages = JSON.parse(args.context);
                        messages = messages.concat(contextMessages);
                    } catch (e) {
                        console.log('No context or invalid context provided');
                    }
                }
                
                // Add current message
                messages.push({
                    role: 'user',
                    content: message
                });
                
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: args.model || 'gpt-3.5-turbo',
                        messages: messages,
                        temperature: args.temperature || 0.7,
                        max_tokens: args.max_tokens || 1000
                    },
                    { 
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                return {
                    body: JSON.stringify({
                        success: true,
                        message: response.data.choices[0].message.content,
                        model: response.data.model,
                        usage: response.data.usage,
                        totalMessages: messages.length
                    })
                };

            case 'delete-thread':
                if (!threadId) {
                    return {
                        body: JSON.stringify({
                            error: 'threadId is required'
                        })
                    };
                }
                
                response = await axios.delete(
                    `https://api.openai.com/v1/threads/${threadId}`,
                    { headers }
                );
                return {
                    body: JSON.stringify({
                        success: true,
                        deleted: true,
                        threadId: threadId
                    })
                };

            default:
                return {
                    body: JSON.stringify({
                        error: 'Invalid action. Valid actions: create-assistant, list-assistants, get-assistant, update-assistant, quick-chat, chat, create-chat-session, chat-session, get-chat-history, chat-with-context, create-thread, send-message, run-assistant, get-thread, list-messages, delete-thread',
                        receivedAction: action
                    })
                };
        }
    } catch (error) {
        console.error('OpenAI API Error:', error.response?.data || error.message);
        return {
            body: JSON.stringify({
                error: error.response?.data?.error?.message || error.message,
                status: error.response?.status
            })
        };
    }
}

// Add quick-chat to exports for documentation
exports.quickChat = async function(assistantId, message) {
    // This is a helper function for quick chat
    return exports.main({
        action: 'quick-chat',
        assistantId: assistantId,
        message: message
    });
};

exports.main = main;