import type { DppRecord } from './db.ts';

/**
 * JSON-LD di una scheda DPP pubblicata, in GS1 Web Vocabulary — stesso principio già in uso
 * per i prodotti statici del catalogo (vedi docs/GS1-STANDARDS.md): un solo URL (`/01/{gtin}`)
 * risolve sia per un browser (HTML) sia per un agente con `Accept: application/ld+json`.
 *
 * Ogni termine `gs1:` qui sotto è stato verificato scaricando e controllando
 * https://ref.gs1.org/voc/data/gs1Voc.jsonld (non scritto a memoria):
 *   - gs1:gtin, gs1:Product — dominio/range confermati
 *   - gs1:hasBatchLotNumber — AI (10), dominio gs1:Product/schema:Product
 *   - gs1:hasSerialNumber   — AI (21), dominio gs1:Product/schema:Product
 * Il "granularity level" e il "registry ID" sono concetti del DPP Registry UE/CEN-CENELEC, non
 * del GS1 Web Vocabulary: compaiono come proprietà semplici, senza prefisso gs1: inventato di
 * sana pianta. Gli attributi liberi di settore (chimica, capacità…) non hanno un termine GS1
 * dedicato: schema:additionalProperty/PropertyValue è il meccanismo che schema.org prevede
 * apposta per dati arbitrari — non un'invenzione nostra.
 */
export function dppToJsonLd(record: DppRecord, siteUrl: string): Record<string, unknown> {
  const id = `${siteUrl.replace(/\/$/, '')}/01/${record.gtin}`;

  const doc: Record<string, unknown> = {
    '@context': {
      gs1: 'https://ref.gs1.org/voc/',
      schema: 'http://schema.org/',
      name: 'schema:name',
      gtin: 'gs1:gtin',
    },
    '@type': ['schema:Product', 'gs1:Product'],
    '@id': id,
    name: record.name,
    gtin: record.gtin,
    granularityLevel: record.granularityLevel,
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
    doc['registryId'] = record.registryId;
  }

  return doc;
}
