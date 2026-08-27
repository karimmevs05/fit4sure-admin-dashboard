import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import {
  ArrowLeft, ArrowRight, Printer, CheckSquare, Square, Clock, ChefHat,
  ShieldCheck, Sparkles, Info, ClipboardList, Timer as TimerIcon, X,
} from 'lucide-react'
import { CATEGORY_CARD_BG, DEFAULT_CARD_BG } from '../utils/categoryColors'

type ChecklistItem = {
  id: number
  label: string
  is_completed: boolean
  sort_order: number
  group_label: string | null
  line_kind: string | null
  category: string | null
}

type TaskDetail = {
  id: number
  title: string
  description: string | null
  due_date: string | null
  estimated_minutes: number | null
  checklist_items: ChecklistItem[]
}

type Column = { name: string; category: string | null; items: ChecklistItem[] }

type TimerEntry = { itemId: number; label: string; recipeName: string; endsAt: number; alarmed: boolean }

const KIND_SECTION_TITLE: Record<string, string> = {
  ingredient: 'Ingredients',
  mise_en_place: 'Mise en Place',
  prep_step: 'Prep Steps',
  cook_step: 'Cook Steps',
  qc: 'Checkpoints',
  portion: 'Checkpoints',
  label: 'Checkpoints',
}

// Only these kinds ever reference a duration worth timing -- portioning,
// labeling, and the ingredient list itself never do.
const TIMEABLE_KINDS = new Set(['prep_step', 'cook_step', 'mise_en_place', 'qc'])

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

// Best-effort guess from the step's own text ("grill for 6 to 8 minutes",
// "chill for at least 4 hours") -- a starting point the cook can override,
// never assumed correct on its own.
function extractMinutes(text: string): number | null {
  const range = text.match(/(\d+)\s*(?:to|-|–)\s*(\d+)\s*(hour|hr|minute|min)/i)
  if (range) {
    const upper = parseInt(range[2], 10)
    return range[3].toLowerCase().startsWith('h') ? upper * 60 : upper
  }
  const single = text.match(/(\d+)\s*(hour|hr|minute|min)/i)
  if (single) {
    const val = parseInt(single[1], 10)
    return single[2].toLowerCase().startsWith('h') ? val * 60 : val
  }
  return null
}

function playAlarm() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => ctx.close()
  } catch {
    // best-effort -- silent failure if the browser blocks audio without a gesture
  }
}

function nextActionableItem(col: Column): ChecklistItem | null {
  return col.items.find((i) => i.line_kind !== 'info' && !i.is_completed) || null
}

function CheckRow({ item, onToggle, numbered, index, bold }: {
  item: ChecklistItem
  onToggle: (item: ChecklistItem) => void
  numbered?: boolean
  index?: number
  bold?: boolean
}) {
  return (
    <button onClick={() => onToggle(item)} className="flex w-full items-start gap-2 text-left group">
      {item.is_completed ? (
        <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#16A34A]" />
      ) : (
        <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#B9A88F] group-hover:text-[#2E527F]" />
      )}
      <span className={`text-sm ${bold ? 'font-bold' : ''} ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>
        {numbered ? `${(index ?? 0) + 1}. ${item.label}` : item.label}
      </span>
    </button>
  )
}

// Idle: a minutes input (pre-filled with a guess parsed from the step text)
// + Start. Running: a live countdown + Stop. Alarmed: pulses red until
// dismissed -- never auto-clears, so a timer going off in another recipe's
// tab doesn't get missed by disappearing on its own.
function TimerButton({ item, recipeName, timers, onStart, onStop, now }: {
  item: ChecklistItem
  recipeName: string
  timers: TimerEntry[]
  onStart: (item: ChecklistItem, recipeName: string, minutes: number) => void
  onStop: (itemId: number) => void
  now: number
}) {
  const [minutes, setMinutes] = useState<string>(() => {
    const guess = extractMinutes(item.label)
    return guess ? String(guess) : ''
  })
  const running = timers.find((t) => t.itemId === item.id)

  if (running) {
    const remaining = Math.max(0, Math.round((running.endsAt - now) / 1000))
    const mm = Math.floor(remaining / 60)
    const ss = remaining % 60
    const done = remaining <= 0
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold ${done ? 'bg-[#DC2626] text-white animate-pulse' : 'bg-[#2E527F] text-white'}`}
      >
        <TimerIcon className="h-3.5 w-3.5" />
        {done ? "Time's up!" : `${mm}:${String(ss).padStart(2, '0')}`}
        <button onClick={() => onStop(item.id)} className="ml-0.5 opacity-80 hover:opacity-100" aria-label="Stop timer">
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min="1"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        className="w-12 h-7 rounded border border-[#B9A88F] text-xs text-center outline-none"
      />
      <button
        onClick={() => {
          const m = parseFloat(minutes)
          if (m > 0) onStart(item, recipeName, m)
        }}
        className="flex items-center gap-1 rounded-lg border border-[#2E527F] px-2 py-1 text-xs font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition"
      >
        <TimerIcon className="h-3.5 w-3.5" /> Start
      </button>
    </div>
  )
}

