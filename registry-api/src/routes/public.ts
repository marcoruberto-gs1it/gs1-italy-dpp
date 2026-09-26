import { Router } from 'express';
import { getAnyByGtin, getPublishedByGtin, getRegistryTrace, listEvents } from '../db.ts';
import { buildRegistrationRequest, fetchRegistryEntry } from '../mockRegistryClient.ts';
import { dppToJsonLd, dppToLinkset } from '../jsonld.ts';
import { resolverPublicUrl, siteUrl } from '../publicUrls.ts';

/** Rotte pubbliche, senza requireAuth (vedi server.ts) — usate dalle pagine prodotto
 * `/01/:gtin` del sito per mostrare una scheda DPP pubblicata quando esiste, invece del
 * catalogo statico (products.json). Solo lettura, solo schede già pubblicate. */
export const publicRouter = Router();

publicRouter.get('/dpp/:gtin', async (req, res) => {
  const record = await getPublishedByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda pubblicata per questo GTIN' });
    return;
  }
  res.json(record);
});

/** Content negotiation GS1 Digital Link (vedi webshop/nginx.conf, che instrada qui le
 * richieste `Accept: application/ld+json` su /01/:gtin quando non esiste un sidecar statico
 * generato a build time — vedi docs/GS1-STANDARDS.md). Bozza compresa (getAnyByGtin, non
 * getPublishedByGtin): è anche l'URL che mock-eu-registry stesso interroga per calcolare
 * l'hash del contenuto PRIMA di confermare la registrazione, quando lo stato presso di noi è
 * ancora 'draft' — vedi il commento su getAnyByGtin in db.ts. */
publicRouter.get('/dpp/:gtin/jsonld', async (req, res) => {
  const record = await getAnyByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda con questo GTIN' });
    return;
  }
  res.type('application/ld+json').json(dppToJsonLd(record, resolverPublicUrl()));
});

/** Stessa content negotiation GS1 Digital Link di /jsonld qui sopra, per la rappresentazione
 * linkset (webshop/nginx.conf instrada qui `?linkType=linkset`/`Accept: application/linkset+json`
 * quando non esiste un sidecar statico) — vedi dppToLinkset per cosa contiene e perché. */
publicRouter.get('/dpp/:gtin/linkset', async (req, res) => {
  const record = await getAnyByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda con questo GTIN' });
    return;
  }
  res.type('application/linkset+json').json(dppToLinkset(record, resolverPublicUrl(), siteUrl()));
});

/** Richiesta e risposta REALI del DPP Registry UE alla registrazione (con gli identificativi
 * assegnati). Per le schede registrate prima che venissero salvate si prova a rileggere la voce dal
 * registro; se nemmeno quello è possibile, `available: false`. */
publicRouter.get('/dpp/:gtin/registry-entry', async (req, res) => {
  const record = await getPublishedByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda pubblicata con questo GTIN' });
    return;
  }
  const stored = await getRegistryTrace(record.id);
  if (stored) {
    res.json({ available: true, source: 'registration', registryId: record.registryId, registeredAt: record.registeredAt, request: stored.request, response: stored.response });
    return;
  }
  const live = record.registryId ? await fetchRegistryEntry(record.registryId).catch(() => null) : null;
  // Registrata prima che si salvassero richiesta e risposta: la richiesta è deterministica (stessi
  // dati della scheda) e la si ricostruisce dichiarandolo; la risposta originale no.
  res.json({
    available: !!live,
    source: live ? 'registry-lookup' : 'reconstructed',
    registryId: record.registryId,
    registeredAt: record.registeredAt,
    request: buildRegistrationRequest(record),
    requestReconstructed: true,
    response: live,
  });
});

/** Storico delle modifiche nel tempo (reali o simulate) di una scheda pubblicata. */
publicRouter.get('/dpp/:gtin/history', async (req, res) => {
  const record = await getPublishedByGtin(req.params.gtin);
  if (!record) {
    res.status(404).json({ error: 'nessuna scheda pubblicata con questo GTIN' });
    return;
  }
  res.json({ dppId: record.id, events: await listEvents(record.id) });
});
