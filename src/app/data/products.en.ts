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

export const PRODUCT_TRANSLATIONS_EN: Record<string, ProductTranslationEn> = {
  '08076809519960': { name: "Casarecce n. 87", description: "Barilla — 500 g pack.", food: {"allergens":"Contains: gluten. May contain traces of: soybeans, mustard."} },
  '08076809512114': { name: "Fette Biscottate Integrali", description: "Mulino Bianco — 630 g pack.", food: {"allergens":"Contains: gluten. May contain traces of: tree nuts, milk, mustard, sesame seeds, soybeans, eggs."} },
  '03017620422003': { name: "Nutella", description: "Ferrero — 400 g jar.", food: {"allergens":"Contains: tree nuts, milk, soybeans. Gluten free."} },
  '08000500037560': { name: "Kinder Bueno", description: "Kinder — 43g pack.", food: {"allergens":"Contains: gluten, tree nuts, milk, soybeans."} },
  '07622210625243': { name: "Oreo Golden", description: "Oreo — 220 g pack.", food: {"allergens":"Contains: gluten, soybeans. May contain traces of: milk."} },
  '08002330091897': { name: "Lenticchie Verdi", description: "Esselunga — 500 g pack." },
  '08003170093157': { name: "Crema 100% Arachidi", description: "Conad — 350 g jar.", food: {"allergens":"Contains: peanuts. May contain traces of: tree nuts."} },
  '08003100801913': { name: "Tonno al Naturale", description: "Selex — 2x160g pack.", food: {"allergens":"Contains: fish."} },
  '08001120835888': { name: "Pizza Margherita al Kamut Bio", description: "Coop Vivi Verde — 340g pack.", food: {"allergens":"Contains: gluten, milk. May contain traces of: mustard, soybeans."} },
  '08001590640258': { name: "Philadelphia Originale", description: "Philadelphia — 250 g pack.", food: {"allergens":"Contains: milk. Gluten free."} },
};

export const STRING_TRANSLATIONS_EN: Record<string, string> = {};
