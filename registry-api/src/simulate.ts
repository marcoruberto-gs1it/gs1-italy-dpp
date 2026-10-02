import type { DppEvent, DppRecord } from './db.ts';
import { classifyAttribute } from './linkTypes.ts';

/**
 * Simulazione di una modifica nel tempo di un DPP già pubblicato: ogni scenario descrive UNA
 * variazione plausibile (riparazione, aggiornamento del contenuto riciclato, ricalcolo
 * dell'impronta di carbonio, rinnovo di una certificazione, aggiornamento software, fine vita)
 * come una patch sugli attributi. Nulla di casuale: a parità di scheda e di "mesi dopo" il
 * risultato è lo stesso, così la demo è ripetibile.
 *
 * Il registro UE conserva solo i puntatori (UPI, liveURL…): una modifica del CONTENUTO non richiede
 * nessuna chiamata al registro — cambia il DPP, non il suo puntatore (FprEN 18222). Cambia invece
 * `lastUpdate` del JSON-LD e, se compare una nuova sezione, il linkset del resolver.
 */
export const SCENARIOS = ['repair', 'recycled-content', 'carbon-recalc', 'certificate-renewal', 'software-update', 'end-of-life', 'custom'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface PlannedChange {
  title: string;
  summary: string;
  /** categoria → chiave → nuovo valore (null = rimuovi la chiave), semantica JSON Merge Patch
   * (RFC 7396) applicata a un livello in più rispetto a prima — gli attributi sono ora nidificati
   * per DataElementCollection (vedi db.ts#DppRecord.attributes), quindi anche la patch deve
   * esserlo per restare una merge patch valida contro quella forma: una patch piatta applicata a
   * un documento nidificato, per RFC 7396, creerebbe una chiave piatta sorella invece di
   * aggiornare quella nidificata. */
  patch: Record<string, Record<string, string | null>>;
}

export function isScenario(value: unknown): value is Scenario {
  return typeof value === 'string' && (SCENARIOS as readonly string[]).includes(value);
}

const num = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const n = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number, like: string): string => {
  const decimals = /[.,](\d+)/.exec(like)?.[1].length ?? 0;
  const text = n.toFixed(decimals);
  return like.includes(',') ? text.replace('.', ',') : text;
};

const it = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

const findKey = (attrs: Record<string, string>, re: RegExp) => Object.keys(attrs).find((k) => re.test(k));

/** Appiattisce gli attributi nidificati per categoria in un'unica mappa chiave → valore,
 * ricordando a quale categoria apparteneva ciascuna chiave: permette a buildFlatChange() qui
 * sotto (ricerca per regex, calcoli su un valore esistente) di restare identica a prima di
 * questa nidificazione, quando gli attributi erano un'unica mappa piatta — solo l'involucro
 * attorno cambia (vedi planChange/applyPatch più sotto). */
function flattenAttributes(attrs: Record<string, Record<string, string>>): { flat: Record<string, string>; categoryOf: Record<string, string> } {
  const flat: Record<string, string> = {};
  const categoryOf: Record<string, string> = {};
  for (const [category, fields] of Object.entries(attrs)) {
    for (const [key, value] of Object.entries(fields ?? {})) {
      flat[key] = value;
      categoryOf[key] = category;
    }
  }
  return { flat, categoryOf };
}

/** Rinidifica una patch piatta (chiave → nuovo valore) usando la categoria già nota di ogni
 * chiave (vedi flattenAttributes sopra) — per una chiave che non esisteva ancora nel record (es.
 * "ultima riparazione — intervento", introdotta dallo scenario 'repair' come sorella di
 * "riparazioni effettuate"), la categoria si deduce con la stessa euristica usata per un
 * attributo nuovo ovunque in questo progetto (vedi linkTypes.ts#classifyAttribute). */
function nestPatch(flatPatch: Record<string, string | null>, categoryOf: Record<string, string>): Record<string, Record<string, string | null>> {
  const nested: Record<string, Record<string, string | null>> = {};
  for (const [key, value] of Object.entries(flatPatch)) {
    const category = categoryOf[key] ?? classifyAttribute(key);
    (nested[category] ??= {})[key] = value;
  }
  return nested;
}

