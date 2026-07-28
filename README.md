# GS1 Digital Link Catalog

Angular 22 (SSR) demo catalog: a GTIN resolved via GS1 Digital Link opens traceability,
certifications, and structured data readable by search engines and AI agents.

63 fictional products (brand "GS1 Italy", company prefix `8032089`) across 6 sectors.

## Features

- GS1 Digital Link routing (`/01/:gtin`, `/10/:lot`, `/21/:serial`)
- JSON-LD in GS1 Web Vocabulary / schema.org, with an in-page viewer
- Digital Link validator (`/validatore`) using the real [GS1 Barcode Syntax Engine](https://github.com/gs1/gs1-syntax-engine) (WASM), plus camera QR scanning
- AI catalog assistant (`/assistente`)
- GDSN packaging hierarchy, EPCIS traceability, GS1 EDI order-to-cash examples
- IT/EN localization
- Runtime QR / GS1 DataMatrix generation

## Stack

Angular 22 (standalone, signals, SSR/prerendering), TypeScript, `gs1encoder`, `bwip-js`, `angularx-qrcode`, `qr-scanner`.

## Development

```bash
npm install
npm start        # http://localhost:4200
npm run build
npm test
```

## Deploy

Auto-deployed to GitHub Pages on push to `main`:
**https://marcoruberto-gs1it.github.io/gs1-italy-catalog/**

## Structure

```
src/app/
  pages/       home, sector, product, validator, chat
  components/  json-ld-drawer, digital-link-visualizer, search-palette, data-matrix
  services/    product, chat, language, i18n
  data/        products.json, products.en.ts, sectors.ts
  i18n/        IT/EN dictionary
```
