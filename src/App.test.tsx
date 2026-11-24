import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, SocietyData } from './types'
import App from './App'

const mocks = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(),
    getSession: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
  loadSocietyData: vi.fn(),
  recordSocietyLogin: vi.fn(),
  updateMyProfile: vi.fn(),
  checkoutVisitor: vi.fn(),
  createExpense: vi.fn(),
  createMaintenanceRequest: vi.fn(),
  createMember: vi.fn(),
  createNotice: vi.fn(),
  createVisitor: vi.fn(),
  getExpenseDocumentUrl: vi.fn(),
  provisionAuthMember: vi.fn(),
  reviewExpense: vi.fn(),
  reviewMember: vi.fn(),
  setMaintenanceStatus: vi.fn(),
  updateSocietyMember: vi.fn(),
  uploadExpenseDocument: vi.fn(),
}))

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: mocks.auth },
}))

vi.mock('./lib/societyData', () => ({
  checkoutVisitor: mocks.checkoutVisitor,
  createExpense: mocks.createExpense,
  createMaintenanceRequest: mocks.createMaintenanceRequest,
  createMember: mocks.createMember,
  createNotice: mocks.createNotice,
  createVisitor: mocks.createVisitor,
  getExpenseDocumentUrl: mocks.getExpenseDocumentUrl,
  provisionAuthMember: mocks.provisionAuthMember,
  loadSocietyData: mocks.loadSocietyData,
  recordSocietyLogin: mocks.recordSocietyLogin,
  reviewExpense: mocks.reviewExpense,
  reviewMember: mocks.reviewMember,
  setMaintenanceStatus: mocks.setMaintenanceStatus,
  updateMyProfile: mocks.updateMyProfile,
  updateSocietyMember: mocks.updateSocietyMember,
  uploadExpenseDocument: mocks.uploadExpenseDocument,
}))

const regularMember: Member = {
  id: 'member-1',
  name: 'Riya Member',
  unit: 'A-02',
  role: 'Member',
  phone: '+919876543210',
  email: 'riya@example.com',
  authLinked: true,
  status: 'Active',
}

const securityMember: Member = {
  ...regularMember,
  id: 'security-1',
  name: 'Gate Staff',
  role: 'Security',
  phone: '+919876543211',
  email: undefined,
  authLinked: true,
}

const presidentMember: Member = {
  ...regularMember,
  id: 'president-1',
  name: 'Anita President',
  unit: 'A-01',
  role: 'President',
  phone: '+919876543212',
}

const treasurerMember: Member = {
  ...regularMember,
  id: 'treasurer-1',
  name: 'Manish Treasurer',
  role: 'Treasurer',
}

const secretaryMember: Member = {
  ...presidentMember,
  id: 'secretary-1',
  name: 'Ravi Secretary',
  role: 'Secretary',
  phone: '+919876543213',
}

const administratorMember: Member = {
  ...presidentMember,
  id: 'administrator-1',
  name: 'Admin Member',
  role: 'Administrator',
}

const pendingMember: Member = {
  ...regularMember,
  id: 'pending-1',
  name: 'Pending Resident',
  unit: 'D-08',
  phone: '+919876543214',
  authLinked: true,
  status: 'Pending',
}

const unlinkedPendingMember: Member = { ...pendingMember, authLinked: false }

function makeData(member: Member): SocietyData {
  return {
    members: member.id === regularMember.id ? [member] : [member, regularMember, pendingMember],
    expenses: [{
      id: 'expense-1',
      title: 'Confidential test expense',
      category: 'Repairs',
      vendor: 'Test vendor',
      amount: 1250,
      date: '2026-11-21',
      receipt: '',
      status: 'submitted',
      submittedBy: member.name,
    }],
    requests: [{
      id: 'request-1',
      title: 'Test maintenance request',
      location: 'A-02',
      priority: 'Normal',
      status: 'Open',
      reportedBy: member.name,
      date: '2026-11-21',
    }],
    visitors: [{
      id: 'visitor-1',
      name: 'Test visitor',
      purpose: 'Delivery',
      unit: 'A-02',
      time: '10:30',
      status: 'Inside',
    }],
    notices: [{
      id: 'notice-1',
      title: 'Test notice',
      body: 'Society update',
      date: '2026-11-21',
      audience: 'All members',
    }],
  }
}

function makeSession({ email = regularMember.email, verified = true, provider = 'google' } = {}) {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4_000_000_000,
    user: {
      id: 'auth-user-1',
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-21T00:00:00.000Z',
      email,
      email_confirmed_at: verified ? '2026-11-21T00:00:00.000Z' : undefined,
      identities: [{ provider }],
    },
  }
}