type TimerProps = {
  timers: TimerEntry[]
  now: number
  onStart: (item: ChecklistItem, recipeName: string, minutes: number) => void
  onStop: (itemId: number) => void
}

// One recipe's content -- info subtitle (time/equipment/cutting board) up
// top as plain text, not a checkbox (it's context, not an action), then the
// real sections. Shared between the on-screen single-page view and the
// always-rendered print sheet (which omits timerProps/highlight -- nothing
// interactive belongs on paper).
function RecipeCard({ col, onToggle, cleanupForThisColumn, nextItemId, timerProps }: {
  col: Column
  onToggle: (item: ChecklistItem) => void
  cleanupForThisColumn: ChecklistItem[]
  nextItemId?: number | null
  timerProps?: TimerProps
}) {
  const infoItem = col.items.find((i) => i.line_kind === 'info')
  const actionItems = col.items.filter((i) => i.line_kind !== 'info')
  const colDone = actionItems.filter((i) => i.is_completed).length

  const sectionOrder: string[] = []
  const bySection: Record<string, { items: ChecklistItem[]; numbered: boolean }> = {}
  for (const item of actionItems) {
    const kind = item.line_kind || 'step'
    const title = KIND_SECTION_TITLE[kind] || 'Checkpoints'
    if (!bySection[title]) {
      bySection[title] = { items: [], numbered: kind === 'prep_step' || kind === 'cook_step' }
      sectionOrder.push(title)
    }
    bySection[title].items.push(item)
  }

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-white shadow-[0_8px_24px_rgba(75,43,29,0.06)] overflow-hidden print:break-inside-avoid">
      <div className={`border-b border-[#DED2C2] ${(col.category && CATEGORY_CARD_BG[col.category]) || DEFAULT_CARD_BG} px-5 py-4`}>
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">{col.name}</h2>
        <p className="text-xs text-[#4B2B1D]/70">{colDone}/{actionItems.length} done</p>
      </div>
      {infoItem && (
        <div className="flex items-start gap-2 px-5 py-3 bg-[#F5EFE5] border-b border-[#E4D8C9] text-xs text-[#755B4C]">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{infoItem.label}</span>
        </div>
      )}
      <div className="p-5 space-y-5">
        {sectionOrder.map((title) => (
          <div key={title}>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C] mb-2">{title}</p>
            <div className="space-y-2">
              {bySection[title].items.map((item, i) => (
                <div
                  key={item.id}
                  className={item.id === nextItemId ? 'rounded-lg bg-[#EAF0F7] ring-1 ring-[#2E527F] p-2 -mx-2' : ''}
                >
                  <CheckRow item={item} onToggle={onToggle} numbered={bySection[title].numbered} index={i} />
                  {timerProps && item.line_kind && TIMEABLE_KINDS.has(item.line_kind) && (
                    <div className="mt-1.5 ml-6 print:hidden">
                      <TimerButton
                        item={item}
                        recipeName={col.name}
                        timers={timerProps.timers}
                        onStart={timerProps.onStart}
                        onStop={timerProps.onStop}
                        now={timerProps.now}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {cleanupForThisColumn.length > 0 && (
          <div className="pt-3 border-t border-[#E4D8C9]">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C] mb-2">
              <Sparkles className="h-3 w-3" /> Station Cleanup
            </p>
            <div className="space-y-2">
              {cleanupForThisColumn.map((item) => (
                <CheckRow key={item.id} item={item} onToggle={onToggle} bold />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProductionSOP() {
  const { taskId } = useParams<{ taskId: string }>()
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(-1) // -1 = overview page, else index into columns
  const [timers, setTimers] = useState<TimerEntry[]>([])
  const [now, setNow] = useState<number>(() => Date.now())

  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const token = localStorage.getItem('token')
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  const fetchTask = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/tasks/${taskId}`, authConfig)
      setTask(res.data.data)
      setError(null)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load this SOP')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // One clock, ticking once a second, drives every running countdown across
  // every recipe -- so timers keep going no matter which page you're on.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fire the alarm exactly once per timer, the moment it crosses zero.
  useEffect(() => {
    const justFinished = timers.filter((t) => !t.alarmed && now >= t.endsAt)
    if (justFinished.length > 0) {
      playAlarm()
      setTimers((prev) => prev.map((t) => (justFinished.some((j) => j.itemId === t.itemId) ? { ...t, alarmed: true } : t)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  const startTimer = (item: ChecklistItem, recipeName: string, minutes: number) => {
    setTimers((prev) => [
      ...prev.filter((t) => t.itemId !== item.id),
      { itemId: item.id, label: item.label, recipeName, endsAt: Date.now() + Math.round(minutes * 60) * 1000, alarmed: false },
    ])
  }
  const stopTimer = (itemId: number) => setTimers((prev) => prev.filter((t) => t.itemId !== itemId))

  const toggleItem = async (item: ChecklistItem) => {
    if (!task) return
    // Optimistic -- a kitchen station checking things off shouldn't wait on
    // a round trip to see the box tick.
    setTask({
      ...task,
      checklist_items: task.checklist_items.map((c) => (c.id === item.id ? { ...c, is_completed: !c.is_completed } : c)),
    })
    try {
      await axios.patch(`${apiUrl}/api/admin/tasks/${taskId}/checklist-items/${item.id}`, { is_completed: !item.is_completed }, authConfig)
    } catch {
      fetchTask() // roll back to real state on failure
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#F5EFE5] flex items-center justify-center text-[#755B4C]">Loading SOP…</main>
  }
  if (error || !task) {
    return (
      <main className="min-h-screen bg-[#F5EFE5] flex flex-col items-center justify-center gap-3 text-[#755B4C]">
        <p>{error || 'Task not found'}</p>
        <Link to="/operational-optimization" className="text-[#2E527F] font-bold underline">Back to Operations Hub</Link>
      </main>
    )
  }

  // Group by recipe (group_label); cleanup/employee lines (group_label
  // null) are pulled out separately -- cleanup gets attached to whichever
  // column is the *last* of its category (finish all the chicken, then
  // clean the chicken station, then move on), employee checklist lives on
  // the overview page since it applies before touching any recipe at all.
  const columns: Column[] = []
  const columnIndex: Record<string, number> = {}
  const employeeItems: ChecklistItem[] = []
  const cleanupItems: ChecklistItem[] = []
  for (const item of task.checklist_items) {
    if (!item.group_label) {
      if (item.line_kind === 'employee') employeeItems.push(item)
      else cleanupItems.push(item)
      continue
    }
    if (!(item.group_label in columnIndex)) {
      columnIndex[item.group_label] = columns.length
      columns.push({ name: item.group_label, category: item.category, items: [] })
    }
    columns[columnIndex[item.group_label]].items.push(item)
  }

  const cleanupForColumn = (idx: number): ChecklistItem[] => {
    const col = columns[idx]
    const next = columns[idx + 1]
    const isLastOfCategory = !next || next.category !== col.category
    return isLastOfCategory ? cleanupItems.filter((c) => c.category === col.category) : []
  }

  const totalItems = task.checklist_items.length
  const doneItems = task.checklist_items.filter((i) => i.is_completed).length
  const employeeDone = employeeItems.filter((i) => i.is_completed).length
  const timerProps: TimerProps = { timers, now, onStart: startTimer, onStop: stopTimer }

  const goPrev = () => setPage((p) => Math.max(-1, p - 1))
  const goNext = () => setPage((p) => Math.min(columns.length - 1, p + 1))

  return (
    <main className="min-h-screen bg-[#F5EFE5]">
      <div className="print:hidden sticky top-0 z-20">
        <div className="flex items-center justify-between gap-4 border-b border-[#DED2C2] bg-[#FBF7F0] px-6 py-3">
          <Link to="/operational-optimization" className="flex items-center gap-1.5 text-sm font-bold text-[#2E527F] hover:text-[#1a344f] transition">
            <ArrowLeft className="h-4 w-4" /> Operations Hub
          </Link>
          <div className="flex items-center gap-2">
            <p className="text-sm font-extrabold text-[#4B2B1D] truncate max-w-[280px] sm:max-w-none">{task.title}</p>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-[#2E527F] px-3 py-1.5 text-sm font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition flex-shrink-0"
            >
              <Printer className="h-4 w-4" /> Print SOP
            </button>
          </div>
        </div>

        {/* Notebook tabs -- one per recipe, colored by category, plus Overview */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#DED2C2] bg-white px-4 py-2">
          <button
            onClick={() => setPage(-1)}
            className={`flex-shrink-0 w-[152px] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              page === -1 ? 'bg-[#2E527F] text-white' : 'bg-[#F1EAE0] text-[#755B4C] hover:bg-[#E4D8C9]'
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">Overview</span>
          </button>
          {columns.map((col, idx) => {
            const colDone = col.items.filter((i) => i.line_kind !== 'info' && i.is_completed).length
            const colTotal = col.items.filter((i) => i.line_kind !== 'info').length
            const hasRunningTimer = timers.some((t) => t.recipeName === col.name)
            return (
              <button
                key={col.name}
                onClick={() => setPage(idx)}
                title={col.name}
                className={`flex-shrink-0 w-[152px] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  page === idx ? 'bg-[#2E527F] text-white' : 'bg-[#F1EAE0] text-[#755B4C] hover:bg-[#E4D8C9]'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ background: col.category === 'vegetables' ? '#A4B89E' : col.category === 'carbohydrates' ? '#D9BE5F' : col.category === 'sauces' ? '#ABBCCF' : '#E89E93' }}
                />
                <span className="flex-1 min-w-0 truncate text-left">{col.name}</span>
                <span className={`flex-shrink-0 ${page === idx ? 'text-white/70' : 'text-[#9A7E6F]'}`}>{colDone}/{colTotal}</span>
                {hasRunningTimer && <TimerIcon className={`h-3 w-3 flex-shrink-0 ${page === idx ? 'text-white' : 'text-[#D97706]'}`} />}
              </button>
            )
          })}
        </div>

        {/* Active timers -- pinned across every page, since multiple recipes
            run in parallel and a timer started on one shouldn't vanish from
            view the moment you flip to another. */}
        {timers.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-[#DED2C2] bg-[#FEF3C7] px-4 py-2">
            <span className="flex-shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-[#92400E]">Active timers</span>
            {timers.map((t) => {
              const remaining = Math.max(0, Math.round((t.endsAt - now) / 1000))
              const mm = Math.floor(remaining / 60)
              const ss = remaining % 60
              const done = remaining <= 0
              const colIdx = columnIndex[t.recipeName]
              return (
                <button
                  key={t.itemId}
                  onClick={() => setPage(colIdx)}
                  className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                    done ? 'bg-[#DC2626] text-white animate-pulse' : 'bg-[#2E527F] text-white hover:bg-[#24466E]'
                  }`}
                >
                  <TimerIcon className="h-3.5 w-3.5" />
                  {t.recipeName}: {done ? "Time's up!" : `${mm}:${String(ss).padStart(2, '0')}`}
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); stopTimer(t.itemId) }}
                    className="ml-0.5 opacity-80 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- On-screen: one page at a time ---------- */}
      <div className="print:hidden p-6 max-w-3xl mx-auto">
        {page === -1 ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#2E527F] bg-white p-6">
              <div className="flex items-center gap-2 text-[#4B2B1D]">
                <ChefHat className="h-6 w-6" />
                <h1 className="text-2xl font-extrabold">{task.title}</h1>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#755B4C]">
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {formatDate(task.due_date)}</span>
                {task.estimated_minutes != null && <span>~{task.estimated_minutes} min</span>}
                <span className="font-bold text-[#4B2B1D]">{doneItems}/{totalItems} steps done</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[#E4D8C9] overflow-hidden">
                <div className="h-full rounded-full bg-[#16A34A] transition-all" style={{ width: `${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%` }} />
              </div>
              {task.description && <p className="mt-3 whitespace-pre-line text-sm text-[#755B4C]">{task.description}</p>}
            </div>

            {employeeItems.length > 0 && (
              <div className="rounded-2xl border-2 border-[#D97706] bg-[#FEF3C7] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[#92400E] font-extrabold">
                    <ShieldCheck className="h-5 w-5" /> Employee Checklist — before you touch any food
                  </div>
                  <span className="text-xs font-bold text-[#92400E]">{employeeDone}/{employeeItems.length}</span>
                </div>
                <div className="space-y-1.5">
                  {employeeItems.map((item) => (
                    <button key={item.id} onClick={() => toggleItem(item)} className="flex w-full items-start gap-2 text-left">
                      {item.is_completed ? (
                        <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#16A34A]" />
                      ) : (
                        <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#92400E]" />
                      )}
                      <span className={`text-sm ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Kitchen Board -- the actual control surface for juggling
                several recipes at once: what's next on each, one tap to
                check it off or start timing it, without opening the page. */}
            <div className="rounded-2xl border border-[#2E527F] bg-white overflow-hidden">
              <p className="px-4 pt-4 text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C]">Kitchen board — what's next on each recipe</p>
              <div className="divide-y divide-[#E4D8C9]">
                {columns.map((col, idx) => {
                  const colActionItems = col.items.filter((i) => i.line_kind !== 'info')
                  const colDone = colActionItems.filter((i) => i.is_completed).length
                  const info = col.items.find((i) => i.line_kind === 'info')
                  const next = nextActionableItem(col)
                  return (
                    <div key={col.name} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setPage(idx)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <span className={`h-3 w-3 rounded-full flex-shrink-0 ${(col.category && CATEGORY_CARD_BG[col.category]) || DEFAULT_CARD_BG}`} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold text-[#4B2B1D] truncate">{col.name}</span>
                            {next ? (
                              <span className="block text-[11px] text-[#2E527F] truncate">Next: {next.label}</span>
                            ) : (
                              <span className="block text-[11px] font-bold text-[#16A34A]">All steps done</span>
                            )}
                            {!next && info && <span className="block text-[11px] text-[#9A7E6F] truncate">{info.label}</span>}
                          </span>
                        </button>
                        <span className="flex-shrink-0 text-xs font-bold text-[#755B4C]">{colDone}/{colActionItems.length}</span>
                        <button onClick={() => setPage(idx)} className="flex-shrink-0">
                          <ArrowRight className="h-4 w-4 text-[#B9A88F]" />
                        </button>
                      </div>
                      {next && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                          <button
                            onClick={() => toggleItem(next)}
                            className="flex items-center gap-1 rounded-lg border border-[#16A34A] px-2 py-1 text-xs font-bold text-[#16A34A] hover:bg-[#EAF5EC] transition"
                          >
                            <CheckSquare className="h-3.5 w-3.5" /> Mark done
                          </button>
                          {next.line_kind && TIMEABLE_KINDS.has(next.line_kind) && (
                            <TimerButton item={next} recipeName={col.name} timers={timers} onStart={startTimer} onStop={stopTimer} now={now} />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <RecipeCard
              col={columns[page]}
              onToggle={toggleItem}
              cleanupForThisColumn={cleanupForColumn(page)}
              nextItemId={nextActionableItem(columns[page])?.id ?? null}
              timerProps={timerProps}
            />
            <div className="flex items-center justify-between">
              <button
                onClick={goPrev}
                className="flex items-center gap-1.5 rounded-lg border border-[#2E527F] px-4 py-2 text-sm font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition"
              >
                <ArrowLeft className="h-4 w-4" /> {page === 0 ? 'Overview' : columns[page - 1].name}
              </button>
              <span className="text-xs text-[#9A7E6F]">{page + 1} of {columns.length}</span>
              <button
                onClick={goNext}
                disabled={page === columns.length - 1}
                className="flex items-center gap-1.5 rounded-lg border border-[#2E527F] px-4 py-2 text-sm font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {page < columns.length - 1 ? columns[page + 1].name : 'Done'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Print: everything stacked, one recipe per block ---------- */}
      <div className="hidden print:block p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-[#4B2B1D]">
            <ChefHat className="h-6 w-6" />
            <h1 className="text-2xl font-extrabold">{task.title}</h1>
          </div>
          <p className="text-sm text-[#755B4C]">{formatDate(task.due_date)} • {doneItems}/{totalItems} steps done</p>
          {task.description && <p className="mt-2 whitespace-pre-line text-sm text-[#755B4C]">{task.description}</p>}
        </div>
        {employeeItems.length > 0 && (
          <div className="mb-4 rounded-2xl border-2 border-[#D97706] bg-[#FEF3C7] p-4 print:break-inside-avoid">
            <div className="flex items-center gap-2 text-[#92400E] font-extrabold mb-2">
              <ShieldCheck className="h-5 w-5" /> Employee Checklist — before you touch any food
            </div>
            <div className="space-y-1.5">
              {employeeItems.map((item) => <CheckRow key={item.id} item={item} onToggle={toggleItem} />)}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {columns.map((col, idx) => (
            <RecipeCard key={col.name} col={col} onToggle={toggleItem} cleanupForThisColumn={cleanupForColumn(idx)} />
          ))}
        </div>
      </div>
    </main>
  )
}
