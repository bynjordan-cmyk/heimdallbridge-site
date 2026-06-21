# ABAKUS MASTER SPEC

> **Fuente de verdad del proyecto Abakus.** Este documento describe qué es
> Abakus, en qué estado está, qué decisiones se tomaron y qué no debe cambiarse
> sin autorización. Cualquier nueva conversación con Claude Code debe **leer este
> archivo antes de modificar nada** (ver §20).
>
> **Última actualización:** 2026-06-21 · **Rama de desarrollo:** `claude/remote-control-yexmni`
>
> **Leyenda de estado:** ✅ Implementado · 🟡 Parcial · ⛔ Pendiente · ⚠️ Difiere de lo que dice el spec idealizado.

---

## 1. Resumen ejecutivo del producto

Abakus es un **asistente financiero conversacional que funciona principalmente por
WhatsApp**. Está pensado para freelancers, emprendedores, trabajadores
independientes, pequeños negocios y personas que necesitan ordenar ingresos,
gastos, cuentas por cobrar y cuentas por pagar **sin usar Excel ni instalar una
app compleja**.

Promesa central: **"Tu plata bajo control desde WhatsApp."**
(La landing usa la variante: *"Tu plata bajo control, sin Excel y sin apps"*.)

Abakus **no** es un ERP, **no** es un sistema contable completo y **no** reemplaza
al contador. Es un asistente simple para **registrar, ordenar, consultar y
recordar** movimientos financieros cotidianos.

---

## 2. Visión del ecosistema Heimdall Assistants

Abakus es parte de un ecosistema mayor de asistentes (marca paraguas: **Heimdall
Bridge / Heimdall Assistants**):

- **Quanta** — asistente **previo a la venta**: cotizador, responde preguntas
  comerciales, genera cotizaciones.
- **Factum** — asistente **operativo / facturación**: facturación, compras,
  clientes y procesos posteriores a la venta.
- **Abakus** — asistente **financiero posterior a la operación**: ingresos,
  egresos, cuentas por cobrar/pagar, resúmenes y orden financiero.

Concepto: **Quanta antes** de la venta · **Factum durante** la operación/facturación
· **Abakus después** (control financiero).

> Estado: los tres son **productos separados**. Hoy en este repositorio **solo
> existe Abakus** (landing + backend). Quanta y Factum son visión, no código aquí. ⛔

---

## 3. Usuario ideal

**Cliente objetivo:** freelancers, emprendedoras, dueños de pequeños negocios,
personas que venden por WhatsApp o redes, PYMEs pequeñas sin área financiera,
gente que no usa Excel de forma constante y quiere registrar rápido desde el
celular.

**Dolores principales:** no saben cuánto ganaron realmente; mezclan dinero
personal y del negocio; olvidan cobrar; no registran gastos pequeños; no tienen
claridad mensual; usan memoria/notas/Excel incompleto/libretas; el contador
recibe información incompleta o tarde.

---

## 4. Propuesta de valor

Abakus ayuda a: registrar ingresos, gastos, cobros pendientes y pagos pendientes;
crear/identificar clientes y proveedores; consultar saldos; ver resúmenes
diarios/semanales/mensuales; recordar vencimientos; dar claridad financiera sin
lenguaje técnico; y exportar cuando sea necesario.

**Tono del producto:** simple, cercano, humano, útil, cero intimidante. Evitar
jerga contable innecesaria.

---

## 5. Alcance del V1

1. Registro de ingresos. ✅
2. Registro de egresos. ✅
3. Registro de cuentas por cobrar. ✅
4. Registro de cuentas por pagar. ✅
5. Clientes. 🟡 (hoy se modelan como texto `contraparte`, no como entidad formal — ver §12)
6. Proveedores. 🟡 (igual que clientes: `contraparte`)
7. Recordatorios internos al usuario. ✅ (cron diario 9 AM)
8. Resumen básico por WhatsApp. ✅ (`resumen`, `detalle`, `reporte`)
9. Consulta de estado: ¿cuánto vendí? ✅ · ¿cuánto gasté? ✅ · ¿quién me debe? ✅ (`cobros`) · ¿a quién debo? ✅ (`por pagar`) · ¿cómo voy este mes? ✅ (`resumen`, `comparar`)

