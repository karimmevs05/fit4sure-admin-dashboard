import React, { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
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

type OrderLine = {
  id: number
  customer_id: number
  customer_name: string
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
}

type Summary = {
  monday_meals: number
  thursday_meals: number
  breakfast_meals: number
  total_meals: number
  total_customers: number
  form_customers: number
  manual_customers: number
}

type NonResponder = {
  id: number
  name: string
  lastOrder: Array<{ menu_name: string; category: string | null; quantity: number; day_of_week: string | null }>
}

type ThisWeekData = {
  orders: OrderLine[]
  menuTotals: MenuTotal[]
  summary: Summary
  nonResponders: NonResponder[]
}

type HistoryData = Array<{ week: string; totalMeals: number; customers: number; avgOrderSize: number }>

type InsightsData = {
  metrics: { avgMealsPerWeek: number; totalCustomers: number; totalWeeks: number; peakWeek: string | null; peakWeekMeals: number }
  topRecipes: Array<{ recipe_name: string; order_count: number }>
  topCustomers: Array<{ id: number; name: string; weeks_active: number; total_meals_ordered: number }>
}

type Tab = 'this-week' | 'packing-sheet' | 'history' | 'insights'

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

  const currentWeekLabel = useMemo(() => {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((day + 6) % 7))
    return `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
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
    return <WeeklyPrepPage week={currentWeekLabel} onBack={() => setShowPrepPage(false)} />
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
  const { orders, menuTotals, summary, nonResponders } = data

  const filteredOrders = useMemo(
    () => orders.filter((o) => o.customer_name.toLowerCase().includes(searchCustomer.toLowerCase())),
    [orders, searchCustomer]
  )

  // Group order lines by customer for a cleaner table
  const byCustomer = useMemo(() => {
    const map = new Map<number, { name: string; lines: OrderLine[] }>()
    for (const o of filteredOrders) {
      if (!map.has(o.customer_id)) map.set(o.customer_id, { name: o.customer_name, lines: [] })
      map.get(o.customer_id)!.lines.push(o)
    }
    return Array.from(map.values())
  }, [filteredOrders])

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
            <p className="text-lg font-extrabold text-[#16A34A]">{summary.monday_meals}</p>
          </div>
          <div>
            <p className="text-xs text-[#D97706] font-bold">Thursday</p>
            <p className="text-lg font-extrabold text-[#D97706]">{summary.thursday_meals}</p>
          </div>
          <div>
            <p className="text-xs text-[#0EA5E9] font-bold">Breakfast</p>
            <p className="text-lg font-extrabold text-[#0EA5E9]">{summary.breakfast_meals}</p>
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
        <div className="rounded-2xl border border-[#F0C5B8] bg-[#FFF4F0] p-4">
          <h3 className="mb-3 font-bold text-[#C97C34] flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Needs Follow-Up ({nonResponders.length})
          </h3>
          <div className="space-y-2">
            {nonResponders.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between rounded-lg bg-white p-3 border border-[#E4D8C9]">
                <div>
                  <p className="font-semibold text-[#4B2B1D] text-sm">{customer.name}</p>
                  {(customer.lastOrder?.length ?? 0) > 0 ? (
                    <p className="text-xs text-[#755B4C] mt-0.5">
                      Last time: {customer.lastOrder.map((l) => `${l.menu_name} (${l.quantity})`).join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs text-[#9A7E6F] mt-0.5">No previous order on file</p>
                  )}
                </div>
                <button
                  onClick={() => onAddOrderFor(customer)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2E527F] px-3 text-xs font-bold text-white hover:bg-[#24466E] transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Their Order
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Overview */}
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
        <h3 className="mb-3 font-bold text-[#4B2B1D]">This Week's Menu</h3>
        {menuTotals.length === 0 ? (
          <p className="text-sm text-[#9A7E6F]">No orders yet this week.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {menuTotals.map((m) => (
              <div key={`${m.id}-${m.day_of_week}`} className="rounded-lg border border-[#E4D8C9] bg-white p-3">
                <p className="font-semibold text-[#2E527F] text-sm">{m.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="rounded-full px-3 py-1 text-xs font-bold text-white bg-[#6B7280]">
                    {m.day_of_week || 'Unassigned'}
                  </span>
                  <span className="text-lg font-extrabold text-[#2E527F]">{m.total_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Orders */}
      <div className="space-y-2">
        <h3 className="font-bold text-[#4B2B1D]">Customer Orders</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E4D8C9]">
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Customer</th>
                <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Items</th>
                <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Source</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((c) => (
                <tr key={c.name} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition align-top">
                  <td className="px-4 py-3 font-medium text-[#4B2B1D]">{c.name}</td>
                  <td className="px-4 py-3 text-[#755B4C]">
                    {c.lines.map((l) => (
                      <div key={l.id} className="text-xs flex items-center gap-2 py-0.5">
                        <span>
                          {l.menu_name} × {l.quantity} {l.day_of_week ? `(${l.day_of_week})` : ''}
                        </span>
                        <button
                          onClick={() => onEditLine(l)}
                          className="text-[#2E527F] hover:underline font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteLine(l)}
                          className="text-[#D62F3D] hover:underline font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold text-white ${
                        c.lines[0]?.source === 'form' ? 'bg-[#16A34A]' : 'bg-[#D97706]'
                      }`}
                    >
                      {c.lines[0]?.source === 'form' ? 'Form' : 'Manual'}
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
  const CATEGORY_ORDER = ['Regular', 'Large', 'Breakfast', 'By The LB']

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
                  {new Date(week.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                {metrics.peakWeek ? new Date(metrics.peakWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
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
  const [items, setItems] = useState<Array<{ mealName: string; category: string; quantity: string; dayOfWeek: string }>>(
    prefillCustomer && (prefillCustomer.lastOrder?.length ?? 0) > 0
      ? prefillCustomer.lastOrder.map((l) => ({
          mealName: l.menu_name,
          category: l.category || 'Regular',
          quantity: String(l.quantity),
          dayOfWeek: l.day_of_week || '',
        }))
      : [{ mealName: '', category: 'Regular', quantity: '1', dayOfWeek: '' }]
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addItem = () => setItems([...items, { mealName: '', category: 'Regular', quantity: '1', dayOfWeek: '' }])
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
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
            notes: notes || null,
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

  return (
    <>
      <button onClick={onClose} className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-[#F8F2E8] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-[#4B2B1D]">Add Manual Order</h2>
            <button onClick={onClose} className="rounded-lg border border-[#B9A88F] p-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Customer Name</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={!!prefillCustomer}
            className="w-full h-10 rounded-lg border border-[#B9A88F] bg-white px-3 text-sm text-[#4B2B1D] outline-none disabled:opacity-60 mb-3"
          />

          <p className="text-xs font-bold text-[#4B2B1D] mb-2">Items</p>
          <div className="space-y-2 mb-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                <input
                  value={item.mealName}
                  onChange={(e) => updateItem(idx, 'mealName', e.target.value)}
                  placeholder="Meal name"
                  className="col-span-5 h-9 rounded-lg border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
                />
                <select
                  value={item.category}
                  onChange={(e) => updateItem(idx, 'category', e.target.value)}
                  className="col-span-3 h-9 rounded-lg border border-[#B9A88F] bg-white px-1 text-xs text-[#4B2B1D] outline-none"
                >
                  <option value="Regular">Regular</option>
                  <option value="Large">Large</option>
                  <option value="Breakfast">Breakfast</option>
                  <option value="By The LB">By The LB</option>
                </select>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                  className="col-span-2 h-9 rounded-lg border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
                />
                <select
                  value={item.dayOfWeek}
                  onChange={(e) => updateItem(idx, 'dayOfWeek', e.target.value)}
                  className="col-span-1 h-9 rounded-lg border border-[#B9A88F] bg-white px-1 text-xs text-[#4B2B1D] outline-none"
                >
                  <option value="">-</option>
                  <option value="monday">Mon</option>
                  <option value="thursday">Thu</option>
                </select>
                <button onClick={() => removeItem(idx)} className="col-span-1 text-[#D62F3D] text-xs">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="text-xs font-bold text-[#2E527F] mb-3">
            + Add another item
          </button>

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
            {submitting ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </div>
    </>
  )
}
