# React + Ruby on Rails Project

Full-stack application with React frontend and Ruby on Rails API backend.

## Project Structure

```
Bachelor_Gruppe1/
├── backend/          # Rails API (Port 3000)
│   ├── app/
│   │   ├── controllers/
│   │   └── models/
│   ├── config/
│   ├── db/
│   └── Gemfile
│
└── frontend/         # React + Vite (Port 5173)
    ├── src/
    │   ├── components/
    │   ├── services/
    │   └── App.jsx
    └── package.json
```

## Prerequisites

- **Ruby** 3.2.0 or higher
- **Node.js** 18.0 or higher
- **npm** or **yarn**
- **Bundler** (`gem install bundler`)

## Setup Instructions

### 1. Backend Setup (Rails API)

```powershell
# Navigate to backend folder
cd backend

# Install dependencies
bundle install

# Create database
bundle exec rake db:create

# Run migrations
bundle exec rake db:migrate

# Seed database with sample data
bundle exec rake db:seed

# Start Rails server (runs on port 3000)
bundle exec rails server
```

The API will be available at `http://localhost:3000`

**API Endpoints:**
- `GET /api/v1/health` - Health check
- `GET /api/v1/items` - Get all items
- `GET /api/v1/items/:id` - Get single item
- `POST /api/v1/items` - Create item
- `PUT /api/v1/items/:id` - Update item
- `DELETE /api/v1/items/:id` - Delete item

### 2. Frontend Setup (React)

Open a new terminal:

```powershell
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Start development server (runs on port 5173)
npm run dev
```

The React app will be available at `http://localhost:5173`

## Running the Application

1. **Start the backend** (Terminal 1):
   ```powershell
   cd backend
   bundle exec rails server
   ```

2. **Start the frontend** (Terminal 2):
   ```powershell
   cd frontend
   npm run dev
   ```

3. **Open your browser** to `http://localhost:5173`

You should see a React app connected to the Rails API with a green "🟢 Connected" status indicator.

## Features

✅ Rails 7 API-only backend  
✅ CORS configured for frontend communication  
✅ React 18 with Vite for fast development  
✅ RESTful API endpoints  
✅ Full CRUD operations (Create, Read, Update, Delete)  
✅ Axios for API calls  
✅ Sample Item model with database  
✅ Modern UI with gradient styling  

## Development

### Backend Commands

```powershell
# Console
bundle exec rails console

# Database reset
bundle exec rake db:reset

# Run migrations
bundle exec rake db:migrate

# Create migration
bundle exec rails generate migration MigrationName
```

### Frontend Commands

```powershell
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Tech Stack

**Backend:**
- Ruby on Rails 7.1
- SQLite3
- Puma web server
- Rack CORS

**Frontend:**
- React 18
- Vite 5
- Axios
- Modern CSS with gradients

## Configuration

### CORS Settings
CORS is configured in [backend/config/application.rb](backend/config/application.rb) to allow requests from `http://localhost:5173`.

### API Base URL
The API base URL is set in [frontend/src/services/api.js](frontend/src/services/api.js) to `http://localhost:3000/api/v1`.

## Troubleshooting

**Backend won't start:**
- Ensure Ruby 3.2.0 is installed: `ruby -v`
- Run `bundle install` again
- Check if port 3000 is available

**Frontend won't start:**
- Ensure Node.js is installed: `node -v`
- Delete `node_modules` and run `npm install` again
- Check if port 5173 is available

**API not connecting:**
- Verify backend is running on port 3000
- Check browser console for CORS errors
- Ensure CORS origin matches frontend URL

## Next Steps

- Add authentication (JWT or sessions)
- Add more models and relationships
- Implement user registration/login
- Add file uploads
- Deploy to production (Heroku, Railway, etc.)

## License

MIT
