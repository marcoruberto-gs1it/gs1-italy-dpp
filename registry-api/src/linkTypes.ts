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
  if (/dosagg|istruzion|manutenz|ricambi|riparab|garanzia|uso |repair|spare|warranty|instruction|dosage/.test(k)) return 'instructions';
  if (/carbon|co₂|co2|riciclat|riciclab|biodegrad|imballagg|packag|emission|acqua|water|energia|energy|efficienza|rumor|noise|recycl/.test(k))
    return 'sustainabilityInfo';
  return 'masterData';
}

/** Insieme dei link type "da attributi" che hanno almeno un attributo in questa scheda. */
export function attributeLinkTypes(attributes: Record<string, string>): Set<AttributeLinkTypeId> {
  return new Set(Object.keys(attributes ?? {}).map(classifyAttribute));
}
