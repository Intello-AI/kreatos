"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import {
  loginSchema,
  signupSchema,
  type AuthFormState,
  type LoginInput,
  type SignupInput,
} from "@/features/auth/schemas"

export async function login(input: LoginInput): Promise<AuthFormState> {
  // Re-validación server-side: la validación del cliente (RHF) es solo UX.
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { formError: "Datos inválidos." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { formError: "Correo o contraseña incorrectos." }
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function signup(input: SignupInput): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    return { formError: "Datos inválidos." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // user_metadata: el trigger handle_new_user copia full_name a profiles.
    options: { data: { full_name: parsed.data.full_name } },
  })

  if (error) {
    return { formError: error.message }
  }

  // Sin sesión = confirmación por correo activa (prod). Local entra directo.
  if (!data.session) {
    redirect("/?message=confirma-tu-correo")
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/")
}
