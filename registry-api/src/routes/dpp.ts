import { Router } from 'express';
import { applyChange, createDpp, deleteDpp, getDpp, listDpp, listEvents, markPublished, saveRegistryTrace, updateDpp } from '../db.ts';
import { SCENARIOS, addMonths, applyPatch, isScenario, planChange } from '../simulate.ts';
import { buildRegistrationRequest, registerDpp, TransientRegistryError } from '../mockRegistryClient.ts';
import { syncResolverEntry } from '../resolverClient.ts';
import { siteUrl } from '../publicUrls.ts';
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
      return 'attributes deve essere un oggetto categoria → chiave/valore';
    }
    for (const group of Object.values(b.attributes as Record<string, unknown>)) {
      if (typeof group !== 'object' || group === null || Array.isArray(group)) {
        return 'ogni categoria di attributes deve essere un oggetto chiave/valore';
      }
      for (const value of Object.values(group as Record<string, unknown>)) {
        if (typeof value !== 'string') return 'ogni valore di attributes deve essere una stringa';
      }
    }
  }
  // economicOperatorId/facilityId: opzionali qui (db.ts ha un default demo se omessi, vedi
  // createDpp) — validati solo se presenti, non richiesti, per non rompere un client che non li
  // manda ancora.
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

/** Anteprima di sola lettura — nessuna chiamata vera a mock-eu-registry — del payload ESATTO che
 * registerDpp() invierebbe se si pubblicasse adesso: la stessa funzione buildRegistrationRequest()
 * usata dalla pubblicazione vera (routes/dpp.ts#publish) e dalla ricostruzione per le schede già
 * registrate (routes/public.ts), non una sua reimplementazione lato frontend — zero rischio che le
 * due divergano. Usata dal Wizard admin nel passo "Registrazione" per mostrare cosa viaggia
 * davvero verso il registro, invece del solo JSON-LD pubblico (che è un'altra cosa: quello il
 * registro lo scarica a parte per l'hash, non lo riceve come corpo della richiesta). */
dppRouter.get('/:id/registration-preview', async (req, res) => {
  const record = await getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  res.json(buildRegistrationRequest(record));
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
  // Le 9 schede di esempio del carosello home (seed.ts) sono statiche apposta — vedi il
  // commento su DppRecord.isStatic in db.ts: modificarle romperebbe quegli esempi.
  if (existing.isStatic) {
    res.status(403).json({ error: 'questa scheda è un esempio statico del carosello home e non è modificabile' });
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
  if (existing.isStatic) {
    res.status(403).json({ error: 'questa scheda è un esempio statico del carosello home e non è eliminabile' });
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
    if (!published) {
      // markPublished non trova più la riga (cancellata nel frattempo?) — non dovrebbe
      // succedere in pratica (nessuna DELETE concorrente possibile sulla stessa riga in questa
      // demo), ma se capitasse rispondere 404 è più onesto di un 200 con un body vuoto.
      res.status(404).json({ error: 'scheda non trovata' });
      return;
    }
    // Richiesta e risposta reali del registro UE, con gli identificativi assegnati: salvate per
    // poterle rimostrare in seguito (pagina gs1:registryEntry), non solo ora.
    await saveRegistryTrace(record.id, request, response);
    // Sincronizza il GS1 Digital Link Resolver CE (vedi resolver/README.md) — non bloccante e
    // mai un motivo di fallimento per questa richiesta: la pubblicazione vera è già avvenuta
    // (registerDpp/markPublished sopra), il resolver è un livello di conformità aggiuntivo, non
    // la fonte di verità. Solo ORA, non a ogni salvataggio di bozza: stessa regola già in vigore
    // per JSON-LD/pagina pubblica.
    void syncResolverEntry(published, siteUrl());
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

/**
 * Simula UNA modifica nel tempo di un DPP già pubblicato (non statico): applica lo scenario come
 * patch sugli attributi (JSON Merge Patch, RFC 7396), registra l'evento nello storico, sposta
 * `lastUpdate` alla data simulata e ri-sincronizza il resolver — una nuova sezione (es. la
 * certificazione dopo un rinnovo) diventa subito un nuovo link type raggiungibile.
 *
 * Body: { scenario, monthsLater?, patch? } — `monthsLater` (1-120, default 12) è quanto tempo dopo
 * l'ULTIMA modifica nota (o la registrazione) avviene questa; `patch` serve solo a `custom`.
 * Il registro UE non viene chiamato: conserva solo i puntatori, non il contenuto (FprEN 18222).
 */
dppRouter.post('/:id/simulate-change', async (req, res) => {
  const record = await getDpp(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'scheda non trovata' });
    return;
  }
  if (record.status !== 'published') {
    res.status(409).json({ error: 'si può simulare una modifica solo su una scheda pubblicata' });
    return;
  }
  if (record.isStatic) {
    res.status(403).json({ error: 'gli esempi della home sono in sola lettura: crea un tuo DPP per simulare una modifica' });
    return;
  }
  const { scenario, monthsLater, patch } = (req.body ?? {}) as { scenario?: unknown; monthsLater?: unknown; patch?: unknown };
  if (!isScenario(scenario)) {
    res.status(400).json({ error: `scenario non valido: usa uno tra ${SCENARIOS.join(', ')}` });
    return;
  }
  const months = monthsLater === undefined ? 12 : Number(monthsLater);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    res.status(400).json({ error: 'monthsLater deve essere un intero tra 1 e 120' });
    return;
  }
  let custom: Record<string, string | null> | undefined;
  if (scenario === 'custom') {
    const entries = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.entries(patch as Record<string, unknown>) : [];
    if (!entries.length || entries.length > 30 || entries.some(([k, v]) => !k || k.length > 120 || !(v === null || (typeof v === 'string' && v.length <= 500)))) {
      res.status(400).json({ error: 'patch: oggetto con 1-30 chiavi, valori stringa (max 500 caratteri) o null per rimuovere' });
      return;
    }
    custom = Object.fromEntries(entries) as Record<string, string | null>;
  }

  const events = await listEvents(record.id);
  const base = new Date(events.length ? events[events.length - 1].at : (record.registeredAt ?? record.createdAt));
  const at = addMonths(base, months);
  const planned = planChange(scenario, record, at, custom);
  const { next, changes } = applyPatch(record.attributes, planned.patch);
  if (!Object.keys(changes).length) {
    res.status(409).json({ error: 'la modifica non cambia nessun attributo' });
    return;
  }
  const result = await applyChange(record, next, { at: at.toISOString(), scenario, simulated: true, title: planned.title, summary: planned.summary, changes });
  void syncResolverEntry(result.record, siteUrl());
  res.json({
    record: result.record,
    event: result.event,
    // La modifica come richiesta standard equivalente (JSON Merge Patch): stessa operazione che
    // espone PATCH /registry-api/v1/dpps/{id} (UpdateDPPById).
    mergePatch: { attributes: planned.patch },
  });
});
