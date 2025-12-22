-- seed.sql (Supabase / PostgreSQL)
-- Minimal test data

-- 1) Insert the 8 LOMLOE key competences
INSERT INTO competencias_clave (sigla, nombre) VALUES
  ('CCL', 'Competencia en comunicación lingüística'),
  ('CP', 'Competencia plurilingüe'),
  ('STEM', 'Competencia matemática y competencia en ciencia, tecnología e ingeniería'),
  ('CD', 'Competencia digital'),
  ('CPSAA', 'Competencia personal, social y de aprender a aprender'),
  ('CC', 'Competencia ciudadana'),
  ('CE', 'Competencia emprendedora'),
  ('CCEC', 'Competencia en conciencia y expresión culturales')
ON CONFLICT (sigla) DO NOTHING;

-- 2) Example subject: Matemáticas
INSERT INTO asignaturas (nombre_oficial, codigo)
VALUES ('Matemáticas', 'MAT')
ON CONFLICT (codigo) DO NOTHING;

-- 3) Minimal descriptors used by the example CE
-- STEM1, STEM2 belong to STEM; CD2 belongs to CD
WITH
  c_stem AS (SELECT id FROM competencias_clave WHERE sigla = 'STEM'),
  c_cd AS (SELECT id FROM competencias_clave WHERE sigla = 'CD')
INSERT INTO descriptores_operativos (codigo, descripcion, competencia_clave_id)
SELECT 'STEM1', 'Descriptor STEM 1', (SELECT id FROM c_stem)
WHERE NOT EXISTS (SELECT 1 FROM descriptores_operativos WHERE codigo = 'STEM1');

WITH c_stem AS (SELECT id FROM competencias_clave WHERE sigla = 'STEM')
INSERT INTO descriptores_operativos (codigo, descripcion, competencia_clave_id)
SELECT 'STEM2', 'Descriptor STEM 2', (SELECT id FROM c_stem)
WHERE NOT EXISTS (SELECT 1 FROM descriptores_operativos WHERE codigo = 'STEM2');

WITH c_cd AS (SELECT id FROM competencias_clave WHERE sigla = 'CD')
INSERT INTO descriptores_operativos (codigo, descripcion, competencia_clave_id)
SELECT 'CD2', 'Descriptor CD 2', (SELECT id FROM c_cd)
WHERE NOT EXISTS (SELECT 1 FROM descriptores_operativos WHERE codigo = 'CD2');

-- 4) Example: MAT_CE1 with vinculaciones TEXT[]
INSERT INTO competencias_especificas (codigo, descripcion, asignatura_id, vinculaciones)
SELECT
  'MAT_CE1',
  'Interpretar, modelizar y resolver situaciones de la vida cotidiana.',
  a.id,
  ARRAY['STEM1','STEM2','CD2']::TEXT[]
FROM asignaturas a
WHERE a.codigo = 'MAT'
ON CONFLICT (codigo) DO NOTHING;
