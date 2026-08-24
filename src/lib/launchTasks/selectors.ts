// Pure computed-value functions, ported directly from the kiosk_launch_tab.html
// mockup's JS (computeMetrics, computeIndicators, collectTodoAttentionItems,
// buildFocus, buildDigest) -- the logic there is correct, only the data
// source changed (real API instead of DOM attributes / localStorage).
import type { Task, AttentionItem, AttentionIcon } from './types'

const DAY_MS = 86400000
const PROJECT_START = { y: 2026, m: 8, d: 1 } // fixed anchor, not relative to "today"

// Backend returns due_date as an ISO timestamp derived from a DATE column.
// Take the calendar-date digits directly and build a local midnight Date,
// exactly like the mockup's `[y,m,d] = dateStr.split('-')` -- never let the
// browser's own timezone re-interpret the instant, which can shift the day.
export function dateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

export function computeDueBucket(dueDate: Date, today: Date): 'overdue' | 'thisweek' | 'later' {
  const days = daysBetween(dueDate, today)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'thisweek'
  return 'later'
}

export function dueBucketForTask(task: Task, today: Date): 'overdue' | 'thisweek' | 'later' | 'done' {
  if (task.status === 'done') return 'done'
  return computeDueBucket(dateOnly(task.due_date), today)
}

export function phaseForDate(dueDate: Date): 'week 1-2' | 'week 3-4' | 'week 5-8' {
  const start = new Date(PROJECT_START.y, PROJECT_START.m - 1, PROJECT_START.d)
  const days = daysBetween(dueDate, start)
  if (days <= 13) return 'week 1-2'
  if (days <= 27) return 'week 3-4'
  return 'week 5-8'
}

function cleanTaskName(name: string): string {
  return name.replace(/OVERDUE|BLOCKED|NEEDS DECISION/g, '').trim()
}

// Union of overdue todos, critical todos due <=7d, and todos on
// needs_decision tasks -- grouped/deduped exactly as collectTodoAttentionItems
// in the mockup.
export function collectTodoAttentionItems(tasks: Task[], today: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const t of tasks) {
    const taskName = cleanTaskName(t.name)
    const days = daysBetween(dateOnly(t.due_date), today)
    const openTodos = t.todos.filter((td) => !td.done)
    if (!openTodos.length) continue

    const isOverdue = days < 0

    for (const td of openTodos) {
      const todoUrgency = td.urgency || t.urgency
      if (isOverdue) {
        items.push({ icon: 'overdue', name: td.text, task: taskName, taskId: t.id, reason: 'Overdue', priority: 0 })
      } else if (todoUrgency === 'critical' && days >= 0 && days <= 7 && t.status !== 'done') {
        items.push({ icon: 'critical', name: td.text, task: taskName, taskId: t.id, reason: `Due in ${days}d`, priority: 1 })
      }
      if (t.needs_decision) {
        items.push({ icon: 'decision', name: td.text, task: taskName, taskId: t.id, reason: 'Needs decision', priority: 3 })
      }
    }
  }
  return items
}

export function buildAttention(tasks: Task[], today: Date, limit = 5): AttentionItem[] {
  return [...collectTodoAttentionItems(tasks, today)].sort((a, b) => a.priority - b.priority).slice(0, limit)
}

export type MeetingGroup = { key: AttentionIcon; label: string; items: { name: string; meta: string }[] }

export function buildMeetingZone(tasks: Task[], today: Date): MeetingGroup[] {
  const raw = collectTodoAttentionItems(tasks, today)
  const groups: Record<AttentionIcon, { name: string; meta: string }[]> = { overdue: [], critical: [], decision: [] }
  for (const it of raw) groups[it.icon].push({ name: it.name, meta: `${it.task} · ${it.reason}` })

  const defs: { key: AttentionIcon; label: string }[] = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'critical', label: 'Critical, due soon' },
    { key: 'decision', label: 'Needs decision' },
  ]
  return defs.filter((d) => groups[d.key].length).map((d) => ({ ...d, items: groups[d.key] }))
}

export function tagProgress(tasks: Task[], tag: Task['tag']): { done: number; total: number; pct: number } {
  const inTag = tasks.filter((t) => t.tag === tag)
  const done = inTag.filter((t) => t.status === 'done').length
  const total = inTag.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

export function formatDueLabel(iso: string): string {
  return dateOnly(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}
