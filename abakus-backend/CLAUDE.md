# ABAKUS — Brief para Claude Code

## ¿Qué es Abakus?

Asistente financiero que opera 100% por WhatsApp para freelancers y microempresarios en Chile y LATAM. Permite registrar ingresos, egresos y cuentas por cobrar mediante mensajes de texto, sin apps ni Excel.

- **Marca:** Abakus (con K) · Handle: `@heyabakus`
- **Landing:** heimdallbridge.com/abakus
- **Ecosistema:** Heimdall Bridge — junto a Quanta (ventas) y Factum (facturación)

## Stack objetivo

```
WhatsApp Cloud API (Meta)
        ↓
Express.js (Node/TypeScript) — servidor webhook
        ↓
Claude (Anthropic) claude-haiku-4-5 — interpreta el mensaje
        ↓
Supabase (PostgreSQL) — persiste datos
        ↓
WhatsApp Cloud API — responde al usuario
```

- **Deploy:** Railway
- **Lenguaje:** Node.js (TypeScript)
- **DB:** Supabase existente — proyecto `iszuxcphtatbxmrzoeyk`

## Credenciales y configuración

Toda la configuración va por variables de entorno. Ver `.env.example` para la
plantilla. **Los secretos reales (tokens y keys) NUNCA se commitean** — se cargan
en un `.env` local (gitignored) y en las variables de entorno de Railway.

IDs públicos conocidos (sí están en `.env.example`):
- `WHATSAPP_PHONE_NUMBER_ID=1097115646819277`
- `WHATSAPP_WABA_ID=960510659947943`
- `META_APP_ID=1039748735141035` (App: Abakus2, portafolio heyabakus)
- `WHATSAPP_VERIFY_TOKEN=abakus_webhook_2024`
- `SUPABASE_URL=https://iszuxcphtatbxmrzoeyk.supabase.co`
- `ANTHROPIC_MODEL=claude-haiku-4-5`

Secretos (placeholder vacío en `.env.example`, valor real solo en `.env` / Railway):
- `WHATSAPP_ACCESS_TOKEN` — token del System User "Abakus-bot"
- `ANTHROPIC_API_KEY`
- `SUPABASE_SERVICE_KEY` — service role key

## Esquema de base de datos (Supabase existente)

**Tabla `usuarios`**

