import './env.ts';
import express from 'express';

import { loginHandler, logoutHandler, requireAuth } from './auth.ts';
import { pingMockRegistry } from './mockRegistryClient.ts';
import { dppRouter } from './routes/dpp.ts';
import { publicRouter } from './routes/public.ts';

const app = express();
app.use(express.json());

// Nessun CORS da configurare: in sviluppo Angular vi arriva tramite proxy.conf.json (stessa
// origine agli occhi del browser), in produzione tramite lo stesso Traefik del resto del sito
// (vedi PathPrefix('/registry-api') in docker-compose.yml) — mai una chiamata cross-origin reale.

// Traefik non toglie il prefisso: le rotte vivono qui SOTTO /registry-api, non a radice —
// sia in produzione (dietro Traefik) sia in sviluppo (proxy.conf.json inoltra il percorso
// così com'è, senza riscriverlo).
const base = express.Router();
base.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Chiamato dal frontend all'apertura della sezione admin (vedi admin.ts) per risvegliare in
// anticipo mock-eu-registry — pubblico apposta (nessun requireAuth): serve solo a scaldare un
// container Render prima ancora del login, non espone né richiede dati. Risponde subito, non
// aspetta l'esito del ping (vedi pingMockRegistry): il chiamante non deve aspettare fino a un
// minuto solo per aver aperto la pagina.
base.get('/warmup', (_req, res) => {
  pingMockRegistry();
  res.status(202).json({ ok: true });
});
base.post('/login', loginHandler);
base.post('/logout', logoutHandler);
base.use('/public', publicRouter);
base.use('/dpp', requireAuth, dppRouter);

app.use('/registry-api', base);

const port = Number(process.env.PORT) || 4310;
app.listen(port, () => {
  console.log(`registry-api in ascolto su http://localhost:${port}`);
});
