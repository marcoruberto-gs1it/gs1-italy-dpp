import type { DppRecord, GranularityLevel } from './db.ts';
import type { SectorId } from './sectors.ts';

/** URI GS1 Digital Link della scheda: base "/01/{gtin}", con l'eventuale AI (10) lotto o
 * (21) seriale in coda — stessa funzione di mockRegistryClient.ts#digitalLinkUrl, duplicata qui
 * perché jsonld.ts non deve dipendere da mockRegistryClient.ts (uno serve le pagine pubbliche,
 * l'altro parla con un servizio esterno: nessun bisogno che condividano un modulo). */
function digitalLinkUrl(siteUrl: string, gtin: string, ai?: '10' | '21', value?: string): string {
  const base = `${siteUrl.replace(/\/$/, '')}/01/${gtin}`;
  return ai && value ? `${base}/${ai}/${encodeURIComponent(value)}` : base;
}

/** UPI — Unique Product Identifier, EN 18219 §3.1.25 — come URI GS1 Digital Link, al livello
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

/** EN 18223 §4.1.2.1 (Table 1, "granularity"): due fonti reali in disaccordo sulla
 * capitalizzazione dell'enumerazione. Il documento sintesi da cui questo progetto è partito
 * (docs/dpp-api-specification.md §6.1) la riporta con l'iniziale maiuscola ("Model"/"Batch"/
 * "Item"); openepcis/openepcis-dpp-ready (Apache-2.0, framework OpenEPCIS per EN 18223 — vedi
 * i suoi esempi "operational" reali, es. extensions/eu/battery/examples/battery-product.
 * operational.jsonld) la usa tutta minuscola ("model"/"batch"/"item") in modo coerente in tutti
 * i suoi esempi e nella sua stessa documentazione. Nessuno dei due è il testo normativo
 * ufficiale pubblicato (a pagamento, non liberamente consultabile): allineato qui a OpenEPCIS
 * per scelta esplicita, non perché l'altra fonte fosse sbagliata — vedi la Nota di
 * implementazione in docs/dpp-api-specification.md per la stessa divergenza dichiarata anche
 * lì. Il nostro database interno resta MAIUSCOLO (è anche il valore richiesto dallo schema di
 * mock-eu-registry, verificato dal vivo — vedi mockRegistryClient.ts): solo il JSON-LD pubblico
 * cambia qui. */
function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** EN 18223 §4.1.2.1 (Table 1, "dppStatus"): stessa divergenza di toStandardGranularity() sopra,
 * stessa scelta — allineato a OpenEPCIS DPP-Ready (minuscolo) invece che al documento sintesi
 * originale (maiuscolo). Il nostro stato interno (bozza/pubblicata) non è lo stesso concetto ma
 * si mappa senza forzature: una scheda pubblicata è "active" per chi la consulta; una bozza (che
 * il pubblico non vede mai, tranne nella brevissima finestra in cui mock-eu-registry scarica
 * questo JSON-LD PRIMA di confermare la registrazione — vedi getAnyByGtin in db.ts) è
 * "inactive". "archived"/"invalid" non hanno un equivalente nel nostro modello a due stati,
 * quindi non compaiono mai qui. */
function toStandardDppStatus(status: DppRecord['status']): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}

/** "contentSpecificationIds" (EN 18223 §4.1.2.1, Table 1): riferimenti all'atto delegato o alla
 * specifica di contenuto applicabile, come identificativo macchina — non un URL, non testo
 * libero. Derivato da Sector.contentSpecificationId (src/app/data/sectors.ts, duplicato qui
 * come già COMMODITY_CODES in mockRegistryClient.ts: due progetti separati). */
