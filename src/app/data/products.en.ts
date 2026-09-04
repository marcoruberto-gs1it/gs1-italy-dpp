// Overlay inglese generato da import-off-products.js — solo i campi che Open Food Facts
// pubblica in inglese (nome, descrizione). Gli altri campi (ingredienti, allergeni) restano
// solo in italiano: OFF non sempre li pubblica in entrambe le lingue per questi prodotti, e un
// dato mancante non va inventato.

export interface ProductTranslationEn {
  name: string;
  description: string;
  food?: { ingredients?: string; allergens?: string };
  apparel?: { material?: string; color?: string; careInstructions?: string };
  logistics?: { storage?: string };
  environmentalImpact?: Record<string, string>;
}

// Nessuna voce: i nuovi 11 prodotti vengono dalle schede ufficiali GS1 Immagino, disponibili
// solo in italiano. Senza un testo inglese verificato alla fonte, l'interfaccia mostra
// l'italiano anche in modalità EN — coerente con "un dato mancante non va inventato".
export const PRODUCT_TRANSLATIONS_EN: Record<string, ProductTranslationEn> = {};

export const STRING_TRANSLATIONS_EN: Record<string, string> = {};
