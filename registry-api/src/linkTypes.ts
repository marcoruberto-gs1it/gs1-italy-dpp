/**
 * Classificazione degli attributi liberi di un DPP per link type del GS1 Web Vocabulary —
 * duplicata da src/app/data/dpp-link-types.ts (stesso contratto tenuto a mano fra i due
 * servizi, come DppRecord). Serve a registrare sul resolver un link per ogni sezione che la
 * pagina passaporto mostra davvero: vedi buildLinksetDocument in resolverClient.ts. Solo termini
 * esistenti nel vocabolario ufficiale (gs1/WebVoc v1.16) — niente gs1:packagingInfo, che non c'è.
 */
export type AttributeLinkTypeId = 'sustainabilityInfo' | 'certificationInfo' | 'safetyInfo' | 'instructions' | 'masterData';

export function classifyAttribute(key: string): AttributeLinkTypeId {
  const k = key.toLowerCase();
  if (/certific|ecolabel|oeko|gots|\bce\b|\biso\b|marchio|label/.test(k)) return 'certificationInfo';
  if (/fuoco|sicurezz|pericol|tossic|infiamm|aderenza|safety|fire|grip|hazard/.test(k)) return 'safetyInfo';
  if (/dosagg|istruzion|manutenz|ricambi|ripara|garanzia|uso |repair|spare|warranty|instruction|dosage/.test(k)) return 'instructions';
  if (/carbon|co₂|co2|ricicl|fine vita|end of life|biodegrad|imballagg|packag|emission|acqua|water|energia|energy|efficienza|rumor|noise|recycl/.test(k))
    return 'sustainabilityInfo';
  return 'masterData';
}

/** Insieme dei link type "da attributi" che hanno almeno un attributo in questa scheda —
 * attributes è ormai nidificato per categoria (vedi db.ts#DppRecord.attributes: la classe
 * astratta DataElement collegata a DigitalProductPassport tramite una DataElementCollection
 * nominata), quindi qui si scorrono prima tutte le sotto-chiavi di ogni categoria. */
export function attributeLinkTypes(attributes: Record<string, Record<string, string>>): Set<AttributeLinkTypeId> {
  const keys = Object.values(attributes ?? {}).flatMap((fields) => Object.keys(fields ?? {}));
  return new Set(keys.map(classifyAttribute));
}

/** Raggruppa un oggetto piatto chiave→valore (demo/seed, o un payload esterno "di comodo") nella
 * forma nidificata canonica — ogni DataElementCollection è qui esattamente l'AttributeLinkTypeId
 * che la descrive (sustainabilityInfo/certificationInfo/safetyInfo/instructions/masterData),
 * così la stessa classificazione guida sia il resolver (link type con contenuto) sia la
 * struttura del JSON-LD pubblicato (jsonld.ts) — un solo concetto, non due paralleli. */
export function groupFlatAttributes(flat: Record<string, string>): Record<string, Record<string, string>> {
  const grouped: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(flat)) {
    const group = classifyAttribute(key);
    (grouped[group] ??= {})[key] = value;
  }
  return grouped;
}

/** I link type "di sezione": ognuno ha una pagina dedicata sul sito, raggiunta con
 * `/01/{gtin}?linkType=gs1:<id>` (stesso schema di src/app/data/dpp-link-types.ts#linkTypeRoute). */
export type SectionLinkTypeId = 'sustainabilityInfo' | 'certificationInfo' | 'safetyInfo' | 'instructions' | 'masterData' | 'traceability' | 'registryEntry';
