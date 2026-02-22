# GreatesTODO Backend

RESTful API backend for the GreatesTODO application — a full-featured TODO app with user authentication, rich filtering, search, and real-time data via Firebase Firestore.

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express 4
- **Database**: GCP Firestore (Firebase Admin SDK)
- **Auth**: Firebase Authentication (ID token verification)
- **Validation**: Joi
- **Security**: Helmet, CORS, express-rate-limit
- **Logging**: Morgan
- **Deployment**: Render

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- A Firebase project with Firestore and Authentication enabled
- Firebase service account key (JSON)
- Firebase Web API Key

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required environment variables:

   | Variable | Description | Required |
   |----------|-------------|----------|
   | `PORT` | Server port (default: 5000) | No |
   | `NODE_ENV` | Environment (`development`/`production`) | No |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON string | **Yes** |
   | `FIREBASE_API_KEY` | Firebase Web API Key | **Yes** |
   | `CORS_ORIGINS` | Additional allowed CORS origins (comma-separated) | No |

3. **Getting Firebase credentials:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project → Project Settings → Service Accounts
   - Click "Generate new private key" → Download JSON
   - Paste the entire JSON as a single-line string in `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Get the Web API Key from Project Settings → General

### Running the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:5000` by default.

## API Reference

### Base URL
`/api`

### Health Check
```
GET /health
```
Returns server status, uptime, and environment.

### Authentication

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (201):**
```json
{
  "token": "<firebase-id-token>",
  "user": { "uid": "abc123", "email": "user@example.com" }
}
```

**Password requirements:** Min 8 chars, at least one uppercase, one lowercase, one digit.

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "token": "<firebase-id-token>",
  "user": { "uid": "abc123", "email": "user@example.com" }
}
```

### Todos (Protected — requires `Authorization: Bearer <token>`)

#### List Todos
```
GET /api/todos?status=pending&priority=high&category=work&search=meeting&dueAfter=2024-01-01&limit=20&page=1
```

**Query Parameters:**
| Param | Type | Values | Description |
|-------|------|--------|-------------|
| `status` | string | `pending`, `completed` | Filter by status |
| `priority` | string | `low`, `medium`, `high` | Filter by priority |
| `category` | string | any | Filter by category |
| `search` | string | any | Full-text search (title, description, category) |
| `dueAfter` | ISO date | `2024-01-01` | Filter todos due after date |
| `dueBefore` | ISO date | `2024-12-31` | Filter todos due before date |
| `limit` | number | 1-100 | Items per page (default: 20) |
| `page` | number | ≥1 | Page number (default: 1) |
| `sortBy` | string | `createdAt`, `updatedAt`, `dueDate`, `title` | Sort field |
| `sortOrder` | string | `asc`, `desc` | Sort direction (default: `desc`) |

**Response (200):**
```json
{
  "todos": [
    {
      "id": "abc123",
      "title": "Buy groceries",
      "description": "Milk, eggs, bread",
      "dueDate": "2024-06-15T00:00:00.000Z",
      "priority": "medium",
      "category": "Personal",
      "status": "pending",
      "createdAt": "2024-06-01T10:00:00.000Z",
      "updatedAt": "2024-06-01T10:00:00.000Z"
    }
  ],
  "totalCount": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

#### Create Todo
```
POST /api/todos
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "dueDate": "2024-06-15",
  "priority": "medium",
  "category": "Personal",
  "status": "pending"
}
```

**Response (201):** Full todo object.

#### Update Todo
```
PUT /api/todos/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed",
  "title": "Updated title"
}
```

**Response (200):** Updated todo object.

#### Delete Todo
```
DELETE /api/todos/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{ "success": true }
```

### Error Format

All errors follow this format:
```json
{
  "error": "Human-readable error message",
  "code": 400
}
```

| Status Code | Meaning |
|-------------|----------|
| 400 | Validation error / Bad request |
| 401 | Unauthorized (missing/invalid/expired token) |
| 403 | Forbidden (account disabled) |
| 404 | Resource not found |
| 409 | Conflict (e.g., email already exists) |
| 413 | Request body too large |
| 429 | Too many requests (rate limited) |
| 500 | Internal server error |

## Security

- **Helmet**: Sets security HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS**: Restricted to `http://localhost:3000` and `https://liorboyango.github.io`
- **Rate Limiting**: 100 req/min globally; 20 req/15min for auth endpoints
- **Input Validation**: All inputs validated with Joi before processing
- **Auth**: Firebase ID tokens verified server-side on every protected request
- **Body Size Limit**: 10kb max to prevent large payload attacks
- **No Secrets in Code**: All credentials via environment variables

## Project Structure

```
src/
├── index.js              # Server entry point, middleware setup
├── config/
│   ├── firebase.js       # Firebase Admin SDK initialization
│   └── cors.js           # CORS configuration
├── middleware/
│   ├── auth.js           # Firebase token verification
│   ├── validate.js       # Joi validation middleware factories
│   ├── errorHandler.js   # Centralized error handling
│   └── rateLimiter.js    # Rate limiting configuration
├── routes/
│   ├── auth.js           # Auth route definitions
│   └── todos.js          # Todos route definitions
├── controllers/
│   ├── authController.js # Auth business logic
│   └── todosController.js# Todos business logic
└── validators/
    ├── auth.js           # Joi schemas for auth
    └── todos.js          # Joi schemas for todos
```

## Deployment (Render)

1. Connect your GitHub repository to Render
2. Set environment variables in Render dashboard:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — service account JSON string
   - `FIREBASE_API_KEY` — Firebase Web API Key
   - `NODE_ENV=production`
3. Build command: `npm install`
4. Start command: `npm start`
