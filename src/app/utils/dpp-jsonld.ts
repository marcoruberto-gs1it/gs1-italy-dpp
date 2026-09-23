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

/** "<norma>:v<major>.<minor>" (EN 18223 §4.1.2.1, Table 1, campo "dppSchemaVersion") — non
 * l'anno della norma: quello identifica QUALE versione di EN 18223 si applica (2026), questo
 * identifica la versione DELLO SCHEMA JSON qui prodotto. */
export const DPP_SCHEMA_VERSION = 'EN18223:v1.0';

/** EN 18223 §4.1.2.1 (Table 1, "granularity") elenca l'enumerazione con l'iniziale maiuscola —
 * "Model", "Batch", "Item" — non tutto minuscolo: il nostro database usa MAIUSCOLO per motivi
 * interni (è anche il valore richiesto dallo schema di mock-eu-registry, verificato dal vivo),
 * ma il JSON-LD pubblico, per dichiararsi davvero conforme allo standard, deve usare
 * l'enumerazione esatta del testo normativo. */
export function toStandardGranularity(level: GranularityLevel): 'Model' | 'Batch' | 'Item' {
  const map: Record<GranularityLevel, 'Model' | 'Batch' | 'Item'> = { MODEL: 'Model', BATCH: 'Batch', ITEM: 'Item' };
  return map[level];
}

/** EN 18223 §4.1.2.1 (Table 1, "dppStatus") elenca l'enumerazione "Active, Inactive, Archived,
 * Invalid" — iniziale maiuscola. Il nostro stato interno (bozza/pubblicata) non è lo stesso
 * concetto ma si mappa senza forzature: una scheda pubblicata è "Active" per chi la consulta,
 * una bozza è "Inactive". "Archived"/"Invalid" non hanno un equivalente nel nostro modello a
 * due stati, quindi non compaiono mai qui. */
export function toStandardDppStatus(status: DppStatus): 'Active' | 'Inactive' {
  return status === 'published' ? 'Active' : 'Inactive';
}
