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
}

export const DPP_LINK_TYPES: readonly DppLinkType[] = [
  { id: 'dpp', curie: 'gs1:dpp', icon: 'shield-check' },
  { id: 'pip', curie: 'gs1:pip', icon: 'tag' },
  { id: 'sustainabilityInfo', curie: 'gs1:sustainabilityInfo', icon: 'leaf' },
  { id: 'certificationInfo', curie: 'gs1:certificationInfo', icon: 'award' },
  { id: 'safetyInfo', curie: 'gs1:safetyInfo', icon: 'alert-triangle' },
  { id: 'instructions', curie: 'gs1:instructions', icon: 'wrench' },
  { id: 'masterData', curie: 'gs1:masterData', icon: 'braces' },
  { id: 'traceability', curie: 'gs1:traceability', icon: 'truck' },
  { id: 'registryEntry', curie: 'gs1:registryEntry', icon: 'hash' },
];

/** Destinazione (routerLink + queryParams) della pagina di un link type. Stessa sintassi del
 * resolver GS1: l'URL base del prodotto più `?linkType=gs1:xxx` — `/01/{gtin}?linkType=gs1:
 * sustainabilityInfo` — invece di percorsi inventati. Il resolver CE accoda già da solo
 * `?linkType=<curie>` a ogni destinazione registrata, quindi la stessa URL base va bene per tutti
 * (vedi registry-api/src/resolverClient.ts). Fa eccezione gs1:pip, la scheda informazioni
 * consumer-facing, che ha la sua pagina `/product-info/{gtin}`. */
export function linkTypeRoute(id: DppLinkTypeId, gtin: string): { commands: string[]; queryParams: Record<string, string> | null } {
  if (id === 'pip') return { commands: ['/product-info', gtin], queryParams: null };
  if (id === 'dpp') return { commands: ['/01', gtin], queryParams: null };
  return { commands: ['/01', gtin], queryParams: { linkType: linkTypeById(id).curie } };
}

/** Il link type di sezione richiesto dal parametro `linkType` (`gs1:sustainabilityInfo`), o null
 * per `gs1:dpp`, `all`, valori sconosciuti e assenza del parametro: in tutti quei casi si mostra il
 * passaporto. */
export function linkTypeFromParam(value: string | null | undefined): DppLinkType | null {
  const lt = DPP_LINK_TYPES.find((t) => t.curie === value);
  return lt && lt.id !== 'dpp' && lt.id !== 'pip' ? lt : null;
}

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
  if (/dosagg|istruzion|manutenz|ricambi|ripara|garanzia|uso |repair|spare|warranty|instruction|dosage/.test(k)) return 'instructions';
  if (/carbon|co₂|co2|ricicl|fine vita|end of life|biodegrad|imballagg|packag|emission|acqua|water|energia|energy|efficienza|rumor|noise|recycl/.test(k))
    return 'sustainabilityInfo';
  return 'masterData';
}