let activeMember = regularMember

beforeEach(() => {
  vi.clearAllMocks()
  activeMember = regularMember
  mocks.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com/' }, error: null })
  mocks.auth.signOut.mockResolvedValue({ error: null })
  mocks.loadSocietyData.mockImplementation(async () => ({
    member: activeMember,
    data: makeData(activeMember),
  }))
  mocks.recordSocietyLogin.mockResolvedValue(undefined)
  mocks.updateMyProfile.mockResolvedValue(undefined)
  mocks.updateSocietyMember.mockResolvedValue(undefined)
  mocks.provisionAuthMember.mockResolvedValue(undefined)
})

describe('MMDOS application access', () => {
  it('starts Google OAuth and returns to the current application origin', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    await waitFor(() => expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    }))
  })

  it('surfaces Google provider errors', async () => {
    mocks.auth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Google provider is not configured' },
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Google provider is not configured')
  })

  it('clears a legacy non-Google session before starting Google sign-in', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession({ provider: 'email' }) }, error: null })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    await waitFor(() => {
      expect(mocks.auth.signOut).toHaveBeenCalled()
      expect(mocks.auth.signInWithOAuth).toHaveBeenCalled()
    })
  })

  it('does not open the society workspace for an unverified or non-Google session', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession({ provider: 'email', verified: false }) }, error: null })
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with a Google account that has a verified email address.')
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(mocks.loadSocietyData).not.toHaveBeenCalled()
  })

  it('restores a persisted session without requesting credentials again', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
    expect(mocks.recordSocietyLogin).not.toHaveBeenCalled()
  })

  it('gives Members read-only access to every application module', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    for (const moduleName of ['Overview', 'Members', 'Manage members', 'Accounts', 'Maintenance', 'Gate & security', 'Notices', 'Reports']) {
      expect(within(navigation).getByRole('button', { name: new RegExp(moduleName) })).toBeInTheDocument()
    }
    expect(screen.getByText('Across 102 duplex homes')).toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Members' }))
    expect(await screen.findByRole('heading', { name: 'Member directory' })).toBeInTheDocument()
    expect(screen.getByText(/102 duplex homes/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit my details' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: /Accounts/ }))
    expect(await screen.findByRole('heading', { name: 'Expense register' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Advance expense-1 approval' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return expense-1' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Attach document for expense-1')).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: /Maintenance/ }))
    expect(await screen.findByRole('heading', { name: 'Maintenance requests' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New request' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start work' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Gate & security' }))
    expect(await screen.findByRole('heading', { name: 'Visitor log' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log visitor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Notices' }))
    expect(await screen.findByRole('heading', { name: 'Test notice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New notice' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    expect(await screen.findByRole('heading', { name: 'Member accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit / })).not.toBeInTheDocument()

    expect(mocks.createExpense).not.toHaveBeenCalled()
    expect(mocks.createMaintenanceRequest).not.toHaveBeenCalled()
    expect(mocks.createVisitor).not.toHaveBeenCalled()
    expect(mocks.createNotice).not.toHaveBeenCalled()
    expect(mocks.updateMyProfile).not.toHaveBeenCalled()
  })

  it('lets only the Treasurer attach a document to an expense', async () => {
    activeMember = treasurerMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    fireEvent.click(within(navigation).getByRole('button', { name: /Accounts/ }))
    const documentInput = await screen.findByLabelText('Attach document for expense-1')
    const file = new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' })
    fireEvent.change(documentInput, { target: { files: [file] } })

    await waitFor(() => expect(mocks.uploadExpenseDocument).toHaveBeenCalledWith('expense-1', file))
    expect(await screen.findByRole('status')).toHaveTextContent('Supporting document attached to the expense.')
  })

  it('lets Presidents manage another member’s profile and role through the admin page', async () => {
    activeMember = presidentMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    fireEvent.click(within(navigation).getByRole('button', { name: /Accounts/ }))
    expect(await screen.findByRole('heading', { name: 'Expense register' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Attach document for expense-1')).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Riya Member' }))
    expect(within(screen.getByLabelText('Society role')).queryByRole('option', { name: 'Administrator' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Member name'), { target: { value: 'Riya Revised' } })
    fireEvent.change(screen.getByLabelText('Duplex unit'), { target: { value: 'C-07' } })
    fireEvent.change(screen.getByLabelText('Contact mobile number'), { target: { value: '+919876543299' } })
    fireEvent.change(screen.getByLabelText('Society role'), { target: { value: 'treasurer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save member changes' }))

    await waitFor(() => expect(mocks.updateSocietyMember).toHaveBeenCalledWith('member-1', {
      name: 'Riya Revised',
      unit: 'C-07',
      email: 'riya@example.com',
      phone: '+919876543299',
      role: 'Treasurer',
    }))

    fireEvent.change(screen.getByLabelText('Assign role to Pending Resident'), { target: { value: 'security' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mocks.reviewMember).toHaveBeenCalledWith('pending-1', true, 'security'))
  })

  it('lets an authorized member create a pending member profile from the management page', async () => {
    activeMember = presidentMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    fireEvent.change(screen.getByLabelText('Member name'), { target: { value: 'New Resident' } })
    fireEvent.change(screen.getByLabelText('Duplex unit'), { target: { value: 'E-01' } })
    fireEvent.change(screen.getByLabelText('Verified Google sign-in email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Contact mobile number (optional)'), { target: { value: '+919876543215' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }))

    await waitFor(() => expect(mocks.createMember).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'New Resident',
      unit: 'E-01',
      role: 'Member',
      phone: '+919876543215',
      email: 'new@example.com',
      status: 'Pending',
    }))
  })

  it('lets Secretaries access member administration', async () => {
    activeMember = secretaryMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    expect(within(navigation).getByRole('button', { name: 'Manage members' })).toBeInTheDocument()
  })

  it('gives Administrators full app access and lets them provision member accounts', async () => {
    activeMember = administratorMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    for (const moduleName of ['Overview', 'Members', 'Manage members', 'Accounts', 'Maintenance', 'Gate & security', 'Notices', 'Reports']) {
      expect(within(navigation).getByRole('button', { name: new RegExp(moduleName) })).toBeInTheDocument()
    }

    fireEvent.click(within(navigation).getByRole('button', { name: /Accounts/ }))
    expect(await screen.findByText('Confidential test expense')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach document for expense-1')).toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    fireEvent.change(screen.getByLabelText('Member name'), { target: { value: 'New Administrator' } })
    fireEvent.change(screen.getByLabelText('Duplex unit'), { target: { value: 'E-01' } })
    fireEvent.change(screen.getByLabelText('Verified Google sign-in email'), { target: { value: 'new-admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Society role'), { target: { value: 'administrator' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }))

    await waitFor(() => expect(mocks.provisionAuthMember).toHaveBeenCalledWith({
      name: 'New Administrator',
      unit: 'E-01',
      role: 'Administrator',
      phone: '',
      email: 'new-admin@example.com',
    }))
    expect(mocks.createMember).not.toHaveBeenCalled()
  })

  it('lets Administrators set up sign-in for an existing unlinked member', async () => {
    activeMember = administratorMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    mocks.loadSocietyData.mockImplementation(async () => ({
      member: activeMember,
      data: { ...makeData(activeMember), members: [activeMember, regularMember, unlinkedPendingMember] },
    }))
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sign-in for Pending Resident' }))

    await waitFor(() => expect(mocks.provisionAuthMember).toHaveBeenCalledWith({
      id: unlinkedPendingMember.id,
      name: unlinkedPendingMember.name,
      unit: unlinkedPendingMember.unit,
      email: unlinkedPendingMember.email,
      phone: unlinkedPendingMember.phone,
      role: unlinkedPendingMember.role,
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Google sign-in account linked and member access activated.')
  })

  it('lets Administrators edit a member mobile number', async () => {
    activeMember = administratorMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    fireEvent.click(within(navigation).getByRole('button', { name: 'Manage members' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Riya Member' }))
    fireEvent.change(screen.getByLabelText('Contact mobile number'), { target: { value: '+919876543299' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save member changes' }))

    await waitFor(() => expect(mocks.updateSocietyMember).toHaveBeenCalledWith('member-1', {
      name: regularMember.name,
      unit: regularMember.unit,
      email: regularMember.email,
      phone: '+919876543299',
      role: regularMember.role,
    }))
  })

  it('limits a security account to the Gate & security module', async () => {
    activeMember = securityMember
    mocks.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })
    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Society navigation' })
    expect(await within(navigation).findByRole('button', { name: 'Gate & security' })).toBeInTheDocument()
    expect(within(navigation).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Reports' })).not.toBeInTheDocument()
    expect(screen.queryByText('Confidential test expense')).not.toBeInTheDocument()
    expect(screen.getByText('Test visitor')).toBeInTheDocument()
  })
})
