import { DppStatus, GranularityLevel } from '../services/registry-api.service';

/**
 * Valori condivisi tra le due costruzioni JSON-LD lato Angular (Admin.previewJsonLd,
 * Product.dppJsonLdJson) — stesso contratto di registry-api/src/jsonld.ts, duplicato lì per la
 * separazione tra i due servizi (vedi il commento lì), ma qui riunito in un solo posto perché
 * admin.ts e product.ts sono nello stesso progetto Angular: nessun motivo di duplicarlo due
 * volte anche qui.
 */

/** Identificativi demo dell'operatore economico e dello stabilimento — stessi valori inviati
 * come "reoId"/"facilitiesId" al DPP Registry UE (vedi mockRegistryClient.ts): non abbiamo
 * ancora un modello multi-tenant reale. */
export const DEMO_ECONOMIC_OPERATOR_ID = 'gs1-italy-dpp-demo';
export const DEMO_FACILITY_ID = 'gs1-italy-dpp-demo-facility';

/** EN 18223 §4.1.2.1, Table 1, campo "dppSchemaVersion" — formato di
 * openepcis/openepcis-dpp-ready (Apache-2.0, framework OpenEPCIS per EN 18223), "<norma> <anno>",
 * non "<norma>:v<major>.<minor>" del documento sintesi originale con cui questo progetto è
 * partito. Nessuno dei due è il testo normativo ufficiale pubblicato (a pagamento): allineato a
 * OpenEPCIS per scelta esplicita — vedi la Nota di implementazione in
 * docs/dpp-api-specification.md. Stesso valore di registry-api/src/jsonld.ts. */
export const DPP_SCHEMA_VERSION = 'EN 18223:2026';

/** EN 18223 §4.1.2.1 (Table 1, "granularity"): due fonti reali in disaccordo sulla
 * capitalizzazione. Il documento sintesi originale la riporta maiuscola ("Model"/"Batch"/
 * "Item"); openepcis/openepcis-dpp-ready la usa tutta minuscola ("model"/"batch"/"item") in modo
 * coerente in tutti i suoi esempi "operational" reali. Allineato qui a OpenEPCIS per scelta
 * esplicita, non perché l'altra fonte fosse sbagliata. Il nostro database interno resta
 * MAIUSCOLO (è anche il valore richiesto dallo schema di mock-eu-registry, verificato dal vivo):
 * solo il JSON-LD pubblico cambia. */
export function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** EN 18223 §4.1.2.1 (Table 1, "dppStatus"): stessa divergenza e stessa scelta di
 * toStandardGranularity() sopra — allineato a OpenEPCIS DPP-Ready (minuscolo). Il nostro stato
 * interno (bozza/pubblicata) non è lo stesso concetto ma si mappa senza forzature: una scheda
 * pubblicata è "active" per chi la consulta, una bozza è "inactive". "archived"/"invalid" non
 * hanno un equivalente nel nostro modello a due stati, quindi non compaiono mai qui. */
export function toStandardDppStatus(status: DppStatus): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}
