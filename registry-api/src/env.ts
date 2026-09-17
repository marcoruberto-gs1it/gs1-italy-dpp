/**
 * Carica il `.env` della radice del repo — unico file, letto anche da `docker compose`
 * (vedi docker-compose.yml). Va importato per PRIMO in server.ts, prima di qualunque modulo
 * che legga process.env a livello di modulo (es. auth.ts): l'ordine di valutazione degli
 * import ES garantisce che questo file finisca di girare prima che i successivi vengano
 * valutati, solo se resta un import a sé con effetto collaterale — una chiamata a config()
 * dentro il corpo di server.ts arriverebbe troppo tardi.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
