import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validatori per i campi identificativi di una scheda DPP, basati sugli algoritmi reali degli
 * standard GS1/GTIN (GS1 General Specifications) e sui vincoli di formato di mock-eu-registry
 * (vedi registry-api/src/mockRegistryClient.ts) — non semplici controlli di lunghezza.
 */

const GTIN_LENGTHS = [8, 12, 13, 14];

/** Cifra di controllo GS1: dal digit più a destra (escluso quello di controllo) si moltiplica
 * alternando ×3/×1, si somma, e si sottrae da 10 (modulo 10) — l'algoritmo usato da ogni GTIN,
 * EAN e UPC reale. */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  const reversed = digitsWithoutCheck.split('').reverse();
  const sum = reversed.reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(gtin: string): boolean {
  if (!GTIN_LENGTHS.includes(gtin.length) || !/^\d+$/.test(gtin)) return false;
  return gtinCheckDigit(gtin.slice(0, -1)) === Number(gtin.slice(-1));
}

/** Validatore reattivo per l'UPI (GTIN): lunghezza GS1 valida (8/12/13/14 cifre) e cifra di
 * controllo corretta. In caso di errore include un suggerimento concreto — il GTIN con la
 * cifra di controllo giusta — invece di un semplice "non valido". */
export function gtinValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').trim();
    if (!value) return null; // required se serve, va aggiunto separatamente
    if (!/^\d+$/.test(value)) {
      return { gtinFormat: { message: 'Il GTIN contiene solo cifre, senza spazi o trattini.' } };
    }
    if (!GTIN_LENGTHS.includes(value.length)) {
      return { gtinLength: { message: 'Un GTIN valido ha 8, 12, 13 o 14 cifre — questo ne ha ' + value.length + '.' } };
    }
    if (!isValidGtin(value)) {
      const suggestion = value.slice(0, -1) + gtinCheckDigit(value.slice(0, -1));
      return {
        gtinCheckDigit: {
          message: `L'ultima cifra non torna con il resto del codice (cifra di controllo GS1). Forse intendevi ${suggestion}?`,
          suggestion,
        },
      };
    }
    return null;
  };
}

/** Stessa regola di batchOrSerialValidator qui sotto, come funzione pura (senza i messaggi di
 * dettaglio) — usata dal Wizard per decidere se "Avanti" è cliccabile, senza dover leggere
 * `control.valid` in un computed() (vedi la nota in dpp-wizard.ts sul perché). */
export function isValidBatchOrSerial(value: string): boolean {
  const content = (value ?? '').trim().replace(/^\(\d{2}\)\s*/, '');
  if (!content) return true;
  return content.length <= 20 && !/[|~^]/.test(content);
}

/** Lotto/seriale (AI (10)/(21) — GS1 General Specifications): fino a 20 caratteri alfanumerici,
 * niente caratteri che l'Element String GS1 non ammette (es. il separatore FNC1). Campo
 * opzionale: una stringa vuota è sempre valida. */
export function batchOrSerialValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').trim();
    if (!value) return null;
    // Consentiamo anche il prefisso "(10) "/"(21) " già usato nell'interfaccia — lo scartiamo
    // prima di validare il contenuto vero e proprio dell'Element String.
    const content = value.replace(/^\(\d{2}\)\s*/, '');
    if (content.length > 20) {
      return { batchLength: { message: 'Lotto/seriale può avere al massimo 20 caratteri (AI (10)/(21) GS1).' } };
    }
    if (/[|~^]/.test(content)) {
      // Non sono i separatori GS1 veri (quello è il carattere di controllo FNC1/GS, non
      // digitabile) — qui evitiamo solo caratteri che risulterebbero ambigui o codificati in modo
      // poco leggibile una volta percent-encoded nell'URI GS1 Digital Link (RFC 3986).
      return { batchChars: { message: 'Evita i caratteri | ~ ^: renderebbero l’URI del prodotto poco leggibile.' } };
    }
    return null;
  };
}
