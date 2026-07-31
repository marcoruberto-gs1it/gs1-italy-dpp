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

/**
 * Header del catalogo, replicato qui.
 *
 * La chat vive su /assistente dello stesso dominio del sito: per l'utente deve essere una
 * sezione del catalogo, non un'applicazione a parte. Logo, badge demo e voci di menu sono
 * gli stessi di src/app/app.html, e i link riportano alle pagine Angular con un page load
 * normale (sono due applicazioni diverse dietro lo stesso Traefik).
 */
function Header() {
  return (
    <header className="chat-header">
      <div className="chat-header-inner">
        <a className="logo" href="/" title="Torna alla home">
          <img
            src="https://static.gs1it.org/static/images/logo/gs1it.1ea986161973.png"
            alt="GS1 Italy"
          />
          <span className="demo-badge">Demo</span>
        </a>

        <nav>
          <a href="/">Home</a>
          <a href="/validatore">Validatore</a>
          <a href="/assistente/" className="active">
            Assistente AI
          </a>
        </nav>
      </div>
    </header>
  );
}

export default Header;
