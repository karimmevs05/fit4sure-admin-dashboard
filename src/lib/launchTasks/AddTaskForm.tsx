import React, { useState } from 'react'
import type { Tag, Urgency, StaffUser } from './types'
import { COLORS, TAG_LABELS } from './ui'

const TAGS: Tag[] = ['operations', 'admin', 'marketing', 'sales']

export function AddTaskForm({ defaultDueDate, fixedDueDate, roster, defaultOwnerId, onSubmit, onCancel }: {
  defaultDueDate: string
  fixedDueDate?: string
  roster: StaffUser[]
  defaultOwnerId?: number
  onSubmit: (data: { name: string; owner_id: number; tag: Tag; urgency: Urgency; due_date: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState<number>(defaultOwnerId ?? roster[0]?.user_id)
  const [tag, setTag] = useState<Tag>('operations')
  const [urgency, setUrgency] = useState<Urgency>('workon')
  const [dueDate, setDueDate] = useState(fixedDueDate || defaultDueDate)

  const submit = () => {
    if (!name.trim() || !ownerId) return
    onSubmit({ name: name.trim(), owner_id: ownerId, tag, urgency, due_date: fixedDueDate || dueDate })
  }

  return (
    <div className="rounded-2xl p-3 mb-2 border" style={{ background: COLORS.cardBg, borderColor: COLORS.cardBorder }}>
      <div className="flex gap-2 mb-2 flex-wrap">
        <input
          autoFocus
          type="text"
          placeholder="Task name"
          className="text-[13px] px-[10px] py-[7px] rounded-xl border flex-1 min-w-[160px]"
          style={{ borderColor: COLORS.cardBorder, color: COLORS.textPrimary }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder }} value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
          {roster.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
        </select>
        <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder }} value={tag} onChange={(e) => setTag(e.target.value as Tag)}>
          {TAGS.map((t) => <option key={t} value={t}>{TAG_LABELS[t]}</option>)}
        </select>
        <select className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder }} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
          <option value="workon">To work on</option>
          <option value="critical">Critical</option>
          <option value="eventually">Eventually</option>
        </select>
        {fixedDueDate ? (
          <span className="text-[12px] px-1" style={{ color: COLORS.textMuted }}>
            Due {new Date(fixedDueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <input type="date" className="text-[13px] px-[10px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="text-[13px] px-[14px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg }} onClick={onCancel}>Cancel</button>
        <button type="button" className="text-[13px] px-[14px] py-[7px] rounded-xl border text-white font-semibold" style={{ background: COLORS.green, borderColor: COLORS.green }} onClick={submit}>Add task</button>
      </div>
    </div>
  )
}
