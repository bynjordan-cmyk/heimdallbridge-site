import { Request, Response } from 'express';
import { config } from '../config';

/**
 * GET de verificación de Meta. Responde con hub.challenge si el token coincide.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
}
