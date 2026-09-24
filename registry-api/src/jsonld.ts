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

/** FprEN 18223:2026 §4.1.2.2 (Enumeration): "The values allowed for the 'granularity' attribute
 * are: model, batch, item" — minuscolo, testo normativo. Il §5.2.4 EXAMPLE e l'Annex B XML dello
 * stesso documento scrivono invece "Model" (maiuscolo): §4.1.1 risolve esplicitamente questo
 * tipo di discrepanza a favore del testo/tabelle della Clausola 4 ("If there are discrepancies
 * between the UML diagrams, text and JSON representations the prose text of Clause 4, including
 * the tables, is authoritative"), quindi minuscolo è quello corretto — non una scelta nostra
 * discrezionale (era stata, prima di avere il testo ufficiale in mano — vedi git blame). Il
 * nostro database interno resta MAIUSCOLO (è il valore richiesto dallo schema di
 * mock-eu-registry, verificato dal vivo — vedi mockRegistryClient.ts): solo il JSON-LD pubblico
 * usa l'enumerazione dello standard. */
function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** FprEN 18223:2026 Table 1 (attributo "dppStatus"): "EXAMPLE Example values for the 'dppStatus'
 * attribute are: active, inactive, archived, invalid" — minuscolo, dentro la tabella normativa
 * stessa (non un semplice esempio JSON a parte): stessa autorevolezza di
 * toStandardGranularity() sopra, stesso motivo. Il nostro stato interno (bozza/pubblicata) non è
 * lo stesso concetto ma si mappa senza forzature: una scheda pubblicata è "active" per chi la
 * consulta; una bozza (che il pubblico non vede mai, tranne nella brevissima finestra in cui
 * mock-eu-registry scarica questo JSON-LD PRIMA di confermare la registrazione — vedi
 * getAnyByGtin in db.ts) è "inactive". "archived"/"invalid" non hanno un equivalente nel nostro
 * modello a due stati, quindi non compaiono mai qui. */
function toStandardDppStatus(status: DppRecord['status']): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}

