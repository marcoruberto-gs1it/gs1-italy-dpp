import { DppStatus, GranularityLevel } from '../services/registry-api.service';

/**
 * Valori condivisi tra le due costruzioni JSON-LD lato Angular (Admin.previewJsonLd,
 * Product.dppJsonLdJson) — stesso contratto di registry-api/src/jsonld.ts, duplicato lì per la
 * separazione tra i due servizi (vedi il commento lì), ma qui riunito in un solo posto perché
 * admin.ts e product.ts sono nello stesso progetto Angular: nessun motivo di duplicarlo due
 * volte anche qui.
 */

/** Identificativi demo dell'operatore economico e dello stabilimento, come URI GS1 Digital Link
 * con GLN (AI (417) per l'operatore, AI (414) per lo stabilimento) — stessi valori inviati come
 * "reoId"/"facilitiesId" al DPP Registry UE (vedi mockRegistryClient.ts): non abbiamo ancora un
 * modello multi-tenant reale. I due GLN qui sotto sono quelli d'esempio GS1 (prefisso 952,
 * riservato a scopo dimostrativo), con cifra di controllo valida. */
export const DEMO_ECONOMIC_OPERATOR_ID = 'https://id.gs1.org/417/9521234000006';
export const DEMO_FACILITY_ID = 'https://id.gs1.org/414/9521234000112';

/** Formato "<norma>:v<major>.<minor>" per la versione dello schema JSON-LD implementato — vedi
 * lo stesso valore in registry-api/src/jsonld.ts. */
export const DPP_SCHEMA_VERSION = 'EN18223:v1.0';

/** Enumerazione minuscola per il livello di granularità del passaporto. Il nostro database
 * interno resta MAIUSCOLO (è il valore richiesto dallo schema di mock-eu-registry, verificato dal
 * vivo): solo il JSON-LD pubblico usa questa forma. */
export function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** Enumerazione minuscola per lo stato operativo del passaporto. Il nostro stato interno
 * (bozza/pubblicata) non è lo stesso concetto ma si mappa senza forzature: una scheda pubblicata
 * è "active", una bozza è "inactive" — "archived"/"invalid" non hanno un equivalente nel nostro
 * modello a due stati, quindi non compaiono mai qui. */
export function toStandardDppStatus(status: DppStatus): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}
