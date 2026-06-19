// ===== Modelos de dominio (espejo del esquema Supabase) =====

export interface Usuario {
  id: string;
  phone: string; // formato: solo dígitos, sin '+' (ej: 56935594094)
  nombre: string | null;
  plan: string | null;
  activo: boolean | null;
  negocio: string | null;
  tono: string | null;
  // Moneda del usuario (ISO 4217: 'CLP', 'MXN', 'PEN', 'USD'...). Una por usuario.
  // Se infiere del prefijo telefónico y se ajusta si la persona menciona otra.
  moneda: string | null;
  onboarding_step: number | null;
  trial_ends_at: string | null;
  email: string | null;
  estado_conversacion: string | null;
  meta_mensual: number | null;
  // Movimientos en espera de que el usuario indique a qué cuenta van
  // (estado_conversacion === 'esperando_cuenta'). Requiere columna
  // `pendiente jsonb` en usuarios.
  pendiente: MovimientoInterpretado[] | null;
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
  // Correlativo por usuario (#1, #2, ...) para identificar y referenciar el
  // movimiento. Requiere columna `correlativo int` en la tabla movimientos.
  correlativo: number | null;
  tipo: TipoMovimiento;
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  fecha: string;
  // Cuenta (banco/caja) a la que pertenece el movimiento. Requiere columna
  // `cuenta_id uuid` en movimientos. null = movimiento sin cuenta (legacy o
  // usuarios que aún no usan cuentas).
  cuenta_id: string | null;
  created_at: string;
}

export type TipoCuenta = 'banco' | 'caja' | 'otro';

/** Cuenta del usuario: banco o caja/efectivo, con saldo inicial. */
export interface Cuenta {
  id: string;
  user_phone: string;
  nombre: string;
  tipo: TipoCuenta | string;
  saldo_inicial: number;
  created_at: string;
}

/** Una cuenta con su saldo calculado (inicial + movimientos + transferencias). */
export interface CuentaConSaldo extends Cuenta {
  saldo: number;
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

export type TipoInterpretacion = 'ingreso' | 'egreso' | 'consulta' | 'deuda' | 'cobro' | 'cuenta_pagar' | 'saldar' | 'eliminar' | 'corregir' | 'crear_cuenta' | 'transferencia' | 'desconocido';

/**
 * Un ingreso o egreso individual detectado dentro de un mensaje. Un solo mensaje
 * puede contener varios ("vendí 50k el lunes, pagué 20k de arriendo, cobré 30k"),
 * por lo que la interpretación devuelve una lista en `Interpretacion.movimientos`.
 */
export interface MovimientoInterpretado {
  tipo: TipoMovimiento; // ingreso | egreso
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  fecha: string | null; // YYYY-MM-DD si el usuario la menciona; null = hoy
  cuenta: string | null; // nombre de la cuenta/banco mencionada, o null
}

export interface Interpretacion {
  tipo: TipoInterpretacion;
  nombre: string | null;
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  contraparte: string | null;
  fecha_vencimiento: string | null;
  respuesta: string;
  // Ingresos/egresos detectados en el mensaje (0, 1 o varios). Vacío para
  // consulta/deuda/cobro/eliminar/corregir/desconocido.
  movimientos: MovimientoInterpretado[];
  // Correlativo del movimiento referido por el usuario (ej. "corrige el #5").
  referencia: number | null;
  // Nuevo tipo al corregir un movimiento ("era un ingreso no egreso"). null si
  // la corrección no cambia el tipo. Solo aplica a tipo === 'corregir'.
  nuevo_tipo: TipoMovimiento | null;
  // ===== Cuentas (bancos / caja) =====
  // crear_cuenta: nombre y saldo inicial de la cuenta a crear.
  cuenta: string | null;
  saldo_inicial: number | null;
  // transferencia: cuentas origen y destino.
  cuenta_origen: string | null;
  cuenta_destino: string | null;
  // ===== Aprendizaje: datos que Claude extrae para recordar =====
  negocio: string | null;      // a qué se dedica el usuario, si lo revela
  tono: string | null;         // preferencia de estilo, si la pide explícitamente
  aprendizaje: string | null;  // dato durable nuevo a recordar (o null)
  // Moneda (ISO 4217) que el usuario menciona o revela explícitamente en este
  // mensaje (ej. "uso dólares", "cobré 100 soles"). null si no la menciona.
  moneda: string | null;
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
