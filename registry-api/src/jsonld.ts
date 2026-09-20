import type { DppRecord, GranularityLevel } from './db.ts';

/** URI GS1 Digital Link della scheda: base "/01/{gtin}", con l'eventuale AI (10) lotto o
 * (21) seriale in coda — stessa funzione di mockRegistryClient.ts#digitalLinkUrl, duplicata qui
 * perché jsonld.ts non deve dipendere da mockRegistryClient.ts (uno serve le pagine pubbliche,
 * l'altro parla con un servizio esterno: nessun bisogno che condividano un modulo). */
function digitalLinkUrl(siteUrl: string, gtin: string, ai?: '10' | '21', value?: string): string {
  const base = `${siteUrl.replace(/\/$/, '')}/01/${gtin}`;
  return ai && value ? `${base}/${ai}/${encodeURIComponent(value)}` : base;
}

/** UPI — Unique Product Identifier, FprEN 18219 §3.1.25 — come URI GS1 Digital Link, al livello
 * di granularità più fine dichiarato dalla scheda (requisito 4.4.2(1) dello stesso standard:
 * "unique at least at the smallest granularity level it serves"). Stessa identica funzione di
 * mockRegistryClient.ts#buildUpi (il valore inviato come `upi` al DPP Registry UE): lo stesso
 * identificativo compare qui e là, solo con nomi di campo diversi (vedi commento più sotto). */
function buildUpi(siteUrl: string, record: DppRecord): string {
  if (record.granularityLevel === 'MODEL' || !record.batchOrSerial) {
    return digitalLinkUrl(siteUrl, record.gtin);
  }
  const value = record.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
  const ai = /^\(21\)/.test(record.batchOrSerial) || record.granularityLevel === 'ITEM' ? '21' : '10';
  return digitalLinkUrl(siteUrl, record.gtin, ai, value);
}

/** FprEN 18219 §4.4 (granularity) e FprEN 18223 §4.1.2.2 definiscono i tre livelli in minuscolo
 * ("model", "batch", "item"): il nostro database usa MAIUSCOLO per motivi interni (è anche il
 * valore richiesto dallo schema di mock-eu-registry, verificato dal vivo — vedi
 * mockRegistryClient.ts), ma il JSON-LD pubblico, per dichiararsi davvero conforme allo
 * standard, deve usare l'enumerazione esatta del testo normativo. */
function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  return level.toLowerCase() as 'model' | 'batch' | 'item';
}

/** FprEN 18223 §4.1.2.1 (Table 1, "dppStatus") elenca come esempio i valori "active, inactive,
 * archived, invalid". Il nostro stato interno (bozza/pubblicata) non è lo stesso concetto ma si
 * mappa senza forzature: una scheda pubblicata è "active" per chi la consulta; una bozza (che il
 * pubblico non vede mai, tranne nella brevissima finestra in cui mock-eu-registry scarica questo
 * JSON-LD PRIMA di confermare la registrazione — vedi getAnyByGtin in db.ts) è "inactive". */
function toStandardDppStatus(status: DppRecord['status']): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}

