import { AppLang } from '../services/language.service';

export interface Sector {
  id: string;
  name: string;
  icon: string;
  description: string;
  brandColor: string;
}

export const SECTORS: Sector[] = [
  {
    id: 'fmcg',
    name: 'Largo consumo',
    icon: 'icons/cpg.png',
    description: "Un solo codice a barre, letto in cassa, apre anche a prezzo, ingredienti, certificazioni e origine del prodotto — senza mai dover ristampare l'etichetta per aggiornarli.",
    brandColor: '#F26334', // GS1 Orange
  },
  {
    id: 'foodservice',
    name: 'Foodservice',
    icon: 'icons/foodservice.png',
    description: "Lo stesso identificativo che gestisce l'acquisto professionale segue il prodotto dal fornitore alla cucina, con formati, quantità e dati logistici pensati per la ristorazione.",
    brandColor: '#7AC143', // GS1 Grass
  },
  {
    id: 'healthcare',
    name: 'Sanità',
    icon: 'icons/healthcare.png',
    description: 'Il codice già presente su dispositivi e farmaci, tramite UDI e GS1 DataMatrix, diventa una via d\'accesso a informazioni di sicurezza del paziente e tracciabilità di filiera.',
    brandColor: '#00B6DE', // GS1 Sky
  },
  {
    id: 'apparel',
    name: 'Abbigliamento',
    icon: 'icons/textiles.png',
    description: "Un solo identificativo racconta la storia del capo — materiali, provenienza e cura — dallo scaffale all'armadio, in modo trasparente e verificabile.",
    brandColor: '#AF96D4', // GS1 Lavender
  },
  {
    id: 'fresh-foods',
    name: 'Alimenti freschi',
    icon: 'icons/fresh_foods.png',
    description: 'Lotto e scadenza si legano allo stesso identificativo di sempre, per garantire freschezza, qualità e tracciabilità dal campo alla tavola.',
    brandColor: '#FBB034', // GS1 Peach
  },
  {
    id: 'costruzioni',
    name: 'Costruzioni',
    icon: 'icons/construction.png',
    description: "Lo stesso identificativo che organizza la logistica di cantiere — dal singolo pezzo al pallet — apre anche a certificazioni di sicurezza e conformità del prodotto.",
    brandColor: '#B78B20', // GS1 Honey
  },
];

interface SectorTranslationEn {
  name: string;
  description: string;
}

const SECTOR_TRANSLATIONS_EN: Record<string, SectorTranslationEn> = {
  fmcg: {
    name: 'Consumer Goods',
    description:
      'A single barcode, scanned at checkout, also opens up price, ingredients, certifications and product origin — updatable at any time, without ever reprinting the label.',
  },
  foodservice: {
    name: 'Foodservice',
    description:
      "The same identifier that manages a professional purchase follows the product from supplier to kitchen, with formats, quantities and logistics data built for foodservice.",
  },
  healthcare: {
    name: 'Healthcare',
    description:
      'The code already on devices and medicines becomes, through UDI and GS1 DataMatrix, a gateway to patient safety information and supply chain traceability.',
  },
  apparel: {
    name: 'Apparel',
    description:
      "A single identifier tells the garment's story — materials, origin and care — from shelf to wardrobe, transparently and verifiably.",
  },
  'fresh-foods': {
    name: 'Fresh Foods',
    description:
      'Batch and expiry date are tied to the same identifier as always, guaranteeing freshness, quality and traceability from field to table.',
  },
  costruzioni: {
    name: 'Construction',
    description:
      "The same identifier that organises site logistics — from single item to pallet — also opens up safety and compliance certifications for the product.",
  },
};

/** Restituisce il settore con nome e descrizione nella lingua richiesta (IT è quella di base). */
export function localizeSector(sector: Sector, lang: AppLang): Sector {
  if (lang === 'it') return sector;
  const t = SECTOR_TRANSLATIONS_EN[sector.id];
  return t ? { ...sector, name: t.name, description: t.description } : sector;
}
