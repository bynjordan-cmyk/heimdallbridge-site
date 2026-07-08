-- ============================================================================
-- ABAKUS — Verificación de migraciones
-- Corre esto en Supabase → SQL Editor. Devuelve una fila por cada objeto que el
-- código espera, con ✅ existe / ❌ FALTA. Si aparece algún ❌, corre
-- migrations.sql (es idempotente) y vuelve a correr esta verificación.
-- Solo lee el catálogo (information_schema); no modifica nada.
-- ============================================================================

WITH esperado(objeto, tabla, columna) AS (VALUES
  -- Columnas nuevas en tablas existentes
  ('columna', 'usuarios',    'memoria'),            -- aprendizaje: memoria explícita
  ('columna', 'usuarios',    'moneda'),             -- multimoneda
  ('columna', 'usuarios',    'pendiente'),          -- movimientos esperando cuenta
  ('columna', 'usuarios',    'ultimo_mensaje_at'),  -- ventana 24h (tips/recordatorios)
  ('columna', 'movimientos', 'correlativo'),        -- #N para editar/borrar por número
  ('columna', 'movimientos', 'cuenta_id'),          -- cuenta del movimiento
  -- Tablas nuevas
  ('tabla',   'cuentas',        NULL),              -- bancos/caja con saldo inicial
  ('tabla',   'transferencias', NULL),              -- traspasos entre cuentas
  ('tabla',   'tareas_diarias', NULL)               -- marca de envíos diarios
)
SELECT
  e.tabla || COALESCE('.' || e.columna, '') AS item,
  CASE
    WHEN e.objeto = 'columna' AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.tabla AND c.column_name = e.columna
    ) THEN '✅ existe'
    WHEN e.objeto = 'tabla' AND to_regclass('public.' || e.tabla) IS NOT NULL THEN '✅ existe'
    ELSE '❌ FALTA'
  END AS estado
FROM esperado e
ORDER BY estado DESC, item;

-- Extra: ¿cuántos movimientos quedaron SIN correlativo? (debe dar 0 tras migrar)
-- SELECT count(*) AS movimientos_sin_correlativo FROM movimientos WHERE correlativo IS NULL;
