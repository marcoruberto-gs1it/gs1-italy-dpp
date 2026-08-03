/*
 * Sbarramento con password unica davanti all'assistente AI.
 *
 * Perché qui e non altrove: sia /assistente sia /api passano da questo dev server
 * (Traefik → Vite → business-agent), e il business-agent non ha un router pubblico.
 * Questo middleware è quindi l'unico passaggio obbligato, e proteggerlo protegge tutto.
 *
 * Proteggere /api conta quanto proteggere la pagina: senza, chiunque conosca il
 * protocollo A2A parlerebbe direttamente con l'agente consumando la quota Vertex — che
 * è esattamente ciò da cui questo sbarramento difende. Non ci sono dati sensibili in
 * gioco: è un cancello contro il consumo di token, non un sistema di autenticazione.
 *
 * Configurazione (variabili d'ambiente):
 *   CHAT_PASSWORD     la password. Se vuota o assente, il cancello è SPENTO (sviluppo).
 *   CHAT_AUTH_SECRET  segreto con cui si firma il cookie di sessione.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Connect } from "vite";

const COOKIE_NAME = "gs1_chat_auth";
const LOGIN_PATH = "/assistente/login";
/** Sessione lunga: è uno sbarramento, non una protezione di dati. */
const SESSION_DAYS = 30;

/** Confronto a tempo costante: due stringhe di lunghezza diversa non devono uscire prima. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // timingSafeEqual pretende buffer di pari lunghezza: si confronta comunque
    // qualcosa, per non trasformare la lunghezza in un canale laterale.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Il cookie non contiene la password: solo la scadenza e la sua firma. */
function issueToken(secret: string): string {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expiry}.${sign(String(expiry), secret)}`;
}

function isTokenValid(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  if (!expiry || !signature) return false;
  if (Number(expiry) < Date.now()) return false;
  return safeEqual(signature, sign(expiry, secret));
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Nessun motivo perché un form di login superi qualche centinaio di byte.
      if (body.length > 4096) body = body.slice(0, 4096);
    });
    req.on("end", () => resolve(body));
  });
}

function loginPage(error: string | null): string {
  return `<!doctype html>
<html lang="it" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Area riservata · Assistente AI GS1 Italy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<!-- Stessi token del catalogo: la schermata appartiene al sito, non è un dialog di sistema. -->
<link rel="stylesheet" href="/tokens.css">
<style>
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center;
         background:var(--bg-canvas); color:var(--text-primary); font-family:var(--font-sans); padding:24px; }
  .card { width:100%; max-width:400px; background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:var(--radius-lg); box-shadow:var(--shadow-md); padding:32px; }
  .logo { display:flex; align-items:center; gap:14px; margin-bottom:24px; }
  .logo img { height:34px; }
  .badge { font-size:.72rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--gs1-orange); }
  h1 { font-size:1.3rem; font-weight:800; letter-spacing:-.02em; margin:0 0 8px; }
  p  { margin:0 0 22px; color:var(--text-tertiary); font-size:.92rem; line-height:1.5; }
  label { display:block; font-size:.8rem; font-weight:700; margin-bottom:8px; color:var(--text-secondary); }
  input { width:100%; box-sizing:border-box; font-family:inherit; font-size:.95rem; padding:12px 14px;
          border-radius:var(--radius-md); border:1px solid var(--border-default);
          background:var(--bg-surface-sunken); color:var(--text-primary); }
  input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
  button { width:100%; margin-top:16px; padding:13px; border:none; cursor:pointer; font-family:inherit;
           font-size:.95rem; font-weight:700; border-radius:var(--radius-md);
           background:var(--gs1-blue); color:#fff; }
  button:hover { background:var(--accent-strong); }
  .error { margin:0 0 16px; padding:10px 12px; border-radius:var(--radius-sm); font-size:.86rem;
           background:var(--accent-2-soft); color:var(--gs1-orange); font-weight:600; }
  .back { display:block; margin-top:20px; text-align:center; font-size:.85rem;
          color:var(--text-tertiary); text-decoration:none; }
  .back:hover { color:var(--text-link); }
</style>
</head>
<body>
  <main class="card">
    <div class="logo">
      <img src="https://static.gs1it.org/static/images/logo/gs1it.1ea986161973.png" alt="GS1 Italy">
      <span class="badge">Demo</span>
    </div>
    <h1>Area riservata</h1>
    <p>L'assistente AI di questa demo è ad accesso limitato. Inserisci la password per continuare.</p>
    ${error ? `<p class="error">${error}</p>` : ""}
    <form method="POST" action="${LOGIN_PATH}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">Entra</button>
    </form>
    <a class="back" href="/">← Torna al catalogo</a>
  </main>
</body>
</html>`;
}

export function authGate(): Connect.NextHandleFunction {
  const password = process.env.CHAT_PASSWORD || "";
  const secret =
    process.env.CHAT_AUTH_SECRET || randomBytes(32).toString("hex");

  if (!password) {
    console.log("[auth-gate] CHAT_PASSWORD non impostata: accesso libero.");
    return (_req, _res, next) => next();
  }
  if (!process.env.CHAT_AUTH_SECRET) {
    // Senza segreto stabile le sessioni cadono a ogni riavvio del container.
    console.warn(
      "[auth-gate] CHAT_AUTH_SECRET non impostata: uso un segreto casuale, le sessioni non sopravvivono ai riavvii."
    );
  }
  console.log("[auth-gate] attivo su /assistente e /api.");

  return async (req, res, next) => {
    const url = req.url || "";

    if (isTokenValid(readCookie(req.headers.cookie, COOKIE_NAME), secret)) {
      return next();
    }

    if (req.method === "POST" && url.startsWith(LOGIN_PATH)) {
      const body = await readBody(req);
      const submitted = new URLSearchParams(body).get("password") || "";

      if (safeEqual(submitted, password)) {
        const secure = (req.headers["x-forwarded-proto"] || "") === "https";
        res.setHeader("Set-Cookie", [
          `${COOKIE_NAME}=${issueToken(secret)}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
          secure ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; "));
        res.statusCode = 302;
        res.setHeader("Location", "/assistente/");
        return res.end();
      }

      // Mai loggare il valore ricevuto.
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(loginPage("Password errata."));
    }

    // /api è una chiamata macchina: deve ricevere un errore, non una pagina HTML.
    if (url.startsWith("/api")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "authentication required" }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(loginPage(null));
  };
}
