FROM nginx:1.29-alpine

# Template, non conf.d/default.conf diretto — vedi il commento in cima a nginx.conf e
# webshop/Dockerfile per lo stesso pattern già in uso nel resto del progetto. Context = questa
# stessa cartella (come i tre Dockerfile fratelli in resolver/*_server), non la radice del repo.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Default per il docker-compose.yml locale (qui comunque mai raggiunto: Traefik instrada
# id.localhost direttamente verso resolver-web/resolver-data-entry, senza passare da questo
# container — vedi il commento in cima a docker-compose.yml). Su Render, dove questo container
# è invece il vero e unico punto d'ingresso pubblico del resolver, questi due vanno sovrascritti
# con gli URL pubblici reali dei due servizi (vedi docs/RESOLVER-SETUP.md).
ENV RESOLVER_WEB_UPSTREAM=http://resolver-web:4000
ENV RESOLVER_DATA_ENTRY_UPSTREAM=http://resolver-data-entry:3000

EXPOSE 80
