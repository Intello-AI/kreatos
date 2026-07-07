"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react"

import { signup } from "@/features/auth/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { signupSchema, type SignupInput } from "@/features/auth/schemas"

export function SignUpForm() {
  const [serverError, setServerError] = useState<string>()
  const [showPassword, setShowPassword] = useState(false)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
  })

  const onSubmit = (data: SignupInput) => {
    setServerError(undefined)
    startTransition(async () => {
      // redirect() en la action lanza y navega; solo regresa si hubo error.
      const result = await signup(data)
      if (result?.formError) setServerError(result.formError)
    })
  }

  return (
    <form className="w-full flex flex-col" onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.full_name || undefined}>
          <FieldLabel htmlFor="full_name">Nombre</FieldLabel>
          <Input
            id="full_name"
            placeholder="Nombre y apellido"
            autoComplete="name"
            aria-invalid={!!errors.full_name || undefined}
            disabled={pending}
            {...register("full_name")}
          />
          {errors.full_name && (
            <FieldError>{errors.full_name.message}</FieldError>
          )}
        </Field>

        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="mail@mail.com"
            autoComplete="email"
            aria-invalid={!!errors.email || undefined}
            disabled={pending}
            {...register("email")}
          />
          {errors.email && <FieldError>{errors.email.message}</FieldError>}
        </Field>

        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="********"
              autoComplete="new-password"
              aria-invalid={!!errors.password || undefined}
              disabled={pending}
              {...register("password")}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {errors.password ? (
            <FieldError>{errors.password.message}</FieldError>
          ) : (
            <FieldDescription>Mínimo 6 caracteres.</FieldDescription>
          )}
        </Field>

        {serverError && (
          <FieldDescription role="alert" className="text-destructive">
            {serverError}
          </FieldDescription>
        )}

        <Field>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Crear cuenta
          </Button>
          <FieldDescription className="mt-4">
            ¿Ya tienes cuenta?{" "}
            <Link href="/" className="underline">
              Iniciar sesión
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
