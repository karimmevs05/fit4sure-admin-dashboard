export type GoalStatus = 'not_started' | 'in_progress' | 'done'

export type GoalStep = {
  id: number
  goal_id: number
  text: string
  done: boolean
  sort_order: number
}

export type Goal = {
  id: number
  name: string
  target_date: string | null
  main_focus: string | null
  status: GoalStatus
  sort_order: number
  steps: GoalStep[]
  stepsTotal: number
  stepsDone: number
  progressPct: number
}

export type PinMember = {
  user_id: number
  display_name: string
}

export type OverviewTaskRow = {
  id: number
  title: string
  due_date: string
  status: string
  owner_name: string | null
}

export type MobileOverview = {
  openTasks: number
  overdue: number
  spentThisMonthCents: number
  dueThisWeek: OverviewTaskRow[]
  recentlyCompleted: OverviewTaskRow[]
  goals: Goal[]
}