> Extras ya implementados que van más allá del V1 mínimo: **multimoneda**,
> **cuentas (bancos/caja) con saldos iniciales y transferencias**, **carga masiva
> por Excel**, **proyecciones**, **metas mensuales**, **tip financiero diario** y
> **aprendizaje por usuario**.

---

## 6. Fuera del alcance del V1

No incluir todavía: facturación electrónica; emisión de boletas; declaraciones
tributarias; integración bancaria; contabilidad completa; nómina; inventario; app
móvil nativa; dashboard avanzado; IA financiera compleja; envío automático de
mensajes a clientes del usuario; cobranza automática a terceros.

> **Regla dura:** Abakus puede **recordar al usuario** que debe cobrar, pero en V1
> **no escribe automáticamente al cliente final** sin aprobación expresa. Hoy el
> cron de recordatorios **solo le escribe al propio usuario**. ✅

---

## 7. Canales principales

- **Canal principal:** WhatsApp (Cloud API de Meta). ✅
- **Canales secundarios:** Landing page, Instagram, TikTok, email/WhatsApp para
  waitlist/beta.

Embudo ideal: contenido en redes → landing → waitlist → acceso beta →
interacción por WhatsApp → conversión a plan pago.

> Estado: la **landing existe** (`abakus/index.html`), pero la **captura de leads
> / waitlist conectada a una base no está verificada en el repo**. ⛔

---

## 8. Modelo de monetización

Modelo principal: **suscripción mensual**, cobrada vía **Mercado Pago**. ⚠️ (el
spec mencionaba Stripe como alternativa; **lo implementado es Mercado Pago**, CLP).

Implementado hoy (`src/flows/suscripcion.ts`, `src/pagos/mercadopago.ts`):
- Planes **Básico** y **Pro** (precios por env: Básico `4990`, Pro `9990` CLP). ✅
- Flujo conversacional: `suscribirme` → pide email → elige plan → genera link de
  pago → webhook de Mercado Pago confirma y activa. ✅
- Comando `planes` con descripción/precios (respuesta determinista, no inventada). ✅
- Límite Plan Básico: hasta 3 cuentas por cobrar/pagar activas. ✅
- **Trial:** existe el campo `trial_ends_at` y la lógica `accesoVigente`; usuarios
  sin ese campo (pre-migración) **no se bloquean**. 🟡 (el trial de 15 días del
  spec no está garantizado para todos los nuevos usuarios; revisar al definir
  pricing final).

Idea a cuidar (pendiente de decisión): no regalar demasiado en gratis; limitar
plan free por nº de movimientos/recordatorios/consultas/clientes/exportaciones. ⛔

---

## 9. Landing y marca

- **Dominio:** heimdallbridge.com/abakus (en el repo: `abakus/index.html`). ✅
- **Instagram/TikTok sugerido:** `@heyabakus`.
- **Nombre:** Abakus (con K).
- **Concepto visual:** ábaco moderno, amigable, colorido.
- **Promesa landing:** *"Tu plata bajo control, sin Excel y sin apps"*.
- La landing debe captar leads (idealmente WhatsApp, nombre, país; email
  secundario). 🟡 (UI presente; backend de captura por verificar).

