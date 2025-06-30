import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

const supabaseUrl = PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Only create client if valid URL is provided
export const supabase = (supabaseUrl.includes('placeholder') || supabaseKey.includes('placeholder')) 
  ? null 
  : createClient(supabaseUrl, supabaseKey)

console.log('Supabase client:', supabase ? 'Connected' : 'Not configured (using placeholder values)')