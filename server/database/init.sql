-- init.sql (Supabase / PostgreSQL)
-- LOMLOE Evaluation DB - minimal schema
-- Uses UUID PKs, TEXT[] vinculaciones, and an ENUM for nivel_logro.

-- Supabase recommends pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nivel_logro') THEN
    CREATE TYPE nivel_logro AS ENUM ('INICIAL', 'BASICO', 'AUTONOMO', 'EXPERTO');
  END IF;
END$$;

-- 2) Tablas maestras
CREATE TABLE IF NOT EXISTS alumnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  curso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asignaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_oficial TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS competencias_clave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS descriptores_operativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  competencia_clave_id UUID NOT NULL REFERENCES competencias_clave(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_descriptores_competencia_clave_id
  ON descriptores_operativos(competencia_clave_id);

CREATE TABLE IF NOT EXISTS competencias_especificas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  asignatura_id UUID NOT NULL REFERENCES asignaturas(id) ON DELETE RESTRICT,
  -- IMPORTANT: stores descriptor codes like ['STEM1','CD2']
  vinculaciones TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_comp_especificas_asignatura_id
  ON competencias_especificas(asignatura_id);

-- 3) Tabla transaccional
CREATE TABLE IF NOT EXISTS evaluaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  competencia_especifica_id UUID NOT NULL REFERENCES competencias_especificas(id) ON DELETE RESTRICT,
  nivel_logro nivel_logro NOT NULL,
  valor_numerico DOUBLE PRECISION NOT NULL,
  evidencia TEXT,
  decision_docente TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_alumno_id ON evaluaciones(alumno_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_comp_especifica_id ON evaluaciones(competencia_especifica_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_fecha ON evaluaciones(fecha);

-- 4) Tabla calculada para analíticas
CREATE TABLE IF NOT EXISTS progreso_descriptores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  descriptor_codigo TEXT NOT NULL,
  valor_acumulado DOUBLE PRECISION NOT NULL DEFAULT 0,
  contador_registros INTEGER NOT NULL DEFAULT 0,
  -- avoid duplicates per alumno+descriptor
  UNIQUE (alumno_id, descriptor_codigo),
  -- optional: enforce descriptor exists by code (FK to unique column)
  CONSTRAINT fk_progreso_descriptor_codigo
    FOREIGN KEY (descriptor_codigo) REFERENCES descriptores_operativos(codigo) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_progreso_alumno_id ON progreso_descriptores(alumno_id);
CREATE INDEX IF NOT EXISTS idx_progreso_descriptor_codigo ON progreso_descriptores(descriptor_codigo);

-- 5) Auto-update progreso_descriptores on new evaluations
-- Each evaluation contributes its valor_numerico to every descriptor in
-- competencias_especificas.vinculaciones.

CREATE OR REPLACE FUNCTION trg_apply_evaluacion_to_progreso_descriptores()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  codes TEXT[];
  code TEXT;
BEGIN
  -- Allow the application layer to bypass this trigger (e.g., when the API
  -- manually updates progreso_descriptores) to avoid double-counting.
  IF current_setting('app.skip_progreso_trigger', true) = '1'
     OR lower(current_setting('avaliacion.skip_progreso', true)) IN ('1','on','true') THEN
    RETURN NEW;
  END IF;

  SELECT vinculaciones INTO codes
  FROM competencias_especificas
  WHERE id = NEW.competencia_especifica_id;

  IF codes IS NULL OR array_length(codes, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH code IN ARRAY codes LOOP
    -- This will fail if descriptor_codigo doesn't exist in descriptores_operativos(codigo)
    -- due to the FK. That's intended to keep data consistent.
    INSERT INTO progreso_descriptores (alumno_id, descriptor_codigo, valor_acumulado, contador_registros)
    VALUES (NEW.alumno_id, code, NEW.valor_numerico, 1)
    ON CONFLICT (alumno_id, descriptor_codigo)
    DO UPDATE SET
      valor_acumulado = progreso_descriptores.valor_acumulado + EXCLUDED.valor_acumulado,
      contador_registros = progreso_descriptores.contador_registros + EXCLUDED.contador_registros;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_evaluaciones_progreso_insert ON evaluaciones;
CREATE TRIGGER tr_evaluaciones_progreso_insert
AFTER INSERT ON evaluaciones
FOR EACH ROW
EXECUTE FUNCTION trg_apply_evaluacion_to_progreso_descriptores();
