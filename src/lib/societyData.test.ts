import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMaintenancePayment,
  createMember,
  getExpenseDocumentUrl,
  loadSocietyData,
  provisionAuthMember,
  recordSocietyLogin,
  reviewExpense,
  uploadExpenseDocument,
  updateMyProfile,
  updateSocietyMember,
} from './societyData'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  createSignedUrl: vi.fn(),
}))

vi.mock('./supabase', () => ({
  requireSupabase: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
    functions: { invoke: mocks.invoke },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({ insert: mocks.insert })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.invoke.mockResolvedValue({ data: { memberId: 'member-1' }, error: null })
  mocks.storageFrom.mockReturnValue({
    upload: mocks.storageUpload,
    remove: mocks.storageRemove,
    createSignedUrl: mocks.createSignedUrl,
  })
  mocks.storageUpload.mockResolvedValue({ error: null })
  mocks.storageRemove.mockResolvedValue({ error: null })
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-document' }, error: null })
})

describe('society data services', () => {
  it('passes the client platform to the login activity RPC', async () => {
    await recordSocietyLogin('android')

    expect(mocks.rpc).toHaveBeenCalledWith('record_society_login', {
      client_platform: 'android',
    })
  })

  it('maps member profile fields to the profile RPC and sends an omitted email as null', async () => {
    await updateMyProfile({ name: 'Riya Member' })

    expect(mocks.rpc).toHaveBeenCalledWith('update_my_society_profile', {
      member_name: 'Riya Member',
      member_email: null,
    })
  })

  it('normalizes member role and nullable contact values for the member RPC', async () => {
    await createMember({
      name: 'New Resident',
      unit: 'B-05',
      role: 'Member',
      phone: '',
      email: 'new@example.com',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('add_society_member', {
      member_name: 'New Resident',
      member_unit: 'B-05',
      member_email: 'new@example.com',
      member_phone: null,
    })
  })

  it('stores the billing month as its first date and normalizes an empty reference to null', async () => {
    await createMaintenancePayment({
      memberId: 'member-1',
      memberName: 'Riya Member',
      unit: 'A-02',
      billingMonth: '2026-11',
      amount: 4500,
      receivedOn: '2026-11-20',
      reference: '',
    })

    expect(mocks.from).toHaveBeenCalledWith('maintenance_payments')
    expect(mocks.insert).toHaveBeenCalledWith({
      member_id: 'member-1',
      member_name: 'Riya Member',
      unit_name: 'A-02',
      billing_month: '2026-11-01',
      amount: 4500,
      received_on: '2026-11-20',
      reference: null,
    })
  })

  it('provisions an Auth-linked member through the administrator Edge Function', async () => {
    await provisionAuthMember({
      name: 'New Resident',
      unit: 'e-01',
      email: 'new@example.com',
      phone: '',
      role: 'Administrator',
    })

    expect(mocks.invoke).toHaveBeenCalledWith('admin-provision-member', {
      body: {
        fullName: 'New Resident',
        unitName: 'e-01',
        email: 'new@example.com',
        phone: null,
        role: 'administrator',
      },
    })
  })

  it('links an existing unlinked society profile to its Google sign-in account', async () => {
    await provisionAuthMember({
      id: 'member-42',
      name: 'Existing Resident',
      unit: 'C-07',
      email: 'resident@example.com',
      phone: '+919876543210',
      role: 'Member',
    })

    expect(mocks.invoke).toHaveBeenCalledWith('admin-provision-member', {
      body: {
        memberId: 'member-42',
        fullName: 'Existing Resident',
        unitName: 'C-07',
        email: 'resident@example.com',
        phone: '+919876543210',
        role: 'member',
      },
    })
  })

  it('surfaces the administrator function error returned by the backend', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Only an active Administrator can provision member accounts.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    })

    await expect(provisionAuthMember({
      name: 'New Resident',
      unit: 'E-01',
      email: 'new@example.com',
      phone: '',
      role: 'Member',
    })).rejects.toThrow('Only an active Administrator can provision member accounts.')
  })

  it('explains how to resolve an unreachable administrator function', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
        context: new TypeError('Failed to fetch'),
      },
    })

    await expect(provisionAuthMember({
      name: 'New Resident',
      unit: 'E-01',
      email: 'new@example.com',
      phone: '',
      role: 'Member',
    })).rejects.toThrow('Verify it is deployed to this Supabase project and APP_ALLOWED_ORIGINS includes this app\'s exact origin.')
  })

  it('preserves the approval decision and optional reason in the expense RPC', async () => {
    await reviewExpense('expense-42', 'return', 'Please attach the invoice.')

    expect(mocks.rpc).toHaveBeenCalledWith('review_expense', {
      target_expense_id: 'expense-42',
      decision: 'return',
      reason: 'Please attach the invoice.',
    })
  })

  it('uploads supported expense documents privately and links them to the selected expense', async () => {
    const file = new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' })

    await uploadExpenseDocument('expense-42', file)

    expect(mocks.storageFrom).toHaveBeenCalledWith('expense-documents')
    expect(mocks.storageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^expense-42\/[0-9a-f-]+\.pdf$/i),
      file,
      { contentType: 'application/pdf', upsert: false },
    )
    expect(mocks.rpc).toHaveBeenCalledWith('attach_expense_document', {
      target_expense_id: 'expense-42',
      document_path: expect.stringMatching(/^expense-42\/[0-9a-f-]+\.pdf$/i),
    })
  })

  it('rejects unsupported or oversized expense documents before upload', async () => {
    const file = new File(['not a receipt'], 'receipt.txt', { type: 'text/plain' })

    await expect(uploadExpenseDocument('expense-42', file)).rejects.toThrow('Choose a non-empty PDF, JPEG, PNG, or WebP file up to 10 MB.')

    expect(mocks.storageUpload).not.toHaveBeenCalled()
  })

  it('removes an uploaded object if the expense-linking RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'Expense already has a document attached' } })
    const file = new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' })

    await expect(uploadExpenseDocument('expense-42', file)).rejects.toThrow('Expense already has a document attached')

    expect(mocks.storageRemove).toHaveBeenCalledWith([
      expect.stringMatching(/^expense-42\/[0-9a-f-]+\.pdf$/i),
    ])
  })

  it('creates a short-lived URL for an attached expense document', async () => {
    await expect(getExpenseDocumentUrl('expense-42/document.pdf')).resolves.toBe('https://storage.example/signed-document')

    expect(mocks.createSignedUrl).toHaveBeenCalledWith('expense-42/document.pdf', 60)
  })

  it('updates member details and role through the admin-only RPC', async () => {
    await updateSocietyMember('member-42', {
      name: 'Updated Resident',
      unit: 'C-07',
      email: 'resident@example.com',
      phone: '+919876543210',
      role: 'Secretary',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('update_society_member', {
      target_member_id: 'member-42',
      member_name: 'Updated Resident',
      member_unit: 'C-07',
      member_email: 'resident@example.com',
      member_phone: '+919876543210',
      assigned_role: 'secretary',
    })
  })

  it('surfaces backend errors instead of reporting a successful update', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'Permission denied' } })

    await expect(updateMyProfile({ name: 'Riya Member' })).rejects.toThrow('Permission denied')
  })

  it('maps member, expense, maintenance, visitor, and notice rows', async () => {
    const memberRow = {
      id: 'member-1',
      user_id: 'user-1',
      full_name: 'Riya Member',
      unit_name: 'A-02',
      role: 'member',
      email: null,
      phone: '+919876543210',
      status: 'active',
    }
    const tables: Record<string, Array<Record<string, unknown>>> = {
      society_members: [memberRow],
      expenses: [{
        id: 'expense-1',
        title: 'Water pump repair',
        category: 'Repairs',
        vendor: 'Test vendor',
        amount: 1250,
        expense_date: '2026-11-21',
        receipt_path: null,
        status: 'submitted',
        submitted_by: 'user-1',
      }],
      maintenance_payments: [{
        id: 'payment-1',
        member_id: 'member-1',
        member_name: 'Riya Member',
        unit_name: 'A-02',
        billing_month: '2026-11-01',
        amount: 4500,
        received_on: '2026-11-20',
        reference: 'UPI-0001',
      }],
      maintenance_requests: [{
        id: 'request-1',
        title: 'Leaking pipe',
        location: 'A-02',
        priority: 'High',
        status: 'Open',
        reported_by: 'user-1',
        created_at: '2026-11-20T08:30:00.000Z',
      }],
      security_visitors: [{
        id: 'visitor-1',
        visitor_name: 'Delivery person',
        purpose: 'Parcel',
        visiting_unit: 'A-02',
        entry_at: '2026-11-21T08:30:00.000Z',
        checked_out_at: null,
      }],
      community_notices: [{
        id: 'notice-1',
        title: 'Water shutdown',
        body: 'Tank cleaning today.',
        audience: 'All members',
        created_at: '2026-11-21T08:30:00.000Z',
      }],
    }
    let memberQueryCount = 0
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(() => {
          memberQueryCount += 1
          return Promise.resolve({ data: memberQueryCount === 1 ? memberRow : null, error: null })
        }),
        order: vi.fn(() => Promise.resolve({ data: tables[table] ?? [], error: null })),
      }
      return query
    })

    const result = await loadSocietyData('user-1')

    expect(result.member).toMatchObject({
      id: 'member-1',
      role: 'Member',
      status: 'Active',
      phone: '+919876543210',
      authLinked: true,
    })
    expect(result.data.expenses[0]).toMatchObject({
      id: 'expense-1',
      submittedBy: 'Riya Member',
      receipt: '',
    })
    expect(result.data.maintenancePayments[0]).toMatchObject({
      id: 'payment-1',
      memberId: 'member-1',
      memberName: 'Riya Member',
      unit: 'A-02',
      billingMonth: '2026-11',
      amount: 4500,
      receivedOn: '2026-11-20',
      reference: 'UPI-0001',
    })
    expect(result.data.requests[0]).toMatchObject({ reportedBy: 'Riya Member', date: '2026-11-20' })
    expect(result.data.visitors[0]).toMatchObject({ name: 'Delivery person', status: 'Inside' })
    expect(result.data.notices[0]).toMatchObject({ title: 'Water shutdown', audience: 'All members' })
  })

  it('rejects accounts that are not linked to a society member', async () => {
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
      return query
    })

    await expect(loadSocietyData('unlinked-user')).rejects.toThrow('not linked to a society member')
  })

  it('explains that suspended members need administrator access restoration', async () => {
    const suspendedMember = {
      id: 'member-suspended',
      user_id: 'user-suspended',
      full_name: 'Suspended Resident',
      unit_name: 'B-10',
      role: 'member',
      phone: null,
      email: 'suspended@example.com',
      status: 'suspended',
    }
    let memberQueryCount = 0
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(() => {
          memberQueryCount += 1
          return Promise.resolve({ data: memberQueryCount === 1 ? suspendedMember : null, error: null })
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
      return query
    })

    await expect(loadSocietyData('user-suspended')).rejects.toThrow('Your society access is suspended. Contact the Administrator to restore access.')
  })
})
