# ABAKUS MASTER SPEC

> **Fuente de verdad del proyecto Abakus.** Describe qué es, **qué hace hoy**, su
> arquitectura real, las decisiones tomadas y lo que no debe cambiarse sin
> autorización. Toda nueva conversación de Claude Code debe **leer este archivo
> antes de modificar nada** (ver §20).
>
> **Última actualización:** 2026-06-21 · **Rama:** `claude/remote-control-yexmni`
> · **Versión desplegada:** consultar `GET /health` (devuelve el commit).
>
> Leyenda: ✅ funcionando · 🟡 parcial · ⛔ pendiente.

---

## 1. Resumen ejecutivo del producto

Abakus es un **asistente financiero conversacional por WhatsApp** para
freelancers, emprendedores, trabajadores independientes y pequeños negocios que
necesitan ordenar **ingresos, gastos, cuentas por cobrar, cuentas por pagar y
saldos** sin Excel ni una app.

Promesa: **"Tu plata bajo control desde WhatsApp."** (Landing: *"Tu plata bajo
control, sin Excel y sin apps"*.)

El usuario escribe en lenguaje natural (*"vendí 80 mil en diseño"*, *"pagué 15 mil
de internet"*, *"Carlos me debe 50 mil"*) y Abakus lo interpreta con IA, lo
registra en su base y responde de forma cálida y breve. **No** es ERP, **no** es
contabilidad completa, **no** reemplaza al contador.

---

## 2. Funcionalidades actuales (el corazón del documento)

Todo esto **ya está implementado** en el backend (rama `claude/remote-control-yexmni`):

**Registro en lenguaje natural** ✅
- Ingresos y egresos, **uno o varios en un mismo mensaje** ("vendí 50 mil el
  lunes, pagué 20 mil de arriendo y gasté 8 mil en bencina" → 3 movimientos).
- Resuelve fechas relativas ("ayer", "el lunes", "el 3 de mayo").
- Maneja coloquialismos ("3 lucas" = 3000; "3000 mil" = 3000, no 3.000.000).
- Si la dirección es ambigua ("pago de 20000"), **pregunta** si fue ingreso o egreso.
- Si no puede inferir categoría, registra como **"Sin clasificar"** y sugiere
  especificar (no bloquea el registro).

**Cuentas por cobrar y por pagar** ✅
- CxC: *"Carlos me debe 50000 hasta el viernes"*; cobro: *"Juan me pagó"*.
- CxP: *"le debo 20000 a Ana"*, *"tengo que pagar el arriendo el 5"*; saldar:
  *"ya le pagué a Ana"*.
- Cobrar/saldar **solo marca la cuenta como pagada**, no genera un movimiento.

**Bancos / caja, saldos y transferencias** ✅
- Crear cuenta: *"tengo Banco Estado con 100000"*, *"agrega caja con 5000"*.
- Asignar movimientos a una cuenta ("mencionar siempre": si el usuario ya tiene
  cuentas, debe indicar a cuál va; si no, Abakus **pregunta**).
- Transferencias: *"transferí 50000 de Banco Estado a Caja"*.
- Saldo por cuenta = saldo inicial + ingresos − egresos + transferencias.

**Correcciones y borrado** ✅
- Corregir el último movimiento o uno por número: *"corrige el #5 a 2000"*,
  *"era un ingreso no egreso"*, *"el #1 fue en Banco de Chile"*. Cambia monto,
  tipo, categoría, descripción y/o cuenta.
- *"deshacer"* / *"borra el último"* elimina el último movimiento.

**Consultas y reportes** ✅
- `resumen` (mes) / `resumen mayo`: ingresos, egresos, balance, **proyección de
  cierre**, desglose por categoría y meta.
- `detalle` (lista de movimientos **en el chat**, alternativa al Excel).
- `reporte` / `reporte mayo`: **Excel** (hojas: Resumen, Movimientos con #, Cuentas).
- `comparar`: este mes vs. el anterior con tendencias.
- `proyección [mes]`: estimado futuro según historial.
- `meta [monto]`: objetivo mensual de ingresos con barra de progreso.
- `cuentas` / `saldos`: saldo de cada banco/caja + total.
- `cobros` (lo que te deben) · `por pagar` (lo que debes).

**Carga masiva por Excel** ✅
- `plantilla` envía un `.xlsx` modelo; el usuario lo completa y lo reenvía;
  Abakus lo parsea e inserta en lote (tolerante a filas con errores).

**Aprendizaje por usuario** ✅
- Aprende y reutiliza: **negocio**, **tono**, **categorías frecuentes**,
  **contrapartes**, y **memoria** (datos durables tipo "trabajo con boleta de
  honorarios"). Se inyecta en el prompt para personalizar interpretación y respuesta.

**Multimoneda** ✅
- Una moneda por usuario (ISO 4217), inferida por prefijo telefónico y cambiable
  ("uso dólares"). Formatea montos según la moneda.

**Onboarding guiado** ✅
- Usuario nuevo: bienvenida → *"¿a qué te dedicas?"* (captura negocio) →
  invitación al primer registro (incluye carga inicial multi-movimiento, cuentas
  y moneda). Se puede *saltar*.

**Automatización (cron, zona America/Santiago)** ✅
- **09:00** — recordatorios de cobros **y** pagos por vencer (solo al usuario).
- **15:00** — "Sabías que..." tip financiero diario (rota por día).

**Suscripción** ✅/🟡
- Planes **Básico** y **Pro** vía **Mercado Pago** (flujo `suscribirme` → email →
  plan → link → webhook activa). `planes` muestra precios reales.

**Operación / admin** ✅
- `GET /health` → estado + commit desplegado.
- `GET /admin/aprendizaje?key=ADMIN_KEY` → panel de auditoría del aprendizaje.

---

## 3. Comandos y disparadores reales

| Comando / frase | Acción |
|---|---|
| lenguaje natural (ingreso/egreso/deuda/etc.) | registra/corrige según interpretación de IA |
| `resumen`, `saldo`, `resumen mayo` | balance del mes/mes indicado |
| `detalle`, "muéstrame en el chat", "sin excel" | lista de movimientos en texto |
| `reporte`, `informe`, `reporte mayo` | Excel |
| `comparar`, `mes pasado` | mes actual vs. anterior |
| `proyección [mes]` | estimado futuro |
| `meta [monto]`, `objetivo` | fija/consulta meta mensual |
| `cuentas`, `saldos`, `bancos`, `cuánto tengo` | saldos por cuenta |
| `cobros`, `me deben`, `por cobrar` | cuentas por cobrar |
| `por pagar`, `mis deudas`, `qué debo` | cuentas por pagar |
| `plantilla`, `formato` | Excel modelo para carga masiva |
| `planes`, `precio`, `cuánto cuesta` | descripción de planes |
| `pagar`, `suscribirme`, `activar plan` | inicia suscripción |
| `deshacer`, `borra el último` | elimina último movimiento |
| `ayuda`, `menú` | menú de capacidades |

**Tipos que interpreta la IA** (`claude/interpreter.ts`): `ingreso`, `egreso`,
`deuda` (CxC), `cobro`, `cuenta_pagar` (CxP), `saldar`, `corregir`, `eliminar`,
`crear_cuenta`, `transferencia`, `consulta`, `desconocido`.

---

## 4. Usuario ideal y dolores

**Cliente:** freelancers, emprendedoras, dueños de pequeños negocios, quienes
venden por WhatsApp/redes, PYMEs sin área financiera, gente que no usa Excel
constante y quiere registrar rápido desde el celular.

**Dolores:** no saben cuánto ganaron; mezclan dinero personal y del negocio;
olvidan cobrar; no registran gastos chicos; no tienen claridad mensual; el
contador recibe info incompleta o tarde.

---

## 5. Ecosistema Heimdall Assistants

Marca paraguas: **Heimdall Bridge / Heimdall Assistants**. Tres productos
**separados**: **Quanta** (antes de la venta: cotizador), **Factum** (durante:
facturación/operación) y **Abakus** (después: control financiero).

> En este repositorio **solo existe Abakus** (landing + backend). Quanta y Factum
> son visión, no hay código aquí. ⛔

---

## 6. Stack técnico real

- **Backend** `abakus-backend/`: **Node ≥22 + TypeScript**, **Express**. ✅
- **WhatsApp:** **Cloud API de Meta** (Graph v22.0). ✅
- **IA:** **Anthropic Claude `claude-haiku-4-5`** con structured outputs (JSON Schema). ✅
- **Base de datos:** **Supabase (PostgreSQL)**, proyecto `iszuxcphtatbxmrzoeyk`. ✅
- **Pagos:** **Mercado Pago** (CLP). ✅
- **Deploy:** **Railway** (root `abakus-backend/`, build `npm run build`, start `npm start`). ✅
- **Cron:** `node-cron`. **Excel:** `exceljs`. **HTTP:** `axios`. ✅
- Dependencias: `@anthropic-ai/sdk`, `@supabase/supabase-js`, `axios`, `express`,
  `exceljs`, `form-data`, `node-cron`, `dotenv`.

**Variables de entorno** (`.env.example`): credenciales WhatsApp/Meta,
`ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`,
config Mercado Pago, `PUBLIC_URL`, `PORT`, `WEBHOOK_PATH`, `ADMIN_KEY`. Los
secretos **no se commitean**.

**n8n:** flujo previo en n8n/Railway **aún en producción en paralelo**; migración
al backend propio en curso, **sin corte final**. 🟡

---

## 7. Estructura del repositorio (monorepo)

```
/ (heimdallbridge-site)
├── index.html                 Sitio "Heimdall Bridge Consulting"
├── abakus/index.html          Landing de Abakus ("Tu plata bajo control...")
├── ABAKUS_MASTER_SPEC.md      Este documento
└── abakus-backend/            Backend del asistente (Node/TS)
    ├── CLAUDE.md              Documentación técnica detallada
    ├── migrations.sql         Esquema/migraciones de Supabase
    ├── .env.example           Plantilla de variables de entorno
    └── src/
        ├── index.ts                  Server Express, rutas, crons
        ├── config.ts                 Carga/valida env
        ├── types.ts                  Tipos de dominio e interpretación
        ├── webhook/                  handler (orquestador), verify, mercadopago
        ├── claude/interpreter.ts     NL → JSON estructurado (Claude)
        ├── flows/                    onboarding, registro, consulta, cuentas,
        │                             carga, reporte, suscripcion
        ├── aprendizaje/perfil.ts     Perfil del usuario para el prompt
        ├── supabase/                 client, queries
        ├── reports/                  excel, importExcel, periodo
        ├── pagos/mercadopago.ts      Integración pagos
        ├── tasks/                    recordatorios (9:00), tips (15:00)
        ├── admin/reporteAprendizaje  Panel /admin/aprendizaje
        ├── whatsapp/sender.ts        Envío texto/documentos + descarga media
        ├── utils/                    format (moneda), idempotency, contexto
        └── scripts/wa-perfil.ts      Utilidad de perfil de WhatsApp
```

---

## 8. Modelo de datos real (Supabase)

Ver `abakus-backend/migrations.sql` y `types.ts`.

- **`usuarios`** — `id`, `phone` (E.164 con `+`), `nombre`, `plan`, `activo`,
  `negocio`, `tono`, `moneda`, `onboarding_step`, `trial_ends_at`, `email`,
  `estado_conversacion`, `meta_mensual`, `memoria` (jsonb), `pendiente` (jsonb),
  `created_at`.
- **`movimientos`** — `id`, `user_phone`, `correlativo` (#N por usuario), `tipo`
  (`ingreso`|`egreso`), `monto`, `categoria`, `descripcion`, `fecha`, `cuenta_id`,
  `raw_message`, `created_at`.
- **`cuentas_pendientes`** — CxC **y** CxP unificadas por `tipo`
  (`por_cobrar`|`por_pagar`): `id`, `user_phone`, `tipo`, `contraparte`, `monto`,
  `descripcion`, `fecha_vencimiento`, `pagado`, `recordatorio_enviado`, `created_at`.
- **`cuentas`** — bancos/caja: `id`, `user_phone`, `nombre`, `tipo`
  (`banco`|`caja`|`otro`), `saldo_inicial`, `created_at`.
- **`transferencias`** — `id`, `user_phone`, `cuenta_origen`, `cuenta_destino`,
  `monto`, `fecha`, `created_at`.

**Notas de diseño actuales:**
- "Cliente/proveedor" hoy es el texto `contraparte` en `cuentas_pendientes`. **No
  hay tablas `clientes`/`proveedores`** separadas.
- Estado de CxC/CxP es booleano `pagado` (no `vencida`/`parcial`; **sin pagos
  parciales**).
- **Una moneda por usuario** (no por movimiento).
- **No hay tabla de mensajes/historial**: la idempotencia (`utils/idempotency.ts`)
  y el contexto conversacional (`utils/contexto.ts`) son **en memoria** → se
  pierden en reinicios/multi-instancia.

---

## 9. Flujo de procesamiento (webhook/handler.ts)

1. Meta envía el webhook → responder **200 en < 5 s** y procesar en background.
2. Idempotencia por `message_id` (en memoria).
3. Buscar usuario por teléfono (**E.164 con `+`**, igual que n8n).
4. Estados prioritarios: suscripción (email/plan), **esperando cuenta**, onboarding.
5. **Comandos** (no pasan por IA, ver §3).
6. Si no es comando → **Claude interpreta** con contexto: perfil aprendido,
   último movimiento, conversación reciente, cuentas y moneda.
7. Persistir aprendizaje (negocio/tono/memoria) y ejecutar la acción.
8. Responder **amigable** (nunca JSON al usuario).

---

## 10. IA y personalidad

- **Modelo:** Claude `claude-haiku-4-5`, structured outputs (JSON Schema). El JSON
  es interno; una capa lo convierte en respuesta amigable.
- **Personalidad:** claro, cercano, útil, breve, cero regañón, motivador sin
  exagerar. No saluda en cada mensaje (asume conversación en curso); responde
  presente si lo llaman por su nombre. Evita jerga contable.
- **Reglas clave del prompt:** no inventar datos; preguntar si falta algo crítico
  o si hay ambigüedad de dirección; reutilizar categorías existentes del usuario;
  nunca prometer sitios/apps externas; nunca decir que es "gratis" ni inventar
  precios (derivar a `planes`/`suscribirme`).

---

## 11. Monetización (estado real)

- **Suscripción mensual** vía **Mercado Pago**. Planes por env: Básico `4990`,
  Pro `9990` CLP.
- Flujo `suscribirme` → email → plan → link de pago → webhook activa. ✅
- Límite Plan Básico: hasta 3 cuentas por cobrar/pagar activas. ✅
- **Trial:** existe `trial_ends_at` + `accesoVigente`; usuarios sin ese campo
  **no se bloquean** (compatibilidad con n8n). El trial de N días **no está
  garantizado para todos los nuevos usuarios** → decisión pendiente. 🟡
- Definir límites del plan gratis (movimientos/recordatorios/consultas/exportes). ⛔

---

## 12. Landing, marca y canales

- **Dominio:** heimdallbridge.com/abakus (`abakus/index.html`). ✅
- **Marca:** Abakus (con K). **Redes:** `@heyabakus`. Concepto visual: ábaco
  moderno, amigable.
- **Canal principal:** WhatsApp. **Secundarios:** landing, Instagram, TikTok,
  waitlist/beta.
- **Embudo:** redes → landing → waitlist → beta → WhatsApp → plan pago.
- **Captura de leads / waitlist:** UI en la landing, pero **no se ve conectada a
  una base** en el repo. ⛔

---

## 13. Reglas de negocio vigentes

- Moneda inferida por país/prefijo; el usuario puede cambiarla. ✅
- Ante falta de info crítica o ambigüedad → preguntar, no inventar. ✅
- Cliente/proveedor o cuenta nueva → se puede crear al vuelo. ✅
- CxC/CxP con vencimiento opcional (recomendable). ✅
- Recordatorios avisan **al usuario**, nunca al tercero. ✅
- El usuario puede **corregir** (monto, tipo, categoría, descripción, cuenta) y
  **eliminar**. ✅
- "Sin clasificar" como categoría por defecto; nunca bloquear el registro. ✅
- "Mencionar siempre" la cuenta cuando el usuario ya tiene cuentas (una por mensaje). ✅
- Datos privados por usuario. ✅

---

## 14. Fuera del alcance actual

Hoy Abakus **no hace** (y no debe prometer): facturación/boletas electrónicas,
declaraciones tributarias, integración bancaria, contabilidad completa, nómina,
inventario, app nativa, dashboard web, cobranza automática a terceros, ni
escribir automáticamente al cliente final del usuario. (Puede **recordarle al
usuario** que cobre, pero no contacta al tercero.)

---

## 15. Roadmap

**Fase 1 (base) — mayormente lista:** WhatsApp ✅ · registro ✅ · CxC/CxP ✅ ·
resumen ✅ · landing 🟡 · waitlist ⛔.

**Fase 2:** recordatorios ✅ · exportación (Excel ✅, PDF ⛔) · trial/pagos 🟡 ·
mejora de prompts ✅ (continuo) · historial conversacional persistente 🟡 (hoy en memoria).

**Fase 3:** dashboard web ⛔ · categorías personalizadas 🟡 (aprende) · multimoneda
✅ · reportes ✅ · Stripe ⛔ (hoy Mercado Pago).

**Fase 4:** Quanta y Factum conectados ⛔ · integraciones contables ⛔ · B2B ⛔.

---

## 16. Decisiones tomadas (no cambiar sin autorización)

- Abakus vive **principalmente en WhatsApp**; **no** app nativa al inicio.
- **No** prometer facturación electrónica ni integración bancaria en V1.
- **No** mezclar Abakus con HBC App. Abakus, Quanta y Factum son **separados**.
- **IA = Claude `claude-haiku-4-5`** (no OpenAI).
- **Pagos = Mercado Pago** (Stripe quedaría para global, no ahora).
- **DB = Supabase** (proyecto `iszuxcphtatbxmrzoeyk`).
- **Teléfono en E.164 con `+`** para calzar con n8n.
- **CxC y CxP comparten `cuentas_pendientes`** (campo `tipo`).
- **Cobrar/saldar solo marca pagado; NO crea movimiento.**
- **"Sin clasificar"** por defecto; nunca bloquear el registro por categoría.
- **"Mencionar siempre" la cuenta** (una por mensaje) cuando hay cuentas creadas.
- **No apagar n8n** hasta validar el backend propio en producción.
- **Dos sesiones de Claude Code en paralelo** sobre la misma rama → coordinar
  (pull antes, push inmediato, avisar archivos tocados).

---

## 17. Riesgos

- Sobrecargar el V1 / construir demasiado antes de lanzar.
- Mezclar Abakus con HBC App.
- Prometer funciones inexistentes (facturación, banca).
- Waitlist no conectada → leads perdidos.
- No validar con usuarios reales.
- **Costo de IA/WhatsApp por usuario** (cada mensaje = llamada a Claude).
- **Estado en memoria** (idempotencia + contexto conversacional) → duplicados o
  pérdida de hilo en reinicios/multi-instancia.
- **Ventana de 24 h de WhatsApp:** recordatorios y tip diario fuera de la ventana
  requieren **plantillas aprobadas por Meta**; hoy se envían como texto libre.
- **Dos sesiones en la misma rama** → conflictos si no se coordina.
- Migración n8n sin corte limpio → doble procesamiento o recordatorios duplicados.

---

## 18. Pendientes (checklist)

**Técnicos**
- [ ] Conectar la waitlist de la landing a una base.
- [ ] Cerrar migración n8n → backend (apagar crons de n8n primero).
- [ ] Persistir idempotencia y contexto conversacional (DB/Redis).
- [ ] Consolidar el manejo de "preguntas de seguimiento" en un solo mecanismo.
- [ ] Decidir si se crean entidades `clientes`/`proveedores`.
- [ ] Estados enriquecidos de CxC/CxP (`vencida`, `parcial`) y pagos parciales.
- [ ] Plantillas de mensaje Meta para envíos fuera de 24 h.

**Comerciales / producto**
- [ ] Pricing final y límites del plan gratis.
- [ ] Definir/garantizar el trial para nuevos usuarios.
- [ ] Probar con ~5 usuarios reales y medir costo por usuario.
- [ ] Política de privacidad y términos de uso.
- [ ] Hosting de la landing (Vercel u otro).

---

## 19. Preguntas abiertas (a confirmar por el dueño)

- ¿Trial: cuántos días y aplicado a todos los nuevos usuarios?
- ¿Límites exactos del plan gratis vs. Básico vs. Pro?
- ¿La waitlist captura WhatsApp, email o ambos? ¿A qué base?
- ¿Clientes/proveedores como entidades formales (CRM) o sigue `contraparte`?
- ¿Qué hace exactamente el flujo n8n actual? (para checklist de paridad).

---

## 20. Cómo usar este archivo

**Toda nueva conversación de Claude Code debe empezar leyendo este archivo.**

> "Antes de modificar cualquier parte del proyecto, lee `ABAKUS_MASTER_SPEC.md` y
> respeta sus decisiones (§16). Si una solicitud contradice este documento, **avisa
> primero y pide confirmación** antes de actuar."

Contexto técnico complementario: `abakus-backend/CLAUDE.md` (implementación) y
`abakus-backend/migrations.sql` (esquema). Versión en producción: `GET /health`.

---

## 21. Changelog

> Registrar cada actualización relevante: fecha · cambio · motivo.

- **2026-06-21** — Reescritura del spec para reflejar el **estado real y actual**
  de Abakus (antes era un template genérico). Documenta funcionalidades vigentes
  (registro NL multi-movimiento, CxC/CxP, cuentas/saldos/transferencias,
  correcciones, carga masiva Excel, resumen/detalle/reporte/comparar/proyección/
  meta, aprendizaje por usuario, multimoneda, onboarding guiado, recordatorios y
  tip diario, suscripción Mercado Pago, panel admin y `/health`), modelo de datos
  real (usuarios, movimientos, cuentas_pendientes, cuentas, transferencias),
  stack real (Claude haiku-4-5, Supabase, Mercado Pago, Railway) y decisiones.
- **2026-06-21** — Creación inicial de `ABAKUS_MASTER_SPEC.md`.
