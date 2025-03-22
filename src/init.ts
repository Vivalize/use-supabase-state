import { SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function initSupabaseState(client: SupabaseClient) {
  supabaseClient = client
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) throw new Error('Supabase client not initialized. Call initSupabaseState(client) first.')
  return supabaseClient
}