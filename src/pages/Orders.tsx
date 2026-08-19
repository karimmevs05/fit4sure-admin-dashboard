import React, { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Users,
  UtensilsCrossed,
  Search,
  Upload,
  RefreshCw,
  Plus,
  X,
  Phone,
} from 'lucide-react'
import WeeklyPrepPage from './WeeklyPrep'
import { formatIngredientWeight } from '../utils/unitConversion'
import { sideCategoriesFor } from '../utils/plateStructure'

type OrderLine = {
  id: number
  customer_id: number
  customer_name: string
  dietary_restrictions: string | null
  address: string | null
  menu_id: number
  menu_name: string
  category: string | null
  quantity: number
  day_of_week: string | null
  total_price: number | null
  source: 'form' | 'manual'
  notes: string | null
  created_at: string
}

type MenuTotal = {
  id: number
  name: string
  category: string | null
  day_of_week: string | null
  regular_count: number
  large_count: number
  total_count: number
  revenue: number | null
  status: 'ready' | 'blocked' | 'unlinked'
}

type StockAlert = {
  ingredient: string
  category: string | null
  short_g: number
  affected: string[]
}

type Summary = {
  monday_meals: number
  thursday_meals: number
  breakfast_meals: number
  total_meals: number
  total_customers: number
  form_customers: number
  manual_customers: number
  monday_meals_last_week: number
  thursday_meals_last_week: number
  known_margin_pct: number | null
}

type NonResponder = {
  id: number
  name: string
}

type ThisWeekData = {
  orders: OrderLine[]
  menuTotals: MenuTotal[]
  summary: Summary
  alerts: StockAlert[]
  nonResponders: NonResponder[]
}

type HistoryData = Array<{ week: string; totalMeals: number; customers: number; avgOrderSize: number }>

type InsightsData = {
  metrics: { avgMealsPerWeek: number; totalCustomers: number; totalWeeks: number; peakWeek: string | null; peakWeekMeals: number }
  topRecipes: Array<{ recipe_name: string; order_count: number }>
  topCustomers: Array<{ id: number; name: string; weeks_active: number; total_meals_ordered: number }>
}

type Tab = 'this-week' | 'packing-sheet' | 'history' | 'insights'

type MenuFormat = {
  id: string
  label: string
  price: number
}

type RecipePlanItem = {
  recipeId: number
  name: string
  category: string
  formats: MenuFormat[]
}

const SIDE_CATEGORIES = ['carbohydrates', 'vegetables']
const SAUCE_CATEGORY = 'sauces'

// Mirrors orderingService.js on the backend -- sides and sauces are add-ons
// under a selected protein, each with their own "first is free, every one
// after is $2.50" allowance, tracked separately from each other. Unlike the
// public order page (where each protein card has its own allowance), this
// admin picker pools sides/sauces at the (day, format) level -- it already
// keyed cart entries that way before this add-on pricing existed, so that's
// the natural, minimal-change scope to price against here.
const SIDE_FORMAT = 'Included Side'
const SAUCE_ADDON_FORMAT = 'Sauce Add-On'
const ADD_ON_FORMATS = [SIDE_FORMAT, SAUCE_ADDON_FORMAT]
const ADD_ON_FREE_PRICE = 0
const ADD_ON_EXTRA_PRICE = 2.5
// Sides get 2 free per day before the $2.50 charge kicks in; sauces get 1.
const ADD_ON_FREE_COUNT: Record<string, number> = { [SIDE_FORMAT]: 2, [SAUCE_ADDON_FORMAT]: 1 }

type OrderItem = { mealName: string; category: string; quantity: string; dayOfWeek: string; price: number; notes: string }

type BreakfastItem = {
  id: number
  name: string
  price: number
}

