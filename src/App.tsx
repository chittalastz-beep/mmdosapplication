import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  checkoutVisitor as saveVisitorCheckout,
  createExpense as saveExpense,
  createMaintenanceRequest as saveMaintenance,
  createMember as saveMember,
  createNotice as saveNotice,
  createVisitor as saveVisitor,
  getExpenseDocumentUrl,
  loadSocietyData,
  provisionAuthMember,
  recordSocietyLogin,
  updateMyProfile,
  reviewExpense as saveExpenseReview,
  reviewMember as saveMemberReview,
  setMaintenanceStatus,
  uploadExpenseDocument as saveExpenseDocument,
  updateSocietyMember as saveSocietyMember,
} from './lib/societyData'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Expense, ExpenseStatus, MaintenanceRequest, Member, Notice, SocietyData, Visitor } from './types'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileText,
  Paperclip,
  Home,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import './App.css'

type Section = 'overview' | 'members' | 'memberAdmin' | 'accounts' | 'maintenance' | 'security' | 'notices' | 'reports'
const STORAGE_KEY = 'mmdos-society-demo-v1'
const TOTAL_DUPLEX_HOMES = 102
const renderDate = new Date()
const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value)
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short',
}).format(new Date(`${value}T00:00:00`))

const initialData: SocietyData = {
  expenses: [
    { id: 'EXP-024', title: 'Water tanker - emergency supply', category: 'Utilities', vendor: 'AquaFresh Water', amount: 8500, date: today(), receipt: 'Receipt-024.pdf', status: 'submitted', submittedBy: 'Ravi Mehta' },
    { id: 'EXP-023', title: 'Common area lighting repair', category: 'Repairs', vendor: 'Brightline Electricals', amount: 4200, date: today(), receipt: 'Receipt-023.pdf', status: 'treasurer_approved', submittedBy: 'Anita Shah' },
    { id: 'EXP-022', title: 'October housekeeping services', category: 'Housekeeping', vendor: 'CleanNest Services', amount: 18500, date: '2026-11-02', receipt: 'Invoice-102.pdf', status: 'approved', submittedBy: 'Manish Patel' },
    { id: 'EXP-021', title: 'Lift annual maintenance', category: 'Maintenance', vendor: 'Apex Lift Care', amount: 12000, date: '2026-10-28', receipt: 'Invoice-88.pdf', status: 'paid', submittedBy: 'Anita Shah' },
  ],
  requests: [
    { id: 'MT-018', title: 'Repair entrance gate sensor', location: 'Main entrance', priority: 'Urgent', status: 'In progress', reportedBy: 'Priya Desai', date: today() },
    { id: 'MT-017', title: 'Water seepage near parking', location: 'Parking B-04', priority: 'High', status: 'Open', reportedBy: 'Kunal Joshi', date: '2026-11-20' },
    { id: 'MT-016', title: 'Replace garden pathway light', location: 'East garden', priority: 'Normal', status: 'Resolved', reportedBy: 'Ravi Mehta', date: '2026-11-18' },
  ],
  visitors: [
    { id: 'VIS-208', name: 'Sanjay Kumar', purpose: 'Plumbing service', unit: 'D-12', time: '10:42 AM', status: 'Inside' },
    { id: 'VIS-207', name: 'QuickCart delivery', purpose: 'Parcel delivery', unit: 'A-03', time: '10:18 AM', status: 'Checked out' },
    { id: 'VIS-206', name: 'Meera Patel', purpose: 'Guest', unit: 'C-08', time: '09:56 AM', status: 'Inside' },
  ],
  notices: [
    { id: 'NT-008', title: 'November maintenance contribution', body: 'Monthly contribution of ₹4,500 is due by 30 November. Please include your unit number as reference.', date: '2026-11-20', audience: 'All members' },
    { id: 'NT-007', title: 'Water tank cleaning schedule', body: 'Overhead tank cleaning is scheduled for Saturday from 9:00 AM. Please store water in advance.', date: '2026-11-18', audience: 'All members' },
  ],
  members: [
    { id: 'M-01', name: 'Anita Shah', unit: 'A-01', role: 'President', phone: '+91 98200 01001', status: 'Active' },
    { id: 'M-02', name: 'Manish Patel', unit: 'A-02', role: 'Treasurer', phone: '+91 98200 01002', status: 'Active' },
    { id: 'M-03', name: 'Ravi Mehta', unit: 'B-04', role: 'Secretary', phone: '+91 98200 01004', status: 'Active' },
    { id: 'M-04', name: 'Priya Desai', unit: 'C-08', role: 'Member', phone: '+91 98200 01008', status: 'Active' },
    { id: 'M-05', name: 'Kunal Joshi', unit: 'D-12', role: 'Member', phone: '+91 98200 01012', status: 'Active' },
  ],
}

function loadData(): SocietyData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...initialData, ...JSON.parse(stored) as Partial<SocietyData> }
  } catch {
    // Keep the demo usable when browser storage is unavailable or malformed.
  }
  return initialData
}

