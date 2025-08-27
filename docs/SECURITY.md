# Security Best Practices

## Overview
This document outlines security measures implemented in the Property Stewards serverless functions and provides guidelines for maintaining security.

## Security Implementations

### 1. Environment Variables
All sensitive configuration is stored in environment variables, never in code.

#### ✅ Implemented Security Measures:
- **No hardcoded credentials** - All API keys and passwords are in environment variables
- **Server-side only** - API keys are never sent from client or exposed in URLs
- **Automatic loading** - project.yml configures environment variables during deployment

#### Configuration Files:
```bash
.env.local          # Local development (never commit)
.env               # Production values (never commit)
.env.example       # Template for developers (safe to commit)
```

### 2. Database Security

#### ✅ Implemented Protections:

**SQL Injection Prevention**
```javascript
// SECURE: Using parameterized queries
const query = 'SELECT * FROM posts WHERE id = $1';
const result = await client.query(query, [postId]);

// INSECURE: Never do this!
// const query = `SELECT * FROM posts WHERE id = ${postId}`;
```

**Connection Security**
```javascript
const dbConfig = {
    ssl: { rejectUnauthorized: false },  // SSL enabled
    statement_timeout: 10000,            // Prevent long-running queries
    query_timeout: 10000,                // Overall query timeout
    connect_timeout: 3000                // Fast connection failure
};
```

**Input Validation**
```javascript
// Whitelist allowed fields
const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at', 'title'];
const sortField = ALLOWED_SORT_FIELDS.includes(params.sortBy) 
    ? params.sortBy 
    : 'created_at';
```

### 3. API Security

#### OpenAI API Protection:
- ✅ API key only in environment variables
- ✅ Never accepted as URL parameter
- ✅ Rate limiting through OpenAI dashboard
- ✅ Usage monitoring enabled

#### Function Security:
```javascript
// API key validation
if (!process.env.OPENAI_API_KEY) {
    return { error: 'OpenAI API key not configured' };
}

// Never expose API key in responses
// Never log API keys
```

### 4. Input Validation

#### All CRUD Operations Validate Input:
```javascript
function validatePost(params) {
    const errors = [];
    
    // Type validation
    if (typeof params.title !== 'string') {
        errors.push('Title must be a string');
    }
    
    // Length validation
    if (params.title.length > 200) {
        errors.push('Title must be <= 200 characters');
    }
    
    // Format validation
    if (params.email && !isValidEmail(params.email)) {
        errors.push('Invalid email format');
    }
    
    return errors;
}
```

### 5. Error Handling

#### Secure Error Messages:
```javascript
try {
    // Database operation
} catch (error) {
    // Log detailed error internally
    console.error('Database error:', error);
    
    // Return generic error to client
    return {
        error: 'An error occurred',
        // Never include: error.message or error.stack
    };
}
```

### 6. Authentication & Authorization

#### Current Implementation:
- Functions are publicly accessible (by design for demo)
- API keys stored securely server-side

#### Recommended Enhancements:
```javascript
// Add JWT authentication
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
};

// Add to function handler
if (!verifyToken(args.token)) {
    return { error: 'Unauthorized' };
}
```

## Security Checklist

### Before Deployment:
- [ ] No hardcoded credentials in any file
- [ ] All `.env` files in `.gitignore`
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention using parameterized queries
- [ ] Generic error messages (no stack traces)
- [ ] SSL enabled for database connections
- [ ] Environment variables configured in project.yml

### Regular Security Tasks:

#### Daily:
- Monitor function logs for suspicious activity
- Check for failed authentication attempts

#### Weekly:
- Review OpenAI API usage
- Check database connection logs
- Review error logs for patterns

#### Monthly:
- Rotate API keys
- Update database passwords
- Review and update dependencies
- Security audit of new code

#### Quarterly:
- Full security review
- Penetration testing
- Update security documentation

## Common Security Vulnerabilities and Fixes

### 1. SQL Injection
**Vulnerability:**
```javascript
// DANGEROUS
const query = `SELECT * FROM posts WHERE title = '${userInput}'`;
```

**Fix:**
```javascript
// SAFE
const query = 'SELECT * FROM posts WHERE title = $1';
await client.query(query, [userInput]);
```

### 2. API Key Exposure
**Vulnerability:**
```javascript
// DANGEROUS
const apiKey = 'sk-proj-abc123...';
```

**Fix:**
```javascript
// SAFE
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error('API key not configured');
}
```

### 3. Information Disclosure
**Vulnerability:**
```javascript
// DANGEROUS
catch (error) {
    return { 
        error: error.message,
        stack: error.stack,
        query: failedQuery 
    };
}
```

**Fix:**
```javascript
// SAFE
catch (error) {
    console.error('Internal error:', error);
    return { error: 'An error occurred' };
}
```

### 4. Unvalidated Input
**Vulnerability:**
```javascript
// DANGEROUS
const limit = params.limit;  // Could be anything!
```

**Fix:**
```javascript
// SAFE
const limit = Math.min(Math.max(parseInt(params.limit) || 10, 1), 100);
```

## Incident Response

### If a Security Breach Occurs:

1. **Immediate Actions:**
   - Rotate all API keys immediately
   - Change database passwords
   - Review recent logs for suspicious activity
   - Disable affected functions if necessary

2. **Investigation:**
   ```bash
   # Check recent function invocations
   doctl sls activations list --limit 50
   
   # Review specific activation
   doctl sls activations logs [ACTIVATION_ID]
   ```

3. **Recovery:**
   - Deploy patched version
   - Monitor for continued suspicious activity
   - Document incident and lessons learned

## Security Tools and Commands

### Monitoring Commands:
```bash
# View recent errors
doctl sls activations list --limit 20 | grep error

# Check function configuration
doctl sls fn get v1/openai

# View environment variables (careful with output!)
doctl sls fn config get v1/openai
```

### Security Testing:
```bash
# Test SQL injection (should fail safely)
curl "https://your-function-url/getPosts?sortBy='; DROP TABLE posts;--"

# Test missing authentication
curl "https://your-function-url/openai"

# Test invalid input
curl "https://your-function-url/createPost" \
  -d '{"title": "x".repeat(1000)}'
```

## Compliance and Standards

### Data Protection:
- Never store sensitive user data in logs
- Implement data retention policies
- Use encryption for sensitive data at rest

### GDPR Compliance:
- Provide data export functionality
- Implement right to deletion
- Document data processing activities

### PCI DSS (if handling payments):
- Never store credit card numbers
- Use tokenization services
- Implement audit logging

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [DigitalOcean Security Best Practices](https://docs.digitalocean.com/products/droplets/resources/best-practices/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

## Contact for Security Issues

If you discover a security vulnerability:
1. Do NOT create a public issue
2. Document the vulnerability with steps to reproduce
3. Contact the security team immediately
4. Allow time for patching before disclosure

---

*Last Updated: 2025*
*Version: 1.0.0*