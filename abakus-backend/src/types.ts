// ===== Modelos de dominio (espejo del esquema Supabase) =====

export interface Usuario {
  id: string;
  phone: string; // formato: solo dígitos, sin '+' (ej: 56935594094)
  nombre: string | null;
  plan: string | null;
  activo: boolean | null;
  negocio: string | null;
  tono: string | null;
  onboarding_step: number | null;
  trial_ends_at: string | null;
  email: string | null;
  estado_conversacion: string | null;
  meta_mensual: number | null;
  // Memoria explícita: datos durables que el usuario ha mencionado y que
  // Abakus recuerda para personalizar futuras conversaciones.
  // Requiere columna `memoria jsonb DEFAULT '[]'` en la tabla usuarios.
  memoria: string[] | null;
  created_at: string;
}

export type TipoMovimiento = 'ingreso' | 'egreso';

export interface Movimiento {
  id: string;
  user_phone: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  fecha: string;
  created_at: string;
}

export interface CuentaPorCobrar {
  id: string;
  user_phone: string;
  tipo: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fecha_vencimiento: string | null;
  pagado: boolean | null;
  recordatorio_enviado: boolean | null;
  created_at: string;
}

// ===== Interpretación de Claude =====

export type TipoInterpretacion = 'ingreso' | 'egreso' | 'consulta' | 'deuda' | 'cobro' | 'eliminar' | 'corregir' | 'desconocido';

export interface Interpretacion {
  tipo: TipoInterpretacion;
  nombre: string | null;
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  contraparte: string | null;
  fecha_vencimiento: string | null;
  respuesta: string;
  // ===== Aprendizaje: datos que Claude extrae para recordar =====
  negocio: string | null;      // a qué se dedica el usuario, si lo revela
  tono: string | null;         // preferencia de estilo, si la pide explícitamente
  aprendizaje: string | null;  // dato durable nuevo a recordar (o null)
}

// ===== Mensaje entrante ya normalizado =====

export interface DocumentoEntrante {
  mediaId: string;
  filename: string;
  mimeType: string;
}

export interface MensajeEntrante {
  phone: string; // normalizado: solo dígitos, sin '+'
  texto: string;
  messageId: string;
  nombre: string | null;
  documento: DocumentoEntrante | null;
}

// ===== Tipos mínimos del payload de Meta WhatsApp Cloud API =====

export interface WhatsAppWebhookBody {
  object?: string;
  entry?: WhatsAppEntry[];
}

interface WhatsAppEntry {
  id: string;
  changes?: WhatsAppChange[];
}

interface WhatsAppChange {
  field: string;
  value: WhatsAppChangeValue;
}

interface WhatsAppChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id: string; display_phone_number: string };
  contacts?: { profile: { name: string }; wa_id: string }[];
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  document?: { id: string; mime_type: string; filename?: string };
}
