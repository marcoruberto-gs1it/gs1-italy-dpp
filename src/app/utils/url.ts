/**
 * Antepone https:// a un sito scritto senza protocollo nella scheda originale (es.
 * "www.esempio.it"). Se il campo contiene più URL separati da " / " (caso di alcune schede
 * Immagino, es. "www.ferrero.it / www.estathe.it"), restituisce l'ultimo — il più specifico,
 * quello del prodotto/brand invece del sito corporate generico.
 */
export function normalizeUrl(website: string): string {
  const last = website.includes(' / ') ? website.split(' / ').pop()!.trim() : website.trim();
  return /^https?:\/\//i.test(last) ? last : `https://${last}`;
}
