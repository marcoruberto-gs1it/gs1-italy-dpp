/*
 * Copyright 2026 UCP Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState } from "react";

type Theme = "light" | "dark";

/**
 * Selettore tema, gemello di quello del catalogo (src/app/services/theme.service.ts).
 *
 * Usa la stessa chiave di localStorage e lo stesso attributo `data-theme` letto dai token
 * CSS: essendo sullo stesso dominio, chi sceglie il tema qui lo ritrova sul sito e
 * viceversa. Lo stato iniziale è già stato calcolato dallo script inline in index.html —
 * qui lo si rilegge dal DOM invece di ricalcolarlo, per non rischiare di dissentire.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () =>
      (document.documentElement.getAttribute("data-theme") as Theme) || "light"
  );

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("gs1-theme", next);
    } catch {
      /* localStorage non disponibile: la scelta vale solo per questa sessione */
    }
  };

  const label =
    theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

/**
 * Header del catalogo, replicato qui.
 *
 * La chat vive su /assistente dello stesso dominio del sito: per l'utente deve essere una
 * sezione del catalogo, non un'applicazione a parte. Logo e voci di menu sono gli stessi di
 * src/app/app.html (tenerli allineati a mano quando cambiano lì), e i link riportano alle
 * pagine Angular con un page load normale (sono due applicazioni diverse dietro lo stesso
 * Traefik).
 */
function Header() {
  return (
    <header className="chat-header">
      <div className="chat-header-inner">
        <a className="logo" href="/" title="Torna alla home">
          <span className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.5l1.85 6.15L20 10.5l-6.15 1.85L12 18.5l-1.85-6.15L4 10.5l6.15-1.85L12 2.5z"
                fill="url(#logoSpark)"
              />
              <defs>
                <linearGradient id="logoSpark" x1="4" y1="2.5" x2="20" y2="18.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--brand)" />
                  <stop offset="1" stopColor="var(--brand-accent)" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="logo-text">Catalogo Smart</span>
        </a>

        <nav>
          <a href="/">Home</a>
          <a href="/assistente/" className="active">
            Assistente AI
          </a>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

export default Header;
