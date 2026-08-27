import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  X,
  Check,
  CheckSquare,
  Square,
  MessageSquare,
  Copy,
  Pencil,
  Search,
  Clock,
  Link2,
  ChefHat,
} from 'lucide-react'
import { WeeklyRecipeStatusWidget } from '../components/WeeklyRecipeStatusWidget'

const SOP_SOURCE_TYPES = new Set(['weekly_recipe_plan_batch', 'weekly_recipe_plan_production'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'critical' | 'high' | 'medium' | 'low'
type Status = 'not_started' | 'in_progress' | 'waiting' | 'blocked' | 'completed' | 'cancelled'
type OperationalDay = 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'

type Task = {
  id: number
  title: string
  description: string | null
  department: string
  owner_id: number | null
  owner_name?: string | null
  priority: Priority
  status: Status
  due_date: string | null
  operational_day: OperationalDay | null
  week_start: string | null
  estimated_minutes: number | null
  actual_minutes: number | null
  source_type: string | null
  source_id: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
  checklist_total?: number
  checklist_done?: number
}

type ChecklistItem = {
  id: number
  task_id: number
  label: string
  is_completed: boolean
  sort_order: number
}

type Comment = {
  id: number
  task_id: number
  staff_id: number | null
  staff_name?: string | null
  comment: string
  created_at: string
}

type TaskDetail = Task & { checklist_items: ChecklistItem[]; comments: Comment[] }

type Staff = {
  id: number
  name: string
  email: string | null
  department: string | null
  status: 'available' | 'busy' | 'off'
  is_active: boolean
}

type TodayOverview = {
  date: string
  total_tasks: number
  high_priority: number
  completed: number
  overdue: number
  estimated_minutes: number
}

type TaskFormState = {
  title: string
  description: string
  department: string
  owner_id: string
  priority: Priority
  status: Status
  due_date: string
  operational_day: OperationalDay
  estimated_minutes: string
  is_recurring: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPERATIONAL_DAYS: OperationalDay[] = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']

const OPERATIONAL_DAY_OFFSET: Record<OperationalDay, number> = {
  saturday: -1,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
}

const DAY_LABELS: Record<OperationalDay, string> = {
  saturday: 'Saturday',
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
}

const DAY_MISSION: Record<OperationalDay, string> = {
  saturday: 'Prep',
  sunday: 'Production',
  monday: 'Deliveries',
  tuesday: 'Procurement',
  wednesday: 'Prep + Production',
  thursday: 'Deliveries + Menu Release',
  friday: 'Order Cutoff + Administration',
}

const DEPARTMENTS = ['Kitchen', 'Sales', 'Marketing', 'Customer Success', 'Procurement', 'Finance', 'Operations', 'Administration', 'Personal']

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']
const STATUSES: Status[] = ['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled']

const DEPARTMENT_COLORS: Record<string, string> = {
  Kitchen: 'bg-[#D97706] text-white',
  Sales: 'bg-[#2E527F] text-white',
  Marketing: 'bg-[#A855F7] text-white',
  'Customer Success': 'bg-[#0EA5E9] text-white',
  Procurement: 'bg-[#16A34A] text-white',
  Finance: 'bg-[#059669] text-white',
  Operations: 'bg-[#8B4513] text-white',
  Administration: 'bg-[#6B7280] text-white',
  Personal: 'bg-[#9A7E6F] text-white',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'bg-[#DC2626] text-white',
  high: 'bg-[#D97706] text-white',
  medium: 'bg-[#EAB308] text-[#1F2937]',
  low: 'bg-[#9CA3AF] text-white',
}

const STATUS_COLORS: Record<Status, string> = {
  not_started: 'bg-[#E4D8C9] text-[#4B2B1D]',
  in_progress: 'bg-[#2E527F] text-white',
  waiting: 'bg-[#EAB308] text-[#1F2937]',
  blocked: 'bg-[#DC2626] text-white',
  completed: 'bg-[#16A34A] text-white',
  cancelled: 'bg-[#6B7280] text-white',
}

const STATUS_LABELS: Record<Status, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  order: 'Order',
  customer: 'Customer',
  recipe: 'Recipe',
  inventory_item: 'Inventory',
  inventory: 'Inventory',
  menu_plate: 'Menu',
  menu: 'Menu',
  weekly_recipe_plan: 'Menu Plan',
  weekly_recipe_plan_batch: 'Menu Plan',
  weekly_recipe_plan_production: 'Menu Plan',
  weekly_recipe_plan_shopping: 'Shopping List',
  production_task: 'Production',
}

const VIEWING_STAFF_KEY = 'opshub_viewing_staff_id'

// ---------------------------------------------------------------------------
// Date helpers (local-date safe -- avoids UTC off-by-one on date-only strings)
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// dateStr may be a plain "YYYY-MM-DD" (built locally, e.g. by addDays) or a
// full ISO timestamp straight from the API (Postgres DATE columns come back
// as "YYYY-MM-DDT00:00:00.000Z") -- slice to the date portion first so both
// parse the same local midnight instead of the timestamp form producing
// "T00:00:00.000ZT00:00:00" (Invalid Date).
function parseISODate(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`)
}

function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

// Saturday belongs to the operational week anchored on the Sunday right
// after it, not the Sunday before -- so a Saturday's week_start is tomorrow.
function getWeekStartOf(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  if (day === 6) d.setDate(d.getDate() + 1)
  else d.setDate(d.getDate() - day)
  return toISODate(d)
}

function operationalDayForToday(weekStartStr: string): OperationalDay {
  const today = toISODate(new Date())
  const diff = Math.round((parseISODate(today).getTime() - parseISODate(weekStartStr).getTime()) / 86400000)
  return OPERATIONAL_DAYS.find((d) => OPERATIONAL_DAY_OFFSET[d] === diff) || 'monday'
}

function formatWeekRange(weekStart: string): string {
  const start = addDays(weekStart, -1)
  const end = addDays(weekStart, 5)
  const fmt = (dateStr: string) => parseISODate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return parseISODate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function emptyWeekTasks(): Record<OperationalDay, Task[]> {
  return { saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] }
}

function emptyForm(day: OperationalDay): TaskFormState {
  return {
    title: '',
    description: '',
    department: DEPARTMENTS[0],
    owner_id: '',
    priority: 'medium',
    status: 'not_started',
    due_date: '',
    operational_day: day,
    estimated_minutes: '',
    is_recurring: false,
  }
}

function taskToForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description || '',
    department: task.department,
    owner_id: task.owner_id != null ? String(task.owner_id) : '',
    priority: task.priority,
    status: task.status,
    due_date: task.due_date || '',
    operational_day: task.operational_day || 'monday',
    estimated_minutes: task.estimated_minutes != null ? String(task.estimated_minutes) : '',
    is_recurring: false,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OperationsHubPage() {
  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  const [weekStart, setWeekStart] = useState<string>(() => getWeekStartOf(new Date()))
  const [weekTasks, setWeekTasks] = useState<Record<OperationalDay, Task[]>>(emptyWeekTasks())
  const [loadingWeek, setLoadingWeek] = useState(true)

  const [selectedDay, setSelectedDay] = useState<OperationalDay>(() => operationalDayForToday(getWeekStartOf(new Date())))
  const [dayDepartments, setDayDepartments] = useState<Record<string, Task[]>>({})
  const [loadingDay, setLoadingDay] = useState(true)
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({})

  const [staff, setStaff] = useState<Staff[]>([])
  const [todayOverview, setTodayOverview] = useState<TodayOverview | null>(null)
  const [myFocusTasks, setMyFocusTasks] = useState<Task[]>([])
  const [viewingStaffId, setViewingStaffId] = useState<string>(() => localStorage.getItem(VIEWING_STAFF_KEY) || '')

  const [search, setSearch] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'status' | 'title'>('due_date')

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formState, setFormState] = useState<TaskFormState>(emptyForm(selectedDay))
  const [savingTask, setSavingTask] = useState(false)

  const [detailTaskId, setDetailTaskId] = useState<number | null>(null)
  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [newChecklistLabel, setNewChecklistLabel] = useState('')
  const [newComment, setNewComment] = useState('')

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchWeek = async () => {
    try {
      setLoadingWeek(true)
      // Insert-if-not-exists per template per week -- safe to call every
      // time a week is viewed, so recurring tasks just show up without a
      // scheduled job.
      await axios.post(`${apiUrl}/api/admin/tasks/templates/generate-week/${weekStart}`, {}, authConfig)
      const response = await axios.get(`${apiUrl}/api/admin/tasks/week/${weekStart}`, authConfig)
      setWeekTasks({ ...emptyWeekTasks(), ...(response.data.data?.days || {}) })
    } catch (error) {
      console.error('Error fetching week tasks:', error)
    } finally {
      setLoadingWeek(false)
    }
  }

  const fetchDay = async () => {
    try {
      setLoadingDay(true)
      const response = await axios.get(`${apiUrl}/api/admin/tasks/day/${weekStart}/${selectedDay}`, authConfig)
      setDayDepartments(response.data.data?.departments || {})
    } catch (error) {
      console.error('Error fetching day tasks:', error)
    } finally {
      setLoadingDay(false)
    }
  }

  const fetchStaff = async () => {
    try {
      // Staff/admin accounts are unified into the real users table (2026-08-08) --
      // map user_id/display_name back onto the id/name shape this page expects.
      const response = await axios.get(`${apiUrl}/api/admin/users`, authConfig)
      const users = (response.data.data || []).map((u: any) => ({
        id: u.user_id,
        name: u.display_name,
        email: u.email,
        department: u.department,
        status: u.status,
        is_active: u.is_active,
      }))
      setStaff(users)
    } catch (error) {
      console.error('Error fetching staff:', error)
    }
  }

  const fetchTodayOverview = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/tasks/today-overview`, authConfig)
      setTodayOverview(response.data.data || null)
    } catch (error) {
      console.error('Error fetching today overview:', error)
    }
  }

  const fetchMyFocus = async (ownerId: string) => {
    if (!ownerId) {
      setMyFocusTasks([])
      return
    }
    try {
      const response = await axios.get(`${apiUrl}/api/admin/tasks/my-focus`, {
        ...authConfig,
        params: { owner_id: ownerId, limit: 5 },
      })
      setMyFocusTasks(response.data.data || [])
    } catch (error) {
      console.error('Error fetching my focus:', error)
    }
  }

  const fetchTaskDetail = async (taskId: number) => {
    try {
      setLoadingDetail(true)
      const response = await axios.get(`${apiUrl}/api/admin/tasks/${taskId}`, authConfig)
      setDetailTask(response.data.data || null)
    } catch (error) {
      console.error('Error fetching task detail:', error)
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    fetchStaff()
    fetchTodayOverview()
  }, [])

  useEffect(() => {
    fetchWeek()
  }, [weekStart])

  useEffect(() => {
    fetchDay()
  }, [weekStart, selectedDay])

  useEffect(() => {
    fetchMyFocus(viewingStaffId)
  }, [viewingStaffId])

  useEffect(() => {
    if (detailTaskId != null) fetchTaskDetail(detailTaskId)
    else setDetailTask(null)
  }, [detailTaskId])

  const refreshAll = () => {
    fetchWeek()
    fetchDay()
    fetchTodayOverview()
    fetchMyFocus(viewingStaffId)
    if (detailTaskId != null) fetchTaskDetail(detailTaskId)
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const openCreateModal = () => {
    setEditingTask(null)
    setFormState(emptyForm(selectedDay))
    setTaskModalOpen(true)
  }

  const openEditModal = (task: Task) => {
    setEditingTask(task)
    setFormState(taskToForm(task))
    setTaskModalOpen(true)
  }

  const closeTaskModal = () => {
    setTaskModalOpen(false)
    setEditingTask(null)
  }

  const submitTaskForm = async () => {
    if (!formState.title.trim()) return
    try {
      setSavingTask(true)
      const payload = {
        title: formState.title.trim(),
        description: formState.description.trim() || null,
        department: formState.department,
        owner_id: formState.owner_id ? Number(formState.owner_id) : null,
        priority: formState.priority,
        status: formState.status,
        due_date: formState.due_date || null,
        operational_day: formState.operational_day,
        week_start: weekStart,
        estimated_minutes: formState.estimated_minutes ? Number(formState.estimated_minutes) : null,
      }

      if (editingTask) {
        await axios.patch(`${apiUrl}/api/admin/tasks/${editingTask.id}`, payload, authConfig)
      } else if (formState.is_recurring) {
        await axios.post(`${apiUrl}/api/admin/tasks/recurring`, payload, authConfig)
      } else {
        await axios.post(`${apiUrl}/api/admin/tasks`, payload, authConfig)
      }

      closeTaskModal()
      refreshAll()
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setSavingTask(false)
    }
  }

  const toggleComplete = async (task: Task) => {
    try {
      await axios.post(`${apiUrl}/api/admin/tasks/${task.id}/complete`, { completed: task.status !== 'completed' }, authConfig)
      refreshAll()
    } catch (error) {
      console.error('Error toggling task completion:', error)
    }
  }

  const duplicateTask = async (task: Task) => {
    try {
      await axios.post(`${apiUrl}/api/admin/tasks/${task.id}/duplicate`, {}, authConfig)
      refreshAll()
    } catch (error) {
      console.error('Error duplicating task:', error)
    }
  }

  const deleteTask = async (task: Task) => {
    try {
      await axios.delete(`${apiUrl}/api/admin/tasks/${task.id}`, authConfig)
      if (detailTaskId === task.id) setDetailTaskId(null)
      refreshAll()
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const addChecklistItem = async () => {
    if (!detailTaskId || !newChecklistLabel.trim()) return
    try {
      await axios.post(
        `${apiUrl}/api/admin/tasks/${detailTaskId}/checklist-items`,
        { label: newChecklistLabel.trim() },
        authConfig
      )
      setNewChecklistLabel('')
      fetchTaskDetail(detailTaskId)
      fetchDay()
      fetchWeek()
    } catch (error) {
      console.error('Error adding checklist item:', error)
    }
  }

  const toggleChecklistItem = async (item: ChecklistItem) => {
    if (!detailTaskId) return
    try {
      await axios.patch(
        `${apiUrl}/api/admin/tasks/${detailTaskId}/checklist-items/${item.id}`,
        { is_completed: !item.is_completed },
        authConfig
      )
      fetchTaskDetail(detailTaskId)
    } catch (error) {
      console.error('Error updating checklist item:', error)
    }
  }

  const deleteChecklistItem = async (item: ChecklistItem) => {
    if (!detailTaskId) return
    try {
      await axios.delete(`${apiUrl}/api/admin/tasks/${detailTaskId}/checklist-items/${item.id}`, authConfig)
      fetchTaskDetail(detailTaskId)
      fetchDay()
      fetchWeek()
    } catch (error) {
      console.error('Error deleting checklist item:', error)
    }
  }

  const addComment = async () => {
    if (!detailTaskId || !newComment.trim()) return
    try {
      await axios.post(
        `${apiUrl}/api/admin/tasks/${detailTaskId}/comments`,
        { comment: newComment.trim(), staff_id: viewingStaffId ? Number(viewingStaffId) : null },
        authConfig
      )
      setNewComment('')
      fetchTaskDetail(detailTaskId)
    } catch (error) {
      console.error('Error adding comment:', error)
    }
  }

  const toggleDepartmentCollapsed = (dept: string) => {
    setCollapsedDepartments((prev) => ({ ...prev, [dept]: !prev[dept] }))
  }

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const weekStats = useMemo(() => {
    const stats: Record<OperationalDay, { total: number; completed: number; highPriority: number; byDept: Record<string, number> }> = {} as any
    for (const day of OPERATIONAL_DAYS) {
      const tasks = weekTasks[day] || []
      const byDept: Record<string, number> = {}
      for (const t of tasks) byDept[t.department] = (byDept[t.department] || 0) + 1
      stats[day] = {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === 'completed').length,
        highPriority: tasks.filter((t) => t.priority === 'critical' || t.priority === 'high').length,
        byDept,
      }
    }
    return stats
  }, [weekTasks])

  const filteredDayDepartments = useMemo(() => {
    const result: Record<string, Task[]> = {}
    for (const dept of Object.keys(dayDepartments)) {
      let tasks = dayDepartments[dept] || []
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        tasks = tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
      }
      if (filterOwner) tasks = tasks.filter((t) => String(t.owner_id) === filterOwner)
      if (filterPriority) tasks = tasks.filter((t) => t.priority === filterPriority)
      if (filterStatus) tasks = tasks.filter((t) => t.status === filterStatus)

      const rank: Record<Priority, number> = { critical: 1, high: 2, medium: 3, low: 4 }
      tasks = [...tasks].sort((a, b) => {
        if (sortBy === 'priority') return rank[a.priority] - rank[b.priority]
        if (sortBy === 'status') return a.status.localeCompare(b.status)
        if (sortBy === 'title') return a.title.localeCompare(b.title)
        return (a.due_date || '9999').localeCompare(b.due_date || '9999')
      })

      if (tasks.length > 0 || !search) result[dept] = tasks
    }
    return result
  }, [dayDepartments, search, filterOwner, filterPriority, filterStatus, sortBy])

  const staffById = useMemo(() => {
    const map: Record<number, Staff> = {}
    for (const s of staff) map[s.id] = s
    return map
  }, [staff])

  const activeStaffTaskCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const day of OPERATIONAL_DAYS) {
      for (const t of weekTasks[day] || []) {
        if (t.owner_id != null && t.status !== 'completed' && t.status !== 'cancelled') {
          counts[t.owner_id] = (counts[t.owner_id] || 0) + 1
        }
      }
    }
    return counts
  }, [weekTasks])

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderTaskCard = (task: Task) => {
    const isDone = task.status === 'completed'
    return (
      <div
        key={task.id}
        className={`rounded-lg border p-4 bg-white transition ${isDone ? 'border-[#2E527F] opacity-70' : 'border-[#E4D8C9]'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <button
              onClick={() => toggleComplete(task)}
              className="mt-0.5 flex-shrink-0 text-[#755B4C] hover:text-[#16A34A] transition"
              title={isDone ? 'Mark not started' : 'Mark complete'}
            >
              {isDone ? <CheckSquare className="h-5 w-5 text-[#16A34A]" /> : <Square className="h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => setDetailTaskId(task.id)}
                className={`text-left font-bold text-[#4B2B1D] hover:text-[#2E527F] transition truncate block w-full ${isDone ? 'line-through' : ''}`}
              >
                {task.title}
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DEPARTMENT_COLORS[task.department] || 'bg-[#9CA3AF] text-white'}`}>
                  {task.department}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                {task.source_type && task.source_id && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E4D8C9] text-[#4B2B1D]">
                    <Link2 className="h-2.5 w-2.5" />
                    {SOURCE_TYPE_LABELS[task.source_type] || task.source_type} #{task.source_id}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[#755B4C]">
                {task.owner_name && <span>{task.owner_name}</span>}
                {task.due_date && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(task.due_date)}
                  </span>
                )}
                {task.estimated_minutes != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{task.estimated_minutes} min
                  </span>
                )}
              </div>
              {!!task.checklist_total && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-[#E4D8C9] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#16A34A] transition-all"
                      style={{ width: `${Math.round(((task.checklist_done || 0) / task.checklist_total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[#755B4C]">
                    {task.checklist_done || 0}/{task.checklist_total} done
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {task.source_type && SOP_SOURCE_TYPES.has(task.source_type) && (
              <a
                href={`/operational-optimization/sop/${task.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-[#2E527F] hover:bg-[#EAF0F7] rounded transition"
                title="Open full SOP"
              >
                <ChefHat className="h-3.5 w-3.5" />
              </a>
            )}
            <button onClick={() => openEditModal(task)} className="p-1 text-[#755B4C] hover:text-[#2E527F] hover:bg-[#F9F5F0] rounded transition" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => duplicateTask(task)} className="p-1 text-[#755B4C] hover:text-[#2E527F] hover:bg-[#F9F5F0] rounded transition" title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => deleteTask(task)} className="p-1 text-[#D62F3D] hover:bg-[#FFF4F4] rounded transition" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loadingWeek && loadingDay) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="text-[#755B4C]">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <>
    <main className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Operations Hub</h1>
          <p className="mt-1 text-sm text-[#755B4C]">What needs to happen today, who owns it, what's blocking it</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-2 py-1">
            <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="p-1 text-[#4B2B1D] hover:text-[#2E527F] transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-[#4B2B1D] px-2 whitespace-nowrap">{formatWeekRange(weekStart)}</span>
            <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="p-1 text-[#4B2B1D] hover:text-[#2E527F] transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1 rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#254368] transition"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6 min-w-0">
          {/* Weekly timeline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {OPERATIONAL_DAYS.map((day) => {
              const stats = weekStats[day]
              const isSelected = day === selectedDay
              const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`text-left rounded-2xl border p-3 transition ${
                    isSelected ? 'border-2 border-[#2E527F] bg-[#EAF1F9]' : 'border-[#2E527F] bg-[rgba(251,247,240,0.9)] hover:border-[#2E527F]'
                  }`}
                >
                  <p className="text-xs font-bold text-[#4B2B1D]">{DAY_LABELS[day]}</p>
                  <p className="text-[10px] text-[#755B4C] truncate">{DAY_MISSION[day]}</p>
                  <p className="mt-2 text-xl font-extrabold text-[#4B2B1D]">{stats.total}</p>
                  <p className="text-[10px] text-[#755B4C]">{pct}% done</p>
                  {stats.highPriority > 0 && (
                    <span className="mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#DC2626] text-white">
                      {stats.highPriority} high priority
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Daily workspace */}
          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-extrabold text-[#4B2B1D]">
                {DAY_LABELS[selectedDay]}, {formatDate(addDays(weekStart, OPERATIONAL_DAY_OFFSET[selectedDay]))}
              </h2>
            </div>
            <p className="text-sm text-[#755B4C] mb-4">Today's mission: {DAY_MISSION[selectedDay]}</p>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-[10px] py-[7px] flex-1 min-w-[160px]">
                <Search className="h-3.5 w-3.5 text-[#2E527F]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks..."
                  className="text-[13px] outline-none flex-1 bg-transparent text-[#4B2B1D]"
                />
              </div>
              <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="text-[13px] rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-[10px] py-[7px] text-[#755B4C]">
                <option value="">All Owners</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="text-[13px] rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-[10px] py-[7px] text-[#755B4C]">
                <option value="">All Priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-[13px] rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-[10px] py-[7px] text-[#755B4C]">
                <option value="">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="text-[13px] rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-[10px] py-[7px] text-[#755B4C]">
                <option value="due_date">Sort: Due Date</option>
                <option value="priority">Sort: Priority</option>
                <option value="status">Sort: Status</option>
                <option value="title">Sort: Title</option>
              </select>
            </div>

            {loadingDay ? (
              <p className="text-sm text-[#755B4C]">Loading...</p>
            ) : Object.keys(filteredDayDepartments).length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-[#2E527F] bg-white p-8 text-center">
                <p className="text-sm text-[#755B4C]">No tasks for {DAY_LABELS[selectedDay]} yet. Click "New Task" to add one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {DEPARTMENTS.filter((dept) => filteredDayDepartments[dept]?.length).map((dept) => {
                  const tasks = filteredDayDepartments[dept] || []
                  const isCollapsed = collapsedDepartments[dept]
                  return (
                    <div key={dept} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                      <button
                        onClick={() => toggleDepartmentCollapsed(dept)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F9F5F0] hover:bg-[#F3EBDF] transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DEPARTMENT_COLORS[dept] || 'bg-[#9CA3AF] text-white'}`}>{dept}</span>
                          <span className="text-xs text-[#755B4C]">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
                        </div>
                        {isCollapsed ? <ChevronDown className="h-4 w-4 text-[#755B4C]" /> : <ChevronUp className="h-4 w-4 text-[#755B4C]" />}
                      </button>
                      {!isCollapsed && <div className="p-3 space-y-2">{tasks.map(renderTaskCard)}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
            <h3 className="text-sm font-extrabold text-[#4B2B1D] mb-3">Today's Overview</h3>
            {todayOverview ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-extrabold text-[#4B2B1D]">{todayOverview.total_tasks}</p>
                  <p className="text-[10px] text-[#755B4C]">Total Tasks</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-[#DC2626]">{todayOverview.high_priority}</p>
                  <p className="text-[10px] text-[#755B4C]">High Priority</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-[#16A34A]">{todayOverview.completed}</p>
                  <p className="text-[10px] text-[#755B4C]">Completed</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-[#D97706]">{todayOverview.overdue}</p>
                  <p className="text-[10px] text-[#755B4C]">Overdue</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#755B4C]">No data</p>
            )}
          </div>

          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-[#4B2B1D]">My Focus</h3>
              <select
                value={viewingStaffId}
                onChange={(e) => {
                  setViewingStaffId(e.target.value)
                  localStorage.setItem(VIEWING_STAFF_KEY, e.target.value)
                }}
                className="text-[10px] rounded-lg border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-1.5 py-1 text-[#755B4C]"
              >
                <option value="">Viewing as...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {!viewingStaffId ? (
              <p className="text-xs text-[#755B4C] italic">Select who you're viewing as to see your top tasks</p>
            ) : myFocusTasks.length === 0 ? (
              <p className="text-xs text-[#755B4C] italic">No open tasks</p>
            ) : (
              <div className="space-y-2">
                {myFocusTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDetailTaskId(t.id)}
                    className="w-full text-left rounded-lg border border-[#E4D8C9] bg-white p-2.5 hover:border-[#2E527F] transition"
                  >
                    <p className="text-xs font-bold text-[#4B2B1D] truncate">{t.title}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                      {t.due_date && <span className="text-[10px] text-[#755B4C]">{formatDate(t.due_date)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
            <h3 className="text-sm font-extrabold text-[#4B2B1D] mb-3">Team Availability</h3>
            {staff.filter((s) => s.is_active).length === 0 ? (
              <p className="text-xs text-[#755B4C] italic">No staff added yet</p>
            ) : (
              <div className="space-y-2">
                {staff.filter((s) => s.is_active).map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          s.status === 'available' ? 'bg-[#16A34A]' : s.status === 'busy' ? 'bg-[#D97706]' : 'bg-[#9CA3AF]'
                        }`}
                      />
                      <span className="text-xs text-[#4B2B1D] truncate">{s.name}</span>
                    </div>
                    <span className="text-[10px] text-[#755B4C] flex-shrink-0">{activeStaffTaskCounts[s.id] || 0} tasks</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit task modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-[#4B2B1D]">{editingTask ? 'Edit Task' : 'New Task'}</h2>
              <button onClick={closeTaskModal} className="text-[#755B4C] hover:text-[#4B2B1D]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#755B4C]">Title</label>
                <input
                  value={formState.title}
                  onChange={(e) => setFormState((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#755B4C]">Description</label>
                <textarea
                  value={formState.description}
                  onChange={(e) => setFormState((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Department</label>
                  <select
                    value={formState.department}
                    onChange={(e) => setFormState((f) => ({ ...f, department: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Owner</label>
                  <select
                    value={formState.owner_id}
                    onChange={(e) => setFormState((f) => ({ ...f, owner_id: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Priority</label>
                  <select
                    value={formState.priority}
                    onChange={(e) => setFormState((f) => ({ ...f, priority: e.target.value as Priority }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState((f) => ({ ...f, status: e.target.value as Status }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Operational Day</label>
                  <select
                    value={formState.operational_day}
                    onChange={(e) => setFormState((f) => ({ ...f, operational_day: e.target.value as OperationalDay }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  >
                    {OPERATIONAL_DAYS.map((d) => (
                      <option key={d} value={d}>{DAY_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Due Date</label>
                  <input
                    type="date"
                    value={formState.due_date}
                    onChange={(e) => setFormState((f) => ({ ...f, due_date: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#755B4C]">Estimated Minutes</label>
                  <input
                    type="number"
                    value={formState.estimated_minutes}
                    onChange={(e) => setFormState((f) => ({ ...f, estimated_minutes: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-2 text-sm text-[#4B2B1D]"
                  />
                </div>
              </div>

              {!editingTask && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.is_recurring}
                    onChange={(e) => setFormState((f) => ({ ...f, is_recurring: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#2E527F]"
                  />
                  <span className="text-xs font-bold text-[#4B2B1D]">
                    Repeat weekly on {DAY_LABELS[formState.operational_day]}
                  </span>
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={closeTaskModal} className="rounded-lg border border-[#2E527F] px-4 py-2 text-sm font-bold text-[#4B2B1D] hover:bg-[#F3EBDF] transition">
                Cancel
              </button>
              <button
                onClick={submitTaskForm}
                disabled={savingTask || !formState.title.trim()}
                className="rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#254368] transition disabled:opacity-50"
              >
                {savingTask ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task detail drawer: checklist + comments */}
      {detailTaskId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-[#4B2B1D]">Task Details</h2>
              <button onClick={() => setDetailTaskId(null)} className="text-[#755B4C] hover:text-[#4B2B1D]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingDetail || !detailTask ? (
              <p className="text-sm text-[#755B4C]">Loading...</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="font-extrabold text-[#4B2B1D]">{detailTask.title}</p>
                  {detailTask.description && <p className="mt-1 text-sm text-[#755B4C]">{detailTask.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DEPARTMENT_COLORS[detailTask.department] || 'bg-[#9CA3AF] text-white'}`}>
                      {detailTask.department}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[detailTask.priority]}`}>{detailTask.priority}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[detailTask.status]}`}>{STATUS_LABELS[detailTask.status]}</span>
                  </div>
                </div>

                {/* Checklist */}
                <div>
                  <h3 className="text-xs font-extrabold text-[#4B2B1D] mb-2">
                    Checklist ({detailTask.checklist_items.filter((i) => i.is_completed).length}/{detailTask.checklist_items.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detailTask.checklist_items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 group">
                        <button onClick={() => toggleChecklistItem(item)} className="text-[#755B4C] hover:text-[#16A34A] transition">
                          {item.is_completed ? <CheckSquare className="h-4 w-4 text-[#16A34A]" /> : <Square className="h-4 w-4" />}
                        </button>
                        <span className={`text-sm flex-1 text-[#4B2B1D] ${item.is_completed ? 'line-through text-[#2E527F]' : ''}`}>{item.label}</span>
                        <button onClick={() => deleteChecklistItem(item)} className="text-[#D62F3D] opacity-0 group-hover:opacity-100 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={newChecklistLabel}
                      onChange={(e) => setNewChecklistLabel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                      placeholder="Add checklist item..."
                      className="flex-1 rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-1.5 text-xs text-[#4B2B1D]"
                    />
                    <button onClick={addChecklistItem} className="rounded-lg bg-[#2E527F] text-white p-1.5 hover:bg-[#254368] transition">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <h3 className="text-xs font-extrabold text-[#4B2B1D] mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comments ({detailTask.comments.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {detailTask.comments.map((c) => (
                      <div key={c.id} className="rounded-lg border border-[#E4D8C9] bg-white p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#4B2B1D]">{c.staff_name || 'Unknown'}</span>
                          <span className="text-[10px] text-[#2E527F]">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#4B2B1D]">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addComment()}
                      placeholder="Add a comment..."
                      className="flex-1 rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-1.5 text-xs text-[#4B2B1D]"
                    />
                    <button onClick={addComment} className="rounded-lg bg-[#2E527F] text-white p-1.5 hover:bg-[#254368] transition">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
    <WeeklyRecipeStatusWidget />
    </>
  )
}
