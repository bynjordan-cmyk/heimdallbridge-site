# Abakus — Backend

Asistente financiero por WhatsApp para freelancers y microempresarios (Chile/LATAM).
Registra ingresos, egresos y cuentas por cobrar mediante lenguaje natural.

> Contexto completo del proyecto en [`CLAUDE.md`](./CLAUDE.md).

## Stack

WhatsApp Cloud API → Express (TypeScript) → Claude `claude-haiku-4-5` → Supabase → WhatsApp.

## Quickstart

```bash
cd abakus-backend
npm install
cp .env.example .env   # completar los secretos (tokens/keys)
npm run dev            # arranca en http://localhost:3000
```

Endpoints:

- `GET  /health` — healthcheck.
- `GET  /webhook/abakus-whatsapp` — verificación de Meta (hub.challenge).
- `POST /webhook/abakus-whatsapp` — recepción de mensajes.

## Scripts

| Script              | Descripción                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Desarrollo con recarga (nodemon/ts-node) |
| `npm run typecheck` | Chequeo de tipos sin emitir              |
| `npm run build`     | Compila a `dist/`                        |
| `npm start`         | Ejecuta `dist/index.js` (producción)     |

## Variables de entorno

Ver [`.env.example`](./.env.example). Los secretos (`WHATSAPP_ACCESS_TOKEN`,
`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`) **no se commitean**: van en `.env` local
y en las variables de Railway.

## Deploy (Railway)

Root directory `abakus-backend/`, build `npm run build`, start `npm start`.
Cargar las variables de entorno y apuntar el webhook de Meta al dominio público.
