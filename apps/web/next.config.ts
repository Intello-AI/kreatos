import type { NextConfig } from "next"
import { withEve } from "eve/next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Los adjuntos del chat de marca (fotos/logos) viajan por server action
      // a Storage; el default de 1 MB no alcanza ni para una foto de celular.
      bodySizeLimit: "25mb",
    },
  },
}

// Monta el agente eve (apps/commercial) en esta app Next: un solo dev server
// y un solo deploy en Vercel. Las rutas /eve/v1/* se sirven desde el mismo origin.
export default withEve(nextConfig, {
  eveRoot: "../commercial",
})
