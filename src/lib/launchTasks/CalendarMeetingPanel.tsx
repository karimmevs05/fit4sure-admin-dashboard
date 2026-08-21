import React, { useMemo, useState } from 'react'
import type { Task, Urgency } from './types'
import { COLORS, AttentionIconDot } from './ui'
import { buildMeetingZone } from './selectors'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Calendar here is a visual reference only (today outlined, urgency-count
// dots per day) -- it doesn't drive the panel beside it. That panel always
// shows what actually needs to be brought up next (the meeting agenda: what's
// overdue, critical and due soon, or waiting on a decision), instead of a
// per-day notes box that's empty most days.
export function CalendarMeetingPanel({ tasks, today }: { tasks: Task[]; today: Date }) {
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())

  const meetingGroups = useMemo(() => buildMeetingZone(tasks, today), [tasks, today])

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate())

  const dayTasksFor = (dateStr: string) => tasks.filter((t) => t.due_date.slice(0, 10) === dateStr)

  return (
    <div className="rounded-2xl p-4 mb-3 flex gap-[22px] items-start" style={{ background: COLORS.cardBg, boxShadow: '0 8px 24px rgba(75,43,29,0.06)' }}>
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
            const dayTasks = dayTasksFor(dateStr)
            const counts: Record<Urgency, number> = { critical: 0, workon: 0, eventually: 0 }
            dayTasks.forEach((t) => { counts[t.urgency]++ })
            return (
              <div
                key={d}
                className="rounded-xl p-[6px]"
                style={{
                  minHeight: 50,
                  background: '#ffffff',
                  border: isToday ? `2px solid ${COLORS.textPrimary}` : '1px solid #DDCBB0',
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
      </div>

      <div className="flex-1 min-w-0 border-l pl-[22px] flex flex-col" style={{ borderColor: '#CDBDA8' }}>
        <div className="text-[13px] font-extrabold mb-[1px]" style={{ color: '#3D2314' }}>Next meeting notes</div>
        <div className="text-[11px] mb-3" style={{ color: '#6B3410' }}>Everything that needs a decision or a status check, ready to pull up live.</div>
        {meetingGroups.length === 0 ? (
          <div className="text-[13px]" style={{ color: '#6B3410' }}>Nothing outstanding — clean agenda.</div>
        ) : meetingGroups.map((g) => (
          <div key={g.key} className="mb-3 last:mb-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-[6px] flex items-center gap-[6px]" style={{ color: '#6B3410' }}>
              {g.label} <span className="rounded-full px-[7px] py-[1px] text-[10px]" style={{ background: COLORS.divider, color: '#3D2314' }}>{g.items.length}</span>
            </div>
            {g.items.map((it, i) => (
              <div key={i} className="flex items-start gap-[10px] py-[7px] border-t first:border-t-0" style={{ borderColor: '#CDBDA8' }}>
                <span className="mt-[4px]"><AttentionIconDot icon={g.key} /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13.5px]" style={{ color: '#3D2314' }}>{it.name}</div>
                  <div className="text-[11px] mt-[2px]" style={{ color: '#6B3410' }}>{it.meta}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
