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
  '8076809519960': { name: "Casarecce n. 87", description: "Barilla — 500 g pack.", food: {"allergens":"May contain: gluten."} },
  '8076809512114': { name: "Fette Biscottate Integrali", description: "Mulino Bianco — 630 g pack.", food: {"allergens":"May contain: gluten."} },
  '3017620422003': { name: "Nutella", description: "Hazelnut And Cocoa Spread", food: {"allergens":"May contain: milk, tree nuts, soybeans."} },
  '8000500037560': { name: "Kinder Bueno", description: "Kinder — 43g pack.", food: {"allergens":"May contain: gluten, milk, tree nuts, soybeans."} },
  '7622210625243': { name: "Oreo Golden", description: "Vanilla flavour biscuits.", food: {"allergens":"May contain: gluten, soybeans."} },
  '7622201125813': { name: "Milka with Almonds", description: "Milka — 300g pack.", food: {"allergens":"May contain: milk, tree nuts."} },
  '8002330091897': { name: "Lenticchie Verdi", description: "Esselunga — 500 g pack." },
  '8003170093157': { name: "Crema 100% Arachidi", description: "100% peanut spread, Conad.", food: {"allergens":"May contain: peanuts."} },
  '8003100801913': { name: "Tonno al Naturale", description: "Selex — 2x160g pack.", food: {"allergens":"May contain: fish."} },
  '8001120835888': { name: "Pizza al Kamut Bio", description: "Coop Vivi Verde — 340g pack.", food: {"allergens":"May contain: gluten, milk."} },
};

export const STRING_TRANSLATIONS_EN: Record<string, string> = {};
