import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ChefHat, X, Clock, CheckCircle2, AlertTriangle, CheckSquare, Square, Info } from 'lucide-react'
import { CATEGORY_CARD_BG, DEFAULT_CARD_BG } from '../utils/categoryColors'

type RecipeStatus = {
  name: string
  category: string | null
  image: string | null
  dueDate: string
  taskId: number
  taskIds: number[]
  done: number
  total: number
}

// Same generic food photo Recipes.tsx falls back to when a recipe has no
// photo on file -- only 5 of 36 recipes have a real one right now, so most
// avatars will show this; consistent with how the rest of the app already
// handles a missing recipe image, not a fabricated per-recipe placeholder.
const DEFAULT_RECIPE_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'

const CATEGORY_RING_COLOR: Record<string, string> = {
  vegetables: '#A4B89E',
  carbohydrates: '#D9BE5F',
  sauces: '#ABBCCF',
  beef: '#E89E93',
  chicken: '#E89E93',
  turkey: '#E89E93',
}

function ringColorFor(category: string | null): string {
  return (category && CATEGORY_RING_COLOR[category]) || '#B9A88F'
}

// Facebook chat heads are a face, not a status dot -- this is that photo,
// with a thin ring in the recipe's category color so the color-coding
// established across the rest of the app (Recipes, Menu Planner, SOP
// columns) still reads at a glance.
function RecipeAvatar({ image, category, size = 32 }: { image: string | null; category: string | null; size?: number }) {
  const [src, setSrc] = useState(image || DEFAULT_RECIPE_IMAGE)
  useEffect(() => setSrc(image || DEFAULT_RECIPE_IMAGE), [image])
  return (
    <span
      className="flex-shrink-0 rounded-full overflow-hidden border-2 bg-[#F1EAE0]"
      style={{ width: size, height: size, borderColor: ringColorFor(category) }}
    >
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setSrc(DEFAULT_RECIPE_IMAGE)}
      />
    </span>
  )
}

type Urgency = 'overdue' | 'due_today' | 'upcoming' | 'done'

type CardItem = {
  id: number
  label: string
  is_completed: boolean
  sort_order: number
  group_label: string | null
  line_kind: string | null
  taskId: number
}

type OpenCard = { name: string; category: string | null; image: string | null; taskIds: number[]; dueDate: string; collapsed: boolean }

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mondayOnOrBefore(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay() // 0=Sun..6=Sat
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day))
  return copy
}

// Menu Planner only ever has one editable week open at a time -- whatever's
// saved in the Monday/Thursday blocks right now always targets the week
// *after* today's own calendar week (adminMenuPlanner.js's
// getNextWeekDates(): "date_trunc('week', NOW()+1day) - 1day + 7days"),
// never "this literal Sunday-Saturday span". This mirrors that exact
// calculation in JS so the widget looks at the same week the blocks were
// actually just saved for, instead of a week that (until it arrives) never
// has any Kitchen tasks in it at all.
function plannedWeekStart(): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const shifted = new Date(today)
  shifted.setDate(shifted.getDate() + 1)
  const monday = mondayOnOrBefore(shifted)
  const sundayBefore = new Date(monday)
  sundayBefore.setDate(sundayBefore.getDate() - 1)
  const target = new Date(sundayBefore)
  target.setDate(target.getDate() + 7)
  return toISODate(target)
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

const KIND_SECTION_TITLE: Record<string, string> = {
  ingredient: 'Ingredients',
  mise_en_place: 'Mise en Place',
  prep_step: 'Prep Steps',
  cook_step: 'Cook Steps',
  qc: 'Checkpoints',
  portion: 'Checkpoints',
  label: 'Checkpoints',
}

