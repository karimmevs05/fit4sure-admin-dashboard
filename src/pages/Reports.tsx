import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { TrendingUp, TrendingDown, DollarSign, Users, Activity, Target, AlertCircle, BarChart3, LineChart as LineChartIcon, PieChart } from 'lucide-react'

interface ReportData {
  [key: string]: any;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState('monthly');
  const [reports, setReports] = useState<{ [key: string]: ReportData | null }>({
    monthly: null,
    insights: null,
    operations: null,
    weekly: null,
    prep: null,
    inventory: null,
    recipes: null,
    orders: null,
    customers: null,
    delivery: null,
    suppliers: null,
    financial: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchAllReports();
  }, []);

  const fetchAllReports = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const headers = { Authorization: `Bearer ${token}` };

      console.log('Fetching reports from:', apiUrl);

      const [monthly, insights, operations] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/reports/monthly-summary`, { headers }).catch(err => {
          console.error('Monthly error:', err);
          return { data: { data: null } };
        }),
        axios.get(`${apiUrl}/api/admin/reports/customer-insights`, { headers }).catch(err => {
          console.error('Insights error:', err);
          return { data: { data: null } };
        }),
        axios.get(`${apiUrl}/api/admin/reports/operational-metrics`, { headers }).catch(err => {
          console.error('Operations error:', err);
          return { data: { data: null } };
        })
      ]);

      setReports({
        monthly: monthly.data.data,
        insights: insights.data.data,
        operations: operations.data.data,
        weekly: null,
        prep: null,
        inventory: null,
        recipes: null,
        orders: null,
        customers: null,
        delivery: null,
        suppliers: null,
        financial: null
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Failed to load reports. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#8B6F47', '#D4A574', '#E8D5C4', '#C9B8A3', '#9B8B7E'];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <button
            onClick={fetchAllReports}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="font-bold text-red-800 mb-2">⚠️ {error}</p>
            <p className="text-sm text-red-700">
              Start the backend: <code className="bg-red-100 px-2 py-1 rounded">cd ~/Documents/fit4sure_backend && node src/index.js</code>
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
              {[
                { id: 'monthly', label: '📊 Monthly Summary', icon: BarChart3 },
                { id: 'insights', label: '👥 Customer Insights', icon: Users },
                { id: 'operations', label: '⚙️ Operations', icon: Activity },
                { id: 'weekly', label: 'Weekly Performance', icon: TrendingUp },
                { id: 'prep', label: 'Kitchen Prep', icon: Activity },
                { id: 'inventory', label: 'Inventory', icon: Activity },
                { id: 'recipes', label: 'Recipe Profitability', icon: TrendingUp },
                { id: 'orders', label: 'Orders & Fulfillment', icon: Activity },
                { id: 'customers', label: 'Customers', icon: Users },
                { id: 'delivery', label: 'Delivery', icon: Activity },
                { id: 'suppliers', label: 'Suppliers', icon: DollarSign },
                { id: 'financial', label: 'Financial', icon: DollarSign }
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <tab.icon className="w-4 h-4 inline mr-2" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Monthly Summary Report */}
            {activeTab === 'monthly' && reports.monthly && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Total Orders</p>
                    <p className="text-3xl font-bold text-blue-600">{reports.monthly.currentMonth?.totalOrders || 0}</p>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Active Customers</p>
                    <p className="text-3xl font-bold text-green-600">{reports.monthly.currentMonth?.activeCustomers || 0}</p>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Total Meals</p>
                    <p className="text-3xl font-bold text-orange-600">{reports.monthly.currentMonth?.totalMeals || 0}</p>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Est. Revenue</p>
                    <p className="text-3xl font-bold text-purple-600">${reports.monthly.currentMonth?.estimatedRevenue || 0}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="font-bold text-lg mb-4">📈 Performance vs Last Month</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Meal Growth</span>
                        <span className={`font-bold ${reports.monthly.comparison?.mealGrowth?.includes('-') ? 'text-red-600' : 'text-green-600'}`}>
                          {reports.monthly.comparison?.mealGrowth}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Customer Growth</span>
                        <span className={`font-bold ${reports.monthly.comparison?.customerGrowth?.includes('-') ? 'text-red-600' : 'text-green-600'}`}>
                          {reports.monthly.comparison?.customerGrowth}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Meals/Customer</span>
                        <span className="font-bold text-blue-600">{reports.monthly.currentMonth?.avgMealsPerCustomer || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="font-bold text-lg mb-4">Pipeline Breakdown</h3>
                    <div className="space-y-2">
                      {reports.monthly.customerBreakdown?.map((status: any) => (
                        <div key={status.stage} className="flex justify-between">
                          <span className="capitalize">{status.stage}</span>
                          <span className="font-bold">{status.total} ({status.orderedThisMonth} ordered)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4">⭐ Top Customers</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-center">Meals</th>
                          <th className="px-4 py-2 text-center">Weeks</th>
                          <th className="px-4 py-2 text-center">Status</th>
                          <th className="px-4 py-2 text-center">Engagement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.monthly.topCustomers?.map((customer: any, idx: number) => (
                          <tr key={idx} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2 font-semibold">{customer.name}</td>
                            <td className="px-4 py-2 text-center font-bold">{customer.meals}</td>
                            <td className="px-4 py-2 text-center">{customer.weeks}</td>
                            <td className="px-4 py-2 text-center text-sm">
                              <span className={`px-2 py-1 rounded ${customer.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {customer.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center font-bold">{customer.engagement}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Insights */}
            {activeTab === 'insights' && reports.insights && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Repeat Purchase Rate</p>
                    <p className="text-3xl font-bold text-green-600">{reports.insights.repeatPurchase?.repeatRate || '0%'}</p>
                    <p className="text-xs text-gray-500 mt-2">{reports.insights.repeatPurchase?.repeatCustomers} of {reports.insights.repeatPurchase?.totalCustomers} customers</p>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="font-bold mb-3">LTV Distribution</p>
                    <div className="space-y-2 text-sm">
                      {reports.insights.ltvDistribution?.map((bracket: any) => (
                        <div key={bracket.bracket} className="flex justify-between">
                          <span>{bracket.bracket}</span>
                          <span className="font-bold">{bracket.customers}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="font-bold mb-3">Engagement Levels</p>
                    <div className="space-y-2 text-sm">
                      {reports.insights.engagementLevels?.map((level: any) => (
                        <div key={level.level} className="flex justify-between">
                          <span>{level.level}</span>
                          <span className="font-bold">{level.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4">📊 Cohort Analysis</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Cohort</th>
                          <th className="px-4 py-2 text-center">Size</th>
                          <th className="px-4 py-2 text-center">Active</th>
                          <th className="px-4 py-2 text-center">Churned</th>
                          <th className="px-4 py-2 text-center">Never Ordered</th>
                          <th className="px-4 py-2 text-center">Retention %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.insights.cohortAnalysis?.map((cohort: any, idx: number) => (
                          <tr key={idx} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2 font-semibold">{cohort.month}</td>
                            <td className="px-4 py-2 text-center">{cohort.cohortSize}</td>
                            <td className="px-4 py-2 text-center font-bold text-green-600">{cohort.active}</td>
                            <td className="px-4 py-2 text-center text-red-600">{cohort.churned}</td>
                            <td className="px-4 py-2 text-center text-gray-600">{cohort.neverOrdered}</td>
                            <td className="px-4 py-2 text-center font-bold">{cohort.retentionRate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Operational Metrics */}
            {activeTab === 'operations' && reports.operations && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Unique Menus</p>
                    <p className="text-3xl font-bold text-blue-600">{reports.operations.menuDiversity?.uniqueMenusThisMonth || 0}</p>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow">
                    <p className="text-gray-600 text-sm mb-2">Order Consistency</p>
                    <p className="text-3xl font-bold text-green-600">{reports.operations.orderConsistency?.consistency || '0%'}</p>
                    <p className="text-xs text-gray-500 mt-2">{reports.operations.orderConsistency?.weeksWithOrders} of {reports.operations.orderConsistency?.totalCalendarWeeks} weeks</p>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4">📈 Weekly Meal Trend</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Week</th>
                          <th className="px-4 py-2 text-center">Meals</th>
                          <th className="px-4 py-2 text-center">Customers</th>
                          <th className="px-4 py-2 text-center">Avg per Customer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.operations.weeklyTrend?.map((week: any, idx: number) => (
                          <tr key={idx} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-2 font-semibold">{week.week}</td>
                            <td className="px-4 py-2 text-center font-bold text-orange-600">{week.meals}</td>
                            <td className="px-4 py-2 text-center">{week.customers}</td>
                            <td className="px-4 py-2 text-center font-bold text-blue-600">{week.mealsPerCustomer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Weekly Performance */}
            {activeTab === 'weekly' && reports.weekly && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Revenue</p>
                  <p className="text-2xl font-bold text-green-600">${reports.weekly.revenue}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Expenses</p>
                  <p className="text-2xl font-bold text-red-600">${reports.weekly.expenses}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Margin</p>
                  <p className="text-2xl font-bold text-blue-600">{reports.weekly.margin}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Orders</p>
                  <p className="text-2xl font-bold text-purple-600">{reports.weekly.orderCount}</p>
                </div>
              </div>
            )}

            {/* Kitchen Prep */}
            {activeTab === 'prep' && reports.prep && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">Daily Prep Schedule - {reports.prep.date}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3">Meals to Prep ({reports.prep.totalMealsToPrep})</h3>
                    <div className="space-y-2">
                      {reports.prep.meals.map((meal: any, idx: number) => (
                        <div key={idx} className="flex justify-between p-2 bg-gray-50 rounded">
                          <span>{meal.name}</span>
                          <span className="font-bold">{meal.quantity} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-3">Ingredients Needed</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {reports.prep.ingredients.map((ing: any, idx: number) => (
                        <div key={idx} className="flex justify-between p-2 bg-gray-50 rounded text-sm">
                          <span>{ing.name}</span>
                          <span className="font-bold">{ing.total_needed} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory */}
            {activeTab === 'inventory' && reports.inventory && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">Inventory Status</h2>
                {reports.inventory.lowStockItems.length > 0 && (
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="font-semibold text-yellow-900 mb-2">⚠️ Low Stock Items ({reports.inventory.lowStockCount})</p>
                    <div className="space-y-1 text-sm text-yellow-800">
                      {reports.inventory.lowStockItems.map((item: any, idx: number) => (
                        <div key={idx}>• {item.name}: {item.current_quantity} {item.unit}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Item</th>
                        <th className="px-4 py-2 text-right">Current</th>
                        <th className="px-4 py-2 text-right">Reorder Point</th>
                        <th className="px-4 py-2 text-right">Used (30d)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.inventory.allItems.slice(0, 10).map((item: any, idx: number) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">{item.name}</td>
                          <td className="px-4 py-2 text-right">{item.current_quantity}</td>
                          <td className="px-4 py-2 text-right">{item.reorder_point}</td>
                          <td className="px-4 py-2 text-right">{item.used_grams}g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Orders & Fulfillment */}
            {activeTab === 'orders' && reports.orders && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Total Orders</p>
                  <p className="text-2xl font-bold text-blue-600">{reports.orders.totalOrders}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Delivered</p>
                  <p className="text-2xl font-bold text-green-600">{reports.orders.deliveredCount}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{reports.orders.pendingCount}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Fulfillment Rate</p>
                  <p className="text-2xl font-bold text-purple-600">{reports.orders.fulfillmentRate}</p>
                </div>
              </div>
            )}

            {/* Customers */}
            {activeTab === 'customers' && reports.customers && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Active Customers</p>
                  <p className="text-2xl font-bold text-green-600">{reports.customers.activeCustomers}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Inactive</p>
                  <p className="text-2xl font-bold text-red-600">{reports.customers.inactiveCustomers}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <p className="text-gray-600 text-sm mb-2">Churn Rate</p>
                  <p className="text-2xl font-bold text-orange-600">{reports.customers.churnRate}%</p>
                </div>
              </div>
            )}

            {/* Delivery */}
            {activeTab === 'delivery' && reports.delivery && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">Delivery Performance</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="font-semibold mb-3">On-Time Rate: {reports.delivery.onTimeRate}</p>
                    <div className="bg-gray-100 h-8 rounded overflow-hidden">
                      <div
                        className="bg-green-600 h-full"
                        style={{ width: `${reports.delivery.onTimeRate}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold mb-3">Deliveries by Zone</p>
                    <div className="space-y-2">
                      {reports.delivery.byZone.map((zone: any, idx: number) => (
                        <div key={idx} className="flex justify-between p-2 bg-gray-50 rounded">
                          <span>{zone.name}</span>
                          <span className="font-bold">{zone.order_count} orders</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Suppliers */}
            {activeTab === 'suppliers' && reports.suppliers && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">Supplier Performance</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Supplier</th>
                        <th className="px-4 py-2 text-right">Orders</th>
                        <th className="px-4 py-2 text-right">Total Spent</th>
                        <th className="px-4 py-2 text-right">Avg Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.suppliers.suppliers.map((supplier: any, idx: number) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">{supplier.name}</td>
                          <td className="px-4 py-2 text-right">{supplier.orderCount}</td>
                          <td className="px-4 py-2 text-right">${supplier.totalSpent}</td>
                          <td className="px-4 py-2 text-right">${supplier.avgOrder}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Financial */}
            {activeTab === 'financial' && reports.financial && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">Financial Summary (30 Days)</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-gray-600 text-sm">Revenue</p>
                    <p className="text-2xl font-bold text-green-600">${reports.financial.revenue}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-gray-600 text-sm">Expenses</p>
                    <p className="text-2xl font-bold text-red-600">${reports.financial.expenses}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-gray-600 text-sm">Profit</p>
                    <p className="text-2xl font-bold text-blue-600">${reports.financial.profit}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-gray-600 text-sm">Margin</p>
                    <p className="text-2xl font-bold text-purple-600">{reports.financial.marginPercent}%</p>
                  </div>
                </div>

                <h3 className="font-semibold mb-3">Expenses by Category</h3>
                <div className="space-y-2">
                  {reports.financial.expensesByCategory.map((cat: any, idx: number) => (
                    <div key={idx} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{cat.category}</span>
                      <span className="font-bold">${cat.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
