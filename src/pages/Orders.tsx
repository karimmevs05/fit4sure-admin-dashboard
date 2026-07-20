import React, { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Users,
  UtensilsCrossed,
  Search,
  Filter,
  ChevronDown,
  AlertCircle,
  Package,
} from 'lucide-react'
import WeeklyPrepPage from './WeeklyPrep'

type ThisWeekData = {
  week: string
  menu: Array<{ id: number; recipe_name: string; day_of_week: string; large_count?: number; regular_count?: number }>
  orders: Array<{ customer_id: number; name: string; dietary_restrictions?: string; total_meals_monday: number; total_meals_thursday: number; total_meals: number; breakfast?: number }>
  customers: Array<{ id: number; name: string }>
  summary: { totalMeals: number; mondayMeals: number; thursdayMeals: number; totalCustomers: number; breakfastMeals?: number }
}

type HistoryData = Array<{ week: string; totalMeals: number; customers: number; avgOrderSize: number }>

type InsightsData = {
  metrics: { avgMealsPerWeek: number; totalCustomers: number; totalWeeks: number; peakWeek: string; peakWeekMeals: number }
  topRecipes: Array<{ recipe_name: string; order_count: number }>
  topCustomers: Array<{ id: number; name: string; weeks_active: number; total_meals_ordered: number }>
}

