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

/** FprEN 18223:2026 §4.1.2.1 Table 1, campo "dppSchemaVersion" — formato
 * "<norma>:v<major>.<minor>", l'unico che il testo ufficiale usa nei propri esempi (§5.2.4:
 * "ENXXX:v1.0"; Annex B: "prEN18223:v1.0") — non "FprEN 18223:2026" (norma + anno), che era stato
 * un allineamento a openepcis/openepcis-dpp-ready fatto prima di avere il testo ufficiale in
 * mano. Stesso valore di registry-api/src/jsonld.ts. */
export const DPP_SCHEMA_VERSION = 'EN18223:v1.0';

/** FprEN 18223:2026 §4.1.2.2 (Enumeration): "The values allowed for the 'granularity' attribute
 * are: model, batch, item" — minuscolo, testo normativo. Gli esempi JSON/XML dello stesso
 * documento (§5.2.4, Annex B) scrivono "Model" (maiuscolo), ma §4.1.1 risolve le discrepanze tra
 * tabelle/testo ed esempi a favore delle tabelle ("the prose text of Clause 4, including the
 * tables, is authoritative"): minuscolo è la forma corretta. Il nostro database interno resta
 * MAIUSCOLO (è il valore richiesto dallo schema di mock-eu-registry, verificato dal vivo): solo
 * il JSON-LD pubblico usa l'enumerazione dello standard. */
export function toStandardGranularity(level: GranularityLevel): 'model' | 'batch' | 'item' {
  const map: Record<GranularityLevel, 'model' | 'batch' | 'item'> = { MODEL: 'model', BATCH: 'batch', ITEM: 'item' };
  return map[level];
}

/** FprEN 18223:2026 Table 1 (attributo "dppStatus"): "EXAMPLE Example values ... are: active,
 * inactive, archived, invalid" — minuscolo, dentro la tabella normativa stessa. Stessa
 * autorevolezza di toStandardGranularity() sopra. Il nostro stato interno (bozza/pubblicata) non
 * è lo stesso concetto ma si mappa senza forzature: una scheda pubblicata è "active", una bozza
 * è "inactive". "archived"/"invalid" non hanno un equivalente nel nostro modello a due stati,
 * quindi non compaiono mai qui. */
export function toStandardDppStatus(status: DppStatus): 'active' | 'inactive' {
  return status === 'published' ? 'active' : 'inactive';
}
