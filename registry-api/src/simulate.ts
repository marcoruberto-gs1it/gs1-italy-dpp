import type { DppEvent, DppRecord } from './db.ts';

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
  /** chiave → nuovo valore (null = rimuovi la chiave), semantica JSON Merge Patch (RFC 7396). */
  patch: Record<string, string | null>;
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

export function planChange(scenario: Scenario, record: DppRecord, at: Date, custom?: Record<string, string | null>): PlannedChange {
  const a = record.attributes;
  const when = it(at);
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

/** Applica una merge patch agli attributi e restituisce cosa è cambiato davvero. */
export function applyPatch(attributes: Record<string, string>, patch: Record<string, string | null>): { next: Record<string, string>; changes: DppEvent['changes'] } {
  const next = { ...attributes };
  const changes: DppEvent['changes'] = {};
  for (const [key, value] of Object.entries(patch)) {
    const before = key in attributes ? attributes[key] : null;
    const after = value;
    if (before === after) continue;
    if (after === null) delete next[key];
    else next[key] = after;
    changes[key] = { before, after };
  }
  return { next, changes };
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
