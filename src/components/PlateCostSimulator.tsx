import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Calculator, ChevronDown, ChevronUp, X } from 'lucide-react'

type Recipe = {
  recipe_id: number
  name: string
  category: string
  calories?: number
  protein_g?: string | number
  carbs_g?: string | number
  fat_g?: string | number
  cost_per_serving_cents?: number
  cost_per_pound_cents?: number
  per_pound?: { calories: number; protein_g: string; carbs_g: string; fat_g: string }
}

const GRAMS_PER_POUND = 455

// Same instant, no-round-trip estimate the old Plate Builder used: scales a
// recipe's real per-pound macros/cost (already receipt-fallback-priced by
// the backend) to an arbitrary gram amount, so every serving-size edit
// updates immediately instead of waiting on a request.
function macrosAtGrams(recipe: Recipe, grams: number) {
  const ratio = grams / GRAMS_PER_POUND
  const pp = recipe.per_pound
  return {
    calories: Math.round((pp?.calories ?? 0) * ratio),
    protein_g: parseFloat(String(pp?.protein_g ?? '0')) * ratio,
    carbs_g: parseFloat(String(pp?.carbs_g ?? '0')) * ratio,
    fat_g: parseFloat(String(pp?.fat_g ?? '0')) * ratio,
    cost_cents: Math.round((recipe.cost_per_pound_cents ?? 0) * ratio),
  }
}

function macroLine(m: { calories: number; protein_g: number; carbs_g: number; fat_g: number }) {
  return `${Math.round(m.calories)} cal · ${m.protein_g.toFixed(1)}g P · ${m.carbs_g.toFixed(1)}g C · ${m.fat_g.toFixed(1)}g F`
}

type PlateItem = { recipe: Recipe; servingSizeG: string }

