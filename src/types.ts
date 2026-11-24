export type ExpenseStatus = 'submitted' | 'treasurer_approved' | 'approved' | 'paid' | 'rejected'

export type Expense = {
  id: string
  title: string
  category: string
  vendor: string
  amount: number
  date: string
  receipt: string
  status: ExpenseStatus
  submittedBy: string
}

export type MaintenanceRequest = {
  id: string
  title: string
  location: string
  priority: 'Normal' | 'High' | 'Urgent'
  status: 'Open' | 'In progress' | 'Resolved'
  reportedBy: string
  date: string
}

export type MaintenancePayment = {
  id: string
  memberId: string
  memberName: string
  unit: string
  billingMonth: string
  amount: number
  receivedOn: string
  reference: string
}

export type Visitor = {
  id: string
  name: string
  purpose: string
  unit: string
  time: string
  status: 'Inside' | 'Checked out'
}

export type Notice = {
  id: string
  title: string
  body: string
  date: string
  audience: string
}

export type Member = {
  id: string
  name: string
  unit: string
  role: string
  phone: string
  email?: string
  authLinked?: boolean
  status: 'Active' | 'Pending' | 'Suspended'
}

export type SocietyData = {
  expenses: Expense[]
  maintenancePayments: MaintenancePayment[]
  requests: MaintenanceRequest[]
  visitors: Visitor[]
  notices: Notice[]
  members: Member[]
}
