import React, { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import './MobileTeam.css'
import {
  fetchTasks, fetchCurrentUser, createTask, updateTask, addExpense,
} from '../lib/launchTasks/api'
import type { Task, Tag } from '../lib/launchTasks/types'
import {
  fetchPinMembers, fetchOverview, fetchGoals, createGoal, setGoalStatus,
  toggleGoalStep, fetchDayNote, saveDayNote,
} from '../lib/mobileTeam/api'
import type { Goal, MobileOverview, PinMember } from '../lib/mobileTeam/types'

const TAGS: Tag[] = ['operations', 'admin', 'marketing', 'sales']

// Same five accent colors used throughout the reviewed mockup, keyed by
// the real user_id of each PIN-enabled account (Karim=2, Xavier=3,
// Agnes=4, Robert=5, Brandon=6) so avatars stay visually consistent with
// what was already approved.
const AVATAR_COLORS: Record<number, string> = { 2: '#2E527F', 3: '#E89E93', 4: '#A4B89E', 5: '#ABBCCF', 6: '#E8B673' }
const FALLBACK_COLORS = ['#B9A88F', '#9A7E6F', '#755B4C']
function colorFor(userId: number): string {
  return AVATAR_COLORS[userId] || FALLBACK_COLORS[userId % FALLBACK_COLORS.length]
}
function initialFor(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysBetween(fromISO: string, toISOStr: string): number {
  return Math.round((new Date(toISOStr + 'T00:00:00').getTime() - new Date(fromISO + 'T00:00:00').getTime()) / 86400000)
}
function dueLabel(dueISO: string, done: boolean): { text: string; cls: string } {
  if (done) {
    const d = new Date(dueISO + 'T00:00:00')
    return { text: 'Done ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' }
  }
  const diff = daysBetween(todayISO(), dueISO)
  if (diff < 0) {
    const n = Math.abs(diff)
    return { text: `${n} day${n === 1 ? '' : 's'} overdue`, cls: 'late' }
  }
  if (diff === 0) return { text: 'Due today', cls: 'soon' }
  if (diff === 1) return { text: 'Due tomorrow', cls: 'soon' }
  const d = new Date(dueISO + 'T00:00:00')
  return { text: `Due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, cls: diff <= 2 ? 'soon' : '' }
}

const IconHome = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </svg>
)
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" />
  </svg>
)

export default function MobileTeamPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ user_id: number; display_name: string } | null>(null)
  const token = localStorage.getItem('token')

  // Just whoever's already signed in -- no separate PIN/member picker.
  // Same token the rest of the admin dashboard uses, so being logged in
  // on desktop (or having logged in here before) is enough; an invalid/
  // expired token sends you to the real login page, same as every other
  // route in this app.
  useEffect(() => {
    if (!token) { setAuthChecked(true); return }
    fetchCurrentUser()
      .then((u) => setCurrentUser(u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setAuthChecked(true))
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  if (!authChecked) return <div className="mt-login"><div className="mt-spinner">Loading...</div></div>
  if (!currentUser) return <Navigate to="/login" replace />
  return <MobileApp currentUser={currentUser} />
}

// ============================================================================
// Main app shell
// ============================================================================
function MobileApp({ currentUser }: { currentUser: { user_id: number; display_name: string } }) {
  const [tab, setTab] = useState<'home' | 'timeline' | 'tasks'>('home')
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [addGoalOpen, setAddGoalOpen] = useState(false)

  const [tasks, setTasks] = useState<Task[]>([])
  const [staff, setStaff] = useState<PinMember[]>([])
  const [overview, setOverview] = useState<MobileOverview | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  // A tap on Home's calendar preview or Next milestone card should land on
  // that exact day/goal in Timeline, not just the tab's own default state
  // -- these carry that target across the tab switch, consumed once by
  // TimelineView then cleared so re-opening the tab normally doesn't
  // re-trigger the jump.
  const [jumpDate, setJumpDate] = useState<string | null>(null)
  const [jumpGoalId, setJumpGoalId] = useState<number | null>(null)
  const goToCalendarDate = (iso: string) => { setJumpDate(iso); setTab('timeline') }
  const goToGoal = (goalId: number) => { setJumpGoalId(goalId); setTab('timeline') }

  const loadAll = () => {
    Promise.all([fetchTasks(), fetchPinMembers(), fetchOverview(), fetchGoals()])
      .then(([t, s, o, g]) => { setTasks(t); setStaff(s); setOverview(o); setGoals(g) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadAll() }, [])

  const refreshTasks = () => fetchTasks().then(setTasks)
  const refreshOverview = () => fetchOverview().then(setOverview)
  const refreshGoals = () => fetchGoals().then(setGoals)

  const toggleTask = (t: Task) => {
    const next = t.status === 'done' ? 'open' : 'done'
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)))
    updateTask(t.id, { status: next }).then(() => { refreshOverview() }).catch(() => refreshTasks())
  }

  return (
    <div className="mt-root">
      <div className="mt-topbar">
        <img className="mt-brand-logo" src="/preview/new-logo.png" alt="Fit For Sure" />
        <div className="mt-profile-chip" style={{ cursor: 'default' }}>
          <div className="mt-avatar" style={{ background: colorFor(currentUser.user_id) }}>{initialFor(currentUser.display_name)}</div>
          <span>{currentUser.display_name.split(' ')[0]}</span>
        </div>
      </div>

      {loading ? (
        <div className="mt-spinner">Loading...</div>
      ) : (
        <>
          <HomeView active={tab === 'home'} overview={overview} tasks={tasks} goals={goals}
            onToggleTask={toggleTask} onGoToCalendar={goToCalendarDate} onGoToGoal={goToGoal}
            onRefresh={() => { refreshOverview(); refreshTasks() }} />
          <TimelineView active={tab === 'timeline'} goals={goals} tasks={tasks}
            onOpenAddGoal={() => setAddGoalOpen(true)} onRefreshGoals={refreshGoals}
            jumpDate={jumpDate} jumpGoalId={jumpGoalId}
            onJumpConsumed={() => { setJumpDate(null); setJumpGoalId(null) }} />
          <TasksView active={tab === 'tasks'} tasks={tasks} onToggleTask={toggleTask} />
        </>
      )}

      <button className="mt-fab" onClick={() => setAddTaskOpen(true)}>+</button>

      <div className="mt-bottom-nav">
        <button className={`mt-nav-btn${tab === 'home' ? ' active' : ''}`} onClick={() => setTab('home')}><span className="ic"><IconHome /></span><span className="lb">Home</span></button>
        <button className={`mt-nav-btn${tab === 'timeline' ? ' active' : ''}`} onClick={() => setTab('timeline')}><span className="ic"><IconCalendar /></span><span className="lb">Timeline</span></button>
        <button className={`mt-nav-btn${tab === 'tasks' ? ' active' : ''}`} onClick={() => setTab('tasks')}><span className="ic"><IconCheck /></span><span className="lb">Tasks</span></button>
      </div>

      <AddTaskSheet open={addTaskOpen} onClose={() => setAddTaskOpen(false)} staff={staff}
        onCreated={() => { refreshTasks(); refreshOverview() }} />
      <AddGoalSheet open={addGoalOpen} onClose={() => setAddGoalOpen(false)} onCreated={refreshGoals} />
    </div>
  )
}

// ============================================================================
// HOME
// ============================================================================
function HomeView({ active, overview, tasks, goals, onToggleTask, onGoToCalendar, onGoToGoal, onRefresh }: {
  active: boolean; overview: MobileOverview | null; tasks: Task[]; goals: Goal[]
  onToggleTask: (t: Task) => void; onGoToCalendar: (iso: string) => void; onGoToGoal: (goalId: number) => void; onRefresh: () => void
}) {
  const [expandedDay, setExpandedDay] = useState<string>(todayISO())
  const [completedOpen, setCompletedOpen] = useState(false)
  const [note, setNote] = useState<{ date: string; note: string } | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => { fetchDayNote(todayISO()).then(setNote).catch(() => {}) }, [])

  const weekStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    return d
  }, [])
  const weekDays = useMemo(() => {
    const days: { iso: string; dow: string; num: number }[] = []
    const dows = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
      days.push({ iso: toISO(d), dow: dows[i], num: d.getDate() })
    }
    return days
  }, [weekStart])
  const tasksByDay = (iso: string) => tasks.filter((t) => t.due_date?.slice(0, 10) === iso)

  const nextGoal = goals.find((g) => g.status !== 'done') || goals[goals.length - 1]

  const saveNote = () => {
    saveDayNote(todayISO(), noteDraft).then((n) => { setNote(n); setEditingNote(false) })
  }

  if (!overview) return null

  return (
    <div className={`mt-view${active ? ' active' : ''}`}>
      <div className="mt-page-title">Overview</div>
      <div className="mt-section-pad">
        <div className="mt-stat-grid">
          <div className="mt-stat-card"><div className="mt-stat-num">{overview.openTasks}</div><div className="mt-stat-label">Open tasks</div></div>
          <div className="mt-stat-card warn"><div className="mt-stat-num">{overview.overdue}</div><div className="mt-stat-label">Overdue</div></div>
          <div className="mt-stat-card ok"><div className="mt-stat-num">${(overview.spentThisMonthCents / 100).toFixed(0)}</div><div className="mt-stat-label">Spent / mo</div></div>
          <div className="mt-stat-card soon"><div className="mt-stat-num">{overview.dueThisWeek.length}</div><div className="mt-stat-label">Due this wk</div></div>
        </div>

        <div className="mt-section-title">Needs attention</div>
        {overview.dueThisWeek.length === 0 ? <div className="mt-empty">Nothing needs attention right now.</div> : (
          overview.dueThisWeek.slice(0, 4).map((t) => {
            const dl = dueLabel(t.due_date.slice(0, 10), false)
            const full = tasks.find((x) => x.id === t.id)
            return (
              <div className="mt-task-row" key={t.id}>
                <div className="mt-check" onClick={() => full && onToggleTask(full)} />
                <div className="mt-task-main">
                  <div className="mt-task-title">{t.title}</div>
                  <div className={`mt-task-sub ${dl.cls}`}>{dl.text}{t.owner_name ? ` · ${t.owner_name}` : ''}</div>
                </div>
              </div>
            )
          })
        )}

        <div className="mt-section-title-row">
          <div className="mt-section-title" style={{ margin: 0 }}>Daily schedule</div>
          <div className="mt-section-link" onClick={() => onGoToCalendar(expandedDay || todayISO())}>Full calendar →</div>
        </div>
        <div className="mt-week-row">
          {weekDays.map((d) => {
            const dayTasks = tasksByDay(d.iso)
            return (
              <div key={d.iso} className={`mt-week-cell${dayTasks.length ? ' has-task' : ''}${d.iso === todayISO() ? ' today' : ''}${d.iso === expandedDay ? ' sel' : ''}`}
                onClick={() => setExpandedDay(expandedDay === d.iso ? '' : d.iso)}>
                <div className="wdow">{d.dow}</div><div className="wnum">{d.num}</div><div className="wdot" />
              </div>
            )
          })}
        </div>
        {expandedDay && (
          <div className="mt-week-expand">
            <div className="mt-week-expand-date">{new Date(expandedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            {tasksByDay(expandedDay).length === 0 ? <div className="mt-empty" style={{ padding: '4px 0' }}>Nothing due this day.</div> : (
              tasksByDay(expandedDay).map((t) => (
                <div className="mt-week-expand-row" key={t.id}>
                  <div className={`mt-check${t.status === 'done' ? ' done' : ''}`} onClick={() => onToggleTask(t)}>{t.status === 'done' ? '✓' : ''}</div>
                  <div className="mt-week-expand-name">{t.name}</div>
                  <div className="mt-week-expand-owner">{t.owner_name}</div>
                </div>
              ))
            )}
          </div>
        )}

        {nextGoal && (
          <>
            <div className="mt-section-title">Next milestone</div>
            <div className="mt-nm-card" onClick={() => onGoToGoal(nextGoal.id)}>
              <div className="mt-hz-ring" style={{ width: 40, height: 40, background: `conic-gradient(var(--amber) ${nextGoal.progressPct}%, var(--border2) 0)` }}>
                <div className="mt-hz-ring-inner" style={{ fontSize: 9 }}>{nextGoal.progressPct}%</div>
              </div>
              <div className="mt-nm-main">
                <div className="mt-nm-label">Next milestone</div>
                <div className="mt-nm-name">{nextGoal.name}</div>
                <div className="mt-nm-date">
                  {nextGoal.target_date ? `Due ${new Date(nextGoal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ` : ''}
                  {nextGoal.stepsDone}/{nextGoal.stepsTotal} steps
                </div>
              </div>
              <div className="mt-nm-chev">›</div>
            </div>
          </>
        )}

        <div className="mt-section-title">Completed</div>
        <div className={`mt-completed-toggle${completedOpen ? ' open' : ''}`} onClick={() => setCompletedOpen(!completedOpen)}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Completed recently · {overview.recentlyCompleted.length}</div>
          <div className="mt-completed-toggle-chev">▾</div>
        </div>
        <div className={`mt-completed-list${completedOpen ? ' open' : ''}`}>
          {overview.recentlyCompleted.map((t) => (
            <div className="mt-done-row" key={t.id}>
              <div className="mt-check done">✓</div>
              <div className="mt-task-main"><div className="mt-task-title">{t.title}</div><div className="mt-task-sub">{t.owner_name}</div></div>
            </div>
          ))}
        </div>

        <div className="mt-section-title">Team notes</div>
        <div className="mt-note-card">
          <div className="mt-note-top">Today's shared note</div>
          {editingNote ? (
            <div className="mt-note-edit">
              <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What's worth flagging for the team today..." />
              <button onClick={saveNote}>↑</button>
            </div>
          ) : (
            <div onClick={() => { setNoteDraft(note?.note || ''); setEditingNote(true) }} style={{ cursor: 'text' }}>
              <div className="mt-note-text">{note?.note || 'Tap to add a note for today...'}</div>
            </div>
          )}
        </div>

        <a className="mt-full-dash-link" href="/dashboard">Open full dashboard →</a>
      </div>
    </div>
  )
}

// ============================================================================
// TIMELINE (growth timeline + goals + calendar)
// ============================================================================
function TimelineView({ active, goals, tasks, onOpenAddGoal, onRefreshGoals, jumpDate, jumpGoalId, onJumpConsumed }: {
  active: boolean; goals: Goal[]; tasks: Task[]; onOpenAddGoal: () => void; onRefreshGoals: () => void
  jumpDate: string | null; jumpGoalId: number | null; onJumpConsumed: () => void
}) {
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(goals[0]?.id ?? null)
  const [calDate, setCalDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const viewRef = React.useRef<HTMLDivElement>(null)
  const calendarRef = React.useRef<HTMLDivElement>(null)
  const goalRefs = React.useRef<Record<number, HTMLDivElement | null>>({})

  // Landing here from Home's "Full calendar" link or "Next milestone" card
  // -- jump straight to that day or that goal (expanded), not just
  // whatever scroll position this tab happened to be left at on a
  // previous visit. Sets scrollTop directly rather than el.scrollIntoView
  // (animated scrollIntoView calls were getting interrupted by the
  // tab-switch re-render and silently landing nowhere).
  const scrollToEl = (getEl: () => HTMLElement | null) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const container = viewRef.current
      const el = getEl()
      if (!container || !el) return
      container.scrollTop = el.offsetTop - container.offsetTop
    }))
  }

  useEffect(() => {
    if (!active) return
    if (jumpDate) {
      const d = new Date(jumpDate + 'T00:00:00')
      setCalDate(new Date(d.getFullYear(), d.getMonth(), 1))
      setSelectedDate(jumpDate)
      scrollToEl(() => calendarRef.current)
      onJumpConsumed()
    } else if (jumpGoalId != null) {
      setExpandedGoalId(jumpGoalId)
      scrollToEl(() => goalRefs.current[jumpGoalId])
      onJumpConsumed()
    }
  }, [active, jumpDate, jumpGoalId, onJumpConsumed])

  const firstActiveIndex = goals.findIndex((g) => g.status !== 'done')

  const onToggleStep = (goal: Goal, idx: number) => {
    const step = goal.steps[idx]
    toggleGoalStep(step.id, !step.done).then(onRefreshGoals)
  }

  const shiftMonth = (delta: number) => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  const monthGrid = useMemo(() => {
    const year = calDate.getFullYear(); const month = calDate.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: { iso: string | null; day: number }[] = []
    for (let i = 0; i < firstDow; i++) cells.push({ iso: null, day: 0 })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ iso: toISO(new Date(year, month, d)), day: d })
    return cells
  }, [calDate])
  const tasksByDay = (iso: string) => tasks.filter((t) => t.due_date?.slice(0, 10) === iso)

  return (
    <div ref={viewRef} className={`mt-view${active ? ' active' : ''}`}>
      <div className="mt-page-title">Timeline</div>
      <div className="mt-section-pad" style={{ paddingTop: 4 }}>
        <div className="mt-section-title" style={{ marginTop: 0 }}>Growth timeline</div>
        <div className="mt-hz-timeline">
          {goals.map((g, i) => {
            const isDone = g.status === 'done'
            const isCurrent = !isDone && i === firstActiveIndex
            const ringColor = isDone ? 'var(--green)' : 'var(--amber)'
            return (
              <div className="mt-hz-phase" key={g.id}>
                <div className="mt-hz-date">{g.target_date ? new Date(g.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
                <div className="mt-hz-ring-wrap">
                  {i > 0 && <div className="mt-hz-connector" />}
                  <div className={`mt-hz-ring${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`} style={{ background: `conic-gradient(${ringColor} ${g.progressPct}%, var(--border2) 0)` }}>
                    <div className="mt-hz-ring-inner"><div className="mt-hz-ring-pct">{isDone ? '✓' : `${g.progressPct}%`}</div></div>
                  </div>
                </div>
                <div className="mt-hz-title">{g.name}</div>
              </div>
            )
          })}
        </div>

        <div className="mt-section-title">Goals</div>
        {goals.map((goal) => {
          const expanded = expandedGoalId === goal.id
          const isDone = goal.status === 'done'
          return (
            <div key={goal.id} ref={(el) => { goalRefs.current[goal.id] = el }}
              className={`mt-goal-card${expanded ? ' expanded' : ''}`} onClick={() => setExpandedGoalId(expanded ? null : goal.id)}>
              <div className="mt-goal-top">
                <div className="mt-goal-name">{goal.name}</div>
                <div className={`mt-goal-date${isDone ? ' done' : ''}`}>
                  {isDone ? 'Done' : (goal.target_date ? `By ${new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'No date')}
                </div>
              </div>
              {goal.main_focus && <div className="mt-goal-focus">{goal.main_focus}</div>}
              <div className="mt-goal-progress-row">
                <div className="mt-goal-bar-track"><div className="mt-goal-bar-fill" style={{ width: `${goal.progressPct}%` }} /></div>
                <div className="mt-goal-progress-text">{goal.stepsDone}/{goal.stepsTotal} steps</div>
                <div className="mt-goal-chev">▾</div>
              </div>
              {expanded && (
                <div className="mt-goal-steps" style={{ maxHeight: 900, opacity: 1, marginTop: 10 }}>
                  <div className="mt-goal-steps-label">Actionable steps</div>
                  {goal.steps.map((s, idx) => (
                    <div className="mt-goal-step-row" key={s.id}>
                      <div className={`mt-check${s.done ? ' done' : ''}`} onClick={(e) => { e.stopPropagation(); onToggleStep(goal, idx) }}>{s.done ? '✓' : ''}</div>
                      <div className={`mt-goal-step-text${s.done ? ' done' : ''}`}>{s.text}</div>
                    </div>
                  ))}
                  {goal.steps.length === 0 && <div className="mt-empty">No steps yet.</div>}
                  {isDone ? (
                    <div className="mt-goal-done-banner">✓ Goal complete</div>
                  ) : goal.stepsDone === goal.stepsTotal && goal.stepsTotal > 0 ? (
                    <div className="mt-goal-done-banner">✓ All steps complete</div>
                  ) : (
                    <div className="mt-goal-override" onClick={(e) => { e.stopPropagation(); setGoalStatus(goal.id, 'done').then(onRefreshGoals) }}>
                      Override: mark complete anyway
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div className="mt-add-goal-row" onClick={onOpenAddGoal}>+ Add goal</div>

        <div className="mt-section-title" ref={calendarRef}>Calendar</div>
        <div className="mt-cal-head">
          <div className="mt-cal-month">{calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
          <div className="mt-cal-nav"><span onClick={() => shiftMonth(-1)}>‹</span><span onClick={() => shiftMonth(1)}>›</span></div>
        </div>
        <div className="mt-cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div className="mt-cal-dow" key={i}>{d}</div>)}
          {monthGrid.map((c, i) => {
            if (!c.iso) return <div className="mt-cal-cell muted" key={i} />
            const dayTasks = tasksByDay(c.iso)
            const counts = { crit: 0, work: 0, done: 0 }
            dayTasks.forEach((t) => {
              if (t.status === 'done') counts.done++
              else if (daysBetween(todayISO(), c.iso!) < 0) counts.crit++
              else counts.work++
            })
            return (
              <div key={i} className={`mt-cal-cell${c.iso === todayISO() ? ' today' : ''}${c.iso === selectedDate ? ' sel' : ''}`} onClick={() => setSelectedDate(c.iso!)}>
                <div>{c.day}</div>
                <div className="mt-cal-pills">
                  {counts.crit > 0 && <span className="mt-cal-pill crit">{counts.crit}</span>}
                  {counts.work > 0 && <span className="mt-cal-pill work">{counts.work}</span>}
                  {counts.done > 0 && <span className="mt-cal-pill done">{counts.done}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-agenda-panel">
          <div className="mt-agenda-date">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          {tasksByDay(selectedDate).length === 0 ? <div className="mt-empty">Nothing due this day.</div> : (
            tasksByDay(selectedDate).map((t) => (
              <div className="mt-week-expand-row" key={t.id}>
                <div className={`mt-check${t.status === 'done' ? ' done' : ''}`}>{t.status === 'done' ? '✓' : ''}</div>
                <div className="mt-week-expand-name">{t.name}</div>
                <div className="mt-week-expand-owner">{t.owner_name}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TASKS (grouped by tag, matches the backend's Launch Tasks list view)
// ============================================================================
function TaskRow2({ t, onToggleTask }: { t: Task; onToggleTask: (t: Task) => void }) {
  const dl = dueLabel(t.due_date?.slice(0, 10) || todayISO(), t.status === 'done')
  return (
    <div className="mt-task-row2">
      <div className={`mt-check${t.status === 'done' ? ' done' : ''}`} onClick={() => onToggleTask(t)}>{t.status === 'done' ? '✓' : ''}</div>
      <div className="mt-task-row2-main">
        <div className={`mt-task-row2-title${t.status === 'done' ? ' done' : ''}`}>
          {t.name}
          {t.needs_decision && <span className="mt-badge">Needs decision</span>}
        </div>
        <div className="mt-task-row2-meta">
          <span>{t.owner_name}</span>
          <span className={dl.cls}>{dl.text}</span>
          {t.paid_cents > 0 && <span className="mt-pill paid">💵 ${(t.paid_cents / 100).toFixed(0)} paid</span>}
          {t.paid_cents === 0 && t.budget_cents > 0 && <span className="mt-pill pending">💵 ${(t.budget_cents / 100).toFixed(0)} budgeted</span>}
        </div>
      </div>
    </div>
  )
}

function TasksView({ active, tasks, onToggleTask }: { active: boolean; tasks: Task[]; onToggleTask: (t: Task) => void }) {
  const byTag: Record<string, Task[]> = {}
  tasks.forEach((t) => { (byTag[t.tag] = byTag[t.tag] || []).push(t) })

  // Sections collapse independently, and each section hides its own done
  // items behind a count toggle by default -- a tag with 60 tasks reads as
  // "what's actually left," not a wall of struck-through history.
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set())
  const [openCompleted, setOpenCompleted] = useState<Set<string>>(new Set())
  const toggleTag = (tag: string) => setCollapsedTags((cur) => {
    const next = new Set(cur); next.has(tag) ? next.delete(tag) : next.add(tag); return next
  })
  const toggleCompleted = (tag: string) => setOpenCompleted((cur) => {
    const next = new Set(cur); next.has(tag) ? next.delete(tag) : next.add(tag); return next
  })

  return (
    <div className={`mt-view${active ? ' active' : ''}`}>
      <div className="mt-page-title">Tasks</div>
      <div className="mt-section-pad" style={{ paddingTop: 4 }}>
        {TAGS.filter((tag) => byTag[tag]?.length).map((tag) => {
          const group = byTag[tag]
          const activeItems = group.filter((t) => t.status !== 'done')
          const doneItems = group.filter((t) => t.status === 'done')
          const pct = group.length ? Math.round((doneItems.length / group.length) * 100) : 0
          const isCollapsed = collapsedTags.has(tag)
          const isCompletedOpen = openCompleted.has(tag)
          return (
            <div className="mt-tag-group" key={tag}>
              <div className="mt-tag-head" style={{ cursor: 'pointer' }} onClick={() => toggleTag(tag)}>
                <div className="mt-tag-label">{tag}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="mt-tag-progress-text">{doneItems.length} of {group.length} done</div>
                  <div className={`mt-completed-toggle-chev${isCollapsed ? '' : ' open'}`} style={{ color: 'var(--muted)' }}>▾</div>
                </div>
              </div>
              {!isCollapsed && (
                <>
                  <div className="mt-tag-bar-track"><div className="mt-tag-bar-fill" style={{ width: `${pct}%` }} /></div>
                  {activeItems.length > 0 ? (
                    <div className="mt-tag-card">
                      {activeItems.map((t) => <TaskRow2 key={t.id} t={t} onToggleTask={onToggleTask} />)}
                    </div>
                  ) : (
                    <div className="mt-empty">Nothing left to do here.</div>
                  )}
                  {doneItems.length > 0 && (
                    <>
                      <div className={`mt-completed-toggle${isCompletedOpen ? ' open' : ''}`} style={{ marginTop: 8 }} onClick={() => toggleCompleted(tag)}>
                        <div style={{ fontSize: 11.5, fontWeight: 800 }}>{doneItems.length} completed</div>
                        <div className="mt-completed-toggle-chev">▾</div>
                      </div>
                      <div className={`mt-completed-list${isCompletedOpen ? ' open' : ''}`}>
                        <div className="mt-tag-card">
                          {doneItems.map((t) => <TaskRow2 key={t.id} t={t} onToggleTask={onToggleTask} />)}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )
        })}
        {tasks.length === 0 && <div className="mt-empty">No tasks yet.</div>}
      </div>
    </div>
  )
}

// ============================================================================
// Quick-add task sheet -- single creation entry point; category lives
// inside the form instead of a second surface.
// ============================================================================
function AddTaskSheet({ open, onClose, staff, onCreated }: {
  open: boolean; onClose: () => void; staff: PinMember[]; onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<Tag>('operations')
  const [due, setDue] = useState(todayISO())
  const [ownerId, setOwnerId] = useState<number | null>(null)
  const [costOpen, setCostOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open && staff.length && ownerId === null) setOwnerId(staff[0].user_id) }, [open, staff])

  const reset = () => { setTitle(''); setTag('operations'); setDue(todayISO()); setCostOpen(false); setAmount(''); setVendor(''); setDesc('') }

  const submit = async () => {
    if (!title.trim() || !ownerId) return
    setSaving(true)
    try {
      const task = await createTask({ name: title.trim(), owner_id: ownerId, tag, urgency: 'workon', due_date: due })
      if (costOpen && amount && parseFloat(amount) > 0) {
        const cents = Math.round(parseFloat(amount) * 100)
        const description = vendor ? `${desc || title.trim()} (${vendor})` : (desc || title.trim())
        await addExpense(task.id, { date: todayISO(), description, amount_cents: cents })
      }
      reset(); onCreated(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className={`mt-sheet-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`mt-sheet${open ? ' open' : ''}`}>
        <div className="mt-sheet-handle" />
        <div className="mt-sheet-title">New task</div>
        <div className="mt-field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pick up cooler parts" /></div>
        <div className="mt-field">
          <label>Category</label>
          <div className="mt-category-row">
            {TAGS.map((t) => <div key={t} className={`mt-category-pick${tag === t ? ' sel' : ''}`} onClick={() => setTag(t)}>{t}</div>)}
          </div>
        </div>
        <div className="mt-field"><label>Due date</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="mt-field">
          <label>Assign to</label>
          <div className="mt-row-scroll">
            {staff.map((s) => (
              <div key={s.user_id} className={`mt-pick${ownerId === s.user_id ? ' sel' : ''}`} onClick={() => setOwnerId(s.user_id)}>
                <div className="mt-avatar" style={{ background: colorFor(s.user_id), width: 36, height: 36, fontSize: 13 }}>{initialFor(s.display_name)}</div>
                <span>{s.display_name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
        {!costOpen ? (
          <div className="mt-cost-toggle" onClick={() => setCostOpen(true)}><span>＋ Add a cost</span><span>＋</span></div>
        ) : (
          <div className="mt-cost-block">
            <div className="mt-cost-grid">
              <div className="mt-field" style={{ marginBottom: 0 }}><label>Amount</label><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0.00" inputMode="decimal" /></div>
              <div className="mt-field" style={{ marginBottom: 0 }}><label>Vendor</label><input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Costco" /></div>
            </div>
            <div className="mt-field" style={{ marginTop: 9, marginBottom: 0 }}><label>What for</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" /></div>
          </div>
        )}
        <button className="mt-submit-btn" disabled={!title.trim() || saving} onClick={submit}>{saving ? 'Creating...' : 'Create task'}</button>
      </div>
    </>
  )
}

// ============================================================================
// Add Goal sheet
// ============================================================================
function AddGoalSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [focus, setFocus] = useState('')
  const [steps, setSteps] = useState([''])
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setDate(''); setFocus(''); setSteps(['']) }

  const submit = async () => {
    if (!name.trim() || !date) return
    setSaving(true)
    try {
      await createGoal({
        name: name.trim(), target_date: date, main_focus: focus.trim() || undefined,
        steps: steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text })),
      })
      reset(); onCreated(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className={`mt-sheet-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`mt-sheet${open ? ' open' : ''}`}>
        <div className="mt-sheet-handle" />
        <div className="mt-sheet-title">New goal</div>
        <div className="mt-field"><label>Goal name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Launch Soft Distribution" /></div>
        <div className="mt-field"><label>Target date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="mt-field"><label>Main focus</label><input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="What this goal is actually for" /></div>
        <div className="mt-field">
          <label>Actionable steps</label>
          {steps.map((s, i) => (
            <div className="mt-step-field-row" key={i}>
              <input value={s} onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} placeholder="e.g. Define initial delivery zones" />
              {steps.length > 1 && <div className="mt-step-remove" onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))}>×</div>}
            </div>
          ))}
          <div className="mt-add-step-row" onClick={() => setSteps((cur) => [...cur, ''])}>+ Add another step</div>
        </div>
        <button className="mt-submit-btn" disabled={!name.trim() || !date || saving} onClick={submit}>{saving ? 'Creating...' : 'Create goal'}</button>
      </div>
    </>
  )
}
