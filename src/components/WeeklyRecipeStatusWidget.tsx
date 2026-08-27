import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ChefHat, X, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { CATEGORY_CARD_BG, DEFAULT_CARD_BG } from '../utils/categoryColors'

type RecipeStatus = {
  name: string
  category: string | null
  dueDate: string
  taskId: number
  done: number
  total: number
}

type Urgency = 'overdue' | 'due_today' | 'upcoming' | 'done'

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Same Sunday-anchored operational week as Operations Hub itself, computed
// independently here so this widget always reflects the real current week
// regardless of which week the user has paged to in the main view.
function currentWeekStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  if (day === 6) d.setDate(d.getDate() + 1) // Saturday belongs to next week's Sunday anchor
  else d.setDate(d.getDate() - day)
  return toISODate(d)
}

function urgencyOf(r: RecipeStatus, todayStr: string): Urgency {
  if (r.total > 0 && r.done >= r.total) return 'done'
  const due = r.dueDate.slice(0, 10)
  if (due < todayStr) return 'overdue'
  if (due === todayStr) return 'due_today'
  return 'upcoming'
}

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, due_today: 1, upcoming: 2, done: 3 }

const URGENCY_STYLE: Record<Urgency, { label: string; text: string; bg: string; dot: string }> = {
  overdue: { label: 'Overdue', text: 'text-[#DC2626]', bg: 'bg-[#FDEBEC]', dot: 'bg-[#DC2626]' },
  due_today: { label: 'Due today', text: 'text-[#D97706]', bg: 'bg-[#FEF3C7]', dot: 'bg-[#D97706]' },
  upcoming: { label: 'On track', text: 'text-[#16A34A]', bg: 'bg-[#EAF5EC]', dot: 'bg-[#16A34A]' },
  done: { label: 'Done', text: 'text-[#755B4C]', bg: 'bg-[#F1EAE0]', dot: 'bg-[#9A7E6F]' },
}

function formatDueLabel(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// A persistent, low-noise status affordance -- modeled after Facebook's
// bottom-right chat heads: a small bar sits anchored to the corner at all
// times (never blocking content), and clicking it slides a compact panel up
// above it. On-time production is the thing that matters here, so the bar
// itself only ever needs a glance (a colored dot) to answer "are we behind
// on anything this week" -- the full breakdown is one click away, not
// pushed in front of you by default.
export function WeeklyRecipeStatusWidget() {
  const [open, setOpen] = useState(false)
  const [recipes, setRecipes] = useState<RecipeStatus[]>([])
  const [loading, setLoading] = useState(true)

  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const token = localStorage.getItem('token')

  const fetchStatus = async () => {
    try {
      const weekStart = currentWeekStart()
      const res = await axios.get(`${apiUrl}/api/admin/tasks/week/${weekStart}/recipe-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setRecipes(res.data.data?.recipes || [])
    } catch {
      // Silent -- a status widget failing to load shouldn't interrupt the
      // page it's floating over; the bubble just shows a neutral state.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Keep the corner badge honest even while the panel is closed and
    // nobody's touched a checklist recently -- due dates roll from
    // "upcoming" to "overdue" purely with the passage of time.
    const id = setInterval(fetchStatus, 120000)
    return () => clearInterval(id)
  }, [])

  const todayStr = toISODate(new Date())
  const withUrgency = recipes.map((r) => ({ ...r, urgency: urgencyOf(r, todayStr) }))
  const sorted = [...withUrgency].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
  const overdueCount = withUrgency.filter((r) => r.urgency === 'overdue').length
  const dueTodayCount = withUrgency.filter((r) => r.urgency === 'due_today').length

  const bubbleDot = overdueCount > 0 ? 'bg-[#DC2626]' : dueTodayCount > 0 ? 'bg-[#D97706]' : recipes.length > 0 ? 'bg-[#16A34A]' : 'bg-[#9A7E6F]'

  return (
    <div className="fixed bottom-0 right-6 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-0 w-80 max-h-[440px] flex flex-col rounded-t-2xl border border-[#DED2C2] border-b-0 bg-white shadow-[0_-8px_32px_rgba(75,43,29,0.18)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4D8C9] bg-[#FBF7F0]">
            <div>
              <p className="text-sm font-extrabold text-[#4B2B1D]">This Week's Recipes</p>
              <p className="text-[11px] text-[#755B4C]">
                {overdueCount > 0 ? `${overdueCount} overdue` : dueTodayCount > 0 ? `${dueTodayCount} due today` : 'All on schedule'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#755B4C] hover:text-[#4B2B1D] transition" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#F1EAE0]">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-[#9A7E6F]">Loading…</p>
            ) : sorted.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#9A7E6F]">Nothing in production this week yet.</p>
            ) : (
              sorted.map((r) => {
                const style = URGENCY_STYLE[r.urgency]
                const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0
                return (
                  <a
                    key={`${r.name}-${r.taskId}`}
                    href={`/operational-optimization/sop/${r.taskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 px-4 py-3 hover:bg-[#F9F5F0] transition"
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${(r.category && CATEGORY_CARD_BG[r.category]) || DEFAULT_CARD_BG}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#4B2B1D] text-sm truncate">{r.name}</span>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>{style.label}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-[#9A7E6F]">
                        <Clock className="h-3 w-3" /> {formatDueLabel(r.dueDate)}
                        <span className="text-[#DED2C2]">•</span>
                        {pct}% done
                      </span>
                      <span className="mt-1 block h-1 rounded-full bg-[#E4D8C9] overflow-hidden">
                        <span className={`block h-full rounded-full ${style.dot}`} style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </a>
                )
              })
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-t-xl border border-b-0 border-[#DED2C2] bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgba(75,43,29,0.12)] hover:bg-[#F9F5F0] transition"
      >
        <span className="relative flex-shrink-0">
          <ChefHat className="h-4 w-4 text-[#4B2B1D]" />
          <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${bubbleDot} ${overdueCount > 0 ? 'animate-pulse' : ''}`} />
        </span>
        <span className="text-xs font-bold text-[#4B2B1D]">This Week's Recipes</span>
        {overdueCount > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-[#DC2626]" />
        ) : recipes.length > 0 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
        ) : null}
      </button>
    </div>
  )
}
