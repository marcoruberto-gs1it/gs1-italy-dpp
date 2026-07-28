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
  gdsn?: GdsnInfo;

  // Il payload JSON-LD nativo per i bot (Google, Resolver GS1, ecc.)
  rawGs1Data?: any;
}

/** Il prodotto espone dati strutturati GS1 Web Vocabulary pronti per bot e AI agent. */
export function isAiReady(product: Product): boolean {
  return !!product.rawGs1Data;
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

export type Vocabulary = 'gs1' | 'schema';

/**
 * Rileva quali ontologie sono realmente dichiarate nel @context del JSON-LD del prodotto:
 * GS1 Web Vocabulary, schema.org, entrambe o nessuna (dati non strutturati).
 */
export function getVocabularies(product: Product): Vocabulary[] {
  const context = product.rawGs1Data?.['@context'];
  if (!context) return [];
  const contextString = JSON.stringify(context);
  const vocabs: Vocabulary[] = [];
  if (contextString.includes('ref.gs1.org/voc')) vocabs.push('gs1');
  if (contextString.includes('schema.org')) vocabs.push('schema');
  return vocabs;
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

/**
 * Costruisce un evento EPCIS 2.0 (ObjectEvent) illustrativo a partire da un TraceEvent,
 * sul modello di quanto esposto dal demo GS1 UK Digital Product Passport (dpp.gs1uk.org).
 *
 * L'EPC in epcList fa sempre riferimento a un'istanza specifica del prodotto (GTIN + lotto +
 * numero seriale, AI 10/21), mai al solo GTIN: un evento di tracciabilità descrive un lotto o
 * un articolo serializzato, non l'intera classe di prodotto. Vedi https://ref.gs1.org/epcis/.
 */
export function buildEpcisEvent(product: Product, event: TraceEvent, index: number, instance: TraceabilityExample): object {
  return {
    '@context': 'https://ref.gs1.org/epcis/epcis-context.jsonld',
    eventID: `urn:uuid:demo-${product.gtin}-${index}`,
    type: 'ObjectEvent',
    action: 'OBSERVE',
    bizStep: event.bizStep,
    // Forma canonica (stem https://id.gs1.org/, resolver GS1 ufficiale), non il dominio di
    // hosting di questa demo: l'EPC identifica l'istanza fisica del prodotto in sé, non "questa
    // pagina di questo sito" — stessa distinzione già fatta per readPoint (AI 414) qui sotto, e
    // per il "Digital Link canonico" nel validatore.
    epcList: [`https://id.gs1.org/01/${product.gtin}/10/${instance.lot}/21/${instance.serial}`],
    eventTime: event.date,
    eventTimeZoneOffset: '+00:00',
    readPoint: { id: `https://id.gs1.org/414/${event.gln}` },
  };
}

// --- GS1 EDI (eCom): flusso Order-to-Cash illustrativo ---

/**
 * Controparte "buyer" fissa e condivisa per tutti i prodotti: un GS1 EDI ha sempre due parti
 * (chi ordina, chi vende), ma questo catalogo modella solo il lato "venditore" di ogni prodotto
 * (economicOperator). Un GLN fittizio ma sintatticamente valido (stesso prefisso aziendale
 * 8032089 di tutto il dataset, cifra di controllo mod-10 corretta), mai riutilizzato da nessun
 * altro GLN reale nei dati.
 */
export const EDI_DEMO_BUYER = { companyName: 'GS1 Italy Retail Demo S.p.A.', gln: '8032089999991' };

export interface EdiSegment {
  /** Segmento EANCOM/UN-EDIFACT reale (nome e sintassi), non un'invenzione. */
  code: string;
  /** Chiave i18n sotto product.edi.notes per l'annotazione in linguaggio naturale. */
  noteKey: string;
  noteParams?: Record<string, string | number>;
}

export interface EdiMessage {
  code: 'ORDERS' | 'ORDRSP' | 'DESADV' | 'RECADV' | 'INVOIC';
  nameKey: string;
  from: 'buyer' | 'seller';
  date: string; // ISO 8601
  segments: EdiSegment[];
}

/**
 * Costruisce l'intero ciclo Order-to-Cash (Ordine → Conferma d'ordine → Avviso di spedizione →
 * Avviso di ricevimento → Fattura) in sintassi GS1 EANCOM, per il prodotto dato.
 *
 * I segmenti (BGM, DTM, NAD, RFF, CUX, LIN, QTY, GIN, PRI, MOA, TAX, UNH/UNT) e la sequenza dei
 * cinque messaggi sono quelli reali dello standard GS1 EANCOM/eCom — vedi la presentazione
 * ufficiale GS1 "GS1 eCom Standard (EDI) and its Benefits" (gs1mexico.org). Le date sono
 * ancorate al giorno successivo all'ultimo evento di tracciabilità del prodotto (invece di
 * Date.now(), che romperebbe la staticità del prerendering), così l'intero ciclo O2C risulta
 * temporalmente coerente con la tab Supply Chain dello stesso prodotto.
 */
export function buildEdiFlow(product: Product): EdiMessage[] {
  const seller = product.economicOperator;
  if (!seller) return [];

  const buyer = EDI_DEMO_BUYER;
  const gtin = product.gtin;
  const orderNum = `PO-${gtin.slice(-6)}`;
  const qty = 48; // stesso valore dell'esempio ufficiale GS1 EANCOM (QTY+21:48)
  const unitPrice = product.price?.amount ?? 0;
  const currency = product.price?.currency ?? 'EUR';
  const vatRate = product.price?.vatRate ?? 22;
  const sscc = product.gdsn?.hierarchy.find((h) => h.isDespatchUnit && h.sscc)?.sscc;

  const anchor = product.traceability?.length
    ? new Date(product.traceability[product.traceability.length - 1].date)
    : new Date('2024-06-21T00:00:00.000Z');
  const day = (offset: number) => {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  };
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const iso = (d: Date) => d.toISOString();

  const orderDate = day(1);
  const orderRespDate = day(2);
  const despatchDate = day(4);
  const receiptDate = day(5);
  const invoiceDate = day(6);

  const total = (qty * unitPrice).toFixed(2);
  const vatAmount = (qty * unitPrice * (vatRate / 100)).toFixed(2);

  const nadBy: EdiSegment = { code: `NAD+BY+${buyer.gln}::9'`, noteKey: 'nadBy', noteParams: { gln: buyer.gln, name: buyer.companyName } };
  const nadSu: EdiSegment = { code: `NAD+SU+${seller.gln}::9'`, noteKey: 'nadSu', noteParams: { gln: seller.gln, name: seller.companyName } };
  const rffOrder: EdiSegment = { code: `RFF+ON:${orderNum}'`, noteKey: 'rffOrder', noteParams: { order: orderNum } };
  const lin: EdiSegment = { code: `LIN+1++${gtin}:SRV'`, noteKey: 'lin', noteParams: { gtin } };

  const messages: EdiMessage[] = [
    {
      code: 'ORDERS',
      nameKey: 'orders',
      from: 'buyer',
      date: iso(orderDate),
      segments: [
        { code: `UNH+1+ORDERS:D:96A:UN:EAN008'`, noteKey: 'unh', noteParams: { msg: 'ORDERS' } },
        { code: `BGM+220+${orderNum}+9'`, noteKey: 'bgmOrder', noteParams: { order: orderNum } },
        { code: `DTM+137:${ymd(orderDate)}:102'`, noteKey: 'dtm', noteParams: { date: orderDate.toISOString().slice(0, 10) } },
        nadBy,
        nadSu,
        { code: `CUX+2:${currency}:9'`, noteKey: 'cux', noteParams: { currency } },
        lin,
        { code: `QTY+21:${qty}'`, noteKey: 'qtyOrdered', noteParams: { qty } },
        { code: `PRI+AAA:${unitPrice.toFixed(2)}'`, noteKey: 'pri', noteParams: { price: unitPrice.toFixed(2), currency } },
        { code: `UNT+9+1'`, noteKey: 'unt', noteParams: { msg: 'ORDERS' } },
      ],
    },
    {
      code: 'ORDRSP',
      nameKey: 'ordrsp',
      from: 'seller',
      date: iso(orderRespDate),
      segments: [
        { code: `UNH+2+ORDRSP:D:96A:UN:EAN008'`, noteKey: 'unh', noteParams: { msg: 'ORDRSP' } },
        { code: `BGM+231+${orderNum}+29'`, noteKey: 'bgmOrdrsp', noteParams: { order: orderNum } },
        { code: `DTM+137:${ymd(orderRespDate)}:102'`, noteKey: 'dtm', noteParams: { date: orderRespDate.toISOString().slice(0, 10) } },
        rffOrder,
        nadSu,
        nadBy,
        lin,
        { code: `QTY+113:${qty}'`, noteKey: 'qtyConfirmed', noteParams: { qty } },
        { code: `DTM+2:${ymd(despatchDate)}:102'`, noteKey: 'dtmDelivery', noteParams: { date: despatchDate.toISOString().slice(0, 10) } },
        { code: `UNT+9+2'`, noteKey: 'unt', noteParams: { msg: 'ORDRSP' } },
      ],
    },
    {
      code: 'DESADV',
      nameKey: 'desadv',
      from: 'seller',
      date: iso(despatchDate),
      segments: [
        { code: `UNH+3+DESADV:D:96A:UN:EAN009'`, noteKey: 'unh', noteParams: { msg: 'DESADV' } },
        { code: `BGM+351+ASN-${gtin.slice(-6)}+9'`, noteKey: 'bgmDesadv', noteParams: { asn: `ASN-${gtin.slice(-6)}` } },
        { code: `DTM+137:${ymd(despatchDate)}:102'`, noteKey: 'dtm', noteParams: { date: despatchDate.toISOString().slice(0, 10) } },
        rffOrder,
        nadSu,
        nadBy,
        ...(sscc ? [{ code: `GIN+BJ+${sscc}'`, noteKey: 'ginSscc', noteParams: { sscc } }] : []),
        lin,
        { code: `QTY+12:${qty}'`, noteKey: 'qtyDespatched', noteParams: { qty } },
        { code: `UNT+${sscc ? 10 : 9}+3'`, noteKey: 'unt', noteParams: { msg: 'DESADV' } },
      ],
    },
    {
      code: 'RECADV',
      nameKey: 'recadv',
      from: 'buyer',
      date: iso(receiptDate),
      segments: [
        { code: `UNH+4+RECADV:D:01B:UN:EAN010'`, noteKey: 'unh', noteParams: { msg: 'RECADV' } },
        { code: `BGM+632+GR-${gtin.slice(-6)}+9'`, noteKey: 'bgmRecadv', noteParams: { gr: `GR-${gtin.slice(-6)}` } },
        { code: `DTM+137:${ymd(receiptDate)}:102'`, noteKey: 'dtm', noteParams: { date: receiptDate.toISOString().slice(0, 10) } },
        rffOrder,
        nadBy,
        nadSu,
        lin,
        { code: `QTY+52:${qty}'`, noteKey: 'qtyReceived', noteParams: { qty } },
        { code: `UNT+8+4'`, noteKey: 'unt', noteParams: { msg: 'RECADV' } },
      ],
    },
    {
      code: 'INVOIC',
      nameKey: 'invoic',
      from: 'seller',
      date: iso(invoiceDate),
      segments: [
        { code: `UNH+5+INVOIC:D:96A:UN:EAN009'`, noteKey: 'unh', noteParams: { msg: 'INVOIC' } },
        { code: `BGM+380+INV-${gtin.slice(-6)}+9'`, noteKey: 'bgmInvoic', noteParams: { inv: `INV-${gtin.slice(-6)}` } },
        { code: `DTM+137:${ymd(invoiceDate)}:102'`, noteKey: 'dtm', noteParams: { date: invoiceDate.toISOString().slice(0, 10) } },
        rffOrder,
        nadSu,
        nadBy,
        { code: `CUX+2:${currency}:9'`, noteKey: 'cux', noteParams: { currency } },
        lin,
        { code: `QTY+47:${qty}'`, noteKey: 'qtyInvoiced', noteParams: { qty } },
        { code: `PRI+AAA:${unitPrice.toFixed(2)}'`, noteKey: 'pri', noteParams: { price: unitPrice.toFixed(2), currency } },
        { code: `MOA+79:${total}'`, noteKey: 'moaTotal', noteParams: { amount: total, currency } },
        { code: `TAX+7+VAT+++:::${vatRate}'`, noteKey: 'taxVat', noteParams: { vatRate } },
        { code: `MOA+124:${vatAmount}'`, noteKey: 'moaVat', noteParams: { amount: vatAmount, currency } },
        { code: `UNT+13+5'`, noteKey: 'unt', noteParams: { msg: 'INVOIC' } },
      ],
    },
  ];

  return messages;
}

// --- GDSN in GS1 Web Vocabulary ---

// Mappatura verso i codici unità di misura UN/CEFACT già usati altrove in questo dataset (vedi
// gs1:netContent/unitCode nei rawGs1Data dei singoli prodotti), per restare coerenti con lo
// stesso sistema di codifica.
const UNIT_CODES: Record<string, string> = { g: 'GRM', kg: 'KGM', mm: 'MMT', ml: 'MLT', l: 'LTR', pz: 'C62' };

function quantitativeValue(raw: string | undefined): { '@type': string; value: { '@value': string; '@type': string }; unitCode: string } | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/);
  if (!match) return undefined;
  const unitCode = UNIT_CODES[match[2].toLowerCase()];
  if (!unitCode) return undefined;
  return { '@type': 'gs1:QuantitativeValue', value: { '@value': match[1], '@type': 'xsd:float' }, unitCode };
}

