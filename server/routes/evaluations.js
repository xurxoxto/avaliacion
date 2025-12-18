import express from 'express';

const router = express.Router();

// In-memory storage for demo
let evaluations = [];

// GET all evaluations or filter by studentId
router.get('/', (req, res) => {
  const { studentId } = req.query;
  
  if (studentId) {
    const filtered = evaluations.filter(e => e.studentId === studentId);
    return res.json(filtered);
  }
  
  res.json(evaluations);
});

// GET evaluation by ID
router.get('/:id', (req, res) => {
  const evaluation = evaluations.find(e => e.id === req.params.id);
  if (!evaluation) {
    return res.status(404).json({ error: 'Evaluation not found' });
  }
  res.json(evaluation);
});

// POST create new evaluation
router.post('/', (req, res) => {
  const { studentId, competenciaId, rating, observation } = req.body;
  
  if (!studentId || !competenciaId || !rating) {
    return res.status(400).json({ error: 'StudentId, competenciaId, and rating are required' });
  }

  const newEvaluation = {
    id: Date.now().toString(),
    studentId,
    competenciaId,
    rating: parseFloat(rating),
    observation: observation || '',
    date: new Date(),
    evidenceUrls: req.body.evidenceUrls || [],
  };

  evaluations.push(newEvaluation);
  res.status(201).json(newEvaluation);
});

// DELETE evaluation
router.delete('/:id', (req, res) => {
  const index = evaluations.findIndex(e => e.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Evaluation not found' });
  }

  const deleted = evaluations.splice(index, 1)[0];
  res.json({ message: 'Evaluation deleted', evaluation: deleted });
});

// GET statistics
router.get('/stats/summary', (req, res) => {
  const stats = {
    totalEvaluations: evaluations.length,
    averageRating: evaluations.length > 0 
      ? evaluations.reduce((sum, e) => sum + e.rating, 0) / evaluations.length 
      : 0,
    byCompetence: {},
  };

  // Group by competence
  evaluations.forEach(e => {
    if (!stats.byCompetence[e.competenciaId]) {
      stats.byCompetence[e.competenciaId] = { count: 0, sum: 0, average: 0 };
    }
    stats.byCompetence[e.competenciaId].count++;
    stats.byCompetence[e.competenciaId].sum += e.rating;
  });

  // Calculate averages
  Object.keys(stats.byCompetence).forEach(key => {
    const comp = stats.byCompetence[key];
    comp.average = comp.sum / comp.count;
  });

  res.json(stats);
});

export default router;
