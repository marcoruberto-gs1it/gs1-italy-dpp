# Catalogo Smart

Angular 22 (SSR) product catalogue: browse products, search, open a product page.

11 real products (GS1 Immagino data), GTINs resolvable via GS1 Digital Link
(`/01/{gtin}`, `/414/{gln}`).

See [docs/FEATURES.md](docs/FEATURES.md) for what the catalogue does and
[docs/GS1-STANDARDS.md](docs/GS1-STANDARDS.md) for how GS1 Digital Link, GTIN, GLN and the GS1
Web Vocabulary are used.

## Features

- Product catalogue with search
- Product pages with price/offer, GS1 Web Vocabulary JSON-LD, and brand owner pages (GLN)
- Content negotiation: `Accept: application/ld+json` on a product page returns pure JSON-LD
- IT/EN localization

## Stack

Angular 22 (standalone, signals, SSR/prerendering), TypeScript.

## Development

```bash
npm install
npm start        # http://localhost:4200
npm run build
npm test
```

## Deploy

Docker Compose (Traefik + this app + the AI assistant services), see `docker-compose.yml` and `webshop/Dockerfile`.

## Structure

```
src/app/
  pages/       home, product, brand
  components/  search-palette, star-rating, icon, json-ld-drawer
  services/    product, language, i18n, structured-data, site-origin
  data/        products.json, products.en.ts, sectors.ts
  i18n/        IT/EN dictionary
```
