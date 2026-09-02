import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, DollarSign, TrendingUp, ChefHat, ExternalLink, Link2, Link2Off } from 'lucide-react'
import { formatIngredientWeight } from '../utils/unitConversion'
import { CATEGORY_GROUP, GROUP_ORDER } from '../utils/categoryGroups'

type MenuItemRow = {
  menu_id: number
  name: string
  category: string | null
  day_of_week: string | null
  quantity: number
  recipe_linked: boolean
}

type PrepData = {
  week: string
  recipes: MenuItemRow[]
  ingredients: Array<{
    name: string
    category: string | null
    needed_g: number
    available_g: number
    unit_price_cents: number
    cost_cents: number
  }>
  summary: {
    total_cost_cents: number
    total_servings: number
    total_ingredients: number
    prep_days: string[]
    monday_meals: number
    thursday_meals: number
    breakfast_meals: number
  }
  orders: Array<{
    id: number
    name: string
    notes?: string
    total_meals_monday: number
    total_meals_thursday: number
    breakfast_meals: number
    total_meals: number
  }>
}

type MenuItemDetail = {
  recipe: { id: number; name: string; category: string | null; day: string | null }
  recipe_linked: boolean
  customers: Array<{ id: number; name: string; notes?: string; quantity: number }>
  ingredients: Array<{
    name: string
    category: string | null
    quantity_g: number
    unit_price_cents: number
    cost_cents: number
    available_g: number
  }>
  summary: { total_portions: number; total_recipe_cost_cents: number; cogs_per_portion_cents: number }
}

function formatWeekLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export default function WeeklyPrepPage({ week: initialWeek, onBack }: { week: string; onBack: () => void }) {
  const [currentWeek, setCurrentWeek] = useState(initialWeek)
  const [allWeeks, setAllWeeks] = useState<Array<{ week: string }>>([])
  const [prepData, setPrepData] = useState<PrepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItemDetail | null>(null)
  const [itemLoading, setItemLoading] = useState(false)
  const [openMenuGroup, setOpenMenuGroup] = useState<string | null>(null)
  const [kitchenProgress, setKitchenProgress] = useState<{ tasksDone: number; tasksTotal: number; checklistDone: number; checklistTotal: number } | null>(null)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchAllWeeks()
  }, [])

  useEffect(() => {
    fetchPrepData()
    fetchKitchenProgress()
  }, [currentWeek])

  // Real completion, not the old local-only "mark as ready" toggle (which
  // never persisted -- a refresh silently forgot every status). The actual
  // fulfillment tracking already happens in Operations Hub, on the Kitchen
  // batch/production tasks weekly_recipe_plan generates -- this just reads
  // that same real state instead of keeping a second, fake copy of it.
  const fetchKitchenProgress = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/tasks/week/${currentWeek}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const allTasks = Object.values(response.data.data.days as Record<string, any[]>).flat()
      const kitchenPlanTasks = allTasks.filter(
        (t) => t.department === 'Kitchen' && typeof t.source_type === 'string' && t.source_type.startsWith('weekly_recipe_plan')
      )
      setKitchenProgress({
        tasksDone: kitchenPlanTasks.filter((t) => t.status === 'completed').length,
        tasksTotal: kitchenPlanTasks.length,
        checklistDone: kitchenPlanTasks.reduce((sum, t) => sum + (parseInt(t.checklist_done, 10) || 0), 0),
        checklistTotal: kitchenPlanTasks.reduce((sum, t) => sum + (parseInt(t.checklist_total, 10) || 0), 0),
      })
    } catch (error) {
      console.error('Error fetching kitchen progress:', error)
    }
  }

  const fetchAllWeeks = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/prep/weeks/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAllWeeks(response.data.data)
    } catch (error) {
      console.error('Error fetching weeks:', error)
    }
  }

  const fetchPrepData = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const response = await axios.get(`${apiUrl}/api/admin/prep/${currentWeek}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPrepData(response.data.data)
    } catch (error: any) {
      console.error('Error fetching prep data:', error)
      setLoadError(error.response?.data?.error || 'Failed to load prep data')
    } finally {
      setLoading(false)
    }
  }

  const fetchItemDetails = async (menuId: number) => {
    try {
      setItemLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/prep/${currentWeek}/${menuId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedItem(response.data.data)
    } catch (error) {
      console.error('Error fetching menu item details:', error)
    } finally {
      setItemLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[#755B4C]">Loading prep data...</p>
      </div>
    )
  }

  if (!prepData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-[#D62F3D] font-bold">{loadError || 'Failed to load prep data'}</p>
        <button onClick={onBack} className="text-sm text-[#2E527F] underline">
          Back to Orders
        </button>
      </div>
    )
  }

  const noOrdersThisWeek = prepData.summary.total_servings === 0

  return (
    <main className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF6EE] text-[#2E527F] transition hover:border-[#3E6594] hover:bg-[#EDF2F7]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Weekly Prep: {formatWeekLabel(prepData.week)}</h1>
            <p className="mt-1 text-sm text-[#755B4C]">What's actually been ordered this week, and what it takes to fulfill it</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.assign('/menu-planner')}
            className="flex items-center gap-1.5 rounded-lg border border-[#B9A88F] bg-[#FBF6EE] px-3 py-2 text-sm font-bold text-[#2E527F] transition hover:border-[#3E6594] hover:bg-[#EDF2F7]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Menu Planner
          </button>
          {/* Week Navigation */}
          {allWeeks.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const idx = allWeeks.findIndex((w) => w.week === currentWeek)
                  if (idx < allWeeks.length - 1) setCurrentWeek(allWeeks[idx + 1].week)
                }}
                disabled={allWeeks.findIndex((w) => w.week === currentWeek) >= allWeeks.length - 1}
                className="rounded-lg border border-[#2E527F] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
              >
                ← Prev
              </button>
              <span className="text-sm font-bold text-[#755B4C]">
                {allWeeks.findIndex((w) => w.week === currentWeek) + 1} of {allWeeks.length}
              </span>
              <button
                onClick={() => {
                  const idx = allWeeks.findIndex((w) => w.week === currentWeek)
                  if (idx > 0) setCurrentWeek(allWeeks[idx - 1].week)
                }}
                disabled={allWeeks.findIndex((w) => w.week === currentWeek) <= 0}
                className="rounded-lg border border-[#2E527F] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {noOrdersThisWeek && (
        <div className="rounded-2xl border border-[#F0C5B8] bg-[#FFF4EE] p-4 text-sm text-[#9A6D34] font-medium">
          No orders placed for this week yet.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Total Meals</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{prepData.summary.total_servings}</p>
              <p className="mt-1 text-[11px] text-[#2E527F]">
                Mon {prepData.summary.monday_meals} · Thu {prepData.summary.thursday_meals} · Breakfast {prepData.summary.breakfast_meals}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>

        <button
          onClick={() => window.location.assign(`/operational-optimization?week=${currentWeek}`)}
          className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4 text-left transition hover:border-[#3E6594] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Kitchen Prep Progress</p>
              {kitchenProgress && kitchenProgress.tasksTotal > 0 ? (
                <>
                  <p className="text-3xl font-extrabold text-[#2E527F]">
                    {kitchenProgress.checklistDone}/{kitchenProgress.checklistTotal}
                  </p>
                  <p className="mt-1 text-[11px] text-[#2E527F] flex items-center gap-1">
                    {kitchenProgress.tasksDone}/{kitchenProgress.tasksTotal} tasks done · Ops Hub <ExternalLink className="h-2.5 w-2.5" />
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-[#9A7E6F]">No Kitchen tasks generated yet</p>
              )}
            </div>
            <ChefHat className="h-8 w-8 text-[#D97706]" />
          </div>
        </button>

        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Known COGS</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">
                ${(prepData.summary.total_cost_cents / 100).toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-[#D97706]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Cost Per Meal</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">
                {prepData.summary.total_servings > 0
                  ? `$${((prepData.summary.total_cost_cents / prepData.summary.total_servings) / 100).toFixed(2)}`
                  : '—'}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>
      </div>

      {/* Menu This Week -- grouped the same way Menu Planner's This Week
          section groups the recipe plan (Proteins/Carbs/Veggies/...), so a
          chef sees the two views the same way whichever page they opened
          Weekly Prep from. This is real ordered quantity, not forecasted
          lb, so the numbers won't always match Menu Planner exactly -- that
          gap (orders vs. forecast) is itself useful information. */}
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
        <h2 className="mb-4 text-lg font-extrabold text-[#4B2B1D]">Menu This Week</h2>
        {prepData.recipes.length === 0 ? (
          <p className="text-sm text-[#2E527F]">No menu items ordered this week.</p>
        ) : (
          <div className="space-y-5">
            {(['monday', 'thursday', 'other'] as const).map((dayKey) => {
              const dayColor = dayKey === 'monday' ? '#16A34A' : dayKey === 'thursday' ? '#D97706' : '#0EA5E9'
              const dayLabel = dayKey === 'monday' ? 'Monday' : dayKey === 'thursday' ? 'Thursday' : 'Breakfast / Other'
              const dayItems = prepData.recipes.filter((r) => {
                const d = r.day_of_week?.toLowerCase()
                return dayKey === 'other' ? d !== 'monday' && d !== 'thursday' : d === dayKey
              })
              if (dayItems.length === 0) return null

              const groups = GROUP_ORDER.map((group) => {
                const items = dayItems.filter((i) => (CATEGORY_GROUP[i.category || 'custom'] || 'Custom') === group)
                return { group, items, qty: items.reduce((sum, i) => sum + (i.quantity || 0), 0) }
              }).filter((g) => g.items.length > 0)

              return (
                <div key={dayKey}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dayColor }}></div>
                    <p className="text-sm font-bold" style={{ color: dayColor }}>{dayLabel}</p>
                    <span className="text-[10px] font-bold text-[#9A7E6F]">{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="space-y-1.5">
                    {groups.map(({ group, items, qty }) => {
                      const groupKey = `${dayKey}:${group}`
                      const isOpen = openMenuGroup === groupKey
                      return (
                        <div key={group} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                          <button
                            onClick={() => setOpenMenuGroup(isOpen ? null : groupKey)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                          >
                            <span className="text-xs font-bold text-[#4B2B1D]">{group}</span>
                            <span className="flex items-center gap-2 flex-shrink-0 text-[10px] font-bold text-[#9A7E6F]">
                              {items.length} recipe{items.length === 1 ? '' : 's'} · qty {qty}
                              <span className="text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                            </span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                              {items.map((item) => (
                                <button
                                  key={item.menu_id}
                                  onClick={() => fetchItemDetails(item.menu_id)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#FBF7F0]"
                                >
                                  <p className="flex-1 truncate text-xs font-medium text-[#4B2B1D]">{item.name}</p>
                                  <span title={item.recipe_linked ? 'Recipe linked' : 'No recipe linked'} className="flex-shrink-0">
                                    {item.recipe_linked ? (
                                      <Link2 className="h-3 w-3 text-[#16834A]" />
                                    ) : (
                                      <Link2Off className="h-3 w-3 text-[#9A7E6F]" />
                                    )}
                                  </span>
                                  <p className="w-14 flex-shrink-0 text-right text-xs font-bold text-[#2E527F]">×{item.quantity}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ingredients -- the full shortfall-vs-stock table now lives in Menu
          Planner's Shopping List (grouped by store, with real cost totals
          and editable store assignment), so this doesn't duplicate a
          second, plainer copy of the same table. Just the headline numbers
          plus a direct link to the real thing. */}
      {prepData.ingredients.length === 0 ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6 text-sm text-[#2E527F]">
          No recipe-linked menu items this week yet, so real ingredient needs can't be computed. Link a recipe to a
          menu item in Menu Planner to see it here.
        </div>
      ) : (
        <button
          onClick={() => window.location.assign('/menu-planner')}
          className="w-full rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4 flex items-center justify-between gap-3 text-left transition hover:border-[#3E6594] hover:shadow-md"
        >
          <div>
            <p className="text-sm font-bold text-[#4B2B1D]">
              {prepData.ingredients.filter((i) => i.available_g < i.needed_g).length} of {prepData.ingredients.length} ingredients short vs. stock
            </p>
            <p className="text-xs text-[#755B4C] mt-0.5">Full shopping list, grouped by store with real cost totals, is in Menu Planner</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-bold text-[#2E527F] flex-shrink-0">
            View Shopping List <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* Customer Orders -- who's actually getting what this week, the one
          thing here that isn't duplicated in Menu Planner or Operations
          Hub. The old per-row "Pending/Ready" toggle never persisted
          (reset on every refresh) and didn't correspond to anything real;
          actual fulfillment status is the Kitchen Prep Progress card above,
          reading real task/checklist completion instead. */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">Customer Orders</h2>
        <div className="overflow-x-auto rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Customer</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Monday</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Thursday</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Breakfast</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Total</th>
              </tr>
            </thead>
            <tbody>
              {prepData.orders.map((order) => (
                <tr key={order.id} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">{order.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block rounded bg-[#E8F5E9] px-2 py-1 font-bold text-[#16A34A]">
                      {order.total_meals_monday}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block rounded bg-[#FEF3E2] px-2 py-1 font-bold text-[#D97706]">
                      {order.total_meals_thursday}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block rounded bg-[#E0F2FE] px-2 py-1 font-bold text-[#0EA5E9]">
                      {order.breakfast_meals || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-extrabold text-[#2E527F]">{order.total_meals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menu Item Details Modal */}
      {(itemLoading || selectedItem) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {itemLoading || !selectedItem ? (
              <div className="p-10 text-center text-[#755B4C]">Loading...</div>
            ) : (
              <>
                <div className="sticky top-0 bg-[rgba(251,247,240,0.9)] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#4B2B1D]">{selectedItem.recipe.name}</h2>
                    {selectedItem.recipe.category && (
                      <p className="text-xs text-[#755B4C] mt-1">{selectedItem.recipe.category}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="text-[#755B4C] hover:text-[#4B2B1D]"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Summary */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg bg-[#EDF2F7] p-4">
                      <p className="text-xs text-[#2E527F] font-bold">Total Portions</p>
                      <p className="text-2xl font-extrabold text-[#2E527F]">{selectedItem.summary.total_portions}</p>
                    </div>
                    <div className="rounded-lg bg-[#E8F3FF] p-4">
                      <p className="text-xs text-[#755B4C] font-bold uppercase tracking-wide">Recipe Cost</p>
                      <p className="text-2xl font-extrabold text-[#2E527F]">
                        ${(selectedItem.summary.total_recipe_cost_cents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#E8F5E9] p-4">
                      <p className="text-xs text-[#16A34A] font-bold uppercase tracking-wide">Per Meal</p>
                      <p className="text-2xl font-extrabold text-[#16A34A]">
                        ${(selectedItem.summary.cogs_per_portion_cents / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Customers */}
                  {selectedItem.customers.length > 0 && (
                    <div>
                      <h3 className="font-bold text-[#4B2B1D] mb-3">Customers ({selectedItem.customers.length})</h3>
                      <div className="space-y-2">
                        {selectedItem.customers.map((customer) => (
                          <div key={customer.id} className="rounded-lg border border-[#E4D8C9] bg-white p-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-[#4B2B1D]">{customer.name}</p>
                              {customer.notes && <p className="text-xs text-[#755B4C] mt-1">{customer.notes}</p>}
                            </div>
                            <span className="text-sm font-bold text-[#2E527F]">×{customer.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ingredients & COGS */}
                  {selectedItem.recipe_linked ? (
                    selectedItem.ingredients.length > 0 && (
                      <div>
                        <h3 className="font-extrabold text-[#4B2B1D] mb-4">Ingredients & COGS</h3>
                        <div className="overflow-x-auto rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)]">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[#E4D8C9]">
                                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Ingredient</th>
                                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Category</th>
                                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Needed</th>
                                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Price/lb</th>
                                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedItem.ingredients.map((ing, idx) => (
                                <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">{ing.name}</td>
                                  <td className="px-4 py-3 text-right text-[#755B4C] text-xs">{ing.category || '—'}</td>
                                  <td className="px-4 py-3 text-right text-[#755B4C]">{formatIngredientWeight(ing.quantity_g, ing.category)}</td>
                                  <td className="px-4 py-3 text-right text-[#755B4C]">
                                    {ing.unit_price_cents > 0 ? `$${(ing.unit_price_cents / 100).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-[#2E527F]">
                                    {ing.cost_cents > 0 ? `$${(ing.cost_cents / 100).toFixed(2)}` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg border border-[#E4D8C9] bg-white p-4 text-sm text-[#2E527F] flex items-center gap-2">
                      <Link2Off className="h-4 w-4 shrink-0" />
                      No recipe linked to this menu item yet — link one in Menu Planner to see real ingredient needs and cost.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
