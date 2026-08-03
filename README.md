# heimdallbridge-site

Sitio de Heimdall Bridge Consulting — control financiero del gasto, compras y auditoría P2P.
Desplegado en Vercel.

## Estructura

| Ruta | Qué es |
|---|---|
| `/` | Portada. Los cinco servicios. |
| `/abakus/` | Abakus — asistente financiero por WhatsApp. |
| `/auditoria/` | **Radar 14** — página de venta de la auditoría express de fugas de gasto. |
| `/auditoria/calculadora.html` | Calculadora de fuga anual estimada. Seis preguntas, sin captura de correo. |
| `/motor/` | **Motor de detección de fugas.** Carga un CSV de cuentas por pagar y produce un informe cuantificado. |
| `/_interno/` | Material comercial. Bloqueado en el sitio vía `vercel.json` — ver `_interno/README.md`. |

## El motor de detección

`/motor/index.html` es una aplicación de un solo archivo, sin dependencias ni build. Todo el
procesamiento ocurre en el navegador: el archivo del cliente nunca se sube a ningún servidor, lo que
permite correrlo delante del cliente con sus datos reales.

Acepta CSV o texto pegado desde Excel. Detecta el delimitador, el separador decimal (coma o punto) y el
formato de fecha automáticamente, y propone el mapeo de columnas.

Once pruebas sobre cada transacción:

1. Pagos duplicados exactos — mismo proveedor, documento y monto
2. Duplicados probables — mismo monto, documento distinto, dentro de una ventana de días
3. Un mismo documento registrado con montos diferentes
4. Proveedores duplicados en el maestro — normalización de razón social y códigos
5. Cuentas bancarias compartidas entre proveedores distintos
6. Compras fraccionadas bajo el umbral de aprobación
7. Montos atípicos por proveedor — rango intercuartílico
8. Concentración de montos redondos
9. Gasto disperso — proveedores de una o dos compras
10. Documentos registrados en fin de semana
11. Dispersión de precio unitario por artículo

Cada hallazgo reporta **exposición** (dinero bruto involucrado) y **recuperable** (exposición × un factor
de conversión documentado en el propio informe). Las exposiciones se solapan entre pruebas y por eso no se
suman; el informe lo explica.

Tiene un botón de datos de demostración con anomalías sembradas y semilla fija, para ensayar y para
demostrar en frío sin datos de cliente.

## Desarrollo

No hay build ni dependencias. Son archivos HTML estáticos.

```
npx serve .        # o cualquier servidor estático
```
