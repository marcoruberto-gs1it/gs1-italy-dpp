import { GS1encoder } from 'gs1encoder';
import { GranularityLevel } from '../services/registry-api.service';

/**
 * Analisi di un URI GS1 Digital Link tramite il GS1 Barcode Syntax Engine ("BSR" — Barcode
 * Syntax Resource, la stessa libreria/dataset ufficiale GS1 usata da Verified by GS1 e dagli
 * altri tool GS1: qui il pacchetto npm `gs1encoder`, un binding Wasm della libreria C reale, non
 * un parser scritto a mano). L'utente incolla un URI completo (es.
 * https://id.gs1.org/01/09521234543213/10/LOTTOAB1) — GTIN e granularità si deducono dagli AI
 * qualificatori presenti, non si chiedono più separatamente: (21) → ITEM, (10) → BATCH, nessuno
 * dei due → MODEL. Un Digital Link valido non può avere entrambi, quindi la deduzione è univoca.
 */

let encoderPromise: Promise<GS1encoder> | null = null;

/** Un solo GS1encoder condiviso per tutta la sessione admin (l'inizializzazione carica un
 * modulo Wasm — non è gratis ripeterla a ogni tasto premuto). Mai `free()`-ato: vive quanto la
 * pagina, come un qualunque altro servizio singleton di Angular. */
function getEncoder(): Promise<GS1encoder> {
  encoderPromise ??= GS1encoder.create();
  return encoderPromise;
}

export interface ParsedDigitalLink {
  gtin: string;
  granularityLevel: GranularityLevel;
  /** Stessa convenzione già in uso nel resto del form: stringa vuota per MODEL, altrimenti
   * "(10) valore" o "(21) valore". */
  batchOrSerial: string;
}

/** Solo per messaggi d'errore leggibili — non è un elenco completo delle migliaia di AI GS1,
 * giusto le più rilevanti per capire cosa contiene un link che non è un errore di sintassi ma
 * un tipo di prodotto non pertinente a una scheda DPP di questo sito (es. un buono sconto). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Estrae GTIN e granularità da un URI GS1 Digital Link. Lancia un errore con un messaggio
 * pensato per essere mostrato direttamente all'utente (stesso stile dei messaggi di
 * gs1-validators.ts) se l'URI non è sintatticamente valido o non contiene un GTIN (AI 01). */
export async function parseDigitalLink(uri: string): Promise<ParsedDigitalLink> {
  const value = uri.trim();
  if (!isHttpUrl(value)) {
    throw new Error("Deve essere un URI GS1 Digital Link completo, che inizia con http:// o https:// (es. https://id.gs1.org/01/09521234543213).");
  }

  const encoder = await getEncoder();
  let hri: string[];
  try {
    encoder.dataStr = value;
    hri = encoder.hri;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Non è un GS1 Digital Link valido: ${detail}`);
  }

  const ais = new Map<string, string>();
  for (const line of hri) {
    const match = /^\((\d{2,4})\)\s*(.*)$/.exec(line.trim());
    if (match) ais.set(match[1], match[2]);
  }

  const gtin = ais.get('01');
  if (!gtin) {
    throw new Error('Il link deve identificare un prodotto tramite GTIN (AI (01)) — questo non ne contiene uno.');
  }

  const serial = ais.get('21');
  if (serial) {
    return { gtin, granularityLevel: 'ITEM', batchOrSerial: `(21) ${serial}` };
  }
  const batch = ais.get('10');
  if (batch) {
    return { gtin, granularityLevel: 'BATCH', batchOrSerial: `(10) ${batch}` };
  }
  return { gtin, granularityLevel: 'MODEL', batchOrSerial: '' };
}

/** Ricostruisce l'URI GS1 Digital Link a partire da GTIN + granularità + lotto/seriale già noti
 * — stessa logica di Admin.previewUpi(), qui utilizzabile anche fuori dal form: per precompilare
 * il campo `upi` con i dati demo di un settore ("Usa demo") o con quelli di un DPP già salvato
 * (Admin.startEdit()), nei due casi in cui si parte da campi già scomposti invece che da un URI
 * da analizzare. */
export function buildDigitalLinkUpi(origin: string, gtin: string, granularityLevel: GranularityLevel, batchOrSerial: string): string {
  const base = `${origin}/01/${gtin}`;
  if (granularityLevel === 'MODEL' || !batchOrSerial) return base;
  const value = batchOrSerial.replace(/^\(\d{2}\)\s*/, '').trim();
  if (!value) return base;
  const ai = granularityLevel === 'ITEM' ? '21' : '10';
  return `${base}/${ai}/${encodeURIComponent(value)}`;
}
