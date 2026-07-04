import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

import { supabaseSession } from "../lib/supabase-auth";

export default eveChannel({
  auth: [
    // Usuarios del dashboard (browser): sesión de Supabase vía cookie,
    // restringida a cuentas @intelloai.com. Sustituye a placeholderAuth().
    supabaseSession(),
    // Server actions del dashboard y el eve TUI en Vercel (token OIDC).
    vercelOidc(),
    // Abierto en localhost para `eve dev` y el REPL; ignorado en producción.
    localDev(),
  ],
});
