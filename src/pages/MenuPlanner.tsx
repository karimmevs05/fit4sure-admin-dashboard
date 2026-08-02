import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react'

type Recipe = {
  recipe_id: number
  name: string
  category: string
  calories?: number
  protein_g?: string | number
  carbs_g?: string | number
  fat_g?: string | number
  cost_per_serving_cents?: number
}

type PlanRecipe = {
  recipe_id: number
  name: string
  servings: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  cost_cents: number
  raw_weight_g: number
  cooked_weight_g: number
}

type LowStockWarning = { name: string; have_g: number; need_g: number }

type Plate = {
  id: number
  name: string
  category: string
  delivery_day: 'monday' | 'thursday'
  large_variant_of: number | null
  price: number
  recipes: PlanRecipe[]
  totals: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    cost_cents: number
    raw_weight_g: number
    cooked_weight_g: number
  }
  allergens: string[]
  lowStockWarnings: LowStockWarning[]
  profit: {
    price_cents: number
    cost_cents: number
    profit_cents: number
    margin_pct: number
  }
}

type LastWeekMenu = { monday: string[]; thursday: string[] }

// A recipe being added to the plate builder, with an editable servings qty
type BuilderRecipe = { recipe: Recipe; servings: number }

const ALLERGEN_LABELS: Record<string, string> = {
  dairy: 'Dairy',
  gluten: 'Gluten',
  soy: 'Soy',
  egg: 'Egg',
  shellfish: 'Shellfish',
  fish: 'Fish',
  tree_nuts: 'Tree Nuts',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
}

// Reference Daily Values (FDA, 2000-calorie diet) used to compute %DV.
// Protein has no established %DV for general labeling purposes, so it's
// left blank like on a real label.
const DV_FAT_G = 78
const DV_CARB_G = 275

// A real FDA-style "Nutrition Facts" label: black border, thick divider
// rules, %DV column. Renders from whatever macro numbers are passed in —
// used both for the raw-basis live preview while building a plate, and
// for the real cooked-basis totals on a saved plate.
function NutritionFactsLabel({
  title, weightG, calories, proteinG, carbsG, fatG, isEstimate,
}: {
  title: string
  weightG?: number
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  isEstimate?: boolean
}) {
  const fatDV = Math.round((fatG / DV_FAT_G) * 100)
  const carbDV = Math.round((carbsG / DV_CARB_G) * 100)

  return (
    <div className="bg-white border-2 border-black p-3 font-sans max-w-xs">
      <h3 className="text-xl font-black leading-none mb-1">Nutrition Facts</h3>
      {isEstimate && (
        <p className="text-[10px] italic text-[#755B4C] mb-1">Preview estimate — raw-basis, before cooking loss</p>
      )}
      <div className="border-b-8 border-black mb-1"></div>
      <p className="text-xs mb-0.5">{title}</p>
      {weightG != null && (
        <p className="text-xs font-bold mb-1">Serving size: {Math.round(weightG)}g (cooked)</p>
      )}
      <div className="border-b-4 border-black mb-1"></div>

      <div className="flex items-baseline justify-between">
        <p className="text-lg font-black">Calories</p>
        <p className="text-3xl font-black">{Math.round(calories)}</p>
      </div>
      <div className="border-b-8 border-black mb-1"></div>

      <div className="text-right text-[10px] font-bold border-b border-black pb-0.5 mb-0.5">% Daily Value*</div>

      <div className="flex justify-between border-b border-[#999] py-0.5 text-xs">
        <p><span className="font-bold">Total Fat</span> {fatG.toFixed(1)}g</p>
        <p className="font-bold">{fatDV}%</p>
      </div>
      <div className="flex justify-between border-b border-[#999] py-0.5 text-xs">
        <p><span className="font-bold">Total Carbohydrate</span> {carbsG.toFixed(1)}g</p>
        <p className="font-bold">{carbDV}%</p>
      </div>
      <div className="flex justify-between border-b-8 border-black py-0.5 text-xs">
        <p><span className="font-bold">Protein</span> {proteinG.toFixed(1)}g</p>
      </div>

      <p className="text-[9px] mt-1.5 leading-tight text-[#4B2B1D]">
        *% Daily Value tells you how much a nutrient contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
      </p>
    </div>
  )
}

