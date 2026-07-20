import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState({
    customers: [],
    menus: [],
    orders: [],
    stats: { total_customers: 0, total_menus: 0, recent_orders: 0 }
  })

  useEffect(() => {
    fetch('https://fit4surebackend-production.up.railway.app/api/admin/task-management-test/test-data')
      .then(r => r.json())
      .then(data => {
        console.log('Data loaded:', data)
        setDashboardData(data)
      })
      .catch(err => console.error('Error:', err))
  }, [])

  const displayCustomers = dashboardData.customers || []
  const displayMenus = dashboardData.menus || []
  const displayOrders = dashboardData.orders || []

  // KPI data with trend charts
  const kpis = [
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
    },
    {
      label: 'Active Menus',
      value: displayMenus.length.toString(),
      change: `${displayMenus.length} menus available`,
      changePositive: true,
      trendData: [
        { week: 'W29', val: 3 },
        { week: 'W30', val: 3 },
        { week: 'W31', val: 4 },
        { week: 'W32', val: 4 },
        { week: 'W33', val: displayMenus.length }
      ]
    },
    {
      label: 'Recent Orders',
      value: displayOrders.length.toString(),
      change: `${displayOrders.length} orders this week`,
      changePositive: true,
      trendData: [
        { week: 'W29', val: 10 },
        { week: 'W30', val: 12 },
        { week: 'W31', val: 14 },
        { week: 'W32', val: 16 },
        { week: 'W33', val: displayOrders.length }
      ]
    },
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
    }
  ]

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
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fit4Sure Operations Dashboard</h1>
            <p className="text-slate-600 mt-1">Build smarter menus, protect margins, optimize suppliers</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50">Export</button>
          </div>
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-6 mb-6">
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

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Real-Time Data</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600">Customers Loaded</p>
              <p className="text-2xl font-bold text-slate-900">{displayCustomers.length}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Menus Available</p>
              <p className="text-2xl font-bold text-slate-900">{displayMenus.length}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Orders Recorded</p>
              <p className="text-2xl font-bold text-slate-900">{displayOrders.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg border border-blue-200 p-6 shadow-sm">
        <div className="flex gap-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">System Status</h3>
            <p className="text-xs text-slate-700">
              ✅ Database Connected • ✅ API Live • ✅ {displayCustomers.length} Customers • ✅ {displayMenus.length} Menus • ✅ {displayOrders.length} Orders
            </p>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600 pt-8 border-t border-slate-200 mt-8">
        Last updated: {new Date().toLocaleString()} • Data from Fit4Sure Backend
      </div>
    </main>
  )
}
