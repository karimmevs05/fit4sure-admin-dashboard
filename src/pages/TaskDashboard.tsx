import React, { useEffect, useMemo, useState } from 'react'
import { PieChart } from 'lucide-react'
import type { Task, ActivityLogEntry, StaffUser } from '../lib/launchTasks/types'
import { COLORS, Card, AttentionIconDot } from '../lib/launchTasks/ui'
import { buildAttention, formatCents } from '../lib/launchTasks/selectors'
import { ListView } from '../lib/launchTasks/ListView'
import { CalendarMeetingPanel } from '../lib/launchTasks/CalendarMeetingPanel'
import * as api from '../lib/launchTasks/api'

export default function TaskDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [roster, setRoster] = useState<StaffUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ user_id: number; display_name: string } | null>(null)
  const [activity, setActivity] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [investor, setInvestor] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

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

  useEffect(() => { loadAll() }, [])

  const refreshActivity = () => api.fetchActivityLog(20).then(setActivity)

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

        {!investor && <CalendarMeetingPanel tasks={tasks} today={today} />}

        {investor && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            <FinTile label="Budget" value={formatCents(financials.budget)} />
            <FinTile label="Committed" value={formatCents(financials.committed)} />
            <FinTile label="Paid to date" value={formatCents(financials.paid)} />
            <FinTile label="Remaining" value={formatCents(financials.remaining)} />
          </div>
        )}

        {!investor && (
          <Card className="px-4 py-3 mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-[6px]" style={{ color: '#9A8774' }}>Needs attention</div>
            {attention.length === 0 ? (
              <div className="text-[13px] py-1" style={{ color: '#CDBDA8' }}>Nothing urgent right now.</div>
            ) : attention.map((it, i) => (
              <div key={i} className="flex items-center gap-[10px] py-[7px] text-[13px] border-t first:border-t-0" style={{ borderColor: '#f5f4f0' }}>
                <AttentionIconDot icon={it.icon} />
                <span className="flex-1" style={{ color: COLORS.textPrimary }}>{it.name}</span>
                <span className="text-[11px]" style={{ color: '#B9A88F' }}>{it.task} · {it.reason}</span>
              </div>
            ))}
          </Card>
        )}

        {investor && (
          <Card className="px-4 py-[14px] mb-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide mb-[6px]" style={{ color: '#9A8774' }}>Completed</div>
            {accomplishments.length === 0 ? (
              <div className="text-[13px]" style={{ color: '#CDBDA8' }}>Nothing completed yet.</div>
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
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-[6px] cursor-pointer flex items-center gap-[6px]" style={{ color: '#9A8774' }} onClick={() => setActivityOpen((o) => !o)}>
              <span className="text-[9px] inline-block" style={{ transform: activityOpen ? 'rotate(90deg)' : undefined }}>▶</span> Recent activity <span style={{ color: '#CDBDA8', fontWeight: 400, textTransform: 'none' }}>({activity.length})</span>
            </div>
            {activityOpen && activity.map((a) => (
              <div key={a.id} className="flex gap-[10px] text-[13px] py-[7px] border-t first:border-t-0 items-baseline" style={{ borderColor: COLORS.divider }}>
                <span className="text-[12px] w-4 flex-shrink-0">{activityIcon(a.type)}</span>
                <span className="flex-1" style={{ color: COLORS.textSecondary }}><b>{a.actor}</b> {stripActor(a.text, a.actor)}</span>
                <span className="text-[11px] whitespace-nowrap" style={{ color: '#B9A88F' }}>{new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
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
    default: return '•'
  }
}

function FinTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-[14px] text-center">
      <div className="text-[12px] mb-1" style={{ color: '#9A8774' }}>{label}</div>
      <div className="text-[22px] font-semibold" style={{ color: COLORS.textPrimary }}>{value}</div>
    </Card>
  )
}