type WeeklyMenu = {
  weekStart: string
  monday: RecipePlanItem[]
  thursday: RecipePlanItem[]
  breakfast: BreakfastItem[]
  menuReady: boolean
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('this-week')
  const [searchCustomer, setSearchCustomer] = useState('')
  const [thisWeekData, setThisWeekData] = useState<ThisWeekData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryData>([])
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrepPage, setShowPrepPage] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAddOrderModal, setShowAddOrderModal] = useState(false)
  const [prefillCustomer, setPrefillCustomer] = useState<NonResponder | null>(null)
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchOrdersData()

    // Keep this page current without a manual reload: refetch whenever the
    // tab regains focus/visibility, plus a background poll every 5 minutes
    // in case it's left open on a screen all day.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOrdersData({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const interval = setInterval(() => fetchOrdersData({ silent: true }), 5 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(interval)
    }
  }, [])

  const fetchOrdersData = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true)
      const headers = { Authorization: `Bearer ${token}` }

      const [thisWeek, history, insights, weeklyMenuRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/orders/this-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/history`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/insights`, { headers }),
        axios.get(`${apiUrl}/api/admin/orders/weekly-menu`, { headers }),
      ])

      setThisWeekData(thisWeek.data.data)
      setHistoryData(history.data.data)
      setInsightsData(insights.data.data)
      setWeeklyMenu(weeklyMenuRes.data.data)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // ISO date (YYYY-MM-DD) for the Sunday that starts "this week" -- same
  // Sunday-anchored boundary the backend uses everywhere (adminOrders.js,
  // adminPrep.js), so Weekly Prep always opens on the same week Orders is
  // already showing.
  const currentWeekStart = useMemo(() => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    const y = sunday.getFullYear()
    const m = String(sunday.getMonth() + 1).padStart(2, '0')
    const d = String(sunday.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  const deleteLine = async (line: OrderLine) => {
    if (!confirm(`Delete ${line.menu_name} × ${line.quantity} for ${line.customer_name}?`)) return
    try {
      await axios.delete(`${apiUrl}/api/admin/orders/${line.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchOrdersData()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete order')
    }
  }

  const syncNow = async () => {
    setSyncing(true)
    try {
      const response = await axios.post(
        `${apiUrl}/api/admin/orders/sync-google-sheets`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const { imported, duplicates, skipped } = response.data
      alert(
        `Sync complete: ${imported} new order lines` +
        (duplicates ? `, ${duplicates} already up to date` : '') +
        (skipped ? `, ${skipped} rows skipped (missing data)` : '')
      )
      fetchOrdersData()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to sync Google Sheets')
    } finally {
      setSyncing(false)
    }
  }

  if (showPrepPage) {
    return <WeeklyPrepPage week={currentWeekStart} onBack={() => setShowPrepPage(false)} />
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowPrepPage(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16813D] px-6 text-sm font-bold text-white shadow-[0_8px_18px_rgba(22,129,61,0.18)] transition hover:bg-[#0d6a2d] active:scale-[0.98]"
        >
          <UtensilsCrossed className="h-5 w-5" />
          View Weekly Prep
        </button>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2E527F] px-6 text-sm font-bold text-white shadow-[0_8px_18px_rgba(46,82,127,0.18)] transition hover:bg-[#24466E] active:scale-[0.98] disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#B9A88F] bg-[#FBF7F0] px-6 text-sm font-bold text-[#2E527F] transition hover:bg-[#EDF2F7]"
        >
          <Upload className="h-5 w-5" />
          Paste Import (fallback)
        </button>
        <button
          onClick={() => {
            setPrefillCustomer(null)
            setShowAddOrderModal(true)
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#B9A88F] bg-[#FBF7F0] px-6 text-sm font-bold text-[#2E527F] transition hover:bg-[#EDF2F7]"
        >
          <Plus className="h-5 w-5" />
          Add Manual Order
        </button>
      </div>

      {weeklyMenu && !weeklyMenu.menuReady && (
        <div className="rounded-2xl border border-[#F0C5B8] bg-[#FFF4F0] p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-[#B8571F]">
            ⚠️ Menu not fully built for the{' '}
            {new Date(weeklyMenu.weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} delivery week
            {weeklyMenu.monday.length === 0 && weeklyMenu.thursday.length === 0
              ? ' — no Monday or Thursday plates yet.'
              : weeklyMenu.monday.length === 0
              ? ' — no Monday plates yet.'
              : ' — no Thursday plates yet.'}
          </p>
          <Link
            to="/menu-planner"
            className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#2E527F] px-4 text-xs font-bold text-white transition hover:bg-[#24466E] flex-shrink-0"
          >
            Go to Menu Planner
          </Link>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex gap-2 border-b border-[#D8CDBE]">
          <button
            onClick={() => setActiveTab('this-week')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'this-week' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            This Week's Orders
          </button>
          <button
            onClick={() => setActiveTab('packing-sheet')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'packing-sheet' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Packing Sheet
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'history' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            Order History
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-3 text-sm font-extrabold transition ${
              activeTab === 'insights' ? 'border-b-2 border-[#2E527F] text-[#2E527F]' : 'text-[#755B4C] hover:text-[#4B2B1D]'
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
            {activeTab === 'this-week' && thisWeekData && (
              <ThisWeekTab
                data={thisWeekData}
                searchCustomer={searchCustomer}
                setSearchCustomer={setSearchCustomer}
                onAddOrderFor={(customer) => {
                  setPrefillCustomer(customer)
                  setShowAddOrderModal(true)
                }}
                onEditLine={(line) => setEditingLine(line)}
                onDeleteLine={deleteLine}
              />
            )}
            {activeTab === 'packing-sheet' && thisWeekData && <PackingSheetTab orders={thisWeekData.orders} />}
            {activeTab === 'history' && <HistoryTab history={historyData} />}
            {activeTab === 'insights' && insightsData && <InsightsTab insights={insightsData} />}
          </>
        )}
      </div>

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false)
            fetchOrdersData()
          }}
          apiUrl={apiUrl}
          token={token}
        />
      )}

      {showAddOrderModal && (
        <AddOrderModal
          prefillCustomer={prefillCustomer}
          onClose={() => setShowAddOrderModal(false)}
          onSaved={() => {
            setShowAddOrderModal(false)
            fetchOrdersData()
          }}
          apiUrl={apiUrl}
          token={token}
        />
      )}
      {editingLine && (
        <EditOrderLineModal
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => {
            setEditingLine(null)
            fetchOrdersData()
          }}
          apiUrl={apiUrl}
          token={token}
        />
      )}
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
          Every order lives here, whether the client filled the form or staff entered it after a text.
        </p>
      </div>
    </header>
  )
}

function ThisWeekTab({
  data,
  searchCustomer,
  setSearchCustomer,
  onAddOrderFor,
  onEditLine,
  onDeleteLine,
}: {
  data: ThisWeekData
  searchCustomer: string
  setSearchCustomer: (s: string) => void
  onAddOrderFor: (customer: NonResponder) => void
  onEditLine: (line: OrderLine) => void
  onDeleteLine: (line: OrderLine) => void
}) {
  const { orders, menuTotals, summary, alerts, nonResponders } = data

  const filteredOrders = useMemo(
    () => orders.filter((o) => o.customer_name.toLowerCase().includes(searchCustomer.toLowerCase())),
    [orders, searchCustomer]
  )

  // Group order lines by customer for a cleaner table
  const byCustomer = useMemo(() => {
    const map = new Map<number, { name: string; dietary_restrictions: string | null; address: string | null; lines: OrderLine[] }>()
    for (const o of filteredOrders) {
      if (!map.has(o.customer_id)) {
        map.set(o.customer_id, { name: o.customer_name, dietary_restrictions: o.dietary_restrictions, address: o.address, lines: [] })
      }
      map.get(o.customer_id)!.lines.push(o)
    }
    return Array.from(map.values())
  }, [filteredOrders])

  const mondayItems = menuTotals.filter((m) => m.day_of_week?.toLowerCase() === 'monday')
  const thursdayItems = menuTotals.filter((m) => m.day_of_week?.toLowerCase() === 'thursday')
  const otherItems = menuTotals.filter((m) => !['monday', 'thursday'].includes((m.day_of_week || '').toLowerCase()))

  const monDelta = summary.monday_meals - summary.monday_meals_last_week
  const thuDelta = summary.thursday_meals - summary.thursday_meals_last_week

  const statusBadge = (status: MenuTotal['status']) =>
    status === 'ready' ? (
      <span className="rounded-md bg-[#EAF5EC] px-2 py-0.5 text-[10px] font-bold text-[#16834A]">Ready</span>
    ) : status === 'blocked' ? (
      <span className="rounded-md bg-[#FDEBEC] px-2 py-0.5 text-[10px] font-bold text-[#D62F3D]">Blocked</span>
    ) : (
      <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold text-[#6B7280]">No recipe</span>
    )

  const PlateColumn = ({ label, color, items }: { label: string; color: string; items: MenuTotal[] }) => (
    <div className="rounded-xl border border-[#E4D8C9] bg-white p-3.5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[#9A7E6F] py-1">Nothing planned yet</p>
      ) : (
        items.map((m) => (
          <div key={`${m.id}-${m.day_of_week}`} className="border-b border-[#F0EAE0] py-1.5 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#4B2B1D]">{m.name}</span>
              {statusBadge(m.status)}
            </div>
            <p className="mt-0.5 text-[10.5px] text-[#9A7E6F]">
              {m.category || 'Uncategorized'} × {m.total_count}
              {m.regular_count > 0 || m.large_count > 0 ? ` — Reg ${m.regular_count} · Lg ${m.large_count}` : ''}
            </p>
          </div>
        ))
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Low-stock alerts, real ingredient need vs current stock for recipe-linked items */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.ingredient}
              className="flex items-center justify-between gap-4 rounded-lg border border-[#F0C5B8] bg-[#FFF4F0] px-3.5 py-2.5"
            >
              <span className="text-xs font-medium text-[#B8571F]">
                {a.ingredient} short {formatIngredientWeight(a.short_g, a.category)} — {a.affected.join(', ')}
              </span>
              <Link to="/inventory" className="shrink-0 text-[11px] font-bold text-[#B8571F] underline">
                Order more
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
            <p className="text-lg font-extrabold text-[#16A34A]">
              {summary.monday_meals}
              {monDelta !== 0 && (
                <span className="ml-1 text-[10px] font-semibold text-[#9A7E6F]">
                  {monDelta > 0 ? `↑${monDelta}` : `↓${Math.abs(monDelta)}`}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#D97706] font-bold">Thursday</p>
            <p className="text-lg font-extrabold text-[#D97706]">
              {summary.thursday_meals}
              {thuDelta !== 0 && (
                <span className="ml-1 text-[10px] font-semibold text-[#9A7E6F]">
                  {thuDelta > 0 ? `↑${thuDelta}` : `↓${Math.abs(thuDelta)}`}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#0EA5E9] font-bold">Breakfast</p>
            <p className="text-lg font-extrabold text-[#0EA5E9]">{summary.breakfast_meals}</p>
          </div>
          <div className="border-l border-[#D8CDBE] pl-6">
            <p className="text-xs font-bold text-[#755B4C]">Margin</p>
            <p className="text-lg font-extrabold text-[#2E527F]">
              {summary.known_margin_pct != null ? `${summary.known_margin_pct}%` : '—'}
            </p>
            {summary.known_margin_pct != null && <p className="text-[10px] text-[#9A7E6F]">recipe-linked items only</p>}
          </div>
          <div className="border-l border-[#D8CDBE] pl-6">
            <p className="text-sm font-bold text-[#4B2B1D]">
              Total: <span className="text-lg text-[#2E527F]">{summary.total_meals}</span>
            </p>
            <p className="text-xs text-[#755B4C]">{summary.total_customers} customers</p>
          </div>
        </div>
      </div>

      {/* Form vs Manual breakdown */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#16A34A]"></span>
          <p className="text-sm text-[#4B2B1D]">
            <span className="font-extrabold">{summary.form_customers}</span> self-submitted via Form
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#D97706]"></span>
          <p className="text-sm text-[#4B2B1D]">
            <span className="font-extrabold">{summary.manual_customers}</span> entered manually by staff
          </p>
        </div>
      </div>

      {/* Non-Responders Worklist */}
      {nonResponders.length > 0 && (
        <div className="rounded-xl border border-[#E4D8C9] bg-[#FBF7F0]">
          <p className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#9A8774]">
            <Phone className="h-3 w-3" />
            Needs Follow-Up ({nonResponders.length})
          </p>
          <div className="border-t border-[#E4D8C9]">
            {nonResponders.map((customer, idx) => (
              <div
                key={customer.id}
                className={`flex items-center justify-between px-4 py-1.5 ${idx > 0 ? 'border-t border-[#F0EAE0]' : ''}`}
              >
                <p className="text-xs text-[#4B2B1D]">{customer.name}</p>
                <button
                  onClick={() => onAddOrderFor(customer)}
                  className="text-xs font-semibold text-[#2E527F] hover:underline"
                >
                  + Add New Order
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plates by day */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
        <h3 className="mb-3 font-bold text-[#4B2B1D]">Plates by day</h3>
        {menuTotals.length === 0 ? (
          <p className="text-sm text-[#9A7E6F]">No orders yet this week.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlateColumn label="Monday" color="#16A34A" items={mondayItems} />
              <PlateColumn label="Thursday" color="#D97706" items={thursdayItems} />
            </div>
            {otherItems.length > 0 && (
              <div className="mt-3">
                <PlateColumn label="Other (breakfast / unassigned)" color="#0EA5E9" items={otherItems} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Individual Orders */}
      <div className="space-y-2">
        <h3 className="font-bold text-[#4B2B1D]">Individual orders</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9] bg-[#F8F2E8]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Customer</th>
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Plates</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Area</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Payment</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Source</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((c) => (
                <tr key={c.name} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition align-top">
                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">
                    {c.name}
                    {c.dietary_restrictions && (
                      <div className="mt-0.5 text-[10px] font-bold text-[#D62F3D]">⚠ {c.dietary_restrictions}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#755B4C]">
                    {c.lines.map((l) => (
                      <div key={l.id} className="text-xs flex items-center gap-2 py-0.5">
                        <span>
                          {l.menu_name} × {l.quantity} {l.day_of_week ? `(${l.day_of_week})` : ''}
                        </span>
                        <button onClick={() => onEditLine(l)} className="text-[#2E527F] hover:underline font-bold">
                          Edit
                        </button>
                        <button onClick={() => onDeleteLine(l)} className="text-[#D62F3D] hover:underline font-bold">
                          Delete
                        </button>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-[#755B4C] max-w-[160px] truncate" title={c.address || undefined}>
                    {c.address || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7280]">Not tracked yet</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold text-white ${
                        c.lines[0]?.source === 'form' ? 'bg-[#16A34A]' : 'bg-[#D97706]'
                      }`}
                    >
                      {c.lines[0]?.source === 'form' ? 'Order page' : 'Staff entry'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PackingSheetTab({ orders }: { orders: OrderLine[] }) {
  const CATEGORY_ORDER = ['Regular', 'Large', 'High Protein', 'Low Carb', '1 Pound', 'Breakfast', 'By The LB']

  // Unique dishes, grouped by category in a consistent order
  const dishes = useMemo(() => {
    const seen = new Map<string, { menu_id: number; name: string; category: string }>()
    for (const o of orders) {
      const key = `${o.menu_id}`
      if (!seen.has(key)) seen.set(key, { menu_id: o.menu_id, name: o.menu_name, category: o.category || 'Other' })
    }
    return Array.from(seen.values()).sort((a, b) => {
      const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
      if (catDiff !== 0) return catDiff
      return a.name.localeCompare(b.name)
    })
  }, [orders])

  // Unique clients, alphabetical
  const clients = useMemo(() => {
    const seen = new Map<number, string>()
    for (const o of orders) seen.set(o.customer_id, o.customer_name)
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [orders])

  // quantity lookup: customer_id -> menu_id -> qty
  const grid = useMemo(() => {
    const map = new Map<number, Map<number, number>>()
    for (const o of orders) {
      if (!map.has(o.customer_id)) map.set(o.customer_id, new Map())
      const row = map.get(o.customer_id)!
      row.set(o.menu_id, (row.get(o.menu_id) || 0) + o.quantity)
    }
    return map
  }, [orders])

  // Column totals
  const columnTotals = useMemo(() => {
    const totals = new Map<number, number>()
    for (const o of orders) totals.set(o.menu_id, (totals.get(o.menu_id) || 0) + o.quantity)
    return totals
  }, [orders])

  // Delivery split by day x category
  const deliverySplit = useMemo(() => {
    const split: Record<string, Record<string, number>> = { monday: {}, thursday: {} }
    for (const day of ['monday', 'thursday']) {
      for (const cat of CATEGORY_ORDER) split[day][cat] = 0
    }
    for (const o of orders) {
      const day = (o.day_of_week || '').toLowerCase()
      const cat = o.category || 'Other'
      if (split[day] && cat in split[day]) split[day][cat] += o.quantity
    }
    return split
  }, [orders])

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
        <p className="text-[#755B4C]">No orders yet this week.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#2E527F] text-white px-3 py-2 text-left font-extrabold z-10">Client</th>
              {dishes.map((d) => (
                <th key={d.menu_id} className="px-2 py-2 text-center font-bold text-white bg-[#2E527F] border-l border-[#3E6594] min-w-[90px]">
                  <div className="truncate max-w-[100px]" title={d.name}>{d.name}</div>
                  <div className="text-[9px] font-normal opacity-80">{d.category}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-center font-extrabold text-white bg-[#16813D] border-l border-[#3E6594]">Total</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, idx) => {
              const row = grid.get(c.id)
              const rowTotal = row ? Array.from(row.values()).reduce((a, b) => a + b, 0) : 0
              return (
                <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8F2E8]'}>
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-semibold text-[#4B2B1D] border-b border-[#E4D8C9]">
                    {c.name}
                  </td>
                  {dishes.map((d) => (
                    <td key={d.menu_id} className="px-2 py-2 text-center text-[#4B2B1D] border-b border-l border-[#E4D8C9]">
                      {row?.get(d.menu_id) || 0}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-extrabold text-[#16813D] bg-[#EAF5EC] border-b border-l border-[#E4D8C9]">
                    {rowTotal}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-[#E4D8C9]">
              <td className="sticky left-0 bg-[#E4D8C9] px-3 py-2 font-extrabold text-[#4B2B1D]">Total</td>
              {dishes.map((d) => (
                <td key={d.menu_id} className="px-2 py-2 text-center font-extrabold text-[#4B2B1D] border-l border-[#D8CDBE]">
                  {columnTotals.get(d.menu_id) || 0}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-extrabold text-white bg-[#16813D] border-l border-[#D8CDBE]">
                {Array.from(columnTotals.values()).reduce((a, b) => a + b, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 font-bold text-[#4B2B1D]">Delivery Split By Category</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Delivery Day</th>
                {CATEGORY_ORDER.map((cat) => (
                  <th key={cat} className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">{cat}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['monday', 'thursday'].map((day) => (
                <tr key={day} className="border-b border-[#E4D8C9]">
                  <td className="px-4 py-3 font-semibold text-[#4B2B1D] capitalize">{day}</td>
                  {CATEGORY_ORDER.map((cat) => (
                    <td key={cat} className="px-4 py-3 text-center text-[#755B4C]">{deliverySplit[day][cat]}</td>
                  ))}
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
                <td className="px-4 py-3 font-medium text-[#4B2B1D]">
                  {new Date(week.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                </td>
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
            <TrendingUp className="h-8 w-8 text-[#16813D]" />
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
                {metrics.peakWeek ? new Date(metrics.peakWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'N/A'}
              </p>
            </div>
            <BarChart3 className="h-8 w-8 text-[#D97706]" />
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

function ImportModal({
  onClose,
  onImported,
  apiUrl,
  token,
}: {
  onClose: () => void
  onImported: () => void
  apiUrl: string
  token: string | null
}) {
  const [pastedData, setPastedData] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    // Expects tab-separated rows copied straight from the Order_Details sheet:
    // Timestamp, Client, Category, Meal Name, Qty, Notes
    const lines = pastedData.trim().split('\n').filter((l) => l.trim())
    const rows = []
    for (const line of lines) {
      const cols = line.split('\t')
      if (cols.length < 5) continue
      const [timestamp, client, category, mealName, qty, notes] = cols
      if (!client || !mealName || !qty) continue
      rows.push({
        timestamp: timestamp?.trim(),
        client: client.trim(),
        category: category?.trim(),
        mealName: mealName.trim(),
        qty: qty.trim(),
        notes: notes?.trim(),
      })
    }

    if (rows.length === 0) {
      setError('No valid rows found. Paste the Order_Details sheet columns: Timestamp, Client, Category, Meal Name, Qty, Notes')
      return
    }

    setSubmitting(true)
    try {
      const response = await axios.post(
        `${apiUrl}/api/admin/orders/import`,
        { rows },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      alert(
        `Imported ${response.data.imported} new order lines` +
        (response.data.duplicates ? ` (${response.data.duplicates} already imported, skipped)` : '') +
        (response.data.skipped ? ` (${response.data.skipped} rows missing data)` : '')
      )
      onImported()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button onClick={onClose} className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-[#F8F2E8] p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-[#4B2B1D]">Import Form Responses</h2>
            <button onClick={onClose} className="rounded-lg border border-[#B9A88F] p-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-[#755B4C] mb-3">
            Paste the rows from your Order_Details sheet (Timestamp, Client, Category, Meal Name, Qty, Notes) --
            copy directly from Google Sheets, tab-separated is fine.
          </p>
          <textarea
            value={pastedData}
            onChange={(e) => setPastedData(e.target.value)}
            rows={10}
            placeholder="Paste rows here..."
            className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2 text-xs font-mono text-[#4B2B1D] outline-none focus:border-[#3E6594]"
          />
          {error && <p className="mt-2 text-xs text-[#D62F3D]">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting}
            className="mt-4 w-full h-11 rounded-xl bg-[#2E527F] text-sm font-extrabold text-white hover:bg-[#24466E] disabled:opacity-50"
          >
            {submitting ? 'Importing...' : 'Import Rows'}
          </button>
        </div>
      </div>
    </>
  )
}

function EditOrderLineModal({
  line,
  onClose,
  onSaved,
  apiUrl,
  token,
}: {
  line: OrderLine
  onClose: () => void
  onSaved: () => void
  apiUrl: string
  token: string | null
}) {
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [dayOfWeek, setDayOfWeek] = useState(line.day_of_week || '')
  const [notes, setNotes] = useState(line.notes || '')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      await axios.put(
        `${apiUrl}/api/admin/orders/${line.id}`,
        { quantity: parseFloat(quantity), dayOfWeek: dayOfWeek || null, notes: notes || null },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      onSaved()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button onClick={onClose} className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#F8F2E8] p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-[#4B2B1D]">Edit Order</h2>
              <p className="text-xs text-[#755B4C] mt-0.5">{line.customer_name} — {line.menu_name}</p>
            </div>
            <button onClick={onClose} className="rounded-lg border border-[#B9A88F] p-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#B9A88F] bg-white px-3 text-sm text-[#4B2B1D] outline-none mb-3"
          />

          <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Delivery Day</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="w-full h-10 rounded-lg border border-[#B9A88F] bg-white px-3 text-sm text-[#4B2B1D] outline-none mb-3"
          >
            <option value="">Unassigned</option>
            <option value="monday">Monday</option>
            <option value="thursday">Thursday</option>
          </select>

          <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none mb-4"
          />

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-[#2E527F] text-sm font-extrabold text-white hover:bg-[#24466E] disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

function AddOrderModal({
  prefillCustomer,
  onClose,
  onSaved,
  apiUrl,
  token,
}: {
  prefillCustomer: NonResponder | null
  onClose: () => void
  onSaved: () => void
  apiUrl: string
  token: string | null
}) {
  const [customerName, setCustomerName] = useState(prefillCustomer?.name || '')
  // Deliberately not pre-filling from prefillCustomer.lastOrder -- showing an
  // old order (often for meals not even on this week's menu) next to the
  // live picker read as confusing clutter. Always start empty; build the
  // order by tapping this week's actual plates.
  const [items, setItems] = useState<OrderItem[]>([])
  const [notes, setNotes] = useState('')
  // Which single protein card (keyed "day::recipeId") is expanded -- same
  // "one open at a time" behavior as the client ordering page, so staff
  // build one plate at a time instead of a wall of always-open cards.
  const [openProteinKey, setOpenProteinKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [openDay, setOpenDay] = useState<'monday' | 'thursday' | 'breakfast' | null>('monday')
  const [reviewOpen, setReviewOpen] = useState(false)

  const orderTotal = items.reduce((sum, it) => sum + it.price * (parseFloat(it.quantity) || 0), 0)
  const orderCount = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0)

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await axios.get(`${apiUrl}/api/admin/orders/weekly-menu`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setWeeklyMenu(res.data.data)
      } catch (err) {
        console.error('Failed to load weekly menu', err)
      } finally {
        setLoadingMenu(false)
      }
    }
    fetchMenu()
  }, [])

  // Confirms a plate into the order -- called from a protein card's "Add"
  // button once staff has finished building it (format, sides, sauces,
  // notes, qty), matching the client page's "build then confirm" flow
  // instead of committing on every tap.
  const addFromMenu = (mealName: string, category: string, dayOfWeek: string, price: number, qty: number = 1, itemNotes: string = '') => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.mealName === mealName && it.category === category && it.dayOfWeek === dayOfWeek)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: String((parseFloat(next[idx].quantity) || 0) + qty) }
        return next
      }
      return [...prev, { mealName, category, quantity: String(qty), dayOfWeek, price, notes: itemNotes }]
    })
  }

  // Re-derive each add-on line's price from its position among same-day,
  // same-format add-on lines -- so removing the free one promotes whichever
  // line is left to free, instead of leaving a stale $2.50 everywhere.
  const repriceAddOns = (list: OrderItem[], category: string, dayOfWeek: string) => {
    const freeCount = ADD_ON_FREE_COUNT[category] ?? 1
    let seen = 0
    return list.map((it) => {
      if (it.category !== category || it.dayOfWeek !== dayOfWeek) return it
      const price = seen < freeCount ? ADD_ON_FREE_PRICE : ADD_ON_EXTRA_PRICE
      seen += 1
      return { ...it, price }
    })
  }

  // Sides/sauces are boolean add-ons (tap to add, tap again to remove) --
  // never quantity-stepped -- so each line's price stays a single clean
  // $0 or $2.50 the backend can trust, same contract as the public page.
  const toggleAddOn = (mealName: string, category: string, dayOfWeek: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.mealName === mealName && it.category === category && it.dayOfWeek === dayOfWeek)
      const next = idx >= 0 ? prev.filter((_, i) => i !== idx) : [...prev, { mealName, category, quantity: '1', dayOfWeek, price: 0, notes: '' }]
      return repriceAddOns(next, category, dayOfWeek)
    })
  }

  const addManualItem = () => setItems([...items, { mealName: '', category: 'Regular', quantity: '1', dayOfWeek: '', price: 0, notes: '' }])
  const removeItem = (idx: number) => {
    setItems((prev) => {
      const target = prev[idx]
      const next = prev.filter((_, i) => i !== idx)
      if (target && ADD_ON_FORMATS.includes(target.category)) return repriceAddOns(next, target.category, target.dayOfWeek)
      return next
    })
  }
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }
  const bumpQty = (idx: number, delta: number) => {
    setItems(
      items.map((it, i) => {
        if (i !== idx) return it
        const next = (parseFloat(it.quantity) || 0) + delta
        return next <= 0 ? it : { ...it, quantity: String(next) }
      })
    )
  }

  const submit = async () => {
    if (!customerName.trim()) {
      alert('Customer name is required')
      return
    }
    setSubmitting(true)
    try {
      for (const item of items) {
        if (!item.mealName.trim() || !item.quantity) continue
        await axios.post(
          `${apiUrl}/api/admin/orders`,
          {
            customerId: prefillCustomer?.id,
            customerName: customerName.trim(),
            mealName: item.mealName.trim(),
            category: item.category,
            quantity: parseFloat(item.quantity),
            dayOfWeek: item.dayOfWeek || null,
            notes: item.notes || notes || null,
            price: ADD_ON_FORMATS.includes(item.category) ? item.price : undefined,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
      onSaved()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save order')
    } finally {
      setSubmitting(false)
    }
  }

  // Same tap-to-add-count-badge idea the client page uses: show how many of
  // this exact (name, format, day) combo are already in the cart, right on
  // the format chip, instead of making staff scroll down to check.
  const qtyInCart = (mealName: string, category: string, dayOfWeek: string) =>
    items.find((it) => it.mealName === mealName && it.category === category && it.dayOfWeek === dayOfWeek)?.quantity

  const namedItems = items.filter((it) => it.mealName)
  const manualItems = items.map((it, idx) => ({ ...it, idx })).filter((it) => !it.mealName)

  return (
    <>
      <button onClick={onClose} className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#EFE3D0] shadow-2xl" style={{ maxHeight: '90vh' }}>
          {/* Header -- same layout as the client ordering page's header */}
          <div className="flex flex-shrink-0 items-center justify-between rounded-b-2xl bg-[#FBF5EA] border-b border-[#DDC9A8] px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/order/logo.png" alt="" className="h-8 w-8 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#3B2A1E] leading-tight">This Week's Menu</p>
                <p className="text-[10px] text-[#9C8C77] leading-tight">Building this order as staff, same menu the client sees</p>
              </div>
            </div>
            <button onClick={onClose} className="flex-shrink-0 text-[#6B5842] hover:text-[#3B2A1E]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable menu content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="rounded-xl border border-[#DDC9A8] bg-[#FBF5EA] px-3 py-2.5">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-[#9C8C77] mb-1">Customer</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={!!prefillCustomer}
                placeholder="Full name"
                className="w-full h-8 rounded-lg border border-[#DDC9A8] bg-white px-2.5 text-sm text-[#3B2A1E] outline-none disabled:opacity-60 focus:border-[#3D5A78]"
              />
            </div>

            {loadingMenu ? (
              <p className="text-xs text-[#9C8C77] px-1">Loading menu...</p>
            ) : !weeklyMenu || (weeklyMenu.monday.length === 0 && weeklyMenu.thursday.length === 0 && weeklyMenu.breakfast.length === 0) ? (
              <p className="text-xs text-[#9C8C77] px-1">
                No plates built for this week yet in Menu Planner — use "add an item not on the menu" below.
              </p>
            ) : (
              <>
                {(['monday', 'thursday'] as const).map((day) =>
                  weeklyMenu[day].length === 0 ? null : (
                    <div key={day} className="rounded-xl border border-[#DDC9A8] bg-[#FBF5EA] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenDay(openDay === day ? null : day)}
                        className="flex w-full items-center justify-between px-3 py-2.5"
                      >
                        <span className="text-xs font-bold uppercase tracking-wide text-[#3B2A1E]">{day} Delivery</span>
                        <span className={`text-[#3D5A78] transition-transform ${openDay === day ? 'rotate-90' : ''}`}>›</span>
                      </button>
                      {openDay === day && (
                        <div className="px-3 pb-3 space-y-2">
                          {/* Carbs/veggies/sauces are add-ons, not their own orderable
                              plate -- surfaced inside each protein's own expanded card
                              (see ProteinCard) once a format is picked there. */}
                          {weeklyMenu[day].filter((recipe) => !SIDE_CATEGORIES.includes(recipe.category) && recipe.category !== SAUCE_CATEGORY).map((recipe) => (
                            <ProteinCard
                              key={recipe.recipeId}
                              recipe={recipe}
                              day={day}
                              daySides={weeklyMenu[day].filter((r) => SIDE_CATEGORIES.includes(r.category))}
                              daySauces={weeklyMenu[day].filter((r) => r.category === SAUCE_CATEGORY)}
                              items={items}
                              qtyInCart={qtyInCart}
                              addFromMenu={addFromMenu}
                              toggleAddOn={toggleAddOn}
                              isOpen={openProteinKey === `${day}::${recipe.recipeId}`}
                              onToggleOpen={() =>
                                setOpenProteinKey((k) => (k === `${day}::${recipe.recipeId}` ? null : `${day}::${recipe.recipeId}`))
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}

                {weeklyMenu.breakfast.length > 0 && (
                  <div className="rounded-xl border border-[#DDC9A8] bg-[#FBF5EA] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenDay(openDay === 'breakfast' ? null : 'breakfast')}
                      className="flex w-full items-center justify-between px-3 py-2.5"
                    >
                      <span className="text-xs font-bold uppercase tracking-wide text-[#3B2A1E]">Breakfast</span>
                      <span className={`text-[#3D5A78] transition-transform ${openDay === 'breakfast' ? 'rotate-90' : ''}`}>›</span>
                    </button>
                    {openDay === 'breakfast' && (
                      <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
                        {weeklyMenu.breakfast.map((item) => {
                          const inCart = qtyInCart(item.name, 'Breakfast', '')
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => addFromMenu(item.name, 'Breakfast', '', Number(item.price))}
                              className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition ${
                                inCart ? 'bg-[#3D5A78] text-white' : 'bg-white border border-[#DDC9A8] text-[#3B2A1E] hover:bg-[#F5EFE0]'
                              }`}
                            >
                              <span className="block truncate">{item.name}</span>
                              <span className="block opacity-80">
                                ${Number(item.price).toFixed(2)}
                                {inCart && <span className="ml-1 font-bold">×{inCart}</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <button type="button" onClick={addManualItem} className="text-[11px] font-semibold text-[#3D5A78] hover:underline px-1">
              + add an item not on the menu
            </button>

            {manualItems.length > 0 && (
              <div className="space-y-1.5">
                {manualItems.map(({ idx, mealName, category, quantity, dayOfWeek }) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                    <input
                      value={mealName}
                      onChange={(e) => updateItem(idx, 'mealName', e.target.value)}
                      placeholder="Meal name"
                      className="col-span-5 h-8 rounded-lg border border-[#DDC9A8] bg-white px-2 text-xs text-[#3B2A1E] outline-none"
                    />
                    <select
                      value={category}
                      onChange={(e) => updateItem(idx, 'category', e.target.value)}
                      className="col-span-3 h-8 rounded-lg border border-[#DDC9A8] bg-white px-1 text-xs text-[#3B2A1E] outline-none"
                    >
                      <option value="Regular">Regular</option>
                      <option value="Large">Large</option>
                      <option value="Breakfast">Breakfast</option>
                      <option value="By The LB">By The LB</option>
                    </select>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="col-span-2 h-8 rounded-lg border border-[#DDC9A8] bg-white px-2 text-xs text-[#3B2A1E] outline-none"
                    />
                    <select
                      value={dayOfWeek}
                      onChange={(e) => updateItem(idx, 'dayOfWeek', e.target.value)}
                      className="col-span-1 h-8 rounded-lg border border-[#DDC9A8] bg-white px-1 text-xs text-[#3B2A1E] outline-none"
                    >
                      <option value="">-</option>
                      <option value="monday">Mon</option>
                      <option value="thursday">Thu</option>
                    </select>
                    <button onClick={() => removeItem(idx)} className="col-span-1 text-[#B0242F] text-xs">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {reviewOpen && (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#9C8C77] mb-1">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Allergies, substitutions, anything the kitchen should know"
                  className="w-full rounded-lg border border-[#DDC9A8] bg-white px-3 py-2 text-sm text-[#3B2A1E] outline-none"
                />
              </label>
            )}
          </div>

          {/* Sticky order bar -- same shape as the client page's bottom bar */}
          <div className="flex-shrink-0 rounded-t-2xl bg-[#FBF5EA] border-t border-[#DDC9A8] px-4 pt-2.5 pb-3">
            {reviewOpen && (
              <div className="max-h-32 overflow-y-auto mb-2 space-y-1 border-b border-[#DDC9A8] pb-2">
                {namedItems.length === 0 ? (
                  <p className="text-[11px] text-[#9C8C77] text-center py-1">Nothing added yet</p>
                ) : (
                  items.map((item, idx) =>
                    !item.mealName ? null : (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[#3B2A1E] truncate">
                          {item.mealName} <span className="text-[#9C8C77]">({item.category}{item.dayOfWeek ? `, ${item.dayOfWeek}` : ''})</span>
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Sides/sauces are boolean add-ons, not quantity-stepped --
                              a stray + here would break the single $0/$2.50 price the
                              backend trusts per line, so just offer remove. */}
                          {ADD_ON_FORMATS.includes(item.category) ? (
                            <span className="text-[11px] text-[#9C8C77]">{item.price === ADD_ON_FREE_PRICE ? 'Free' : `+$${item.price.toFixed(2)}`}</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => bumpQty(idx, -1)} className="h-5 w-5 rounded border border-[#DDC9A8] text-[11px] font-bold text-[#3B2A1E]">
                                −
                              </button>
                              <span className="w-4 text-center text-[11px] font-bold text-[#3B2A1E]">{item.quantity}</span>
                              <button type="button" onClick={() => bumpQty(idx, 1)} className="h-5 w-5 rounded border border-[#DDC9A8] text-[11px] font-bold text-[#3B2A1E]">
                                +
                              </button>
                            </>
                          )}
                          <button onClick={() => removeItem(idx)} className="text-[#B0242F] text-[11px] ml-0.5">
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setReviewOpen((v) => !v)}
              className="flex w-full items-center justify-between mb-2"
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9C8C77]">
                {orderCount} item{orderCount === 1 ? '' : 's'}
                <span className={`inline-block ml-1 transition-transform ${reviewOpen ? 'rotate-180' : ''}`}>▾</span>
              </span>
              <span className="text-lg font-bold text-[#3B2A1E]">${orderTotal.toFixed(2)}</span>
            </button>
            <button
              onClick={submit}
              disabled={submitting || items.length === 0 || !customerName.trim()}
              className="w-full h-10 rounded-full bg-[#E3922E] text-xs font-bold uppercase tracking-wide text-white hover:bg-[#C97C1E] disabled:opacity-50 transition"
            >
              {submitting ? 'Saving...' : 'Submit Order'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// A single protein, collapsed to a name + status row by default -- tap to
// expand a detail panel (format, sides, sauces, notes, qty), then "Add to
// Order" to confirm the plate into the cart. Mirrors the client ordering
// page's "build, then confirm" flow instead of committing on every tap, so
// staff get the same experience customers do.
function ProteinCard({
  recipe,
  day,
  daySides,
  daySauces,
  items,
  qtyInCart,
  addFromMenu,
  toggleAddOn,
  isOpen,
  onToggleOpen,
}: {
  recipe: RecipePlanItem
  day: string
  daySides: RecipePlanItem[]
  daySauces: RecipePlanItem[]
  items: OrderItem[]
  qtyInCart: (mealName: string, category: string, dayOfWeek: string) => string | undefined
  addFromMenu: (mealName: string, category: string, dayOfWeek: string, price: number, qty?: number, itemNotes?: string) => void
  toggleAddOn: (mealName: string, category: string, dayOfWeek: string) => void
  isOpen: boolean
  onToggleOpen: () => void
}) {
  const [selectedFormat, setSelectedFormat] = useState<MenuFormat | null>(null)
  const [qty, setQty] = useState(1)
  const [cardNotes, setCardNotes] = useState('')

  // Which side categories actually belong on this plate depends on the
  // selected format -- Low Carb has no carbs serving, High Protein has no
  // veggies serving, By the Pound has neither.
  const allowedSides = sideCategoriesFor(selectedFormat ? [selectedFormat.label] : [])
  const sidesForFormat = daySides.filter(
    (r) => (r.category === 'carbohydrates' && allowedSides.carbs) || (r.category === 'vegetables' && allowedSides.veggies)
  )
  const sideUnitsThisDay = items.filter((it) => it.category === SIDE_FORMAT && it.dayOfWeek === day).length
  const sauceUnitsThisDay = items.filter((it) => it.category === SAUCE_ADDON_FORMAT && it.dayOfWeek === day).length

  const totalAdded = items
    .filter((it) => it.mealName === recipe.name && it.dayOfWeek === day && !ADD_ON_FORMATS.includes(it.category))
    .reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0)

  const handleAdd = () => {
    if (!selectedFormat) return
    addFromMenu(recipe.name, selectedFormat.label, day, selectedFormat.price, qty, cardNotes.trim())
    setSelectedFormat(null)
    setQty(1)
    setCardNotes('')
    onToggleOpen()
  }

  const addOnPriceLabel = (name: string, category: string, unitsThisDay: number) => {
    const inCart = !!qtyInCart(name, category, day)
    if (inCart) {
      const existing = items.find((it) => it.mealName === name && it.category === category && it.dayOfWeek === day)
      return existing?.price === ADD_ON_FREE_PRICE ? 'Free' : `+$${ADD_ON_EXTRA_PRICE.toFixed(2)}`
    }
    return unitsThisDay < ADD_ON_FREE_COUNT[category] ? 'Free' : `+$${ADD_ON_EXTRA_PRICE.toFixed(2)}`
  }

  return (
    <div className={`rounded-lg border bg-white overflow-hidden transition ${isOpen ? 'border-[#3D5A78]' : 'border-[#DDC9A8]'}`}>
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between gap-2 p-2.5 text-left">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-tight text-[#3B2A1E] truncate" title={recipe.name}>
            {recipe.name}
          </p>
          <p className={`text-[10px] mt-0.5 ${totalAdded > 0 ? 'font-bold text-[#3D5A78]' : 'text-[#9C8C77]'}`}>
            {totalAdded > 0 ? `✓ Added ×${totalAdded}` : 'Tap to build plate'}
          </p>
        </div>
        <span className={`flex-shrink-0 text-[#3D5A78] transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
      </button>

      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-[#F0EAE0] space-y-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#9C8C77] mb-1">Plate Format</p>
            <div className="flex flex-wrap gap-1.5">
              {recipe.formats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFormat(f)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                    selectedFormat?.id === f.id ? 'bg-[#3D5A78] text-white' : 'bg-[#F5EFE0] text-[#3B2A1E] hover:bg-[#EFE3D0]'
                  }`}
                >
                  {f.label} · ${f.price.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {selectedFormat && sidesForFormat.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#9C8C77] mb-1">Sides &middot; first 2 free, +$2.50 each after</p>
              <div className="flex flex-wrap gap-1.5">
                {sidesForFormat.map((side) => {
                  const inCart = !!qtyInCart(side.name, SIDE_FORMAT, day)
                  return (
                    <button
                      key={side.recipeId}
                      type="button"
                      onClick={() => toggleAddOn(side.name, SIDE_FORMAT, day)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                        inCart ? 'bg-[#3D5A78] text-white' : 'bg-[#F5EFE0] text-[#3B2A1E] hover:bg-[#EFE3D0]'
                      }`}
                    >
                      {side.name} <span className="opacity-80">{addOnPriceLabel(side.name, SIDE_FORMAT, sideUnitsThisDay)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {daySauces.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#9C8C77] mb-1">Sauces &middot; 1 free, +$2.50 each after</p>
              <div className="flex flex-wrap gap-1.5">
                {daySauces.map((sauce) => {
                  const inCart = !!qtyInCart(sauce.name, SAUCE_ADDON_FORMAT, day)
                  return (
                    <button
                      key={sauce.recipeId}
                      type="button"
                      onClick={() => toggleAddOn(sauce.name, SAUCE_ADDON_FORMAT, day)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                        inCart ? 'bg-[#3D5A78] text-white' : 'bg-[#F5EFE0] text-[#3B2A1E] hover:bg-[#EFE3D0]'
                      }`}
                    >
                      {sauce.name} <span className="opacity-80">{addOnPriceLabel(sauce.name, SAUCE_ADDON_FORMAT, sauceUnitsThisDay)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <input
            value={cardNotes}
            onChange={(e) => setCardNotes(e.target.value)}
            placeholder="Notes for this plate (optional)"
            maxLength={200}
            className="w-full h-8 rounded-lg border border-[#DDC9A8] bg-[#FBF5EA] px-2.5 text-xs text-[#3B2A1E] outline-none focus:border-[#3D5A78]"
          />

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-7 w-7 rounded-lg border border-[#DDC9A8] text-xs font-bold text-[#3B2A1E]"
              >
                −
              </button>
              <span className="w-5 text-center text-xs font-bold text-[#3B2A1E]">{qty}</span>
              <button type="button" onClick={() => setQty((q) => q + 1)} className="h-7 w-7 rounded-lg border border-[#DDC9A8] text-xs font-bold text-[#3B2A1E]">
                +
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedFormat}
              className="flex-1 h-8 rounded-full bg-[#E3922E] text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[#C97C1E] disabled:opacity-40 transition"
            >
              {selectedFormat ? 'Add to Order' : 'Select a format'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
