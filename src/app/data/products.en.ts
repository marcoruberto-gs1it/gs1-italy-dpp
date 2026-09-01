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
  '80052432': { name: "Kinder Brioss", description: "Kinder — 28 g pack." },
  '8076809519960': { name: "Casarecce n. 87", description: "Barilla — 500 g pack.", food: {"allergens":"May contain: gluten."} },
  '8076809523714': { name: "Tagliatelle", description: "Barilla — 500 g pack.", food: {"allergens":"May contain: gluten."} },
  '8076809501415': { name: "Mezze Penne Tricolore", description: "Barilla — 500 g pack.", food: {"allergens":"May contain: gluten."} },
  '8076809513388': { name: "Sugo all'Arrabbiata", description: "Barilla — 400 g pack." },
  '8076809502443': { name: "Pangri", description: "Breadsticks with sunflower oil.", food: {"allergens":"May contain: gluten."} },
  '8076809512114': { name: "Fette Biscottate Integrali", description: "Mulino Bianco — 630 g pack.", food: {"allergens":"May contain: gluten."} },
  '3017620422003': { name: "Nutella", description: "Hazelnut And Cocoa Spread", food: {"allergens":"May contain: milk, tree nuts, soybeans."} },
  '8000500009673': { name: "Ferrero Rocher", description: "Ferrero — 300 g pack.", food: {"allergens":"May contain: gluten, milk, tree nuts, soybeans."} },
  '4008400203829': { name: "Kinder Cioccolato", description: "Kinder Chocolate", food: {"allergens":"May contain: milk, soybeans."} },
  '8000500037560': { name: "Kinder Bueno", description: "Kinder — 43g pack.", food: {"allergens":"May contain: gluten, milk, tree nuts, soybeans."} },
  '7622210625243': { name: "Oreo Golden", description: "Vanilla flavour biscuits.", food: {"allergens":"May contain: gluten, soybeans."} },
  '7622201125813': { name: "Milka with Almonds", description: "Milka — 300g pack.", food: {"allergens":"May contain: milk, tree nuts."} },
  '7622400001215': { name: "Philadelphia Original", description: "Philadelphia — 500g pack." },
  '5000168002286': { name: "TUC Original", description: "TUC — 150 g pack.", food: {"allergens":"May contain: eggs, gluten."} },
};

export const STRING_TRANSLATIONS_EN: Record<string, string> = {};