function buildFlatChange(scenario: Scenario, a: Record<string, string>, when: string, custom?: Record<string, string | null>): { title: string; summary: string; patch: Record<string, string | null> } {
  switch (scenario) {
    case 'repair': {
      const n = num(a['riparazioni effettuate']) ?? 0;
      return {
        title: 'Riparazione registrata',
        summary: `Intervento di riparazione del ${when}: sostituzione di un componente usurato.`,
        patch: { 'riparazioni effettuate': String(n + 1), 'ultima riparazione': when, 'ultima riparazione — intervento': 'Sostituzione di un componente usurato' },
      };
    }
    case 'recycled-content': {
      const key = findKey(a, /riciclat.*\(%\)/i) ?? 'contenuto riciclato totale (%)';
      const current = num(a[key]) ?? 10;
      const next = Math.min(100, current + 6);
      return {
        title: 'Aggiornato il contenuto riciclato',
        summary: `Nuova formulazione del ${when}: ${key.replace(/\s*\(%\)/, '')} sale da ${fmt(current, a[key] ?? '0')}% a ${fmt(next, a[key] ?? '0')}%.`,
        patch: { [key]: fmt(next, a[key] ?? '0') },
      };
    }
    case 'carbon-recalc': {
      const key = findKey(a, /carbon|co₂|co2/i) ?? 'impronta di carbonio (kg CO₂e)';
      const current = num(a[key]) ?? 100;
      const next = current * 0.94;
      return {
        title: 'Ricalcolata l\'impronta di carbonio',
        summary: `Ricalcolo del ${when} con un mix energetico più pulito: ${key} da ${a[key] ?? fmt(current, '0.0')} a ${fmt(next, a[key] ?? '0.0')} (−6%).`,
        patch: { [key]: fmt(next, a[key] ?? '0.0') },
      };
    }
    case 'certificate-renewal':
      return {
        title: 'Certificazione rinnovata',
        summary: `Rinnovo della certificazione del prodotto in data ${when}.`,
        patch: { 'certificazione — ultimo rinnovo': when },
      };
    case 'software-update': {
      const current = a['versione software'] ?? 'v1.0';
      const minor = Number.parseInt(/\.(\d+)$/.exec(current)?.[1] ?? '0', 10) + 1;
      const next = current.replace(/\.\d+$/, '') + '.' + minor;
      return {
        title: 'Aggiornamento software',
        summary: `Aggiornamento del ${when}: versione software da ${current} a ${next}.`,
        patch: { 'versione software': next.startsWith('v') ? next : `v${next}` },
      };
    }
    case 'end-of-life':
      return {
        title: 'Fine vita: avviato al riciclo',
        summary: `Il prodotto è stato ritirato e avviato al riciclo in data ${when}.`,
        patch: { 'stato del ciclo di vita': 'Fine vita — avviato al riciclo', 'fine vita — data': when },
      };
    case 'custom':
      return { title: 'Modifica manuale', summary: `Modifica degli attributi del ${when} (patch personalizzata).`, patch: custom ?? {} };
  }
}

/** Pianifica UNA modifica nel tempo per uno scenario — vedi buildFlatChange() sopra per la logica
 * di ciascuno scenario (identica a prima di questa nidificazione, qui solo appiattita in
 * ingresso e rinidificata in uscita tramite flattenAttributes()/nestPatch() sopra). */
export function planChange(scenario: Scenario, record: DppRecord, at: Date, custom?: Record<string, string | null>): PlannedChange {
  const { flat, categoryOf } = flattenAttributes(record.attributes);
  const when = it(at);
  const built = buildFlatChange(scenario, flat, when, custom);
  return { title: built.title, summary: built.summary, patch: nestPatch(built.patch, categoryOf) };
}

/** Applica una merge patch nidificata (categoria → chiave → nuovo valore, null = rimuovi) agli
 * attributi e restituisce cosa è cambiato davvero — semantica JSON Merge Patch (RFC 7396) estesa
 * di un livello: la categoria stessa segue la stessa regola della singola chiave (null = rimuove
 * l'intera collezione), ogni chiave al suo interno si fonde con quelle già presenti nella stessa
 * collezione. `changes` resta indicizzato per nome di campo semplice (non "categoria.chiave"):
 * è un registro leggibile da un umano (vedi PublishJourneyComponent), non una seconda
 * rappresentazione della struttura dati. */
export function applyPatch(
  attributes: Record<string, Record<string, string>>,
  patch: Record<string, Record<string, string | null>>
): { next: Record<string, Record<string, string>>; changes: DppEvent['changes'] } {
  const next: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(attributes).map(([category, fields]) => [category, { ...fields }]));
  const changes: DppEvent['changes'] = {};
  for (const [category, fields] of Object.entries(patch)) {
    const existing = attributes[category] ?? {};
    const nextFields = (next[category] ??= {});
    for (const [key, value] of Object.entries(fields)) {
      const before = key in existing ? existing[key] : null;
      const after = value;
      if (before === after) continue;
      if (after === null) delete nextFields[key];
      else nextFields[key] = after;
      changes[key] = { before, after };
    }
    if (Object.keys(nextFields).length === 0) delete next[category];
  }
  return { next, changes };
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
