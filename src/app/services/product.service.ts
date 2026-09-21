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

/** Un allergene dichiarato in etichetta, con il suo livello di presenza — stessa forma di gs1:hasAllergen. */
export interface AllergenDeclaration {
  code: string; // suffisso di gs1:AllergenTypeCode-*, es. "GLUTEN", "MILK", "HAZELNUTS"
  containment: 'CONTAINS' | 'MAY_CONTAIN' | 'FREE_FROM';
}

/** Valori nutrizionali medi riferiti a un'unica base (100g o 100ml) — gs1:nutrientBasisQuantity. */
export interface NutritionFacts {
  basis: NetContent;
  energyKj?: number;
  energyKcal?: number;
  fat?: number;
  saturatedFat?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  carbohydrates?: number;
  sugars?: number;
  fiber?: number;
  protein?: number;
  salt?: number;
  calcium?: number; // mg
}

export interface FoodProfile {
  ingredients?: string;
  /** Dicitura libera "Altro testo allergeni" della scheda — mostrata così com'è, oltre ai badge strutturati. */
  allergens?: string;
  allergenDeclarations?: AllergenDeclaration[];
  nutrition?: NutritionFacts;
  preparationInstructions?: string;
  servingSize?: NetContent;
  numberOfServingsPerPackage?: number;
  /** Rivendicazioni nutrizionali/dietetiche testuali (etichetta "Caratteristiche"), es. "-75% grassi saturi". */
  nutritionalClaims?: string[];
}

/** Rivendicazione dietetica strutturata — gs1:dietType (Vegan, Vegetarian, Organic, Free From Gluten...). */
export interface DietClaim {
  code: string; // suffisso di gs1:DietTypeCode-*
  label: string; // etichetta italiana da mostrare, es. "Idoneo ai vegani"
}

export interface PackagingMaterial {
  component: string; // es. "Bottiglia", "Tappo", "Vassoio"
  materialLabel: string; // es. "Vetro trasparente" — per la UI
  materialCode: string; // codice originale della scheda, es. "70 - Clear Glass"
  gs1MaterialType?: string; // suffisso di gs1:PackagingMaterialTypeCode-*, solo se mappabile con certezza
  recyclable?: boolean;
}

export interface Dimensions {
  height: number;
  width: number;
  depth: number;
  unitCode: 'MMT';
}

export interface PackagingInfo {
  type: string; // es. "Bottiglia", "Confezione", "Cartone", "Barattolo", "Vassoio con pellicola"
  netWeight?: NetContent;
  grossWeight?: NetContent;
  dimensions?: Dimensions;
  materials?: PackagingMaterial[];
  recyclingNotes?: string;
}

export interface StorageInfo {
  type: string; // "Ambiente" | "Fresco" | ...
  tempMinC?: number;
  tempMaxC?: number;
  instructions: string;
}

export interface AlcoholInfo {
  percentageByVolume: number;
}

/** Rivendicazione biologica strutturata — gs1:organicClaim / OrganicClaimDetails. */
export interface OrganicClaim {
  agencyCode: string; // suffisso di gs1:OrganicClaimAgencyCode-*
  agencyLabel: string;
  certificateCode?: string; // es. "IT-BIO-006", testo libero non normato da GS1
}

export interface ManufacturerInfo {
  companyName: string;
  address?: string;
  packagedFor?: { companyName: string; address?: string; website?: string };
  manufacturingSites?: string[];
  phone?: string;
  website?: string;
}

/**
 * L'organizzazione che detiene il prefisso GS1 (GS1 Company Prefix) da cui è stato ricavato il
 * GTIN del prodotto — gs1:brandOwner, "The organization that is responsible for allocating the
 * GTIN to the product". Non coincide sempre con `manufacturer`: per i prodotti a marchio del
 * distributore (es. Coop, Selex, Conad) è il distributore/`packagedFor` a possedere il prefisso,
 * mentre `manufacturer` resta lo stabilimento terzista che confeziona fisicamente il prodotto.
 *
 * Il GS1 Company Prefix (le prime 7 cifre di `gln`) è reale, verificato via GEPIR
 * (gepir.gs1.org) — il registro pubblico delle licenze GS1 — per ciascuna delle aziende qui
 * presenti. Le schede Immagino fornite non riportano invece il GLN completo a 13 cifre (solo il
 * distributore lo conosce): le cifre restanti (riferimento di sede + check digit) sono quindi un
 * valore dimostrativo, calcolato con l'algoritmo di check digit GS1 standard su un riferimento di
 * sede convenzionale, non il GLN realmente assegnato dall'azienda.
 */
export interface BrandOwner {
  gln: string; // 13 cifre — vedi commento sopra
  companyName: string;
  website?: string;
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
  subBrand?: string;
  image: string;
  images?: string[];
  description: string;
  sectorId: string;
  sectorName: string;
  rating?: Rating;

  /** Denominazione di Vendita — nome legale/regolamentato del prodotto (gs1:regulatedProductName). */
  legalName?: string;
  /** "Marketing prodotto" / "Marketing prodotto esterno" della scheda — copy libero del brand. */
  marketingCopy?: string;
  dietClaims?: DietClaim[];
  organicClaim?: OrganicClaim;
  countryOfOrigin?: string;
  originStatement?: string;
  packaging?: PackagingInfo;
  storage?: StorageInfo;
  alcohol?: AlcoholInfo;
  manufacturer?: ManufacturerInfo;
  brandOwner?: BrandOwner;
  /** URL della scheda di QUESTO prodotto sul sito ufficiale del brand/distributore (non solo la
   * home o la pagina del brand) — dove mancante, la pagina prodotto ripiega su un sito più
   * generico (manufacturer/packagedFor/brandOwner). Vedi officialWebsiteUrl in product.ts. */
  officialProductUrl?: string;
  targetMarket?: string;

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

/** "/100g" oppure "/100ml" — a seconda della base su cui sono riferiti i valori nutrizionali. */
export function nutritionBasisLabel(basis: NetContent): string {
  return basis.unitCode === 'MLT' || basis.unitCode === 'LTR' ? `/${basis.value}ml` : `/${basis.value}g`;
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

/** "320 × 90 × 90 mm" — dimensioni della confezione (altezza × larghezza × profondità scaffale). */
export function formatDimensions(d?: Dimensions): string | null {
  if (!d) return null;
  return `${d.height} × ${d.width} × ${d.depth} mm`;
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

  /** Tutti i prodotti riconducibili allo stesso brand owner (stesso GLN) — vedi BrandOwner. */
  getProductsByGln(gln: string): Product[] {
    return this.products.filter((p) => p.brandOwner?.gln === gln).map((p) => this.localize(p));
  }

  /** Il brand owner stesso, da un prodotto qualunque che gli sia riconducibile. */
  getBrandOwnerByGln(gln: string): BrandOwner | undefined {
    return this.products.find((p) => p.brandOwner?.gln === gln)?.brandOwner;
  }

}