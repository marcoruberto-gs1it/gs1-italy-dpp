/**
 * Overlay di traduzioni inglesi per products.json, applicato in product.service.ts sopra ai
 * dati italiani (che restano la lingua "base" del dataset). Solo i campi di testo libero
 * rivolti all'utente sono tradotti; codici, unità di misura, nomi propri di aziende/enti e
 * indirizzi restano invariati in entrambe le lingue.
 */

export interface ProductTranslationEn {
  name?: string;
  description?: string;
  food?: { ingredients?: string; allergens?: string };
  apparel?: { material?: string; color?: string; careInstructions?: string };
  logistics?: { storage?: string };
  environmentalImpact?: {
    co2e?: string;
    waterConsumption?: string;
    energyConsumption?: string;
    chemicalConsumption?: string;
    recycledContent?: string;
    sustainabilityCertifiedContent?: string;
  };
}

export const PRODUCT_TRANSLATIONS_EN: Record<string, ProductTranslationEn> = {
  '08032089000017': {
    name: 'GS1 Italy Sapori Strawberry Jam Light',
    description:
      'Our Light jams are made from the finest fruit and simple recipes, just like homemade. Zero sweeteners and 50% less sugar to bring out the authentic taste of the fruit.',
    food: {
      ingredients: 'Strawberries, water, sugar, gelling agent: fruit pectin. Fruit used: 70g per 100g of finished product.',
      allergens: 'May contain: celery, fish, milk, molluscs, soy, tree nuts.',
    },
    logistics: { storage: 'Store in the refrigerator after opening and consume within 7 days.' },
    environmentalImpact: {
      co2e: '0.8 kg CO₂e / kg product',
      waterConsumption: '12 L / kg product',
      recycledContent: '30% (recycled glass)',
      sustainabilityCertifiedContent: '70% traceable-supply-chain fruit',
    },
  },
  '08032089000024': {
    name: 'GS1 Italy Sapori Tortiglioni Gluten Free Pasta',
    description:
      'Gluten-free pasta specifically formulated for people intolerant to gluten, made with white corn, yellow corn and wholegrain rice. Al dente in 10 minutes.',
    food: {
      ingredients: 'White corn flour (60%), yellow corn flour (29.5%), wholegrain rice flour (10%), water, emulsifier: mono- and diglycerides of fatty acids.',
      allergens: 'Gluten free. Suitable for people with gluten intolerance.',
    },
    logistics: { storage: 'Store in a cool, dry place.' },
    environmentalImpact: {
      co2e: '1.1 kg CO₂e / kg product',
      waterConsumption: '850 L / kg product',
      recycledContent: '100% (FSC cardboard box)',
      sustainabilityCertifiedContent: '100% traceable-supply-chain corn and rice',
    },
  },
  '08032089000031': {
    description: 'The white t-shirt is made of soft, lightweight cotton jersey, ensuring comfort and a sporty look.',
    apparel: {
      material: '100% Organic Cotton',
      color: 'White',
      careInstructions: 'Machine wash at 30°C. Do not bleach. Iron at medium temperature.',
    },
    environmentalImpact: {
      co2e: '4.2 kg CO₂e / unit',
      waterConsumption: '2100 L / unit',
      energyConsumption: '3.6 kWh / unit',
      recycledContent: '0% (virgin organic cotton)',
      sustainabilityCertifiedContent: '100% GOTS-certified cotton',
    },
  },
  '08032089000048': {
    name: '100% Arabica Bar Selection Coffee Beans 1kg',
    description:
      'A 100% Arabica blend, slow-roasted for professional use in bars and restaurants. Full body and intense aroma.',
    food: {
      ingredients: '100% Arabica coffee.',
      allergens: 'May contain traces of tree nuts.',
    },
    logistics: { storage: 'Store in a cool, dry place, away from light.' },
    environmentalImpact: {
      co2e: '3.4 kg CO₂e / kg product',
      waterConsumption: '18,900 L / kg product',
      recycledContent: '0% (non-recyclable multilayer bag)',
    },
  },
  '08032089000055': {
    name: 'Professional Type 00 Soft Wheat Flour 25kg',
    description:
      'Stone-ground type 00 flour, W280 strength, ideal for pizzerias and professional bakeries with long leavening times.',
    food: {
      ingredients: 'Type 00 soft wheat flour.',
      allergens: 'Contains gluten. May contain traces of soy.',
    },
    logistics: { storage: 'Store in a cool, dry place.' },
    environmentalImpact: {
      co2e: '0.6 kg CO₂e / kg product',
      waterConsumption: '1850 L / kg product',
      recycledContent: '100% (paper sack)',
      sustainabilityCertifiedContent: '100% Italian soft wheat',
    },
  },
  '08032089000062': {
    name: 'Contactless Digital Infrared Thermometer',
    description:
      'Infrared thermometer for fast, contactless measurement of body temperature, with memory for the last 30 readings.',
    logistics: { storage: 'Store at room temperature, away from direct heat sources.' },
    environmentalImpact: {
      co2e: '2.8 kg CO₂e / unit',
      energyConsumption: '0.02 kWh / unit (batteries included)',
      recycledContent: '15% (recycled ABS plastic)',
    },
  },
  '08032089000079': {
    name: 'Type IIR Surgical Masks (50 pcs)',
    description: 'Disposable Type IIR three-ply surgical masks, splash-resistant, for medical and professional use.',
    environmentalImpact: {
      co2e: '0.9 kg CO₂e / pack',
      chemicalConsumption: '0.05 kg / pack (polypropylene)',
      recycledContent: '0% (single-use medical device)',
    },
  },
  '08032089000086': {
    name: 'Fresh Adriatic Sea Bass Fillet',
    description: 'Fresh sea bass fillets, caught in the Adriatic and processed the same day. Variable weight.',
    food: { ingredients: 'Sea bass (Dicentrarchus labrax).', allergens: 'Fish.' },
    logistics: { storage: 'Store between 0°C and 4°C. Consume within 2 days of purchase.' },
    environmentalImpact: {
      co2e: '2.1 kg CO₂e / kg product',
      waterConsumption: '450 L / kg product',
      recycledContent: '80% (cellulose pulp tray)',
    },
  },
  '08032089000093': {
    name: 'Ready-to-Eat Mixed Salad, Washed and Prepared',
    description: 'Blend of washed, ready-to-eat baby leaf salads, grown in Italy and packed in protective atmosphere.',
    food: { ingredients: 'Lettuce, rocket, radicchio, baby spinach.', allergens: 'No allergens declared.' },
    environmentalImpact: {
      co2e: '0.4 kg CO₂e / kg product',
      waterConsumption: '250 L / kg product',
      recycledContent: '50% (recycled PET tray)',
    },
  },
  '08032089000109': {
    name: 'Portland Cement CEM II 42.5R 25kg Bag',
    description: 'High early-strength Portland cement, suitable for structural concrete and fast-track works.',
    logistics: { storage: 'Store in a dry place, raised off the ground on a pallet.' },
    environmentalImpact: {
      co2e: '820 kg CO₂e / t product',
      energyConsumption: '110 kWh / t product',
      recycledContent: '12% (secondary materials in clinker)',
    },
  },
  '08032089000116': {
    name: 'Porcelain Stoneware Tile 60x60 cm',
    description: 'Rectified stone-effect porcelain stoneware, for high-traffic indoor and outdoor floors and walls.',
    logistics: { storage: 'Store pallets upright, protected from impact.' },
    environmentalImpact: {
      co2e: '9.5 kg CO₂e / m²',
      energyConsumption: '14 kWh / m²',
      waterConsumption: '6 L / m² (water-recovery production cycle)',
      recycledContent: '40% (recycled ceramic waste material)',
    },
  },
  '08032089000123': {
    name: 'Natural Oligomineral Water 1.5L',
    description: 'Natural oligomineral water, bottled at source, lightly sparkling.',
    food: { ingredients: 'Natural oligomineral water, carbon dioxide.' },
    logistics: { storage: 'Store away from direct sunlight.' },
    environmentalImpact: {
      co2e: '0.15 kg CO₂e / unit',
      waterConsumption: '1.6 L / unit (1.5 L bottled + process)',
      recycledContent: '50% (rPET)',
    },
  },
  '08032089000130': {
    name: 'Waterproof Casual Backpack 20L',
    description: 'Light, waterproof backpack with a padded laptop compartment, ideal for everyday use and short trips.',
    apparel: {
      material: '100% Recycled Polyester (RPET)',
      color: 'Charcoal Grey',
      careInstructions: 'Clean with a damp cloth. Do not machine wash.',
    },
    environmentalImpact: {
      co2e: '3.1 kg CO₂e / unit',
      recycledContent: '100% (RPET polyester from recycled bottles)',
      sustainabilityCertifiedContent: '100% GRS-certified RPET',
    },
  },
  '08032089000147': {
    name: 'Crispy Rosemary Chips 150g',
    description: 'Crispy chips cooked in high-oleic sunflower oil, flavoured with Italian rosemary.',
    food: {
      ingredients: 'Potatoes, high-oleic sunflower oil, rosemary, salt.',
      allergens: 'May contain traces of milk.',
    },
    logistics: { storage: 'Store in a cool, dry place, away from light.' },
    environmentalImpact: { co2e: '1.4 kg CO₂e / kg product', recycledContent: '30% (recycled PP film)' },
  },
  '08032089000154': {
    name: 'Lemon Iced Tea 500ml',
    description: 'Cold black tea with lemon juice, in a recyclable PET bottle.',
    food: {
      ingredients: 'Water, sugar, black tea (0.3%), lemon juice from concentrate (2%), acidity regulator: citric acid, natural flavourings.',
      allergens: 'No allergens declared.',
    },
    logistics: { storage: 'Keep cool, best served cold.' },
  },
  '08032089000161': {
    name: 'Eco Concentrated Laundry Detergent, 40 washes',
    description:
      'Concentrated liquid laundry detergent, certified eco-friendly formula, effective even at low temperatures.',
    environmentalImpact: {
      co2e: '0.9 kg CO₂e / wash',
      recycledContent: '50% (recycled PET bottle)',
      sustainabilityCertifiedContent: 'EU Ecolabel',
    },
  },
  '08032089000178': {
    name: 'Gentle Oat Shampoo 250ml',
    description: 'Gentle shampoo for frequent use with organic oat extract, silicone-free.',
  },
  '08032089000185': {
    name: 'Cocoa Shortbread Biscuits 350g',
    description: 'Cocoa shortbread biscuits, traditional recipe, ideal for breakfast.',
    food: {
      ingredients: 'Soft wheat flour, sugar, sunflower oil, cocoa (5%), corn starch, raising agent: sodium bicarbonate.',
      allergens: 'Contains gluten. May contain traces of milk, eggs, tree nuts.',
    },
    logistics: { storage: 'Store in a cool, dry place.' },
  },
  '08032089000192': {
    name: 'Craft IPA Beer 33cl',
    description: 'Unfiltered craft beer in IPA style, intense hopping with citrus notes, bottle-refermented.',
    food: {
      ingredients: 'Water, barley malt, hops, yeast.',
      allergens: 'Contains gluten (barley).',
    },
    logistics: { storage: 'Store away from light, recommended temperature 4-8°C.' },
  },
  '08032089000208': {
    name: 'Adult Dog Kibble, Chicken and Rice 3kg',
    description: 'Complete food for adult dogs based on fresh chicken and rice, no GMO cereals.',
  },
  '08032089000215': {
    name: 'Super Soft Toilet Paper, 12 rolls',
    description: '3-ply toilet paper, super soft and strong, pack of 12 rolls.',
  },
  '08032089000222': {
    name: 'Freeze-Dried Instant Coffee 200g',
    description: '100% Arabica freeze-dried instant coffee, intense flavour, dissolves instantly.',
    food: {
      ingredients: '100% Arabica freeze-dried instant coffee.',
      allergens: 'No allergens declared.',
    },
    logistics: { storage: 'Store in a cool, dry place, reseal well after use.' },
  },
  '08032089000239': {
    name: 'Professional Extra Virgin Olive Oil 5L',
    description: '100% Italian extra virgin olive oil, cold-pressed, 5-litre jerrycan for professional foodservice use.',
    food: { ingredients: '100% Italian extra virgin olive oil.', allergens: 'No allergens declared.' },
    logistics: { storage: 'Store away from light and heat.' },
  },
  '08032089000246': {
    name: 'Bag-in-Box Tomato Passata 10kg',
    description: '100% Italian tomato passata in a 10kg Bag-in-Box pack, ideal for restaurants and pizzerias.',
    food: { ingredients: '100% Italian tomato, salt.', allergens: 'No allergens declared.' },
    logistics: { storage: 'Store in a cool, dry place. After opening, refrigerate and consume within 5 days.' },
  },
  '08032089000253': {
    name: 'Espresso Coffee Pods for Bars, 150 pcs',
    description: 'Single-serve ESE pods for bar machines, 100% Arabica blend, professional pack of 150 pieces.',
    food: { ingredients: 'Ground 100% Arabica coffee.', allergens: 'No allergens declared.' },
    logistics: { storage: 'Store in a cool, dry place, away from moisture.' },
  },
  '08032089000260': {
    name: 'Professional Frozen French Fries 2.5kg',
    description: 'Pre-cut frozen fries, ready for the fryer, professional pack for foodservice.',
    food: {
      ingredients: 'Potatoes (95%), sunflower seed oil, potato starch.',
      allergens: 'No allergens declared.',
    },
    logistics: { storage: 'Store at -18°C. Do not refreeze once thawed.' },
  },
  '08032089000277': {
    name: 'Professional Kitchen Degreaser 5L',
    description: 'Professional degreasing cleaner for kitchen surfaces and equipment, high concentration.',
  },
  '08032089000284': {
    name: 'Professional Cola Syrup 5L',
    description: 'Concentrated cola-flavoured syrup for post-mix, professional format for bars and venues.',
  },
  '08032089000291': {
    name: 'PGI Balsamic Vinegar of Modena, 5L Jerrycan',
    description: 'PGI Balsamic Vinegar of Modena in a 5-litre jerrycan, professional format for foodservice.',
    food: {
      ingredients: 'Wine vinegar, cooked and/or concentrated grape must.',
      allergens: 'Contains sulphites.',
    },
    logistics: { storage: 'Store at room temperature, away from light.' },
  },
  '08032089000307': {
    name: 'Professional Type 0 Pizza Flour 25kg',
    description: 'Stone-ground type 0 flour, W300 strength, ideal for long-leavened Neapolitan pizza.',
    food: {
      ingredients: 'Type 0 soft wheat flour.',
      allergens: 'Contains gluten. May contain traces of soy.',
    },
    logistics: { storage: 'Store in a cool, dry place.' },
  },
  '08032089000314': {
    name: 'Assorted Waterproof Plasters, 40 pcs',
    description: 'Waterproof plasters in tear-resistant fabric, assorted sizes, water-resistant.',
  },
  '08032089000321': {
    name: 'Hand Sanitiser Gel 500ml',
    description: 'Alcohol-based (70%) hand sanitiser gel, bactericidal action, no rinse required.',
  },
  '08032089000338': {
    name: 'Digital Upper Arm Blood Pressure Monitor',
    description:
      'Automatic upper-arm blood pressure monitor with arrhythmia detection, memory for 2 users, clinically validated.',
  },
  '08032089000345': {
    name: 'Disposable Nitrile Gloves, Size M, 100 pcs',
    description: 'Powder-free, latex-free disposable nitrile gloves, size M, for medical and professional use.',
  },
  '08032089000352': {
    name: 'Fingertip Pulse Oximeter',
    description: 'Fingertip pulse oximeter for measuring blood oxygen saturation and heart rate, OLED display.',
  },
  '08032089000369': {
    name: 'Disposable Syringes 5ml, 100 pcs',
    description: 'Sterile disposable syringes with needle, 5ml, for professional medical use.',
  },
  '08032089000376': {
    name: 'Sterile Saline Solution, 20 Vials',
    description: 'Sterile 0.9% saline solution in single-dose 5ml vials, for medical use and nasal hygiene.',
  },
  '08032089000383': {
    name: 'Professional Forehead Infrared Thermometer',
    description:
      'Infrared forehead thermometer for professional use, 1-second reading, for clinics and healthcare facilities.',
  },
  '08032089000390': {
    name: 'Digital Body Analysis Bathroom Scale',
    description: 'Digital scale with body fat, muscle mass and hydration analysis, Bluetooth app connection.',
  },
  '08032089000406': {
    name: 'Organic Cotton Unisex Hoodie',
    description: 'Hoodie in certified organic cotton, unisex fit, front kangaroo pocket.',
    apparel: {
      material: '80% Organic Cotton',
      color: 'Grey Melange',
      careInstructions: 'Wash at 30°C. Do not bleach. Do not tumble dry.',
    },
  },
  '08032089000413': {
    name: 'Sustainable Denim Slim Fit Jeans',
    description: 'Slim fit jeans in denim made with low water-consumption processes, sustainably farmed cotton.',
    apparel: {
      material: '98% Sustainably Farmed Cotton',
      color: 'Dark Denim Blue',
      careInstructions: 'Wash at 30°C with similar colours. Do not bleach. Iron at low temperature.',
    },
  },
  '08032089000420': {
    name: 'Technical Sports Socks, Pack of 3',
    description: 'Breathable sports socks with anti-odour technology, pack of 3 pairs.',
    apparel: {
      material: '85% Polyamide with Elastane',
      color: 'White/Black',
      careInstructions: 'Wash at 40°C. Do not bleach.',
    },
  },
  '08032089000437': {
    name: 'Softshell Waterproof Jacket',
    description: 'Waterproof, breathable softshell jacket, ideal for outdoor activities in every season.',
    apparel: {
      material: '100% Polyester with Waterproof Membrane',
      color: 'Navy Blue',
      careInstructions: 'Wash at 30°C. Do not bleach. Do not iron over the membrane.',
    },
  },
  '08032089000444': {
    name: 'Adjustable Baseball Cap',
    description: 'Cotton baseball cap with adjustable closure, urban casual style.',
    apparel: { material: '100% Cotton', color: 'Black', careInstructions: 'Hand wash at 30°C.' },
  },
  '08032089000451': {
    name: 'Lightweight Running Trainers',
    description: 'Lightweight running shoes with cushioned EVA sole and breathable mesh upper.',
    apparel: {
      material: '60% Breathable Mesh with EVA Sole',
      color: 'Grey/Orange',
      careInstructions: 'Clean with a damp cloth. Do not machine wash.',
    },
  },
  '08032089000468': {
    name: 'Handcrafted Genuine Leather Belt',
    description: 'Handcrafted belt in vegetable-tanned genuine leather, antiqued metal buckle.',
    apparel: {
      material: '100% Vegetable-Tanned Cowhide Leather',
      color: 'Cognac Brown',
      careInstructions: 'Do not wet. Treat periodically with leather balm.',
    },
  },
  '08032089000475': {
    name: 'Merino Wool Winter Gloves',
    description: 'Merino wool winter gloves, warm and breathable, touchscreen compatible.',
    apparel: {
      material: '90% Merino Wool',
      color: 'Charcoal Grey',
      careInstructions: 'Hand wash at 30°C. Do not bleach.',
    },
  },
  '08032089000482': {
    name: 'Fresh Italian Chicken Fillets 500g',
    description: 'Fresh chicken breast fillets, free-range Italian farming, packed in protective atmosphere.',
    food: {
      ingredients: 'Chicken breast (100%), free-range Italian farming.',
      allergens: 'No allergens declared.',
    },
    logistics: { storage: 'Store between 0°C and 4°C. Consume by the date shown on the pack.' },
  },
  '08032089000499': {
    name: 'Whole Drinking Yogurt 1L',
    description: 'Whole drinking yogurt, made with fresh mountain-pasture milk, no preservatives.',
    food: {
      ingredients: 'Pasteurised fresh whole milk, live lactic ferments.',
      allergens: 'Contains milk.',
    },
    logistics: { storage: 'Store between 0°C and 4°C.' },
  },
  '08032089000505': {
    name: 'PDO Buffalo Mozzarella from Campania 250g',
    description: 'PDO Buffalo Mozzarella from Campania, made with 100% Campanian buffalo milk, in liquid preserve.',
    food: {
      ingredients: 'Campanian buffalo milk (100%), lactic ferments, rennet, salt.',
      allergens: 'Contains milk.',
    },
    logistics: { storage: 'Store between 0°C and 4°C, immersed in the packing liquid.' },
  },
  '08032089000512': {
    name: 'Free-Range Fresh Eggs, 12 pcs',
    description: 'Grade A fresh eggs, from free-range hens, pack of 12 eggs.',
    food: { ingredients: 'Grade A fresh eggs (12 pieces).', allergens: 'Contains eggs.' },
    logistics: { storage: 'Refrigerate after purchase.' },
  },
  '08032089000529': {
    name: 'PDO Parma Ham, Sliced 100g',
    description: 'PDO Parma Ham aged 18 months, sliced and packed in protective atmosphere.',
    food: { ingredients: 'Italian pork leg (100%), salt.', allergens: 'No allergens declared.' },
    logistics: { storage: 'Store between 0°C and 4°C. Consume within 3 days of opening.' },
  },
  '08032089000536': {
    name: 'Fairtrade Bananas, per kg',
    description: 'Fairtrade bananas from a certified fair-trade supply chain, sold by weight.',
    food: { ingredients: 'Fairtrade bananas (100%).', allergens: 'No allergens declared.' },
    logistics: { storage: 'Store at room temperature, away from heat sources.' },
  },
  '08032089000543': {
    name: 'Fresh Durum Wheat Semolina Bread 500g',
    description: 'Fresh durum wheat semolina bread, wood-fired, baked fresh daily.',
    food: {
      ingredients: 'Durum wheat semolina, water, sourdough starter, salt.',
      allergens: 'Contains gluten.',
    },
    logistics: { storage: 'Best consumed the same day. Store in a dry place.' },
  },
  '08032089000550': {
    name: 'Smoked Norwegian Salmon 200g',
    description: 'Smoked Norwegian salmon, farmed in controlled waters, thinly sliced and packed in protective atmosphere.',
    food: {
      ingredients: 'Salmon (100%), salt, smoke flavouring.',
      allergens: 'Contains fish.',
    },
    logistics: { storage: 'Store between 0°C and 4°C. Consume within 2 days of opening.' },
  },
  '08032089000567': {
    name: 'White Washable Interior Paint 14L',
    description: 'Acrylic-based washable interior paint, high covering power, low VOC emissions.',
  },
  '08032089000574': {
    name: 'Rock Wool Thermal Insulation Panels',
    description: 'Rock wool insulation panels for thermal and acoustic insulation, thermal conductivity 0.035 W/mK.',
  },
  '08032089000581': {
    name: '18V Cordless Drill Driver',
    description: 'Professional 18V cordless drill driver with 2 lithium batteries, carry case included.',
  },
  '08032089000598': {
    name: 'Premixed Cement Mortar, 25kg Bag',
    description: 'Premixed cement mortar for masonry, ready to use with just the addition of water.',
  },
  '08032089000604': {
    name: 'Level 5 Cut-Resistant Work Gloves',
    description: 'Level 5 cut-resistant work gloves, with nitrile coating for maximum grip.',
  },
  '08032089000611': {
    name: 'Clear Sanitary Silicone Sealant, 310ml Cartridge',
    description: 'Anti-mould clear sanitary silicone sealant, for bathroom and kitchen fixtures and surfaces.',
  },
  '08032089000628': {
    name: 'Aluminium Profile for Drywall, 3m',
    description: 'Galvanised steel sheet guide profile for drywall structures, 3-metre length.',
  },
  '08032089000635': {
    name: 'EN397 Construction Site Safety Helmet',
    description: 'EN397-certified construction site safety helmet, adjustable, with ratchet harness.',
  },
};

