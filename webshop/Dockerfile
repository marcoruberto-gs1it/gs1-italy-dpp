# Build dell'app Angular e servizio dell'output prerenderizzato tramite nginx.
# Il build context è la root del repo (vedi docker-compose.yml), non questa cartella.
#
# Nota: il progetto è configurato con outputMode "server" + prerender, ma qui usiamo
# solo il bundle statico in dist/gs1-catalog/browser — esattamente ciò che veniva
# pubblicato su GitHub Pages. Nessun runtime Node/SSR in produzione.

FROM node:22-alpine AS build

WORKDIR /app

# .npmrc contiene legacy-peer-deps=true: senza di esso `npm ci` fallisce sul conflitto
# di peer dependency di angularx-qrcode (chiede @angular/common ^21, il progetto è su ^22).
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Letto da generate-seo-files.js (script postbuild) per scrivere sitemap.xml/robots.txt/llms.txt
# e per sostituire nell'HTML prerenderizzato il dominio segnaposto usato lato server.
ARG SITE_URL=http://localhost
ENV SITE_URL=${SITE_URL}

# `npm run build` esegue generate-routes.js + ng build, e npm invoca automaticamente
# il lifecycle `postbuild` (generate-seo-files.js).
RUN npm run build


FROM nginx:1.29-alpine

COPY --from=build /app/dist/gs1-catalog/browser /usr/share/nginx/html

# Template invece di conf.d/default.conf diretto: l'immagine ufficiale nginx sostituisce da
# sola, a ogni avvio del container (non a build time), ogni ${VAR} che corrisponde a una
# variabile d'ambiente realmente impostata — usato per instradare /registry-api (vedi
# webshop/nginx.conf) verso l'URL del servizio registry-api, diverso tra locale/Traefik e
# Render. Il default qui sotto vale per il docker-compose.yml locale, dove comunque non
# viene mai raggiunto (Traefik instrada /registry-api prima che arrivi a questo container).
COPY webshop/nginx.conf /etc/nginx/templates/default.conf.template
ENV REGISTRY_API_URL=http://registry-api:4310

EXPOSE 80