type Tab = 'this-week' | 'history' | 'insights'

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('this-week')
  const [searchCustomer, setSearchCustomer] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [thisWeekData, setThisWeekData] = useState<ThisWeekData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryData>([])
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrepPage, setShowPrepPage] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchOrdersData()
  }, [])

  const fetchOrdersData = async () => {
    try {
      setLoading(true)
      const headers = { Authorization: `Bearer ${token}` }

      const [thisWeek, history, insights] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/orders/this-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/history`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/insights`, { headers }),
      ])

      setThisWeekData(thisWeek.data.data)
      setHistoryData(history.data.data)
      setInsightsData(insights.data.data)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  if (showPrepPage && thisWeekData) {
    return <WeeklyPrepPage week={thisWeekData.week} onBack={() => setShowPrepPage(false)} />
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      <div className="space-y-4 flex items-center justify-between">
        <button
          onClick={() => setShowPrepPage(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16813D] px-6 text-sm font-bold text-white shadow-[0_8px_18px_rgba(22,129,61,0.18)] transition hover:bg-[#0d6a2d] active:scale-[0.98]"
        >
          <UtensilsCrossed className="h-5 w-5" />
          View Weekly Prep
        </button>
      </div>

      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-[#D8CDBE]">
          <button
            onClick={() => setActiveTab('this-week')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'this-week'
                ? 'border-b-2 border-[#2E527F] text-[#2E527F]'
                : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            This Week's Orders
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'history'
                ? 'border-b-2 border-[#2E527F] text-[#2E527F]'
                : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Order History
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'insights'
                ? 'border-b-2 border-[#2E527F] text-[#2E527F]'
                : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Insights
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
            <p className="text-[#755B4C]">Loading orders data...</p>
          </div>
        ) : (
          <>
            {/* This Week's Orders Tab */}
            {activeTab === 'this-week' && thisWeekData && (
              <ThisWeekTab
                menu={thisWeekData.menu}
                orders={thisWeekData.orders}
                summary={thisWeekData.summary}
                searchCustomer={searchCustomer}
                setSearchCustomer={setSearchCustomer}
                selectedCustomer={selectedCustomer}
                setSelectedCustomer={setSelectedCustomer}
              />
            )}

            {/* Order History Tab */}
            {activeTab === 'history' && <HistoryTab history={historyData} />}

            {/* Insights Tab */}
            {activeTab === 'insights' && insightsData && <InsightsTab insights={insightsData} />}
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
        <UtensilsCrossed className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">Orders</h1>
        <p className="mt-1 text-sm text-[#755B4C]">
          Manage customer orders, track fulfillment, and analyze trends.
        </p>
      </div>
    </header>
  )
}

function ThisWeekTab({
  menu,
  orders,
  summary,
  searchCustomer,
  setSearchCustomer,
  selectedCustomer,
  setSelectedCustomer,
}: {
  menu: Array<{ id: number; recipe_name: string; day_of_week: string }>
  orders: Array<{ customer_id: number; name: string; dietary_restrictions?: string; total_meals_monday: number; total_meals_thursday: number; breakfast_meals?: number; total_meals: number }>
  summary: { totalMeals: number; mondayMeals: number; thursdayMeals: number; breakfastMeals?: number; totalCustomers: number }
  searchCustomer: string
  setSearchCustomer: (s: string) => void
  selectedCustomer: string | null
  setSelectedCustomer: (s: string | null) => void
}) {
  const filteredOrders = useMemo(() => {
    return orders.filter(
      (order) =>
        order.name.toLowerCase().includes(searchCustomer.toLowerCase()) &&
        (!selectedCustomer || order.name === selectedCustomer)
    )
  }, [orders, searchCustomer, selectedCustomer])

  const totalMeals = useMemo(
    () => filteredOrders.reduce((sum, order) => sum + order.total_meals + (order.breakfast_meals || 0), 0),
    [filteredOrders]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-[290px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4B2B1D]" />
          <input
            type="search"
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(e.target.value)}
            placeholder="Search customers..."
            className="h-12 w-full rounded-xl border border-[#B7A58F] bg-[#FBF7F0] pl-11 pr-4 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#8D7A69] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-[#16A34A] font-bold">Monday</p>
            <p className="text-lg font-extrabold text-[#16A34A]">{summary.mondayMeals}</p>
          </div>
          <div>
            <p className="text-xs text-[#D97706] font-bold">Thursday</p>
            <p className="text-lg font-extrabold text-[#D97706]">{summary.thursdayMeals}</p>
          </div>
          <div>
            <p className="text-xs text-[#0EA5E9] font-bold">Breakfast</p>
            <p className="text-lg font-extrabold text-[#0EA5E9]">{summary.breakfastMeals || 0}</p>
          </div>
          <div className="border-l border-[#D8CDBE] pl-6">
            <p className="text-sm font-bold text-[#4B2B1D]">
              Total: <span className="text-lg text-[#2E527F]">{totalMeals}</span>
            </p>
            <p className="text-xs text-[#755B4C]">{filteredOrders.length} customers</p>
          </div>
        </div>
      </div>

      {/* Menu Overview */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
        <h3 className="mb-3 font-bold text-[#4B2B1D]">This Week's Menu</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menu.map((recipe) => {
            const dayColor = recipe.day_of_week === 'Monday'
              ? 'bg-[#16A34A]'
              : recipe.day_of_week === 'Thursday'
              ? 'bg-[#D97706]'
              : recipe.day_of_week === 'Breakfast'
              ? 'bg-[#0EA5E9]'
              : 'bg-[#6B7280]';

            const regularCount = recipe.regular_count || 0;
            const largeCount = recipe.large_count || 0;
            const totalCount = regularCount + largeCount;

            return (
              <div key={recipe.id} className="rounded-lg border border-[#E4D8C9] bg-white p-3">
                <p className="font-semibold text-[#2E527F] text-sm">{recipe.recipe_name}</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${dayColor}`}>
                      {recipe.day_of_week}
                    </span>
                    <span className="text-lg font-extrabold text-[#2E527F]">{totalCount}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="flex-1 rounded-lg bg-[#F3F4F6] px-2 py-1 text-center text-xs font-bold text-[#4B2B1D]">
                      Regular: {regularCount}
                    </span>
                    <span className="flex-1 rounded-lg bg-[#FEF3E2] px-2 py-1 text-center text-xs font-bold text-[#D97706]">
                      Large: {largeCount}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer Orders */}
      <div className="space-y-2">
        <h3 className="font-bold text-[#4B2B1D]">Customer Orders</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Customer</th>
                <th className="px-4 py-3 text-center font-extrabold text-white bg-[#16A34A] rounded-t">Monday</th>
                <th className="px-4 py-3 text-center font-extrabold text-white bg-[#D97706] rounded-t">Thursday</th>
                <th className="px-4 py-3 text-center font-extrabold text-white bg-[#0EA5E9] rounded-t">Breakfast</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Total</th>
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.customer_id} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">{order.name}</td>
                  <td className="px-4 py-3 text-center font-semibold text-white bg-[#E8F5E9]">
                    <span className="bg-[#16A34A] text-white px-2 py-1 rounded">{order.total_meals_monday}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-white bg-[#FEF3E2]">
                    <span className="bg-[#D97706] text-white px-2 py-1 rounded">{order.total_meals_thursday}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-white bg-[#E0F2FE]">
                    <span className="bg-[#0EA5E9] text-white px-2 py-1 rounded">{order.breakfast_meals || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-[#2E527F]">{order.total_meals + (order.breakfast_meals || 0)}</td>
                  <td className="px-4 py-3 text-xs text-[#755B4C]">{order.dietary_restrictions || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            {history.map((week, idx) => (
              <tr key={idx} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
                <td className="px-4 py-3 font-medium text-[#4B2B1D]">{week.week}</td>
                <td className="px-4 py-3 text-center font-bold text-[#2E527F]">{week.totalMeals}</td>
                <td className="px-4 py-3 text-center text-[#755B4C]">{week.customers}</td>
                <td className="px-4 py-3 text-center text-[#755B4C]">{week.avgOrderSize.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InsightsTab({ insights }: { insights: InsightsData }) {
  const avgMealsPerWeek = insights.metrics.avgMealsPerWeek
  const totalCustomers = insights.metrics.totalCustomers
  const highestWeek = { week: insights.metrics.peakWeek, totalMeals: insights.metrics.peakWeekMeals }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Key Metrics */}
      <div className="space-y-3">
        <h3 className="font-bold text-[#4B2B1D]">Key Metrics</h3>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Avg Meals/Week</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{avgMealsPerWeek}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Active Customers</p>
              <p className="text-3xl font-extrabold text-[#2E527F]">{totalCustomers}</p>
            </div>
            <Users className="h-8 w-8 text-[#0EA5E9]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#755B4C]">Peak Week</p>
              <p className="text-2xl font-extrabold text-[#2E527F]">{highestWeek.totalMeals} meals</p>
              <p className="text-xs text-[#755B4C]">{highestWeek.week}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-[#D97706]" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <h4 className="mb-3 font-bold text-[#4B2B1D]">Top Recipes</h4>
          <div className="space-y-2">
            {insights.topRecipes.slice(0, 3).map((recipe, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-[#755B4C]">{recipe.recipe_name}</span>
                <span className="font-bold text-[#2E527F]">{recipe.order_count}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
          <h4 className="mb-3 font-bold text-[#4B2B1D]">Top Customers</h4>
          <div className="space-y-2">
            {insights.topCustomers.slice(0, 3).map((customer, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-[#755B4C]">{customer.name}</span>
                <span className="font-bold text-[#2E527F]">{customer.total_meals_ordered} meals</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insights & Recommendations */}
      <div className="space-y-3">
        <h3 className="font-bold text-[#4B2B1D]">Insights & Recommendations</h3>

        <div className="space-y-2">
          <InsightCard
            icon={<AlertCircle className="h-5 w-5" />}
            title="Inventory Planning"
            description="Peak weeks average 50+ meals. Stock 30% extra protein for Mondays."
            color="bg-[#FFF0E1]"
            textColor="text-[#DC6500]"
          />

          <InsightCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Growing Demand"
            description="Week-over-week growth: +8%. Consider adding 1 more menu option."
            color="bg-[#EAF5EC]"
            textColor="text-[#16834A]"
          />

          <InsightCard
            icon={<UtensilsCrossed className="h-5 w-5" />}
            title="Most Popular"
            description="Beef dishes account for 35% of all orders. Turkey is underutilized."
            color="bg-[#EAF5EC]"
            textColor="text-[#16834A]"
          />

          <InsightCard
            icon={<Package className="h-5 w-5" />}
            title="Packaging Alert"
            description="At current pace, you'll need ~600 32oz containers per week."
            color="bg-[#E8EEF5]"
            textColor="text-[#134DA1]"
          />
        </div>
      </div>
    </div>
  )
}

function InsightCard({
  icon,
  title,
  description,
  color,
  textColor,
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
  textColor: string
}) {
  return (
    <div className={`rounded-xl border border-[#CDBDA8] ${color} p-4`}>
      <div className={`flex items-start gap-3 ${textColor}`}>
        {icon}
        <div>
          <p className="font-bold text-sm">{title}</p>
          <p className="mt-0.5 text-xs opacity-90">{description}</p>
        </div>
      </div>
    </div>
  )
}
