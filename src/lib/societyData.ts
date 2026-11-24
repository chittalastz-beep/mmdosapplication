import type { Expense, ExpenseStatus, MaintenanceRequest, Member, Notice, SocietyData, Visitor } from '../types'
import { requireSupabase } from './supabase'

const EXPENSE_DOCUMENT_BUCKET = 'expense-documents'

type Row = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mapMember(row: Row): Member {
  return {
    id: String(row.id),
    name: String(row.full_name),
    unit: String(row.unit_name),
    role: String(row.role).replace(/^\w/, (letter) => letter.toUpperCase()),
    phone: typeof row.phone === 'string' ? row.phone : '',
    email: typeof row.email === 'string' ? row.email : undefined,
    authLinked: typeof row.user_id === 'string',
    status: row.status === 'active' ? 'Active' : row.status === 'suspended' ? 'Suspended' : 'Pending',
  }
}

function mapExpense(row: Row, membersByUserId: Map<string, string>): Expense {
  const submitterId = String(row.submitted_by)
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category),
    vendor: String(row.vendor),
    amount: Number(row.amount),
    date: String(row.expense_date),
    receipt: typeof row.receipt_path === 'string' ? row.receipt_path : '',
    status: row.status as ExpenseStatus,
    submittedBy: membersByUserId.get(submitterId) ?? 'Society member',
  }
}

function mapMaintenance(row: Row, membersByUserId: Map<string, string>): MaintenanceRequest {
  return {
    id: String(row.id),
    title: String(row.title),
    location: String(row.location),
    priority: row.priority as MaintenanceRequest['priority'],
    status: row.status as MaintenanceRequest['status'],
    reportedBy: membersByUserId.get(String(row.reported_by)) ?? 'Society member',
    date: String(row.created_at).slice(0, 10),
  }
}

function mapVisitor(row: Row): Visitor {
  const entryDate = new Date(String(row.entry_at))
  return {
    id: String(row.id),
    name: String(row.visitor_name),
    purpose: String(row.purpose),
    unit: String(row.visiting_unit),
    time: new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(entryDate),
    status: row.checked_out_at ? 'Checked out' : 'Inside',
  }
}

function mapNotice(row: Row): Notice {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    date: String(row.created_at).slice(0, 10),
    audience: String(row.audience),
  }
}

function assertNoErrors(results: Array<{ error: { message: string; code?: string } | null }>) {
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    const suffix = failed.error.code ? ` (${failed.error.code})` : ''
    throw new Error(`${failed.error.message}${suffix}`)
  }
}

export async function loadSocietyData(userId: string): Promise<{ data: SocietyData; member: Member }> {
  const db = requireSupabase()
  const [memberResult, membersResult, expensesResult, requestsResult, visitorsResult, noticesResult] = await Promise.all([
    db.from('society_members').select('id,user_id,full_name,unit_name,email,phone,role,status').eq('user_id', userId).maybeSingle(),
    db.from('society_members').select('id,user_id,full_name,unit_name,email,phone,role,status').order('unit_name'),
    db.from('expenses').select('id,title,category,vendor,amount,expense_date,receipt_path,status,submitted_by').order('created_at', { ascending: false }),
    db.from('maintenance_requests').select('id,title,location,priority,status,reported_by,created_at').order('created_at', { ascending: false }),
    db.from('security_visitors').select('id,visitor_name,purpose,visiting_unit,entry_at,checked_out_at').order('entry_at', { ascending: false }),
    db.from('community_notices').select('id,title,body,audience,created_at').order('created_at', { ascending: false }),
  ])
  assertNoErrors([memberResult, membersResult, expensesResult, requestsResult, visitorsResult, noticesResult])
  if (!memberResult.data) {
    throw new Error('This Google account is not linked to a society member. Ask an Administrator to provision your account, or ask the President or Secretary to add your confirmed Google email and approve your membership. The first Administrator must be linked using the setup guide.')
  }
  if (memberResult.data.status !== 'active') {
    throw new Error(memberResult.data.status === 'suspended'
      ? 'Your society access is suspended. Contact the Administrator to restore access.'
      : 'Your society membership is awaiting administrator approval.')
  }

  const members = (membersResult.data ?? []).map((row) => mapMember(row as Row))
  const membersByUserId = new Map(
    (membersResult.data ?? [])
      .filter((row) => typeof row.user_id === 'string')
      .map((row) => [String(row.user_id), String(row.full_name)]),
  )

  return {
    member: mapMember(memberResult.data as Row),
    data: {
      members,
      expenses: (expensesResult.data ?? []).map((row) => mapExpense(row as Row, membersByUserId)),
      requests: (requestsResult.data ?? []).map((row) => mapMaintenance(row as Row, membersByUserId)),
      visitors: (visitorsResult.data ?? []).map((row) => mapVisitor(row as Row)),
      notices: (noticesResult.data ?? []).map((row) => mapNotice(row as Row)),
    },
  }
}

export async function recordSocietyLogin(platform: 'windows' | 'android' | 'ios' | 'other') {
  const { error } = await requireSupabase().rpc('record_society_login', {
    client_platform: platform,
  })
  if (error) throw new Error(error.message)
}

