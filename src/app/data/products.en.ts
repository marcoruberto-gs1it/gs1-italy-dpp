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
  '80425311': { name: "Mandorle Tostate e Salate", description: "Esselunga product." },
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
  '8002330112967': { name: "Ditaloni", description: "Esselunga product." },
  '8002330091897': { name: "Lenticchie Verdi", description: "Esselunga — 500 g pack." },
  '8003170093157': { name: "Crema 100% Arachidi", description: "100% peanut spread, Conad.", food: {"allergens":"May contain: peanuts."} },
  '8003170007918': { name: "Corn Flakes Classici", description: "Conad — 375 g pack." },
  '8003170059429': { name: "Frollini al Farro con Gocce di Cioccolato", description: "Conad — 10 x 33 g pack." },
  '8003100800008': { name: "Tè Classico", description: "Classic loose-leaf black tea, Selex." },
  '8003100801913': { name: "Tonno al Naturale", description: "Selex — 2x160g pack.", food: {"allergens":"May contain: fish."} },
  '8001120835888': { name: "Pizza al Kamut Bio", description: "Coop Vivi Verde — 340g pack.", food: {"allergens":"May contain: gluten, milk."} },
  '8001120891433': { name: "Taralli", description: "Coop Fiorfiore — 420 g pack.", food: {"allergens":"May contain: gluten."} },
};

export const STRING_TRANSLATIONS_EN: Record<string, string> = {};
