import React, { useState, useEffect } from 'react'
import { Loader, AlertCircle, Clock, ShoppingCart, Users, Info, X } from 'lucide-react'

const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

type IngredientNeed = { name: string; store: string; pounds_needed: number; cost: number | null }
type RecipeBreakdown = { recipe_name: string; servings_per_plate: number; ingredients: IngredientNeed[] }

type PlateItem = {
  plate_id: number
  plate_name: string
  category: string
  quantity: number | null
  quantity_is_estimate: boolean
  task: string
  recipes: RecipeBreakdown[]
  station: string
  critical: boolean
  completed: boolean
  completed_at: string | null
  actual_quantity: number | null
  notes: string
}

type Issue = {
  id: number
  day: string
  plate_id: number | null
  plate_name: string | null
  issue_type: string
  reason: string
  proposed_solution: string | null
  status: 'open' | 'resolved'
  created_at: string
}

type Suggestion = { type: string; severity: 'warning' | 'info'; message: string }

type Comparison = {
  prior_week: string
  total_tasks: number
  completed_tasks: number
  completion_rate: number | null
}

type Schedule = Record<string, PlateItem[]>

type ProcurementItem = { ingredient: string; quantity: number; unit: string; cost_per_lb: number | null; total_cost: number | null }
type SupplierOrder = { items: ProcurementItem[]; total_cost: number }

type PlanData = {
  summary: { week_start: string; active_customers: number; estimated_meals: number | null; meals_are_estimate: boolean; plates: number }
  schedule: Schedule
  procurement: { suppliers: number; total_cost: number; orders: Record<string, SupplierOrder> }
  labor: Array<{ role: string; target_hours: number; hourly_rate: number; budget_cost: number }>
  message?: string
}

