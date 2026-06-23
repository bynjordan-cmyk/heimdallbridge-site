-- ============================================================================
-- ABAKUS — Migraciones de Supabase (idempotentes, seguras de re-ejecutar)
-- Ejecuta TODO este archivo una vez en tu proyecto de Supabase.
-- Cómo correrlo si el SQL editor da "Failed to fetch (api.supabase.com)":
--   - Ábrelo en ventana incógnito con extensiones (adblock) desactivadas, o
--   - Usa el botón "Connect" → copia el connection string de Postgres y corre
--     este archivo con psql / TablePlus / DBeaver (va directo, sin api.supabase.com).
-- ============================================================================

-- 1) Aprendizaje: memoria explícita del usuario --------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS memoria jsonb DEFAULT '[]'::jsonb;

-- 2) Correlativo por usuario en movimientos (#1, #2, ...) -----------------------
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS correlativo int;
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_phone ORDER BY created_at) AS rn
  FROM movimientos
)
UPDATE movimientos m SET correlativo = n.rn
FROM numerados n
WHERE m.id = n.id AND m.correlativo IS NULL;

-- 3) Multimoneda (una moneda por usuario, ISO 4217) ----------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'CLP';
UPDATE usuarios SET moneda = 'CLP' WHERE moneda IS NULL;

-- 4) Cuentas (bancos/caja), saldos iniciales y transferencias ------------------
CREATE TABLE IF NOT EXISTS cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone text NOT NULL,
  nombre text NOT NULL,
  tipo text DEFAULT 'banco',          -- banco | caja | otro
  saldo_inicial numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone text NOT NULL,
  cuenta_origen uuid,
  cuenta_destino uuid,
  monto numeric NOT NULL,
  fecha date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS cuenta_id uuid;
ALTER TABLE usuarios   ADD COLUMN IF NOT EXISTS pendiente jsonb;

-- 5) Ventana de 24h: hora del último mensaje entrante (tip diario / recordatorios)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_mensaje_at timestamptz;

-- 6) Tareas diarias: marca por día para envíos confiables (auto-recuperación si
--    Railway reinicia/duerme y se pierde el cron). Clave=nombre, valor=fecha.
CREATE TABLE IF NOT EXISTS tareas_diarias (
  nombre text PRIMARY KEY,
  fecha  date NOT NULL
);
