import { Router } from 'express';
import { createDpp, deleteDpp, getDpp, listDpp, markPublished, updateDpp } from '../db.ts';
import { registerDpp, TransientRegistryError } from '../mockRegistryClient.ts';
import { isValidSectorId } from '../sectors.ts';

export const dppRouter = Router();

const GRANULARITY_LEVELS = ['MODEL', 'BATCH', 'ITEM'];

function validateInput(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'corpo della richiesta mancante';
  const b = body as Record<string, unknown>;
  if (!isValidSectorId(b.sectorId)) return 'sectorId non valido';
  if (typeof b.gtin !== 'string' || !/^\d{8,14}$/.test(b.gtin)) return 'gtin deve essere una stringa numerica di 8-14 cifre';
  if (typeof b.name !== 'string' || !b.name.trim()) return 'name obbligatorio';
  if (typeof b.granularityLevel !== 'string' || !GRANULARITY_LEVELS.includes(b.granularityLevel)) {
    return `granularityLevel deve essere uno tra ${GRANULARITY_LEVELS.join(', ')}`;
  }
  if (b.attributes !== undefined) {
    if (typeof b.attributes !== 'object' || b.attributes === null || Array.isArray(b.attributes)) {
      return 'attributes deve essere un oggetto chiave/valore';
    }
    for (const value of Object.values(b.attributes as Record<string, unknown>)) {
      if (typeof value !== 'string') return 'ogni valore di attributes deve essere una stringa';
    }
  }
  // economicOperatorId/facilityId (FprEN 18223 §4.1.2.1 Table 1): opzionali qui (db.ts ha un
  // default demo se omessi, vedi createDpp) — validati solo se presenti, non richiesti, per non
  // rompere un client che non li manda ancora.
  if (b.economicOperatorId !== undefined && (typeof b.economicOperatorId !== 'string' || !b.economicOperatorId.trim())) {
    return 'economicOperatorId, se presente, deve essere una stringa non vuota';
  }
  if (b.facilityId !== undefined && (typeof b.facilityId !== 'string' || !b.facilityId.trim())) {
    return 'facilityId, se presente, deve essere una stringa non vuota';
  }
  return null;
}

dppRouter.get('/', async (_req, res) => {
  res.json(await listDpp());
});

dppRouter.get('/:id', async (req, res) => {
  const record = await getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  res.json(record);
});

dppRouter.post('/', async (req, res) => {
  const error = validateInput(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const record = await createDpp(req.body);
  res.status(201).json(record);
});

dppRouter.put('/:id', async (req, res) => {
  const existing = await getDpp(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  if (existing.status === 'published') {
    res.status(409).json({ error: 'una scheda già pubblicata non è modificabile in questa demo' });
    return;
  }
  const error = validateInput({ ...existing, ...req.body });
  if (error) {
    res.status(400).json({ error });
    return;
  }
  res.json(await updateDpp(req.params.id, req.body));
});

dppRouter.delete('/:id', async (req, res) => {
  const existing = await getDpp(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  // Stessa regola già in vigore per PUT sopra (una volta registrata su mock-eu-registry, il
  // DPP Registry UE reale non offre un'operazione di cancellazione — solo una futura
  // "deactivated", non implementata in questa demo): estenderla anche a DELETE evita che una
  // scheda già pubblicata scompaia da qui pur restando registrata (e quindi "vera") sul
  // registro esterno, con /01/:gtin che smetterebbe di funzionare per un identificativo che il
  // registro crede ancora valido.
  if (existing.status === 'published') {
    res.status(409).json({ error: 'una scheda già pubblicata non è eliminabile in questa demo' });
    return;
  }
  await deleteDpp(req.params.id);
  res.status(204).end();
});

dppRouter.post('/:id/publish', async (req, res) => {
  const record = await getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  if (record.status === 'published') {
    res.status(409).json({ error: 'scheda già pubblicata', registryId: record.registryId });
    return;
  }
  try {
    const { registryId, proofJwt, request, response } = await registerDpp(record);
    const published = await markPublished(record.id, registryId, proofJwt);
    // `technical`: il payload/risposta reali scambiati con mock-eu-registry, solo per la
    // visibilità tecnica nell'interfaccia (vedi PublishJourneyComponent) — non persistiti,
    // rilevanti solo per l'istante della pubblicazione appena avvenuta.
    res.json({ ...published, technical: { request, response } });
  } catch (err) {
    if (err instanceof TransientRegistryError) {
      // Il frontend riprova da solo su retryable:true, senza mostrare nulla di tecnico
      // all'utente — vedi admin.ts. Questo messaggio è solo un ultimo ripiego, se anche i
      // tentativi automatici finiscono per esaurirsi.
      res.status(503).json({ error: 'Il servizio sta impiegando più tempo del solito.', retryable: true });
      return;
    }
    // 422, non 502: quel codice qui significherebbe "mock-eu-registry ha rifiutato questa
    // registrazione per un motivo concreto" (es. il liveURL non è raggiungibile, lo schema del
    // payload non torna...), non "il servizio sta dormendo". 502 è ESATTAMENTE lo status che
    // isColdStartError() (registry-api.service.ts, lato client) tratta come sintomo di
    // risveglio a freddo e riprova da sola in silenzio, con ritardi crescenti fino a ~55s totali
    // (COLD_START_RETRY_DELAYS_MS) — usarlo anche qui faceva ripetere 6 volte una richiesta
    // destinata a fallire sempre allo stesso modo, PRIMA che admin.ts vedesse anche solo il
    // primo errore: da fuori sembrava che "si bloccasse" su "Verifica del Digital Link" per un
    // minuto buono, quando in realtà stava fallendo (bene, con un messaggio chiaro) al primo
    // tentativo, in meno di un secondo — verificato dal vivo con una chiamata diretta a
    // registerDpp() (891ms) contro la stessa richiesta che nell'interfaccia sembrava sospesa.
    res.status(422).json({ error: err instanceof Error ? err.message : 'errore sconosciuto durante la pubblicazione' });
  }
});
