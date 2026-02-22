# GreatesTODO Backend

RESTful API server for the GreatesTODO application, built with Node.js, Express, and Firebase Admin SDK.

## Features

- 🔐 Firebase Authentication (token verification)
- 🗄️ Firestore database integration
- 🛡️ Security middleware (Helmet, CORS, Rate Limiting)
- ✅ Input validation with Joi
- 📝 Request logging with Morgan & Winston
- 🚀 Production-ready configuration

## Prerequisites

- Node.js >= 20.0.0
- Firebase project with Firestore enabled
- Firebase service account key

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/liorboyango/greatestodo-backend.git
   cd greatestodo-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your Firebase service account JSON.

4. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON string | **Yes** |
| `CORS_ORIGINS` | Comma-separated allowed origins | No |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms (default: 60000) | No |
| `RATE_LIMIT_MAX` | Max requests per window (default: 100) | No |

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |

### Todos (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/todos` | List todos with filters |
| POST | `/api/todos` | Create todo |
| PUT | `/api/todos/:id` | Update todo |
| DELETE | `/api/todos/:id` | Delete todo |

## Project Structure

```
src/
├── index.js              # Server entry point
├── app.js                # Express app configuration
├── config/
│   └── firebase.js       # Firebase Admin SDK initialization
├── middleware/
│   ├── auth.js           # JWT verification middleware
│   └── errorHandler.js   # Centralized error handling
├── routes/
│   ├── auth.js           # Auth routes
│   └── todos.js          # Todo routes
├── controllers/
│   ├── authController.js # Auth business logic
│   └── todosController.js# Todo business logic
└── validators/
    ├── auth.js           # Auth validation schemas
    └── todos.js          # Todo validation schemas
```

## Deployment

This application is deployed on Render. Set the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable in the Render dashboard.

## License

MIT
