import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import classroomsRouter from './routes/classrooms.js';
import studentsRouter from './routes/students.js';
import evaluationsRouter from './routes/evaluations.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/classrooms', classroomsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/evaluations', evaluationsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
});

export default app;
