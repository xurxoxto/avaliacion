import express from 'express';

const router = express.Router();

// In-memory storage for demo
let students = [];

// GET all students or filter by classroomId
router.get('/', (req, res) => {
  const { classroomId } = req.query;
  
  if (classroomId) {
    const filtered = students.filter(s => s.classroomId === classroomId);
    return res.json(filtered);
  }
  
  res.json(students);
});

// GET student by ID
router.get('/:id', (req, res) => {
  const student = students.find(s => s.id === req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  res.json(student);
});

// POST create new student
router.post('/', (req, res) => {
  const { firstName, lastName, classroomId, listNumber } = req.body;
  
  if (!firstName || !lastName || !classroomId || !listNumber) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newStudent = {
    id: Date.now().toString(),
    firstName,
    lastName,
    classroomId,
    listNumber: parseInt(listNumber),
    progress: 0,
    averageGrade: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  students.push(newStudent);
  res.status(201).json(newStudent);
});

// PUT update student
router.put('/:id', (req, res) => {
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Student not found' });
  }

  students[index] = {
    ...students[index],
    ...req.body,
    id: students[index].id, // Preserve ID
    updatedAt: new Date(),
  };

  res.json(students[index]);
});

// DELETE student
router.delete('/:id', (req, res) => {
  const index = students.findIndex(s => s.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const deleted = students.splice(index, 1)[0];
  res.json({ message: 'Student deleted', student: deleted });
});

export default router;
