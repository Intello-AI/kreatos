import { z } from "zod"

export const loginSchema = z.object({
  email: z.email("Correo inválido."),
  password: z.string().min(6, "Mínimo 6 caracteres."),
})

export const signupSchema = loginSchema.extend({
  full_name: z.string().min(2, "Escribe tu nombre."),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>

/**
 * Resultado de las server actions de auth. Los errores por campo los maneja
 * react-hook-form en el cliente; aquí solo viajan errores de servidor.
 */
export interface AuthFormState {
  formError?: string
}
