import { Injectable, inject } from '@angular/core';
import productsData from '../data/products.json';
import { PRODUCT_TRANSLATIONS_EN, STRING_TRANSLATIONS_EN } from '../data/products.en';
import { SECTORS, localizeSector } from '../data/sectors';
import { AppLang, LanguageService } from './language.service';

// --- Interfacce Modulari ---
export interface Gs1Link {
  linkType: string; // es. gs1:traceability, gs1:recipe
  url: string;
  label: string;
}

export interface Logistics {
  netWeight?: string;
  grossWeight?: string;
  dimensions?: string;
  origin?: string;
  storage?: string;
}

export interface FoodProfile {
  ingredients?: string;
  allergens?: string;
  nutrition?: {
    calories?: string;
    fat?: string;
    carbohydrates?: string;
    sugars?: string;
    protein?: string;
    salt?: string;
  };
}

export interface ApparelProfile {
  material?: string;
  careInstructions?: string;
  color?: string;
  size?: string;
}

export interface Certification {
  agency: string;
  standard?: string;
  value?: string;
  id?: string;
}

export interface Rating {
  value: number; // 0-5
  count: number;
}

export interface EnvironmentalImpact {
  co2e?: string;
  waterConsumption?: string;
  energyConsumption?: string;
  chemicalConsumption?: string;
  recycledContent?: string;
  sustainabilityCertifiedContent?: string;
}

export interface EconomicOperator {
  companyName: string;
  gln: string;
  address: string;
  email?: string;
}

/** Evento di tracciabilità di filiera in stile EPCIS (vedi GS1 Digital Product Passport demo). */
export interface TraceEvent {
  bizStep: string;
  label: string;
  date: string; // ISO 8601
  company: string;
  gln: string;
  location: string;
}

/**
 * Istanza esempio (lotto + numero seriale) usata per mostrare come gli eventi EPCIS di filiera
 * si leghino sempre a un'istanza specifica del prodotto (AI 10 / AI 21), non al solo GTIN.
 * Vedi https://ref.gs1.org/epcis/.
 */
export interface TraceabilityExample {
  lot: string;
  serial: string;
}

export interface PriceInfo {
  amount: number;
  currency: string;
  vatRate: number;
  vatIncluded: boolean;
  listAmount?: number; // prezzo di listino, se in offerta
  discountLabel?: string;
  unit?: string; // es. "kg", "m²" per i prodotti a peso/misura variabile
  validUntil?: string; // ISO 8601 — schema:priceValidUntil
}

/** Contenuto netto della confezione, stessa forma di gs1:netContent (value + unitCode UN/ECE Rec 20). */
export interface NetContent {
  value: number;
  unitCode: 'GRM' | 'KGM' | 'MLT' | 'LTR';
}

/**
 * Un livello della gerarchia di imballo GDSN (Global Data Synchronisation Network): l'unità
 * base/di vendita e le relative unità logistiche (cartone, pallet...). Ogni livello ha un GTIN
 * proprio e un ruolo diverso nella filiera. Vedi https://www.gs1.org/standards/gdsn.
 */
export interface GdsnTradeItem {
  level: string; // es. "Unità Base", "Cartone", "Pallet"
  gtin: string;
  packagingTypeCode: string; // codice GS1, es. "EA", "CS", "PF"
  packagingTypeLabel: string;
  quantityContained?: number; // quante unità del livello inferiore contiene
  containedLevel?: string;
  netWeight?: string;
  grossWeight?: string;
  dimensions?: string;
  isBaseUnit: boolean;
  isConsumerUnit: boolean;
  isOrderableUnit: boolean;
  isDespatchUnit: boolean;
  isInvoiceUnit: boolean;
  /**
   * Serial Shipping Container Code (AI 00): identifica la singola unità logistica fisica e
   * seriale (un pallet o collo specifico) spedita, distinta dal GTIN che identifica solo la
   * classe di imballo. Presente solo sui livelli che sono unità logistiche (isDespatchUnit).
   * Vedi https://ref.gs1.org/standards/digital-link/uri-syntax/.
   */
  sscc?: string;
}

export interface GdsnInfo {
  targetMarket: string; // codice paese, es. "IT"
  dataPool: string;
  lastModified: string; // ISO 8601
  hierarchy: GdsnTradeItem[];
}

export interface Product {
  gtin: string;
  name: string;
  brand: string;
  image: string;
  images?: string[];
  description: string;
  sectorId: string;
  sectorName: string;
  rating?: Rating;

  // Moduli Opzionali
  links?: Gs1Link[];
  logistics?: Logistics;
  food?: FoodProfile;
  apparel?: ApparelProfile;
  certifications?: Certification[];
  environmentalImpact?: EnvironmentalImpact;
  economicOperator?: EconomicOperator;
  traceability?: TraceEvent[];
  traceabilityExample?: TraceabilityExample;
  price?: PriceInfo;
  netContent?: NetContent;
  gdsn?: GdsnInfo;

  // Il payload JSON-LD nativo per i bot (Google, Resolver GS1, ecc.)
  rawGs1Data?: any;
}

/**
 * Applica la traduzione inglese al prodotto se `lang` è 'en' (l'italiano, lingua base dei
 * dati, viene restituito invariato). Solo i campi di testo libero vengono sostituiti — codici,
 * nomi propri e indirizzi restano identici in entrambe le lingue. Il payload JSON-LD
 * (`rawGs1Data`) non viene toccato qui: le sue proprietà `gs1:` multilingua sono già
 * strutturate con voci `{ "@value", "@language" }` sia "it" sia "en" direttamente nei dati.
 */