export default function MenuPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [plates, setPlates] = useState<Plate[]>([])
  const [weekStart, setWeekStart] = useState<{ sunday?: string; monday?: string; thursday?: string }>({})
  const [lastWeekMenu, setLastWeekMenu] = useState<LastWeekMenu>({ monday: [], thursday: [] })
  const [loading, setLoading] = useState(true)
  const [buildingDay, setBuildingDay] = useState<'monday' | 'thursday' | null>(null)
  const [plateName, setPlateName] = useState('')
  const [builderRecipes, setBuilderRecipes] = useState<BuilderRecipe[]>([])
  const [makeLarge, setMakeLarge] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [saving, setSaving] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const categories = ['ALL', 'beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const [recipesRes, platesRes, lastWeekRes, nextWeekRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/recipes`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/plates`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/previous-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/next-week`, { headers }),
      ])

      const published = (recipesRes.data.data || []).filter((r: Recipe) => r.category !== 'prepared_meal')
      setRecipes(published)
      setPlates(platesRes.data.data?.plates || [])
      setLastWeekMenu(lastWeekRes.data.data || { monday: [], thursday: [] })
      setWeekStart(nextWeekRes.data.data || {})
    } catch (error) {
      console.error('Error fetching menu planner data:', error)
    } finally {
      setLoading(false)
    }
  }

  const startBuildingPlate = (day: 'monday' | 'thursday') => {
    setBuildingDay(day)
    setPlateName('')
    setBuilderRecipes([])
    setMakeLarge(false)
    setCategoryFilter('ALL')
  }

  const addRecipeToBuilder = (recipe: Recipe) => {
    if (builderRecipes.some(br => br.recipe.recipe_id === recipe.recipe_id)) return
    setBuilderRecipes([...builderRecipes, { recipe, servings: 1 }])
  }

  const updateBuilderServings = (recipeId: number, servings: number) => {
    setBuilderRecipes(builderRecipes.map(br => br.recipe.recipe_id === recipeId ? { ...br, servings } : br))
  }

  const removeBuilderRecipe = (recipeId: number) => {
    setBuilderRecipes(builderRecipes.filter(br => br.recipe.recipe_id !== recipeId))
  }

  const savePlate = async () => {
    if (!buildingDay || !plateName.trim() || builderRecipes.length === 0) {
      alert('Please enter a plate name and add at least one recipe')
      return
    }
    setSaving(true)
    try {
      await axios.post(
        `${apiUrl}/api/admin/menu-planner/plates`,
        {
          name: plateName.trim(),
          day: buildingDay,
          recipes: builderRecipes.map(br => ({ recipe_id: br.recipe.recipe_id, servings: br.servings })),
          makeLarge,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setBuildingDay(null)
      await fetchAll()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save plate')
    } finally {
      setSaving(false)
    }
  }

  const deletePlate = async (plate: Plate) => {
    const warning = plate.large_variant_of
      ? 'Delete this Large plate?'
      : 'Delete this plate? Its Large version (if any) will be removed too.'
    if (!confirm(warning)) return
    try {
      await axios.delete(`${apiUrl}/api/admin/menu-planner/plates/${plate.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchAll()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete plate')
    }
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      beef: 'bg-[#8B4513] text-white',
      chicken: 'bg-[#D97706] text-white',
      turkey: 'bg-[#92400E] text-white',
      carbohydrates: 'bg-[#EAB308] text-[#1F2937]',
      vegetables: 'bg-[#16A34A] text-white',
      sauces: 'bg-[#E11D48] text-white',
      beverage: 'bg-[#0EA5E9] text-white',
      breakfast: 'bg-[#F59E0B] text-white',
    }
    return colors[category] || 'bg-[#9CA3AF] text-white'
  }

  const getFilteredRecipes = () => {
    if (categoryFilter === 'ALL') return recipes
    return recipes.filter(r => r.category === categoryFilter)
  }

  // Live preview totals for the builder, computed from each recipe's real
  // per-serving macros/cost (already returned by /api/admin/recipes)
  // scaled by the servings entered. Raw-basis only — real cooked weight
  // and yield-corrected macros are computed server-side once the plate is
  // saved, since that calc depends on cooking-method assignments per
  // ingredient which aren't available to this lightweight preview.
  const builderTotals = useMemo(() => {
    return builderRecipes.reduce(
      (acc, br) => ({
        calories: acc.calories + Math.round((br.recipe.calories || 0) * br.servings),
        protein_g: acc.protein_g + (parseFloat(String(br.recipe.protein_g || 0)) * br.servings),
        carbs_g: acc.carbs_g + (parseFloat(String(br.recipe.carbs_g || 0)) * br.servings),
        fat_g: acc.fat_g + (parseFloat(String(br.recipe.fat_g || 0)) * br.servings),
        cost_cents: acc.cost_cents + Math.round((br.recipe.cost_per_serving_cents || 0) * br.servings),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0 }
    )
  }, [builderRecipes])

  const platesByDay = (day: 'monday' | 'thursday') => plates.filter(p => p.delivery_day === day && !p.large_variant_of)
  const largeTwinFor = (plateId: number) => plates.find(p => p.large_variant_of === plateId)

  const dayTotal = (day: 'monday' | 'thursday') =>
    platesByDay(day).reduce((sum, p) => sum + p.totals.cost_cents, 0)

  const dayLowStockCount = (day: 'monday' | 'thursday') =>
    platesByDay(day).reduce((sum, p) => sum + p.lowStockWarnings.length, 0)

  if (loading) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Last Week's Menu (real data) */}
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
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

        {/* Monday Delivery */}
        <DeliveryColumn
          day="monday"
          label="Monday Delivery"
          color="#16A34A"
          bg="#F0FDF4"
          plates={platesByDay('monday')}
          largeTwinFor={largeTwinFor}
          onAddPlate={() => startBuildingPlate('monday')}
          onDeletePlate={deletePlate}
          getCategoryColor={getCategoryColor}
        />

        {/* Thursday Delivery */}
        <DeliveryColumn
          day="thursday"
          label="Thursday Delivery"
          color="#D97706"
          bg="#FFFBEB"
          plates={platesByDay('thursday')}
          largeTwinFor={largeTwinFor}
          onAddPlate={() => startBuildingPlate('thursday')}
          onDeletePlate={deletePlate}
          getCategoryColor={getCategoryColor}
        />
      </div>

      {/* Plate Builder Modal */}
      {buildingDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">
                Build Plate - {buildingDay === 'monday' ? 'Monday' : 'Thursday'}
              </h2>
              <button onClick={() => setBuildingDay(null)} className="text-[#755B4C] hover:text-[#4B2B1D]">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-extrabold text-[#4B2B1D] mb-2">Plate Name</label>
                <input
                  type="text"
                  value={plateName}
                  onChange={(e) => setPlateName(e.target.value)}
                  placeholder="e.g., Steak & Broccoli Bowl"
                  className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#4B2B1D] mb-3">Filter by Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                        categoryFilter === cat
                          ? 'bg-[#2E527F] text-white'
                          : 'border border-[#CDBDA8] bg-white text-[#4B2B1D] hover:bg-[#F8F2E8]'
                      }`}
                    >
                      {cat === 'carbohydrates' ? 'carb' : cat === 'vegetables' ? 'veg' : cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#4B2B1D] mb-3">Select Recipes</label>
                <div className="max-h-[300px] overflow-y-auto border border-[#E4D8C9] rounded-lg p-3 bg-white space-y-2">
                  {getFilteredRecipes().length === 0 ? (
                    <p className="text-xs text-[#755B4C]">No recipes in this category</p>
                  ) : (
                    getFilteredRecipes().map(recipe => (
                      <button
                        key={recipe.recipe_id}
                        onClick={() => addRecipeToBuilder(recipe)}
                        disabled={builderRecipes.some(br => br.recipe.recipe_id === recipe.recipe_id)}
                        className="w-full text-left rounded-lg border border-[#E4D8C9] hover:bg-[#F8F2E8] p-3 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-[#4B2B1D]">{recipe.name}</p>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${getCategoryColor(recipe.category)}`}>
                              {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                            </span>
                          </div>
                          {recipe.cost_per_serving_cents != null && (
                            <span className="text-xs font-bold text-[#2E527F]">${(recipe.cost_per_serving_cents / 100).toFixed(2)}/serving</span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.calories ?? '-'}</p>
                            <p className="text-xs text-[#9A7E6F]">CAL</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.protein_g ?? '-'}g</p>
                            <p className="text-xs text-[#9A7E6F]">PRO</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.carbs_g ?? '-'}g</p>
                            <p className="text-xs text-[#9A7E6F]">CARB</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.fat_g ?? '-'}g</p>
                            <p className="text-xs text-[#9A7E6F]">FAT</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {builderRecipes.length > 0 && (
                <div>
                  <label className="block text-xs font-extrabold text-[#4B2B1D] mb-3">
                    Recipes in Plate ({builderRecipes.length}) -- set the amount used
                  </label>
                  <div className="space-y-2 border border-[#16A34A] rounded-lg p-3 bg-[#F0FDF4]">
                    {builderRecipes.map((br) => (
                      <div key={br.recipe.recipe_id} className="flex items-center justify-between bg-white rounded p-2 gap-2">
                        <p className="text-xs font-semibold text-[#4B2B1D] flex-1">{br.recipe.name}</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={br.servings}
                            onChange={(e) => updateBuilderServings(br.recipe.recipe_id, parseFloat(e.target.value) || 0)}
                            className="w-16 h-8 rounded border border-[#B9A88F] bg-white px-2 text-xs text-center outline-none"
                          />
                          <span className="text-xs text-[#9A7E6F]">servings</span>
                        </div>
                        <button
                          onClick={() => removeBuilderRecipe(br.recipe.recipe_id)}
                          className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#D8CDBE] flex justify-between">
                      <p className="text-xs font-bold text-[#755B4C]">Cost Total:</p>
                      <p className="text-sm font-extrabold text-[#16A34A]">${(builderTotals.cost_cents / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {builderRecipes.length > 0 && (
                <div className="flex flex-col items-center gap-2">
                  <NutritionFactsLabel
                    title={plateName.trim() || 'New plate'}
                    calories={builderTotals.calories}
                    proteinG={builderTotals.protein_g}
                    carbsG={builderTotals.carbs_g}
                    fatG={builderTotals.fat_g}
                    isEstimate
                  />
                  <p className="text-xs text-[#9A7E6F] text-center">
                    Real cooked-weight label and profit margin appear on the plate card once saved.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-xl border border-[#CDBDA8] bg-white p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={makeLarge}
                  onChange={(e) => setMakeLarge(e.target.checked)}
                  className="h-5 w-5 rounded border-[#B9A88F]"
                />
                <div>
                  <p className="text-sm font-bold text-[#4B2B1D]">Also make available in Large</p>
                  <p className="text-xs text-[#755B4C]">Creates a matching Large-tier plate with every ingredient amount × 1.5</p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setBuildingDay(null)}
                  className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-4 py-3 text-sm font-extrabold text-[#4B2B1D] hover:bg-[#F8F2E8] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={savePlate}
                  disabled={!plateName.trim() || builderRecipes.length === 0 || saving}
                  className="flex-1 rounded-lg bg-[#16A34A] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50 transition"
                >
                  {saving ? 'Saving...' : 'Save Plate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Monday Plates</p>
          <p className="text-2xl font-extrabold text-[#16A34A]">{platesByDay('monday').length}</p>
          {dayLowStockCount('monday') > 0 && (
            <p className="text-xs font-bold text-[#D62F3D] mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {dayLowStockCount('monday')} low-stock flag{dayLowStockCount('monday') > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Monday Cost</p>
          <p className="text-2xl font-extrabold text-[#16A34A]">${(dayTotal('monday') / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Thursday Plates</p>
          <p className="text-2xl font-extrabold text-[#D97706]">{platesByDay('thursday').length}</p>
          {dayLowStockCount('thursday') > 0 && (
            <p className="text-xs font-bold text-[#D62F3D] mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {dayLowStockCount('thursday')} low-stock flag{dayLowStockCount('thursday') > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Thursday Cost</p>
          <p className="text-2xl font-extrabold text-[#D97706]">${(dayTotal('thursday') / 100).toFixed(2)}</p>
        </div>
      </div>
    </main>
  )
}

function DeliveryColumn({
  day, label, color, bg, plates, largeTwinFor, onAddPlate, onDeletePlate, getCategoryColor,
}: {
  day: 'monday' | 'thursday'
  label: string
  color: string
  bg: string
  plates: Plate[]
  largeTwinFor: (id: number) => Plate | undefined
  onAddPlate: () => void
  onDeletePlate: (plate: Plate) => void
  getCategoryColor: (category: string) => string
}) {
  return (
    <div className="rounded-2xl border-2 p-6 min-h-[700px]" style={{ borderColor: color, backgroundColor: bg }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full" style={{ backgroundColor: color }}></div>
          <h2 className="text-lg font-extrabold" style={{ color }}>{label}</h2>
        </div>
        <button
          onClick={onAddPlate}
          className="flex items-center gap-1 rounded-lg text-white px-3 py-1.5 text-xs font-bold transition"
          style={{ backgroundColor: color }}
        >
          <Plus className="h-4 w-4" />
          Plate
        </button>
      </div>

      <div className="space-y-3">
        {plates.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed bg-white p-8 text-center" style={{ borderColor: color }}>
            <p className="text-sm text-[#755B4C]">Click "Plate" to build plates</p>
          </div>
        ) : (
          plates.map((plate) => {
            const large = largeTwinFor(plate.id)
            const marginColor = plate.profit.margin_pct >= 60 ? '#16A34A' : plate.profit.margin_pct >= 40 ? '#D97706' : '#D62F3D'
            return (
              <div key={plate.id} className="rounded-lg border bg-white p-4" style={{ borderColor: color }}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-extrabold text-[#4B2B1D]">{plate.name}</p>
                  <button onClick={() => onDeletePlate(plate)} className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Low stock warning banner */}
                {plate.lowStockWarnings.length > 0 && (
                  <div className="mb-2 rounded-lg bg-[#FFF4F4] border border-[#F5B5B5] p-2 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-[#D62F3D] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#D62F3D]">Low stock</p>
                      {plate.lowStockWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-[#9A3B3B]">
                          {w.name}: have {Math.round(w.have_g)}g, need {Math.round(w.need_g)}g
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allergen tags */}
                {plate.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {plate.allergens.map(a => (
                      <span key={a} className="text-xs font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                        {ALLERGEN_LABELS[a] || a}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  {plate.recipes.map((recipe, idx) => (
                    <div key={idx} className="bg-[#F9F5F0] rounded p-2">
                      <p className="text-xs font-semibold text-[#4B2B1D]">{recipe.name} × {recipe.servings}</p>
                    </div>
                  ))}
                </div>

                {/* Real FDA-style nutrition label - cooked weight + cooked-basis macros */}
                <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex justify-center">
                  <NutritionFactsLabel
                    title={plate.name}
                    weightG={plate.totals.cooked_weight_g}
                    calories={plate.totals.calories}
                    proteinG={plate.totals.protein_g}
                    carbsG={plate.totals.carbs_g}
                    fatG={plate.totals.fat_g}
                  />
                </div>

                {/* Profit margin */}
                <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#755B4C]">
                      Cost ${(plate.totals.cost_cents / 100).toFixed(2)} → Price ${(plate.profit.price_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs font-extrabold" style={{ color: marginColor }}>
                      +${(plate.profit.profit_cents / 100).toFixed(2)} profit ({plate.profit.margin_pct}% margin)
                    </p>
                  </div>
                </div>

                {large && (
                  <div className="mt-3 pt-3 border-t border-dashed border-[#E4D8C9]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#2E527F] text-white">Large version also available</span>
                      <p className="text-xs font-bold" style={{ color }}>${(large.totals.cost_cents / 100).toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
