import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart3, TrendingUp, Calendar, Users } from 'lucide-react'

type HistoryData = Array<{ week: string; totalMeals: number; customers: number; avgOrderSize: number }>

type InsightsData = {
  metrics: { avgMealsPerWeek: number; totalCustomers: number; totalWeeks: number; peakWeek: string | null; peakWeekMeals: number }
  topRecipes: Array<{ recipe_name: string; order_count: number }>
  topCustomers: Array<{ id: number; name: string; weeks_active: number; total_meals_ordered: number }>
}

type Tab = 'insights' | 'history'

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('insights')
  const [historyData, setHistoryData] = useState<HistoryData>([])
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const headers = { Authorization: `Bearer ${token}` }
      const [history, insights] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/orders/history`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/insights`, { headers }),
      ])
      setHistoryData(history.data.data || [])
      setInsightsData(insights.data.data || null)
    } catch (error) {
      console.error('Error fetching reports data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      <div className="space-y-4">
        <div className="flex gap-2 border-b border-[#D8CDBE]">
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'insights' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Insights
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'history' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Weekly History
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
            <p className="text-[#755B4C]">Loading reports...</p>
          </div>
        ) : (
          <>
            {activeTab === 'insights' && insightsData && <InsightsTab insights={insightsData} />}
            {activeTab === 'history' && <HistoryTab history={historyData} />}
          </>
        )}
      </div>
    </main>
  )
}

function Header() {
  return (
    <header className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[#FBF7F0] text-[#2E527F]">
        <BarChart3 className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">Reports</h1>
        <p className="mt-1 text-sm text-[#755B4C]">Order trends and top performers across every week on record.</p>
      </div>
    </header>
  )
}

function InsightsTab({ insights }: { insights: InsightsData }) {
  const { metrics, topRecipes, topCustomers } = insights

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="font-bold text-[#4B2B1D]">Key Metrics</h3>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Avg Meals/Week</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{metrics.avgMealsPerWeek}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16A34A]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Customers With Orders</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{metrics.totalCustomers}</p>
            </div>
            <Users className="h-8 w-8 text-[#0EA5E9]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Peak Week</p>
              <p className="text-2xl font-extrabold text-[#2E527F]">{metrics.peakWeekMeals} meals</p>
              <p className="text-xs text-[#755B4C]">
                {metrics.peakWeek ? new Date(metrics.peakWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-[#D97706]" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <h4 className="mb-3 font-bold text-[#4B2B1D]">Top Recipes (All Time)</h4>
          <div className="space-y-2">
            {topRecipes.length === 0 && <p className="text-sm text-[#9A7E6F]">No order data yet.</p>}
            {topRecipes.map((recipe, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-[#755B4C]">{recipe.recipe_name}</span>
                <span className="font-bold text-[#2E527F]">{recipe.order_count}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <h4 className="mb-3 font-bold text-[#4B2B1D]">Top Customers (All Time)</h4>
          <div className="space-y-2">
            {topCustomers.length === 0 && <p className="text-sm text-[#9A7E6F]">No order data yet.</p>}
            {topCustomers.map((customer, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-[#755B4C]">{customer.name}</span>
                <span className="font-bold text-[#2E527F]">{customer.total_meals_ordered} meals</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryTab({ history }: { history: HistoryData }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E4D8C9]">
              <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Week</th>
              <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Total Meals</th>
              <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Customers</th>
              <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Avg Order Size</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#9A7E6F]">
                  No weeks on record yet.
                </td>
              </tr>
            ) : (
              history.map((week, idx) => (
                <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">
                    {new Date(week.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-[#2E527F]">{week.totalMeals}</td>
                  <td className="px-4 py-3 text-center text-[#755B4C]">{week.customers}</td>
                  <td className="px-4 py-3 text-center text-[#755B4C]">{week.avgOrderSize.toFixed(1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
