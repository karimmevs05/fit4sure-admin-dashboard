export type UserStatus = 'available' | 'busy' | 'off'

export type StaffUser = {
  user_id: number
  email: string
  display_name: string
  department: string | null
  status: UserStatus
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Tag = 'operations' | 'admin' | 'marketing' | 'sales'
export type Urgency = 'critical' | 'workon' | 'eventually'
export type TaskStatus = 'open' | 'done'
export type Phase = 'week 1-2' | 'week 3-4' | 'week 5-8'
export type DueBucket = 'overdue' | 'thisweek' | 'later' | 'done'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'complete'

export type Todo = {
  id: number
  task_id: number
  text: string
  done: boolean
  urgency: Urgency
  sort_order: number
}

export type Expense = {
  id: number
  task_id: number
  date: string
  description: string
  amount_cents: number
  created_by: string | null
  created_at: string
}

export type Task = {
  id: number
  name: string
  owner_id: number
  owner_name: string
  tag: Tag
  urgency: Urgency
  due_date: string
  budget_cents: number
  committed_cents: number
  paid_cents: number
  expense_count: number
  status: TaskStatus
  needs_decision: boolean
  source_ref: string | null
  note: string | null
  note_updated_at: string | null
  note_updated_by: string | null
  phase: Phase
  todos: Todo[]
}

export type Milestone = {
  id: number
  name: string
  status: MilestoneStatus
  sort_order: number
  updated_at: string
}

export type ActivityLogEntry = {
  id: number
  task_id: number | null
  task_name: string | null
  actor: string
  type: 'note' | 'expense' | 'attachment' | 'complete' | 'decision_flag' | 'status_change'
  text: string
  created_at: string
}

export type DayNote = {
  date: string
  note: string
  updated_at?: string
}

export type AttentionIcon = 'overdue' | 'critical' | 'decision'

export type AttentionItem = {
  icon: AttentionIcon
  name: string
  task: string
  reason: string
  priority: number
}