const sectionInfo: Record<Section, { title: string; subtitle: string; icon: typeof Home }> = {
  overview: { title: 'Good morning, Anita', subtitle: 'A clear view of your community, all in one place.', icon: Home },
  members: { title: 'Members', subtitle: 'The people who make Mantra Manor home.', icon: Users },
  memberAdmin: { title: 'Manage members', subtitle: 'Add member access and maintain society roles.', icon: ShieldCheck },
  accounts: { title: 'Accounts & expenses', subtitle: 'Every rupee recorded, reviewed and visible.', icon: Wallet },
  maintenance: { title: 'Maintenance', subtitle: 'Track requests from report to resolution.', icon: Wrench },
  security: { title: 'Gate & security', subtitle: 'A live record of visitors and service entries.', icon: Shield },
  notices: { title: 'Community notices', subtitle: 'Keep every household informed and involved.', icon: Bell },
  reports: { title: 'Reports', subtitle: 'Transparent summaries for members and auditors.', icon: FileText },
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [loginEventVersion, setLoginEventVersion] = useState(0)
  const sessionUserId = session?.user.id

  useEffect(() => {
    if (!supabase) {
      return
    }
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAuthError('')
      setAuthLoading(false)
      if (event === 'SIGNED_IN' && nextSession && isVerifiedGoogleSession(nextSession)) {
        setLoginEventVersion((version) => version + 1)
      }
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session)
      if (error) setAuthError(error.message)
      setAuthLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionUserId || loginEventVersion === 0 || !supabase) return
    let active = true
    void recordSocietyLogin(getDevicePlatform())
      .then(() => {
        if (active) setLoginNotice('')
      })
      .catch((error: unknown) => {
        if (active) {
          setLoginNotice(`Login activity could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      })
    return () => { active = false }
  }, [sessionUserId, loginEventVersion])

  const signInWithGoogle = async () => {
    if (!supabase) return
    setAuthPending(true)
    setAuthError('')
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (currentSession && !isVerifiedGoogleSession(currentSession)) {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) {
        setAuthError(error.message)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not start Google sign-in. Check your connection and try again.')
    } finally {
      setAuthPending(false)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    else setSession(null)
  }

  if (!isSupabaseConfigured || !supabase) return <SocietyWorkspace session={null} onSignOut={() => {}} />
  if (authLoading) return <AuthScreen loading error="" onSignIn={signInWithGoogle} />
  if (!session || !isVerifiedGoogleSession(session)) {
    const sessionError = session ? 'Sign in with a Google account that has a verified email address.' : authError
    return <AuthScreen loading={authPending} error={sessionError} onSignIn={signInWithGoogle} />
  }
  return <SocietyWorkspace key={session.user.id} session={session} onSignOut={signOut} loginNotice={loginNotice} />
}

function isVerifiedGoogleSession(session: Session): boolean {
  const user = session.user
  const providers = user.app_metadata.providers
  const hasGoogleIdentity = user.app_metadata.provider === 'google'
    || (Array.isArray(providers) && providers.includes('google'))
    || user.identities?.some((identity) => identity.provider === 'google') === true
  return Boolean(user.email && user.email_confirmed_at && hasGoogleIdentity)
}

function getDevicePlatform(): 'windows' | 'android' | 'ios' | 'other' {
  const userAgent = navigator.userAgent
  if (/android/i.test(userAgent)) return 'android'
  if (/iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Windows/i.test(userAgent)) return 'windows'
  return 'other'
}

function AuthScreen({ loading, error, onSignIn }: {
  loading: boolean
  error: string
  onSignIn: () => void | Promise<void>
}) {
  return <main className="auth-screen"><section className="auth-panel">
    <div className="brand auth-brand"><div className="brand-icon"><Building2 size={21} /></div><div><strong>MMDOS</strong><small>MANTRA MANOR DUPLEX OWNERS SOCIETY</small></div></div>
    <span className="panel-kicker">SECURE SOCIETY ACCESS</span><h1>Sign in</h1>
    <p className="auth-description">Use the verified Google account registered with the society. Only approved members can access society information.</p>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button type="button" className="button button-primary auth-submit" disabled={loading} onClick={() => void onSignIn()}>{loading ? 'Redirecting to Google…' : 'Sign in with Google'}</button>
    <p className="auth-note">You’ll return to this app after signing in. Your session is remembered on this device.</p>
  </section></main>
}

function SocietyWorkspace({ session, onSignOut, loginNotice }: { session: Session | null; onSignOut: () => void | Promise<void>; loginNotice?: string }) {
  const [data, setData] = useState<SocietyData>(loadData)
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [backendLoading, setBackendLoading] = useState(Boolean(session))
  const [backendError, setBackendError] = useState('')
  const [section, setSection] = useState<Section>('overview')
  const [modal, setModal] = useState<'expense' | 'maintenance' | 'visitor' | 'notice' | 'member' | 'editMember' | 'profile' | null>(null)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<string | null>(null)

  const refreshBackend = async () => {
    if (!session) return
    const loaded = await loadSocietyData(session.user.id)
    setData(loaded.data)
    setCurrentMember(loaded.member)
    setBackendError('')
  }

  useEffect(() => {
    if (!session) return
    let active = true
    void loadSocietyData(session.user.id)
      .then(({ data: loadedData, member }) => {
        if (!active) return
        setData(loadedData)
        setCurrentMember(member)
        setBackendError('')
      })
      .catch((error: unknown) => {
        if (active) setBackendError(error instanceof Error ? error.message : 'Unable to load society data.')
      })
      .finally(() => {
        if (active) setBackendLoading(false)
      })
    return () => { active = false }
  }, [session])

  const updateData = (update: (current: SocietyData) => SocietyData) => {
    setData((current) => {
      const next = update(current)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        setToast('Could not save this change in browser storage.')
      }
      return next
    })
  }
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }
  const commitChange = async (localUpdate: (current: SocietyData) => SocietyData, remoteUpdate: () => Promise<void>, successMessage: string): Promise<boolean> => {
    try {
      if (session) {
        if (currentMember?.role === 'Member') {
          notify('Member accounts have read-only access.')
          return false
        }
        await remoteUpdate()
        await refreshBackend()
      } else {
        updateData(localUpdate)
      }
      notify(successMessage)
      return true
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this change.')
      return false
    }
  }

  const pendingExpenses = data.expenses.filter((item) => ['submitted', 'treasurer_approved'].includes(item.status)).length
  const outstanding = data.expenses.filter((item) => item.status !== 'rejected').reduce((total, item) => total + item.amount, 0)
  const currentMonthExpenses = data.expenses.filter((item) => item.date.slice(0, 7) === today().slice(0, 7) && item.status !== 'rejected').reduce((total, item) => total + item.amount, 0)
  const openRequests = data.requests.filter((item) => item.status !== 'Resolved').length

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expense: Expense = {
      id: `EXP-${String(Date.now()).slice(-5)}`,
      title: String(form.get('title')).trim(),
      category: String(form.get('category')),
      vendor: String(form.get('vendor')).trim(),
      amount: Number(form.get('amount')),
      date: String(form.get('date')),
      receipt: '',
      status: 'submitted',
      submittedBy: currentMember?.name ?? 'Anita Shah',
    }
    if (!expense.title || !expense.vendor || !Number.isFinite(expense.amount) || expense.amount <= 0) return
    const saved = await commitChange(
      (current) => ({ ...current, expenses: [expense, ...current.expenses] }),
      () => saveExpense(expense),
      'Expense submitted for treasurer review.',
    )
    if (saved) setModal(null)
  }

  const advanceExpense = async (expenseId: string) => {
    const expense = data.expenses.find((item) => item.id === expenseId)
    if (!expense) return
    const decision = expense.status === 'submitted' ? 'treasurer_approve'
      : expense.status === 'treasurer_approved' ? 'president_approve'
        : 'mark_paid'
    await commitChange(
      (current) => ({
        ...current,
        expenses: current.expenses.map((row) => row.id !== expenseId ? row : {
          ...row,
          status: row.status === 'submitted' ? 'treasurer_approved'
            : row.status === 'treasurer_approved' ? 'approved'
              : row.status === 'approved' ? 'paid' : row.status,
        }),
      }),
      () => saveExpenseReview(expenseId, decision),
      decision === 'mark_paid' ? 'Payment recorded.' : 'Expense approval stage updated.',
    )
  }

  const rejectExpense = async (expenseId: string) => {
    const reason = session ? window.prompt('Reason for returning this expense:')?.trim() : 'Returned for clarification'
    if (session && !reason) return
    await commitChange(
      (current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === expenseId ? { ...expense, status: 'rejected' } : expense) }),
      () => saveExpenseReview(expenseId, 'return', reason),
      'Expense returned for clarification.',
    )
  }

  const attachExpenseDocument = async (expenseId: string, file: File) => {
    if (!session || currentMember?.role !== 'Treasurer') {
      notify('Only the Treasurer can attach expense documents.')
      return
    }
    setUploadingReceiptFor(expenseId)
    try {
      await saveExpenseDocument(expenseId, file)
      await refreshBackend()
      notify('Supporting document attached to the expense.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not attach the expense document.')
    } finally {
      setUploadingReceiptFor(null)
    }
  }

  const viewExpenseDocument = async (path: string) => {
    const documentWindow = window.open('about:blank', '_blank')
    if (!documentWindow) {
      notify('Allow pop-ups to view the supporting document.')
      return
    }
    documentWindow.opener = null
    try {
      const signedUrl = await getExpenseDocumentUrl(path)
      documentWindow.location.replace(signedUrl)
    } catch (error) {
      documentWindow.close()
      notify(error instanceof Error ? error.message : 'Could not open the supporting document.')
    }
  }

  const addMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const request: MaintenanceRequest = {
      id: `MT-${String(Date.now()).slice(-4)}`,
      title: String(form.get('title')).trim(),
      location: String(form.get('location')).trim(),
      priority: String(form.get('priority')) as MaintenanceRequest['priority'],
      status: 'Open',
      reportedBy: currentMember?.name ?? 'Anita Shah',
      date: today(),
    }
    const saved = await commitChange(
      (current) => ({ ...current, requests: [request, ...current.requests] }),
      () => saveMaintenance(request),
      'Maintenance request logged.',
    )
    if (saved) setModal(null)
  }

  const cycleMaintenance = async (requestId: string) => {
    const request = data.requests.find((item) => item.id === requestId)
    if (!request) return
    const nextStatus = request.status === 'Open' ? 'In progress' : 'Resolved'
    await commitChange(
      (current) => ({
        ...current,
        requests: current.requests.map((row) => row.id === requestId ? { ...row, status: nextStatus } : row),
      }),
      () => setMaintenanceStatus(requestId, nextStatus),
      'Maintenance status updated.',
    )
  }

  const addVisitor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const visitor: Visitor = {
      id: `VIS-${String(Date.now()).slice(-3)}`,
      name: String(form.get('name')).trim(),
      purpose: String(form.get('purpose')).trim(),
      unit: String(form.get('unit')).trim().toUpperCase(),
      time: new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      status: 'Inside',
    }
    const saved = await commitChange(
      (current) => ({ ...current, visitors: [visitor, ...current.visitors] }),
      () => saveVisitor(visitor),
      'Visitor entry added to the gate register.',
    )
    if (saved) setModal(null)
  }

  const checkoutVisitor = async (visitorId: string) => {
    await commitChange(
      (current) => ({ ...current, visitors: current.visitors.map((visitor) => visitor.id === visitorId ? { ...visitor, status: 'Checked out' } : visitor) }),
      () => saveVisitorCheckout(visitorId),
      'Visitor checkout recorded.',
    )
  }

  const addNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const notice: Notice = {
      id: `NT-${String(Date.now()).slice(-3)}`,
      title: String(form.get('title')).trim(),
      body: String(form.get('body')).trim(),
      date: today(),
      audience: 'All members',
    }
    const saved = await commitChange(
      (current) => ({ ...current, notices: [notice, ...current.notices] }),
      () => saveNotice(notice),
      'Notice published to the community board.',
    )
    if (saved) setModal(null)
  }

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const isAdministrator = session && currentMember?.role === 'Administrator'
    const member: Member & { email: string } = {
      id: `M-${String(Date.now()).slice(-5)}`,
      name: String(form.get('name')).trim(),
      unit: String(form.get('unit')).trim().toUpperCase(),
      role: roleLabel(isAdministrator ? String(form.get('role')) : 'member'),
      phone: String(form.get('phone')).trim(),
      email: String(form.get('email')).trim().toLowerCase(),
      status: isAdministrator ? 'Active' : 'Pending',
    }
    const saved = await commitChange(
      (current) => ({ ...current, members: [...current.members, member] }),
      () => isAdministrator ? provisionAuthMember(member) : saveMember(member),
      isAdministrator ? 'Google Auth user created and society access enabled.' : 'Member profile saved and is awaiting administrator approval.',
    )
    if (saved) setModal(null)
  }

  const editSocietyMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingMember) return
    const form = new FormData(event.currentTarget)
    const member = {
      name: String(form.get('name')).trim(),
      unit: String(form.get('unit')).trim().toUpperCase(),
      email: String(form.get('email')).trim() || undefined,
      role: roleLabel(String(form.get('role'))),
    }
    if (!member.name || !member.unit) return
    const saved = await commitChange(
      (current) => ({
        ...current,
        members: current.members.map((item) => item.id === editingMember.id ? { ...item, ...member } : item),
      }),
      () => saveSocietyMember(editingMember.id, member),
      'Member profile and role updated.',
    )
    if (saved) {
      setModal(null)
      setEditingMember(null)
    }
  }

  const updateOwnProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const member = currentMember ?? data.members.find((item) => item.status === 'Active')
    if (!member) return
    const name = String(form.get('name')).trim()
    const email = String(form.get('email')).trim() || undefined
    if (!name) return
    const saved = await commitChange(
      (current) => ({
        ...current,
        members: current.members.map((item) => item.id === member.id ? { ...item, name, email } : item),
      }),
      () => updateMyProfile({ name, email }),
      'Your profile was updated.',
    )
    if (saved) setModal(null)
  }

  const approveMember = async (memberId: string, role = 'member') => {
    await commitChange(
      (current) => ({ ...current, members: current.members.map((member) => member.id === memberId ? { ...member, role: roleLabel(role), status: 'Active' } : member) }),
      () => saveMemberReview(memberId, true, role),
      'Member access approved.',
    )
  }

  const expenseShareText = (expense: Expense) =>
    `Mantra Manor Duplex Owners Society — Expense update\n\n${expense.title}\nCategory: ${expense.category}\nVendor: ${expense.vendor}\nAmount: ${money(expense.amount)}\nDate: ${dateLabel(expense.date)}\nApproval status: ${statusLabel(expense.status)}\nSubmitted by: ${expense.submittedBy}\n\nShared for member transparency.`

  const shareExpense = (expense: Expense) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(expenseShareText(expense))}`, '_blank', 'noopener,noreferrer')
  }

  const shareNotice = (notice: Notice) => {
    const message = `Mantra Manor Duplex Owners Society\n\n${notice.title}\n\n${notice.body}\n\n${notice.audience} · ${dateLabel(notice.date)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const exportReport = () => {
    const rows = [
      ['Reference', 'Date', 'Description', 'Category', 'Vendor', 'Amount INR', 'Approval status', 'Submitted by'],
      ...data.expenses.map((expense) => [expense.id, expense.date, expense.title, expense.category, expense.vendor, String(expense.amount), statusLabel(expense.status), expense.submittedBy]),
    ]
    const csv = rows.map((row) => row.map((field) => `"${field.replace(/"/g, '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `mmdos-expense-register-${today()}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    notify('Expense register exported as CSV.')
  }

  const visibleExpenses = useMemo(() => data.expenses.filter((expense) =>
    `${expense.title} ${expense.category} ${expense.vendor} ${expense.id}`.toLowerCase().includes(search.toLowerCase()),
  ), [data.expenses, search])

  const isAdministrator = currentMember?.role === 'Administrator'
  const canAttachExpenseDocuments = Boolean(session && currentMember?.role === 'Treasurer')
  const isReadOnlyMember = currentMember?.role === 'Member'
  const canManageMembers = !session || isAdministrator || currentMember?.role === 'President' || currentMember?.role === 'Secretary'
  const canViewMemberManagement = canManageMembers || isReadOnlyMember
  const nav: { id: Section; label: string; icon: typeof Home; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'memberAdmin', label: 'Manage members', icon: ShieldCheck },
    { id: 'accounts', label: 'Accounts', icon: Wallet, badge: pendingExpenses },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, badge: openRequests },
    { id: 'security', label: 'Gate & security', icon: Shield },
    { id: 'notices', label: 'Notices', icon: Bell },
    { id: 'reports', label: 'Reports', icon: FileText },
  ]
  const profileMember = currentMember ?? data.members.find((member) => member.status === 'Active') ?? null
  const isSecurityUser = currentMember?.role === 'Security'
  const canAccessSecurity = !session || ['President', 'Secretary', 'Security', 'Member'].includes(currentMember?.role ?? '')
  const visibleSection: Section = isAdministrator ? 'memberAdmin'
    : isSecurityUser ? 'security'
    : !canAccessSecurity && section === 'security' || !canViewMemberManagement && section === 'memberAdmin' ? 'overview'
      : section
  const pageTitle = visibleSection === 'overview'
    ? `Good morning, ${profileMember?.name.split(' ')[0] ?? 'Anita'}`
    : sectionInfo[visibleSection].title
  const visibleNav = isAdministrator ? nav.filter((item) => item.id === 'memberAdmin')
    : isSecurityUser ? nav.filter((item) => item.id === 'security')
    : nav.filter((item) => (canAccessSecurity || item.id !== 'security') && (canViewMemberManagement || item.id !== 'memberAdmin'))
  const goToSection = (next: Section) => {
    if (isAdministrator && next !== 'memberAdmin') return
    if ((!canAccessSecurity && next === 'security') || (!canViewMemberManagement && next === 'memberAdmin')) return
    setSection(next)
  }
  const displayName = profileMember?.name ?? (session?.user.email || 'Anita Shah')
  const displayRole = profileMember ? `${profileMember.role} · ${profileMember.unit}` : 'President · A-01'
  if (session && backendLoading) return <main className="auth-screen"><section className="auth-panel"><p>Loading society information…</p></section></main>
  if (session && backendError) return <main className="auth-screen"><section className="auth-panel">
    <span className="panel-kicker">SOCIETY ACCESS</span><h1>Unable to open the society portal</h1>
    <div className="auth-error" role="alert">{backendError}</div>
    <button type="button" className="button button-secondary auth-submit" onClick={() => void onSignOut()}>Sign out</button>
  </section></main>

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon"><Building2 size={21} /></div>
          <div><strong>MMDOS</strong><small>COMMUNITY DESK</small></div>
          <button type="button" className="mobile-close icon-button" aria-label="Close menu" onClick={() => setMobileMenu(false)}><X size={18} /></button>
        </div>
        <div className="society-switcher"><div className="society-initial">M</div><div><b>Mantra Manor</b><small>Duplex Owners Society</small></div><ChevronDown size={15} /></div>
        <p className="nav-caption">SOCIETY</p>
        <nav className="main-nav" aria-label="Society navigation">
          {visibleNav.map(({ id, label, icon: Icon, badge }) => (
            <button type="button" className={`nav-item ${visibleSection === id ? 'nav-active' : ''}`} key={id} onClick={() => { goToSection(id); setMobileMenu(false) }}>
              <Icon size={17} strokeWidth={1.9} /><span>{label}</span>{badge ? <b className="nav-badge">{badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-status"><Sparkles size={16} /><span><b>{session ? 'Society portal' : 'Community demo'}</b><small>{session ? 'Connected to Supabase' : 'Free to explore · local device'}</small></span></div>
          <div className="signed-in"><div className="avatar">{displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="signed-copy"><b>{displayName}</b><small>{displayRole}</small></div>{session && <button type="button" className="sign-out-button" onClick={() => void onSignOut()}>Sign out</button>}</div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button type="button" className="icon-button menu-toggle" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
          <div className="crumb">Mantra Manor <span>/</span> <b>{visibleSection === 'overview' ? 'Overview' : pageTitle}</b></div>
          <div className="topbar-right"><span className={`demo-pill ${session ? 'live-pill' : ''}`}><i />{session ? 'LIVE SUPABASE' : 'DEMO DATA'}</span><span className="today-date"><CalendarDays size={15} />{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(renderDate)}</span>{!isSecurityUser && !isAdministrator && <button type="button" className="icon-button bell-button" aria-label={`${pendingExpenses} pending approvals`} onClick={() => setSection('accounts')}><Bell size={18} />{pendingExpenses > 0 && <i />}</button>}</div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">MANTRA MANOR DUPLEX OWNERS SOCIETY <span>·</span> COMMUNITY PORTAL</div><h1>{pageTitle}</h1><p>{sectionInfo[visibleSection].subtitle}</p></div>
            <div className="heading-actions">
              {visibleSection === 'accounts' && !isReadOnlyMember && <button type="button" className="button button-primary" onClick={() => setModal('expense')}><Plus size={16} />Record expense</button>}
              {visibleSection === 'maintenance' && !isReadOnlyMember && <button type="button" className="button button-primary" onClick={() => setModal('maintenance')}><Plus size={16} />New request</button>}
              {visibleSection === 'security' && !isReadOnlyMember && <button type="button" className="button button-primary" onClick={() => setModal('visitor')}><Plus size={16} />Log visitor</button>}
              {visibleSection === 'notices' && !isReadOnlyMember && <button type="button" className="button button-primary" onClick={() => setModal('notice')}><Plus size={16} />New notice</button>}
              {visibleSection === 'memberAdmin' && canManageMembers && <button type="button" className="button button-primary" onClick={() => setModal('member')}><Plus size={16} />Add member</button>}
              {visibleSection === 'reports' && <button type="button" className="button button-secondary" onClick={exportReport}><ArrowDownToLine size={16} />Export CSV</button>}
            </div>
          </div>

          {!session && <div className="local-notice"><ShieldCheck size={16} /><span><b>Transparent demo workspace.</b> This preview saves to this device only. Connect a society-owned backend before entering real member, financial, or security data.</span><button type="button" aria-label="Dismiss information" onClick={(event) => event.currentTarget.parentElement?.remove()}><X size={15} /></button></div>}
          {session && loginNotice && <div className="login-warning" role="alert"><ShieldCheck size={16} /><span>{loginNotice}</span></div>}

          {visibleSection === 'overview' && <Overview data={data} outstanding={outstanding} monthTotal={currentMonthExpenses} pending={pendingExpenses} openRequests={openRequests} canReviewExpenses={!isReadOnlyMember} onGo={goToSection} onApprove={advanceExpense} onShare={shareExpense} />}
          {visibleSection === 'members' && <MembersPage members={data.members} profile={profileMember} canEditProfile={Boolean(profileMember && !isReadOnlyMember && currentMember?.role !== 'Security')} onEditProfile={() => setModal('profile')} />}
          {visibleSection === 'memberAdmin' && canViewMemberManagement && <MemberAdminPage members={data.members} currentMemberId={currentMember?.id} canManageMembers={canManageMembers} canAssignAdministrator={isAdministrator} onEdit={(member) => { setEditingMember(member); setModal('editMember') }} onApprove={approveMember} />}
          {visibleSection === 'accounts' && <AccountsPage expenses={visibleExpenses} search={search} setSearch={setSearch} canReviewExpenses={!isReadOnlyMember} canAttachDocuments={canAttachExpenseDocuments} canViewDocuments={Boolean(session)} uploadingDocumentFor={uploadingReceiptFor} onAttachDocument={attachExpenseDocument} onViewDocument={viewExpenseDocument} onApprove={advanceExpense} onReject={rejectExpense} onShare={shareExpense} />}
          {visibleSection === 'maintenance' && <MaintenancePage requests={data.requests} readOnly={isReadOnlyMember} onAdvance={cycleMaintenance} />}
          {visibleSection === 'security' && <SecurityPage visitors={data.visitors} readOnly={isReadOnlyMember} onCheckout={checkoutVisitor} />}
          {visibleSection === 'notices' && <NoticesPage notices={data.notices} onShare={shareNotice} />}
          {visibleSection === 'reports' && <ReportsPage data={data} total={outstanding} onExport={exportReport} />}

          <footer className="page-footer"><span><ShieldCheck size={14} /> Built for clear, accountable communities</span><span>MMDOS Application <i /> 2026</span></footer>
        </div>
      </main>

      {modal && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
        {modal === 'expense' && <form className="modal-form" onSubmit={addExpense}>
          <label><span>Expense description</span><input name="title" placeholder="e.g. Generator servicing" maxLength={140} required /></label>
          <div className="form-row"><label><span>Category</span><select name="category"><option>Utilities</option><option>Repairs</option><option>Housekeeping</option><option>Security</option><option>Maintenance</option><option>Other</option></select></label><label><span>Amount (INR)</span><input name="amount" type="number" min="1" step="0.01" placeholder="0.00" required /></label></div>
          <div className="form-row"><label><span>Vendor / payee</span><input name="vendor" maxLength={120} required /></label><label><span>Date</span><input name="date" type="date" defaultValue={today()} required /></label></div>
          <div className="approval-info"><ShieldCheck size={16} /><span>New expenses enter a two-step review: <b>Treasurer → President</b>. All members can view each stage.</span></div>
          <FormActions onCancel={() => setModal(null)} submit="Submit for review" />
        </form>}
        {modal === 'maintenance' && <form className="modal-form" onSubmit={addMaintenance}>
          <label><span>What needs attention?</span><input name="title" maxLength={140} placeholder="Describe the issue" required /></label>
          <div className="form-row"><label><span>Location / unit</span><input name="location" maxLength={80} placeholder="e.g. North gate" required /></label><label><span>Priority</span><select name="priority"><option>Normal</option><option>High</option><option>Urgent</option></select></label></div>
          <FormActions onCancel={() => setModal(null)} submit="Log request" />
        </form>}
        {modal === 'visitor' && <form className="modal-form" onSubmit={addVisitor}>
          <label><span>Visitor / service provider</span><input name="name" maxLength={100} required /></label>
          <div className="form-row"><label><span>Purpose</span><input name="purpose" maxLength={100} required /></label><label><span>Visiting unit</span><input name="unit" maxLength={12} placeholder="A-01" required /></label></div>
          <div className="approval-info"><Shield size={16} /><span>Only record the information needed for gate operations. Avoid storing sensitive identity numbers.</span></div>
          <FormActions onCancel={() => setModal(null)} submit="Record entry" />
        </form>}
        {modal === 'notice' && <form className="modal-form" onSubmit={addNotice}>
          <label><span>Notice title</span><input name="title" maxLength={120} required /></label>
          <label><span>Message for members</span><textarea name="body" rows={5} maxLength={1000} required /></label>
          <div className="approval-info"><MessageCircle size={16} /><span>Post to the community board, then share a WhatsApp-ready message with your member group.</span></div>
          <FormActions onCancel={() => setModal(null)} submit="Publish notice" />
        </form>}
        {modal === 'member' && <form className="modal-form" onSubmit={addMember}>
          <label><span>Member name</span><input name="name" autoComplete="name" maxLength={100} required /></label>
          <label><span>Duplex unit</span><input name="unit" placeholder="A-01" maxLength={12} required /></label>
          <label><span>Verified Google sign-in email</span><input name="email" type="email" autoComplete="email" required /></label>
          <label><span>Contact mobile number (optional)</span><input name="phone" type="tel" autoComplete="tel" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" maxLength={16} /></label>
          {isAdministrator ? <>
            <label><span>Society role</span><select name="role" defaultValue="member" required>
              <option value="member">Member</option><option value="treasurer">Treasurer</option><option value="secretary">Secretary</option><option value="president">President</option><option value="security">Security</option><option value="administrator">Administrator</option>
            </select></label>
            <div className="approval-info"><Shield size={16} /><span>This creates or links the confirmed Supabase Auth user and activates the selected role. The user signs in with Google using this email.</span></div>
          </> : <div className="approval-info"><Shield size={16} /><span>Create and verify this email in Supabase Auth first. The profile will be linked to that existing account and remain pending until approved.</span></div>}
          <FormActions onCancel={() => setModal(null)} submit="Save member" />
        </form>}
        {modal === 'editMember' && editingMember && <form className="modal-form" onSubmit={editSocietyMember}>
          <label><span>Member name</span><input name="name" autoComplete="name" maxLength={120} defaultValue={editingMember.name} required /></label>
          <label><span>Duplex unit</span><input name="unit" maxLength={20} defaultValue={editingMember.unit} required /></label>
          <label><span>Contact mobile (managed by society)</span><input type="tel" value={editingMember.phone} readOnly /></label>
          <label><span>Contact email</span><input name="email" type="email" autoComplete="email" defaultValue={editingMember.email ?? ''} /></label>
          <label><span>Society role</span><select name="role" defaultValue={editingMember.role.toLowerCase()} required>
            <option value="member">Member</option><option value="treasurer">Treasurer</option><option value="secretary">Secretary</option><option value="president">President</option><option value="security">Security</option>{isAdministrator && <option value="administrator">Administrator</option>}
          </select></label>
          <div className="approval-info"><Shield size={16} /><span>Changing a role updates the member’s application access. The linked Google Auth identity and membership status are not changed here.</span></div>
          <FormActions onCancel={() => { setModal(null); setEditingMember(null) }} submit="Save member changes" />
        </form>}
        {modal === 'profile' && profileMember && <form className="modal-form" onSubmit={updateOwnProfile}>
          <label><span>Full name</span><input name="name" autoComplete="name" maxLength={120} defaultValue={profileMember.name} required /></label>
          <label><span>Contact email</span><input name="email" type="email" autoComplete="email" defaultValue={profileMember.email ?? ''} /></label>
          <label><span>Contact mobile (managed by the society)</span><input type="tel" value={profileMember.phone} readOnly /></label>
          <div className="approval-info"><Shield size={16} /><span>Your Google sign-in identity, unit, role, and membership status are managed by the society. Contact the administrator if they need updating.</span></div>
          <FormActions onCancel={() => setModal(null)} submit="Save my details" />
        </form>}
      </Modal>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  )
}

function Overview({ data, outstanding, monthTotal, pending, openRequests, canReviewExpenses, onGo, onApprove, onShare }: {
  data: SocietyData; outstanding: number; monthTotal: number; pending: number; openRequests: number
  canReviewExpenses: boolean
  onGo: (section: Section) => void; onApprove: (id: string) => void; onShare: (expense: Expense) => void
}) {
  const pendingExpenses = data.expenses.filter((expense) => ['submitted', 'treasurer_approved'].includes(expense.status))
  const latestVisitors = data.visitors.slice(0, 3)
  return <>
    <section className="welcome-card"><div className="welcome-copy"><span className="welcome-label"><Sparkles size={14} /> YOUR SOCIETY AT A GLANCE</span><h2>A better community,<br />built together.</h2><p>Keep decisions visible, expenses accountable and neighbours connected.</p><button type="button" className="welcome-link" onClick={() => onGo('reports')}>Explore society reports <ArrowUpRight size={15} /></button></div><div className="welcome-art" aria-hidden="true"><div className="sun-disc" /><div className="house house-back"><span /></div><div className="house house-front"><span /></div><div className="plant plant-one" /><div className="plant plant-two" /><div className="ground" /></div></section>
    <div className="metric-grid">
      <Metric icon={<Users size={17} />} label="Community members" value={String(data.members.length)} detail={`Across ${TOTAL_DUPLEX_HOMES} duplex homes`} tone="blue" onClick={() => onGo('members')} />
      <Metric icon={<CircleDollarSign size={17} />} label="Recorded expenses" value={money(outstanding)} detail="All recorded this period" tone="green" onClick={() => onGo('accounts')} />
      <Metric icon={<Clock3 size={17} />} label={canReviewExpenses ? 'Needs your review' : 'Pending approvals'} value={String(pending)} detail="Expenses in approval queue" tone="amber" onClick={() => onGo('accounts')} />
      <Metric icon={<Wrench size={17} />} label="Open maintenance" value={String(openRequests)} detail="Requests being tracked" tone="purple" onClick={() => onGo('maintenance')} />
    </div>
    <div className="overview-grid">
      <section className="panel approvals-panel">
        <PanelHeading kicker="TRANSPARENCY IN ACTION" title="Expense approvals" count={pending} action="View expense register" onClick={() => onGo('accounts')} />
        {pendingExpenses.length ? pendingExpenses.slice(0, 3).map((expense) => <ExpenseApprovalRow key={expense.id} expense={expense} canApprove={canReviewExpenses} onApprove={onApprove} onShare={onShare} />) : <EmptyState title="All clear" body="No expenses need review right now." />}
      </section>
      <section className="panel activity-panel">
        <PanelHeading kicker="GATE REGISTER" title="Recent visitors" action="Open security log" onClick={() => onGo('security')} />
        <div className="mini-visitor-list">{latestVisitors.map((visitor) => <div className="mini-visitor" key={visitor.id}><div className="visitor-avatar">{visitor.name.slice(0, 1)}</div><div><b>{visitor.name}</b><small>{visitor.purpose} · {visitor.unit}</small></div><span className={`presence-dot ${visitor.status === 'Inside' ? 'inside' : ''}`} /></div>)}</div>
        <button type="button" className="panel-action" onClick={() => onGo('security')}>View all gate entries <ArrowUpRight size={14} /></button>
      </section>
      <section className="panel month-panel">
        <div className="month-summary"><span className="month-icon"><Wallet size={17} /></span><span><small>THIS MONTH · {new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(renderDate).toUpperCase()}</small><b>{money(monthTotal)}</b><em>Total expenses recorded</em></span></div>
        <div className="month-bar"><i style={{ width: `${Math.min(96, monthTotal / Math.max(outstanding, 1) * 100)}%` }} /></div>
        <div className="month-foot"><span>Member contribution target</span><b>View statement <ArrowUpRight size={13} /></b></div>
      </section>
      <section className="panel notice-preview">
        <PanelHeading kicker="COMMUNITY BOARD" title="Latest notice" action="All notices" onClick={() => onGo('notices')} />
        {data.notices[0] ? <><div className="notice-date"><CalendarDays size={13} />{dateLabel(data.notices[0].date)} <span>·</span> {data.notices[0].audience}</div><h3>{data.notices[0].title}</h3><p>{data.notices[0].body}</p><button type="button" className="whatsapp-link" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${data.notices[0].title}\n\n${data.notices[0].body}`)}`, '_blank', 'noopener,noreferrer')}><MessageCircle size={15} />Share to WhatsApp</button></> : <EmptyState title="No notices yet" body="New notices will appear here." />}
      </section>
    </div>
  </>
}

function AccountsPage({ expenses, search, setSearch, canReviewExpenses, canAttachDocuments, canViewDocuments, uploadingDocumentFor, onAttachDocument, onViewDocument, onApprove, onReject, onShare }: {
  expenses: Expense[]
  search: string
  setSearch: (value: string) => void
  canReviewExpenses: boolean
  canAttachDocuments: boolean
  canViewDocuments: boolean
  uploadingDocumentFor: string | null
  onAttachDocument: (id: string, file: File) => void
  onViewDocument: (path: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onShare: (expense: Expense) => void
}) {
  const recordedTotal = expenses.filter((expense) => expense.status !== 'rejected').reduce((total, expense) => total + expense.amount, 0)
  return <>
    <div className="accounts-summary"><div><small>VISIBLE EXPENSES</small><b>{expenses.length}</b></div><div><small>RECORDED AMOUNT</small><b>{money(recordedTotal)}</b></div><div><small>APPROVAL FLOW</small><b><span className="flow-step">Treasurer</span><ArrowUpRight size={13} /><span className="flow-step">President</span></b></div></div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div><h2>Expense register</h2><p>Every request and approval is visible in the shared register.</p></div><label className="search-input"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search expenses" /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>DESCRIPTION</th><th>VENDOR</th><th>DATE</th><th>AMOUNT</th><th>APPROVAL STATUS</th><th>DOCUMENT</th><th>MEMBER UPDATE</th></tr></thead><tbody>
        {expenses.map((expense) => <tr key={expense.id}>
          <td><b>{expense.title}</b><small>{expense.id} · {expense.category}</small></td>
          <td>{expense.vendor}<small>By {expense.submittedBy}</small></td><td>{dateLabel(expense.date)}</td><td><b>{money(expense.amount)}</b></td>
          <td><ExpenseStatus status={expense.status} /></td>
          <td>{expense.receipt && canViewDocuments
            ? <button type="button" className="icon-button table-document" aria-label={`View document for ${expense.id}`} title="View supporting document" onClick={() => onViewDocument(expense.receipt)}><FileText size={16} /></button>
            : canAttachDocuments
              ? <label className={`icon-button table-document-upload ${uploadingDocumentFor === expense.id ? 'is-uploading' : ''}`} title="Attach supporting document">
                <Paperclip size={16} />
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  aria-label={`Attach document for ${expense.id}`}
                  disabled={uploadingDocumentFor !== null}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    if (file) onAttachDocument(expense.id, file)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              : <span className="no-document">—</span>}</td>
          <td><div className="table-actions">{canReviewExpenses && (expense.status === 'submitted' || expense.status === 'treasurer_approved' || expense.status === 'approved') ? <button type="button" className="icon-button table-approve" aria-label={`Advance ${expense.id} approval`} title="Advance to next approval step" onClick={() => onApprove(expense.id)}><Check size={16} /></button> : null}{canReviewExpenses && ['submitted', 'treasurer_approved'].includes(expense.status) ? <button type="button" className="icon-button table-reject" aria-label={`Return ${expense.id}`} title="Return for clarification" onClick={() => onReject(expense.id)}><X size={16} /></button> : null}<button type="button" className="icon-button table-share" aria-label={`Share ${expense.id} on WhatsApp`} title="Share expense with members" onClick={() => onShare(expense)}><MessageCircle size={16} /></button></div></td>
        </tr>)}
      </tbody></table>{expenses.length === 0 && <EmptyState title="No matching expenses" body="Try another search or record a new expense." />}</div>
      <div className="register-note"><ShieldCheck size={15} /> Approval history is preserved in this demo register. Share an expense summary with members through WhatsApp.</div>
    </section>
  </>
}

function MembersPage({ members, profile, canEditProfile, onEditProfile }: {
  members: Member[]
  profile: Member | null
  canEditProfile: boolean
  onEditProfile: () => void
}) {
  return <>
    {profile && <div className="my-profile-card"><div className="member-avatar avatar-0">{profile.name.split(' ').map((part) => part[0]).join('')}</div><div><span className="panel-kicker">MY PROFILE</span><b>{profile.name}</b><small>{profile.phone} · {profile.unit}</small></div>{canEditProfile && <button type="button" className="button button-secondary" onClick={onEditProfile}>Edit my details</button>}</div>}
    <div className="member-banner"><div className="member-banner-icon"><Users size={20} /></div><div><b>{TOTAL_DUPLEX_HOMES} duplex homes · {members.length} member profiles</b><small>Roles help separate society responsibilities. Pending members need an Auth account and administrator approval.</small></div><span className="member-shield"><ShieldCheck size={17} />Privacy first</span></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Member directory</h2><p>Only share contact details with authorized society members.</p></div><span className="data-count">{members.length} profiles</span></div>
      <div className="table-scroll"><table className="data-table members-table"><thead><tr><th>MEMBER</th><th>UNIT</th><th>COMMITTEE ROLE</th><th>MOBILE</th><th>STATUS</th></tr></thead><tbody>{members.map((member, index) => <tr key={member.id}><td><div className="member-cell"><span className={`member-avatar avatar-${index % 4}`}>{member.name.split(' ').map((part) => part[0]).join('')}</span><b>{member.name}</b></div></td><td>{member.unit}</td><td><span className="role-pill">{member.role}</span></td><td>{member.phone}</td><td><span className="active-member"><i />{member.status}</span></td></tr>)}</tbody></table></div>
    </section>
    <div className="privacy-card"><Shield size={17} /><span><b>Member data is private.</b> Do not share personal phone numbers in public or unmoderated groups.</span></div>
  </>
}

function MemberAdminPage({ members, currentMemberId, canManageMembers, canAssignAdministrator, onEdit, onApprove }: {
  members: Member[]
  currentMemberId?: string
  canManageMembers: boolean
  canAssignAdministrator: boolean
  onEdit: (member: Member) => void
  onApprove: (id: string, role: string) => void
}) {
  const [roles, setRoles] = useState<Record<string, string>>({})
  return <>
    <div className="approval-info"><Shield size={16} /><span>{canManageMembers ? 'Manage verified Google accounts and society roles. Administrators can create Auth users and activate their selected role; President and Secretary additions remain pending approval.' : 'Read-only view of active society member accounts.'}</span></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Member accounts</h2><p>{canManageMembers ? 'Edit member details and roles. Only active accounts can access society data.' : 'Member profiles are available to view only.'}</p></div><span className="data-count">{members.length} profiles</span></div>
      <div className="table-scroll"><table className="data-table members-table"><thead><tr><th>MEMBER</th><th>UNIT</th><th>ROLE</th><th>MOBILE</th><th>STATUS</th><th>ADMIN ACTION</th></tr></thead><tbody>{members.map((member, index) => <tr key={member.id}>
        <td><div className="member-cell"><span className={`member-avatar avatar-${index % 4}`}>{member.name.split(' ').map((part) => part[0]).join('')}</span><b>{member.name}</b><small>{member.email ?? 'No contact email'}</small></div></td>
        <td>{member.unit}</td><td><span className="role-pill">{member.role}</span></td><td>{member.phone}</td><td><span className="active-member"><i />{member.status}</span></td>
        <td><div className="member-review">{canManageMembers && member.status === 'Pending' && <>
          <select aria-label={`Assign role to ${member.name}`} value={roles[member.id] ?? member.role.toLowerCase()} onChange={(event) => setRoles((current) => ({ ...current, [member.id]: event.target.value }))}>
            <option value="member">Member</option><option value="treasurer">Treasurer</option><option value="secretary">Secretary</option><option value="president">President</option><option value="security">Security</option>{canAssignAdministrator && <option value="administrator">Administrator</option>}
          </select>
          <button type="button" className="button button-secondary small-button" onClick={() => onApprove(member.id, roles[member.id] ?? member.role.toLowerCase())}>Approve</button>
        </>}
        {!canManageMembers
          ? null
          : member.id === currentMemberId
          ? <span className="panel-kicker">Your profile</span>
          : member.role === 'Administrator' && !canAssignAdministrator
            ? <span className="panel-kicker">Administrator account</span>
          : <button type="button" className="button button-secondary small-button" aria-label={`Edit ${member.name}`} onClick={() => onEdit(member)}>Edit</button>}
        </div></td>
      </tr>)}</tbody></table></div>
    </section>
  </>
}

function MaintenancePage({ requests, readOnly, onAdvance }: { requests: MaintenanceRequest[]; readOnly: boolean; onAdvance: (id: string) => void }) {
  const active = requests.filter((request) => request.status !== 'Resolved')
  return <>
    <div className="maintenance-banner"><span className="maintenance-banner-icon"><Wrench size={20} /></span><div><b>{active.length} open requests</b><small>Keep requests visible from the first report through the fix.</small></div><div className="maintenance-counts"><span><i className="priority urgent" />{requests.filter((request) => request.priority === 'Urgent' && request.status !== 'Resolved').length} urgent</span><span><i className="priority normal" />{requests.filter((request) => request.status === 'Open').length} awaiting action</span></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Maintenance requests</h2><p>{readOnly ? 'View requests and their current status.' : 'Click a request to move it through Open → In progress → Resolved.'}</p></div><span className="data-count">{requests.length} total</span></div>
      <div className="request-list">{requests.map((request) => <article className="request-row" key={request.id}><div className={`request-icon priority-${request.priority.toLowerCase()}`}><Wrench size={17} /></div><div className="request-details"><div><b>{request.title}</b><span className={`priority-tag ${request.priority.toLowerCase()}`}>{request.priority}</span></div><p>{request.location} <span>·</span> Reported by {request.reportedBy} <span>·</span> {dateLabel(request.date)}</p><small>{request.id}</small></div><div className="request-status"><span className={`maintenance-status status-${request.status.toLowerCase().replace(' ', '-')}`}>{request.status}</span>{!readOnly && request.status !== 'Resolved' && <button type="button" className="button button-secondary small-button" onClick={() => onAdvance(request.id)}>{request.status === 'Open' ? 'Start work' : 'Mark resolved'}<ArrowUpRight size={14} /></button>}</div></article>)}</div>
    </section>
  </>
}

function SecurityPage({ visitors, readOnly, onCheckout }: { visitors: Visitor[]; readOnly: boolean; onCheckout: (id: string) => void }) {
  const inside = visitors.filter((visitor) => visitor.status === 'Inside').length
  return <>
    <div className="security-banner"><span><ShieldCheck size={19} /></span><div><b>{inside} visitors currently inside</b><small>Record visitor names and purpose only. Never store Aadhaar, ID numbers, or sensitive images in this demo.</small></div><span className="security-live"><i />GATE REGISTER</span></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Visitor log</h2><p>{readOnly ? 'View visitor entries and checkout status.' : 'Gate entries recorded by time, household and visit purpose.'}</p></div><span className="data-count">{visitors.length} entries</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>VISITOR</th><th>VISITING UNIT</th><th>PURPOSE</th><th>ENTRY TIME</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{visitors.map((visitor) => <tr key={visitor.id}><td><div className="member-cell"><span className="visitor-avatar">{visitor.name.slice(0, 1)}</span><b>{visitor.name}</b></div><small>{visitor.id}</small></td><td>{visitor.unit}</td><td>{visitor.purpose}</td><td>{visitor.time}</td><td><span className={`visitor-status ${visitor.status === 'Inside' ? 'visitor-inside' : ''}`}><i />{visitor.status}</span></td><td>{!readOnly && visitor.status === 'Inside' && <button type="button" className="button button-secondary small-button" onClick={() => onCheckout(visitor.id)}>Check out <Check size={14} /></button>}</td></tr>)}</tbody></table></div>
    </section>
    <div className="privacy-card"><Shield size={17} /><span><b>Privacy-aware security.</b> Retain gate records only as long as association policy requires and restrict access to authorized staff.</span></div>
  </>
}

function NoticesPage({ notices, onShare }: { notices: Notice[]; onShare: (notice: Notice) => void }) {
  return <div className="notice-grid">{notices.map((notice, index) => <article className={`notice-card notice-card-${index % 3}`} key={notice.id}><div className="notice-card-top"><span className="notice-icon"><Bell size={17} /></span><span className="notice-date">{dateLabel(notice.date)}</span></div><h2>{notice.title}</h2><p>{notice.body}</p><div className="notice-card-bottom"><span className="audience-tag"><Users size={13} />{notice.audience}</span><button type="button" className="button button-secondary small-button" onClick={() => onShare(notice)}><MessageCircle size={14} />Share on WhatsApp</button></div></article>)}{notices.length === 0 && <div className="panel notice-empty"><EmptyState title="No community notices" body="Publish an update for members to see it here." /></div>}<div className="whatsapp-caveat"><MessageCircle size={17} /><span><b>Member-controlled delivery.</b> WhatsApp opens a pre-filled message for the committee to review and share to its group. The app does not send messages automatically or expose member phone numbers.</span></div></div>
}

function ReportsPage({ data, total, onExport }: { data: SocietyData; total: number; onExport: () => void }) {
  const paid = data.expenses.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0)
  const awaiting = data.expenses.filter((item) => ['submitted', 'treasurer_approved'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0)
  const resolved = data.requests.filter((request) => request.status === 'Resolved').length
  const categoryTotals = [...new Set(data.expenses.map((item) => item.category))].map((category) => ({
    category, amount: data.expenses.filter((item) => item.category === category && item.status !== 'rejected').reduce((sum, item) => sum + item.amount, 0),
  })).sort((a, b) => b.amount - a.amount)
  const maxCategory = Math.max(...categoryTotals.map((item) => item.amount), 1)
  return <>
    <div className="report-heading-card"><div><span className="eyebrow">SOCIETY FINANCIAL SNAPSHOT</span><h2>Clear records build trust.</h2><p>Export the current expense register to share with members or your auditor.</p></div><button type="button" className="button button-primary" onClick={onExport}><ArrowDownToLine size={16} />Download expense CSV</button></div>
    <div className="report-metrics"><div><span className="report-metric-icon teal"><Wallet size={17} /></span><small>TOTAL RECORDED</small><b>{money(total)}</b><em>Across all non-rejected expenses</em></div><div><span className="report-metric-icon green"><CheckCircle2 size={17} /></span><small>PAID</small><b>{money(paid)}</b><em>Completed payments</em></div><div><span className="report-metric-icon amber"><Clock3 size={17} /></span><small>AWAITING APPROVAL</small><b>{money(awaiting)}</b><em>In committee review</em></div><div><span className="report-metric-icon violet"><Wrench size={17} /></span><small>REQUESTS RESOLVED</small><b>{resolved} / {data.requests.length}</b><em>Maintenance register</em></div></div>
    <div className="report-grid"><section className="panel report-panel"><PanelHeading kicker="EXPENSE BREAKDOWN" title="Spend by category" /><div className="category-chart">{categoryTotals.map((item, index) => <div className="category-row" key={item.category}><div><span>{item.category}</span><b>{money(item.amount)}</b></div><div className="category-track"><i className={`category-fill fill-${index % 4}`} style={{ width: `${item.amount / maxCategory * 100}%` }} /></div></div>)}</div></section><section className="panel report-panel"><PanelHeading kicker="REPORTS & EXPORTS" title="Audit-ready records" /><div className="report-link-list"><button type="button" onClick={onExport}><span className="report-link-icon"><FileText size={17} /></span><span><b>Expense register · CSV</b><small>Reference, approvals, amount and payee</small></span><ArrowDownToLine size={17} /></button><button type="button" onClick={() => window.print()}><span className="report-link-icon"><ClipboardList size={17} /></span><span><b>Print this report</b><small>Print to paper or a PDF file</small></span><ArrowUpRight size={16} /></button></div><p className="report-disclaimer"><ShieldCheck size={14} />This is a demo report for workflow preview, not a certified financial statement.</p></section></div>
  </>
}

function Metric({ icon, label, value, detail, tone, onClick }: { icon: ReactNode; label: string; value: string; detail: string; tone: string; onClick: () => void }) {
  return <button type="button" className={`metric-card tone-${tone}`} onClick={onClick}><div className="metric-top"><span>{label}</span><i>{icon}</i></div><b>{value}</b><small>{detail}</small></button>
}

function PanelHeading({ kicker, title, count, action, onClick }: { kicker: string; title: string; count?: number; action?: string; onClick?: () => void }) {
  return <div className="panel-heading"><div><span className="panel-kicker">{kicker}</span><h2>{title}{count !== undefined && count > 0 && <i className="heading-count">{count}</i>}</h2></div>{action && <button type="button" className="text-action" onClick={onClick}>{action}<ArrowUpRight size={14} /></button>}</div>
}

function ExpenseApprovalRow({ expense, canApprove, onApprove, onShare }: { expense: Expense; canApprove: boolean; onApprove: (id: string) => void; onShare: (expense: Expense) => void }) {
  return <div className="approval-row"><span className={`expense-icon category-${expense.category.toLowerCase().replace(/\s/g, '-')}`}><CircleDollarSign size={17} /></span><div className="approval-details"><b>{expense.title}</b><small>{expense.vendor} <span>·</span> {dateLabel(expense.date)} <span>·</span> {expense.id}</small></div><div className="approval-end"><b>{money(expense.amount)}</b><ExpenseStatus status={expense.status} /></div><button type="button" className="icon-button table-share" title="Share expense update" aria-label="Share expense update" onClick={() => onShare(expense)}><MessageCircle size={16} /></button>{canApprove && <button type="button" className="approve-icon" title="Advance approval" aria-label="Advance approval" onClick={() => onApprove(expense.id)}><Check size={16} /></button>}</div>
}

function ExpenseStatus({ status }: { status: ExpenseStatus }) {
  const labels: Record<ExpenseStatus, string> = { submitted: 'Treasurer review', treasurer_approved: 'President review', approved: 'Approved · unpaid', paid: 'Paid', rejected: 'Returned' }
  const classes: Record<ExpenseStatus, string> = { submitted: 'status-review', treasurer_approved: 'status-chair', approved: 'status-approved', paid: 'status-paid', rejected: 'status-rejected' }
  return <span className={`expense-status ${classes[status]}`}><i />{labels[status]}</span>
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><span><CheckCircle2 size={18} /></span><b>{title}</b><p>{body}</p></div>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading"><div className="modal-heading"><div><span className="panel-kicker">MANTRA MANOR COMMUNITY</span><h2 id="modal-heading">{title}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{children}</section></div>
}

function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary"><Check size={15} />{submit}</button></div>
}

function modalTitle(modal: 'expense' | 'maintenance' | 'visitor' | 'notice' | 'member' | 'editMember' | 'profile') {
  const titles = { expense: 'Record a society expense', maintenance: 'Log maintenance request', visitor: 'Record visitor entry', notice: 'Publish a community notice', member: 'Add member profile', editMember: 'Edit member profile', profile: 'Edit my details' }
  return titles[modal]
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function statusLabel(status: ExpenseStatus) {
  const labels: Record<ExpenseStatus, string> = { submitted: 'Treasurer review', treasurer_approved: 'President review', approved: 'Approved, unpaid', paid: 'Paid', rejected: 'Returned' }
  return labels[status]
}

export default App
