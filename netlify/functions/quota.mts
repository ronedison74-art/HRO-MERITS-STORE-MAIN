// Read-only endpoint for the Fleet Merits cadet card:
//   GET /.netlify/functions/quota?name=<exact cadet name>
// Returns only that cadet's ED / DR usage. Only the Fleet site's origin gets CORS access.
import { createClient } from '@supabase/supabase-js'
import { buildQuota, todayIn } from '../../src/server/quota.server.ts'

const ALLOWED_ORIGINS = (process.env.QUOTA_ALLOWED_ORIGINS || 'https://fleethro.netlify.app')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const TIMEZONE = process.env.QUOTA_TIMEZONE || 'Asia/Manila'

function headersFor(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'Content-Type'
  }
  return h
}

export default async (req: Request): Promise<Response> => {
  const headers = headersFor(req.headers.get('origin'))

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const name = (new URL(req.url).searchParams.get('name') ?? '').trim()
  if (name.length < 3 || name.length > 200) {
    return new Response(JSON.stringify({ found: false }), { status: 400, headers })
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers })
  }

  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const body = await buildQuota(sb, name, todayIn(TIMEZONE))
    return new Response(JSON.stringify(body), { status: 200, headers })
  } catch (e) {
    console.error('[quota] failed:', e)
    return new Response(JSON.stringify({ error: 'Could not load quota' }), { status: 500, headers })
  }
}