const CONTENT_SPECIFICATION_IDS: Record<SectorId, string> = {
  battery: 'EU_BATTERY_REGULATION_2023_1542',
  apparel: 'EU_ESPR_REGULATION_2024_1781',
  steel: 'EU_ESPR_REGULATION_2024_1781',
  construction: 'EU_ESPR_REGULATION_2024_1781',
  aluminium: 'EU_ESPR_REGULATION_2024_1781',
  tyres: 'EU_ESPR_REGULATION_2024_1781',
  furniture: 'EU_ESPR_REGULATION_2024_1781',
  mattresses: 'EU_ESPR_REGULATION_2024_1781',
  ict: 'EU_ESPR_REGULATION_2024_1781',
};

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
 *    EN 18223:2026 (CEN/CENELEC) §4.1.2.1, Tabella 1 — i NOMI di campo qui sotto
 *    (digitalProductPassportId, uniqueProductIdentifier, granularity, dppSchemaVersion,
 *    dppStatus, lastUpdated, economicOperatorId, facilityId, contentSpecificationIds) sono
 *    quelli della tabella normativa. I VALORI di granularity/dppStatus/dppSchemaVersion seguono
 *    invece la convenzione di openepcis/openepcis-dpp-ready (Apache-2.0), non quella del
 *    documento sintesi originale — vedi il commento su toStandardGranularity()/
 *    toStandardDppStatus() più sotto e la Nota di implementazione in
 *    docs/dpp-api-specification.md per il perché. Questi campi non hanno un prefisso "gs1:"
 *    perché non fanno parte del GS1 Web Vocabulary: sono un vocabolario CEN/CENELEC a sé, qui
 *    esposto senza namespace dedicato (lo standard stesso non ne definisce uno per JSON-LD) ma
 *    con i nomi letterali della tabella normativa.
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
    // Identificativo dell'istanza di passaporto (EN 18223 §4.1.2.1) — distinto dal GTIN e
    // dall'UPI: quelli identificano il PRODOTTO, questo identifica IL PASSAPORTO STESSO.
    // Formato URN (RFC 4122), non un URL: lo standard non richiede che sia risolvibile via web
    // (quel compito spetta a uniqueProductIdentifier).
    digitalProductPassportId: `urn:uuid:${record.id}`,
    // UPI — l'identificativo del prodotto che permette di raggiungere questa scheda (EN 18219
    // §3.1.25): lo stesso URI GS1 Digital Link registrato presso il DPP Registry UE come "upi"
    // (vedi mockRegistryClient.ts#buildUpi) — stesso valore, nome di campo allineato allo
    // standard invece che allo schema specifico del registro.
    uniqueProductIdentifier: buildUpi(siteUrl, record),
    name: record.name,
    gtin: record.gtin,
    granularity: toStandardGranularity(record.granularityLevel),
    // "EN 18223:2026" — formato openepcis/openepcis-dpp-ready (norma + anno), non
    // "EN18223:v1.0" (norma + v-major.minor) del documento sintesi originale: stessa scelta di
    // toStandardGranularity()/toStandardDppStatus() sopra, stesso motivo.
    dppSchemaVersion: 'EN 18223:2026',
    dppStatus: toStandardDppStatus(record.status),
    lastUpdated: record.updatedAt,
    // Compilati dall'utente nel form admin (colonne economic_operator_id/facility_id, vedi
    // db.ts) — non più una costante fissa: due schede diverse possono avere un GLN diverso.
    // Stesso valore inviato come "reoId"/"facilitiesId" al DPP Registry UE, vedi mockRegistryClient.ts.
    economicOperatorId: record.economicOperatorId,
    facilityId: record.facilityId,
    contentSpecificationIds: [CONTENT_SPECIFICATION_IDS[record.sectorId]],
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
    // Nome allineato all'output di RegisterProductDPP (EN 18222 §5.2, Tabella 8): il DPP
    // Registry UE restituisce "registrationId", non "registryId" (nome solo nostro, interno).
    doc['registrationId'] = record.registryId;
  }

  return doc;
}

/**
 * Linkset GS1 Digital Link (RFC 9264, application/linkset+json) — la terza rappresentazione
 * che uno standard resolver conforme deve offrire oltre a HTML e JSON-LD, richiesta con
 * `?linkType=linkset` o `Accept: application/linkset+json` (vedi ref.gs1.org/standards/resolver,
 * verificato contro un resolver pubblico di riferimento prima di scrivere questa funzione).
 * Invece di rispondere con un solo redirect, elenca ESPLICITAMENTE le rappresentazioni
 * disponibili per lo stesso identificativo — utile a un client che non vuole indovinare cosa
 * c'è dietro un URL prima di seguirlo. Tre relazioni, tutte già risolvibili su questo sito:
 *   gs1:defaultLink  — dove porta una richiesta senza content negotiation (la pagina HTML)
 *   gs1:pip          — Product Information Page, la stessa pagina HTML, nominata esplicitamente
 *   gs1:masterData   — il JSON-LD di dppToJsonLd(), raggiungibile anche con ?linkType=masterData
 *                       (vedi webshop/nginx.conf) invece di dover rimandare Accept: application/ld+json
 */
export function dppToLinkset(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const id = digitalLinkUrl(siteUrl, record.gtin);
  return {
    linkset: [
      {
        anchor: id,
        'https://ref.gs1.org/voc/defaultLink': [{ href: id, title: record.name }],
        'https://ref.gs1.org/voc/pip': [{ href: id, title: record.name, type: 'text/html' }],
        'https://ref.gs1.org/voc/masterData': [
          { href: `${id}?linkType=masterData`, title: `${record.name} — JSON-LD`, type: 'application/ld+json' },
        ],
      },
    ],
  };
}
