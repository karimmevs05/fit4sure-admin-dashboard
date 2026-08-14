import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, AlertCircle, Package, DollarSign, TrendingUp, CheckCircle2, Link2, Link2Off } from 'lucide-react'

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
  const [fulfillment, setFulfillment] = useState<Record<number, boolean>>({})
  const [selectedItem, setSelectedItem] = useState<MenuItemDetail | null>(null)
  const [itemLoading, setItemLoading] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchAllWeeks()
  }, [])

  useEffect(() => {
    fetchPrepData()
  }, [currentWeek])

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
            <p className="mt-1 text-sm text-[#755B4C]">Complete meal prep planning and fulfillment tracking</p>
          </div>
        </div>

        {/* Week Navigation */}
        {allWeeks.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const idx = allWeeks.findIndex((w) => w.week === currentWeek)
                if (idx < allWeeks.length - 1) setCurrentWeek(allWeeks[idx + 1].week)
              }}
              disabled={allWeeks.findIndex((w) => w.week === currentWeek) >= allWeeks.length - 1}
              className="rounded-lg border border-[#CDBDA8] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
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
              className="rounded-lg border border-[#CDBDA8] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {noOrdersThisWeek && (
        <div className="rounded-2xl border border-[#F0C5B8] bg-[#FFF4EE] p-4 text-sm text-[#9A6D34] font-medium">
          No orders placed for this week yet.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Total Meals</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{prepData.summary.total_servings}</p>
              <p className="mt-1 text-[11px] text-[#9A8774]">
                Mon {prepData.summary.monday_meals} · Thu {prepData.summary.thursday_meals} · Breakfast {prepData.summary.breakfast_meals}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Ingredients Needed</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{prepData.summary.total_ingredients}</p>
              <p className="mt-1 text-[11px] text-[#9A8774]">from recipe-linked items only</p>
            </div>
            <Package className="h-8 w-8 text-[#0EA5E9]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
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

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
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

      {/* Menu Items Overview */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
        <h2 className="mb-4 text-lg font-extrabold text-[#4B2B1D]">Menu This Week</h2>
        {prepData.recipes.length === 0 ? (
          <p className="text-sm text-[#9A7E6F]">No menu items ordered this week.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prepData.recipes.map((item) => {
              const dayColor =
                item.day_of_week?.toLowerCase() === 'monday'
                  ? 'bg-[#16A34A]'
                  : item.day_of_week?.toLowerCase() === 'thursday'
                  ? 'bg-[#D97706]'
                  : 'bg-[#0EA5E9]'

              return (
                <button
                  key={item.menu_id}
                  onClick={() => fetchItemDetails(item.menu_id)}
                  className="rounded-lg border border-[#E4D8C9] bg-white p-3 text-left transition hover:shadow-lg hover:border-[#3E6594]"
                >
                  <p className="font-semibold text-[#2E527F] text-sm">{item.name}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.day_of_week && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${dayColor}`}>
                        {item.day_of_week.charAt(0).toUpperCase() + item.day_of_week.slice(1)}
                      </span>
                    )}
                    {item.category && (
                      <span className="rounded bg-[#F3F4F6] px-2 py-1 text-xs font-bold text-[#4B2B1D]">
                        {item.category}
                      </span>
                    )}
                    <span className="rounded bg-[#EDF2F7] px-2 py-1 text-xs font-bold text-[#2E527F]">
                      Qty: {item.quantity}
                    </span>
                  </div>
                  <div className="mt-2">
                    {item.recipe_linked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16834A]">
                        <Link2 className="h-3 w-3" /> Recipe linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9A8774]">
                        <Link2Off className="h-3 w-3" /> No recipe linked
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Ingredients Needed */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">Ingredients Needed This Week</h2>

        {prepData.ingredients.length === 0 ? (
          <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6 text-sm text-[#9A7E6F]">
            No recipe-linked menu items this week yet, so real ingredient needs can't be computed. Link a recipe to a
            menu item in Menu Planner to see it here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E4D8C9]">
                  <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Ingredient</th>
                  <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Category</th>
                  <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Needed</th>
                  <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">In Stock</th>
                  <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Status</th>
                  <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Cost</th>
                </tr>
              </thead>
              <tbody>
                {prepData.ingredients.map((ing, idx) => {
                  const enough = ing.available_g >= ing.needed_g
                  return (
                    <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                      <td className="px-4 py-3 font-medium text-[#4B2B1D]">{ing.name}</td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">{ing.category || '—'}</td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">{ing.needed_g.toFixed(0)}g</td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">{ing.available_g.toFixed(0)}g</td>
                      <td className="px-4 py-3 text-right">
                        {enough ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF5EC] px-3 py-1 text-xs font-bold text-[#16834A]">
                            <CheckCircle2 className="h-4 w-4" />
                            Enough
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEBEC] px-3 py-1 text-xs font-bold text-[#D62F3D]">
                            <AlertCircle className="h-4 w-4" />
                            Short {(ing.needed_g - ing.available_g).toFixed(0)}g
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#2E527F]">
                        {ing.cost_cents > 0 ? `$${(ing.cost_cents / 100).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Orders & Fulfillment */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">Customer Orders & Fulfillment</h2>
        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Customer</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Monday</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Thursday</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Breakfast</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Total</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Status</th>
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
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setFulfillment({ ...fulfillment, [order.id]: !fulfillment[order.id] })}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                        fulfillment[order.id]
                          ? 'bg-[#EAF5EC] text-[#16834A]'
                          : 'border border-[#D8CDBE] bg-[#FBF7F0] text-[#755B4C] hover:border-[#3E6594]'
                      }`}
                    >
                      {fulfillment[order.id] ? '✓ Ready' : 'Pending'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menu Item Details Modal */}
      {(itemLoading || selectedItem) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {itemLoading || !selectedItem ? (
              <div className="p-10 text-center text-[#755B4C]">Loading...</div>
            ) : (
              <>
                <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
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
                        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
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
                                  <td className="px-4 py-3 text-right text-[#755B4C]">{ing.quantity_g.toFixed(0)}g</td>
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
                    <div className="rounded-lg border border-[#E4D8C9] bg-white p-4 text-sm text-[#9A7E6F] flex items-center gap-2">
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
