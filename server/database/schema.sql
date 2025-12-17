-- Database Schema for Avaliacion System
-- PostgreSQL Schema Definition

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teachers table
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Classrooms table
CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  grade VARCHAR(100) NOT NULL,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
  list_number INTEGER NOT NULL,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  average_grade DECIMAL(4, 2) DEFAULT 0 CHECK (average_grade >= 0 AND average_grade <= 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(classroom_id, list_number)
);

-- Competencias table (Key Competences)
CREATE TABLE competencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Evaluations table
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  competencia_id UUID REFERENCES competencias(id) ON DELETE CASCADE,
  rating DECIMAL(4, 2) NOT NULL CHECK (rating >= 1 AND rating <= 10),
  observation TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Evidence files table
CREATE TABLE evidence_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX idx_students_classroom ON students(classroom_id);
CREATE INDEX idx_evaluations_student ON evaluations(student_id);
CREATE INDEX idx_evaluations_teacher ON evaluations(teacher_id);
CREATE INDEX idx_evaluations_competencia ON evaluations(competencia_id);
CREATE INDEX idx_evaluations_date ON evaluations(date);
CREATE INDEX idx_evidence_evaluation ON evidence_files(evaluation_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classrooms_updated_at BEFORE UPDATE ON classrooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON evaluations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default competencias clave (Key Competences)
INSERT INTO competencias (code, name, description) VALUES
  ('C1', 'Comunicación Lingüística', 'Competencia en comunicación oral y escrita'),
  ('C2', 'Competencia Matemática', 'Competencia matemática y competencias básicas en ciencia y tecnología'),
  ('C3', 'Competencia Digital', 'Competencia digital'),
  ('C4', 'Aprender a Aprender', 'Aprender a aprender'),
  ('C5', 'Competencias Sociales y Cívicas', 'Competencias sociales y cívicas'),
  ('C6', 'Sentido de Iniciativa y Espíritu Emprendedor', 'Sentido de iniciativa y espíritu emprendedor'),
  ('C7', 'Conciencia y Expresiones Culturales', 'Conciencia y expresiones culturales');

-- Views for analytics

-- View: Student performance summary
CREATE VIEW student_performance_summary AS
SELECT 
  s.id,
  s.first_name,
  s.last_name,
  c.name AS classroom_name,
  s.average_grade,
  s.progress,
  COUNT(e.id) AS total_evaluations,
  AVG(e.rating) AS calculated_average
FROM students s
LEFT JOIN classrooms c ON s.classroom_id = c.id
LEFT JOIN evaluations e ON s.id = e.student_id
GROUP BY s.id, s.first_name, s.last_name, c.name, s.average_grade, s.progress;

-- View: Competence statistics
CREATE VIEW competence_statistics AS
SELECT 
  comp.id,
  comp.code,
  comp.name,
  COUNT(e.id) AS total_evaluations,
  AVG(e.rating) AS average_rating,
  MIN(e.rating) AS min_rating,
  MAX(e.rating) AS max_rating
FROM competencias comp
LEFT JOIN evaluations e ON comp.id = e.competencia_id
GROUP BY comp.id, comp.code, comp.name;

-- View: Classroom statistics
CREATE VIEW classroom_statistics AS
SELECT 
  c.id,
  c.name,
  c.grade,
  COUNT(DISTINCT s.id) AS total_students,
  AVG(s.average_grade) AS class_average_grade,
  COUNT(e.id) AS total_evaluations
FROM classrooms c
LEFT JOIN students s ON c.id = s.classroom_id
LEFT JOIN evaluations e ON s.id = e.student_id
GROUP BY c.id, c.name, c.grade;
