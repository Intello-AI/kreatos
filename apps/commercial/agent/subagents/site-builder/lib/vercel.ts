const VERCEL_API = "https://api.vercel.com"

interface VercelEnv {
  token: string
  teamId: string | null
}

function getVercelEnv(): VercelEnv {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    throw new Error(
      "Falta VERCEL_TOKEN en el entorno. Agrégala a apps/commercial/.env.local (ver .env.example).",
    )
  }
  return { token, teamId: process.env.VERCEL_TEAM_ID ?? null }
}

function withTeam(env: VercelEnv, path: string): string {
  if (!env.teamId) return `${VERCEL_API}${path}`
  const sep = path.includes("?") ? "&" : "?"
  return `${VERCEL_API}${path}${sep}teamId=${env.teamId}`
}

async function vercelFetch(path: string, init?: RequestInit): Promise<Response> {
  const env = getVercelEnv()
  return fetch(withTeam(env, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
}

/**
 * Crea (o devuelve si ya existe) el proyecto Vercel ligado al repo GitHub del
 * cliente. Requiere la GitHub App de Vercel instalada en la org.
 */
export async function ensureVercelProject(input: {
  slug: string
  repoFullName: string
}): Promise<{ projectId: string; alreadyExisted: boolean }> {
  const existing = await vercelFetch(`/v9/projects/${input.slug}`)
  if (existing.ok) {
    const project = (await existing.json()) as { id: string }
    return { projectId: project.id, alreadyExisted: true }
  }

  const res = await vercelFetch(`/v11/projects`, {
    method: "POST",
    body: JSON.stringify({
      name: input.slug,
      framework: "nextjs",
      gitRepository: { type: "github", repo: input.repoFullName },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Creación de proyecto Vercel falló (${res.status}): ${body}`)
  }
  const project = (await res.json()) as { id: string }
  return { projectId: project.id, alreadyExisted: false }
}

export interface DeploymentStatus {
  state: "READY" | "ERROR" | "BUILDING" | "QUEUED" | "CANCELED" | "INITIALIZING"
  url: string | null
}

/** Último deployment del proyecto para un commit dado (o el más reciente). */
export async function getLatestDeployment(input: {
  projectId: string
  commitSha?: string
}): Promise<DeploymentStatus | null> {
  const res = await vercelFetch(
    `/v6/deployments?projectId=${input.projectId}&limit=5`,
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Lectura de deployments falló (${res.status}): ${body}`)
  }
  const data = (await res.json()) as {
    deployments: Array<{
      state: DeploymentStatus["state"]
      url: string
      meta?: { githubCommitSha?: string }
    }>
  }
  const deployments = data.deployments ?? []
  const match = input.commitSha
    ? deployments.find((d) => d.meta?.githubCommitSha === input.commitSha)
    : deployments[0]
  if (!match) return null
  return { state: match.state, url: match.url ? `https://${match.url}` : null }
}
