import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, Plus, Trash2, Calendar, X } from 'lucide-react'

type Recipe = {
  recipe_id: number
  name: string
  category: string
  created_at?: string
  updated_at?: string
  cost_per_serving_cents?: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  last_cooked_date?: string
}

type Plate = {
  id: string
  name: string
  recipes: Recipe[]
  day: 'monday' | 'thursday'
}

type MenuDay = {
  monday: Plate[]
  thursday: Plate[]
}

type LastWeekMenu = {
  monday: string[]
  thursday: string[]
}

export default function MenuPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [menuDays, setMenuDays] = useState<MenuDay>({
    monday: [],
    thursday: [],
  })
  const [lastWeekMenu, setLastWeekMenu] = useState<LastWeekMenu>({
    monday: [],
    thursday: [],
  })
  const [loading, setLoading] = useState(true)
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null)
  const [buildingPlate, setBuildingPlate] = useState<{ recipes: Recipe[]; day: 'monday' | 'thursday' } | null>(null)
  const [plateName, setPlateName] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const categories = ['ALL', 'beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

  useEffect(() => {
    fetchRecipes()
    fetchLastWeekMenu()
  }, [])

  const fetchRecipes = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/recipes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const published = (response.data.data || []).filter(
        (r: Recipe) => r.category !== 'prepared_meal'
      )

      // Mock nutritional data - in production, this comes from your recipes table
      const recipesWithNutrition = published.map((r: Recipe) => ({
        ...r,
        calories: Math.floor(Math.random() * 300) + 100,
        protein: Math.floor(Math.random() * 40) + 10,
        carbs: Math.floor(Math.random() * 50) + 10,
        fat: Math.floor(Math.random() * 20) + 5,
        last_cooked_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }))

      setRecipes(recipesWithNutrition)
    } catch (error) {
      console.error('Error fetching recipes:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLastWeekMenu = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/orders/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const weeks = response.data.data || []
      if (weeks.length > 0) {
        // Get the second most recent week (last week)
        const lastWeek = weeks[1] || weeks[0]

        // Fetch that week's menu
        const menuResponse = await axios.get(`${apiUrl}/api/admin/orders/${lastWeek.week}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        // Parse the menu to separate by day
        const lastWeekData = menuResponse.data.data

        // Fetch full this week data to get menu with day info
        const thisWeekResponse = await axios.get(`${apiUrl}/api/admin/orders/this-week`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (thisWeekResponse.data.data?.menu) {
          const menu = thisWeekResponse.data.data.menu
          setLastWeekMenu({
            monday: menu.filter((m: any) => m.day_of_week === 'Monday').map((m: any) => m.recipe_name),
            thursday: menu.filter((m: any) => m.day_of_week === 'Thursday').map((m: any) => m.recipe_name),
          })
        }
      }
    } catch (error) {
      console.error('Error fetching last week menu:', error)
    }
  }

  const handleDragStart = (recipe: Recipe) => {
    setDraggedRecipe(recipe)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const startBuildingPlate = (day: 'monday' | 'thursday') => {
    setBuildingPlate({ recipes: [], day })
    setPlateName('')
    setCategoryFilter('ALL')
  }

  const addRecipeToPlate = (recipe: Recipe) => {
    if (!buildingPlate) return
    setBuildingPlate({
      ...buildingPlate,
      recipes: [...buildingPlate.recipes, recipe],
    })
  }

  const removeRecipeFromPlate = (recipeId: number) => {
    if (!buildingPlate) return
    setBuildingPlate({
      ...buildingPlate,
      recipes: buildingPlate.recipes.filter(r => r.recipe_id !== recipeId),
    })
  }

  const savePlate = () => {
    if (!buildingPlate || !plateName.trim() || buildingPlate.recipes.length === 0) {
      alert('Please enter a plate name and add at least one recipe')
      return
    }

    const newPlate: Plate = {
      id: `${Date.now()}-${Math.random()}`,
      name: plateName,
      recipes: buildingPlate.recipes,
      day: buildingPlate.day,
    }

    setMenuDays(prev => ({
      ...prev,
      [buildingPlate.day]: [...prev[buildingPlate.day], newPlate],
    }))

    setBuildingPlate(null)
    setPlateName('')
  }

  const removePlate = (day: 'monday' | 'thursday', plateId: string) => {
    setMenuDays(prev => ({
      ...prev,
      [day]: prev[day].filter(p => p.id !== plateId),
    }))
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getDaysAgo = (dateString?: string) => {
    if (!dateString) return 'Unknown'
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays}d ago`
  }

  const getPlateTotal = (plate: Plate) => {
    return plate.recipes.reduce((sum, r) => sum + (r.cost_per_serving_cents || 0), 0)
  }

  const getMondayTotal = () => {
    return menuDays.monday.reduce((sum, plate) => sum + getPlateTotal(plate), 0)
  }

  const getThursdayTotal = () => {
    return menuDays.thursday.reduce((sum, plate) => sum + getPlateTotal(plate), 0)
  }

  const getFilteredRecipes = () => {
    if (categoryFilter === 'ALL') return recipes
    return recipes.filter(r => r.category === categoryFilter)
  }

  const calculatePlateMacros = (recipeList: Recipe[]) => {
    return {
      calories: recipeList.reduce((sum, r) => sum + (r.calories || 0), 0),
      protein: recipeList.reduce((sum, r) => sum + (r.protein || 0), 0),
      carbs: recipeList.reduce((sum, r) => sum + (r.carbs || 0), 0),
      fat: recipeList.reduce((sum, r) => sum + (r.fat || 0), 0),
    }
  }

  const plateMacros = buildingPlate ? calculatePlateMacros(buildingPlate.recipes) : null

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
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Menu Planner</h1>
          <p className="mt-1 text-sm text-[#755B4C]">Build plates by combining recipes for your weekly menu</p>
        </div>
      </div>

      {/* Main Grid: Last Week Menu + Current Menu */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Last Week's Menu */}
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
          <h2 className="mb-4 text-lg font-extrabold text-[#4B2B1D]">Last Week's Menu</h2>

          {/* Monday */}
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

          {/* Thursday */}
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
        <div className="rounded-2xl border-2 border-[#16A34A] bg-[#F0FDF4] p-6 min-h-[700px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-[#16A34A]"></div>
              <h2 className="text-lg font-extrabold text-[#16A34A]">Monday Delivery</h2>
            </div>
            <button
              onClick={() => startBuildingPlate('monday')}
              className="flex items-center gap-1 rounded-lg bg-[#16A34A] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#15873F] transition"
            >
              <Plus className="h-4 w-4" />
              Plate
            </button>
          </div>

          <div className="space-y-3">
            {menuDays.monday.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-[#16A34A] bg-white p-8 text-center">
                <p className="text-sm text-[#755B4C]">Click "Plate" to build plates</p>
              </div>
            ) : (
              menuDays.monday.map((plate) => (
                <div key={plate.id} className="rounded-lg border border-[#16A34A] bg-white p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-extrabold text-[#4B2B1D]">{plate.name}</p>
                    <button
                      onClick={() => removePlate('monday', plate.id)}
                      className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {plate.recipes.map((recipe, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#F9F5F0] rounded p-2">
                        <div>
                          <p className="text-xs font-semibold text-[#4B2B1D]">{recipe.name}</p>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-0.5 ${getCategoryColor(recipe.category)}`}>
                            {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                          </span>
                        </div>
                        {recipe.cost_per_serving_cents && (
                          <span className="text-xs font-bold text-[#2E527F]">
                            ${(recipe.cost_per_serving_cents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex justify-between">
                    <p className="text-xs font-bold text-[#755B4C]">Total:</p>
                    <p className="text-sm font-extrabold text-[#16A34A]">
                      ${(getPlateTotal(plate) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Thursday Delivery */}
        <div className="rounded-2xl border-2 border-[#D97706] bg-[#FFFBEB] p-6 min-h-[700px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-[#D97706]"></div>
              <h2 className="text-lg font-extrabold text-[#D97706]">Thursday Delivery</h2>
            </div>
            <button
              onClick={() => startBuildingPlate('thursday')}
              className="flex items-center gap-1 rounded-lg bg-[#D97706] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#B86A05] transition"
            >
              <Plus className="h-4 w-4" />
              Plate
            </button>
          </div>

          <div className="space-y-3">
            {menuDays.thursday.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-[#D97706] bg-white p-8 text-center">
                <p className="text-sm text-[#755B4C]">Click "Plate" to build plates</p>
              </div>
            ) : (
              menuDays.thursday.map((plate) => (
                <div key={plate.id} className="rounded-lg border border-[#D97706] bg-white p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-extrabold text-[#4B2B1D]">{plate.name}</p>
                    <button
                      onClick={() => removePlate('thursday', plate.id)}
                      className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {plate.recipes.map((recipe, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#F9F5F0] rounded p-2">
                        <div>
                          <p className="text-xs font-semibold text-[#4B2B1D]">{recipe.name}</p>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-0.5 ${getCategoryColor(recipe.category)}`}>
                            {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                          </span>
                        </div>
                        {recipe.cost_per_serving_cents && (
                          <span className="text-xs font-bold text-[#2E527F]">
                            ${(recipe.cost_per_serving_cents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex justify-between">
                    <p className="text-xs font-bold text-[#755B4C]">Total:</p>
                    <p className="text-sm font-extrabold text-[#D97706]">
                      ${(getPlateTotal(plate) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Plate Builder Modal */}
      {buildingPlate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">Build Plate - {buildingPlate.day === 'monday' ? 'Monday' : 'Thursday'}</h2>
              <button
                onClick={() => setBuildingPlate(null)}
                className="text-[#755B4C] hover:text-[#4B2B1D]"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Plate Name Input */}
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

              {/* Category Filter */}
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

              {/* Recipes to Add */}
              <div>
                <label className="block text-xs font-extrabold text-[#4B2B1D] mb-3">Select Recipes</label>
                <div className="max-h-[400px] overflow-y-auto border border-[#E4D8C9] rounded-lg p-3 bg-white space-y-2">
                  {getFilteredRecipes().length === 0 ? (
                    <p className="text-xs text-[#755B4C]">No recipes in this category</p>
                  ) : (
                    getFilteredRecipes().map(recipe => (
                      <button
                        key={recipe.recipe_id}
                        onClick={() => addRecipeToPlate(recipe)}
                        className="w-full text-left rounded-lg border border-[#E4D8C9] hover:bg-[#F8F2E8] p-3 transition"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-[#4B2B1D]">{recipe.name}</p>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${getCategoryColor(recipe.category)}`}>
                              {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                            </span>
                          </div>
                          <span className="text-xs text-[#9A7E6F] font-semibold">Last cooked: {getDaysAgo(recipe.last_cooked_date)}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.calories}</p>
                            <p className="text-xs text-[#9A7E6F]">CAL</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.protein}g</p>
                            <p className="text-xs text-[#9A7E6F]">PRO</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.carbs}g</p>
                            <p className="text-xs text-[#9A7E6F]">CARB</p>
                          </div>
                          <div className="text-center bg-[#F9F5F0] rounded p-1">
                            <p className="font-bold text-[#4B2B1D] text-sm">{recipe.fat}g</p>
                            <p className="text-xs text-[#9A7E6F]">FAT</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Meal Totals */}
              {plateMacros && (
                <div className="bg-gradient-to-br from-[#F0FDF4] to-[#FFFBEB] border-2 border-[#8B6F47] rounded-xl p-4">
                  <h3 className="font-extrabold text-[#4B2B1D] text-center mb-3">Meal Totals</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center bg-white rounded-lg p-3 border border-[#E4D8C9]">
                      <p className="font-extrabold text-[#4B2B1D] text-xl">{plateMacros.calories}</p>
                      <p className="text-xs text-[#755B4C] font-semibold mt-1">CAL</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-[#E4D8C9]">
                      <p className="font-extrabold text-[#4B2B1D] text-xl">{plateMacros.protein}g</p>
                      <p className="text-xs text-[#755B4C] font-semibold mt-1">PRO</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-[#E4D8C9]">
                      <p className="font-extrabold text-[#4B2B1D] text-xl">{plateMacros.carbs}g</p>
                      <p className="text-xs text-[#755B4C] font-semibold mt-1">CARB</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-[#E4D8C9]">
                      <p className="font-extrabold text-[#4B2B1D] text-xl">{plateMacros.fat}g</p>
                      <p className="text-xs text-[#755B4C] font-semibold mt-1">FAT</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected Recipes */}
              {buildingPlate.recipes.length > 0 && (
                <div>
                  <label className="block text-xs font-extrabold text-[#4B2B1D] mb-3">Recipes in Plate ({buildingPlate.recipes.length})</label>
                  <div className="space-y-2 border border-[#16A34A] rounded-lg p-3 bg-[#F0FDF4] max-h-[200px] overflow-y-auto">
                    {buildingPlate.recipes.map((recipe, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded p-2">
                        <div>
                          <p className="text-xs font-semibold text-[#4B2B1D]">{recipe.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getCategoryColor(recipe.category)}`}>
                              {recipe.category === 'carbohydrates' ? 'carb' : recipe.category === 'vegetables' ? 'veg' : recipe.category}
                            </span>
                            <span className="text-xs text-[#9A7E6F]">Last cooked: {getDaysAgo(recipe.last_cooked_date)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeRecipeFromPlate(recipe.recipe_id)}
                          className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded transition flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#D8CDBE] flex justify-between">
                      <p className="text-xs font-bold text-[#755B4C]">Cost Total:</p>
                      <p className="text-sm font-extrabold text-[#16A34A]">
                        ${(buildingPlate.recipes.reduce((sum, r) => sum + (r.cost_per_serving_cents || 0), 0) / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setBuildingPlate(null)}
                  className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-4 py-3 text-sm font-extrabold text-[#4B2B1D] hover:bg-[#F8F2E8] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={savePlate}
                  disabled={!plateName.trim() || buildingPlate.recipes.length === 0}
                  className="flex-1 rounded-lg bg-[#16A34A] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50 transition"
                >
                  Save Plate
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
          <p className="text-2xl font-extrabold text-[#16A34A]">{menuDays.monday.length}</p>
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Monday Cost</p>
          <p className="text-2xl font-extrabold text-[#16A34A]">
            ${(getMondayTotal() / 100).toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Thursday Plates</p>
          <p className="text-2xl font-extrabold text-[#D97706]">{menuDays.thursday.length}</p>
        </div>
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <p className="text-xs text-[#755B4C]">Thursday Cost</p>
          <p className="text-2xl font-extrabold text-[#D97706]">
            ${(getThursdayTotal() / 100).toFixed(2)}
          </p>
        </div>
      </div>
    </main>
  )
}
