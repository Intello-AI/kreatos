const GITHUB_API = "https://api.github.com"

export interface GithubEnv {
  token: string
  org: string
  templateRepo: string
}

export function getGithubEnv(): GithubEnv {
  const token = process.env.GITHUB_TOKEN
  const org = process.env.GITHUB_ORG
  const templateRepo = process.env.SITE_TEMPLATE_REPO
  if (!token || !org || !templateRepo) {
    throw new Error(
      "Faltan GITHUB_TOKEN, GITHUB_ORG o SITE_TEMPLATE_REPO en el entorno. Agrégalas a apps/commercial/.env.local (ver .env.example).",
    )
  }
  return { token, org, templateRepo }
}

async function githubFetch(
  env: GithubEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
}

/** Lee un archivo de texto del repo (contents API, raw) en un ref dado. */
export async function getRepoFileText(
  fullName: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const env = getGithubEnv()
  const res = await githubFetch(
    env,
    `/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    { headers: { Accept: "application/vnd.github.raw+json" } },
  )
  if (!res.ok) return null
  return res.text()
}

/**
 * Crea el repo del cliente con "Generate from template" y espera a que el
 * contenido esté disponible (la generación es asíncrona en GitHub).
 * Idempotente: si el repo ya existe, lo devuelve.
 */
export async function createRepoFromTemplate(
  slug: string,
): Promise<{ repoUrl: string; fullName: string; alreadyExisted: boolean }> {
  const env = getGithubEnv()
  const fullName = `${env.org}/${slug}`

  const existing = await githubFetch(env, `/repos/${fullName}`)
  if (existing.ok) {
    const repo = (await existing.json()) as { html_url: string }
    return { repoUrl: repo.html_url, fullName, alreadyExisted: true }
  }

  const res = await githubFetch(
    env,
    `/repos/${env.org}/${env.templateRepo}/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        owner: env.org,
        name: slug,
        private: true,
        include_all_branches: false,
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Generate from template falló (${res.status}): ${body}`)
  }
  const repo = (await res.json()) as { html_url: string }

  // Poll hasta que el contenido del repo generado esté listo (máx ~30s).
  for (let attempt = 0; attempt < 15; attempt++) {
    const check = await githubFetch(env, `/repos/${fullName}/contents/package.json`)
    if (check.ok) return { repoUrl: repo.html_url, fullName, alreadyExisted: false }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(
    `El repo ${fullName} se creó pero su contenido no estuvo disponible tras 30s.`,
  )
}

/** URL de clone con token embebido — SOLO para uso en dev (backend docker sin brokering). */
export function getAuthenticatedCloneUrl(fullName: string): string {
  const env = getGithubEnv()
  return `https://x-access-token:${env.token}@github.com/${fullName}.git`
}

/** Merge de una rama a main vía API (publicación). Devuelve el sha del merge
 *  commit (null si ya estaba mergeado) para esperar SU deployment exacto. */
export async function mergeBranchToMain(
  fullName: string,
  branch: string,
): Promise<{ mergeSha: string | null }> {
  const env = getGithubEnv()
  const res = await githubFetch(env, `/repos/${fullName}/merges`, {
    method: "POST",
    body: JSON.stringify({
      base: "main",
      head: branch,
      commit_message: `publish: merge ${branch} a main`,
    }),
  })
  // 204 = ya estaba mergeado (sin sha nuevo); 201 = merge creado.
  if (!res.ok && res.status !== 204) {
    const body = await res.text()
    throw new Error(`Merge de ${branch} a main falló (${res.status}): ${body}`)
  }
  if (res.status === 201) {
    const body = (await res.json()) as { sha?: string }
    return { mergeSha: body.sha ?? null }
  }
  return { mergeSha: null }
}
