/**
 * Diagnóstico y re-registro del número de WhatsApp Cloud API.
 *
 * Resuelve el caso típico: "el display name fue aprobado por Meta pero el
 * número sigue mostrando el +56 9 ...". El nombre aprobado NO se aplica al
 * número en vivo hasta que se RE-REGISTRA el número vía API (el nuevo
 * certificado lleva embebido el nombre).
 *
 * Uso:
 *   npm run wa:perfil           → diagnóstico (estado del nombre)
 *   npm run wa:perfil register  → re-registra el número (necesita WHATSAPP_PIN)
 *
 * Variables de entorno necesarias (.env local o Railway):
 *   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_PIN  → PIN de 6 dígitos de la verificación en dos pasos (solo para register)
 */
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? 'v22.0';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PIN = process.env.WHATSAPP_PIN;

if (!PHONE_ID || !TOKEN) {
  console.error('❌ Faltan WHATSAPP_PHONE_NUMBER_ID y/o WHATSAPP_ACCESS_TOKEN en el entorno.');
  process.exit(1);
}

const BASE = `https://graph.facebook.com/${GRAPH}/${PHONE_ID}`;
const headers = { Authorization: `Bearer ${TOKEN}` };

interface EstadoNumero {
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  code_verification_status?: string;
  quality_rating?: string;
  platform_type?: string;
  account_mode?: string;
}

const EXPLICACION_NAME_STATUS: Record<string, string> = {
  APPROVED: '✅ Nombre APROBADO. Si aún no se ve, hay que RE-REGISTRAR el número (ver abajo).',
  AVAILABLE_WITHOUT_REVIEW: '✅ Nombre disponible sin revisión. Re-registra para aplicarlo.',
  PENDING_REVIEW: '⏳ Nombre EN REVISIÓN por Meta. Hay que esperar a que cambie a APPROVED.',
  DECLINED: '❌ Nombre RECHAZADO por Meta. Debes elegir otro nombre que cumpla las políticas.',
  EXPIRED: '⚠️ La solicitud de nombre EXPIRÓ. Vuelve a enviarla en WhatsApp Manager.',
  NONE: 'ℹ️ No hay nombre configurado. Configúralo en WhatsApp Manager → Perfil.',
};

async function diagnostico(): Promise<void> {
  const fields =
    'display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,account_mode';
  const { data } = await axios.get<EstadoNumero>(`${BASE}?fields=${fields}`, { headers });

  console.log('\n📱 Estado del número de WhatsApp Cloud API\n');
  console.log(`  Número:              ${data.display_phone_number ?? '—'}`);
  console.log(`  Nombre verificado:   ${data.verified_name ?? '—'}`);
  console.log(`  Estado del nombre:   ${data.name_status ?? '—'}`);
  console.log(`  Verificación código: ${data.code_verification_status ?? '—'}`);
  console.log(`  Calidad:             ${data.quality_rating ?? '—'}`);
  console.log(`  Plataforma:          ${data.platform_type ?? '—'}`);
  console.log(`  Modo de cuenta:      ${data.account_mode ?? '—'}`);

  const status = data.name_status ?? 'NONE';
  console.log(`\n  → ${EXPLICACION_NAME_STATUS[status] ?? 'Estado desconocido: ' + status}\n`);

  if (status === 'APPROVED' || status === 'AVAILABLE_WITHOUT_REVIEW') {
    console.log('Para aplicar el nombre al número en vivo, ejecuta:');
    console.log('  WHATSAPP_PIN=tu_pin_de_6_digitos npm run wa:perfil register\n');
  }
}

async function reRegistrar(): Promise<void> {
  if (!PIN || !/^\d{6}$/.test(PIN)) {
    console.error(
      '❌ Falta WHATSAPP_PIN (6 dígitos). Es el PIN de la verificación en dos pasos del número.\n' +
        '   Si no tienes uno, créalo en WhatsApp Manager → Configuración del número → Verificación en dos pasos,\n' +
        '   o ejecútalo así: WHATSAPP_PIN=123456 npm run wa:perfil register',
    );
    process.exit(1);
  }

  console.log('\n🔄 Re-registrando el número para aplicar el nombre aprobado...\n');
  try {
    const { data } = await axios.post(
      `${BASE}/register`,
      { messaging_product: 'whatsapp', pin: PIN },
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
    console.log('✅ Re-registro exitoso:', JSON.stringify(data));
    console.log('\nEspera 1-2 minutos y revisa el chat: el nombre "Abakus" debería aparecer.');
    console.log('Si tras varios minutos no cambia, vuelve a correr el diagnóstico:\n  npm run wa:perfil\n');
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('❌ Error en el re-registro:', JSON.stringify(err.response?.data ?? err.message, null, 2));
      const code = err.response?.data?.error?.code;
      if (code === 100) {
        console.error('\n   El PIN puede ser incorrecto, o la verificación en dos pasos no está activa.');
      }
    } else {
      console.error('❌ Error inesperado:', err);
    }
    process.exit(1);
  }
}

const modo = process.argv[2];
const main = modo === 'register' ? reRegistrar : diagnostico;
void main().catch((err) => {
  if (axios.isAxiosError(err)) {
    console.error('❌ Error consultando la API de Meta:', JSON.stringify(err.response?.data ?? err.message, null, 2));
  } else {
    console.error('❌ Error inesperado:', err);
  }
  process.exit(1);
});
