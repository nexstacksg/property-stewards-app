# Post API Examples

## Base URL
```
https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1
```

## 1. Create Post
```bash
# Create a new post
curl -X POST "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/createPost" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "This is the content of my first post",
    "author": "John Doe",
    "category": "Technology",
    "tags": ["tech", "tutorial"],
    "status": "published"
  }'

# CLI version
doctl sls fn invoke v1/createPost --param title:"My First Post" --param content:"This is the content" --param author:"John Doe"
```

## 2. Get Posts
```bash
# Get all posts
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/getPosts"

# Get posts with filters
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/getPosts?author=John%20Doe&status=published"

# Get posts with pagination
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/getPosts?limit=5&offset=0"

# Get posts sorted by likes
curl "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/getPosts?sortBy=likes&sortOrder=desc"

# CLI version
doctl sls fn invoke v1/getPosts --param author:"John Doe" --param status:"published"
```

## 3. Update Post
```bash
# Update a post
curl -X POST "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/updatePost" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "title": "Updated Post Title",
    "content": "Updated content",
    "status": "published"
  }'

# Update only specific fields
curl -X POST "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/updatePost" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "views": 100,
    "likes": 25
  }'

# CLI version
doctl sls fn invoke v1/updatePost --param id:1 --param title:"Updated Title"
```

## 4. Delete Post
```bash
# Delete a post
curl -X POST "https://faas-sgp1-18bc02ac.doserverless.co/api/v1/web/fn-33bf9903-4999-4c1f-b977-ff57fd5d1607/v1/deletePost" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1
  }'

# CLI version
doctl sls fn invoke v1/deletePost --param id:1
```

## Query Parameters for getPosts

- **id**: Get specific post by ID
- **author**: Filter by author name
- **status**: Filter by status (draft, published, archived)
- **category**: Filter by category
- **sortBy**: Sort by field (created_at, updated_at, likes, views)
- **sortOrder**: Sort order (asc, desc)
- **limit**: Number of posts to return (default: 10)
- **offset**: Number of posts to skip for pagination (default: 0)

## Post Schema

```javascript
{
  id: number,
  title: string,
  content: string,
  author: string,
  category: string,
  tags: string[],
  status: 'draft' | 'published' | 'archived',
  views: number,
  likes: number,
  created_at: timestamp,
  updated_at: timestamp
}
```