function parseDimensions(raw: string | undefined): { height?: object; width?: object; depth?: object } {
  if (!raw) return {};
  const match = raw.trim().match(/^([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*([a-zA-Z]+)$/i);
  if (!match) return {};
  const unitCode = UNIT_CODES[match[4].toLowerCase()];
  if (!unitCode) return {};
  const asQv = (v: string) => ({ '@type': 'gs1:QuantitativeValue', value: { '@value': v, '@type': 'xsd:float' }, unitCode });
  // Convenzione già in uso nel dataset per "dimensions" (vedi product.specs.dimensions,
  // "LxPxA"/"WxDxH"): larghezza x profondità x altezza.
  return { width: asQv(match[1]), depth: asQv(match[2]), height: asQv(match[3]) };
}

/**
 * Pubblica la gerarchia di imballo GDSN di un prodotto nel formato GS1 Web Vocabulary:
 * gs1: per ogni attributo che ha un termine ufficiale corrispondente (gtin, packagingType,
 * netWeight/netContent, grossWeight, inPackageHeight/Width/Depth, targetMarket) — verificato
 * per ciascuno di essi contro https://ref.gs1.org/voc/ (v1.16). La struttura stessa di una
 * gerarchia di imballo multilivello (unità base/consumer/orderable/despatch/invoice, quantità
 * contenuta nel livello superiore) è però un concetto specifico di sincronizzazione GDSN che il
 * Web Vocabulary — pensato per la pubblicazione di singole pagine prodotto, non per l'intero
 * scambio B2B GDSN — non copre affatto: nessun termine gs1:isTradeItem*, gs1:quantityContained
 * o equivalente esiste nel vocabolario ufficiale. Per questi attributi si propone qui
 * un'estensione italiana con prefisso gs1it: (namespace fittizio ma coerente, sotto il dominio
 * reale di GS1 Italy), chiaramente distinta dai termini gs1: ufficiali.
 */
export function buildGdsnWebVocabJson(gdsn: GdsnInfo): object {
  const targetMarket = {
    '@type': 'gs1:TargetMarketDetails',
    'gs1:targetMarketCountries': [{ '@type': 'gs1:Country', 'gs1:countryCode': gdsn.targetMarket }],
  };

  const hierarchy = gdsn.hierarchy.map((item) => {
    // Per 3 prodotti la "netWeight" della gerarchia esprime in realtà un volume o un conteggio
    // (330 ml di birra, 5 L di olio, 40 pz di cerotti): stessa distinzione già applicata al
    // livello prodotto in rawGs1Data, gs1:netContent invece di gs1:netWeight.
    const isVolumeOrCount = /\b(ml|l|pz)$/i.test((item.netWeight ?? '').trim());
    const netWeightValue = quantitativeValue(item.netWeight);
    const dims = parseDimensions(item.dimensions);

    const node: Record<string, unknown> = {
      '@type': 'gs1:Product',
      'gs1it:packagingLevel': item.level,
      gtin: item.gtin,
      'gs1:packagingType': item.packagingTypeCode,
      'gs1it:packagingTypeLabel': item.packagingTypeLabel,
    };
    if (netWeightValue) node[isVolumeOrCount ? 'gs1:netContent' : 'gs1:netWeight'] = netWeightValue;
    const grossWeightValue = quantitativeValue(item.grossWeight);
    if (grossWeightValue) node['gs1:grossWeight'] = grossWeightValue;
    if (dims.height) node['gs1:inPackageHeight'] = dims.height;
    if (dims.width) node['gs1:inPackageWidth'] = dims.width;
    if (dims.depth) node['gs1:inPackageDepth'] = dims.depth;
    if (item.quantityContained) node['gs1it:quantityContained'] = item.quantityContained;
    if (item.containedLevel) node['gs1it:containedLevel'] = item.containedLevel;
    node['gs1it:isBaseUnit'] = item.isBaseUnit;
    node['gs1it:isConsumerUnit'] = item.isConsumerUnit;
    node['gs1it:isOrderableUnit'] = item.isOrderableUnit;
    node['gs1it:isDespatchUnit'] = item.isDespatchUnit;
    node['gs1it:isInvoiceUnit'] = item.isInvoiceUnit;
    return node;
  });

  return {
    '@context': {
      gs1: 'https://ref.gs1.org/voc/',
      gs1it: 'https://gs1it.org/voc/',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      '@vocab': 'https://ref.gs1.org/voc/',
    },
    '@type': 'gs1it:TradeItemHierarchy',
    'gs1:targetMarket': targetMarket,
    'gs1it:dataPool': gdsn.dataPool,
    'gs1it:lastModified': gdsn.lastModified,
    'gs1it:tradeItemHierarchy': hierarchy,
  };
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
    const product = this.products.find(p => p.gtin === gtin);
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