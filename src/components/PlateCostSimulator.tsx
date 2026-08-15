import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Calculator, ChevronDown, ChevronUp, X } from 'lucide-react'

type RecipeOption = { recipe_id: number; name: string; category: string; servings: number }

type SimResult = {
  cost_cents: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

type PlateRecipe = { recipe_id: number; name: string; servings: number }

// Compact, collapsed-by-default tool for testing "what would this plate
// cost" before committing to a real plan -- add any real recipes, set a
// serving amount for each (the same fractional-servings model
// menu_plan_recipes already uses for a real plate), see the real combined
// cost live. Reuses the existing /recipes/:id/yield-corrected endpoint
// (real recipe_ingredients x real inventory/receipt pricing) rather than
// estimating anything client-side.
export function PlateCostSimulator() {
  const [expanded, setExpanded] = useState(false)
  const [allRecipes, setAllRecipes] = useState<RecipeOption[]>([])
  const [plate, setPlate] = useState<PlateRecipe[]>([])
  const [results, setResults] = useState<Record<number, SimResult>>({})
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    axios
      .get(`${apiUrl}/api/admin/recipes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows = res.data.data || res.data || []
        setAllRecipes(rows.map((r: any) => ({ recipe_id: r.recipe_id, name: r.name, category: r.category, servings: r.servings || 1 })))
      })
      .catch(() => {})
  }, [])

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return allRecipes.filter((r) => r.name.toLowerCase().includes(q) && !plate.some((p) => p.recipe_id === r.recipe_id)).slice(0, 8)
  }, [query, allRecipes, plate])

  const fetchCost = async (recipeId: number, servings: number) => {
    setLoadingIds((prev) => new Set(prev).add(recipeId))
    try {
      const res = await axios.get(`${apiUrl}/api/admin/recipes/${recipeId}/yield-corrected`, {
        params: { servings },
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = res.data.data
      setResults((prev) => ({
        ...prev,
        [recipeId]: { cost_cents: d.cost_cents, calories: d.calories, protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g },
      }))
    } catch {
      // leave this row's result absent -- shown as "—", not a guessed cost
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(recipeId)
        return next
      })
    }
  }

  const addRecipe = (r: RecipeOption) => {
    const servings = 1
    setPlate((prev) => [...prev, { recipe_id: r.recipe_id, name: r.name, servings }])
    setQuery('')
    setShowDropdown(false)
    fetchCost(r.recipe_id, servings)
  }

  const updateServings = (recipeId: number, servings: number) => {
    setPlate((prev) => prev.map((p) => (p.recipe_id === recipeId ? { ...p, servings } : p)))
    fetchCost(recipeId, servings)
  }

  const removeRecipe = (recipeId: number) => {
    setPlate((prev) => prev.filter((p) => p.recipe_id !== recipeId))
    setResults((prev) => {
      const next = { ...prev }
      delete next[recipeId]
      return next
    })
  }

  const totals = plate.reduce(
    (acc, p) => {
      const r = results[p.recipe_id]
      if (!r) return acc
      return {
        cost_cents: acc.cost_cents + r.cost_cents,
        calories: acc.calories + r.calories,
        protein_g: acc.protein_g + r.protein_g,
        carbs_g: acc.carbs_g + r.carbs_g,
        fat_g: acc.fat_g + r.fat_g,
      }
    },
    { cost_cents: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
  const allPriced = plate.length > 0 && plate.every((p) => results[p.recipe_id])

  return (
    <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-[#2E527F]" />
          <span className="text-sm font-extrabold text-[#4B2B1D]">Plate Cost Simulator</span>
          <span className="hidden sm:inline text-xs text-[#9A8774]">test a combo before committing to a plate</span>
        </div>
        <div className="flex items-center gap-3">
          {plate.length > 0 && (
            <span className="text-sm font-bold text-[#2E527F]">
              {plate.length} recipe{plate.length === 1 ? '' : 's'} · {allPriced ? `$${(totals.cost_cents / 100).toFixed(2)}` : '…'}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-[#755B4C]" /> : <ChevronDown className="h-4 w-4 text-[#755B4C]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-[#E4D8C9] pt-4">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Search a recipe to add..."
              className="h-9 w-full max-w-sm rounded-lg border border-[#B9A88F] bg-white px-3 text-sm outline-none focus:border-[#3E6594]"
            />
            {showDropdown && matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-sm rounded-lg border border-[#B9A88F] bg-white shadow-lg max-h-48 overflow-y-auto">
                {matches.map((r) => (
                  <button
                    key={r.recipe_id}
                    onMouseDown={() => addRecipe(r)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#F8F2E8] border-b border-[#F0E9DC] last:border-0"
                  >
                    <span className="font-medium text-[#4B2B1D]">{r.name}</span>
                    <span className="text-[#9A8774]">{r.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {plate.length === 0 ? (
            <p className="text-xs text-[#9A7E6F]">Add recipes above to see a live combined plate cost.</p>
          ) : (
            <div className="space-y-2">
              {plate.map((p) => {
                const r = results[p.recipe_id]
                const isLoading = loadingIds.has(p.recipe_id)
                return (
                  <div key={p.recipe_id} className="flex items-center gap-3 rounded-lg border border-[#E4D8C9] bg-white px-3 py-2">
                    <span className="flex-1 truncate text-sm font-medium text-[#4B2B1D]">{p.name}</span>
                    <label className="flex items-center gap-1.5 text-xs text-[#755B4C]">
                      servings
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={p.servings}
                        onChange={(e) => updateServings(p.recipe_id, parseFloat(e.target.value) || 0)}
                        className="w-16 h-7 rounded border border-[#D8CDBE] px-2 text-xs text-center"
                      />
                    </label>
                    <span className="w-20 text-right text-sm font-bold text-[#2E527F]">
                      {isLoading ? '…' : r ? `$${(r.cost_cents / 100).toFixed(2)}` : '—'}
                    </span>
                    <button onClick={() => removeRecipe(p.recipe_id)} className="text-[#D62F3D] hover:text-[#B0242F]">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}

              <div className="flex items-center justify-between rounded-lg bg-[#4B2B1D] px-4 py-3 mt-2">
                <div>
                  <p className="text-xs font-bold text-[#E9DFD0]">Plate total</p>
                  <p className="text-[10px] text-[#CDBDA8]">
                    {Math.round(totals.calories)} cal · {totals.protein_g.toFixed(0)}g P · {totals.carbs_g.toFixed(0)}g C · {totals.fat_g.toFixed(0)}g F
                  </p>
                </div>
                <p className="text-2xl font-extrabold text-white">{allPriced ? `$${(totals.cost_cents / 100).toFixed(2)}` : '…'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
