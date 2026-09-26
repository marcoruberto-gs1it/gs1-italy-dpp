import './env.ts';
import express from 'express';

import { loginHandler, logoutHandler, requireAuth } from './auth.ts';
import { pingMockRegistry } from './mockRegistryClient.ts';
import { dppRouter } from './routes/dpp.ts';
import { publicRouter } from './routes/public.ts';
import { v1Router } from './routes/v1.ts';
import { resyncAllToResolver } from './resyncResolver.ts';
import { siteUrl } from './publicUrls.ts';
import { getTrace, traceMiddleware } from './trace.ts';
import { refreshStaticSeeds } from './refreshSeeds.ts';

const app = express();
// Di default express.json() analizza solo "application/json" — scarterebbe silenziosamente
// (req.body resta vuoto, 500 a valle) una PATCH inviata con "application/merge-patch+json", il
// media type RFC 7396 registrato apposta per il JSON Merge Patch che routes/v1.ts usa per
// UpdateDPPById. "application/ld+json" per lo stesso motivo su richieste che inviano direttamente
// un documento JSON-LD. Verificato dal vivo: senza questa lista, una richiesta identica a quella
// dell'esempio ufficiale BaSyx (Content-Type: application/merge-patch+json) falliva con 500, non
// con l'errore di validazione atteso.
app.use(express.json({ type: ['application/json', 'application/merge-patch+json', 'application/ld+json'] }));

// Nessun CORS da configurare: in sviluppo Angular vi arriva tramite proxy.conf.json (stessa
// origine agli occhi del browser), in produzione tramite lo stesso Traefik del resto del sito
// (vedi PathPrefix('/registry-api') in docker-compose.yml) — mai una chiamata cross-origin reale.

// Traefik non toglie il prefisso: le rotte vivono qui SOTTO /registry-api, non a radice —
// sia in produzione (dietro Traefik) sia in sviluppo (proxy.conf.json inoltra il percorso
// così com'è, senza riscriverlo).
const base = express.Router();
// Traccia delle chiamate uscenti di ogni richiesta (Auth0, registro UE, resolver): header
// X-Trace-Id sulla risposta, contenuto recuperabile da GET /trace/:id — vedi trace.ts.
base.use(traceMiddleware);
base.get('/trace/:id', (req, res) => {
  const trace = getTrace(req.params.id);
  if (!trace) {
    res.status(404).json({ error: 'traccia non trovata (le tracce restano in memoria solo per le ultime richieste)' });
    return;
  }
  res.json(trace);
});
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
// Autenticazione mista al suo interno (letture pubbliche, scritture protette con requireAuth
// applicato per singola rotta) — vedi il commento in cima a routes/v1.ts per il perché non può
// stare tutto dietro un requireAuth unico a livello di mount, come /dpp qui sopra.
base.use('/v1', v1Router);

app.use('/registry-api', base);

const port = Number(process.env.PORT) || 4310;
app.listen(port, () => {
  console.log(`registry-api in ascolto su http://localhost:${port}`);
  // Opt-in, in background e mai bloccanti per l'avvio (da togliere dalle env di Render dopo il
  // primo giro): RESEED_STATIC_ON_BOOT riallinea gli attributi dei 10 esempi statici a
  // seedData.ts (refreshSeeds.ts); RESYNC_RESOLVER_ON_BOOT — o il reseed stesso — ri-sincronizza
  // poi sul resolver tutte le schede pubblicate (resyncResolver.ts).
  const reseed = process.env.RESEED_STATIC_ON_BOOT === 'true';
  if (reseed || process.env.RESYNC_RESOLVER_ON_BOOT === 'true') {
    void (async () => {
      try {
        if (reseed) await refreshStaticSeeds();
        await resyncAllToResolver(siteUrl());
      } catch (err) {
        console.warn('reseed/resync all\'avvio fallito:', err);
      }
    })();
  }
});
