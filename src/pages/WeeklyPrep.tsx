import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, AlertCircle, Package, DollarSign, TrendingUp, CheckCircle2 } from 'lucide-react'

type PrepData = {
  week: string
  recipes: Array<{
    recipe_id: number
    recipe_name: string
    day_of_week: string
    large_count: number
    regular_count: number
  }>
  ingredients: Array<{
    name: string
    category: string
    required_g: number
    available_g: number
    unit_price_cents: number
    cost_cents: number
  }>
  summary: {
    total_cost_cents: number
    total_servings: number
    total_ingredients: number
    prep_days: string[]
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

type RecipeDetail = {
  recipe: { id: number; name: string; day: string }
  regular_customers: Array<{ id: number; name: string; notes?: string; total_meals_monday: number; total_meals_thursday: number; breakfast_meals: number }>
  large_customers: Array<{ id: number; name: string; notes?: string; total_meals_monday: number; total_meals_thursday: number; breakfast_meals: number }>
  ingredients: Array<{
    name: string
    category: string
    quantity_g: number
    unit_price_cents: number
    cost_cents: number
    available_g: number
  }>
  summary: { total_regular: number; total_large: number; total_portions: number; total_recipe_cost_cents: number; cogs_per_portion_cents: number }
}

export default function WeeklyPrepPage({ week: initialWeek, onBack }: { week: string; onBack: () => void }) {
  const [currentWeek, setCurrentWeek] = useState(initialWeek)
  const [allWeeks, setAllWeeks] = useState<Array<{ id: number; week: string }>>([])
  const [weeksLoading, setWeeksLoading] = useState(true)
  const [prepData, setPrepData] = useState<PrepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fulfillment, setFulfillment] = useState<Record<number, boolean>>({})
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeDetail | null>(null)
  const [recipeLoading, setRecipeLoading] = useState(false)

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
      setWeeksLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/prep/weeks/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAllWeeks(response.data.data)
    } catch (error) {
      console.error('Error fetching weeks:', error)
    } finally {
      setWeeksLoading(false)
    }
  }

  const fetchPrepData = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/prep/${currentWeek}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPrepData(response.data.data)
    } catch (error) {
      console.error('Error fetching prep data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecipeDetails = async (recipeId: number) => {
    try {
      setRecipeLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/prep/${currentWeek}/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedRecipe(response.data.data)
    } catch (error) {
      console.error('Error fetching recipe details:', error)
    } finally {
      setRecipeLoading(false)
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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[#D62F3D]">Failed to load prep data</p>
      </div>
    )
  }

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
            <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Weekly Prep: {prepData?.week}</h1>
            <p className="mt-1 text-sm text-[#755B4C]">Complete meal prep planning and fulfillment tracking</p>
          </div>
        </div>

        {/* Week Navigation */}
        {allWeeks.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const idx = allWeeks.findIndex(w => w.week === currentWeek);
                if (idx < allWeeks.length - 1) setCurrentWeek(allWeeks[idx + 1].week);
              }}
              disabled={allWeeks.findIndex(w => w.week === currentWeek) >= allWeeks.length - 1}
              className="rounded-lg border border-[#CDBDA8] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="text-sm font-bold text-[#755B4C]">{allWeeks.findIndex(w => w.week === currentWeek) + 1} of {allWeeks.length}</span>
            <button
              onClick={() => {
                const idx = allWeeks.findIndex(w => w.week === currentWeek);
                if (idx > 0) setCurrentWeek(allWeeks[idx - 1].week);
              }}
              disabled={allWeeks.findIndex(w => w.week === currentWeek) <= 0}
              className="rounded-lg border border-[#CDBDA8] bg-white px-3 py-2 text-[#4B2B1D] font-medium hover:bg-[#F8F2E8] disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Total Servings</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{prepData.summary.total_servings}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Ingredients</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{prepData.summary.total_ingredients}</p>
            </div>
            <Package className="h-8 w-8 text-[#0EA5E9]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">COGS</p>
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
              <p className="text-xs text-[#755B4C]">Cost Per Serving</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">
                ${((prepData.summary.total_cost_cents / prepData.summary.total_servings) / 100).toFixed(2)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>
      </div>

      {/* Recipes Overview */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
        <h2 className="mb-4 text-lg font-extrabold text-[#4B2B1D]">Menu This Week</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prepData.recipes.map((recipe, idx) => {
            const dayColor = recipe.day_of_week === 'Monday'
              ? 'bg-[#16A34A]'
              : recipe.day_of_week === 'Thursday'
              ? 'bg-[#D97706]'
              : 'bg-[#0EA5E9]'

            return (
              <button
                key={idx}
                onClick={() => fetchRecipeDetails(recipe.recipe_id)}
                className="rounded-lg border border-[#E4D8C9] bg-white p-3 text-left transition hover:shadow-lg hover:border-[#3E6594]"
              >
                <p className="font-semibold text-[#2E527F] text-sm">{recipe.recipe_name}</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${dayColor}`}>
                      {recipe.day_of_week}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded bg-[#F3F4F6] px-2 py-1 font-bold text-[#4B2B1D]">
                      Regular: {recipe.regular_count}
                    </span>
                    <span className="rounded bg-[#FEF3E2] px-2 py-1 font-bold text-[#D97706]">
                      Large: {recipe.large_count}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Ingredient Inventory */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">Current Inventory</h2>

        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Ingredient</th>
                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Category</th>
                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Stock (g)</th>
                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Status</th>
                <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Inventory Cost</th>
              </tr>
            </thead>
            <tbody>
              {prepData.ingredients.map((ing, idx) => {
                const available = ing.available_g || 0;
                const costDollars = (ing.cost_cents || 0) / 100;

                return (
                  <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                    <td className="px-4 py-3 font-medium text-[#4B2B1D]">{ing.name}</td>
                    <td className="px-4 py-3 text-right text-[#755B4C]">{ing.category}</td>
                    <td className="px-4 py-3 text-right text-[#755B4C]">{available.toFixed(0)}g</td>
                    <td className="px-4 py-3 text-right">
                      {available > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF5EC] px-3 py-1 text-xs font-bold text-[#16834A]">
                          <CheckCircle2 className="h-4 w-4" />
                          In Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEBEC] px-3 py-1 text-xs font-bold text-[#D62F3D]">
                          <AlertCircle className="h-4 w-4" />
                          Out of Stock
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#2E527F]">
                      ${(ing.cost_cents / 100).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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

      {/* Recipe Details Modal */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">{selectedRecipe.recipe.name}</h2>
              <button
                onClick={() => setSelectedRecipe(null)}
                className="text-[#755B4C] hover:text-[#4B2B1D]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-[#E8F5E9] p-4">
                  <p className="text-xs text-[#16A34A] font-bold">Regular Portions</p>
                  <p className="text-2xl font-extrabold text-[#16A34A]">{selectedRecipe.summary.total_regular}</p>
                </div>
                <div className="rounded-lg bg-[#FEF3E2] p-4">
                  <p className="text-xs text-[#D97706] font-bold">Large Portions</p>
                  <p className="text-2xl font-extrabold text-[#D97706]">{selectedRecipe.summary.total_large}</p>
                </div>
                <div className="rounded-lg bg-[#EDF2F7] p-4">
                  <p className="text-xs text-[#2E527F] font-bold">Total Portions</p>
                  <p className="text-2xl font-extrabold text-[#2E527F]">{selectedRecipe.summary.total_portions}</p>
                </div>
              </div>

              {/* Regular Customers */}
              {selectedRecipe.regular_customers.length > 0 && (
                <div>
                  <h3 className="font-bold text-[#4B2B1D] mb-3">Regular Portions ({selectedRecipe.regular_customers.length})</h3>
                  <div className="space-y-2">
                    {selectedRecipe.regular_customers.map((customer) => (
                      <div key={customer.id} className="rounded-lg border border-[#E4D8C9] bg-white p-3">
                        <p className="font-medium text-[#4B2B1D]">{customer.name}</p>
                        {customer.notes && <p className="text-xs text-[#755B4C] mt-1">{customer.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Large Customers */}
              {selectedRecipe.large_customers.length > 0 && (
                <div>
                  <h3 className="font-bold text-[#4B2B1D] mb-3">Large Portions ({selectedRecipe.large_customers.length})</h3>
                  <div className="space-y-2">
                    {selectedRecipe.large_customers.map((customer) => (
                      <div key={customer.id} className="rounded-lg border border-[#FEF3E2] bg-white p-3">
                        <p className="font-medium text-[#4B2B1D]">{customer.name}</p>
                        {customer.notes && <p className="text-xs text-[#755B4C] mt-1">{customer.notes}</p>}
                        <p className="text-xs text-[#D97706] font-bold mt-1">LARGE PORTION</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ingredients & COGS */}
              {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4 gap-4">
                    <h3 className="font-extrabold text-[#4B2B1D]">Ingredients & COGS</h3>
                    <div className="flex gap-3">
                      <div className="rounded-lg bg-[#E8F3FF] px-4 py-2">
                        <p className="text-xs text-[#755B4C] font-bold uppercase tracking-wide">Recipe Total</p>
                        <p className="text-2xl font-extrabold text-[#2E527F]">
                          ${(selectedRecipe.summary.total_recipe_cost_cents / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#E8F5E9] px-4 py-2">
                        <p className="text-xs text-[#16A34A] font-bold uppercase tracking-wide">Per Meal</p>
                        <p className="text-2xl font-extrabold text-[#16A34A]">
                          ${(selectedRecipe.summary.cogs_per_portion_cents / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#E4D8C9]">
                          <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Ingredient</th>
                          <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Category</th>
                          <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Stock (g)</th>
                          <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Price/lb</th>
                          <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecipe.ingredients.map((ing, idx) => (
                          <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                            <td className="px-4 py-3 font-medium text-[#4B2B1D]">{ing.name}</td>
                            <td className="px-4 py-3 text-right text-[#755B4C] text-xs">{ing.category}</td>
                            <td className="px-4 py-3 text-right text-[#755B4C]">{ing.available_g.toFixed(0)}g</td>
                            <td className="px-4 py-3 text-right text-[#755B4C]">${(ing.unit_price_cents / 100).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-[#2E527F]">${(ing.cost_cents / 100).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
