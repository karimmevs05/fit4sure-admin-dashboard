import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import RecipePlanSection from '../components/RecipePlanSection'
import { PlateCostSimulator } from '../components/PlateCostSimulator'
import { formatIngredientWeight } from '../utils/unitConversion'

const GRAMS_PER_POUND = 455

type LastWeekMenu = { monday: string[]; thursday: string[] }

type PrepIngredient = {
  name: string
  category: string
  neededG: number
  shortfallG: number
  unitPriceCents: number
  currentStockG: number
  store: string | null
}

type BlockFinancials = { costCents: number; lb: number; recipeCount: number }

type PrepAndFinancials = {
  ingredients: PrepIngredient[]
  financials: { monday: BlockFinancials; thursday: BlockFinancials; combined: BlockFinancials }
}

export default function MenuPlannerPage() {
  const [weekStart, setWeekStart] = useState<{ sunday?: string; monday?: string; thursday?: string }>({})
  const [lastWeekMenu, setLastWeekMenu] = useState<LastWeekMenu>({ monday: [], thursday: [] })
  const [prepFinancials, setPrepFinancials] = useState<PrepAndFinancials>({
    ingredients: [],
    financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
  })
  const [loading, setLoading] = useState(true)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const [lastWeekRes, nextWeekRes, prepFinancialsRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/previous-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/next-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/prep-and-financials`, { headers }),
      ])

      setLastWeekMenu(lastWeekRes.data.data || { monday: [], thursday: [] })
      setWeekStart(nextWeekRes.data.data || {})
      setPrepFinancials(
        prepFinancialsRes.data.data || {
          ingredients: [],
          financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
        }
      )
    } catch (error) {
      console.error('Error fetching menu planner data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Called after the Weekly Recipe Plan saves a block -- prep/financials are
  // derived from that plan, so they'd otherwise go stale until a full page
  // reload. Refetches just this one endpoint rather than everything.
  const fetchPrepFinancials = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/prep-and-financials`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPrepFinancials(
        res.data.data || {
          ingredients: [],
          financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
        }
      )
    } catch (error) {
      console.error('Error fetching prep and financials:', error)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="text-[#755B4C]">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Menu Planner</h1>
          <p className="mt-1 text-sm text-[#755B4C]">
            Building here creates the real menu for {weekStart.monday ? new Date(weekStart.monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} delivery
          </p>
        </div>
      </div>

      <PlateCostSimulator />

      <RecipePlanSection onSaved={fetchPrepFinancials} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Last Week's Menu (real data) */}
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
          <h2 className="mb-4 text-lg font-extrabold text-[#4B2B1D]">Last Week's Menu</h2>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-4 w-4 rounded-full bg-[#16A34A]"></div>
              <p className="text-sm font-bold text-[#16A34A]">Monday</p>
            </div>
            <div className="space-y-2">
              {lastWeekMenu.monday.length === 0 ? (
                <p className="text-xs text-[#755B4C] italic">No data</p>
              ) : (
                lastWeekMenu.monday.map((meal, idx) => (
                  <div key={idx} className="rounded-lg border border-[#E4D8C9] bg-white p-2">
                    <p className="text-xs font-medium text-[#4B2B1D]">{meal}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-4 w-4 rounded-full bg-[#D97706]"></div>
              <p className="text-sm font-bold text-[#D97706]">Thursday</p>
            </div>
            <div className="space-y-2">
              {lastWeekMenu.thursday.length === 0 ? (
                <p className="text-xs text-[#755B4C] italic">No data</p>
              ) : (
                lastWeekMenu.thursday.map((meal, idx) => (
                  <div key={idx} className="rounded-lg border border-[#E4D8C9] bg-white p-2">
                    <p className="text-xs font-medium text-[#4B2B1D]">{meal}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <ShoppingListColumn ingredients={prepFinancials.ingredients} />

        <FinancialsColumn financials={prepFinancials.financials} />
      </div>
    </main>
  )
}

// What actually needs to be bought this week -- only ingredients short of
// what's on hand (needed minus current inventory stock), grouped by
// whichever store the receipt-sync pipeline last recorded that ingredient
// being bought at (inventory.store), so a run to Costco vs. Sam's Club can
// be planned as two separate lists instead of one flat ingredient dump.
function ShoppingListColumn({ ingredients }: { ingredients: PrepIngredient[] }) {
  const [openStore, setOpenStore] = useState<string | null>(null)
  const formatLb = (g: number) => (g / GRAMS_PER_POUND).toFixed(1)
  const formatNeeded = (ing: PrepIngredient, g: number) =>
    ing.category?.toLowerCase() === 'protein' ? formatIngredientWeight(g, ing.category) : `${formatLb(g)} lb`

  const byStore = useMemo(() => {
    const toBuy = ingredients.filter((ing) => ing.shortfallG > 0)
    const map = new Map<string, PrepIngredient[]>()
    for (const ing of toBuy) {
      const key = ing.store || 'Store not on file'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ing)
    }
    return Array.from(map.entries())
      .map(([store, items]) => ({ store, items: items.sort((a, b) => b.shortfallG - a.shortfallG) }))
      .sort((a, b) => b.items.length - a.items.length)
  }, [ingredients])

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <h2 className="mb-1 text-lg font-extrabold text-[#4B2B1D]">Shopping List</h2>
      <p className="mb-4 text-xs text-[#755B4C]">What's short vs. current stock, grouped by where you last bought it</p>

      {byStore.length === 0 ? (
        <p className="text-xs text-[#755B4C] italic">Nothing to buy — current stock covers this week's plan</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto space-y-2">
          {byStore.map(({ store, items }) => {
            const isOpen = openStore === store
            return (
              <div key={store} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                <button
                  onClick={() => setOpenStore(isOpen ? null : store)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-bold text-[#4B2B1D]">{store}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="rounded-full bg-[#F1EAE0] px-2 py-0.5 text-[10px] font-bold text-[#755B4C]">
                      {items.length} item{items.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                    {items.map((ing) => (
                      <div key={ing.name} className="flex items-center gap-2 px-3 py-2">
                        <p className="flex-1 truncate text-xs font-medium text-[#4B2B1D]">{ing.name}</p>
                        <p className="text-xs font-bold text-[#D62F3D] flex-shrink-0">{formatNeeded(ing, ing.shortfallG)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Cost rollup for the same recipe plan, split by block so the chef can see
// what Mon-Wed vs Thu-Sun is actually going to cost before it's committed.
function FinancialsColumn({ financials }: { financials: PrepAndFinancials['financials'] }) {
  const rows: { label: string; color: string; data: BlockFinancials }[] = [
    { label: 'Block 1 (Mon–Wed)', color: '#16A34A', data: financials.monday },
    { label: 'Block 2 (Thu–Sun)', color: '#D97706', data: financials.thursday },
  ]

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <h2 className="mb-1 text-lg font-extrabold text-[#4B2B1D]">Financials</h2>
      <p className="mb-4 text-xs text-[#755B4C]">Forecasted ingredient cost, from this week's recipe plan</p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-[#E4D8C9] bg-white px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }}></div>
              <p className="text-xs font-bold text-[#4B2B1D]">{row.label}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xl font-extrabold" style={{ color: row.color }}>${(row.data.costCents / 100).toFixed(2)}</p>
              <p className="text-xs text-[#2E527F]">{row.data.recipeCount} recipe{row.data.recipeCount === 1 ? '' : 's'} · {row.data.lb} lb</p>
            </div>
          </div>
        ))}

        <div className="rounded-lg bg-[#4B2B1D] px-3 py-2.5">
          <p className="text-xs font-bold text-[#E9DFD0] mb-1">Combined</p>
          <div className="flex items-center justify-between">
            <p className="text-xl font-extrabold text-white">${(financials.combined.costCents / 100).toFixed(2)}</p>
            <p className="text-xs text-[#2E527F]">{financials.combined.recipeCount} recipes · {financials.combined.lb} lb</p>
          </div>
        </div>
      </div>
    </div>
  )
}