export function localizeProduct(product: Product, lang: AppLang): Product {
  if (lang === 'it') return product;

  const overlay = PRODUCT_TRANSLATIONS_EN[product.gtin];
  const sector = SECTORS.find((s) => s.id === product.sectorId);

  const localized: Product = {
    ...product,
    name: overlay?.name ?? product.name,
    description: overlay?.description ?? product.description,
    sectorName: sector ? localizeSector(sector, 'en').name : product.sectorName,
  };

  if (product.food && overlay?.food) {
    localized.food = {
      ...product.food,
      ingredients: overlay.food.ingredients ?? product.food.ingredients,
      allergens: overlay.food.allergens ?? product.food.allergens,
    };
  }

  if (product.apparel && overlay?.apparel) {
    localized.apparel = {
      ...product.apparel,
      material: overlay.apparel.material ?? product.apparel.material,
      color: overlay.apparel.color ?? product.apparel.color,
      careInstructions: overlay.apparel.careInstructions ?? product.apparel.careInstructions,
    };
  }

  if (product.logistics && overlay?.logistics?.storage) {
    localized.logistics = { ...product.logistics, storage: overlay.logistics.storage };
  }

  if (product.environmentalImpact && overlay?.environmentalImpact) {
    localized.environmentalImpact = { ...product.environmentalImpact, ...overlay.environmentalImpact };
  }

  if (product.links?.length) {
    localized.links = product.links.map((l) => ({ ...l, label: translateString(l.label) }));
  }

  if (product.price?.discountLabel) {
    localized.price = { ...product.price, discountLabel: translateString(product.price.discountLabel) };
  }

  if (product.certifications?.length) {
    localized.certifications = product.certifications.map((c) => ({
      ...c,
      agency: translateString(c.agency),
      standard: c.standard ? translateString(c.standard) : c.standard,
      value: c.value ? translateString(c.value) : c.value,
    }));
  }

  if (product.traceability?.length) {
    localized.traceability = product.traceability.map((ev) => ({ ...ev, label: translateString(ev.label) }));
  }

  if (product.gdsn) {
    localized.gdsn = {
      ...product.gdsn,
      hierarchy: product.gdsn.hierarchy.map((item) => ({
        ...item,
        level: translateString(item.level),
        packagingTypeLabel: translateString(item.packagingTypeLabel),
        containedLevel: item.containedLevel ? translateString(item.containedLevel) : item.containedLevel,
      })),
    };
  }

  return localized;
}

function translateString(value: string): string {
  return STRING_TRANSLATIONS_EN[value] ?? value;
}

/** Il prodotto ha almeno una certificazione/ente terzo che ne convalida i dati. */
export function isVerified(product: Product): boolean {
  return !!product.certifications && product.certifications.length > 0;
}

export function productImages(product: Product): string[] {
  if (product.images && product.images.length) return product.images;
  return product.image ? [product.image] : [];
}

/** Percentuale di sconto rispetto al prezzo di listino, se il prodotto è in offerta. */
export function discountPercent(price: PriceInfo): number | null {
  if (!price.listAmount || price.listAmount <= price.amount) return null;
  return Math.round((1 - price.amount / price.listAmount) * 100);
}

/** Formatta un importo in Euro secondo la convenzione italiana (es. "3,49 €"). */
export function formatEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/** Prezzo al kg — l'indicazione del "prezzo per unità di misura" richiesta in etichetta/scaffale. */
export function pricePerKg(price: PriceInfo, netContent?: NetContent): number | null {
  if (!netContent) return null;
  const grams = netContent.unitCode === 'KGM' ? netContent.value * 1000 : netContent.unitCode === 'GRM' ? netContent.value : null;
  if (!grams) return null;
  return (price.amount / grams) * 1000;
}

/** "500 GRM" -> "500 g" ; "1500 GRM" -> "1,5 kg" — il formato leggibile del contenuto netto. */
export function formatNetContent(netContent?: NetContent): string | null {
  if (!netContent) return null;
  const { value, unitCode } = netContent;
  if (unitCode === 'GRM') return value >= 1000 ? `${(value / 1000).toLocaleString('it-IT')} kg` : `${value} g`;
  if (unitCode === 'KGM') return `${value} kg`;
  if (unitCode === 'MLT') return value >= 1000 ? `${(value / 1000).toLocaleString('it-IT')} l` : `${value} ml`;
  if (unitCode === 'LTR') return `${value} l`;
  return null;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private languageService = inject(LanguageService);
  private products: Product[] = productsData as Product[];

  constructor() {}

  private localize(product: Product): Product {
    return localizeProduct(product, this.languageService.lang());
  }

  getProductsBySector(sectorId: string): Product[] {
    return this.products.filter(p => p.sectorId === sectorId).map((p) => this.localize(p));
  }

  getProductByGtin(gtin: string): Product | undefined {
    // Il GTIN canonico (GS1 Digital Link, gs1:gtin) è sempre a 14 cifre: un link più corto
    // (GTIN-8/12/13 non completato con zeri, es. un vecchio segnalibro) resta risolvibile.
    const padded = /^\d{1,13}$/.test(gtin) ? gtin.padStart(14, '0') : gtin;
    const product = this.products.find(p => p.gtin === gtin || p.gtin === padded);
    return product ? this.localize(product) : undefined;
  }

  getAllProducts(): Product[] {
    return this.products.map((p) => this.localize(p));
  }

  /** Ricerca istantanea su nome, marchio e GTIN (sui dati nella lingua corrente). */
  search(query: string): Product[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.getAllProducts().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.gtin.includes(q) ||
      p.sectorName.toLowerCase().includes(q)
    );
  }
}