> El repo es un **monorepo del sitio Heimdall**: `index.html` (sitio "Heimdall
> Bridge Consulting"), `abakus/index.html` (landing de Abakus) y `abakus-backend/`
> (el backend del asistente).

---

## 10. Stack técnico (estado real del repositorio)

**Backend** (`abakus-backend/`):
- **Node.js ≥ 22 + TypeScript**, servidor **Express**. ✅
- **WhatsApp Cloud API (Meta)** — Graph API v22.0. ✅
- **IA: Anthropic Claude** modelo `claude-haiku-4-5`. ⚠️ (el spec mencionaba
  OpenAI/Claude; **lo implementado es Claude**, no OpenAI).
- **Base de datos: Supabase (PostgreSQL)** — proyecto `iszuxcphtatbxmrzoeyk`. ✅
- **Pagos: Mercado Pago**. ⚠️ (no Stripe).
- **Deploy: Railway** (root directory `abakus-backend/`, build `npm run build`,
  start `npm start`). ✅
- **Cron:** `node-cron` (recordatorios 9 AM, tip diario 15:00, zona
  America/Santiago). ✅
- **Excel:** `exceljs` (reportes y carga masiva). ✅
- Dependencias clave: `@anthropic-ai/sdk`, `@supabase/supabase-js`, `axios`,
  `express`, `exceljs`, `form-data`, `node-cron`, `dotenv`.

**n8n:** existe un flujo previo en n8n (Railway) que **aún corre en producción en
paralelo**; la migración al backend propio está en curso, **sin corte final**. 🟡

**Landing:** HTML estático en el repo. Hosting/Vercel no confirmado desde el
código. 🟡

**Variables de entorno** (ver `abakus-backend/.env.example`): credenciales de
WhatsApp, `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`,
config de Mercado Pago, `PUBLIC_URL`, `PORT`, `WEBHOOK_PATH`, `ADMIN_KEY`.
**Los secretos nunca se commitean.**

**Estructura de `abakus-backend/src/`:**
```
admin/reporteAprendizaje.ts   Panel /admin/aprendizaje (auditoría de aprendizaje)
aprendizaje/perfil.ts         Perfil del usuario inyectado a Claude
claude/interpreter.ts         Interpretación NL → JSON estructurado (Claude)
config.ts                     Carga/valida variables de entorno
flows/onboarding.ts           Onboarding guiado de usuarios nuevos
flows/registro.ts             Ingresos/egresos, corregir, eliminar, cobro, saldar, CxC/CxP
flows/consulta.ts             Comandos (resumen, detalle, cobros, por pagar, cuentas, etc.)
flows/cuentas.ts              Bancos/caja, saldos, transferencias, pedir cuenta
flows/carga.ts                Carga masiva por Excel + plantilla
flows/reporte.ts              Reporte Excel
flows/suscripcion.ts          Planes, trial, Mercado Pago
pagos/mercadopago.ts          Integración Mercado Pago
reports/excel.ts              Generación de Excel (reporte + plantilla)
reports/importExcel.ts        Parser de Excel para carga masiva
reports/periodo.ts            Parseo de períodos ("mayo", "este mes", etc.)
supabase/client.ts            Cliente Supabase
supabase/queries.ts           Acceso a datos (usuarios, movimientos, cuentas, etc.)
tasks/recordatorios.ts        Cron 9 AM: avisos de cobros/pagos por vencer
tasks/tips.ts                 Cron 15:00: "Sabías que..." financiero
scripts/wa-perfil.ts          Script utilitario de perfil de WhatsApp
utils/format.ts               Formato de moneda (multimoneda)
utils/idempotency.ts          Dedup de message_id (en memoria)
utils/contexto.ts             Contexto conversacional reciente (en memoria)
webhook/handler.ts            Orquestador principal del webhook de WhatsApp
webhook/verify.ts             Verificación GET de Meta
webhook/mercadopago.ts        Webhook de pagos de Mercado Pago
whatsapp/sender.ts            Envío de texto/documentos + descarga de media
types.ts                      Tipos del dominio y de interpretación
```
Documentación de desarrollo más detallada: `abakus-backend/CLAUDE.md`.
Migraciones SQL: `abakus-backend/migrations.sql`.

---

## 11. Arquitectura funcional (flujo del V1)

Flujo por mensaje (`webhook/handler.ts`):
1. Meta envía el webhook → se responde **200 inmediatamente** (< 5 s) y se procesa
   en background.
2. Se busca el usuario por teléfono (normalizado a **E.164 con `+`**, igual que n8n).
3. Estados conversacionales prioritarios: suscripción (email/plan), **esperando
   cuenta** (a qué banco/caja va un movimiento), onboarding.
4. **Comandos** especiales (no pasan por Claude): `resumen`, `detalle`, `cobros`,
   `por pagar`, `cuentas`, `reporte`, `plantilla`, `planes`, `pago`, `eliminar`,
   `comparar`, `meta`, `proyección`, `ayuda`.
5. Si no es comando → **Claude interpreta** el mensaje con contexto (perfil
   aprendido, último movimiento, conversación reciente, cuentas, moneda).
6. Se persiste el aprendizaje y se ejecuta la acción (registrar, corregir,
   transferir, etc.).
7. Se responde de forma **amigable** (nunca JSON al usuario).

Ejemplos de comportamiento esperado:
- *"Vendí 80.000 hoy"* → registra ingreso, confirma con saldo del mes.
- *"Pedro me debe 120.000"* → cuenta por cobrar para Pedro (pregunta vencimiento si falta).
- *"Pagué 35.000 de internet"* → egreso, categoría "Internet"/"Servicios básicos".
- *"Me pagaron 1.300.000"* → ingreso; si no dice de qué, queda **"Sin clasificar"**
  y sugiere especificar; la respuesta de seguimiento ("mi salario") lo clasifica.

---

## 12. Datos — modelo real implementado vs. spec

**Tablas reales en Supabase** (ver `migrations.sql` y `types.ts`):

- **`usuarios`** — `id`, `phone` (E.164 con `+`), `nombre`, `plan`, `activo`,
  `negocio`, `tono`, `moneda` (ISO 4217), `onboarding_step`, `trial_ends_at`,
  `email`, `estado_conversacion`, `meta_mensual`, `memoria` (jsonb),
  `pendiente` (jsonb), `created_at`.
- **`movimientos`** — `id`, `user_phone`, `correlativo` (#N por usuario), `tipo`
  (`ingreso`|`egreso`), `monto`, `categoria`, `descripcion`, `fecha`,
  `cuenta_id`, `raw_message`, `created_at`.
- **`cuentas_pendientes`** — CxC **y** CxP unificadas por campo `tipo`
  (`por_cobrar`|`por_pagar`): `id`, `user_phone`, `tipo`, `contraparte`, `monto`,
  `descripcion`, `fecha_vencimiento`, `pagado`, `recordatorio_enviado`, `created_at`.
- **`cuentas`** — bancos/caja: `id`, `user_phone`, `nombre`, `tipo`
  (`banco`|`caja`|`otro`), `saldo_inicial`, `created_at`.
- **`transferencias`** — `id`, `user_phone`, `cuenta_origen`, `cuenta_destino`,
  `monto`, `fecha`, `created_at`.

⚠️ **Diferencias con el modelo idealizado del spec:**
- **No existen tablas `clientes` ni `proveedores`** como entidades formales. Hoy el
  "cliente/proveedor" es el texto `contraparte` en `cuentas_pendientes`. Si se
  quiere CRM real, es trabajo nuevo.
- **No existe tabla `mensaje`** (historial de mensajes/interpretaciones). La
  idempotencia y el contexto conversacional son **en memoria** (no persisten a
  reinicios ni a múltiples instancias).
- Estados de CxC/CxP hoy son **booleano `pagado`**, no el enum
  `pendiente/pagada/vencida/parcial`. No hay **pagos parciales**.
- El movimiento no guarda `moneda` por fila; la moneda es **una por usuario**
  (`usuarios.moneda`).

---

## 13. Reglas de negocio (estado)

- La moneda se infiere por prefijo telefónico y el usuario puede cambiarla. ✅
- Si falta info crítica, Abakus pregunta de forma simple. 🟡 (mejorando; el
  contexto conversacional para seguimientos es **en memoria**, frágil).
- Si el mensaje es ambiguo (p. ej. dirección ingreso/egreso poco clara), **no
  inventar**: preguntar. ✅
- Si detecta un cliente/proveedor o **cuenta** nueva, puede crearla al vuelo. ✅
  (cuentas bancarias; clientes/proveedores como `contraparte`).
- CxC/CxP con vencimiento **opcional** pero recomendable. ✅
- Los recordatorios avisan **al usuario**, no al tercero. ✅
- Datos privados por usuario. ✅
- El usuario puede **corregir** movimientos (monto, tipo, categoría, descripción,
  cuenta) y **eliminar**. ✅
- Decisión de clasificación: si no se puede inferir categoría, se usa
  **"Sin clasificar"** (no se bloquea el registro). ✅

---

## 14. IA y procesamiento de lenguaje natural

- Modelo: **Claude `claude-haiku-4-5`** (Anthropic), con **structured outputs**
  (JSON Schema). ✅
- Clasifica `tipo`: `ingreso`, `egreso`, `deuda` (CxC), `cobro`, `cuenta_pagar`
  (CxP), `saldar`, `corregir`, `eliminar`, `crear_cuenta`, `transferencia`,
  `consulta`, `desconocido`. ✅
- Extrae: monto, moneda, fecha (resuelve "ayer", "el lunes"...), contraparte,
  descripción, **categoría sugerida** (reutilizando las del usuario), cuenta, y
  campos de aprendizaje (negocio/tono/aprendizaje). ✅
- Soporta **varios movimientos en un mismo mensaje** (`movimientos[]`). ✅
- La IA devuelve **JSON interno**; una capa lo convierte en respuesta amigable.
  **Nunca se responde JSON al usuario.** ✅

---

## 15. Personalidad de Abakus

Claro, cercano, útil, breve, cero regañón, motivador sin exagerar. Ejemplos de
tono: *"Listo, lo anoté."*, *"Te dejo esto registrado."*, *"Ese cobro queda
pendiente."*, *"Te puedo recordar si quieres."*, *"Este mes vas en..."*. Evitar
tono corporativo. (Reflejado en el system prompt de `claude/interpreter.ts` y en
los textos de los flujos.) ✅

---

## 16. Roadmap

**Fase 1 (base):** Landing 🟡 · Waitlist ⛔ · WhatsApp conectado ✅ · Registro
básico ✅ · Clientes/proveedores básicos 🟡 · CxC/CxP básica ✅ · Resumen mensual ✅.

**Fase 2:** Recordatorios automáticos ✅ · Exportación PDF/Excel 🟡 (Excel sí, PDF
no) · Trial y pagos ✅/🟡 · Mejora de prompts ✅ (continuo) · Historial
conversacional 🟡 (en memoria).

**Fase 3:** Dashboard web ligero ⛔ · Categorías personalizadas 🟡 (aprende del
usuario) · Multimoneda ✅ · Reportes ✅ (Excel) · Integración con Stripe ⛔ (hoy
Mercado Pago).

**Fase 4:** Quanta y Factum conectados ⛔ · Integraciones contables ⛔ · Planes
B2B ⛔.

---

## 17. Decisiones tomadas (no cambiar sin autorización)

- Abakus **no será app nativa** al inicio; vive **principalmente en WhatsApp**.
- **No prometer facturación electrónica** ni integración bancaria en V1.
- **No mezclar Abakus con HBC App.**
- **Abakus, Quanta y Factum son productos separados**; se promocionan desde
  Heimdall Bridge / Heimdall Assistants.
- **IA = Claude `claude-haiku-4-5`** (no OpenAI).
- **Pagos = Mercado Pago** (no Stripe en esta etapa; Stripe quedaría para global).
- **Base de datos = Supabase** (proyecto `iszuxcphtatbxmrzoeyk`).
- **Teléfono se normaliza a E.164 con `+`** para calzar con el historial de n8n.
- **CxC y CxP comparten la tabla `cuentas_pendientes`** diferenciadas por `tipo`.
- **Cobrar/saldar solo marca la cuenta como pagada; NO genera un movimiento** de
  ingreso/egreso (consistente entre CxC y CxP).
- **"Sin clasificar"** es la categoría por defecto cuando no se puede inferir (no
  "Otros"); nunca se bloquea el registro por falta de categoría.
- **Mencionar siempre la cuenta**: si el usuario ya tiene cuentas creadas, cada
  movimiento debe indicar cuenta; si no, Abakus pregunta (una cuenta por mensaje).
- **No apagar n8n** hasta validar el backend propio en producción.
- **Dos sesiones de Claude Code trabajan en paralelo** sobre la misma rama
  (`claude/remote-control-yexmni`); coordinar para no pisarse (ver §18).

---

## 18. Riesgos

- Querer construir demasiado antes de lanzar / sobrecargar el V1.
- Mezclar Abakus con HBC App.
- Prometer funciones que aún no existen (facturación, banca).
- No guardar leads correctamente (waitlist no conectada).
- No validar con usuarios reales.
- **Costos de IA/WhatsApp por usuario** (cada mensaje = llamada a Claude).
- Temas fiscales si se lanza global.
- **Dependencia de estado en memoria** (idempotencia y contexto conversacional):
  se pierden en reinicios/multi-instancia → duplicados o pérdida de hilo.
- **Ventana de 24 h de WhatsApp:** mensajes proactivos (recordatorios, tip diario)
  fuera de la ventana requieren **plantillas aprobadas por Meta**; hoy se envían
  como texto libre y Meta podría bloquearlos.
- **Dos sesiones en paralelo** en la misma rama → conflictos si no se coordina.
- Migración n8n → backend sin corte limpio → doble procesamiento o recordatorios
  duplicados si ambos quedan activos.

---

## 19. Pendientes (checklist)

**Técnicos:**
- [ ] Conectar formulario de landing a una base (waitlist).
- [ ] Decidir si se captura WhatsApp y/o email.
- [ ] Cerrar la migración n8n → backend (apagar crons de n8n primero).
- [ ] Idempotencia y contexto conversacional **persistentes** (DB/Redis), no en memoria.
- [ ] Definir si se crean entidades formales `clientes`/`proveedores`.
- [ ] Estados de CxC/CxP enriquecidos (`vencida`, `parcial`) y pagos parciales.
- [ ] Plantillas de mensaje aprobadas por Meta para envíos fuera de 24 h.
- [ ] Consolidar el manejo de "preguntas de seguimiento" en un único mecanismo.

**Comerciales / producto:**
- [ ] Definir pricing final y límites del plan gratis.
- [ ] Definir/garantizar el trial (15 días) para todos los nuevos usuarios.
- [ ] Probar con ~5 usuarios reales y medir **costo por usuario**.
- [ ] Política de privacidad y términos de uso.
- [ ] Decidir hosting de la landing (Vercel u otro).

---

## 20. Cómo usar este archivo

**Toda nueva conversación de Claude Code debe comenzar leyendo este archivo.**

> "Antes de modificar cualquier parte del proyecto, lee `ABAKUS_MASTER_SPEC.md` y
> respeta sus decisiones (§17). Si una solicitud contradice este documento, **avisa
> primero y pide confirmación** antes de actuar."

Complementos de contexto técnico: `abakus-backend/CLAUDE.md` (detalle de
implementación) y `abakus-backend/migrations.sql` (esquema de DB).
Para verificar qué versión está en producción: `GET /health` devuelve el commit
desplegado.

---

## 21. Changelog

> Registrar aquí cada actualización relevante del proyecto: fecha · cambio · motivo.

- **2026-06-21** — Creación de `ABAKUS_MASTER_SPEC.md` como fuente de verdad del
  proyecto. Motivo: preservar contexto entre sesiones de Claude Code y dejar
  explícitas las decisiones tomadas. Estado del backend al momento de crearlo
  (rama `claude/remote-control-yexmni`): registro NL multi-movimiento, categorías
  aprendidas, multimoneda, correlativo por usuario, corregir/eliminar, CxC y CxP,
  cuentas (bancos/caja) con saldos y transferencias, carga masiva Excel, reportes,
  resumen/detalle/comparar/proyección/meta, recordatorios y tip diario (cron),
  suscripción Mercado Pago, onboarding guiado, aprendizaje por usuario, contexto
  conversacional (en memoria) y panel admin de aprendizaje.
