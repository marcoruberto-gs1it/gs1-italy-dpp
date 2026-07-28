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
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    // L'app non vive alla radice: Traefik le assegna /assistente sullo stesso dominio del
    // webshop (vedi docker-compose.yml), cosi' la chat e il sito condividono l'origine e non
    // serve alcuna configurazione CORS. Il proxy /api qui sotto resta registrato alla radice
    // ed e' indipendente dal base: il fetch("/api") di App.tsx continua a funzionare.
    base: "/assistente/",
    server: {
      port: 3000,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: process.env.VITE_PROXY_TARGET || "http://localhost:10999",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          secure: false,
        },
      },
    },
    plugins: [react()],
    define: {},
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
