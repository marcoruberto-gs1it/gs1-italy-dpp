// Nessuno sfondo pieno: l'icona resta trasparente per adattarsi sia al tema chiaro che scuro.
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <path d="M35 46l25-13 25 13v28l-25 13-25-13z" fill="none" stroke="#B1B3B3" stroke-width="3" stroke-linejoin="round"/>
  <path d="M35 46l25 13 25-13M60 59v28" fill="none" stroke="#B1B3B3" stroke-width="3" stroke-linejoin="round"/>
</svg>`)}`;

export const PRODUCT_PLACEHOLDER_IMAGE = PLACEHOLDER;

/** Sostituisce un'immagine prodotto non caricabile con un placeholder neutro, senza inventare contenuti. */
export function onImageError(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src === PLACEHOLDER) return;
  img.src = PLACEHOLDER;
  img.classList.add('img-fallback');
}
