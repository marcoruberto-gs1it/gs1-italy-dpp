# Catalogo Smart

Angular 22 (SSR) product catalogue: browse products, search, open a product page.

63 products across 6 categories (only Consumer Goods shown for now).

## Features

- Product catalogue with search
- Structured data (schema.org) on product pages, where published
- AI shopping assistant (`/assistente`)
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
  pages/       home, product
  components/  search-palette, star-rating, icon
  services/    product, language, i18n
  data/        products.json, products.en.ts, sectors.ts
  i18n/        IT/EN dictionary
```
