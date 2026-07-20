import React, { useState } from 'react'
import { TrendingUp, TrendingDown, AlertCircle, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function OperationalOptimizationPage() {
  // KPI data for operational efficiency
  const kpis = [
    {
      label: 'Prep Time per Meal',
      value: '4.2 min',
      change: '-0.3 min vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 4.8 },
        { week: 'W30', val: 4.6 },
        { week: 'W31', val: 4.5 },
        { week: 'W32', val: 4.3 },
        { week: 'W33', val: 4.2 }
      ]
    },
    {
      label: 'Labor Cost %',
      value: '18.5%',
      change: '-1.2 pts vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 21.2 },
        { week: 'W30', val: 20.1 },
        { week: 'W31', val: 19.4 },
        { week: 'W32', val: 18.8 },
        { week: 'W33', val: 18.5 }
      ]
    },
    {
      label: 'Waste Rate',
      value: '3.2%',
      change: '+0.5% vs last week',
      changePositive: false,
      trendData: [
        { week: 'W29', val: 2.1 },
        { week: 'W30', val: 2.3 },
        { week: 'W31', val: 2.7 },
        { week: 'W32', val: 3.0 },
        { week: 'W33', val: 3.2 }
      ]
    },
    {
      label: 'Throughput (meals/hr)',
      value: '245',
      change: '+18 meals vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 188 },
        { week: 'W30', val: 202 },
        { week: 'W31', val: 215 },
        { week: 'W32', val: 232 },
        { week: 'W33', val: 245 }
      ]
    },
    {
      label: 'Equipment Uptime',
      value: '98.1%',
      change: '+0.2% vs last week',
      changePositive: true,
      trendData: [
        { week: 'W29', val: 96.5 },
        { week: 'W30', val: 96.8 },
        { week: 'W31', val: 97.2 },
        { week: 'W32', val: 97.9 },
        { week: 'W33', val: 98.1 }
      ]
    }
  ]

  // Operational issues
  const issues = [
    {
      id: 1,
      severity: 'high',
      title: 'Oven maintenance overdue',
      description: 'Last serviced 6 months ago • Scheduled maintenance needed',
      action: 'Schedule Service'
    },
    {
      id: 2,
      severity: 'medium',
      title: 'Prep line bottleneck',
      description: 'Vegetable prep slower than target • Consider additional trainer',
      action: 'Review Staff'
    },
    {
      id: 3,
      severity: 'medium',
      title: 'Packaging waste high',
      description: 'Current: 3.2% • Target: 2.5% • Broken containers detected',
      action: 'Audit Inventory'
    }
  ]

  // Workflow efficiency by station
  const stationEfficiency = [
    {
      station: 'Protein Prep',
      target: '100%',
      current: '94%',
      timePerUnit: '1.2 min',
      issue: 'Chicken marinade setup'
    },
    {
      station: 'Vegetable Prep',
      target: '100%',
      current: '78%',
      timePerUnit: '2.1 min',
      issue: 'Understaffed—need trainer'
    },
    {
      station: 'Cooking/Plating',
      target: '100%',
      current: '96%',
      timePerUnit: '1.3 min',
      issue: 'None'
    },
    {
      station: 'Packaging',
      target: '100%',
      current: '89%',
      timePerUnit: '0.6 min',
      issue: 'Container quality issues'
    }
  ]

  // Labor hours by role
  const laborByRole = [
    { role: 'Head Chef', hours: 40, costPerHr: '$28', weeklyBudget: '$1,120', current: '$1,120', variance: '0%' },
    { role: 'Line Cook', hours: 80, costPerHr: '$18', weeklyBudget: '$1,440', current: '$1,512', variance: '+$72 (5%)' },
    { role: 'Prep Staff', hours: 60, costPerHr: '$14', weeklyBudget: '$840', current: '$945', variance: '+$105 (13%)' },
    { role: 'Packaging', hours: 20, costPerHr: '$12', weeklyBudget: '$240', current: '$220', variance: '-$20 (-8%)' }
  ]

  // Equipment status
  const equipment = [
    { name: 'Main Oven', status: 'Good', uptime: '99.2%', lastMaintenance: 'Jul 15', nextMaintenance: 'Oct 15' },
    { name: 'Prep Blender', status: 'Alert', uptime: '94.1%', lastMaintenance: 'May 20', nextMaintenance: 'Aug 20' },
    { name: 'Vacuum Sealer', status: 'Good', uptime: '97.8%', lastMaintenance: 'Jun 30', nextMaintenance: 'Sep 30' },
    { name: 'Scales', status: 'Good', uptime: '100%', lastMaintenance: 'Mar 15', nextMaintenance: 'Sep 15' }
  ]

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'high': return 'bg-red-50 border-red-200 text-red-900'
      case 'medium': return 'bg-amber-50 border-amber-200 text-amber-900'
      default: return 'bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch(severity) {
      case 'high': return '🔴'
      case 'medium': return '🟠'
      default: return '⚪'
    }
  }

  return (
    <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Operational Optimization</h1>
            <p className="text-slate-600 mt-1">Prep efficiency, labor costs, equipment health, waste reduction</p>
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

      {/* Issues & Station Efficiency Side by Side */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Left: Operational Issues */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Operational Issues</h2>
          <div className="space-y-3">
            {issues.map(issue => (
              <div key={issue.id} className={`rounded-lg border p-4 ${getSeverityColor(issue.severity)}`}>
                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">{getSeverityIcon(issue.severity)}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{issue.title}</div>
                    <div className="text-xs opacity-75 mt-1">{issue.description}</div>
                    <button className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                      {issue.action} →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Station Efficiency */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Station Efficiency</h2>
          <div className="space-y-3 text-sm">
            {stationEfficiency.map((station, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-slate-900">{station.station}</div>
                    <div className="text-xs text-slate-600 mt-0.5">Time/unit: {station.timePerUnit}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-lg ${parseInt(station.current) >= 95 ? 'text-emerald-600' : parseInt(station.current) >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                      {station.current}
                    </div>
                    <div className="text-xs text-slate-600">Target: {station.target}</div>
                  </div>
                </div>
                {station.issue !== 'None' && (
                  <div className="text-xs text-amber-700 bg-amber-50 p-1.5 rounded mt-1">
                    ⚠️ {station.issue}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Labor Hours Breakdown */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Labor Hours & Budget</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-900">Role</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900">Hours</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900">Rate/hr</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900">Budget</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900">Current</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900">Variance</th>
              </tr>
            </thead>
            <tbody>
              {laborByRole.map((labor, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900">{labor.role}</td>
                  <td className="text-center py-3 px-4 text-slate-700">{labor.hours}</td>
                  <td className="text-center py-3 px-4 font-bold text-slate-900">{labor.costPerHr}</td>
                  <td className="text-center py-3 px-4 text-slate-700">{labor.weeklyBudget}</td>
                  <td className="text-center py-3 px-4 font-bold text-slate-900">{labor.current}</td>
                  <td className={`text-center py-3 px-4 font-bold ${labor.variance.includes('-') ? 'text-emerald-600' : 'text-red-600'}`}>
                    {labor.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          <strong>Total Weekly Labor:</strong> $3,640 budget vs $3,797 current (+4.3% variance) • Prep Staff overage due to training
        </div>
      </div>

      {/* Equipment Status */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Equipment Health</h2>
        <div className="grid grid-cols-4 gap-4">
          {equipment.map((item, idx) => (
            <div key={idx} className={`border rounded-lg p-4 ${item.status === 'Alert' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-slate-900">{item.name}</div>
                <div className="text-lg">
                  {item.status === 'Good' ? '✓' : '⚠️'}
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div>
                  <div className="text-slate-600">Uptime</div>
                  <div className="font-bold text-slate-900">{item.uptime}</div>
                </div>
                <div>
                  <div className="text-slate-600">Last Maintenance</div>
                  <div className="font-bold text-slate-900">{item.lastMaintenance}</div>
                </div>
                <div>
                  <div className="text-slate-600">Next Maintenance</div>
                  <div className="font-bold text-slate-900">{item.nextMaintenance}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg border border-blue-200 p-6 shadow-sm">
        <div className="flex gap-3">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Quick Action Summary</h3>
            <ul className="text-xs text-slate-700 space-y-1">
              <li>• <strong>Equipment:</strong> Schedule oven maintenance by end of month (overdue 2 months)</li>
              <li>• <strong>Labor:</strong> Prep Staff overage due to new trainer—monitor through Aug then optimize</li>
              <li>• <strong>Waste:</strong> Packaging waste at 3.2% vs target 2.5%—audit container quality and handling</li>
              <li>• <strong>Efficiency Win:</strong> Throughput up 18 meals/hr, prep time down 0.3 min—maintain training momentum</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-600 pt-8 border-t border-slate-200 mt-8">
        Last updated: {new Date().toLocaleString()} • Data from Production & Inventory systems
      </div>
    </main>
  )
}
