import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('https://fit4surebackend-production.up.railway.app/api/admin/task-management-test/test-data')
        const data = await response.json()
        setDashboardData(data)
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Display customer, menu, and order counts from API
  const displayCustomers = dashboardData?.customers || []
  const displayMenus = dashboardData?.menus || []
  const displayOrders = dashboardData?.orders || []

  if (loading || !dashboardData) {
    return <div className="p-8 text-center">Loading dashboard... {!dashboardData && 'Fetching data...'}</div>
  }

  // KPI data with trend charts
  const kpis = [
    {
      label: 'Gross Margin',
      value: '47.2%',
      change: '+2.3 pts vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 45.1 },
        { week: 'W30', val: 45.8 },
        { week: 'W31', val: 46.2 },
        { week: 'W32', val: 46.9 },
        { week: 'W33', val: 47.2 }
      ]
    },
    {
      label: 'Food Cost %',
      value: '31.2%',
      change: '-0.8 pts vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 32.1 },
        { week: 'W30', val: 31.8 },
        { week: 'W31', val: 31.5 },
        { week: 'W32', val: 31.3 },
        { week: 'W33', val: 31.2 }
      ]
    },
    {
      label: 'Est. Weekly COGS',
      value: '$3,840',
      change: '+$120 vs last week',
      changePositive: false,
      trendData: [
        { week: 'W29', val: 3580 },
        { week: 'W30', val: 3620 },
        { week: 'W31', val: 3710 },
        { week: 'W32', val: 3760 },
        { week: 'W33', val: 3840 }
      ]
    },
    {
      label: 'Active Menu Components',
      value: displayMenus.length.toString(),
      change: `${displayMenus.length} menus available`,
      changePositive: true,
      trendData: [
        { week: 'W29', val: 16 },
        { week: 'W30', val: 16 },
        { week: 'W31', val: 17 },
        { week: 'W32', val: 17 },
        { week: 'W33', val: displayMenus.length }
      ]
    },
    {
      label: 'Total Customers',
      value: displayCustomers.length.toString(),
      change: `${displayCustomers.length} active customers`,
      changePositive: true,
      trendData: [
        { week: 'W29', val: 5 },
        { week: 'W30', val: 6 },
        { week: 'W31', val: 7 },
        { week: 'W32', val: 7 },
        { week: 'W33', val: displayCustomers.length }
      ]
    }
  ]

  // Attention needed alerts
  const alerts = [
    {
      id: 1,
      severity: 'high',
      title: 'Chicken inventory below forecast',
      description: 'Need 28 lbs • Have 16 lbs • Gap: 12 lbs',
      action: 'Review Purchase Need'
    },
    {
      id: 2,
      severity: 'medium',
      title: 'Food cost above target',
      description: 'Actual 31.2% vs Target 29% • +2.2 pts',
      action: 'Review Food Cost'
    },
    {
      id: 3,
      severity: 'medium',
      title: 'Salmon margin declined',
      description: 'Was 62% • Now 56.3% → -$0.95/unit',
      action: 'Review Protein Pricing'
    }
  ]

  // Protein Efficiency Matrix - focused on CURRENT SUPPLIER & LAST PURCHASE PRICE
  const proteinMatrix = [
    {
      protein: 'Chicken Breast',
      supplier: 'FreshMeat Co',
      lastPrice: '$2.45/lb',
      lastPurchase: 'Aug 1, 2025',
      demand: 'High',
      margin: '66%',
      usage: 'Core',
      recommendation: 'Core Rotation',
      status: 'stable'
    },
    {
      protein: 'Ground Beef',
      supplier: 'Premium Proteins',
      lastPrice: '$3.65/lb',
      lastPurchase: 'Jul 28, 2025',
      demand: 'High',
      margin: '62%',
      usage: 'Core',
      recommendation: 'Core Rotation',
      status: 'stable'
    },
    {
      protein: 'Ground Turkey',
      supplier: 'FreshMeat Co',
      lastPrice: '$2.10/lb',
      lastPurchase: 'Aug 2, 2025',
      demand: 'Medium',
      margin: '58%',
      usage: 'Rotation',
      recommendation: 'Rotate',
      status: 'stable'
    },
    {
      protein: 'Salmon Fillet',
      supplier: 'SeaFresh Inc',
      lastPrice: '$6.50/lb',
      lastPurchase: 'Jul 31, 2025',
      demand: 'Medium',
      margin: '54%',
      usage: 'Premium',
      recommendation: 'Premium Use',
      status: 'up'
    },
    {
      protein: 'Beef Tenderloin',
      supplier: 'Premium Proteins',
      lastPrice: '$8.20/lb',
      lastPurchase: 'Jul 25, 2025',
      demand: 'Low',
      margin: '50%',
      usage: 'Limited',
      recommendation: 'Limit Use',
      status: 'stable'
    }
  ]

  // Component demand - TOP 3 ONLY
  const componentDemand = {
    proteins: [
      { name: 'Chicken', pct: 38 },
      { name: 'Beef', pct: 27 },
      { name: 'Turkey', pct: 18 }
    ],
    carbs: [
      { name: 'Potatoes', pct: 34 },
      { name: 'Rice', pct: 28 },
      { name: 'Sweet Potato', pct: 21 }
    ],
    vegetables: [
      { name: 'Broccoli', pct: 22 },
      { name: 'Green Beans', pct: 19 },
      { name: 'Zucchini', pct: 17 }
    ],
    sauces: [
      { name: 'Chimichurri', pct: 24 },
      { name: 'Romesco', pct: 21 },
      { name: 'Ají Verde', pct: 18 }
    ]
  }

  // Best plate combination (single suggestion)
  const bestPlate = {
    name: 'Best Margin & Demand',
    protein: 'Chicken',
    carb: 'Potatoes',
    veg: 'Broccoli',
    sauce: 'Ají Verde',
    cost: '$5.10',
    margin: '58%',
    demand: 'High',
    overlap: 'High'
  }

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'high': return 'bg-red-50 border-red-200 text-red-900'
      case 'medium': return 'bg-amber-50 border-amber-200 text-amber-900'
      case 'low': return 'bg-blue-50 border-blue-200 text-blue-900'
      default: return 'bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch(severity) {
      case 'high': return '🔴'
      case 'medium': return '🟠'
      case 'low': return '🔵'
      default: return '⚪'
    }
  }

  return (
    <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fit4Sure Operations Dashboard</h1>
            <p className="text-slate-600 mt-1">Build smarter menus, protect margins, optimize suppliers</p>
          </div>
          <div className="flex gap-3">
            <select className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50">
              <option>Week of Aug 3 - Aug 9, 2025</option>
            </select>
            <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50">Export</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
            <div className="text-xs text-slate-600 font-semibold mb-2">{kpi.label}</div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{kpi.value}</div>
            <div className={`text-xs font-medium mb-3 flex items-center gap-1 ${kpi.changePositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {kpi.changePositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {kpi.change}
            </div>
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpi.trendData}>
                  <Line type="monotone" dataKey="val" stroke={kpi.changePositive ? '#10B981' : '#EF4444'} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content - 2 Column: Alerts & Protein Matrix */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Left Column: Alerts Section */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Attention Needed</h2>
          <div className="space-y-3">
            {alerts.map(alert => (
              <div key={alert.id} className={`rounded-lg border p-4 ${getSeverityColor(alert.severity)}`}>
                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">{getSeverityIcon(alert.severity)}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{alert.title}</div>
                    <div className="text-xs opacity-75 mt-1">{alert.description}</div>
                    <button className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                      {alert.action} →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Protein Matrix */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Protein Efficiency Matrix</h2>
          <p className="text-sm text-slate-600 mb-4">Current supplier & last purchase price from Financial records</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Protein</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Supplier</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Price</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Demand</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Margin</th>
                </tr>
              </thead>
              <tbody>
                {proteinMatrix.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{row.protein}</td>
                    <td className="py-3 px-4 text-slate-700">{row.supplier}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{row.lastPrice}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        row.demand === 'High' ? 'bg-emerald-100 text-emerald-800' :
                        row.demand === 'Medium' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {row.demand}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600">{row.margin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Action Summary - Below Alerts & Protein Matrix */}
      <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg border border-blue-200 p-6 shadow-sm mb-6">
        <div className="flex gap-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Quick Action Summary</h3>
            <ul className="text-xs text-slate-700 space-y-1">
              <li>• <strong>Stock Chicken:</strong> 12 lb shortfall—order today from FreshMeat Co ($2.45/lb)</li>
              <li>• <strong>Build Plates:</strong> Use Chicken + Potatoes + Broccoli + Ají Verde (58% margin)</li>
              <li>• <strong>Monitor Salmon:</strong> Price up $0.95/unit from SeaFresh Inc—check alternatives</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Component Demand */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Component Demand (Customer Choices)</h2>
        <p className="text-sm text-slate-600 mb-6">Top 3 selections by category from last 4 weeks</p>

        <div className="grid grid-cols-4 gap-6">
          {/* Proteins */}
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-3">Proteins</h3>
            <div className="space-y-3">
              {componentDemand.proteins.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{item.name}</span>
                    <span className="text-xs font-bold text-slate-900">{item.pct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-600 h-full" style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carbs */}
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-3">Carbs</h3>
            <div className="space-y-3">
              {componentDemand.carbs.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{item.name}</span>
                    <span className="text-xs font-bold text-slate-900">{item.pct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-orange-500 h-full" style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vegetables */}
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-3">Vegetables</h3>
            <div className="space-y-3">
              {componentDemand.vegetables.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{item.name}</span>
                    <span className="text-xs font-bold text-slate-900">{item.pct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-600 h-full" style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sauces */}
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-3">Sauces</h3>
            <div className="space-y-3">
              {componentDemand.sauces.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{item.name}</span>
                    <span className="text-xs font-bold text-slate-900">{item.pct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-purple-600 h-full" style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Suggested Plate Combinations - Banner Under Component Demand */}
      <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-emerald-900">Suggested Plate Combinations</h2>
          <a href="/dashboard#plates" className="text-sm font-semibold text-blue-600 hover:underline">
            View All →
          </a>
        </div>

        {/* Single Best Plate Card - Horizontal */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-sm font-bold text-emerald-800 mb-3">✓ Best Margin & Demand</div>
            <div className="flex gap-2 flex-wrap">
              <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-bold">🍗 {bestPlate.protein}</span>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">🥔 {bestPlate.carb}</span>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">🥦 {bestPlate.veg}</span>
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">🫙 {bestPlate.sauce}</span>
            </div>
          </div>

          <div className="flex gap-6 ml-6">
            <div className="text-center min-w-12">
              <div className="text-xs text-slate-600 font-medium">Cost</div>
              <div className="font-bold text-slate-900 mt-1">{bestPlate.cost}</div>
            </div>
            <div className="text-center min-w-12">
              <div className="text-xs text-slate-600 font-medium">Margin</div>
              <div className="font-bold text-emerald-600 mt-1">{bestPlate.margin}</div>
            </div>
            <div className="text-center min-w-12">
              <div className="text-xs text-slate-600 font-medium">Demand</div>
              <div className="font-bold text-blue-600 mt-1">{bestPlate.demand}</div>
            </div>
            <div className="text-center min-w-12">
              <div className="text-xs text-slate-600 font-medium">Overlap</div>
              <div className="font-bold text-slate-900 mt-1">{bestPlate.overlap}</div>
            </div>
            <button className="py-2 px-4 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition ml-4">
              Use This Combo
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-600 pt-8 border-t border-slate-200 mt-8">
        Last updated: {new Date().toLocaleString()} • Data from Financial & Inventory systems
      </div>
    </main>
  )
}
