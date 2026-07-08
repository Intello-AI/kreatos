"use client"

import {
  BroomIcon,
  ChartLineUpIcon,
  ClipboardTextIcon,
  CloudArrowUpIcon,
  FileTextIcon,
  GlobeIcon,
  ImagesIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StackIcon,
  TerminalWindowIcon,
  TranslateIcon,
  WrenchIcon,
} from "@phosphor-icons/react"

/**
 * ÚNICA fuente de labels/iconos/badges de tools para los monitores de
 * actividad (site-activity y chat-activity). Antes cada monitor tenía su copia
 * y los tools nuevos caían al fallback feo (nombre crudo + JSON). Al agregar
 * un tool al agente, agrégalo AQUÍ una vez.
 */

/** Labels amigables por tool; detail extrae lo útil del input. */
export const TOOL_LABELS: Record<
  string,
  {
    label: string
    detail?: (input: Record<string, unknown>) => string | undefined
  }
> = {
  // ── Brief / spec / dirección de arte ──────────────────────────────────
  get_site_brief: { label: "Leyendo brief, lead y referencias de diseño" },
  compose_spec: { label: "Componiendo el spec de diseño" },
  save_site_version: {
    label: "Guardando versión del spec",
    detail: (i) =>
      i["changelog"] ? String(i["changelog"]).slice(0, 100) : undefined,
  },
  view_reference_screenshots: { label: "Viendo referencias (visión)" },
  add_references: { label: "Agregando referencias de diseño" },
  update_site_status: {
    label: "Actualizando status",
    detail: (i) => (i["status"] ? `→ ${String(i["status"])}` : undefined),
  },

  // ── Infra del sitio ───────────────────────────────────────────────────
  // Idempotentes: verifican y crean SOLO si falta (alreadyExisted en el
  // output) — el label no debe prometer "creando" cuando casi siempre lee.
  create_site_repo: { label: "Asegurando repo GitHub (crea si falta)" },
  create_vercel_project: { label: "Asegurando proyecto en Vercel (crea si falta)" },
  clone_site_repo: { label: "Clonando repo en el sandbox" },
  reset_site_repo: { label: "Reseteando repo al template actual" },
  fetch_brand_assets: { label: "Descargando assets de marca" },

  // ── Materialización ───────────────────────────────────────────────────
  materialize_site: {
    label: "Materializando el sitio (pipeline)",
    detail: (i) => {
      const n = Array.isArray(i["sections"]) ? i["sections"].length : undefined
      return n ? `${n} secciones + superficies + QA` : undefined
    },
  },
  draft_surface: {
    label: "Escribiendo superficie",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  draft_section: {
    label: "Dibujando sección",
    detail: (i) =>
      i["component"]
        ? String(i["component"])
        : i["path"]
          ? String(i["path"])
          : undefined,
  },
  draft_sections: {
    label: "Dibujando secciones en paralelo",
    detail: (i) => {
      const n = Array.isArray(i["sections"]) ? i["sections"].length : undefined
      return n ? `${n} secciones` : undefined
    },
  },
  assemble_registry: { label: "Ensamblando registry de secciones" },
  translate_copy: {
    label: "Traduciendo copy",
    detail: (i) =>
      i["targetLocale"] ? `→ ${String(i["targetLocale"])}` : undefined,
  },

  // ── Verificación / QA / entrega ───────────────────────────────────────
  build_check: {
    label: "Verificando build",
    detail: (i) =>
      i["skipBuild"]
        ? "escalera rápida (validate + typecheck)"
        : "escalera completa (hasta next build)",
  },
  run_visual_qa: {
    label: "QA visual (screenshots)",
    detail: (i) =>
      Array.isArray(i["routes"]) && i["routes"].length > 0
        ? (i["routes"] as string[]).join(", ")
        : undefined,
  },
  review_screenshots: { label: "Review de diseño (visión)" },
  save_qa_report: { label: "Guardando reporte de QA" },
  push_site_version: {
    label: "Subiendo código al repo",
    detail: (i) => (i["checkpoint"] ? "checkpoint WIP" : undefined),
  },
  await_preview_deployment: { label: "Esperando deployment preview" },
  deploy_preview: {
    label: "Desplegando preview (build + push + deploy)",
    detail: (i) =>
      i["commitMessage"] ? String(i["commitMessage"]).slice(0, 80) : undefined,
  },
  get_deployment_logs: { label: "Leyendo logs del deployment" },
  publish_site: { label: "Publicando a producción" },

  // ── Marca (brand-curator) ─────────────────────────────────────────────
  get_brand_profile: { label: "Leyendo ficha de marca" },
  analyze_brand_image: {
    label: "Analizando imagen (visión)",
    detail: (i) =>
      i["imageUrl"]
        ? String(i["imageUrl"]).split("/").pop()?.slice(0, 60)
        : undefined,
  },
  extract_css_palette: {
    label: "Extrayendo paleta del CSS",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  scrape_brand_site: {
    label: "Escarbando el sitio (assets + datos)",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  crawl_brand_site: {
    label: "Crawleando el sitio completo",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  describe_current_site: {
    label: "Describiendo estructura del sitio actual",
    detail: (i) =>
      Array.isArray(i["urls"]) && i["urls"].length > 0
        ? `${i["urls"].length} página(s)`
        : undefined,
  },
  ingest_image_urls: { label: "Descargando imágenes al inbox" },
  remove_logo_background: { label: "Quitando fondo del logo" },
  save_brand_profile: { label: "Guardando ficha de marca" },
  update_lead_info: { label: "Actualizando datos del lead" },

  // ── Root / leads / outreach ───────────────────────────────────────────
  create_site_brief: { label: "Creando brief del sitio" },
  create_lead_from_url: {
    label: "Creando lead desde URL",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  approve_site: { label: "Aprobando sitio" },
  get_lead_activity: { label: "Leyendo actividad del lead" },
  update_lead: { label: "Actualizando lead" },
  pipeline_snapshot: { label: "Snapshot del pipeline" },
  save_outreach_draft: { label: "Guardando borrador de outreach" },
  get_lead_details: { label: "Leyendo detalle del lead" },

  // ── Sandbox / genéricas ───────────────────────────────────────────────
  bash: {
    label: "Terminal",
    detail: (i) =>
      i["command"] ? String(i["command"]).slice(0, 100) : undefined,
  },
  read_file: {
    label: "Leyendo archivo",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  write_file: {
    label: "Escribiendo archivo",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  edit_file: {
    label: "Editando por diff",
    detail: (i) => (i["path"] ? String(i["path"]) : undefined),
  },
  glob: { label: "Buscando archivos" },
  grep: { label: "Buscando en el código" },
  load_skill: {
    label: "Cargando skill",
    detail: (i) => (i["skill"] ? String(i["skill"]) : undefined),
  },
  todo: {
    label: "Plan de trabajo",
    detail: (i) => {
      const todos = i["todos"] as Array<Record<string, unknown>> | undefined
      if (!todos?.length) return undefined
      const active = todos.find((t) => t["status"] === "in_progress")
      return active
        ? `${String(active["content"])} (${todos.length} pasos)`
        : `${todos.length} pasos`
    },
  },
  web_fetch: {
    label: "Consultando página",
    detail: (i) => (i["url"] ? String(i["url"]) : undefined),
  },
  web_search: {
    label: "Buscando en la web",
    detail: (i) => (i["query"] ? String(i["query"]) : undefined),
  },
}

export function describeAction(action: Record<string, unknown>): {
  label: string
  detail?: string
  toolName?: string
  subagentName?: string
} {
  if (action["kind"] === "subagent-call") {
    const name = String(action["subagentName"] ?? action["name"] ?? "subagente")
    return { label: `Delegando a ${name}`, subagentName: name }
  }
  const toolName = String(action["toolName"] ?? action["name"] ?? "herramienta")
  const input = (action["input"] ?? {}) as Record<string, unknown>
  const known = TOOL_LABELS[toolName]
  if (known)
    return { label: known.label, detail: known.detail?.(input), toolName }
  // Fallback legible para tools aún no mapeadas: snake_case → palabras.
  return {
    label: toolName.replace(/_/g, " "),
    detail: JSON.stringify(input).slice(0, 80),
    toolName,
  }
}

/** Icono por tool, estilo Claude Code. */
const TOOL_ICONS: Record<string, typeof WrenchIcon> = {
  load_skill: SparkleIcon,
  bash: TerminalWindowIcon,
  edit_file: PencilSimpleIcon,
  read_file: FileTextIcon,
  write_file: FileTextIcon,
  glob: MagnifyingGlassIcon,
  grep: MagnifyingGlassIcon,
  web_fetch: GlobeIcon,
  web_search: GlobeIcon,
  todo: ListChecksIcon,
  // Materialización
  materialize_site: StackIcon,
  draft_sections: StackIcon,
  draft_section: PencilSimpleIcon,
  draft_surface: PencilSimpleIcon,
  compose_spec: ClipboardTextIcon,
  save_site_version: ClipboardTextIcon,
  // Verificación / entrega
  build_check: ShieldCheckIcon,
  run_visual_qa: ImagesIcon,
  review_screenshots: ImagesIcon,
  view_reference_screenshots: ImagesIcon,
  deploy_preview: CloudArrowUpIcon,
  await_preview_deployment: CloudArrowUpIcon,
  push_site_version: CloudArrowUpIcon,
  publish_site: CloudArrowUpIcon,
  translate_copy: TranslateIcon,
  // Marca
  analyze_brand_image: ImagesIcon,
  extract_css_palette: PaletteIcon,
  save_brand_profile: PaletteIcon,
  get_brand_profile: PaletteIcon,
  scrape_brand_site: GlobeIcon,
  crawl_brand_site: GlobeIcon,
  describe_current_site: GlobeIcon,
  ingest_image_urls: ImagesIcon,
  remove_logo_background: BroomIcon,
  // Root
  pipeline_snapshot: ChartLineUpIcon,
}

export function ToolIcon({
  toolName,
  className,
}: {
  toolName?: string
  className?: string
}) {
  const Icon = (toolName && TOOL_ICONS[toolName]) || WrenchIcon
  return <Icon className={className} />
}

/**
 * Modelo INTERNO que usa cada tool (espeja lib/tool-models.ts del agente). Las
 * strings llevan el keyword de proveedor para que ModelBadge elija el logo.
 * Solo las tools con modelo interno; el resto (bash, edit_file, build_check,
 * assemble_registry…) corre código puro y muestra el del orquestador.
 * Si cambias un override por env (TOOL_MODEL_*), actualízalo aquí.
 */
export const TOOL_MODEL: Record<string, string> = {
  // codegen sigue TOOL_MODEL_CODEGEN; 2026-07-08 = deepseek-v4-pro (glm-5.2
  // salió del A/B por latencia: 74-307s/sección vs ~60s).
  draft_section: "deepseek-v4-pro",
  draft_sections: "deepseek-v4-pro",
  // materialize_site orquesta varios modelos; el bulk (secciones) es codegen.
  materialize_site: "deepseek-v4-pro",
  translate_copy: "qwen3.7-plus",
  draft_surface: "gpt-5-nano",
  view_reference_screenshots: "gpt-5-mini",
  capture_screenshots: "gpt-5-mini",
  review_screenshots: "claude-sonnet-5",
  analyze_brand_image: "gpt-5-mini",
  describe_current_site: "gpt-5-mini",
}