const CATEGORY_LABELS: Record<string, string> = {
  carbohydrates: 'carb',
  vegetables: 'veg',
}
const CATEGORIES = ['ALL', 'beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

// Same interaction model the real Plate Builder used before it was retired
// (browse/filter recipes, live macro+cost preview per gram amount, add to a
// running plate, one combined total) -- without the save/name/day/makeLarge
// parts, since this is for testing a combo, not persisting a real plate.
// Styled deliberately light: one line per recipe instead of a card+tile
// grid, plain text category labels instead of colored pills, no boxed
// macro tiles -- same options, much less visual weight.
export function PlateCostSimulator() {
  const [expanded, setExpanded] = useState(false)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [plate, setPlate] = useState<PlateItem[]>([])
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [defaultServingSizeG, setDefaultServingSizeG] = useState('')

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    axios
      .get(`${apiUrl}/api/admin/recipes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows: Recipe[] = res.data.data || res.data || []
        setAllRecipes(rows.filter((r: any) => r.category !== 'prepared_meal'))
      })
      .catch(() => {})
  }, [])

  const filteredRecipes = categoryFilter === 'ALL' ? allRecipes : allRecipes.filter((r) => r.category === categoryFilter)

  const addRecipe = (recipe: Recipe) => {
    if (plate.some((p) => p.recipe.recipe_id === recipe.recipe_id)) return
    const requestedG = parseFloat(defaultServingSizeG)
    const servingSizeG = !isNaN(requestedG) && requestedG > 0 ? String(requestedG) : String(GRAMS_PER_POUND)
    setPlate((prev) => [...prev, { recipe, servingSizeG }])
  }

  const updateServingSize = (recipeId: number, grams: string) => {
    setPlate((prev) => prev.map((p) => (p.recipe.recipe_id === recipeId ? { ...p, servingSizeG: grams } : p)))
  }

  const removeRecipe = (recipeId: number) => {
    setPlate((prev) => prev.filter((p) => p.recipe.recipe_id !== recipeId))
  }

  const totals = useMemo(() => {
    return plate.reduce(
      (acc, p) => {
        const grams = parseFloat(p.servingSizeG) || 0
        const m = macrosAtGrams(p.recipe, grams)
        return {
          calories: acc.calories + m.calories,
          protein_g: acc.protein_g + m.protein_g,
          carbs_g: acc.carbs_g + m.carbs_g,
          fat_g: acc.fat_g + m.fat_g,
          cost_cents: acc.cost_cents + m.cost_cents,
        }
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0 }
    )
  }, [plate])

  return (
    <div className="rounded-xl border border-[#E4D8C9] bg-[#FBF7F0]">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-[#9A8774]" />
          <span className="text-xs font-bold text-[#4B2B1D]">Plate Cost Simulator</span>
          <span className="hidden sm:inline text-[11px] text-[#9A8774]">test a combo before committing to a plate</span>
        </div>
        <div className="flex items-center gap-2.5">
          {plate.length > 0 && (
            <span className="text-xs font-semibold text-[#755B4C]">
              {plate.length} recipe{plate.length === 1 ? '' : 's'} · ${(totals.cost_cents / 100).toFixed(2)}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-[#9A8774]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#9A8774]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#E4D8C9] pt-3">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-[#755B4C]">
              Category
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-7 rounded-md border border-[#D8CDBE] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All' : CATEGORY_LABELS[cat] || cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#755B4C]">
              Serving size
              <input
                type="number"
                min="1"
                value={defaultServingSizeG}
                onChange={(e) => setDefaultServingSizeG(e.target.value)}
                placeholder="455"
                className="h-7 w-16 rounded-md border border-[#D8CDBE] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              g
            </label>
          </div>

          {plate.length > 0 && (
            <div className="rounded-lg border border-[#E4D8C9] bg-white">
              {plate.map((p, idx) => {
                const grams = parseFloat(p.servingSizeG) || 0
                const m = macrosAtGrams(p.recipe, grams)
                return (
                  <div
                    key={p.recipe.recipe_id}
                    className={`flex items-center gap-2 px-3 py-1.5 ${idx > 0 ? 'border-t border-[#F0EAE0]' : ''}`}
                  >
                    <span className="flex-1 truncate text-xs font-medium text-[#4B2B1D]">{p.recipe.name}</span>
                    <span className="hidden md:inline text-[11px] text-[#9A8774] truncate">{macroLine(m)}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={p.servingSizeG}
                      onChange={(e) => updateServingSize(p.recipe.recipe_id, e.target.value)}
                      className="w-14 h-6 rounded border border-[#D8CDBE] bg-white px-1.5 text-[11px] text-center outline-none flex-shrink-0"
                    />
                    <span className="text-[10px] text-[#9A8774] flex-shrink-0">g</span>
                    <span className="w-14 text-right text-xs font-bold text-[#2E527F] flex-shrink-0">${(m.cost_cents / 100).toFixed(2)}</span>
                    <button onClick={() => removeRecipe(p.recipe.recipe_id)} className="text-[#B0242F] hover:text-[#D62F3D] flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#E4D8C9] bg-[#F8F2E8] rounded-b-lg">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#755B4C]">Plate total</span>
                <span className="text-[11px] text-[#755B4C]">{macroLine(totals)}</span>
                <span className="text-sm font-extrabold text-[#16A34A]">${(totals.cost_cents / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] text-[#9A8774] mb-1.5">
              Select a recipe to add{defaultServingSizeG && ` — shown at ${defaultServingSizeG}g`}
            </p>
            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-[#E4D8C9] bg-white">
              {filteredRecipes.length === 0 ? (
                <p className="p-3 text-xs text-[#9A8774]">No recipes in this category</p>
              ) : (
                filteredRecipes.map((recipe, idx) => {
                  const requestedG = parseFloat(defaultServingSizeG)
                  const previewG = !isNaN(requestedG) && requestedG > 0 ? requestedG : null
                  const preview = previewG ? macrosAtGrams(recipe, previewG) : null
                  const already = plate.some((p) => p.recipe.recipe_id === recipe.recipe_id)
                  return (
                    <button
                      key={recipe.recipe_id}
                      onClick={() => addRecipe(recipe)}
                      disabled={already}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-[#F8F2E8] disabled:opacity-35 disabled:cursor-not-allowed ${
                        idx > 0 ? 'border-t border-[#F0EAE0]' : ''
                      }`}
                    >
                      <span className="text-xs font-medium text-[#4B2B1D] truncate">{recipe.name}</span>
                      <span className="text-[10px] uppercase text-[#9A8774] flex-shrink-0">{CATEGORY_LABELS[recipe.category] || recipe.category}</span>
                      <span className="flex-1 text-[11px] text-[#9A8774] truncate text-right">
                        {preview ? macroLine(preview) : ''}
                      </span>
                      <span className="w-16 text-right text-xs font-bold text-[#2E527F] flex-shrink-0">
                        {preview
                          ? `$${(preview.cost_cents / 100).toFixed(2)}`
                          : recipe.cost_per_serving_cents != null
                          ? `$${(recipe.cost_per_serving_cents / 100).toFixed(2)}`
                          : '—'}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
