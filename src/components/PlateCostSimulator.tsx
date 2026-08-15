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

type PlateItem = { recipe: Recipe; servingSizeG: string }

const CATEGORY_COLORS: Record<string, string> = {
  beef: 'bg-[#8B4513] text-white',
  chicken: 'bg-[#D97706] text-white',
  turkey: 'bg-[#92400E] text-white',
  carbohydrates: 'bg-[#EAB308] text-[#1F2937]',
  vegetables: 'bg-[#16A34A] text-white',
  sauces: 'bg-[#E11D48] text-white',
  beverage: 'bg-[#0EA5E9] text-white',
  breakfast: 'bg-[#F59E0B] text-white',
}
const CATEGORIES = ['ALL', 'beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

// Same interaction model the real Plate Builder used before it was retired
// (browse/filter recipes, live macro+cost preview per gram amount, add to a
// running plate, one combined total) -- just without the save/name/day/
// makeLarge parts, since this is purely for testing a combo before
// committing to a real plate, not persisting one.
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
              {plate.length} recipe{plate.length === 1 ? '' : 's'} · ${(totals.cost_cents / 100).toFixed(2)}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-[#755B4C]" /> : <ChevronDown className="h-4 w-4 text-[#755B4C]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-[#E4D8C9] pt-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-extrabold text-[#4B2B1D] mb-1.5">Filter by Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#B9A88F] bg-white px-2.5 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All categories' : cat === 'carbohydrates' ? 'Carb' : cat === 'vegetables' ? 'Veg' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-extrabold text-[#4B2B1D] mb-1.5">Serving Size (g)</label>
              <input
                type="number"
                min="1"
                value={defaultServingSizeG}
                onChange={(e) => setDefaultServingSizeG(e.target.value)}
                placeholder="e.g. 455"
                className="w-full h-9 rounded-lg border border-[#B9A88F] bg-white px-2.5 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
            </div>
          </div>

          {plate.length > 0 && (
            <div>
              <p className="text-xs font-extrabold text-[#4B2B1D] mb-2">Recipes in Plate ({plate.length})</p>
              <div className="space-y-1.5 border border-[#16A34A] rounded-lg p-3 bg-[#F0FDF4]">
                {plate.map((p) => (
                  <div key={p.recipe.recipe_id} className="flex items-center justify-between gap-2 bg-white rounded p-2">
                    <p className="text-xs font-semibold text-[#4B2B1D] flex-1 truncate">{p.recipe.name}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={p.servingSizeG}
                        onChange={(e) => updateServingSize(p.recipe.recipe_id, e.target.value)}
                        className="w-16 h-8 rounded border border-[#B9A88F] bg-white px-2 text-xs text-center outline-none"
                      />
                      <span className="text-xs text-[#9A7E6F]">g</span>
                    </div>
                    <button
                      onClick={() => removeRecipe(p.recipe.recipe_id)}
                      className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* One combined total for the whole plate, instead of a
                    macro breakdown repeated per recipe. */}
                <div className="pt-2 mt-1 border-t border-[#D8CDBE] space-y-2">
                  <div className="flex justify-between">
                    <p className="text-xs font-bold text-[#755B4C]">Plate Total</p>
                    <p className="text-sm font-extrabold text-[#16A34A]">${(totals.cost_cents / 100).toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="text-center bg-[#F9F5F0] rounded p-1.5">
                      <p className="font-bold text-[#4B2B1D] text-sm">{totals.calories}</p>
                      <p className="text-[10px] text-[#9A7E6F]">CAL</p>
                    </div>
                    <div className="text-center bg-[#F9F5F0] rounded p-1.5">
                      <p className="font-bold text-[#4B2B1D] text-sm">{totals.protein_g.toFixed(1)}g</p>
                      <p className="text-[10px] text-[#9A7E6F]">PRO</p>
                    </div>
                    <div className="text-center bg-[#F9F5F0] rounded p-1.5">
                      <p className="font-bold text-[#4B2B1D] text-sm">{totals.carbs_g.toFixed(1)}g</p>
                      <p className="text-[10px] text-[#9A7E6F]">CARB</p>
                    </div>
                    <div className="text-center bg-[#F9F5F0] rounded p-1.5">
                      <p className="font-bold text-[#4B2B1D] text-sm">{totals.fat_g.toFixed(1)}g</p>
                      <p className="text-[10px] text-[#9A7E6F]">FAT</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-extrabold text-[#4B2B1D] mb-2">
              Select Recipes{defaultServingSizeG && ` — macros/cost shown at ${defaultServingSizeG}g`}
            </p>
            <div className="max-h-[320px] overflow-y-auto border border-[#E4D8C9] rounded-lg p-3 bg-white space-y-2">
              {filteredRecipes.length === 0 ? (
                <p className="text-xs text-[#755B4C]">No recipes in this category</p>
              ) : (
                filteredRecipes.map((recipe) => {
                  const requestedG = parseFloat(defaultServingSizeG)
                  const previewG = !isNaN(requestedG) && requestedG > 0 ? requestedG : null
                  const preview = previewG ? macrosAtGrams(recipe, previewG) : null
                  const already = plate.some((p) => p.recipe.recipe_id === recipe.recipe_id)
                  return (
                    <button
                      key={recipe.recipe_id}
                      onClick={() => addRecipe(recipe)}
                      disabled={already}
                      className="w-full text-left rounded-lg border border-[#E4D8C9] hover:bg-[#F8F2E8] p-3 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-[#4B2B1D] text-sm">{recipe.name}</p>
                          <span
                            className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                              CATEGORY_COLORS[recipe.category] || 'bg-[#9CA3AF] text-white'
                            }`}
                          >
                            {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-[#2E527F]">
                          {preview
                            ? `$${(preview.cost_cents / 100).toFixed(2)} @ ${previewG}g`
                            : recipe.cost_per_serving_cents != null
                            ? `$${(recipe.cost_per_serving_cents / 100).toFixed(2)}/serving`
                            : null}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center bg-[#F9F5F0] rounded p-1">
                          <p className="font-bold text-[#4B2B1D] text-sm">{preview ? preview.calories : recipe.calories ?? '-'}</p>
                          <p className="text-[10px] text-[#9A7E6F]">CAL</p>
                        </div>
                        <div className="text-center bg-[#F9F5F0] rounded p-1">
                          <p className="font-bold text-[#4B2B1D] text-sm">{preview ? preview.protein_g.toFixed(1) : recipe.protein_g ?? '-'}g</p>
                          <p className="text-[10px] text-[#9A7E6F]">PRO</p>
                        </div>
                        <div className="text-center bg-[#F9F5F0] rounded p-1">
                          <p className="font-bold text-[#4B2B1D] text-sm">{preview ? preview.carbs_g.toFixed(1) : recipe.carbs_g ?? '-'}g</p>
                          <p className="text-[10px] text-[#9A7E6F]">CARB</p>
                        </div>
                        <div className="text-center bg-[#F9F5F0] rounded p-1">
                          <p className="font-bold text-[#4B2B1D] text-sm">{preview ? preview.fat_g.toFixed(1) : recipe.fat_g ?? '-'}g</p>
                          <p className="text-[10px] text-[#9A7E6F]">FAT</p>
                        </div>
                      </div>
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