/** Traduzioni per stringhe a vocabolario chiuso, riusate identiche su più prodotti. */
export const STRING_TRANSLATIONS_EN: Record<string, string> = {
  // Certificazioni: ente (solo quelli descrittivi; i nomi propri reali restano invariati)
  'Organismo Notificato 0123': 'Notified Body 0123',
  'Ente di Certificazione Edile': 'Building Certification Body',
  'Ente Certificazione Ecologica UE': 'EU Ecological Certification Body',
  'Consorzio Tutela Aceto Balsamico di Modena': 'Balsamic Vinegar of Modena Protection Consortium',
  'Consorzio di Tutela Mozzarella di Bufala Campana': 'Buffalo Mozzarella from Campania Protection Consortium',
  'Ente Certificazione Ambientale UE': 'EU Environmental Certification Body',
  'Ente Certificazione Elettrico UE': 'EU Electrical Certification Body',
  'Ente Certificazione DPI UE': 'EU PPE Certification Body',

  // Certificazioni: standard
  'EN 14683 Tipo IIR': 'EN 14683 Type IIR',
  'Regolamento UE 2017/745 (MDR)': 'EU Regulation 2017/745 (MDR)',
  'Ecolabel UE': 'EU Ecolabel',
  'Ecolabel UE - Basso COV': 'EU Ecolabel - Low VOC',
  'Direttiva Bassa Tensione 2014/35/UE': 'Low Voltage Directive 2014/35/EU',
  IGP: 'PGI',
  DOP: 'PDO',

  // Certificazioni: valore
  Approved: 'Approved',
  'Scope Certificate': 'Scope Certificate',
  Certified: 'Certified',
  'Marcatura CE': 'CE Marking',
  Conforme: 'Compliant',
  Certificato: 'Certified',
  'Marcatura CE, validazione clinica ESH': 'CE Marking, ESH clinical validation',
  'Marcatura CE - DPI Categoria II': 'CE Marking - PPE Category II',

  // Tracciabilità: label evento
  'Raccolta Frutta': 'Fruit Harvesting',
  'Lavorazione e Confezionamento': 'Processing and Packaging',
  'Immissione sul Mercato': 'Market Release',
  'Coltivazione Mais e Riso': 'Corn and Rice Cultivation',
  'Macinazione e Trafilatura': 'Milling and Extrusion',
  'Coltivazione Cotone Organico': 'Organic Cotton Cultivation',
  'Filatura e Confezione': 'Spinning and Garment Making',
  'Distribuzione Europa': 'Europe Distribution',
  'Immissione sul Mercato Italiano': 'Italian Market Release',
  'Raccolta Caffè Verde': 'Green Coffee Harvesting',
  Torrefazione: 'Roasting',
  'Coltivazione Grano Tenero': 'Soft Wheat Cultivation',
  'Macinazione a Pietra': 'Stone Milling',
  'Distribuzione HoReCa': 'HoReCa Distribution',
  'Produzione Componenti Elettronici': 'Electronic Components Production',
  'Assemblaggio e Collaudo': 'Assembly and Testing',
  'Immissione sul Mercato UE': 'EU Market Release',
  'Produzione Tessuto Non Tessuto': 'Non-Woven Fabric Production',
  'Controllo Qualità e Certificazione CE': 'Quality Control and CE Certification',
  Pesca: 'Fishing',
  'Sfilettatura e Confezionamento': 'Filleting and Packaging',
  'Distribuzione a Catena del Freddo': 'Cold Chain Distribution',
  Raccolta: 'Harvesting',
  'Lavaggio IV Gamma e Confezionamento': 'Ready-to-Eat Washing and Packaging',
  'Estrazione Materie Prime': 'Raw Material Extraction',
  'Cottura Clinker e Macinazione': 'Clinker Firing and Grinding',
  'Estrazione Argille': 'Clay Extraction',
  'Pressatura, Smaltatura e Cottura': 'Pressing, Glazing and Firing',
  'Controllo Qualità e Marcatura CE': 'Quality Control and CE Marking',
  'Captazione alla Sorgente': 'Spring Water Collection',
  Imbottigliamento: 'Bottling',
  Distribuzione: 'Distribution',
  'Riciclo Bottiglie in PET': 'PET Bottle Recycling',
  'Tessitura e Confezione': 'Weaving and Garment Making',
  'Approvvigionamento Materia Prima': 'Raw Material Sourcing',
  'Produzione e Confezionamento': 'Production and Packaging',

  // GDSN: livello gerarchia
  'Unità Base': 'Base Unit',
  Cartone: 'Carton',
  Pallet: 'Pallet',
  Scatola: 'Box',
  'Pallet Misto': 'Mixed Pallet',

  // GDSN: etichetta tipo imballo
  'Vasetto in vetro': 'Glass jar',
  'Cartone da 12': 'Box of 12',
  'Pallet EPAL': 'EPAL pallet',
  'Astuccio in cartoncino': 'Cardboard carton',
  'Cartone da 24': 'Box of 24',
  'Capo in polybag singolo': 'Single polybag garment',
  'Scatola da 20 pezzi': 'Box of 20 pieces',
  'Sacco in carta': 'Paper sack',
  'Confezione da 50 mascherine': 'Pack of 50 masks',
  'Cartone da 20 confezioni': 'Box of 20 packs',
  'Scatola da 1.44 m²': 'Box of 1.44 m²',
  'Pallet EPAL (48 scatole, 69 m²)': 'EPAL pallet (48 boxes, 69 m²)',
  'Sacchetto flessibile': 'Flexible pouch',
  'Cartone da 20': 'Box of 20',
  'Bottiglia in vetro': 'Glass bottle',
  'Cassa da 24': 'Case of 24',
  Tanica: 'Jerrycan',
  'Cartone da 4': 'Box of 4',
  'Bag-in-Box': 'Bag-in-Box',
  'Cartone singolo': 'Single carton',
  'Cartone da 10': 'Box of 10',
  'Busta protettiva': 'Protective sleeve',
  'Scatola scarpe': 'Shoe box',
  'Cartone da 8': 'Box of 8',
  'Vaschetta in ATM': 'Modified-atmosphere tray',
  'Cassa refrigerata da 10': 'Refrigerated case of 10',
  'Vaschetta in liquido di governo': 'Tray in packing liquid',
  'Cassa refrigerata da 12': 'Refrigerated case of 12',
  Secchio: 'Pail',

  // Link collegati: etichetta
  'Scopri le Ricette': 'Discover the Recipes',
  'Report Sostenibilità': 'Sustainability Report',
  'Trova in Negozio': 'Find in Store',

  // Prezzo: etichetta sconto
  'Offerta speciale': 'Special offer',
  'Saldi stagionali': 'Seasonal sale',
  'Offerta lancio': 'Launch offer',
  'Fine serie': 'Clearance',
  'Offerta HORECA': 'Foodservice offer',
};
