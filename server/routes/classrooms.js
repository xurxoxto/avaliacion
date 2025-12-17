import express from 'express';

const router = express.Router();

// In-memory storage for demo (replace with database later)
let classrooms = [];

// GET all classrooms
router.get('/', (req, res) => {
  res.json(classrooms);
});

// GET classroom by ID
router.get('/:id', (req, res) => {
  const classroom = classrooms.find(c => c.id === req.params.id);
  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found' });
  }
  res.json(classroom);
});

// POST create new classroom
router.post('/', (req, res) => {
  const { name, grade } = req.body;
  
  if (!name || !grade) {
    return res.status(400).json({ error: 'Name and grade are required' });
  }

  const newClassroom = {
    id: Date.now().toString(),
    name,
    grade,
    studentCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  classrooms.push(newClassroom);
  res.status(201).json(newClassroom);
});

// PUT update classroom
router.put('/:id', (req, res) => {
  const { name, grade } = req.body;
  const index = classrooms.findIndex(c => c.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Classroom not found' });
  }

  classrooms[index] = {
    ...classrooms[index],
    name: name || classrooms[index].name,
    grade: grade || classrooms[index].grade,
    updatedAt: new Date(),
  };

  res.json(classrooms[index]);
});

// DELETE classroom
router.delete('/:id', (req, res) => {
  const index = classrooms.findIndex(c => c.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Classroom not found' });
  }

  const deleted = classrooms.splice(index, 1)[0];
  res.json({ message: 'Classroom deleted', classroom: deleted });
});

export default router;
