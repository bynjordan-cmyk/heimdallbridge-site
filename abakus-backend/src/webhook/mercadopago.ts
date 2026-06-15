import { Request, Response } from 'express';
import { getPayment, getPreapproval } from '../pagos/mercadopago';
import { setPlan } from '../supabase/queries';
import { sendText } from '../whatsapp/sender';

/**
 * Webhook de notificaciones de Mercado Pago.
 * MP avisa cuando una suscripción se autoriza/cancela o un pago se aprueba.
 * Respondemos 200 de inmediato y procesamos en background.
 */
export function handleMercadoPagoWebhook(req: Request, res: Response): void {
  res.sendStatus(200);
  void procesar(req).catch((err) => {
    console.error('[abakus][mp] Error procesando notificación:', err);
  });
}

async function procesar(req: Request): Promise<void> {
  const { tipo, id } = extraerEvento(req);
  if (!id) return;

  if (tipo === 'preapproval' || tipo === 'subscription_preapproval') {
    const pre = await getPreapproval(id);
    const phone = pre.external_reference;
    if (!phone) return;

    if (pre.status === 'authorized') {
      await activarPremium(phone);
    } else if (pre.status === 'cancelled' || pre.status === 'paused') {
      await setPlan(phone, 'gratis');
    }
    return;
  }

  if (tipo === 'payment') {
    const pago = await getPayment(id);
    if (pago.status === 'approved' && pago.external_reference) {
      await activarPremium(pago.external_reference);
    }
  }
}

async function activarPremium(phone: string): Promise<void> {
  await setPlan(phone, 'premium');
  try {
    await sendText(
      phone,
      '🎉 ¡Pago confirmado! Tu plan *Abakus* está activo. Sigue registrando tus finanzas sin límites. ¡Gracias por confiar en nosotros! 🧮',
    );
  } catch (err) {
    console.error('[abakus][mp] No se pudo enviar confirmación de pago:', err);
  }
}

/**
 * MP envía la notificación de formas distintas según el canal:
 * - query: ?topic=preapproval&id=123  o  ?type=payment&data.id=123
 * - body JSON: { type|action, data: { id } }
 */
function extraerEvento(req: Request): { tipo: string; id: string | null } {
  const q = req.query as Record<string, string | undefined>;
  const body = (req.body ?? {}) as { type?: string; topic?: string; data?: { id?: string } };

  const tipo = (body.type ?? body.topic ?? q.type ?? q.topic ?? '').toLowerCase();
  const id = body.data?.id ?? q['data.id'] ?? q.id ?? null;

  return { tipo, id };
}
