import React, { useEffect, useMemo, useState } from 'react'
import type { Task, Milestone, ActivityLogEntry, StaffUser } from '../lib/launchTasks/types'
import { COLORS, Card, AttentionIconDot } from '../lib/launchTasks/ui'
import { buildAttention, computeReadinessPct, formatCents } from '../lib/launchTasks/selectors'
import { ListView } from '../lib/launchTasks/ListView'
import { CalendarMeetingPanel } from '../lib/launchTasks/CalendarMeetingPanel'
import * as api from '../lib/launchTasks/api'

const MILESTONE_CYCLE: Milestone['status'][] = ['not_started', 'in_progress', 'complete']

export default function TaskDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [roster, setRoster] = useState<StaffUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ user_id: number; display_name: string } | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
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
      const [t, m, a, u, me] = await Promise.all([
        api.fetchTasks(),
        api.fetchMilestones(),
        api.fetchActivityLog(20),
        api.fetchUsers(),
        api.fetchCurrentUser(),
      ])
      setTasks(t)
      setMilestones(m)
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

  const cycleMilestone = async (m: Milestone) => {
    if (investor) return
    const idx = MILESTONE_CYCLE.indexOf(m.status)
    const next = MILESTONE_CYCLE[(idx + 1) % MILESTONE_CYCLE.length]
    const updated = await api.updateMilestone(m.id, next)
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)))
  }

  const attention = useMemo(() => buildAttention(tasks, today, 5), [tasks, today])
  const readinessPct = useMemo(() => computeReadinessPct(tasks), [tasks])

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
    return <div className="p-8" style={{ background: COLORS.pageBg, minHeight: '100vh' }}><p style={{ color: COLORS.textSecondary }}>Loading task dashboard…</p></div>
  }
  if (error) {
    return <div className="p-8" style={{ background: COLORS.pageBg, minHeight: '100vh' }}><p style={{ color: COLORS.red }}>{error}</p></div>
  }

  return (
    <div style={{ background: COLORS.pageBg, minHeight: '100vh', padding: 32 }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div className="border-b mb-4 flex items-center justify-between" style={{ borderColor: COLORS.cardBorder }}>
          <div className="flex gap-6">
            <div className="text-[15px] font-extrabold pb-[10px]" style={{ color: COLORS.textPrimary, borderBottom: `2px solid ${COLORS.green}` }}>
              Task management dashboard
            </div>
          </div>
          {!investor && currentUser && (
            <div className="pb-[10px] text-[12px]" style={{ color: COLORS.textMuted }}>
              Logged in as <b style={{ color: COLORS.textSecondary }}>{currentUser.display_name}</b>
            </div>
          )}
        </div>

        <div className="flex justify-end items-center mb-4">
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

        {!investor && <CalendarMeetingPanel tasks={tasks} today={today} />}

        <Card className="p-[14px_16px] mb-3">
          <div className="flex justify-between text-[13px] mb-2" style={{ color: COLORS.textSecondary }}>
            Launch readiness <b style={{ color: COLORS.textPrimary }}>{readinessPct}%</b>
          </div>
          <div className="h-[7px] rounded-md overflow-hidden" style={{ background: '#eee' }}>
            <div className="h-full rounded-md" style={{ width: `${readinessPct}%`, background: COLORS.green }} />
          </div>
          <div className="text-[11px] mt-[6px]" style={{ color: '#B9A88F' }}>Critical tasks count double toward readiness</div>
        </Card>

        <Card className="flex items-start px-4 pt-[18px] pb-[14px] mb-3">
          {milestones.map((m, i) => (
            <div key={m.id} className="flex flex-col items-center flex-1 relative" style={{ cursor: investor ? 'default' : 'pointer' }} onClick={() => cycleMilestone(m)}>
              {i < milestones.length - 1 && (
                <div className="absolute z-0" style={{ top: 6, left: '50%', width: '100%', height: 2, background: m.status === 'complete' ? COLORS.green : '#e5e3dc' }} />
              )}
              <div
                className="rounded-full z-10 mb-[7px]"
                style={{
                  width: 14, height: 14, border: '3px solid #fff', boxSizing: 'content-box',
                  background: m.status === 'complete' ? COLORS.green : m.status === 'in_progress' ? COLORS.orange : '#e5e3dc',
                }}
              />
              <div className="text-[10.5px] text-center max-w-[82px]" style={{ color: m.status === 'not_started' ? '#B9A88F' : COLORS.textPrimary, lineHeight: 1.3 }}>{m.name}</div>
            </div>
          ))}
        </Card>

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
