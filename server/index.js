import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import classroomsRouter from './routes/classrooms.js';
import studentsRouter from './routes/students.js';
import evaluationsRouter from './routes/evaluations.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/classrooms', classroomsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/evaluations', evaluationsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve static files from the dist directory in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  
  // Handle client-side routing - send all non-API requests to index.html
  app.use((req, res, next) => {
    // Only handle GET requests that don't start with /api
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          res.status(500).send('Frontend application not available');
        }
      });
    } else {
      next();
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error for debugging (use proper logging service in production)
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📱 Frontend available at http://localhost:${PORT}`);
  }
});

export default app;
