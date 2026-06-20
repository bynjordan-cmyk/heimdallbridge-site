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

> **Migración requerida para aprendizaje (memoria explícita):** la tabla
> `usuarios` necesita una columna `memoria jsonb DEFAULT '[]'::jsonb`. Los
> campos `negocio` y `tono` ya existen en el esquema real. El código degrada
> con gracia si `memoria` aún no existe (loguea el error y sigue), pero la
> memoria explícita no se persistirá hasta crear la columna:
> ```sql
> ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS memoria jsonb DEFAULT '[]'::jsonb;
> ```

> **Migración requerida para correlativos:** cada movimiento lleva un
> correlativo por usuario (#1, #2, ...) para poder referenciarlo ("corrige el
> #5"). Requiere columna `correlativo int` en `movimientos`. El código degrada
> con gracia (inserta sin correlativo, las correcciones caen al último
> movimiento). Migración + backfill del histórico:
> ```sql
> ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS correlativo int;
> WITH numerados AS (
>   SELECT id, ROW_NUMBER() OVER (PARTITION BY user_phone ORDER BY created_at) AS rn
>   FROM movimientos
> )
> UPDATE movimientos m SET correlativo = n.rn FROM numerados n WHERE m.id = n.id;
> ```
> El próximo correlativo se calcula como `MAX(correlativo)+1` por usuario
> (`siguienteCorrelativo`). Volumen bajo (un usuario escribe de a un mensaje),
> así que el riesgo de colisión es despreciable.

> **Migración requerida para multimoneda:** la tabla `usuarios` necesita una
> columna `moneda text` (ISO 4217). El código degrada con gracia si aún no existe
> (`createUsuario` reintenta sin ella; la persistencia va en su propio try/catch),
> pero la moneda no se guardará hasta crearla. Backfill: los usuarios existentes
> (Chile) quedan en CLP.
> ```sql
> ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'CLP';
> UPDATE usuarios SET moneda = 'CLP' WHERE moneda IS NULL;
> ```

## Aprendizaje del usuario (`src/aprendizaje/perfil.ts`)

Abakus personaliza la interpretación de Claude con un "perfil" del usuario que
se inyecta en el system prompt en cada mensaje que pasa por Claude:

1. **Categorías frecuentes** — `getCategoriasFrecuentes` mira los movimientos
   recientes; Claude reutiliza una categoría existente en vez de inventar
   sinónimos ("Internet" en vez de crear "Wifi").
2. **Contrapartes frecuentes** — `getContrapartesFrecuentes` desde
   `cuentas_pendientes`.
3. **Negocio y tono** — campos `negocio`/`tono` de `usuarios`. Claude los
   **extrae** automáticamente cuando el usuario los revela ("soy diseñador",
   "háblame más formal") y se persisten.
4. **Memoria explícita** — Claude devuelve un campo `aprendizaje` con datos
   durables ("trabajo con boleta de honorarios", "mi socio es Pedro"), que se
   guardan en `usuarios.memoria` (dedup, tope 20, FIFO) vía `agregarAprendizaje`.

La interpretación (`claude/interpreter.ts`) devuelve 3 campos extra además de
los de registro: `negocio`, `tono`, `aprendizaje`. La persistencia ocurre en
`persistirAprendizaje` (handler), que nunca rompe el flujo principal.

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
│   ├── aprendizaje/
│   │   └── perfil.ts         # Perfil del usuario inyectado a Claude
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
5. **Usuario nuevo → Onboarding guiado** — ver sección *Onboarding guiado*.
6. **Usuario existe → Claude** — `claude-haiku-4-5` con structured outputs (`output_config.format`) devuelve:
   ```json
   {
     "tipo": "ingreso|egreso|consulta|deuda|cobro|eliminar|corregir|desconocido",
     "monto": number|null, "categoria": string|null, "descripcion": string|null,
     "contraparte": string|null, "fecha_vencimiento": "YYYY-MM-DD"|null,
     "respuesta": string,
     "movimientos": [{ "tipo": "ingreso|egreso", "monto": number, "categoria": string|null, "descripcion": string|null, "fecha": "YYYY-MM-DD"|null }],
     "referencia": number|null,
     "negocio": string|null, "tono": string|null, "aprendizaje": string|null,
     "moneda": "CLP|MXN|PEN|USD|..."|null
   }
   ```
   Antes de llamar a Claude se le inyecta el perfil del usuario, el **último
   movimiento** registrado (para que las correcciones sepan a qué se refieren),
   la **fecha de hoy** (para resolver "ayer", "el lunes", etc. en `movimientos[].fecha`)
   y la **moneda del usuario** (ver *Multimoneda*).
   El array `movimientos` lleva **uno o varios** ingresos/egresos detectados en el
   mismo mensaje (ver *Registro multi-movimiento*); va vacío para los demás tipos.
7. **Guardar en Supabase** — ingreso/egreso → `movimientos`; deuda → `cuentas_pendientes`;
   `cobro` → marca cuenta pagada; `eliminar` → borra el último movimiento;
   `corregir` → actualiza el último movimiento (monto/categoría/descripción);
   consulta → no guarda.
8. **Responder por WhatsApp** — `POST graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`.

### Respuestas de confirmación

- Ingreso: `✅ Ingreso registrado` / `💰 $[monto] | [categoria] | [descripcion]`
- Egreso: `📤 Egreso registrado` / `💸 $[monto] | [categoria] | [descripcion]`
- Deuda: `📋 Cuenta por cobrar registrada` / `👤 [contraparte] | $[monto] | vence [fecha]`

### Comandos especiales (v1) — no pasan por Claude

- `resumen` / `saldo` → ingresos vs egresos del mes
- `detalle` → lista de movimientos como texto en el chat (alternativa al Excel; "muéstrame en el chat", "sin excel", "en texto")
- `cobros` / `pendientes` → cuentas por cobrar pendientes (lo que te deben)
- `por pagar` / `mis deudas` / `qué debo` → cuentas por pagar pendientes (lo que debes)
- `ayuda` → menú de comandos
- `plantilla` → envía un Excel (.xlsx) de plantilla para carga masiva

### Cuentas por cobrar vs por pagar

La tabla `cuentas_pendientes` tiene un campo `tipo` (`por_cobrar` | `por_pagar`).
El modelo es simétrico y NO genera movimientos (igual que las por cobrar):

- **Por cobrar:** `deuda` (registrar: "Juan me debe 30000") · `cobro` (saldar:
  "Juan me pagó") · comando `cobros`.
- **Por pagar:** `cuenta_pagar` (registrar: "le debo 20000 a Ana", "tengo que
  pagar el arriendo el 5") · `saldar` (liquidar: "ya le pagué a Ana") · comando
  `por pagar`.

Claude distingue `cuenta_pagar` (obligación pendiente) de `egreso` (dinero que
ya salió), y `saldar` (liquida una deuda registrada) de un `egreso` nuevo. Las
queries de cuentas filtran por `tipo` para no mezclar ambos lados. Los
recordatorios (cron 9 AM) y el reporte Excel ya cubren ambos tipos.

## Cuentas (bancos / caja), saldos iniciales y transferencias

Modelo de cuentas por usuario para llevar saldos reales.

- **Tablas nuevas** `cuentas` y `transferencias` + columna `cuenta_id` en
  `movimientos` + columna `pendiente jsonb` en `usuarios`.
- **Saldo de cuenta** = `saldo_inicial` + ingresos − egresos (de esa cuenta)
  + transferencias entrantes − salientes (`getSaldosCuentas`).
- **Crear / saldo inicial** (conversacional, `crear_cuenta`): "tengo Banco
  Estado con 100000", "agrega caja con 5000". Si la cuenta existe, ajusta el
  saldo inicial.
- **Asignación de movimientos:** "mencionar siempre". Si el usuario YA tiene
  cuentas, cada ingreso/egreso debe indicar la cuenta ("pagué 5000 de luz con
  Banco Estado"). Si no la indica, Abakus guarda el movimiento en
  `usuarios.pendiente` (estado `esperando_cuenta`) y pregunta a cuál va; la
  respuesta lo registra. Una cuenta por mensaje.
- **Transferencias** (`transferencia`): "transferí 50000 de Banco Estado a
  Caja" → no es ingreso ni egreso; ajusta ambos saldos.
- **Comando `cuentas`** (`flows/cuentas.ts`): lista saldos por cuenta + total.
- **Compatibilidad:** la obligación de mencionar cuenta solo se activa cuando el
  usuario tiene ≥1 cuenta. Los usuarios sin cuentas siguen igual que antes
  (`cuenta_id` queda null). El código degrada si las tablas aún no existen.

> **Migración requerida para cuentas:**
> ```sql
> CREATE TABLE IF NOT EXISTS cuentas (
>   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_phone text NOT NULL,
>   nombre text NOT NULL,
>   tipo text DEFAULT 'banco',          -- banco | caja | otro
>   saldo_inicial numeric DEFAULT 0,
>   created_at timestamptz DEFAULT now()
> );
> CREATE TABLE IF NOT EXISTS transferencias (
>   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
>   user_phone text NOT NULL,
>   cuenta_origen uuid,
>   cuenta_destino uuid,
>   monto numeric NOT NULL,
>   fecha date DEFAULT CURRENT_DATE,
>   created_at timestamptz DEFAULT now()
> );
> ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS cuenta_id uuid;
> ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pendiente jsonb;
> ```

## Panel admin: salud del aprendizaje

`GET /admin/aprendizaje?key=ADMIN_KEY` (`src/admin/reporteAprendizaje.ts`)
devuelve un panel HTML (o JSON con `&format=json`) para auditar que el ciclo de
aprendizaje funciona en producción: cuántos usuarios tienen negocio/tono/memoria/
moneda, % de movimientos clasificados (vs "Sin clasificar"), cuentas creadas y
los últimos usuarios con lo aprendido (teléfono enmascarado por privacidad).

- Protegido por `ADMIN_KEY` (env). Si está vacío, el endpoint responde 404.
- Solo lectura; aislado de `queries.ts` (consulta directa a Supabase).

## Tareas programadas (cron, zona America/Santiago)

Configuradas en `src/index.ts` con `node-cron`:

- **09:00 — Recordatorios** (`tasks/recordatorios.ts`): avisa cuentas por
  cobrar y por pagar próximas a vencer.
- **15:00 — "Sabías que..."** (`tasks/tips.ts`): un dato/tip financiero diario
  a todos los usuarios activos. La lista `TIPS` rota por día del año
  (determinista: mismo tip para todos cada día, cicla sin repetir).

Ambas son mensajes **proactivos**: fuera de la ventana de 24h de WhatsApp,
Meta puede exigir plantilla aprobada (ver nota de migración n8n).

## Onboarding guiado

El primer contacto de un usuario nuevo es un mini-flujo conversacional (100%
WhatsApp, sin Excel) que busca una **primera victoria** rápida:

1. **Bienvenida + 1ª pregunta** (`iniciarOnboarding`, `flows/onboarding.ts`): se
   crea el usuario con `estado_conversacion = 'onboarding_negocio'`, se presenta a
   Abakus y se le pregunta *"¿a qué te dedicas?"* (con opción de escribir
   *saltar*).
2. **Respuesta de negocio**: el siguiente mensaje pasa por Claude como siempre. Si
   NO es un registro ni un comando, se asume que es su respuesta de negocio (ya
   capturada por el aprendizaje en `usuarios.negocio`) y se le envía
   `invitacionPrimerRegistro`: ejemplos de registro natural + la opción de mandar
   **varios movimientos juntos** para traer su historial.
3. **Salida del onboarding** (`salirDeOnboarding`, `webhook/handler.ts`): el estado
   se limpia en cuanto el usuario hace algo distinto a responder (un registro, un
   comando o un documento), de modo que el paso nunca lo deja atrapado.

La **primera victoria** se detecta de forma stateless: cuando un movimiento se
inserta con `correlativo === 1` (su primer movimiento), la confirmación incluye un
mensaje celebratorio de cierre de onboarding (`PRIMERA_VICTORIA` en `registro.ts`).

## Multimoneda

Abakus opera en varios países (Chile y LATAM, más USD/EUR), con **una moneda por
usuario** (ISO 4217 en `usuarios.moneda`). Toda la lógica de formato vive en
`utils/format.ts`:

- `monedaPorTelefono(phone)` infiere la moneda del prefijo telefónico (56→CLP,
  52→MXN, 51→PEN, 57→COP, 54→ARS, 593→USD, etc.). Se usa al crear el usuario.
- `formatMonto(monto, moneda)` formatea con símbolo y decimales correctos vía
  `Intl.NumberFormat` (CLP/COP/PYG sin decimales; USD/PEN/MXN con dos). `clp()`
  quedó como atajo retrocompatible (= `formatMonto(monto, 'CLP')`).
- `normalizarMoneda` / `esMonedaSoportada` validan códigos.

Cómo se determina (estrategia *auto + confirmar*):
1. **Al crear el usuario** se infiere por teléfono (`iniciarOnboarding`).
2. **Se confirma** en la invitación al primer registro
   (`invitacionPrimerRegistro`): "Registraré tus montos en *X*; si usas otra,
   dímelo".
3. **Claude la ajusta**: el interpreter recibe la moneda del usuario en el prompt
   y devuelve el campo `moneda` cuando la persona menciona una distinta
   ("uso dólares", "cobré 100 soles"); `persistirAprendizaje` la guarda (solo si
   es soportada y distinta a la actual).

`moneda` es una **columna nueva** (ver migración abajo). El código degrada con
gracia si aún no existe: `createUsuario` reintenta sin ella y la persistencia va
en su propio try/catch.

> **Nota:** los precios de suscripción (`suscripcion.ts`) siguen en CLP porque el
> cobro va por Mercado Pago Chile. La multimoneda aplica a los **registros del
> usuario**, no al billing (que es otra decisión por país).

## Registro multi-movimiento

Un mismo mensaje puede contener **varios** ingresos/egresos
("vendí 50 mil el lunes, pagué 20 mil de arriendo y gasté 8 mil en bencina"):
Claude los devuelve en el array `movimientos`, cada uno con su `tipo`, `monto`,
`categoria`, `descripcion` y `fecha` (resuelta contra la fecha de hoy inyectada en
el prompt; `null` = hoy). Es la vía nativa de WhatsApp para la **carga inicial**
del historial, sin Excel.

`registrarMovimientos` (`flows/registro.ts`) inserta 1 o N:
- **1 movimiento** → confirmación detallada (con tip de ingreso o alerta de balance).
- **Varios** → `insertMovimientosMasivo` en lote + resumen (cantidad y totales).

Fallback: si el modelo marca `tipo` ingreso/egreso pero deja `movimientos` vacío,
el handler arma un item con los campos del nivel superior.

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
