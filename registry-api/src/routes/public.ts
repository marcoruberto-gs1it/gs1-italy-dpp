import { Router } from 'express';
import { getPublishedByGtin } from '../db.ts';

/** Rotte pubbliche, senza requireAuth (vedi server.ts) — usate dalle pagine prodotto
 * `/01/:gtin` del sito per mostrare una scheda DPP pubblicata quando esiste, invece del
 * catalogo statico (products.json). Solo lettura, solo schede già pubblicate. */
export const publicRouter = Router();

publicRouter.get('/dpp/:gtin', (req, res) => {
  const record = getPublishedByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda pubblicata per questo GTIN' });
    return;
  }
  res.json(record);
});
