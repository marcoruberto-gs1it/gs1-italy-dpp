FROM node:22-slim

# better-sqlite3 compila un binding nativo all'installazione.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install tsx --no-save

COPY src ./src
COPY tsconfig.json ./

RUN mkdir -p /data
VOLUME /data
ENV REGISTRY_DB_PATH=/data/registry.sqlite

EXPOSE 4310
CMD ["npx", "tsx", "src/server.ts"]
