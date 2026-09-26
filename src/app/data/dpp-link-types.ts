import type { IconName } from '../components/icon/icon';

/**
 * Link type del GS1 Web Vocabulary (https://ref.gs1.org/voc/, sottoproprietà di gs1:linkType)
 * con cui questo sito espone le sezioni di un DPP. Solo termini che esistono davvero nel
 * vocabolario ufficiale (verificati su gs1/WebVoc v1.16): NON esistono "gs1:packagingInfo" né
 * "gs1:recyclingInfo" / "gs1:repairInfo" — imballaggio e riciclo rientrano in
 * gs1:sustainabilityInfo ("Sustainability and recycling"), istruzioni d'uso/manutenzione in
 * gs1:instructions. Lo stesso elenco (con la stessa classificazione) è duplicato in
 * registry-api/src/linkTypes.ts per registrare i link sul resolver — due servizi separati,
 * stesso contratto tenuto a mano, come DppRecord.
 */
export type DppLinkTypeId =
  | 'dpp'
  | 'pip'
  | 'sustainabilityInfo'
  | 'certificationInfo'
  | 'safetyInfo'
  | 'instructions'
  | 'masterData'
  | 'traceability'
  | 'registryEntry';

export interface DppLinkType {
  id: DppLinkTypeId;
  /** CURIE usato nel resolver: `?linkType=gs1:xxx`. */
  curie: string;
  icon: IconName;
  /** Ancora della sezione nella pagina passaporto (`/01/:gtin#section-xxx`). */
  anchor: string;
}

export const DPP_LINK_TYPES: readonly DppLinkType[] = [
  { id: 'dpp', curie: 'gs1:dpp', icon: 'shield-check', anchor: 'section-dpp' },
  { id: 'pip', curie: 'gs1:pip', icon: 'tag', anchor: 'section-pip' },
  { id: 'sustainabilityInfo', curie: 'gs1:sustainabilityInfo', icon: 'leaf', anchor: 'section-sustainabilityInfo' },
  { id: 'certificationInfo', curie: 'gs1:certificationInfo', icon: 'award', anchor: 'section-certificationInfo' },
  { id: 'safetyInfo', curie: 'gs1:safetyInfo', icon: 'alert-triangle', anchor: 'section-safetyInfo' },
  { id: 'instructions', curie: 'gs1:instructions', icon: 'wrench', anchor: 'section-instructions' },
  { id: 'masterData', curie: 'gs1:masterData', icon: 'braces', anchor: 'section-masterData' },
  { id: 'traceability', curie: 'gs1:traceability', icon: 'truck', anchor: 'section-traceability' },
  { id: 'registryEntry', curie: 'gs1:registryEntry', icon: 'hash', anchor: 'section-registryEntry' },
];

export function linkTypeById(id: DppLinkTypeId): DppLinkType {
  return DPP_LINK_TYPES.find((lt) => lt.id === id)!;
}

/** Sezioni alimentate dagli attributi liberi della scheda (chiavi in italiano/inglese scelte
 * dall'operatore, es. "impronta di carbonio (kg CO₂e)"). Le altre sono strutturali. */
export type AttributeLinkTypeId = 'sustainabilityInfo' | 'certificationInfo' | 'safetyInfo' | 'instructions' | 'masterData';

/** Assegna un attributo alla sezione/link type che lo descrive, guardando la SOLA chiave
 * (mai il valore). Ordine = priorità: un attributo finisce nella prima categoria che lo
 * riconosce, altrimenti resta nei dati anagrafici del prodotto (gs1:masterData). */
export function classifyAttribute(key: string): AttributeLinkTypeId {
  const k = key.toLowerCase();
  if (/certific|ecolabel|oeko|gots|\bce\b|\biso\b|marchio|label/.test(k)) return 'certificationInfo';
  if (/fuoco|sicurezz|pericol|tossic|infiamm|aderenza|safety|fire|grip|hazard/.test(k)) return 'safetyInfo';
  if (/dosagg|istruzion|manutenz|ricambi|riparab|garanzia|uso |repair|spare|warranty|instruction|dosage/.test(k)) return 'instructions';
  if (/carbon|co₂|co2|riciclat|riciclab|biodegrad|imballagg|packag|emission|acqua|water|energia|energy|efficienza|rumor|noise|recycl/.test(k))
    return 'sustainabilityInfo';
  return 'masterData';
}