function formatDueLabel(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// A working mini-SOP, docked at the bottom like an open Facebook chat
// window: fetches the real checklist across every task this recipe spans
// (Prep + Production are separate tasks, so its full picture lives across
// both), lets the cook check items off right here, and can be collapsed
// back down to just its header bar without losing its place.
function RecipeMiniCard({ card, onClose, onToggleCollapse, apiUrl, token }: {
  card: OpenCard
  onClose: () => void
  onToggleCollapse: () => void
  apiUrl: string
  token: string | null
}) {
  const [items, setItems] = useState<CardItem[] | null>(null)

  const fetchItems = async () => {
    try {
      const results = await Promise.all(
        card.taskIds.map((id) => axios.get(`${apiUrl}/api/admin/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } }))
      )
      const merged: CardItem[] = []
      results.forEach((res, idx) => {
        const taskId = card.taskIds[idx]
        const taskItems: any[] = res.data.data?.checklist_items || []
        for (const item of taskItems) {
          if (item.group_label === card.name) merged.push({ ...item, taskId })
        }
      })
      setItems(merged)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.name])

  const toggle = async (item: CardItem) => {
    setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? { ...i, is_completed: !i.is_completed } : i)) : prev))
    try {
      await axios.patch(
        `${apiUrl}/api/admin/tasks/${item.taskId}/checklist-items/${item.id}`,
        { is_completed: !item.is_completed },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch {
      fetchItems()
    }
  }

  const infoItem = items?.find((i) => i.line_kind === 'info')
  const actionItems = (items || []).filter((i) => i.line_kind !== 'info')
  const done = actionItems.filter((i) => i.is_completed).length
  const total = actionItems.length
  const pct = total ? Math.round((done / total) * 100) : 0

  const sectionOrder: string[] = []
  const bySection: Record<string, { items: CardItem[]; numbered: boolean }> = {}
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
    <div className="w-72 flex-shrink-0 rounded-t-2xl border border-[#DED2C2] bg-white shadow-[0_-8px_24px_rgba(75,43,29,0.16)] overflow-hidden flex flex-col">
      <button
        onClick={onToggleCollapse}
        className={`flex items-center gap-2 px-3 py-2.5 text-left ${(card.category && CATEGORY_CARD_BG[card.category]) || DEFAULT_CARD_BG}`}
      >
        <RecipeAvatar image={card.image} category={card.category} size={30} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-extrabold text-[#4B2B1D] truncate">{card.name}</span>
          <span className="block text-[10px] text-[#4B2B1D]/70">{done}/{total} done</span>
        </span>
        <span className="flex-shrink-0 text-[10px] font-bold text-[#4B2B1D]/70">{pct}%</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="flex-shrink-0 p-0.5 rounded hover:bg-black/10"
          aria-label={`Close ${card.name}`}
        >
          <X className="h-3.5 w-3.5 text-[#4B2B1D]" />
        </span>
      </button>

      {!card.collapsed && (
        <>
          <div className="h-1 bg-[#E4D8C9] overflow-hidden flex-shrink-0">
            <div className="h-full rounded-full bg-[#16A34A] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 360 }}>
            {items === null ? (
              <p className="text-xs text-[#9A7E6F] text-center py-4">Loading…</p>
            ) : (
              <>
                {infoItem && (
                  <p className="flex items-start gap-1.5 text-[11px] text-[#755B4C]">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" /> {infoItem.label}
                  </p>
                )}
                {sectionOrder.map((title) => (
                  <div key={title}>
                    <p className="text-[9px] font-extrabold uppercase tracking-wide text-[#9A7E6F] mb-1">{title}</p>
                    <div className="space-y-1">
                      {bySection[title].items.map((item, i) => (
                        <button key={item.id} onClick={() => toggle(item)} className="flex w-full items-start gap-1.5 text-left group">
                          {item.is_completed ? (
                            <CheckSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#16A34A]" />
                          ) : (
                            <Square className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#B9A88F] group-hover:text-[#2E527F]" />
                          )}
                          <span className={`text-xs ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>
                            {bySection[title].numbered ? `${i + 1}. ${item.label}` : item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// A persistent, low-noise status affordance -- modeled after Facebook's
// bottom-right chat heads: a small bar sits anchored to the corner at all
// times (never blocking content), and clicking it slides a compact list
// panel up above it. Clicking a recipe in that list doesn't navigate away --
// it docks a working mini-card next to the bar, exactly like opening a chat
// window, and several recipes can be open (and worked on) side by side at
// once since several are genuinely cooking in parallel in real kitchen use.
// On-time production is the thing that matters here, so the bar itself only
// ever needs a glance (a colored dot) to answer "are we behind on anything
// this week" -- the full breakdown is one click away, not pushed in front
// of you by default.
export function WeeklyRecipeStatusWidget() {
  const [open, setOpen] = useState(false)
  const [recipes, setRecipes] = useState<RecipeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [openCards, setOpenCards] = useState<OpenCard[]>([])

  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const token = localStorage.getItem('token')

  const fetchStatus = async () => {
    try {
      const weekStart = plannedWeekStart()
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

  const openRecipeCard = (r: RecipeStatus) => {
    setOpenCards((prev) => {
      if (prev.some((c) => c.name === r.name)) {
        return prev.map((c) => (c.name === r.name ? { ...c, collapsed: false } : c))
      }
      return [{ name: r.name, category: r.category, image: r.image, taskIds: r.taskIds, dueDate: r.dueDate, collapsed: false }, ...prev]
    })
  }
  const closeCard = (name: string) => setOpenCards((prev) => prev.filter((c) => c.name !== name))
  const toggleCollapse = (name: string) => setOpenCards((prev) => prev.map((c) => (c.name === name ? { ...c, collapsed: !c.collapsed } : c)))

  const todayStr = toISODate(new Date())
  const withUrgency = recipes.map((r) => ({ ...r, urgency: urgencyOf(r, todayStr) }))
  const sorted = [...withUrgency].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
  const overdueCount = withUrgency.filter((r) => r.urgency === 'overdue').length
  const dueTodayCount = withUrgency.filter((r) => r.urgency === 'due_today').length

  const bubbleDot = overdueCount > 0 ? 'bg-[#DC2626]' : dueTodayCount > 0 ? 'bg-[#D97706]' : recipes.length > 0 ? 'bg-[#16A34A]' : 'bg-[#9A7E6F]'

  return (
    <div className="fixed bottom-0 right-6 z-40 flex flex-row-reverse items-end gap-3">
      <div className="flex flex-col items-end">
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
                  const isOpen = openCards.some((c) => c.name === r.name)
                  return (
                    <button
                      key={r.name}
                      onClick={() => openRecipeCard(r)}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-[#F9F5F0] transition ${isOpen ? 'bg-[#EAF0F7]' : ''}`}
                    >
                      <RecipeAvatar image={r.image} category={r.category} size={34} />
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
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className="w-72 flex-shrink-0 flex items-center gap-2 rounded-t-xl border border-b-0 border-[#DED2C2] bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgba(75,43,29,0.12)] hover:bg-[#F9F5F0] transition"
        >
          <span className="relative flex-shrink-0">
            {sorted.length > 0 ? (
              <span className="flex items-center -space-x-2">
                {sorted.slice(0, 3).map((r) => (
                  <RecipeAvatar key={r.name} image={r.image} category={r.category} size={22} />
                ))}
              </span>
            ) : (
              <ChefHat className="h-4 w-4 text-[#4B2B1D]" />
            )}
            <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white ${bubbleDot} ${overdueCount > 0 ? 'animate-pulse' : ''}`} />
          </span>
          <span className="flex-1 min-w-0 truncate text-left text-xs font-bold text-[#4B2B1D]">This Week's Recipes</span>
          {overdueCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-[#DC2626]" />
          ) : recipes.length > 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[#16A34A]" />
          ) : null}
        </button>
      </div>

      {openCards.map((card) => (
        <RecipeMiniCard
          key={card.name}
          card={card}
          onClose={() => closeCard(card.name)}
          onToggleCollapse={() => toggleCollapse(card.name)}
          apiUrl={apiUrl}
          token={token}
        />
      ))}
    </div>
  )
}
