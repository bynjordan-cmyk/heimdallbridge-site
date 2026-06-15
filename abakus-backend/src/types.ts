// ===== Modelos de dominio (espejo del esquema Supabase) =====

export type EstadoUsuario = 'onboarding' | 'activo';

export interface Usuario {
  id: string;
  phone: string; // formato normalizado: +56935594094
  nombre: string | null;
  estado: EstadoUsuario;
  created_at: string;
  updated_at: string;
}

export type TipoMovimiento = 'ingreso' | 'egreso';

export interface Movimiento {
  id: string;
  user_id: string;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  fecha: string;
  created_at: string;
}

export interface CuentaPorCobrar {
  id: string;
  user_id: string;
  contraparte: string | null;
  monto: number;
  descripcion: string | null;
  fecha_vencimiento: string | null;
  estado: 'pendiente' | 'cobrado';
  created_at: string;
}

// ===== Interpretación de Claude =====

export type TipoInterpretacion = 'ingreso' | 'egreso' | 'consulta' | 'deuda' | 'desconocido';

export interface Interpretacion {
  tipo: TipoInterpretacion;
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  contraparte: string | null;
  fecha_vencimiento: string | null;
  respuesta: string;
}

// ===== Mensaje entrante ya normalizado =====

export interface MensajeEntrante {
  phone: string; // normalizado con '+'
  texto: string;
  messageId: string;
  nombre: string | null;
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
}
