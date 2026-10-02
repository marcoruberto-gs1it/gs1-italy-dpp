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

/** UPI — Unique Product Identifier — come URI GS1 Digital Link, al livello di granularità più
 * fine dichiarato dalla scheda (un articolo seriale è unico più nel dettaglio di un lotto, che a
 * sua volta lo è più di un modello). Stessa identica funzione di mockRegistryClient.ts#buildUpi
 * (il valore inviato come `upi` al DPP Registry UE): lo stesso identificativo compare qui e là,
 * solo con nomi di campo diversi (vedi commento più sotto). */
function buildUpi(siteUrl: string, record: DppRecord): string {
  if (record.granularityLevel === 'MODEL' || !record.batchOrSerial) {
    return digitalLinkUrl(siteUrl, record.gtin);
  }
  const value = record.batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
  const ai = /^\(21\)/.test(record.batchOrSerial) || record.granularityLevel === 'ITEM' ? '21' : '10';
  return digitalLinkUrl(siteUrl, record.gtin, ai, value);
}

/** Enumerazione minuscola per il livello di granularità del passaporto. Il nostro database
 * interno resta MAIUSCOLO (è il valore richiesto dallo schema di mock-eu-registry, verificato dal
 * vivo — vedi mockRegistryClient.ts): solo il JSON-LD pubblico usa questa forma. */
function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** Enumerazione minuscola per lo stato operativo del passaporto. Il nostro stato interno
 * (bozza/pubblicata) non è lo stesso concetto ma si mappa senza forzature: una scheda pubblicata
 * è "active" per chi la consulta; una bozza (che il pubblico non vede mai, tranne nella
 * brevissima finestra in cui mock-eu-registry scarica questo JSON-LD PRIMA di confermare la
 * registrazione — vedi getAnyByGtin in db.ts) è "inactive". "archived"/"invalid" non hanno un
 * equivalente nel nostro modello a due stati, quindi non compaiono mai qui. */
function toStandardDppStatus(status: DppRecord['status']): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}

/** "contentSpecificationIds": riferimenti all'atto delegato o alla specifica di contenuto
 * applicabile, come identificativo macchina — non un URL, non testo libero. Derivato da
 * Sector.contentSpecificationId (src/app/data/sectors.ts, duplicato qui come già
 * COMMODITY_CODES in mockRegistryClient.ts: due progetti separati). */
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
  detergents: 'EU_ESPR_REGULATION_2024_1781',
};

/**
 * JSON-LD di una scheda DPP pubblicata. Due parti distinte:
 *
 * 1) Il nucleo DigitalProductPassport — i 9 attributi fissi dello standard: digitalProductPassportId,
 *    uniqueProductIdentifier, granularity, dppSchemaVersion, dppStatus, lastUpdate,
 *    economicOperatorId, facilityId, contentSpecificationIds. Contenuto aggiuntivo oltre questi
 *    9 è esplicitamente ammesso dallo standard, non è una deviazione.
 *
 * 2) Contenuto aggiuntivo, appoggiato a quel meccanismo di estensione — non fa parte del nucleo,
 *    ma non lo contraddice nemmeno:
 *      a) name/gs1:gtin/gs1:hasBatchLotNumber/gs1:hasSerialNumber, dentro un involucro JSON-LD
 *         GS1 Web Vocabulary (@context/@type/@id) — nostra estensione deliberata per
 *         l'interoperabilità con schema.org/motori di ricerca, non richiesta dallo standard, non
 *         in contraddizione con esso. Stesso pattern di riferimento usato da altre pagine
 *         prodotto GS1 in JSON-LD viste online: "@vocab" punta a schema.org, così i termini senza
 *         prefisso (name, description…) si risolvono lì da soli, e solo i concetti specifici GS1
 *         (gtin, hasBatchLotNumber…) restano prefissati "gs1:".
 *      b) gli Attributi liberi di settore (chimica, capacità…): la classe astratta DataElement
 *         del diagramma UML (FprEN 18223), raggruppata per DataElementCollection — una proprietà
 *         dell'oggetto DPP il cui nome è la collezione (es. "sustainabilityInfo") e il cui valore
 *         è un oggetto piatto elementId→value al suo interno (vedi linkTypes.ts). Non
 *         più chiavi piatte alla radice del documento come in una versione precedente di questo
 *         progetto: quella forma non collegava in alcun modo la classe astratta alla classe
 *         principale, solo co-locazione nello stesso oggetto. Coerente con l'esempio reale del
 *         §4.1 (productGeneralInfo/batteryTechnicalSpecs, vedi docs/dpp-api-specification.md),
 *         anch'esso una proprietà nominata contenente più Data Element — non più, come anche
 *         quella versione precedente pensava, l'esempio di una forma piatta.
 */
