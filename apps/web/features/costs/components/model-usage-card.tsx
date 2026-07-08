import { ClaudeAI, DeepSeek, GLM, OpenAI, Qwen } from "@/components/icons"
import { formatUsd } from "@/lib/format"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CardContent } from "@/components/ui/card"

import type { ModelUsage } from "../queries"

/** Icono + etiqueta de proveedor a partir del id del modelo. */
function provider(model: string): {
  Icon: (props: { className?: string }) => React.ReactElement
  label: string
} {
  const m = model.toLowerCase()
  if (m.startsWith("claude")) return { Icon: ClaudeAI, label: "Anthropic" }
  if (m.startsWith("qwen")) return { Icon: Qwen, label: "Qwen (Alibaba)" }
  if (m.startsWith("glm") || m.startsWith("zai"))
    return { Icon: GLM, label: "GLM (Z.ai)" }
  if (m.startsWith("deepseek")) return { Icon: DeepSeek, label: "DeepSeek" }
  return {
    Icon: (props) => <OpenAI {...props} className={`${props.className} fill-current`} />,
    label: "OpenAI",
  }
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

/**
 * Tabla de gasto por MODELO (vista model_usage). Muestra TODOS los modelos del
 * catálogo; los no usados salen en $0 (p. ej. GLM antes de su primer build).
 */
export function ModelUsageCard({ models }: { models: ModelUsage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Gasto por modelo</CardTitle>
        <CardDescription>
          Costo y tokens por modelo. Los que aún no se usan salen en $0.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registro de tokens aún.</p>
        ) : (
          <ul className="divide-y">
            {models.map(({ model, costUsd, calls, inputTokens, outputTokens }) => {
              const { Icon, label } = provider(model)
              const unused = calls === 0
              return (
                <li
                  key={model}
                  className={`flex items-center gap-3 py-2.5 ${unused ? "opacity-50" : ""}`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{model}</span>
                    <span className="block text-xs text-muted-foreground">
                      {unused
                        ? `${label} · sin uso`
                        : `${label} · ${calls} llamadas · ${tokens(inputTokens + outputTokens)} tokens`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatUsd(costUsd)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
