import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedRoles = new Set([
  'administrator',
  'president',
  'treasurer',
  'secretary',
  'security',
  'member',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function response(
  status: number,
  body: Record<string, unknown>,
  origin: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      Vary: 'Origin',
    },
  })
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response('Origin is not allowed.', { status: 403 })
  }
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      },
    })
  }
  if (request.method !== 'POST') {
    return response(405, { error: 'Method not allowed.' }, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, { error: 'Supabase function secrets are not configured.' }, origin)
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!accessToken) {
    return response(401, { error: 'Sign in with Google before provisioning a member.' }, origin)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user: actor }, error: actorError } = await adminClient.auth.getUser(accessToken)
  if (actorError || !actor) {
    return response(401, { error: 'The current Supabase session is not valid.' }, origin)
  }

  const actorProviders = actor.app_metadata?.providers
  const hasGoogleIdentity = actor.app_metadata?.provider === 'google'
    || (Array.isArray(actorProviders) && actorProviders.includes('google'))
  if (
    !actor.email
    || !actor.email_confirmed_at
    || !hasGoogleIdentity
  ) {
    return response(403, { error: 'A verified Google identity is required.' }, origin)
  }

  const { data: adminMember, error: adminLookupError } = await adminClient
    .from('society_members')
    .select('role,status')
    .eq('user_id', actor.id)
    .maybeSingle()
  if (adminLookupError) {
    return response(500, { error: `Could not verify administrator access: ${adminLookupError.message}` }, origin)
  }
  if (adminMember?.role !== 'administrator' || adminMember.status !== 'active') {
    return response(403, { error: 'Only an active Administrator can provision member accounts.' }, origin)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return response(400, { error: 'Request body must be valid JSON.' }, origin)
  }
  if (!isRecord(body)) {
    return response(400, { error: 'Request body must be a JSON object.' }, origin)
  }

  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const unitName = typeof body.unitName === 'string' ? body.unitName.trim().toUpperCase() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  const role = typeof body.role === 'string' ? body.role : ''
  if (fullName.length < 1 || fullName.length > 120) {
    return response(400, { error: 'Name must contain between 1 and 120 characters.' }, origin)
  }
  if (unitName.length < 1 || unitName.length > 20) {
    return response(400, { error: 'Unit must contain between 1 and 20 characters.' }, origin)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(400, { error: 'Enter a valid Google email address.' }, origin)
  }
  if (body.phone !== undefined && body.phone !== null && typeof body.phone !== 'string') {
    return response(400, { error: 'Phone must be a string in international format.' }, origin)
  }
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return response(400, { error: 'Enter the phone in international format, for example +919876543210.' }, origin)
  }
  if (!allowedRoles.has(role)) {
    return response(400, { error: 'Choose a valid society role.' }, origin)
  }
  if (memberId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId)) {
    return response(400, { error: 'The society member ID is invalid.' }, origin)
  }

  const profileLookup = adminClient
    .from('society_members')
    .select('id,user_id')
  const { data: existingProfile, error: profileLookupError } = memberId
    ? await profileLookup.eq('id', memberId).maybeSingle()
    : await profileLookup.eq('email', email).maybeSingle()
  if (profileLookupError) {
    return response(500, { error: `Could not check the society profile: ${profileLookupError.message}` }, origin)
  }
  if (memberId && !existingProfile) {
    return response(404, { error: 'The society member to link was not found.' }, origin)
  }
  const { data: emailProfile, error: emailProfileError } = await adminClient
    .from('society_members')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (emailProfileError) {
    return response(500, { error: `Could not check the society profile email: ${emailProfileError.message}` }, origin)
  }
  if (emailProfile && emailProfile.id !== existingProfile?.id) {
    return response(409, { error: 'This email is already assigned to another society profile.' }, origin)
  }
  const { data: existingUnit, error: unitLookupError } = await adminClient
    .from('society_members')
    .select('id')
    .eq('unit_name', unitName)
    .maybeSingle()
  if (unitLookupError) {
    return response(500, { error: `Could not check the society unit: ${unitLookupError.message}` }, origin)
  }
  if (existingUnit && existingUnit.id !== existingProfile?.id) {
    return response(409, {
      error: 'This unit already has a society profile. Open Manage members and update the existing profile instead of adding a second one.',
    }, origin)
  }

  const { data: authMatches, error: authLookupError } = await adminClient.rpc(
    'find_auth_user_for_provisioning',
    { target_email: email },
  )
  if (authLookupError) {
    return response(500, { error: `Could not check the Supabase Auth account: ${authLookupError.message}` }, origin)
  }

  const authMatch = Array.isArray(authMatches) ? authMatches[0] : null
  let authUserId = typeof authMatch?.user_id === 'string' ? authMatch.user_id : ''
  let createdAuthUserId = ''

  if (existingProfile?.user_id && existingProfile.user_id !== authUserId) {
    return response(409, { error: 'This profile is already linked to a different Auth identity. Confirm which Google email the member uses before changing the link.' }, origin)
  }

  if (authUserId && authMatch?.email_confirmed !== true) {
    const { error } = await adminClient.auth.admin.updateUserById(authUserId, { email_confirm: true })
    if (error) {
      return response(400, { error: `Could not confirm the existing Auth email: ${error.message}` }, origin)
    }
  } else if (!authUserId) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error || !data.user) {
      return response(409, {
        error: error?.message ?? 'Could not create the Supabase Auth user.',
        hint: 'If this email already exists in Auth, confirm its email and try again.',
      }, origin)
    }
    authUserId = data.user.id
    createdAuthUserId = data.user.id
  }

  const profileValues = {
    user_id: authUserId,
    full_name: fullName,
    unit_name: unitName,
    email,
    phone,
    role,
    status: 'active',
  }
  const profileWrite = existingProfile
    ? existingProfile.user_id === null
      ? await adminClient
        .from('society_members')
        .update(profileValues)
        .eq('id', existingProfile.id)
        .is('user_id', null)
        .select('id')
        .maybeSingle()
      : await adminClient
        .from('society_members')
        .update(profileValues)
        .eq('id', existingProfile.id)
        .eq('user_id', authUserId)
        .select('id')
        .maybeSingle()
    : await adminClient
      .from('society_members')
      .insert(profileValues)
      .select('id')
      .single()

  if (profileWrite.error || !profileWrite.data) {
    const isUnitConflict = profileWrite.error?.code === '23505'
      && profileWrite.error.message.includes('society_members_unit_name_key')
    const profileError = isUnitConflict
      ? 'This unit already has a society profile. Open Manage members and update the existing profile instead of adding a second one.'
      : profileWrite.error?.message ?? 'The member profile could not be linked.'
    if (createdAuthUserId) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createdAuthUserId)
      if (cleanupError) {
        return response(500, {
          error: `${profileError} The newly created Auth account could not be removed: ${cleanupError.message}`,
        }, origin)
      }
    }
    return response(409, { error: profileError }, origin)
  }

  return response(201, {
    memberId: profileWrite.data.id,
    email,
    role,
    status: 'active',
  }, origin)
})
