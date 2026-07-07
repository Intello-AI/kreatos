import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const TEAL = "#00786f"
const MUTED = "#7c6d67"
const INK = "#0c0a09"
const BORDER = "#e8e4e3"

/**
 * Correo de "tarea del agente terminada" (react-email). Mismo lenguaje visual
 * que supabase/templates/confirmation.html: fondo #f3f1f1, card blanca de 480px
 * con borde, logo, botón teal, pie de Intello.
 */
export function TaskCompleteEmail({
  heading,
  body,
  ctaHref,
  ctaLabel = "Ver en el dashboard",
}: {
  heading: string
  body: string
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: "#f3f1f1",
          margin: 0,
          padding: "40px 16px",
          fontFamily: SANS,
        }}
      >
        <Container
          style={{
            width: "480px",
            maxWidth: "100%",
            backgroundColor: "#ffffff",
            border: `1px solid ${BORDER}`,
          }}
        >
          <Section style={{ padding: "32px 32px 0 32px" }}>
            <Img
              src="https://www.kreatos.intelloai.com/logo.png"
              alt="Kreatos"
              height={24}
              style={{ display: "block", height: "24px", width: "auto", border: 0 }}
            />
          </Section>

          <Section style={{ padding: "28px 32px 0 32px" }}>
            <Text
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: "28px",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: INK,
              }}
            >
              {heading}
            </Text>
            <Text
              style={{
                margin: "12px 0 0 0",
                fontSize: "14px",
                lineHeight: "22px",
                color: MUTED,
              }}
            >
              {body}
            </Text>
          </Section>

          {ctaHref ? (
            <Section style={{ padding: "24px 32px 0 32px" }}>
              <Button
                href={ctaHref}
                style={{
                  backgroundColor: TEAL,
                  color: "#fbfaf9",
                  padding: "11px 24px",
                  fontSize: "14px",
                  lineHeight: "20px",
                  fontWeight: 500,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}

          <Section style={{ padding: "28px 32px 32px 32px" }}>
            <Hr style={{ borderColor: BORDER, margin: "0 0 16px 0" }} />
            <Text
              style={{
                margin: 0,
                fontSize: "12px",
                lineHeight: "18px",
                color: MUTED,
              }}
            >
              Kreatos — desarrollado por{" "}
              <Link
                href="https://intelloai.com?utm_source=kreatos&utm_medium=email&utm_campaign=task"
                style={{ color: TEAL, textDecoration: "underline" }}
              >
                Intello
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
