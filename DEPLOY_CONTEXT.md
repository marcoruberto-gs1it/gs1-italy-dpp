# Contesto progetto: migrazione e-commerce simulato (Angular) da GitHub Pages a droplet DigitalOcean

## Obiettivo

Attualmente esiste un progetto Angular che simula un e-commerce. Al push su GitHub,
una GitHub Action builda il progetto (build statica/prerenderata, HTML puro — serve
proprio l'HTML e non il bundle JS, perché queste pagine devono poter essere lette e
parsate da un agente AI) e lo pubblica su GitHub Pages.

**Nuovo obiettivo**: spostare il deploy da GitHub Pages a un droplet DigitalOcean,
in un unico `docker-compose` che contiene:

1. **webshop** — il progetto Angular buildato (HTML statico), servito da nginx.
2. **agent** — un servizio FastAPI che simula l'agente AI che leggerà/parserà le
   pagine dell'e-commerce mockato.
3. **caddy** — reverse proxy con TLS automatico (Let's Encrypt) davanti a entrambi.

Il droplet parte pulito: questo compose sarà l'unico servizio che ci girerà sopra.
Non esiste ancora nessun reverse proxy configurato in precedenza.

## Decisioni già prese

- **Deploy**: build direttamente sul droplet via SSH (no registry/GHCR). L'azione
  GitHub fa `git pull` + `docker compose up -d --build` sul droplet via SSH.
- **Reverse proxy**: Caddy, scelto per la gestione automatica dei certificati TLS
  (Let's Encrypt) senza configurazione manuale.
- **Rete Docker**: `webshop` e `agent` comunicano su una rete interna Docker
  (`http://webshop`, `http://agent:8000`), non serve esporli pubblicamente se non
  tramite Caddy.
- **Build Angular**: si assume che il progetto usi prerendering/SSG (dato che oggi
  finisce su GitHub Pages, che serve solo statico). Sul droplet basta nginx che
  serve la cartella `dist/<nome-progetto>/browser`; non serve Node/SSR runtime,
  a meno di scoperte diverse durante l'implementazione.

## Punto ancora aperto (da chiedere all'utente prima di procedere con Caddy/TLS)

- **Dominio**: non è ancora chiaro se l'utente ha già un dominio/sottodominio da
  puntare al droplet, o se per ora lavorerà solo su IP pubblico. Se lavora solo su
  IP, il Caddyfile deve essere semplificato (niente TLS automatico su IP nudo,
  usare Caddy in modalità solo-HTTP oppure servire direttamente senza Caddy).
  **Chiedere questo prima di configurare Caddy definitivamente.**

## Struttura repo prevista

```
/opt/ecommerce-sim/
├── docker-compose.yml
├── Caddyfile
├── webshop/
│   ├── Dockerfile
│   └── nginx.conf
└── agent/
    ├── Dockerfile
    └── main.py (FastAPI)
```

## docker-compose.yml (bozza di partenza)

```yaml
services:
  webshop:
    build: ./webshop
    restart: unless-stopped
    networks: [internal]

  agent:
    build: ./agent
    environment:
      - WEBSHOP_URL=http://webshop:80
    restart: unless-stopped
    networks: [internal]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks: [internal]
    depends_on:
      - webshop
      - agent

networks:
  internal:

volumes:
  caddy_data:
  caddy_config:
```

## Dockerfile webshop (multi-stage)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production
# se il progetto usa prerendering esplicito:
# RUN npx ng run <project>:prerender

FROM nginx:alpine
COPY --from=build /app/dist/<nome-progetto>/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## nginx.conf (webshop)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }
}
```

## Caddyfile (bozza — da adattare in base a dominio vs IP)

```
shop.tuodominio.it {
    reverse_proxy webshop:80
}

agent.tuodominio.it {
    reverse_proxy agent:8000
}
```

## GitHub Action (sostituisce l'attuale deploy su GitHub Pages)

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to droplet
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_HOST }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.DROPLET_SSH_KEY }}
          script: |
            cd /opt/ecommerce-sim
            git pull
            docker compose up -d --build webshop agent
```

Note:
- Servono i secrets `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` nel repo GitHub.
- La action attuale (probabilmente basata su `actions/deploy-pages@v4` o simile) va
  rimossa/sostituita da questa.

## Setup iniziale del droplet (una tantum, da eseguire manualmente o guidare l'utente)

```bash
# installa docker + compose plugin
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# firewall
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable

# clona repo
mkdir -p /opt/ecommerce-sim && cd /opt/ecommerce-sim
git clone <repo-url> .

# chiave SSH dedicata per la Action:
# generare una coppia di chiavi, metterne la privata in secrets.DROPLET_SSH_KEY
# su GitHub, e la pubblica in ~/.ssh/authorized_keys sul droplet
```

## Step successivi per Claude Code

1. Verificare la struttura reale del progetto Angular (nome del progetto, se usa
   già prerendering/SSG o se va configurato, output path esatto di `ng build`).
2. Creare/adattare `webshop/Dockerfile` e `webshop/nginx.conf` in base alla
   struttura reale.
3. Creare lo scaffold minimo del servizio `agent` (FastAPI) che, per ora, farà
   semplicemente richieste HTTP a `webshop` (mock di un agente che "legge"
   l'e-commerce) — dettagli funzionali dell'agente da definire con l'utente.
4. Chiedere all'utente se ha un dominio da puntare al droplet o se per ora lavora
   su IP nudo, e configurare il Caddyfile di conseguenza.
5. Scrivere il `docker-compose.yml` definitivo e testarlo in locale prima del
   deploy sul droplet.
6. Sostituire la GitHub Action esistente (deploy su Pages) con la nuova action
   SSH-based, verificando i secrets necessari.
7. Guidare l'utente nel setup iniziale del droplet (Docker, firewall, clone repo,
   chiave SSH) se non già fatto.
8. Fare un primo deploy di prova end-to-end e verificare che `agent` riesca a
   raggiungere `webshop` sulla rete interna Docker.
