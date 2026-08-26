import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Printer, CheckSquare, Square, Clock, ChefHat, ShieldCheck, Sparkles } from 'lucide-react'
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

const KIND_SECTION_TITLE: Record<string, string> = {
  ingredient: 'Ingredients',
  mise_en_place: 'Mise en Place',
  step: 'Cook Steps',
  qc: 'Checkpoints',
  portion: 'Checkpoints',
  label: 'Checkpoints',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export default function ProductionSOP() {
  const { taskId } = useParams<{ taskId: string }>()
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // The header banner stays neutral -- a task can span every category now
  // (one section per operational day instead of one per protein), so the
  // color-coding lives on each recipe's own column instead of the page header.
  const accentBg = DEFAULT_CARD_BG

  // Group by recipe (group_label); cleanup/global lines (group_label null)
  // render as a full-width closer at the bottom, not their own column. Each
  // column keeps its recipe's own category so it's colored independently of
  // its neighbors even though they're all one task.
  const columns: { name: string; category: string | null; items: ChecklistItem[] }[] = []
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

  const totalItems = task.checklist_items.length
  const doneItems = task.checklist_items.filter((i) => i.is_completed).length

  return (
    <main className="min-h-screen bg-[#F5EFE5]">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#DED2C2] bg-[#FBF7F0] px-6 py-3">
        <Link to="/operational-optimization" className="flex items-center gap-1.5 text-sm font-bold text-[#2E527F] hover:text-[#1a344f] transition">
          <ArrowLeft className="h-4 w-4" /> Operations Hub
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-[#2E527F] px-3 py-1.5 text-sm font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition"
        >
          <Printer className="h-4 w-4" /> Print SOP
        </button>
      </div>

      <div className={`px-8 py-6 ${accentBg} border-b border-[#DED2C2]`}>
        <div className="flex items-center gap-2 text-[#4B2B1D]">
          <ChefHat className="h-6 w-6" />
          <h1 className="text-2xl font-extrabold">{task.title}</h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#4B2B1D]/80">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" /> {formatDate(task.due_date)}
          </span>
          {task.estimated_minutes != null && <span>~{task.estimated_minutes} min</span>}
          <span className="font-bold">{doneItems}/{totalItems} steps done</span>
        </div>
        <div className="mt-3 h-2 max-w-md rounded-full bg-white/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#16A34A] transition-all"
            style={{ width: `${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%` }}
          />
        </div>
        {task.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-[#4B2B1D]/80 max-w-2xl">{task.description}</p>
        )}
      </div>

      {employeeItems.length > 0 && (
        <div className="px-6 pt-6">
          <div className="rounded-2xl border-2 border-[#D97706] bg-[#FEF3C7] p-4 max-w-2xl">
            <div className="flex items-center gap-2 text-[#92400E] font-extrabold mb-2">
              <ShieldCheck className="h-5 w-5" /> Employee Checklist — before you touch any food
            </div>
            <div className="space-y-1.5">
              {employeeItems.map((item) => (
                <button key={item.id} onClick={() => toggleItem(item)} className="flex w-full items-start gap-2 text-left">
                  {item.is_completed ? (
                    <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#16A34A]" />
                  ) : (
                    <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#92400E]" />
                  )}
                  <span className={`text-sm ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {columns.map((col) => {
            const colDone = col.items.filter((i) => i.is_completed).length
            // Grouped by section title, not raw kind -- qc/portion/label all
            // read "Checkpoints" so they collapse into one section instead
            // of three headers with one line each.
            const sectionOrder: string[] = []
            const bySection: Record<string, { items: ChecklistItem[]; numbered: boolean }> = {}
            for (const item of col.items) {
              const kind = item.line_kind || 'step'
              const title = KIND_SECTION_TITLE[kind] || 'Checkpoints'
              if (!bySection[title]) {
                bySection[title] = { items: [], numbered: kind === 'step' }
                sectionOrder.push(title)
              }
              bySection[title].items.push(item)
            }
            return (
              <div key={col.name} className="w-[320px] flex-shrink-0 rounded-2xl border border-[#2E527F] bg-white shadow-[0_8px_24px_rgba(75,43,29,0.06)] overflow-hidden print:break-inside-avoid">
                <div className={`border-b border-[#DED2C2] ${(col.category && CATEGORY_CARD_BG[col.category]) || DEFAULT_CARD_BG} px-4 py-3`}>
                  <h2 className="font-extrabold text-[#4B2B1D]">{col.name}</h2>
                  <p className="text-xs text-[#755B4C]">{colDone}/{col.items.length} done</p>
                </div>
                <div className="p-4 space-y-4">
                  {sectionOrder.map((title) => (
                    <div key={title}>
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C] mb-1.5">
                        {title}
                      </p>
                      <div className="space-y-1.5">
                        {bySection[title].items.map((item, i) => (
                          <button
                            key={item.id}
                            onClick={() => toggleItem(item)}
                            className="flex w-full items-start gap-2 text-left group"
                          >
                            {item.is_completed ? (
                              <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#16A34A]" />
                            ) : (
                              <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#B9A88F] group-hover:text-[#2E527F]" />
                            )}
                            <span className={`text-sm ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>
                              {bySection[title].numbered ? `${i + 1}. ${item.label}` : item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {cleanupItems.length > 0 && (
          <div className="mt-2 rounded-2xl border border-[#2E527F] bg-white p-4 max-w-md">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C] mb-1.5">
              <Sparkles className="h-3 w-3" /> Station Cleanup
            </div>
            {cleanupItems.map((item) => (
              <button key={item.id} onClick={() => toggleItem(item)} className="flex w-full items-center gap-2 text-left">
                {item.is_completed ? (
                  <CheckSquare className="h-4 w-4 flex-shrink-0 text-[#16A34A]" />
                ) : (
                  <Square className="h-4 w-4 flex-shrink-0 text-[#B9A88F]" />
                )}
                <span className={`text-sm font-bold ${item.is_completed ? 'line-through text-[#9A7E6F]' : 'text-[#4B2B1D]'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