export async function createExpense(expense: Omit<Expense, 'id' | 'submittedBy'>) {
  const { error } = await requireSupabase().from('expenses').insert({
    title: expense.title,
    category: expense.category,
    vendor: expense.vendor,
    amount: expense.amount,
    expense_date: expense.date,
    receipt_path: expense.receipt || null,
  })
  if (error) throw new Error(error.message)
}

export async function reviewExpense(expenseId: string, decision: 'treasurer_approve' | 'president_approve' | 'mark_paid' | 'return', reason?: string) {
  const { error } = await requireSupabase().rpc('review_expense', {
    target_expense_id: expenseId,
    decision,
    reason: reason ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function uploadExpenseDocument(expenseId: string, file: File) {
  const db = requireSupabase()
  const extensionByType: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  const extension = extensionByType[file.type]
  if (!extension || file.size === 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a non-empty PDF, JPEG, PNG, or WebP file up to 10 MB.')
  }

  const path = `${expenseId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await db.storage.from(EXPENSE_DOCUMENT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { error: attachError } = await db.rpc('attach_expense_document', {
    target_expense_id: expenseId,
    document_path: path,
  })
  if (attachError) {
    const { error: cleanupError } = await db.storage.from(EXPENSE_DOCUMENT_BUCKET).remove([path])
    const cleanupMessage = cleanupError ? ` Uploaded file cleanup also failed: ${cleanupError.message}` : ''
    throw new Error(`${attachError.message}${cleanupMessage}`)
  }
}

export async function getExpenseDocumentUrl(path: string) {
  const { data, error } = await requireSupabase()
    .storage.from(EXPENSE_DOCUMENT_BUCKET)
    .createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function createMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'reportedBy'>) {
  const { error } = await requireSupabase().from('maintenance_requests').insert({
    title: request.title,
    location: request.location,
    priority: request.priority,
  })
  if (error) throw new Error(error.message)
}

export async function setMaintenanceStatus(requestId: string, status: 'In progress' | 'Resolved') {
  const { error } = await requireSupabase().rpc('set_maintenance_status', {
    target_request_id: requestId,
    next_status: status,
  })
  if (error) throw new Error(error.message)
}

export async function createVisitor(visitor: Omit<Visitor, 'id' | 'time' | 'status'>) {
  const { error } = await requireSupabase().from('security_visitors').insert({
    visitor_name: visitor.name,
    purpose: visitor.purpose,
    visiting_unit: visitor.unit,
  })
  if (error) throw new Error(error.message)
}

export async function checkoutVisitor(visitorId: string) {
  const { error } = await requireSupabase().rpc('checkout_visitor', { target_visitor_id: visitorId })
  if (error) throw new Error(error.message)
}

export async function createNotice(notice: Omit<Notice, 'id' | 'date'>) {
  const { error } = await requireSupabase().from('community_notices').insert({
    title: notice.title,
    body: notice.body,
    audience: notice.audience,
  })
  if (error) throw new Error(error.message)
}

export async function createMember(member: Omit<Member, 'id' | 'status' | 'email'> & { email: string }) {
  const { error } = await requireSupabase().rpc('add_society_member', {
    member_name: member.name,
    member_unit: member.unit,
    member_email: member.email ?? null,
    member_phone: member.phone || null,
  })
  if (error) throw new Error(error.message)
}

export async function provisionAuthMember(member: {
  id?: string
  name: string
  unit: string
  email: string
  phone: string
  role: string
}) {
  const { error } = await requireSupabase().functions.invoke('admin-provision-member', {
    body: {
      ...(member.id ? { memberId: member.id } : {}),
      fullName: member.name,
      unitName: member.unit,
      email: member.email,
      phone: member.phone || null,
      role: member.role.toLowerCase(),
    },
  })
  if (error) {
    if (error.name === 'FunctionsFetchError') {
      const detail = error.context instanceof Error ? ` ${error.context.message}` : ''
      throw new Error(`Could not reach the admin-provision-member Edge Function. Verify it is deployed to this Supabase project and APP_ALLOWED_ORIGINS includes this app's exact origin.${detail}`)
    }
    let message = error.message
    if (error.context instanceof Response) {
      const details: unknown = await error.context.json()
      if (isRecord(details) && typeof details.error === 'string') {
        message = details.error
      }
    }
    throw new Error(message)
  }
}

export async function updateMyProfile(profile: { name: string; email?: string }) {
  const { error } = await requireSupabase().rpc('update_my_society_profile', {
    member_name: profile.name,
    member_email: profile.email ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function reviewMember(memberId: string, approve: boolean, role = 'member') {
  const { error } = await requireSupabase().rpc('review_society_member', {
    target_member_id: memberId,
    approve,
    assigned_role: role.toLowerCase(),
  })
  if (error) throw new Error(error.message)
}

export async function updateSocietyMember(memberId: string, member: {
  name: string
  unit: string
  email?: string
  phone: string
  role: string
}) {
  const { error } = await requireSupabase().rpc('update_society_member', {
    target_member_id: memberId,
    member_name: member.name,
    member_unit: member.unit,
    member_email: member.email ?? null,
    member_phone: member.phone || null,
    assigned_role: member.role.toLowerCase(),
  })
  if (error) throw new Error(error.message)
}