export default function TaskManagementPage() {
  const [weeks, setWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [activeTab, setActiveTab] = useState('timeline')
  const [loading, setLoading] = useState(false)
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [issueFormFor, setIssueFormFor] = useState<number | null>(null) // plate_id
  const [issueType, setIssueType] = useState('missing_ingredient')
  const [issueReason, setIssueReason] = useState('')
  const [issueSolution, setIssueSolution] = useState('')
  const [savingTask, setSavingTask] = useState<number | null>(null)

  useEffect(() => {
    fetchWeeks()
  }, [])

  useEffect(() => {
    generatePlan()
  }, [selectedWeek])

  const fetchWeeks = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/task-management-auto/weeks-with-plates`)
      const data = await response.json()
      setWeeks(data.weeks || [])
    } catch (err) {
      console.error('Error fetching weeks:', err)
    }
  }

  const generatePlan = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/admin/task-management-auto/auto-generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedWeek ? { week_start: selectedWeek } : {}),
      })

      if (!response.ok) throw new Error('Failed to generate plan')
      const data = await response.json()
      setPlanData(data)

      const weekStart = data.summary?.week_start
      if (weekStart) {
        fetchIssues(weekStart)
        fetchSuggestions(weekStart)
        fetchComparison(weekStart)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchIssues = async (weekStart: string) => {
    try {
      const response = await fetch(`${API_BASE}/admin/task-management-auto/issues?week_start=${weekStart}`)
      const data = await response.json()
      setIssues(data.data || [])
    } catch (err) {
      console.error('Error fetching issues:', err)
    }
  }

  const fetchSuggestions = async (weekStart: string) => {
    try {
      const response = await fetch(`${API_BASE}/admin/task-management-auto/suggestions?week_start=${weekStart}`)
      const data = await response.json()
      setSuggestions(data.data || [])
    } catch (err) {
      console.error('Error fetching suggestions:', err)
    }
  }

  const fetchComparison = async (weekStart: string) => {
    try {
      const response = await fetch(`${API_BASE}/admin/task-management-auto/comparison?week_start=${weekStart}`)
      const data = await response.json()
      setComparison(data.data || null)
    } catch (err) {
      console.error('Error fetching comparison:', err)
    }
  }

  const saveTaskStatus = async (day: string, plateId: number, completed: boolean, actualQuantity: string, notes: string) => {
    if (!planData?.summary.week_start) return
    setSavingTask(plateId)
    try {
      await fetch(`${API_BASE}/admin/task-management-auto/task-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: planData.summary.week_start,
          day,
          plate_id: plateId,
          completed,
          actual_quantity: actualQuantity ? parseFloat(actualQuantity) : null,
          notes: notes || null,
        }),
      })
      await generatePlan()
    } catch (err) {
      console.error('Error saving task status:', err)
    } finally {
      setSavingTask(null)
    }
  }

  const submitIssue = async (day: string, plateId: number | null) => {
    if (!planData?.summary.week_start || !issueReason.trim()) return
    try {
      await fetch(`${API_BASE}/admin/task-management-auto/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: planData.summary.week_start,
          day,
          plate_id: plateId,
          issue_type: issueType,
          reason: issueReason.trim(),
          proposed_solution: issueSolution.trim() || null,
        }),
      })
      setIssueFormFor(null)
      setIssueReason('')
      setIssueSolution('')
      fetchIssues(planData.summary.week_start)
    } catch (err) {
      console.error('Error submitting issue:', err)
    }
  }

  const resolveIssue = async (id: number) => {
    if (!planData?.summary.week_start) return
    try {
      await fetch(`${API_BASE}/admin/task-management-auto/issues/${id}/resolve`, { method: 'PUT' })
      fetchIssues(planData.summary.week_start)
    } catch (err) {
      console.error('Error resolving issue:', err)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">Generating Production Plan...</h2>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6">
          <AlertCircle className="w-6 h-6 text-red-600 mb-2" />
          <h2 className="text-xl font-bold text-red-900">Error</h2>
          <p className="text-red-800">{error}</p>
          <button onClick={generatePlan} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Try Again
          </button>
        </div>
      </main>
    )
  }

  if (!planData) {
    return (
      <main className="flex-1 p-8">
        <p className="text-slate-600">No data</p>
      </main>
    )
  }

  const { summary, schedule, procurement, labor, message } = planData

  // Colors are keyed by activity TYPE, not by day -- lets you scan the
  // week's shape at a glance (e.g. "this week is cook-heavy")
  const activityColors: Record<string, { bg: string; border: string; text: string; chip: string }> = {
    PREP: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', chip: 'bg-yellow-200 text-yellow-900' },
    COOK: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', chip: 'bg-orange-200 text-orange-900' },
    PREP_COOK: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', chip: 'bg-amber-200 text-amber-900' },
    DELIVER: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800', chip: 'bg-blue-200 text-blue-900' },
    SHOP: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-800', chip: 'bg-purple-200 text-purple-900' },
    ADMIN: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-800', chip: 'bg-slate-200 text-slate-900' },
  }

  const dayMeta: Record<string, { icon: string; activity: keyof typeof activityColors; label: string; offset: number }> = {
    Saturday: { icon: '🔪', activity: 'PREP', label: 'Prep for Monday delivery', offset: -1 },
    Sunday: { icon: '🍳', activity: 'COOK', label: 'Cook for Monday delivery', offset: 0 },
    Monday: { icon: '🚚', activity: 'DELIVER', label: 'Pack & deliver', offset: 1 },
    Tuesday: { icon: '🛒', activity: 'SHOP', label: 'Shopping, restocking, admin', offset: 2 },
    Wednesday: { icon: '⚡', activity: 'PREP_COOK', label: 'Prep & cook for Thursday delivery', offset: 3 },
    Thursday: { icon: '📦', activity: 'DELIVER', label: 'Pack & deliver', offset: 4 },
    Friday: { icon: '📋', activity: 'ADMIN', label: 'Weekly wrap-up, inventory audit', offset: 5 },
  }

  const daysOfWeek = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  const dateForDay = (day: string): Date | null => {
    if (!planData?.summary.week_start) return null
    // week_start may come back as a plain date or a full ISO timestamp
    // depending on how pg serializes it -- strip to just the date part first
    const datePart = String(planData.summary.week_start).split('T')[0]
    const base = new Date(datePart + 'T00:00:00Z')
    if (isNaN(base.getTime())) return null
    base.setUTCDate(base.getUTCDate() + dayMeta[day].offset)
    return base
  }

  return (
    <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Production Planning</h1>
          <p className="text-slate-600 mt-2">
            Week of {summary.week_start ? new Date(summary.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '-'} • {summary.plates} plates planned
          </p>
        </div>
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="px-4 py-2 border-2 border-slate-300 rounded-lg bg-white font-bold text-slate-900 text-lg"
        >
          <option value="">Next Week</option>
          {weeks.map((week) => (
            <option key={week} value={week}>
              Week of {new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900">{message}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              className={`rounded-lg p-3 flex items-start gap-3 border ${
                s.severity === 'warning' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${s.severity === 'warning' ? 'text-red-600' : 'text-amber-600'}`} />
              <p className={s.severity === 'warning' ? 'text-red-900' : 'text-amber-900'}>{s.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Last week comparison */}
      {comparison && comparison.total_tasks > 0 && (
        <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
          <p className="text-slate-700">
            <span className="font-bold">Last week (starting {new Date(comparison.prior_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}):</span>{' '}
            {comparison.completed_tasks} of {comparison.total_tasks} tasks completed
          </p>
          <p className="text-2xl font-bold text-slate-900">{comparison.completion_rate}%</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-slate-600 text-sm">Active Customers</p>
              <p className="text-2xl font-bold text-slate-900">{summary.active_customers}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-orange-600" />
            <div>
              <p className="text-slate-600 text-sm">
                {summary.meals_are_estimate ? 'Estimated Meals' : 'Real Meals Ordered'}
              </p>
              <p className="text-2xl font-bold text-slate-900">{summary.estimated_meals ?? 'TBD'}</p>
              {summary.meals_are_estimate && (
                <p className="text-xs text-orange-600">Orders not in yet for this week</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-slate-600 text-sm">Plates Planned</p>
              <p className="text-2xl font-bold text-slate-900">{summary.plates}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-purple-600" />
            <div>
              <p className="text-slate-600 text-sm">Procurement Cost</p>
              <p className="text-2xl font-bold text-slate-900">${procurement.total_cost.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-300 mb-6">
        {['timeline', 'procurement', 'labor'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-bold text-lg transition ${
              activeTab === tab ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {tab === 'timeline'
              ? '📅 7-Day Timeline'
              : tab === 'procurement'
              ? `🛒 Procurement ($${procurement.total_cost.toFixed(0)})`
              : `👷 Labor (${labor.reduce((sum, r) => sum + r.target_hours, 0)}h)`}
          </button>
        ))}
      </div>

      {/* Timeline Tab - calendar grid */}
      {activeTab === 'timeline' && (
        <>
          <div className="grid grid-cols-7 gap-3">
            {daysOfWeek.map((day) => {
              const dayItems = schedule[day] || []
              const meta = dayMeta[day]
              const colors = activityColors[meta.activity]
              const date = dateForDay(day)
              const visibleChips = dayItems.slice(0, 3)
              const extraCount = dayItems.length - visibleChips.length

              return (
                <button
                  key={day}
                  onClick={() => dayItems.length > 0 && setSelectedDay(day)}
                  className={`text-left rounded-lg border-2 ${colors.bg} ${colors.border} p-3 shadow-sm transition hover:shadow-md ${dayItems.length === 0 ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xl">{meta.icon}</span>
                    <span className={`text-xs font-bold ${colors.text}`}>{meta.activity.replace('_', '+')}</span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{day}</p>
                  <p className="text-xs text-slate-500 mb-2">
                    {date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''}
                  </p>

                  {dayItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nothing scheduled</p>
                  ) : (
                    <div className="space-y-1">
                      {visibleChips.map((item, idx) => (
                        <div key={idx} className={`text-xs rounded px-2 py-1 ${colors.chip} truncate`}>
                          {item.plate_name} {item.quantity != null ? `(${item.quantity})` : '(TBD)'}
                        </div>
                      ))}
                      {extraCount > 0 && (
                        <p className={`text-xs font-bold ${colors.text}`}>+{extraCount} more</p>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Full-screen day sheet for the selected day */}
          {selectedDay && (
            <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
              <div className={`sticky top-0 ${activityColors[dayMeta[selectedDay].activity].bg} border-b-2 ${activityColors[dayMeta[selectedDay].activity].border} p-6 flex items-center justify-between z-10`}>
                <div>
                  <h3 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <span className="text-4xl">{dayMeta[selectedDay].icon}</span>
                    {selectedDay}
                    <span className="text-lg font-normal text-slate-500">
                      {dateForDay(selectedDay)?.toLocaleDateString('en-US', { weekday: undefined, month: 'long', day: 'numeric', timeZone: 'UTC' })}
                    </span>
                  </h3>
                  <p className="text-slate-600 mt-1">{dayMeta[selectedDay].label}</p>
                </div>
                <button onClick={() => setSelectedDay(null)} className="rounded-lg border-2 border-slate-300 bg-white p-2 hover:bg-slate-50">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="max-w-5xl mx-auto p-8 space-y-6">
                {(schedule[selectedDay] || []).map((item, idx) => (
                  <PlateTaskCard
                    key={idx}
                    item={item}
                    day={selectedDay}
                    saving={savingTask === item.plate_id}
                    onSave={saveTaskStatus}
                    onReportIssue={() => {
                      setIssueFormFor(item.plate_id)
                      setIssueType('missing_ingredient')
                      setIssueReason('')
                      setIssueSolution('')
                    }}
                  />
                ))}

                {/* Issue report form */}
                {issueFormFor !== null && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-5">
                    <h4 className="font-bold text-red-900 mb-3">Report an Issue</h4>
                    <select
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value)}
                      className="w-full mb-3 px-3 py-2 border border-red-300 rounded-lg bg-white"
                    >
                      <option value="missing_ingredient">Missing ingredient</option>
                      <option value="equipment">Equipment issue</option>
                      <option value="schedule_change">Schedule change needed</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea
                      value={issueReason}
                      onChange={(e) => setIssueReason(e.target.value)}
                      placeholder="What's the problem?"
                      rows={2}
                      className="w-full mb-3 px-3 py-2 border border-red-300 rounded-lg"
                    />
                    <textarea
                      value={issueSolution}
                      onChange={(e) => setIssueSolution(e.target.value)}
                      placeholder="Proposed solution (optional)"
                      rows={2}
                      className="w-full mb-3 px-3 py-2 border border-red-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIssueFormFor(null)}
                        className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => submitIssue(selectedDay, issueFormFor)}
                        disabled={!issueReason.trim()}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold disabled:opacity-50"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}

                {/* Issues logged for this day */}
                {issues.filter((iss) => iss.day === selectedDay).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800">Issues for {selectedDay}</h4>
                    {issues
                      .filter((iss) => iss.day === selectedDay)
                      .map((iss) => (
                        <div
                          key={iss.id}
                          className={`rounded-lg p-4 border flex items-start justify-between gap-3 ${
                            iss.status === 'open' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-500">
                              {iss.issue_type.replace('_', ' ')} {iss.plate_name && `• ${iss.plate_name}`}
                            </p>
                            <p className="text-slate-800 mt-1">{iss.reason}</p>
                            {iss.proposed_solution && <p className="text-slate-600 text-sm mt-1">Proposed: {iss.proposed_solution}</p>}
                          </div>
                          {iss.status === 'open' ? (
                            <button
                              onClick={() => resolveIssue(iss.id)}
                              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold flex-shrink-0"
                            >
                              Resolve
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-green-700 flex-shrink-0">Resolved</span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Procurement Tab */}
      {activeTab === 'procurement' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Suppliers: {procurement.suppliers}</h3>
            <p className="text-slate-600 mb-6 text-lg font-bold">Total Cost: ${procurement.total_cost.toFixed(2)}</p>

            {Object.entries(procurement.orders).map(([supplier, details]) => (
              <div key={supplier} className="border-t border-slate-200 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
                <h4 className="font-bold text-slate-900 text-lg">{supplier}</h4>
                <p className="text-slate-600 mt-2">
                  {details.items.length} items • ${details.total_cost.toFixed(2)}
                </p>
                <div className="mt-3 space-y-2">
                  {details.items.map((item, idx) => (
                    <div key={idx} className="text-sm text-slate-600 flex justify-between">
                      <span>{item.ingredient}</span>
                      <span>
                        {item.quantity} {item.unit}
                        {item.total_cost != null && ` • $${item.total_cost.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labor Tab */}
      {activeTab === 'labor' && (
        <div className="grid grid-cols-2 gap-4">
          {labor.map((role, idx) => (
            <div key={idx} className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
              <h4 className="font-bold text-slate-900 text-lg">{role.role.replace('_', ' ')}</h4>
              <p className="text-slate-600 mt-2">{role.target_hours} hours @ ${role.hourly_rate}/hr</p>
              <p className="text-slate-900 font-bold mt-1">${role.budget_cost.toFixed(2)} budgeted</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function PlateTaskCard({
  item,
  day,
  saving,
  onSave,
  onReportIssue,
}: {
  item: PlateItem
  day: string
  saving: boolean
  onSave: (day: string, plateId: number, completed: boolean, actualQuantity: string, notes: string) => void
  onReportIssue: () => void
}) {
  const [completed, setCompleted] = useState(item.completed)
  const [actualQuantity, setActualQuantity] = useState(item.actual_quantity != null ? String(item.actual_quantity) : '')
  const [notes, setNotes] = useState(item.notes || '')

  const dirty = completed !== item.completed || actualQuantity !== (item.actual_quantity != null ? String(item.actual_quantity) : '') || notes !== (item.notes || '')

  return (
    <div className={`bg-white rounded-lg border-2 shadow-sm overflow-hidden ${item.critical ? 'border-red-300' : 'border-slate-200'}`}>
      <div className="bg-slate-50 p-5 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
            className="w-6 h-6 mt-1 flex-shrink-0"
          />
          <div>
            <p className={`font-bold text-xl ${completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.plate_name}</p>
            <p className="text-sm text-slate-600">{item.task} • {item.category}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">{item.station}</span>
              {item.critical && <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">CRITICAL</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900 text-2xl">{item.quantity != null ? item.quantity : 'TBD'}</p>
          <p className="text-xs text-slate-500">plates needed</p>
          {item.quantity_is_estimate && <p className="text-xs text-orange-600 font-bold">no orders yet</p>}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {item.recipes.map((recipe, rIdx) => (
          <div key={rIdx}>
            <p className="font-bold text-slate-800 mb-2">{recipe.recipe_name}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recipe.ingredients.map((ing, iIdx) => (
                <div key={iIdx} className="bg-slate-50 rounded p-2 text-sm">
                  <p className="font-medium text-slate-800 truncate">{ing.name}</p>
                  <p className="text-slate-500 text-xs">
                    {ing.pounds_needed} lbs
                    {ing.cost != null && ` • $${ing.cost.toFixed(2)}`}
                    {ing.store && ` • ${ing.store}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-bold text-slate-600">Actual quantity (if different)</label>
            <input
              type="number"
              value={actualQuantity}
              onChange={(e) => setActualQuantity(e.target.value)}
              placeholder={item.quantity != null ? String(item.quantity) : 'TBD'}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this task..."
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSave(day, item.plate_id, completed, actualQuantity, notes)}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm disabled:opacity-40"
          >
            {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
          </button>
          <button
            onClick={onReportIssue}
            className="px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 font-bold text-sm hover:bg-red-50"
          >
            🚩 Report Issue
          </button>
        </div>
      </div>
    </div>
  )
}
