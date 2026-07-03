import type { NextConfig } from "next"
import { withEve } from "eve/next"

const nextConfig: NextConfig = {}

// Monta el agente eve (apps/commercial) en esta app Next: un solo dev server
// y un solo deploy en Vercel. Las rutas /eve/v1/* se sirven desde el mismo origin.
export default withEve(nextConfig, {
  eveRoot: "../commercial",
})
