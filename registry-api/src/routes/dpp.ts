import { Router } from 'express';
import { createDpp, deleteDpp, getDpp, listDpp, markPublished, updateDpp } from '../db.ts';
import { registerDpp } from '../mockRegistryClient.ts';
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
  return null;
}

dppRouter.get('/', (_req, res) => {
  res.json(listDpp());
});

dppRouter.get('/:id', (req, res) => {
  const record = getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  res.json(record);
});

dppRouter.post('/', (req, res) => {
  const error = validateInput(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const record = createDpp(req.body);
  res.status(201).json(record);
});

dppRouter.put('/:id', (req, res) => {
  const existing = getDpp(req.params.id);
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
  res.json(updateDpp(req.params.id, req.body));
});

dppRouter.delete('/:id', (req, res) => {
  const deleted = deleteDpp(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  res.status(204).end();
});

dppRouter.post('/:id/publish', async (req, res) => {
  const record = getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  if (record.status === 'published') {
    res.status(409).json({ error: 'scheda già pubblicata', registryId: record.registryId });
    return;
  }
  try {
    const { registryId, proofJwt } = await registerDpp(record);
    res.json(markPublished(record.id, registryId, proofJwt));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'errore sconosciuto durante la pubblicazione' });
  }
});
