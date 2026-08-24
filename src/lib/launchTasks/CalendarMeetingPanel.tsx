import React, { useMemo, useState } from 'react'
import type { Task, Urgency, Tag, StaffUser, MeetingHighlight } from './types'
import { COLORS } from './ui'
import { buildMeetingZone } from './selectors'
import { EditableHighlight } from './EditableHighlight'
import { AddTaskForm } from './AddTaskForm'
import * as api from './api'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Visual reference (today outlined, urgency-count dots per day) that also
// doubles as day-level task entry: click a day to see what's due then and
// add something new straight onto that date, instead of opening the full
// list and hunting for the right due-date field.
export function CalendarBlock({
  tasks,
  today,
  roster,
  defaultOwnerId,
  onChanged,
  onCreated,
}: {
  tasks: Task[]
  today: Date
  roster: StaffUser[]
  defaultOwnerId?: number
  onChanged: (t: Task) => void
  onCreated: (t: Task) => void
}) {
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate())

  const dayTasksFor = (dateStr: string) => tasks.filter((t) => t.due_date.slice(0, 10) === dateStr)
  const selectedDayTasks = selectedDate ? dayTasksFor(selectedDate) : []

  const selectDay = (dateStr: string) => {
    setAdding(false)
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
  }

  const toggleStatus = async (t: Task) => {
    const updated = await api.updateTask(t.id, { status: t.status === 'done' ? 'open' : 'done' })
    onChanged(updated)
  }

  const createOnSelectedDay = async (data: { name: string; owner_id: number; tag: Tag; urgency: Urgency; due_date: string }) => {
    const task = await api.createTask(data)
    onCreated(task)
    setAdding(false)
  }

  return (
    <div className="flex-[1.35] min-w-0">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[14px] font-semibold" style={{ color: COLORS.textPrimary }}>{MONTHS[calMonth]} {calYear}</div>
        <div className="flex gap-[6px]">
          <button
            className="w-[26px] h-[26px] rounded-md border text-[13px]"
            style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }}
            onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- } setCalMonth(m); setCalYear(y) }}
          >
            ‹
          </button>
          <button
            className="w-[26px] h-[26px] rounded-md border text-[13px]"
            style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }}
            onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ } setCalMonth(m); setCalYear(y) }}
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {DOW.map((d) => <div key={d} className="text-[10px] text-center pb-1 uppercase tracking-wide" style={{ color: '#6B3410' }}>{d}</div>)}
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
              onClick={() => selectDay(dateStr)}
              className="rounded-xl p-[6px] cursor-pointer transition"
              style={{
                minHeight: 50,
                background: isSelected ? '#FBEFE0' : '#ffffff',
                border: isToday ? `2px solid ${COLORS.textPrimary}` : isSelected ? `2px solid ${COLORS.blue}` : '1px solid #DDCBB0',
              }}
            >
              <div className="text-[11.5px] font-semibold" style={{ color: COLORS.textPrimary }}>{d}</div>
              {dayTasks.length > 0 && (
                <div className="flex gap-[3px] flex-wrap mt-[7px]">
                  {(['critical', 'workon', 'eventually'] as Urgency[]).filter((u) => counts[u] > 0).map((u) => (
                    <span
                      key={u}
                      className="text-[9.5px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1"
                      style={{
                        background: u === 'critical' ? COLORS.red : u === 'workon' ? COLORS.orange : COLORS.green,
                        color: u === 'workon' ? COLORS.textPrimary : '#fff',
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

      {selectedDate && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: COLORS.cardBorder, background: '#FBF8F3' }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: COLORS.textPrimary }}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>

          {selectedDayTasks.length === 0 ? (
            <div className="text-[12px] mb-2" style={{ color: COLORS.textMuted }}>Nothing due this day.</div>
          ) : (
            <div className="space-y-[6px] mb-2">
              {selectedDayTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleStatus(t)} className="flex-shrink-0" />
                  <span style={{ color: t.status === 'done' ? COLORS.textMuted : COLORS.textPrimary, textDecoration: t.status === 'done' ? 'line-through' : undefined }}>
                    {t.name}
                  </span>
                  <span className="text-[11px]" style={{ color: COLORS.textMuted }}>{t.owner_name}</span>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <AddTaskForm
              defaultDueDate={selectedDate}
              fixedDueDate={selectedDate}
              roster={roster}
              defaultOwnerId={defaultOwnerId}
              onSubmit={createOnSelectedDay}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: COLORS.blue }}
              onClick={() => setAdding(true)}
            >
              + Add task on this day
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// The meeting agenda: what's overdue, critical and due soon, or waiting on a
// decision, plus manually-typed topics pinned to the front. No outer card of
// its own -- it's meant to sit directly under the calendar's side panel,
// inside the same bordered section.
export function MeetingTopicsPanel({
  tasks,
  today,
  highlights,
  onAddHighlight,
  onEditHighlight,
  onDeleteHighlight,
}: {
  tasks: Task[]
  today: Date
  highlights: MeetingHighlight[]
  onAddHighlight: (text: string) => void | Promise<void>
  onEditHighlight: (id: number, text: string) => void | Promise<void>
  onDeleteHighlight: (id: number) => void | Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const meetingGroups = useMemo(() => buildMeetingZone(tasks, today).filter((g) => g.key !== 'overdue'), [tasks, today])

  const displayGroups = useMemo(() => {
    const groups: { key: string; label: string; items: { name: string; meta?: string; highlightId?: number }[] }[] = []
    if (highlights.length) {
      groups.push({ key: 'topics', label: 'Topics', items: highlights.map((h) => ({ name: h.text, highlightId: h.id })) })
    }
    groups.push(...meetingGroups)
    return groups
  }, [highlights, meetingGroups])

  const addTopic = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await onAddHighlight(text)
      setDraft('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: '#CDBDA8' }}>
      <div className="text-[13px] font-extrabold mb-[1px]" style={{ color: '#3D2314' }}>Next meeting topics</div>
      <div className="text-[11px] mb-3" style={{ color: '#6B3410' }}>Everything that needs a decision or a status check, ready to pull up live.</div>

      {displayGroups.length === 0 ? (
        <div className="text-[13px]" style={{ color: '#6B3410' }}>Nothing outstanding — clean agenda.</div>
      ) : displayGroups.map((g) => (
        <div key={g.key} className="mb-3 last:mb-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-[6px] flex items-center gap-[6px]" style={{ color: '#6B3410' }}>
            {g.label} <span className="rounded-full px-[7px] py-[1px] text-[10px]" style={{ background: COLORS.divider, color: '#3D2314' }}>{g.items.length}</span>
          </div>
          <ul className="list-disc pl-[18px] space-y-[6px] marker:text-[#6B3410]">
            {g.items.map((it, i) =>
              it.highlightId != null ? (
                <li key={i} className="text-[13px] leading-snug group/topic">
                  <EditableHighlight
                    highlight={highlights.find((h) => h.id === it.highlightId)!}
                    onEdit={onEditHighlight}
                    onDelete={onDeleteHighlight}
                  />
                </li>
              ) : (
                <li key={i} className="text-[13px] leading-snug" style={{ color: '#3D2314' }}>
                  <span className="font-medium">{it.name}</span>
                  {it.meta && <span style={{ color: '#6B3410' }}> — {it.meta}</span>}
                </li>
              )
            )}
          </ul>
        </div>
      ))}

      <div className="flex gap-[6px] mt-4">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTopic() }}
          placeholder="Add a topic…"
          className="h-9 flex-1 min-w-0 rounded-lg border px-2 text-xs font-medium outline-none focus:ring-2"
          style={{ borderColor: COLORS.cardBorder, background: '#ffffff', color: '#3D2314' }}
        />
        <button
          type="button"
          onClick={addTopic}
          disabled={saving || !draft.trim()}
          className="h-9 shrink-0 rounded-lg px-3 text-xs font-bold text-white transition disabled:opacity-50"
          style={{ background: COLORS.blue }}
        >
          + Add
        </button>
      </div>
    </div>
  )
}