export function dppToJsonLd(record: DppRecord, identifierBase: string): Record<string, unknown> {
  // identifierBase = origine del RESOLVER (vedi publicUrls.ts): @id e UPI sono l'URI GS1 Digital
  // Link canonico del prodotto, non l'indirizzo della pagina.
  const id = digitalLinkUrl(identifierBase, record.gtin);

  const doc: Record<string, unknown> = {
    // "@vocab" copre già ogni chiave senza prefisso (qui sotto: name, e i 9 campi del nucleo
    // DigitalProductPassport) — "schema:" resta comunque dichiarato per chi preferisse usarlo
    // esplicitamente altrove, "gs1:" per i soli concetti specifici GS1 (gtin, hasBatchLotNumber…).
    '@context': {
      gs1: 'https://ref.gs1.org/voc/',
      schema: 'https://schema.org/',
      '@vocab': 'https://schema.org/',
    },
    '@type': ['Product', 'gs1:Product'],
    '@id': id,
    // Identificativo dell'istanza di passaporto — distinto dal GTIN e dall'UPI: quelli
    // identificano il PRODOTTO, questo identifica IL PASSAPORTO STESSO. Formato URN (RFC 4122),
    // una URI valida.
    digitalProductPassportId: `urn:uuid:${record.id}`,
    // UPI — l'identificativo del prodotto che permette di raggiungere questa scheda: lo stesso
    // URI GS1 Digital Link registrato presso il DPP Registry UE come "upi" (vedi
    // mockRegistryClient.ts#buildUpi) — stesso valore, nome di campo allineato allo standard
    // invece che allo schema specifico del registro.
    uniqueProductIdentifier: buildUpi(identifierBase, record),
    name: record.name,
    'gs1:gtin': record.gtin,
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

  // Ogni categoria di attributi liberi come una DataElementCollection a sé — una proprietà
  // nominata dell'oggetto DPP (es. "sustainabilityInfo") il cui valore è l'oggetto piatto
  // elementId→value al suo interno: la classe astratta DataElement è così collegata alla classe
  // principale tramite questa collezione, non sparsa come chiavi piatte alla radice del
  // documento (vedi il commento sopra la funzione). record.attributes è già in questa stessa
  // forma (normalizeAttributes() in db.ts garantisce la nidificazione anche per righe scritte
  // prima di questa correzione): qui basta unirla a doc, con la stessa guardia anti-collisione di
  // prima ma a livello di collezione invece che di singolo campo.
  for (const [groupKey, fields] of Object.entries(record.attributes)) {
    if (!fields || typeof fields !== 'object') continue;
    const entries = Object.entries(fields);
    if (!entries.length) continue;
    if (groupKey in doc) {
      console.warn(`dppToJsonLd: categoria attributi "${groupKey}" ignorata — coincide con un campo dell'intestazione DPP (record ${record.id}).`);
      continue;
    }
    doc[groupKey] = Object.fromEntries(entries);
  }

  if (record.registryId) {
    // Il DPP Registry UE restituisce "registrationId", non "registryId" (nome solo nostro,
    // interno) — vedi mockRegistryClient.ts.
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
 *   gs1:dpp          — Digital Product Passport (https://ref.gs1.org/voc/dpp), non il più
 *                       generico gs1:pip: questa pagina è specificamente il DPP, GS1 distingue
 *                       esplicitamente i due link type — stesso linktype usato dal vero
 *                       resolver CE, vedi resolverClient.ts#buildLinksetDocument
 *   gs1:masterData   — il JSON-LD di dppToJsonLd(), raggiungibile con Accept: application/ld+json sullo stesso URL
 *                       (content negotiation, vedi webshop/nginx.conf)
 */
export function dppToLinkset(record: DppRecord, resolverUrl: string, siteUrl: string): Record<string, unknown> {
  // anchor = identificatore (resolver); href = pagine (sito) — vedi publicUrls.ts.
  const anchor = digitalLinkUrl(resolverUrl, record.gtin);
  const id = digitalLinkUrl(siteUrl, record.gtin);
  return {
    linkset: [
      {
        anchor,
        'https://ref.gs1.org/voc/defaultLink': [{ href: id, title: record.name }],
        'https://ref.gs1.org/voc/dpp': [{ href: id, title: record.name, type: 'text/html' }],
        'https://ref.gs1.org/voc/masterData': [
          { href: id, title: `${record.name} — JSON-LD`, type: 'application/ld+json' },
        ],
      },
    ],
  };
}
