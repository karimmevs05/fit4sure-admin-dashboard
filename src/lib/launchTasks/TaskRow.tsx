import React, { useState } from 'react'
import type { Task, Tag, Urgency, Expense, StaffUser } from './types'
import { COLORS, TagBadge, UrgencyDot, OverdueBadge, DecisionBadge, TAG_LABELS } from './ui'
import { dueBucketForTask, formatCents, formatDueLabel } from './selectors'
import * as api from './api'

const TAGS: Tag[] = ['operations', 'admin', 'marketing', 'sales']
const URGENCIES: Urgency[] = ['critical', 'workon', 'eventually']

function inputCls() {
  return 'text-[13px] px-[10px] py-[7px] rounded-xl border font-[inherit]'
}

export function EditTaskForm({ task, roster, onSave, onCancel }: { task: Task; roster: StaffUser[]; onSave: (t: Task) => void; onCancel: () => void }) {
  const [name, setName] = useState(task.name)
  const [ownerId, setOwnerId] = useState<number>(task.owner_id ?? roster[0]?.user_id)
  const [tag, setTag] = useState<Tag>(task.tag)
  const [urgency, setUrgency] = useState<Urgency>(task.urgency)
  const [dueDate, setDueDate] = useState(task.due_date.slice(0, 10))
  const [budget, setBudget] = useState(task.budget_cents ? String(task.budget_cents / 100) : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const updated = await api.updateTask(task.id, {
        name: name.trim(),
        owner_id: ownerId,
        tag,
        urgency,
        due_date: dueDate,
        budget_cents: budget ? Math.round(parseFloat(budget) * 100) : 0,
      })
      onSave(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-3xl p-4 mb-2 border" style={{ background: COLORS.cardBg, borderColor: COLORS.cardBorder }}>
      <div className="flex gap-2 mb-2 flex-wrap">
        <input className={`${inputCls()} flex-1 min-w-[160px]`} style={{ borderColor: COLORS.cardBorder }} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex gap-2 mb-2 flex-wrap">
        <select className={inputCls()} style={{ borderColor: COLORS.cardBorder }} value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
          {roster.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
        </select>
        <select className={inputCls()} style={{ borderColor: COLORS.cardBorder }} value={tag} onChange={(e) => setTag(e.target.value as Tag)}>
          {TAGS.map((t) => <option key={t} value={t}>{TAG_LABELS[t]}</option>)}
        </select>
        <select className={inputCls()} style={{ borderColor: COLORS.cardBorder }} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
          <option value="critical">Critical</option>
          <option value="workon">To work on</option>
          <option value="eventually">Eventually</option>
        </select>
      </div>
      <div className="flex gap-2 mb-2 flex-wrap">
        <input type="date" className={inputCls()} style={{ borderColor: COLORS.cardBorder }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <input type="number" placeholder="Budget $" className={inputCls()} style={{ borderColor: COLORS.cardBorder }} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button className="text-[13px] px-[14px] py-[7px] rounded-xl border" style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg }} onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="text-[13px] px-[14px] py-[7px] rounded-xl border text-white font-semibold" style={{ background: COLORS.green, borderColor: COLORS.green }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function ExpenseLedger({ task, onChanged }: { task: Task; onChanged: (t: Task) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loaded, setLoaded] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const data = await api.fetchExpenses(task.id)
    setExpenses(data)
    setLoaded(true)
  }

  React.useEffect(() => { load() }, [task.id])

  const submit = async () => {
    const amt = parseFloat(amount)
    if (!desc.trim() || !amt || amt <= 0) return
    setBusy(true)
    try {
      const updatedTask = await api.addExpense(task.id, { date, description: desc.trim(), amount_cents: Math.round(amt * 100) })
      setDesc('')
      setAmount('')
      onChanged(updatedTask)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (expId: number) => {
    setBusy(true)
    try {
      const updatedTask = await api.deleteExpense(task.id, expId)
      onChanged(updatedTask)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const total = expenses.reduce((s, e) => s + e.amount_cents, 0)

  return (
    <div className="mb-1">
      {loaded && expenses.map((e) => (
        <div key={e.id} className="flex items-center gap-2 px-[10px] py-[7px] rounded-[10px] mb-[6px] text-[13px] border" style={{ background: COLORS.cardBg, borderColor: COLORS.divider }}>
          <span className="text-[11.5px] w-[68px] flex-shrink-0" style={{ color: COLORS.textMuted }}>{formatDueLabel(e.date)}</span>
          <span className="flex-1" style={{ color: COLORS.textPrimary }}>{e.description}</span>
          <span className="font-bold" style={{ color: COLORS.textPrimary }}>{formatCents(e.amount_cents)}</span>
          <span className="cursor-pointer text-[13px] px-[2px]" style={{ color: COLORS.textMuted }} onClick={() => remove(e.id)} title="Remove">✕</span>
        </div>
      ))}
      {expenses.length > 0 && (
        <div className="flex justify-between text-[12.5px] font-bold px-[10px] pb-2" style={{ color: COLORS.textSecondary }}>
          <span>Total logged</span><span>{formatCents(total)}</span>
        </div>
      )}
      <div className="flex gap-[6px] flex-wrap mb-2">
        <input type="date" className="text-[12.5px] px-2 py-[6px] rounded-lg border w-[128px]" style={{ borderColor: COLORS.cardBorder }} value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="text" placeholder="What was it for?" className="text-[12.5px] px-2 py-[6px] rounded-lg border flex-1 min-w-[100px]" style={{ borderColor: COLORS.cardBorder }} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input type="number" placeholder="$" className="text-[12.5px] px-2 py-[6px] rounded-lg border w-[90px]" style={{ borderColor: COLORS.cardBorder }} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="text-[12.5px] font-bold px-3 py-[6px] rounded-lg text-white" style={{ background: COLORS.green }} onClick={submit} disabled={busy}>Log expense</button>
      </div>
    </div>
  )
}

export function TaskRow({ task, today, investor, roster, onChanged, onDeleted, isFirst = true }: {
  task: Task
  today: Date
  investor: boolean
  roster: StaffUser[]
  onChanged: (t: Task) => void
  onDeleted: (id: number) => void
  isFirst?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(task.note || '')
  const [addingTodo, setAddingTodo] = useState(false)
  const [todoText, setTodoText] = useState('')
  const [todoUrgency, setTodoUrgency] = useState<Urgency>('workon')

  const dueBucket = dueBucketForTask(task, today)
  const isOverdue = dueBucket === 'overdue'

  const saveNote = async (value: string) => {
    const updated = await api.updateNote(task.id, value)
    onChanged(updated)
  }

  const toggleTodo = async (todoId: number, done: boolean) => {
    await api.updateTodo(task.id, todoId, { done })
    onChanged({ ...task, todos: task.todos.map((t) => (t.id === todoId ? { ...t, done } : t)) })
  }

  const submitTodo = async () => {
    if (!todoText.trim()) return
    const todo = await api.addTodo(task.id, todoText.trim(), todoUrgency)
    onChanged({ ...task, todos: [...task.todos, todo] })
    setTodoText('')
    setAddingTodo(false)
  }

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = await api.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' })
    onChanged(updated)
  }

  if (editing) {
    return (
      <EditTaskForm
        task={task}
        roster={roster}
        onCancel={() => setEditing(false)}
        onSave={(t) => { onChanged(t); setEditing(false) }}
      />
    )
  }

  return (
    <div className={isFirst ? '' : 'border-t'} style={{ background: COLORS.cardBg, borderColor: COLORS.divider }}>
      <div
        className="flex items-center gap-[10px] px-[14px] py-3"
        style={{ cursor: investor ? 'default' : 'pointer' }}
        onClick={() => !investor && setOpen((o) => !o)}
      >
        <span className="text-[12px] w-[14px] inline-block" style={{ color: COLORS.textMuted, transform: open ? 'rotate(90deg)' : undefined, display: investor ? 'none' : 'inline-block' }}>▶</span>
        {!investor && (
          <input type="checkbox" checked={task.status === 'done'} onChange={() => {}} onClick={toggleStatus} className="flex-shrink-0" />
        )}
        <span className="flex-1 text-[14px] font-medium flex items-center flex-wrap gap-[2px]" style={{ color: COLORS.textPrimary, textDecoration: task.status === 'done' ? 'line-through' : undefined }}>
          {task.name}
          {isOverdue && <OverdueBadge />}
          {task.needs_decision && <DecisionBadge />}
        </span>
        <TagBadge tag={task.tag} className="w-[74px] text-center box-border" />
        {!investor && <span className="text-[12px] w-[60px]" style={{ color: COLORS.textMuted }}>{task.owner_name}</span>}
        <span className="text-[12px] w-[100px]" style={{ color: isOverdue ? COLORS.red : COLORS.textMuted, fontWeight: isOverdue ? 600 : undefined }}>
          {task.status === 'done' ? 'done' : 'due'} {formatDueLabel(task.due_date)}
        </span>
        <span className="w-[76px] text-right">
          <div className="text-[13px]" style={{ color: COLORS.textSecondary }}>{task.paid_cents > 0 ? formatCents(task.paid_cents) : '—'}</div>
          <div className="text-[10px] mt-[1px]" style={{ color: COLORS.textMuted }}>
            {task.budget_cents > 0 ? `of ${formatCents(task.budget_cents)}` : (task.paid_cents > 0 ? 'logged' : 'no budget set')}
          </div>
        </span>
        {!investor && (
          <span
            className="text-[13px] px-1 py-[2px] rounded cursor-pointer"
            style={{ color: COLORS.textMuted }}
            title="Edit task"
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          >
            ✎
          </span>
        )}
      </div>

      {open && !investor && (
        <div className="px-[14px] pb-[14px] border-t" style={{ borderColor: COLORS.divider }}>
          <div className="text-[11px] uppercase tracking-wide mt-3 mb-[6px]" style={{ color: COLORS.textMuted }}>To-dos</div>
          {task.todos.map((td) => (
            <div key={td.id} className="flex gap-2 text-[14px] mb-[6px] items-start">
              <input type="checkbox" checked={td.done} onChange={(e) => toggleTodo(td.id, e.target.checked)} className="mt-1" />
              <UrgencyDot urgency={td.urgency} />
              <span style={{ color: td.done ? COLORS.textMuted : COLORS.textPrimary, textDecoration: td.done ? 'line-through' : undefined }}>{td.text}</span>
            </div>
          ))}
          {addingTodo ? (
            <div className="flex gap-[6px] items-center mt-1 mb-2 flex-wrap">
              <select className="text-[12px] px-2 py-1 rounded-lg border" style={{ borderColor: COLORS.cardBorder }} value={todoUrgency} onChange={(e) => setTodoUrgency(e.target.value as Urgency)}>
                {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input
                autoFocus
                className="text-[13px] px-[10px] py-[6px] rounded-xl border flex-1 min-w-[140px]"
                style={{ borderColor: COLORS.cardBorder }}
                value={todoText}
                onChange={(e) => setTodoText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitTodo()}
                placeholder="To-do text"
              />
              <button className="text-[12px] font-bold px-2 py-1 rounded-lg text-white" style={{ background: COLORS.green }} onClick={submitTodo}>Add</button>
              <button className="text-[12px] px-2 py-1 rounded-lg" style={{ color: COLORS.textMuted }} onClick={() => { setAddingTodo(false); setTodoText('') }}>Cancel</button>
            </div>
          ) : (
            <div className="text-[13px] mt-[2px] cursor-pointer" style={{ color: COLORS.textMuted }} onClick={() => setAddingTodo(true)}>+ Add to-do</div>
          )}

          <div className="text-[11px] uppercase tracking-wide mt-3 mb-[6px]" style={{ color: COLORS.textMuted }}>Notes</div>
          <textarea
            rows={2}
            className="w-full text-[14px] px-[10px] py-2 rounded-xl border resize-y box-border"
            style={{ borderColor: COLORS.cardBorder }}
            value={note}
            placeholder="Add a note..."
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (task.note || '') && saveNote(note)}
          />
          {task.note_updated_by && (
            <div className="text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
              {task.note_updated_by} · {task.note_updated_at ? new Date(task.note_updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toLowerCase() : ''}
            </div>
          )}

          <div className="text-[11px] uppercase tracking-wide mt-3 mb-[6px]" style={{ color: COLORS.textMuted }}>Expenses</div>
          <ExpenseLedger task={task} onChanged={onChanged} />

          <div className="text-[11px] uppercase tracking-wide mt-3 mb-[6px]" style={{ color: COLORS.textMuted }}>Source</div>
          <SourceRefInput task={task} onChanged={onChanged} />
          <div className="flex items-center gap-2 mt-[6px] text-[12px]" style={{ color: COLORS.textSecondary }}>
            <span style={{ color: COLORS.textMuted }}>📎</span>
            <span style={{ color: COLORS.textMuted }}>Attachments coming soon</span>
          </div>

          <div className="flex justify-end mt-3">
            <button
              className="text-[12px]"
              style={{ color: COLORS.textMuted }}
              onClick={() => { if (confirm(`Delete "${task.name}"?`)) { api.deleteTask(task.id).then(() => onDeleted(task.id)) } }}
            >
              Delete task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceRefInput({ task, onChanged }: { task: Task; onChanged: (t: Task) => void }) {
  const [value, setValue] = useState(task.source_ref || '')
  return (
    <input
      type="text"
      className="w-full text-[13px] px-[10px] py-[7px] rounded-xl border box-border"
      style={{ borderColor: COLORS.cardBorder, color: COLORS.textSecondary }}
      value={value}
      placeholder="Reference, contact, etc."
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== (task.source_ref || '') && api.updateTask(task.id, { source_ref: value }).then(onChanged)}
    />
  )
}
