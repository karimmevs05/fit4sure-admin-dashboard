import React, { useState } from 'react'
import { Pencil, X, Check } from 'lucide-react'
import type { MeetingHighlight } from './types'
import { COLORS } from './ui'

// Edit/delete row for a manually-entered "big topic" inline inside the
// Next meeting topics list (see CalendarMeetingPanel) -- click the pencil to
// rewrite it in place, or the x to drop it off the agenda.
export function EditableHighlight({
  highlight,
  onEdit,
  onDelete,
}: {
  highlight: MeetingHighlight
  onEdit: (id: number, text: string) => void | Promise<void>
  onDelete: (id: number) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(highlight.text)

  const save = () => {
    const text = draft.trim()
    if (!text) return
    if (text !== highlight.text) onEdit(highlight.id, text)
    setEditing(false)
  }

  const cancel = () => {
    setDraft(highlight.text)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-[6px] flex-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          className="h-7 flex-1 min-w-0 rounded-md border px-2 text-[12.5px] font-medium outline-none"
          style={{ borderColor: COLORS.blue, background: '#ffffff', color: '#3D2314' }}
        />
        <button type="button" onClick={save} className="shrink-0 rounded-full p-[3px] hover:bg-[#F1EAE0]" aria-label="Save">
          <Check className="h-3.5 w-3.5" style={{ color: COLORS.green }} />
        </button>
        <button type="button" onClick={cancel} className="shrink-0 rounded-full p-[3px] hover:bg-[#F1EAE0]" aria-label="Cancel">
          <X className="h-3.5 w-3.5" style={{ color: '#9A7E6F' }} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-[6px] flex-1">
      <span className="flex-1 text-[13px] leading-snug font-medium" style={{ color: '#3D2314' }}>{highlight.text}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 rounded-full p-[2px] opacity-0 group-hover/topic:opacity-100 hover:bg-[#F1EAE0] transition-opacity"
        aria-label="Edit topic"
      >
        <Pencil className="h-3 w-3" style={{ color: '#B0A08F' }} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(highlight.id)}
        className="shrink-0 rounded-full p-[2px] opacity-0 group-hover/topic:opacity-100 hover:bg-[#F1EAE0] transition-opacity"
        aria-label="Remove topic"
      >
        <X className="h-3 w-3" style={{ color: '#B0A08F' }} />
      </button>
    </div>
  )
}
