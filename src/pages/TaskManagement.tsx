import React, { useState, useEffect } from 'react'
import { Loader, AlertCircle, Clock, ShoppingCart, Users } from 'lucide-react'

const API_BASE = 'http://localhost:3000/api'

const WEEKS = [
  '1.18', '1.25', '2.1', '2.8', '2.15', '2.22', '3.1', '3.8', '3.22', '3.29',
  '4.5', '4.12', '4.19', '4.26', '5.3', '5.10', '5.17', '5.24', '5.31',
  '6.7', '6.14', '6.21', '7.5', '7.12', '7.19'
]

export default function TaskManagementPage() {
  const [selectedWeek, setSelectedWeek] = useState('7.19')
  const [activeTab, setActiveTab] = useState('timeline')
  const [loading, setLoading] = useState(false)
  const [planData, setPlanData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    generatePlan()
  }, [selectedWeek])

  const generatePlan = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/admin/task-management-auto/auto-generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!response.ok) throw new Error('Failed to generate plan')
      const data = await response.json()
      setPlanData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">Generating Production Plan...</h2>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6">
          <AlertCircle className="w-6 h-6 text-red-600 mb-2" />
          <h2 className="text-xl font-bold text-red-900">Error</h2>
          <p className="text-red-800">{error}</p>
          <button
            onClick={generatePlan}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </main>
    )
  }

  if (!planData) {
    return (
      <main className="flex-1 p-8">
        <p className="text-slate-600">No data</p>
      </main>
    )
  }

  const plan = planData.plan
  const recipes = planData.recipes || []
  const procurement = planData.procurement || {}
  const summary = planData.summary || {}

  const dayColors = {
    Saturday: 'bg-yellow-50 border-yellow-200',
    Sunday: 'bg-orange-50 border-orange-200',
    Monday: 'bg-blue-50 border-blue-200',
    Tuesday: 'bg-purple-50 border-purple-200',
    Wednesday: 'bg-amber-50 border-amber-200',
    Thursday: 'bg-blue-50 border-blue-200',
    Friday: 'bg-slate-50 border-slate-200'
  }

  const dayIcons = {
    Saturday: '🔪',
    Sunday: '🍳',
    Monday: '🚚',
    Tuesday: '🛒',
    Wednesday: '⚡',
    Thursday: '📦',
    Friday: '📋'
  }

  const dayNotes = {
    Saturday: 'Vegetable prep, portioning, component prep',
    Sunday: 'Cook proteins, assemble meals, final QC',
    Monday: 'Pack meals, load delivery, ship to customers',
    Tuesday: 'Shopping, restocking, admin & planning',
    Wednesday: 'Mid-week prep/cook for Thursday delivery',
    Thursday: 'Pack & deliver mid-week orders',
    Friday: 'Weekly wrap-up, inventory audit, planning next week'
  }

  const daysOfWeek = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  return (
    <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Production Planning</h1>
          <p className="text-slate-600 mt-2">Week {summary.menu} • {summary.estimated_meals} meals • {summary.active_customers} customers</p>
        </div>
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="px-4 py-2 border-2 border-slate-300 rounded-lg bg-white font-bold text-slate-900 text-lg"
        >
          {WEEKS.map((week) => (
            <option key={week} value={week}>
              {week}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-slate-600 text-sm">Active Customers</p>
              <p className="text-2xl font-bold text-slate-900">{summary.active_customers}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-orange-600" />
            <div>
              <p className="text-slate-600 text-sm">Estimated Meals</p>
              <p className="text-2xl font-bold text-slate-900">{summary.estimated_meals}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-slate-600 text-sm">Recipes</p>
              <p className="text-2xl font-bold text-slate-900">{summary.recipes}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-purple-600" />
            <div>
              <p className="text-slate-600 text-sm">Procurement Cost</p>
              <p className="text-2xl font-bold text-slate-900">${procurement.total_cost || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-300 mb-6">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-6 py-3 font-bold text-lg transition ${
            activeTab === 'timeline'
              ? 'text-blue-700 border-b-4 border-blue-700'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          📅 7-Day Timeline
        </button>
        <button
          onClick={() => setActiveTab('procurement')}
          className={`px-6 py-3 font-bold text-lg transition ${
            activeTab === 'procurement'
              ? 'text-blue-700 border-b-4 border-blue-700'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          🛒 Procurement
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-6 py-3 font-bold text-lg transition ${
            activeTab === 'recipes'
              ? 'text-blue-700 border-b-4 border-blue-700'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          🍽️ Recipes
        </button>
      </div>

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {daysOfWeek.map((day) => {
            const dayRecipes = recipes.filter(r => r.day_of_week === day)
            const colorClass = dayColors[day as keyof typeof dayColors]
            const icon = dayIcons[day as keyof typeof dayIcons]
            const notes = dayNotes[day as keyof typeof dayNotes]

            return (
              <div key={day} className={`rounded-lg border-2 ${colorClass} p-6 shadow-md`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <span className="text-3xl">{icon}</span>
                      {day}
                    </h3>
                    <p className="text-slate-600 mt-1">{notes}</p>
                  </div>
                </div>

                {dayRecipes.length > 0 ? (
                  <div className="space-y-3 mt-4">
                    {dayRecipes.map((recipe, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-900 text-lg">{recipe.recipe_name}</p>
                            <p className="text-sm text-slate-600">Position {recipe.position || '-'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 italic mt-2">No production scheduled</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Procurement Tab */}
      {activeTab === 'procurement' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Suppliers: {procurement.suppliers || 0}
            </h3>
            <p className="text-slate-600 mb-6 text-lg font-bold">
              Total Cost: ${procurement.total_cost || 0}
            </p>

            {procurement.orders &&
              Object.entries(procurement.orders).map(([supplier, details]: any) => (
                <div key={supplier} className="border-t border-slate-200 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
                  <h4 className="font-bold text-slate-900 text-lg">{supplier}</h4>
                  <p className="text-slate-600 mt-2">
                    {details.items.length} items • ${details.total_cost}
                  </p>
                  <div className="mt-3 space-y-2">
                    {details.items.map((item: any, idx: number) => (
                      <div key={idx} className="text-sm text-slate-600 flex justify-between">
                        <span>{item.ingredient}</span>
                        <span>{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recipes Tab */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-2 gap-4">
          {recipes.map((recipe, idx) => (
            <div key={idx} className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
              <h4 className="font-bold text-slate-900 text-lg">{recipe.recipe_name}</h4>
              <p className="text-slate-600 mt-2">
                {recipe.day_of_week} • Position {recipe.position}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
