# Funzionalità del catalogo

Catalogo Smart è un catalogo prodotti dimostrativo (Angular 22, SSR/prerendering) che mette in
mostra come un e-commerce reale possa pubblicare dati leggibili sia da persone sia da motori di
ricerca e agenti AI, usando gli standard GS1 come base. Per l'uso specifico degli standard GS1,
vedi [GS1-STANDARDS.md](./GS1-STANDARDS.md).

## Catalogo e ricerca

- Home page con la griglia dei prodotti disponibili.
- Ricerca istantanea (comando `/` o icona lente) su nome, marchio, GTIN e settore, con
  navigazione da tastiera (frecce, invio, esc).
- Ogni card prodotto è un link vero (`<a>`), raggiungibile da tastiera e indicizzabile da un
  crawler — non un `<div>` con un click handler.

## Scheda prodotto (`/01/{gtin}`)

- **In evidenza**: badge "a colpo d'occhio" sotto il titolo (biologico, vegano, claim "senza
  X" quando dichiarato in etichetta, gradazione alcolica, prima certificazione) e una striscia
  con 3-4 fatti chiave (energia, conservazione, origine, formato confezione).
- **Prezzo e acquisto**: se il prodotto ha un prezzo tracciato, una scheda mostra prezzo, prezzo
  per kg/l dove applicabile, disponibilità e un link alla pagina ufficiale del prodotto (sito
  del produttore/brand, o l'e-commerce del distributore per i prodotti a marchio privato).
- **Sezioni a fisarmonica**, chiuse di default, ognuna popolata solo se il dato esiste
  davvero per quel prodotto:
  - Ingredienti
  - Allergeni — "Contiene: …" / "Può contenere: …" in forma di frase, non un badge per
    allergene: un'etichetta reale non elenca mai gli allergeni assenti, solo quelli
    presenti o possibili.
  - Valori nutrizionali (per 100g/100ml, con energia in kJ e kcal)
  - Caratteristiche (claim dietetici, biologico, gradazione alcolica)
  - Conservazione
  - Confezione e riciclo (tipo, peso, dimensioni, materiali)
  - Certificazioni
  - Produttore e assistenza clienti, con link alla pagina del brand owner (vedi sotto)
  - Dati strutturati — apre un pannello con il JSON-LD del prodotto, evidenziato e copiabile
- Galleria immagini con miniature (quando un prodotto ne ha più di una).

## Pagine brand (`/414/{gln}`)

Ogni prodotto è collegato all'organizzazione che possiede il prefisso GS1 con cui è stato
generato il suo GTIN (il "brand owner", non sempre lo stesso stabilimento che lo confeziona).
La pagina mostra il GLN, il sito web dell'organizzazione e l'elenco dei prodotti del catalogo
riconducibili a quel GLN. Vedi [GS1-STANDARDS.md](./GS1-STANDARDS.md#gln--pagine-brand) per
come sono stati costruiti questi identificativi.

## Dati strutturati e canali machine-readable

- JSON-LD (schema.org + GS1 Web Vocabulary) incorporato in ogni pagina prodotto e brand.
- **Content negotiation**: una richiesta a `/01/{gtin}` con header `Accept: application/ld+json`
  riceve il JSON-LD puro invece della pagina HTML (vedi `webshop/nginx.conf`) — stesso URL,
  stessa risorsa, due rappresentazioni.
- `/catalog` — elenco leggero di tutti i prodotti (gtin, nome, marchio, prezzo, categoria,
  immagine, descrizione), pensato per un agente che deve sapere cosa esiste prima di aprire le
  singole schede.
- `sitemap.xml`, `robots.txt` (con policy esplicite per i principali crawler AI), `llms.txt` e
  `llms-full.txt` ([llmstxt.org](https://llmstxt.org)), `.well-known/agent-skills/index.json`.

## SEO

- Meta tag Open Graph e Twitter Card completi su ogni pagina (titolo, descrizione, url,
  immagine dove disponibile).
- `BreadcrumbList` e `WebSite`/`Organization` in JSON-LD, oltre allo schema del prodotto/brand.
- Canonical dinamico per rotta, sitemap che include sia le schede prodotto sia le pagine brand.
- Nessuna pagina "soft 404": un URL inesistente risponde davvero 404, non una shell vuota con
  status 200 (importante per un crawler, che altrimenti indicizzerebbe pagine infinite e
  identiche).

## Accessibilità

- Skip-link per saltare la navigazione ripetuta a ogni pagina.
- Intestazioni semantiche (`<h2>`) sulle sezioni dell'accordion, non solo bottoni stilizzati.
- Contrasto colori verificato a livello WCAG AA (testo secondario, badge di stato).
- Focus visibile su tutti gli elementi interattivi, incluso il campo di ricerca.
- Menu mobile e ricerca con semantica da dialog (`role="dialog"`, `aria-modal`) e chiusura con
  Esc.

## Tema chiaro/scuro

Segue l'impostazione di sistema finché l'utente non sceglie esplicitamente un tema (poi la
scelta viene ricordata). Il tema corretto è applicato prima del primo paint, senza sfarfallio,
anche quando il sistema è impostato su scuro.

## Localizzazione

Interfaccia in italiano/inglese. I dati di prodotto restano in italiano dove non esiste una
fonte ufficiale per la traduzione inglese (nessun dato mancante viene inventato in nessuna
lingua).