/** "contentSpecificationIds" (FprEN 18223 §4.1.2.1, Table 1): riferimenti all'atto delegato o alla
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
 * JSON-LD di una scheda DPP pubblicata — verificato campo per campo contro il testo ufficiale
 * FprEN 18223:2026 "Digital Product Passport — System interoperability" (Final Draft, febbraio
 * 2026, CEN/CLC/JTC 24), non più solo contro sintesi/implementazioni terze. Due parti distinte:
 *
 * 1) Il nucleo DigitalProductPassport, FprEN 18223 §4.1.2.1 Table 1 — ESATTAMENTE i 9 attributi
 *    lì elencati, nomi E VALORI (non solo i nomi):
 *      - digitalProductPassportId, uniqueProductIdentifier, granularity, dppSchemaVersion,
 *        dppStatus, lastUpdate (senza "d" finale — vedi nota sotto), economicOperatorId,
 *        facilityId, contentSpecificationIds.
 *      - granularity/dppStatus in minuscolo: vedi toStandardGranularity()/toStandardDppStatus()
 *        sopra, entrambe citano la clausola esatta.
 *      - dppSchemaVersion nel formato "<norma>:v<major>.<minor>" — l'unico formato che il
 *        documento stesso usa nei propri esempi (§5.2.4: "ENXXX:v1.0"; Annex B:
 *        "prEN18223:v1.0"), quindi "EN18223:v1.0" qui (senza spazio, senza l'anno).
 *      - "lastUpdate", non "lastUpdated": la Table 1 nomina l'attributo "lastUpdate" — gli
 *        esempi JSON/XML dello stesso documento (§5.2.4, Annex B) scrivono però "lastUpdated",
 *        in contraddizione con la propria tabella. §4.1.1 risolve esplicitamente le discrepanze
 *        tra tabelle/testo ed esempi a favore delle tabelle ("the prose text of Clause 4,
 *        including the tables, is authoritative"): "lastUpdate" è quindi la forma corretta,
 *        anche se è quella che appare MENO spesso nel documento.
 *    "{DataElement}" (Table 1, ultima riga) è il meccanismo con cui lo standard ammette
 *    esplicitamente contenuto aggiuntivo oltre ai 9 attributi fissi — non serve dichiarare
 *    ulteriori campi come deviazione, sono già previsti.
 *
 * 2) Contenuto aggiuntivo, appoggiato al meccanismo "{DataElement}" del punto 1 sopra — non
 *    fanno parte del nucleo Table 1, ma non lo contraddicono nemmeno:
 *      a) name/gtin/gs1:hasBatchLotNumber/gs1:hasSerialNumber, dentro un involucro JSON-LD
 *         GS1 Web Vocabulary (@context/@type/@id) — verificato scaricando e controllando
 *         https://ref.gs1.org/voc/data/gs1Voc.jsonld (gs1:gtin/gs1:Product: dominio/range
 *         confermati; gs1:hasBatchLotNumber AI (10); gs1:hasSerialNumber AI (21)). Nostra
 *         estensione deliberata per l'interoperabilità con schema.org/motori di ricerca — non
 *         richiesta da FprEN 18223, non in contraddizione con esso.
 *      b) gli Attributi liberi di settore (chimica, capacità…): FprEN 18223 §5.2.6 EXAMPLE 1
 *         mostra un SingleValuedDataElement autonomo serializzato come coppia chiave-valore
 *         DIRETTA sull'oggetto DPP ("manufacturerName": "ExampleCorp") — non avvolto in un
 *         array come avevamo fatto prima con schema:additionalProperty/PropertyValue (nostra
 *         invenzione, non richiesta né suggerita dal testo): ora ogni attributo diventa una
 *         chiave di primo livello, coerente con l'esempio ufficiale.
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
    // Identificativo dell'istanza di passaporto (FprEN 18223 §4.1.2.1 Table 1) — distinto dal
    // GTIN e dall'UPI: quelli identificano il PRODOTTO, questo identifica IL PASSAPORTO STESSO.
    // Formato URN (RFC 4122): la tabella richiede solo "String", ma la prosa subito sotto la
    // tabella precisa "should be based on a URI/URL structure" — un URN è una URI valida.
    digitalProductPassportId: `urn:uuid:${record.id}`,
    // UPI — l'identificativo del prodotto che permette di raggiungere questa scheda (FprEN 18219
    // §3.1.25): lo stesso URI GS1 Digital Link registrato presso il DPP Registry UE come "upi"
    // (vedi mockRegistryClient.ts#buildUpi) — stesso valore, nome di campo allineato allo
    // standard invece che allo schema specifico del registro.
    uniqueProductIdentifier: buildUpi(siteUrl, record),
    name: record.name,
    gtin: record.gtin,
    granularity: toStandardGranularity(record.granularityLevel),
    dppSchemaVersion: 'EN18223:v1.0',
    dppStatus: toStandardDppStatus(record.status),
    lastUpdate: record.updatedAt,
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

  // Ogni attributo libero come SingleValuedDataElement autonomo (FprEN 18223 §5.2.6 EXAMPLE 1) —
  // chiave di primo livello sull'oggetto DPP, valore diretto: non più avvolti in un array
  // schema:additionalProperty/PropertyValue (vedi il commento sopra la funzione per il perché).
  // Un attributo il cui nome coincide con un campo dell'intestazione DPP (es. l'utente scrive
  // "name" o "granularity" come chiave) andrebbe altrimenti a sovrascrivere in silenzio quel
  // campo, dato che qui sono tutte chiavi dello stesso oggetto piatto: ignorato con un avviso
  // in log invece che corrompere l'intestazione.
  for (const [propName, value] of Object.entries(record.attributes)) {
    if (propName in doc) {
      console.warn(`dppToJsonLd: attributo "${propName}" ignorato — coincide con un campo dell'intestazione DPP (record ${record.id}).`);
      continue;
    }
    doc[propName] = value;
  }

  if (record.registryId) {
    // Nome allineato all'output di RegisterProductDPP (FprEN 18222 §5.2 Table 8): il DPP
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
