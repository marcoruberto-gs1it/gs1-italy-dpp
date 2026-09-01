/*
 * Copyright 2026 UCP Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export class AppProperties {
  name: string;
  description: string;
  logoUrl: string;
  defaultMessage: string;
  titleText: string;

  constructor(
    name: string,
    description: string,
    logoUrl: string,
    defaultMessage: string,
    titleText: string
  ) {
    this.name = name;
    this.description = description;
    this.logoUrl = logoUrl;
    this.defaultMessage = defaultMessage;
    this.titleText = titleText;
  }
}

export const appConfig = new AppProperties(
  "Smart Catalogue Assistant",
  "Assistente per lo shopping nel Catalogo Smart.",
  // L'app e' servita sotto /assistente/ (vedi base in vite.config.ts): il logo va risolto
  // rispetto a quel base, altrimenti /images/logo.jpg finirebbe sul webshop.
  `${import.meta.env.BASE_URL}images/logo.jpg`,
  "Ciao! Posso cercare prodotti nel catalogo e rispondere su ingredienti, allergeni, valori nutrizionali e materiali leggendo le schede prodotto. Posso anche completare l'ordine per te. Come posso aiutarti?",
  // Stesso titolo della pagina /assistente del catalogo (i18n it → chat.title): per
  // l'utente è quella pagina, diventata conversazione vera.
  "Assistente AI del catalogo"
);