/**
 * JSON-LD di una scheda DPP pubblicata: unisce due vocabolari distinti, entrambi verificati
 * contro la fonte primaria (non scritti a memoria), non inventati.
 *
 * 1) GS1 Web Vocabulary (per l'identificazione del prodotto), verificato scaricando e
 *    controllando https://ref.gs1.org/voc/data/gs1Voc.jsonld:
 *      - gs1:gtin, gs1:Product — dominio/range confermati
 *      - gs1:hasBatchLotNumber — AI (10), dominio gs1:Product/schema:Product
 *      - gs1:hasSerialNumber   — AI (21), dominio gs1:Product/schema:Product
 *    Gli attributi liberi di settore (chimica, capacità…) non hanno un termine GS1 dedicato:
 *    schema:additionalProperty/PropertyValue è il meccanismo che schema.org prevede apposta per
 *    dati arbitrari — non un'invenzione nostra.
 *
 * 2) Il modello semantico del "digital product passport" vero e proprio, definito da
 *    FprEN 18223:2026 (CEN/CENELEC) §4.1.2.1, Tabella 1 — i nomi di campo qui sotto
 *    (digitalProductPassportId, uniqueProductIdentifier, granularity, dppSchemaVersion,
 *    dppStatus, lastUpdate, economicOperatorId) sono ESATTAMENTE quelli richiesti dalla
 *    tabella normativa, non nomi inventati o riadattati dal nostro modello dati interno.
 *    Questi campi non hanno un prefisso "gs1:" perché non fanno parte del GS1 Web Vocabulary:
 *    sono un vocabolario CEN/CENELEC a sé, qui esposto senza namespace dedicato (lo standard
 *    stesso non ne definisce uno per JSON-LD) ma con i nomi letterali della tabella normativa.
 */
export function dppToJsonLd(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const id = digitalLinkUrl(siteUrl, record.gtin);

  const doc: Record<string, unknown> = {
    '@context': {
      gs1: 'https://ref.gs1.org/voc/',
      schema: 'http://schema.org/',
      name: 'schema:name',
      gtin: 'gs1:gtin',
    },
    '@type': ['schema:Product', 'gs1:Product'],
    '@id': id,
    // Identificativo dell'istanza di passaporto (FprEN 18223 §4.1.2.1) — distinto dal GTIN e
    // dall'UPI: quelli identificano il PRODOTTO, questo identifica IL PASSAPORTO STESSO.
    // Formato URN (RFC 4122), non un URL: lo standard non richiede che sia risolvibile via web
    // (quel compito spetta a uniqueProductIdentifier).
    digitalProductPassportId: `urn:uuid:${record.id}`,
    // UPI — l'identificativo del prodotto che permette di raggiungere questa scheda (FprEN 18219
    // §3.1.25): lo stesso URI GS1 Digital Link registrato presso il DPP Registry UE come "upi"
    // (vedi mockRegistryClient.ts#buildUpi) — stesso valore, nome di campo allineato allo
    // standard invece che allo schema specifico del registro.
    uniqueProductIdentifier: buildUpi(siteUrl, record),
    name: record.name,
    gtin: record.gtin,
    granularity: toStandardGranularity(record.granularityLevel),
    dppSchemaVersion: 'FprEN18223:2026',
    dppStatus: toStandardDppStatus(record.status),
    lastUpdate: record.updatedAt,
    // Identificativo demo dell'operatore economico — stesso valore inviato come "reoId" al DPP
    // Registry UE (vedi mockRegistryClient.ts): non abbiamo ancora un modello multi-tenant reale.
    economicOperatorId: 'gs1-italy-dpp-demo',
  };

  if (record.batchOrSerial) {
    const value = record.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
    // AI (21)/livello ITEM → seriale (identifica un singolo esemplare); AI (10) o livello BATCH
    // → lotto (identifica un lotto di produzione) — la stessa distinzione già nel form admin.
    if (/^\(21\)/.test(record.batchOrSerial) || record.granularityLevel === 'ITEM') {
      doc['gs1:hasSerialNumber'] = value;
    } else {
      doc['gs1:hasBatchLotNumber'] = value;
    }
  }

  if (Object.keys(record.attributes).length > 0) {
    doc['schema:additionalProperty'] = Object.entries(record.attributes).map(([propName, value]) => ({
      '@type': 'schema:PropertyValue',
      name: propName,
      value,
    }));
  }

  if (record.registryId) {
    // Nome allineato all'output di RegisterProductDPP (FprEN 18222 §5.2, Tabella 8): il DPP
    // Registry UE restituisce "registrationId", non "registryId" (nome solo nostro, interno).
    doc['registrationId'] = record.registryId;
  }

  return doc;
}
