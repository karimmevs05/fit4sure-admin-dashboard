import React, { useEffect, useMemo, useState } from 'react'
import { PieChart, Pencil, X } from 'lucide-react'
import type { Task, ActivityLogEntry, StaffUser, MeetingHighlight } from '../lib/launchTasks/types'
import type { WeekSummary } from '../lib/launchTasks/api'
import { COLORS, Card, AttentionIconDot } from '../lib/launchTasks/ui'
import { buildAttention, formatCents } from '../lib/launchTasks/selectors'
import { ListView } from '../lib/launchTasks/ListView'
import { EditTaskForm } from '../lib/launchTasks/TaskRow'
import { CalendarBlock, MeetingTopicsPanel } from '../lib/launchTasks/CalendarMeetingPanel'
import * as api from '../lib/launchTasks/api'

export default function TaskDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [roster, setRoster] = useState<StaffUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ user_id: number; display_name: string } | null>(null)
  const [activity, setActivity] = useState<ActivityLogEntry[]>([])
  const [highlights, setHighlights] = useState<MeetingHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [investor, setInvestor] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [attentionEditTaskId, setAttentionEditTaskId] = useState<number | null>(null)
  const [weekSummary, setWeekSummary] = useState<WeekSummary | null>(null)

  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  const loadAll = async () => {
    try {
      setLoading(true)
      setError(null)
      const [t, a, u, me] = await Promise.all([
        api.fetchTasks(),
        api.fetchActivityLog(20),
        api.fetchUsers(),
        api.fetchCurrentUser(),
      ])
      setTasks(t)
      setActivity(a)
      setRoster(u)
      setCurrentUser(me)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load task dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    api.fetchMeetingHighlights().then(setHighlights)
    api.fetchThisWeekSummary().then(setWeekSummary).catch(() => {})
  }, [])

  const addHighlight = async (text: string) => {
    const created = await api.addMeetingHighlight(text)
    setHighlights((prev) => [...prev, created])
  }
  const editHighlight = async (id: number, text: string) => {
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, text } : h)))
    await api.updateMeetingHighlight(id, text)
  }
  const deleteHighlight = async (id: number) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id))
    await api.deleteMeetingHighlight(id)
  }

  const refreshActivity = () => api.fetchActivityLog(20).then(setActivity)

  const [undoingId, setUndoingId] = useState<number | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)

  const handleUndo = async (entryId: number, taskId: number | null) => {
    setUndoingId(entryId)
    setUndoError(null)
    try {
      const { task, task_deleted } = await api.undoActivity(entryId)
      if (task_deleted && taskId != null) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
      } else if (task) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      }
      await refreshActivity()
    } catch (err: any) {
      setUndoError(err.response?.data?.error || 'Failed to undo')
    } finally {
      setUndoingId(null)
    }
  }

  const handleChanged = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    refreshActivity()
  }
  const handleDeleted = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    refreshActivity()
  }
  const handleCreated = (task: Task) => {
    setTasks((prev) => [...prev, task])
    refreshActivity()
  }

  const attention = useMemo(() => buildAttention(tasks, today, 5), [tasks, today])

  const financials = useMemo(() => {
    const budget = tasks.reduce((s, t) => s + t.budget_cents, 0)
    const committed = tasks.reduce((s, t) => s + t.committed_cents, 0)
    const paid = tasks.reduce((s, t) => s + t.paid_cents, 0)
    return { budget, committed, paid, remaining: budget - committed }
  }, [tasks])

  const accomplishments = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())
  }, [tasks])

  if (loading) {
    return <div className="p-8" style={{ background: 'transparent', minHeight: '100vh' }}><p style={{ color: COLORS.textSecondary }}>Loading task dashboard…</p></div>
  }
  if (error) {
    return <div className="p-8" style={{ background: 'transparent', minHeight: '100vh' }}><p style={{ color: COLORS.red }}>{error}</p></div>
  }

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', padding: 32 }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <header className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[#FBF7F0] text-[#2E527F]">
              <PieChart className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Task management dashboard</h1>
              <p className="mt-1 text-sm">Where the team tracks what's due, what's overdue, and what needs a decision before launch.</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {!investor && currentUser && (
              <div className="text-[12px]" style={{ color: '#6B3410' }}>
                Logged in as <b style={{ color: '#3D2314' }}>{currentUser.display_name}</b>
              </div>
            )}
            <button
              className="text-[12px] font-bold rounded-full border px-[14px] py-[6px]"
              style={{
                borderColor: investor ? COLORS.blue : COLORS.cardBorder,
                background: investor ? COLORS.blue : COLORS.cardBg,
                color: investor ? '#fff' : COLORS.textSecondary,
              }}
              onClick={() => setInvestor((v) => !v)}
            >
              Investor view
            </button>
          </div>
        </header>

        {!investor && (
          <div className="rounded-3xl p-5 mb-3 border" style={{ background: COLORS.cardBg, borderColor: COLORS.cardBorder, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
            <div className="flex gap-[22px] items-stretch">
              <CalendarBlock
                tasks={tasks}
                today={today}
                roster={roster}
                defaultOwnerId={currentUser?.user_id}
                onChanged={handleChanged}
                onCreated={handleCreated}
              />

              <div className="flex-1 min-w-0 border-l pl-[22px]" style={{ borderColor: '#CDBDA8' }}>
                <div className="text-[13px] font-extrabold mb-3" style={{ color: '#3D2314' }}>This week's performance</div>
                {!weekSummary ? (
                  <div className="text-[13px]" style={{ color: '#6B3410' }}>Loading...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-[10px]">
                    <SummaryStat label="Meals" value={weekSummary.totalMeals.toLocaleString()} />
                    <SummaryStat label="Revenue" value={formatCents(weekSummary.totalRevenueCents)} />
                    <SummaryStat label="COGS" value={formatCents(weekSummary.totalCogsCents)} />
                    <SummaryStat
                      label="Margin"
                      value={`${weekSummary.marginPct}%`}
                      color={weekSummary.marginPct >= 0 ? COLORS.green : COLORS.red}
                    />
                    <SummaryStat
                      label="Profit"
                      value={formatCents(weekSummary.profitCents)}
                      color={weekSummary.profitCents >= 0 ? COLORS.green : COLORS.red}
                    />
                    <SummaryStat label="Prep time" value={formatPrepTime(weekSummary.prepTimeMinutes)} />
                  </div>
                )}

                <MeetingTopicsPanel
                  tasks={tasks}
                  today={today}
                  highlights={highlights}
                  onAddHighlight={addHighlight}
                  onEditHighlight={editHighlight}
                  onDeleteHighlight={deleteHighlight}
                />
              </div>
            </div>
          </div>
        )}

        {investor && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            <FinTile label="Budget" value={formatCents(financials.budget)} />
            <FinTile label="Committed" value={formatCents(financials.committed)} />
            <FinTile label="Paid to date" value={formatCents(financials.paid)} />
            <FinTile label="Remaining" value={formatCents(financials.remaining)} />
          </div>
        )}

        {!investor && (
          <Card className="px-5 py-4 mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-[6px]" style={{ color: COLORS.textMuted }}>Needs attention</div>
            {attention.length === 0 ? (
              <div className="text-[13px] py-1" style={{ color: COLORS.textMuted }}>Nothing urgent right now.</div>
            ) : attention.map((it, i) => (
              <div key={i} className="flex items-center gap-[10px] py-[7px] text-[13px] border-t first:border-t-0" style={{ borderColor: '#f5f4f0' }}>
                <AttentionIconDot icon={it.icon} />
                <span className="flex-1" style={{ color: COLORS.textPrimary }}>{it.name}</span>
                <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{it.task} · {it.reason}</span>
                <span
                  className="text-[13px] px-1 py-[2px] rounded cursor-pointer flex-shrink-0"
                  style={{ color: COLORS.textMuted }}
                  title={`Fix "${it.task}"`}
                  onClick={() => setAttentionEditTaskId(it.taskId)}
                >
                  <Pencil className="h-[13px] w-[13px]" />
                </span>
              </div>
            ))}
          </Card>
        )}

        {investor && (
          <Card className="px-5 py-4 mb-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide mb-[6px]" style={{ color: COLORS.textMuted }}>Completed</div>
            {accomplishments.length === 0 ? (
              <div className="text-[13px]" style={{ color: COLORS.textMuted }}>Nothing completed yet.</div>
            ) : accomplishments.map((t) => (
              <div key={t.id} className="text-[13px] py-[5px]" style={{ color: COLORS.textSecondary }}>
                ✓ {t.name} — done {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
              </div>
            ))}
          </Card>
        )}

        <ListView tasks={tasks} today={today} investor={investor} roster={roster} currentUserId={currentUser?.user_id} onChanged={handleChanged} onDeleted={handleDeleted} onCreated={handleCreated} />

        {!investor && (
          <div className="mt-6 mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-[6px] cursor-pointer flex items-center gap-[6px]" style={{ color: COLORS.textMuted }} onClick={() => setActivityOpen((o) => !o)}>
              <span className="text-[9px] inline-block" style={{ transform: activityOpen ? 'rotate(90deg)' : undefined }}>▶</span> Recent activity <span style={{ color: COLORS.textMuted, fontWeight: 400, textTransform: 'none' }}>({activity.length})</span>
            </div>
            {activityOpen && undoError && (
              <div className="text-[12px] py-[4px]" style={{ color: '#B3261E' }}>{undoError}</div>
            )}
            {activityOpen && activity.map((a) => (
              <div key={a.id} className="flex gap-[10px] text-[13px] py-[7px] border-t first:border-t-0 items-baseline" style={{ borderColor: COLORS.divider }}>
                <span className="text-[12px] w-4 flex-shrink-0">{activityIcon(a.type)}</span>
                <span className="flex-1" style={{ color: COLORS.textSecondary }}><b>{a.actor}</b> {stripActor(a.text, a.actor)}</span>
                {a.undone_at ? (
                  <span className="text-[11px] italic whitespace-nowrap" style={{ color: COLORS.textMuted }}>undone</span>
                ) : a.can_undo ? (
                  <button
                    onClick={() => handleUndo(a.id, a.task_id)}
                    disabled={undoingId === a.id}
                    className="text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                    style={{ color: COLORS.textMuted }}
                  >
                    {undoingId === a.id ? 'undoing...' : 'undo'}
                  </button>
                ) : null}
                <span className="text-[11px] whitespace-nowrap" style={{ color: COLORS.textMuted }}>{new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}

        {attentionEditTaskId != null && (() => {
          const attentionTask = tasks.find((t) => t.id === attentionEditTaskId)
          if (!attentionTask) return null
          return (
            <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-24 px-4 z-50 overflow-y-auto" onClick={() => setAttentionEditTaskId(null)}>
              <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[13px] font-semibold" style={{ color: COLORS.textPrimary }}>Fix "{attentionTask.name}"</span>
                  <span className="cursor-pointer" style={{ color: COLORS.textMuted }} onClick={() => setAttentionEditTaskId(null)}>
                    <X className="h-4 w-4" />
                  </span>
                </div>
                <EditTaskForm
                  task={attentionTask}
                  roster={roster}
                  onCancel={() => setAttentionEditTaskId(null)}
                  onSave={(t) => { handleChanged(t); setAttentionEditTaskId(null) }}
                />
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function stripActor(text: string, actor: string) {
  return text.startsWith(actor) ? text.slice(actor.length).trim() : text
}

function activityIcon(type: ActivityLogEntry['type']) {
  switch (type) {
    case 'note': return '✎'
    case 'expense': return '$'
    case 'attachment': return '📎'
    case 'complete': return '✓'
    case 'decision_flag': return '◆'
    case 'created': return '+'
    case 'edit': return '✎'
    case 'undo': return '↩'
    default: return '•'
  }
}

function FinTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-[12px] mb-1" style={{ color: COLORS.textMuted }}>{label}</div>
      <div className="text-[22px] font-semibold" style={{ color: COLORS.textPrimary }}>{value}</div>
    </Card>
  )
}

function SummaryStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-[10px]" style={{ background: '#faf8f4' }}>
      <div className="text-[10.5px] uppercase tracking-wide mb-[3px]" style={{ color: COLORS.textMuted }}>{label}</div>
      <div className="text-[17px] font-semibold" style={{ color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  )
}

// Prep time is tracked in minutes (recipe.prep_time_minutes x quantity sold
// this week) -- shown as "Xh Ym" once it crosses an hour so a real week's
// total labor investment reads at a glance, not as a triple-digit minute count.
function formatPrepTime(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