```sql
id              uuid PRIMARY KEY
phone           text UNIQUE NOT NULL   -- formato: +56935594094
nombre          text
estado          text DEFAULT 'onboarding'  -- onboarding | activo
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

**Tabla `movimientos`**

```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES usuarios(id)
tipo            text   -- ingreso | egreso
monto           numeric
categoria       text
descripcion     text
fecha           date DEFAULT CURRENT_DATE
created_at      timestamptz DEFAULT now()
```

**Tabla `cuentas_por_cobrar`**

```sql
id                uuid PRIMARY KEY
user_id           uuid REFERENCES usuarios(id)
contraparte       text   -- a quién se le cobra
monto             numeric
descripcion       text
fecha_vencimiento date
estado            text DEFAULT 'pendiente'  -- pendiente | cobrado
created_at        timestamptz DEFAULT now()
```

> **Nota:** el comportamiento de soft-delete (`deleted_at`) del brief requiere
> agregar esa columna a las tablas. Mientras no exista, las queries NO filtran
> por `deleted_at` (los flujos v1 no borran registros).

## Estructura de archivos (este directorio)

```
abakus-backend/
├── src/
│   ├── index.ts              # Entry point, Express server
│   ├── config.ts             # Carga y valida variables de entorno
│   ├── types.ts              # Tipos TypeScript
│   ├── webhook/
│   │   ├── handler.ts        # Recibe y valida POST de Meta
│   │   └── verify.ts         # Responde GET de verificación Meta
│   ├── whatsapp/
│   │   └── sender.ts         # Envía mensajes vía Cloud API
│   ├── claude/
│   │   └── interpreter.ts    # Llama a Claude (claude-haiku-4-5)
│   ├── supabase/
│   │   ├── client.ts         # Cliente Supabase
│   │   └── queries.ts        # Buscar usuario, guardar movimiento, etc.
│   ├── flows/
│   │   ├── onboarding.ts     # Usuario nuevo
│   │   ├── registro.ts       # Ingreso/egreso/deuda
│   │   ├── consulta.ts       # Comandos especiales y consultas
│   │   └── carga.ts          # Carga masiva por Excel + plantilla
│   ├── reports/
│   │   ├── excel.ts          # Reporte Excel + plantilla de carga masiva
│   │   └── importExcel.ts    # Parser de Excel para carga masiva
│   └── utils/
│       ├── format.ts         # Formato CLP
│       └── idempotency.ts    # Dedup de message_id
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── .env.example
```

## Flujo principal (replica el comportamiento de n8n actual)

1. **POST `/webhook/abakus-whatsapp`** — valida mensaje real (no status update),
   extrae `phone`, `message_text`, `message_id`. Responde **200 inmediatamente**
   (Meta exige < 5s) y procesa en background.
2. **GET `/webhook/abakus-whatsapp`** — valida `hub.verify_token` y responde `hub.challenge`.
3. **Filtro mensajes reales** — ignora si no hay `entry[0].changes[0].value.messages[0]` de tipo `text`.
4. **Buscar usuario** — `SELECT * FROM usuarios WHERE phone = $1`.
5. **Usuario nuevo → Onboarding** — crea usuario (`estado = 'onboarding'`) y envía bienvenida.
6. **Usuario existe → Claude** — `claude-haiku-4-5` con structured outputs (`output_config.format`) devuelve:
   ```json
   {
     "tipo": "ingreso|egreso|consulta|deuda|desconocido",
     "monto": number|null, "categoria": string|null, "descripcion": string|null,
     "contraparte": string|null, "fecha_vencimiento": "YYYY-MM-DD"|null,
     "respuesta": string
   }
   ```
7. **Guardar en Supabase** — ingreso/egreso → `movimientos`; deuda → `cuentas_por_cobrar`; consulta → no guarda.
8. **Responder por WhatsApp** — `POST graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`.

### Respuestas de confirmación

- Ingreso: `✅ Ingreso registrado` / `💰 $[monto] | [categoria] | [descripcion]`
- Egreso: `📤 Egreso registrado` / `💸 $[monto] | [categoria] | [descripcion]`
- Deuda: `📋 Cuenta por cobrar registrada` / `👤 [contraparte] | $[monto] | vence [fecha]`

### Comandos especiales (v1) — no pasan por Claude

- `resumen` / `saldo` → ingresos vs egresos del mes
- `cobros` / `pendientes` → cuentas por cobrar pendientes
- `ayuda` → menú de comandos
- `plantilla` → envía un Excel (.xlsx) de plantilla para carga masiva

### Carga masiva por Excel

El usuario puede enviar un documento `.xlsx` por WhatsApp (mensaje tipo `document`)
para registrar muchos ingresos/egresos de una sola vez:

1. Meta entrega el mensaje con `type: "document"` y un `media_id`.
2. `downloadMedia()` (`whatsapp/sender.ts`) resuelve la URL temporal del media y
   descarga los bytes.
3. `parsearMovimientosExcel()` (`reports/importExcel.ts`) detecta automáticamente
   las columnas Fecha/Tipo/Monto/Categoría/Descripción (alias y orden flexibles,
   busca el encabezado entre las primeras 10 filas) y devuelve `{ validos, errores }`
   por fila — un archivo con filas inválidas no aborta el resto.
4. `insertMovimientosMasivo()` (`supabase/queries.ts`) inserta los válidos en
   lotes de 200.
5. Se responde con un resumen (cantidad, ingresos/egresos totales, errores).

Límite: 500 filas de datos por archivo. Solo se soporta `.xlsx` (no `.xls` ni CSV).
Igual que ingreso/egreso, requiere `accesoVigente` (trial vigente o plan de pago).

## Comportamientos importantes

1. Siempre responder **200 a Meta primero**, luego procesar.
2. Nunca exponer errores internos al usuario — mensaje genérico si falla:
   `Ups, algo salió mal 😅 Intenta de nuevo en un momento.`
3. Formato de teléfono: guardar y comparar con `+` (ej: `+56935594094`).
4. **Idempotencia:** usar `message_id` de Meta para evitar duplicados (Meta reenvía).
5. Soft delete: cuando se implemente borrado, usar `deleted_at` (ver nota de esquema).

## Comandos de desarrollo

```bash
npm install          # instalar dependencias
npm run dev          # desarrollo con nodemon + ts-node
npm run typecheck    # chequeo de tipos sin emitir
npm run build        # compilar a dist/
npm start            # ejecutar dist/index.js (producción)
```

### Deploy en Railway

- Crear proyecto, conectar el repo, **root directory = `abakus-backend/`**.
- Build: `npm run build` · Start: `npm start`.
- Cargar todas las variables del `.env` en Railway.
- Configurar el webhook en Meta apuntando a `https://<dominio>/webhook/abakus-whatsapp`.

## Migración desde n8n

El flujo actual en n8n está en producción. Esta migración busca reducir costos a
escala, mayor control y compartir infraestructura del ecosistema Heimdall.
**No apagar n8n hasta que el código propio esté testeado en producción.**
