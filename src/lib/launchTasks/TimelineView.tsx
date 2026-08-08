import React, { useEffect, useMemo, useState } from 'react'
import type { Task, Tag, Urgency, StaffUser } from './types'
import { COLORS, TagBadge, UrgencyDot } from './ui'
import { computeMetrics, computeScheduleAndBudget, buildMeetingZone, dueBucketForTask, dateOnly } from './selectors'
import { AddTaskForm } from './AddTaskForm'
import * as api from './api'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function statusChipClass(status: 'good' | 'watch' | 'risk') {
  if (status === 'good') return { background: '#EAF5EC', color: '#16834A' }
  if (status === 'watch') return { background: '#FFF0E1', color: COLORS.orange }
  return { background: COLORS.redBg, color: COLORS.red }
}

function barFillColor(status: 'good' | 'watch' | 'risk') {
  if (status === 'good') return COLORS.green
  if (status === 'watch') return COLORS.orange
  return COLORS.red
}

export function TimelineView({ tasks, today, investor, roster, currentUserId, onChanged, onCreated }: {
  tasks: Task[]
  today: Date
  investor: boolean
  roster: StaffUser[]
  currentUserId?: number
  onChanged: (t: Task) => void
  onCreated: (t: Task) => void
}) {
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()))
  const [cfOwner, setCfOwner] = useState('')
  const [cfUrgency, setCfUrgency] = useState('')
  const [cfStatus, setCfStatus] = useState('')
  const [cfTag, setCfTag] = useState('')
  const [cfDue, setCfDue] = useState('')
  const [addingDay, setAddingDay] = useState(false)

  const metrics = useMemo(() => computeMetrics(tasks, today), [tasks, today])
  const sb = useMemo(() => computeScheduleAndBudget(tasks, today), [tasks, today])
  const meetingGroups = useMemo(() => buildMeetingZone(tasks, today), [tasks, today])

  const calendarTasks = useMemo(() => {
    let list = tasks.filter((t) =>
      (!cfOwner || String(t.owner_id) === cfOwner) &&
      (!cfUrgency || t.urgency === cfUrgency) &&
      (!cfStatus || t.status === cfStatus) &&
      (!cfTag || t.tag === cfTag) &&
      (!cfDue || dueBucketForTask(t, today) === cfDue)
    )
    return list
  }, [tasks, cfOwner, cfUrgency, cfStatus, cfTag, cfDue, today])

  const clearCalFilters = () => { setCfOwner(''); setCfUrgency(''); setCfStatus(''); setCfTag(''); setCfDue('') }

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate())

  const dayTasksFor = (dateStr: string) => calendarTasks.filter((t) => t.due_date.slice(0, 10) === dateStr)
  const selectedTasks = dayTasksFor(selectedDate)

  const createForDay = async (data: { name: string; owner_id: number; tag: Tag; urgency: Urgency; due_date: string }) => {
    const task = await api.createTask(data)
    onCreated(task)
    setAddingDay(false)
  }

  return (
    <div>
      <div
        className="flex flex-wrap rounded-2xl px-[18px] py-[14px] mb-3"
        style={{ background: COLORS.cardBg, boxShadow: `inset 3px 0 0 ${metrics.overdueCount > 0 ? COLORS.red : COLORS.textPrimary}` }}
      >
        <Stat label="Critical tasks" value={String(metrics.criticalCount)} first />
        <Stat label="Tasks done" value={`${metrics.doneCount} of ${metrics.totalCount}`} />
        <Stat label="Due this week" value={String(metrics.thisWeekCount)} sub={`${metrics.overdueCount} overdue`} subDanger={metrics.overdueCount > 0} />
      </div>

      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-2xl p-[14px]" style={{ background: COLORS.cardBg, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
          <div className="text-[11px] uppercase tracking-wide mb-[7px]" style={{ color: '#B9A88F' }}>Schedule</div>
          <div className="inline-block text-[12px] font-semibold px-[10px] py-[3px] rounded-full mb-[7px]" style={statusChipClass(sb.scheduleStatus)}>{sb.scheduleLabel}</div>
          <div className="text-[11.5px]" style={{ color: '#B9A88F' }}>{sb.actualPct}% complete vs {sb.expectedPct}% expected by today</div>
          <div className="h-[5px] rounded mt-[9px] relative overflow-visible" style={{ background: '#eee' }}>
            <div className="h-full rounded absolute left-0 top-0" style={{ width: `${sb.actualPct}%`, background: barFillColor(sb.scheduleStatus) }} />
            <div className="absolute w-[2px] h-[9px]" style={{ left: `${sb.expectedPct}%`, top: -2, background: COLORS.textPrimary }} />
          </div>
        </div>
        <div className="flex-1 rounded-2xl p-[14px]" style={{ background: COLORS.cardBg, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
          <div className="text-[11px] uppercase tracking-wide mb-[7px]" style={{ color: '#B9A88F' }}>Budget pace</div>
          <div className="inline-block text-[12px] font-semibold px-[10px] py-[3px] rounded-full mb-[7px]" style={statusChipClass(sb.budgetStatus)}>{sb.budgetLabel}</div>
          <div className="text-[11.5px]" style={{ color: '#B9A88F' }}>{sb.committedPct}% of budget committed, {sb.expectedPct}% of runway elapsed</div>
          <div className="h-[5px] rounded mt-[9px] relative overflow-visible" style={{ background: '#eee' }}>
            <div className="h-full rounded absolute left-0 top-0" style={{ width: `${sb.committedPct}%`, background: barFillColor(sb.budgetStatus) }} />
            <div className="h-full rounded absolute left-0 top-0 opacity-[.55]" style={{ width: `${sb.paidPct}%`, background: COLORS.textPrimary }} />
          </div>
        </div>
      </div>

      {!investor && (
        <div className="rounded-2xl px-4 py-[14px] mb-4" style={{ background: COLORS.cardBg, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
          <div className="text-[13px] font-extrabold mb-[1px]" style={{ color: COLORS.textPrimary }}>Next meeting</div>
          <div className="text-[11px] mb-3" style={{ color: '#B9A88F' }}>Everything that needs a decision or a status check, ready to pull up live.</div>
          {meetingGroups.length === 0 ? (
            <div className="text-[13px]" style={{ color: '#CDBDA8' }}>Nothing outstanding — clean agenda.</div>
          ) : meetingGroups.map((g) => (
            <div key={g.key} className="mb-3 last:mb-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-[6px] flex items-center gap-[6px]" style={{ color: '#B9A88F' }}>
                {g.label} <span className="rounded-full px-[7px] py-[1px] text-[10px]" style={{ background: COLORS.divider, color: COLORS.textMuted }}>{g.items.length}</span>
              </div>
              {g.items.map((it, i) => (
                <div key={i} className="flex justify-between items-center px-3 py-[9px] rounded-xl mb-[6px] last:mb-0" style={{ background: COLORS.cardBg }}>
                  <span className="font-medium text-[13.5px]" style={{ color: COLORS.textPrimary }}>{it.name}</span>
                  <span className="text-[11px]" style={{ color: '#B9A88F' }}>{it.meta}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!investor && (
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={cfOwner} onChange={(e) => setCfOwner(e.target.value)}>
            <option value="">Owner: all</option>
            {roster.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
          </select>
          <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={cfUrgency} onChange={(e) => setCfUrgency(e.target.value)}>
            <option value="">Urgency: all</option><option value="critical">Critical</option><option value="workon">To work on</option><option value="eventually">Eventually</option>
          </select>
          <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={cfStatus} onChange={(e) => setCfStatus(e.target.value)}>
            <option value="">Status: all</option><option value="done">Done</option><option value="open">Open</option>
          </select>
          <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={cfTag} onChange={(e) => setCfTag(e.target.value)}>
            <option value="">Tag: all</option><option value="operations">Operations</option><option value="admin">Admin</option><option value="marketing">Marketing</option><option value="sales">Sales</option>
          </select>
          <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={cfDue} onChange={(e) => setCfDue(e.target.value)}>
            <option value="">Due: all</option><option value="overdue">Overdue</option><option value="thisweek">This week</option><option value="later">Later</option><option value="done">Done</option>
          </select>
          <div className="text-[13px] px-[10px] py-[7px] cursor-pointer" style={{ color: COLORS.textMuted }} onClick={clearCalFilters}>Clear</div>
        </div>
      )}

      <div className="rounded-2xl p-4 mb-3 flex gap-[22px] items-start" style={{ background: COLORS.cardBg, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
        <div className="flex-[1.35] min-w-0">
          <div className="flex justify-between items-center mb-3">
            <div className="text-[14px] font-semibold" style={{ color: COLORS.textPrimary }}>{MONTHS[calMonth]} {calYear}</div>
            <div className="flex gap-[6px]">
              <button className="w-[26px] h-[26px] rounded-md border text-[13px]" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }}
                onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- } setCalMonth(m); setCalYear(y) }}>‹</button>
              <button className="w-[26px] h-[26px] rounded-md border text-[13px]" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }}
                onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ } setCalMonth(m); setCalYear(y) }}>›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-[5px]">
            {DOW.map((d) => <div key={d} className="text-[10px] text-center pb-1 uppercase tracking-wide" style={{ color: '#B9A88F' }}>{d}</div>)}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const dateStr = fmtDate(calYear, calMonth, d)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const dayTasks = dayTasksFor(dateStr)
              const counts: Record<Urgency, number> = { critical: 0, workon: 0, eventually: 0 }
              dayTasks.forEach((t) => { counts[t.urgency]++ })
              return (
                <div
                  key={d}
                  className="rounded-xl p-[6px] cursor-pointer"
                  style={{
                    minHeight: 50,
                    background: isSelected ? COLORS.blue : COLORS.cardBg,
                    boxShadow: isToday ? `inset 0 0 0 1.5px ${COLORS.textPrimary}` : undefined,
                  }}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <div className="text-[11.5px]" style={{ color: isSelected ? '#fff' : COLORS.textSecondary }}>{d}</div>
                  {dayTasks.length > 0 && (
                    <div className="flex gap-[3px] flex-wrap mt-[7px]">
                      {(['critical', 'workon', 'eventually'] as Urgency[]).filter((u) => counts[u] > 0).map((u) => (
                        <span
                          key={u}
                          className="text-[9.5px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1"
                          style={{
                            background: u === 'critical' ? COLORS.red : u === 'workon' ? COLORS.orange : COLORS.green,
                            color: u === 'workon' ? COLORS.textPrimary : '#fff',
                            boxShadow: isSelected ? '0 0 0 1px rgba(255,255,255,.5)' : undefined,
                          }}
                        >
                          {counts[u]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 border-l pl-[22px] flex flex-col" style={{ borderColor: '#f0efe9' }}>
          <DayPanel
            dateStr={selectedDate}
            tasks={selectedTasks}
            investor={investor}
            roster={roster}
            currentUserId={currentUserId}
            onChanged={onChanged}
            addingDay={addingDay}
            setAddingDay={setAddingDay}
            onCreate={createForDay}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, subDanger, first }: { label: string; value: string; sub?: string; subDanger?: boolean; first?: boolean }) {
  return (
    <div className={`flex-1 px-5 text-center ${first ? '' : 'border-l'}`} style={{ borderColor: '#f0efe9' }}>
      <span className="block text-[11px] uppercase tracking-wide" style={{ color: '#B9A88F' }}>{label}</span>
      <b className="block text-[18px] mt-[2px]" style={{ color: COLORS.textPrimary }}>{value}</b>
      {sub && <div className="text-[11px] mt-[2px]" style={{ color: subDanger ? COLORS.red : '#B9A88F', fontWeight: subDanger ? 600 : undefined }}>{sub}</div>}
    </div>
  )
}

function DayPanel({ dateStr, tasks, investor, roster, currentUserId, onChanged, addingDay, setAddingDay, onCreate }: {
  dateStr: string
  tasks: Task[]
  investor: boolean
  roster: StaffUser[]
  currentUserId?: number
  onChanged: (t: Task) => void
  addingDay: boolean
  setAddingDay: (v: boolean) => void
  onCreate: (data: { name: string; owner_id: number; tag: Tag; urgency: Urgency; due_date: string }) => void
}) {
  const [dayNote, setDayNote] = useState('')
  const [loadedDate, setLoadedDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.fetchDayNote(dateStr).then((res) => {
      if (!cancelled) { setDayNote(res.note || ''); setLoadedDate(dateStr) }
    })
    return () => { cancelled = true }
  }, [dateStr])

  const label = dateOnly(dateStr + 'T00:00:00.000Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <div className="text-[13px] font-extrabold mb-[10px]" style={{ color: COLORS.textPrimary }}>{label}</div>

      {!investor && (
        <>
          <div className="text-[11px] uppercase tracking-wide mb-[6px]" style={{ color: '#B9A88F' }}>Day note</div>
          <textarea
            className="w-full text-[12.5px] px-[9px] py-[7px] rounded-md border resize-y box-border mb-3"
            style={{ borderColor: COLORS.cardBorder, minHeight: 90, background: COLORS.cardBg }}
            placeholder="Notes for this day..."
            value={dayNote}
            onChange={(e) => setDayNote(e.target.value)}
            onBlur={() => loadedDate === dateStr && api.saveDayNote(dateStr, dayNote)}
          />
        </>
      )}

      {tasks.length === 0 ? (
        <div className="text-[12.5px] mb-3" style={{ color: '#CDBDA8' }}>Nothing due this day.</div>
      ) : tasks.map((t) => (
        <DayTaskCard key={t.id} task={t} investor={investor} onChanged={onChanged} />
      ))}

      {!investor && (
        addingDay ? (
          <AddTaskForm defaultDueDate={dateStr} fixedDueDate={dateStr} roster={roster} defaultOwnerId={currentUserId} onSubmit={onCreate} onCancel={() => setAddingDay(false)} />
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-[10px] border border-dashed rounded-xl text-[13px] cursor-pointer mt-[10px]"
            style={{ borderColor: COLORS.cardBorder, color: COLORS.textMuted }}
            onClick={() => setAddingDay(true)}
          >
            <span className="text-[15px] w-[14px] text-center">+</span> Add task for this day
          </div>
        )
      )}
    </>
  )
}

function DayTaskCard({ task, investor, onChanged }: { task: Task; investor: boolean; onChanged: (t: Task) => void }) {
  const [note, setNote] = useState(task.note || '')
  let badge: React.ReactNode = null
  if (task.status === 'done') badge = <span className="text-[9.5px] px-[6px] py-[1px] rounded font-semibold" style={{ background: '#EAF5EC', color: '#16834A' }}>DONE</span>
  else if (task.needs_decision) badge = <span className="text-[9.5px] px-[6px] py-[1px] rounded font-semibold" style={{ background: '#f3e8fe', color: '#7c3fc4' }}>NEEDS DECISION</span>

  return (
    <div className="px-[10px] py-[9px] rounded-xl mb-[6px] text-[13px]" style={{ background: COLORS.cardBg }}>
      <div className="flex items-center gap-2">
        <UrgencyDot urgency={task.urgency} />
        <span className="font-medium flex-1" style={{ color: COLORS.textPrimary }}>{task.name.replace(/OVERDUE|NEEDS DECISION/g, '').trim()}</span>
        {badge}
      </div>
      <div className="flex gap-2 items-center mt-[5px] pl-[15px] text-[11px]" style={{ color: '#B9A88F' }}>
        <TagBadge tag={task.tag} className="!text-[10px] !px-[7px]" />
        {!investor && <span>{task.owner_name}</span>}
      </div>
      {!investor && (
        <textarea
          className="w-full text-[12.5px] px-[9px] py-[7px] rounded-md border resize-y box-border mt-2"
          style={{ borderColor: COLORS.cardBorder, minHeight: 44, background: COLORS.cardBg }}
          placeholder="Notes for this task..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (task.note || '') && api.updateNote(task.id, note).then(onChanged)}
        />
      )}
    </div>
  )
}
