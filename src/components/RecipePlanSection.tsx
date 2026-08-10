import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { AlertCircle } from 'lucide-react'

type PlanRecipeRow = {
  recipe_id: number
  name: string
  category: string
  selected: boolean
  expected_volume: number // lb -- the standing unit for this plan, always
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  costPerPoundCents: number
}

type Block = 'monday' | 'thursday'

const BLOCK_CONFIG: Record<Block, { label: string; sub: string; color: string }> = {
  monday: { label: 'Block 1', sub: 'Mon – Wed', color: '#16A34A' },
  thursday: { label: 'Block 2', sub: 'Thu – Sun', color: '#D97706' },
}

const CATEGORY_LABELS: Record<string, string> = {
  beef: 'Beef',
  chicken: 'Chicken',
  turkey: 'Turkey',
  carbohydrates: 'Carb',
  vegetables: 'Veg',
  sauces: 'Sauces',
  beverage: 'Beverage',
  breakfast: 'Breakfast',
}

// Same recipe pool feeds delivery orders and walk-up counter sales -- this
// section is the single place the chef decides what's live for a block and
// roughly how much of it to expect, which drives what operations buys and
// preps in bulk. It's intentionally separate from the plate builder below:
// no combining recipes into named dishes here, just recipe + volume.
export default function RecipePlanSection() {
  const [rows, setRows] = useState<Record<Block, PlanRecipeRow[]>>({ monday: [], thursday: [] })
  const [weekStart, setWeekStart] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [savingBlock, setSavingBlock] = useState<Block | null>(null)
  const [dirty, setDirty] = useState<Record<Block, boolean>>({ monday: false, thursday: false })

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchPlan()
  }, [])

  const fetchPlan = async () => {
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      // Two calls: the plan endpoint knows what's selected/forecasted, the
      // recipes endpoint knows the per-lb (455g) macros/cost every other
      // recipe view in this app already uses -- merge them by recipe_id
      // rather than duplicating that calculation on the backend here too.
      const [planRes, recipesRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/recipe-plan`, { headers }),
        axios.get(`${apiUrl}/api/admin/recipes`, { headers }),
      ])

      const macrosById: Record<number, { calories: number; protein_g: number; carbs_g: number; fat_g: number; costPerPoundCents: number }> = {}
      for (const r of recipesRes.data.data || []) {
        macrosById[r.recipe_id] = {
          calories: r.per_pound?.calories ?? 0,
          protein_g: parseFloat(r.per_pound?.protein_g ?? '0'),
          carbs_g: parseFloat(r.per_pound?.carbs_g ?? '0'),
          fat_g: parseFloat(r.per_pound?.fat_g ?? '0'),
          costPerPoundCents: r.cost_per_pound_cents ?? 0,
        }
      }

      const withMacros = (list: any[]): PlanRecipeRow[] =>
        list.map((r) => ({ ...r, ...(macrosById[r.recipe_id] || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, costPerPoundCents: 0 }) }))

      setRows({
        monday: withMacros(planRes.data.data?.monday || []),
        thursday: withMacros(planRes.data.data?.thursday || []),
      })
      setWeekStart(planRes.data.data?.weekStart)
      setDirty({ monday: false, thursday: false })
    } catch (error) {
      console.error('Error fetching recipe plan:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleRecipe = (block: Block, recipeId: number) => {
    setRows((current) => ({
      ...current,
      [block]: current[block].map((r) =>
        r.recipe_id === recipeId ? { ...r, selected: !r.selected } : r
      ),
    }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  const updateVolume = (block: Block, recipeId: number, volume: number) => {
    setRows((current) => ({
      ...current,
      [block]: current[block].map((r) =>
        r.recipe_id === recipeId ? { ...r, expected_volume: volume } : r
      ),
    }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  const saveBlock = async (block: Block) => {
    setSavingBlock(block)
    try {
      const selections = rows[block]
        .filter((r) => r.selected)
        .map((r) => ({ recipe_id: r.recipe_id, expected_volume: r.expected_volume || 0 }))

      await axios.post(
        `${apiUrl}/api/admin/menu-planner/recipe-plan`,
        { block, selections },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDirty((d) => ({ ...d, [block]: false }))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save recipe plan')
    } finally {
      setSavingBlock(null)
    }
  }

  const groupByCategory = (list: PlanRecipeRow[]) => {
    const groups: Record<string, PlanRecipeRow[]> = {}
    for (const r of list) {
      if (!groups[r.category]) groups[r.category] = []
      groups[r.category].push(r)
    }
    return groups
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
        <p className="text-[#755B4C]">Loading recipe plan...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-extrabold text-[#4B2B1D]">Weekly Recipe Plan</h2>
        <p className="mt-1 text-sm text-[#755B4C]">
          What's live for {weekStart ? new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} --
          feeds both delivery orders and counter sales. Forecasts are in lb; macros/cost are per lb (455g).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {(['monday', 'thursday'] as Block[]).map((block) => {
          const cfg = BLOCK_CONFIG[block]
          const grouped = groupByCategory(rows[block])
          const selectedCount = rows[block].filter((r) => r.selected).length
          const totalLb = rows[block].filter((r) => r.selected).reduce((sum, r) => sum + (r.expected_volume || 0), 0)

          return (
            <div key={block} className="rounded-xl border border-[#E4D8C9] bg-[#FBF7F0] p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.color }}></div>
                  <h3 className="text-sm font-extrabold" style={{ color: cfg.color }}>{cfg.label}</h3>
                  <span className="text-xs text-[#9A8774]">{cfg.sub}</span>
                </div>
                <button
                  onClick={() => saveBlock(block)}
                  disabled={!dirty[block] || savingBlock === block}
                  className="rounded-lg text-white px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
                  style={{ backgroundColor: cfg.color }}
                >
                  {savingBlock === block ? 'Saving...' : dirty[block] ? 'Save Block' : 'Saved'}
                </button>
              </div>

              <p className="text-xs text-[#9A8774] mb-3">
                {selectedCount} recipe{selectedCount === 1 ? '' : 's'} live · {totalLb} lb forecasted
              </p>

              <div className="max-h-[420px] overflow-y-auto rounded-lg bg-white p-2 space-y-3">
                {Object.keys(grouped).length === 0 ? (
                  <p className="text-xs text-[#755B4C]">No recipes found</p>
                ) : (
                  Object.entries(grouped).map(([category, list]) => (
                    <div key={category}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#B9A88F] mb-1 px-1">
                        {CATEGORY_LABELS[category] || category}
                      </p>
                      {list.map((r) => (
                        <div key={r.recipe_id} className="flex items-center gap-2 px-1 py-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={() => toggleRecipe(block, r.recipe_id)}
                            className="h-3.5 w-3.5 rounded border-[#B9A88F] flex-shrink-0"
                          />
                          <p className="font-medium text-[#4B2B1D] truncate w-40 flex-shrink-0">{r.name}</p>
                          <p className="text-xs text-[#9A8774] flex-1 truncate">
                            {r.calories} cal · {r.protein_g.toFixed(0)}g P · {r.carbs_g.toFixed(0)}g C · {r.fat_g.toFixed(0)}g F · ${(r.costPerPoundCents / 100).toFixed(2)}/lb
                          </p>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={r.selected ? r.expected_volume : ''}
                            disabled={!r.selected}
                            onChange={(e) => updateVolume(block, r.recipe_id, parseInt(e.target.value) || 0)}
                            placeholder="lb"
                            className="w-14 h-7 rounded border border-[#B9A88F] bg-white px-1 text-xs text-center outline-none disabled:bg-[#F5F0E8] disabled:text-[#B9A88F] flex-shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {dirty[block] && (
                <p className="mt-2 flex items-center gap-1 text-xs text-[#D97706]">
                  <AlertCircle className="h-3.5 w-3.5" /> Unsaved changes
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
