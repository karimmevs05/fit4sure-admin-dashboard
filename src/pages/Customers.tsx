import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Search, Plus, Mail, Phone, MapPin, Edit, Trash2, X, Home, DollarSign, Users, Briefcase, Target, AlertCircle, Heart, Utensils, TrendingUp, MessageCircle, Clock, Zap, ArrowRight } from 'lucide-react'

type Customer = {
  id: number
  name: string
  email?: string
  phone?: string
  address?: string
  apt_gate_code?: string
  payment_mode?: string
  household_size?: number
  occupation?: string
  primary_goal?: string
  biggest_hurdle?: string
  protein_preference?: string
  dietary_preference?: string
  foods_to_avoid?: string
  dietary_restrictions?: string
  notes?: string
  created_at?: string
  total_meals_ordered?: number
  weeks_active?: number
  last_order_date?: string
  lifetime_value_cents?: number
  sales_pipeline_stage?: 'prospect' | 'engaged' | 'trial' | 'active' | 'at_risk' | 'churned'
  conversion_probability?: number
  days_since_last_contact?: number
  engagement_score?: number
}

type Tab = 'pipeline' | 'active' | 'prospects' | 'at_risk' | 'insights' | 'activities'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('pipeline')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    apt_gate_code: '',
    payment_mode: '',
    household_size: undefined,
    occupation: '',
    primary_goal: '',
    biggest_hurdle: '',
    protein_preference: '',
    dietary_preference: '',
    dietary_restrictions: '',
    foods_to_avoid: '',
    notes: '',
    sales_pipeline_stage: 'prospect',
    conversion_probability: 0,
    days_since_last_contact: 0,
    engagement_score: 0,
  })
  const [showCustomerDetail, setShowCustomerDetail] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      setCustomers(response.data.data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    let result = customers

    if (activeTab === 'pipeline') {
      // Show all customers sorted by conversion probability
      result = result.sort((a, b) => (b.conversion_probability || 0) - (a.conversion_probability || 0))
    } else if (activeTab === 'active') {
      // Only active customers (Week of 7.12 orderers)
      result = result.filter(c => c.sales_pipeline_stage === 'active')
    } else if (activeTab === 'prospects') {
      // Only never-ordered prospects
      result = result.filter(c => c.sales_pipeline_stage === 'prospect')
    } else if (activeTab === 'at_risk') {
      // Labeled "Lost Prospects" in the UI -- past customers who stopped ordering
      result = result.filter(c => c.sales_pipeline_stage === 'churned')
    }

    if (searchTerm) {
      result = result.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm)
      )
    }

    return result
  }, [customers, activeTab, searchTerm])

  const handleDeleteCustomer = async (customerId: number) => {
    if (!confirm('Are you sure you want to delete this customer?')) return
    try {
      await axios.delete(`${apiUrl}/api/admin/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error)
      alert('Failed to delete customer')
    }
  }

  const handleSaveCustomer = async () => {
    if (!formData.name?.trim()) {
      alert('Please enter a customer name')
      return
    }

    try {
      if (editingCustomer?.id) {
        await axios.put(`${apiUrl}/api/admin/customers/${editingCustomer.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        await axios.post(`${apiUrl}/api/admin/customers`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      await fetchCustomers()
      setEditingCustomer(null)
      setShowAddCustomer(false)
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        apt_gate_code: '',
        payment_mode: '',
        household_size: undefined,
        occupation: '',
        primary_goal: '',
        biggest_hurdle: '',
        protein_preference: '',
        dietary_preference: '',
        dietary_restrictions: '',
        foods_to_avoid: '',
        notes: '',
      })
    } catch (error) {
      console.error('Error saving customer:', error)
      alert('Failed to save customer')
    }
  }

  const openEditCustomer = (customer: Customer) => {
    setFormData(customer)
    setEditingCustomer(customer)
    setShowAddCustomer(true)
  }

  const handleFormChange = (field: keyof Customer, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const getLifetimeValue = (cents: number) => {
    return (cents / 100).toFixed(2)
  }

  if (loading) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
          <p className="text-[#755B4C]">Loading customers...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Sales Pipeline</h1>
          <p className="mt-1 text-sm text-[#755B4C]">Track leads, conversions, and customer engagement</p>
        </div>
        <button
          onClick={() => setShowAddCustomer(true)}
          className="flex items-center gap-2 rounded-lg bg-[#2E527F] text-white px-4 py-2.5 font-bold hover:bg-[#24466E] transition"
        >
          <Plus className="h-5 w-5" />
          Add Prospect
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#D8CDBE] overflow-x-auto">
        {[
          { id: 'pipeline' as Tab, label: 'Pipeline', icon: '📊' },
          { id: 'active' as Tab, label: 'Active Customers', icon: '✅' },
          { id: 'prospects' as Tab, label: 'Prospects', icon: '🎯' },
          { id: 'at_risk' as Tab, label: 'Lost Prospects', icon: '🟡' },
          { id: 'insights' as Tab, label: 'Insights', icon: '📈' },
          { id: 'activities' as Tab, label: 'Activities', icon: '💬' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-extrabold whitespace-nowrap transition border-b-2 ${
              activeTab === tab.id
                ? 'border-[#2E527F] text-[#2E527F]'
                : 'border-transparent text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#9A8774]" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] pl-12 pr-4 py-3 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
        />
      </div>

      {/* Tab Content */}
      {activeTab === 'pipeline' ? (
        <div className="space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
              <p className="text-[#755B4C]">No customers in pipeline</p>
            </div>
          ) : (
            filteredCustomers.map(customer => {
              const stageColors = {
                lead: { bg: '#F9F9F9', border: '#D4D4D4', text: '#666666', label: 'Lead' },
                prospect: { bg: '#FBF6EC', border: '#E9D9BF', text: '#9A6D34', label: 'Prospect' },
                prospect_lost: { bg: '#FFE9E0', border: '#F0C5B8', text: '#C97C34', label: 'Lost Prospect' },
                engaged: { bg: '#E3F3FF', border: '#B3D9F7', text: '#1E6BA8', label: 'Engaged' },
                inactive: { bg: '#FFE9E0', border: '#F0C5B8', text: '#C97C34', label: 'Inactive' },
                trial: { bg: '#FFF0E6', border: '#FFD4B0', text: '#C97C34', label: 'Trial' },
                active: { bg: '#EBF8F0', border: '#B3DFC7', text: '#158A4D', label: 'Active' },
                at_risk: { bg: '#FFE6EC', border: '#F7B3C5', text: '#C21E3C', label: 'At Risk' },
                churned: { bg: '#F5F5F5', border: '#D4D4D4', text: '#666666', label: 'Churned' }
              }
              const stage = customer.sales_pipeline_stage || 'prospect'
              const colors = stageColors[stage] || stageColors['prospect']

              return (
                <div
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer)
                    setShowCustomerDetail(true)
                  }}
                  className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4 hover:shadow-md transition cursor-pointer"
                >
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-start">
                    {/* Name & Stage */}
                    <div className="md:col-span-2">
                      <h3 className="font-extrabold text-[#4B2B1D] text-lg">{customer.name}</h3>
                      <div className="mt-2 flex gap-2">
                        <span
                          className="text-xs px-3 py-1 rounded-full font-bold"
                          style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                        >
                          {colors.label}
                        </span>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="text-sm space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-2 text-[#755B4C]">
                          <Mail className="h-4 w-4" />
                          <span className="truncate text-xs">{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-[#755B4C]">
                          <Phone className="h-4 w-4" />
                          <span className="text-xs">{customer.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Engagement */}
                    <div className="rounded-lg bg-white p-2 text-center">
                      <p className="text-[#755B4C] text-xs font-bold">Engagement</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Zap className="h-3 w-3 text-[#D97706]" />
                        <p className="text-lg font-extrabold text-[#D97706]">{customer.engagement_score || 0}%</p>
                      </div>
                    </div>

                    {/* Days Since Contact */}
                    <div className="rounded-lg bg-white p-2 text-center">
                      <p className="text-[#755B4C] text-xs font-bold">Last Contact</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-[#0EA5E9]" />
                        <p className="text-lg font-extrabold text-[#0EA5E9]">{customer.days_since_last_contact || 0}d</p>
                      </div>
                    </div>

                    {/* Conversion Probability */}
                    <div className="rounded-lg bg-white p-2 text-center">
                      <p className="text-[#755B4C] text-xs font-bold">Win Probability</p>
                      <p className="text-lg font-extrabold text-[#16A34A]">{Math.round(customer.conversion_probability || 0)}%</p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-[#16A34A] h-1.5 rounded-full"
                          style={{ width: `${customer.conversion_probability || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : activeTab === 'active' || activeTab === 'prospects' || activeTab === 'at_risk' ? (
        <div className="space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-8 text-center">
              <p className="text-[#755B4C]">No customers found</p>
            </div>
          ) : (
            filteredCustomers.map(customer => (
              <div
                key={customer.id}
                onClick={() => {
                  setSelectedCustomer(customer)
                  setShowCustomerDetail(true)
                }}
                className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4 hover:shadow-md transition cursor-pointer"
              >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                  <div className="md:col-span-2">
                    <h3 className="font-extrabold text-[#4B2B1D] text-lg">{customer.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customer.dietary_restrictions && (
                        <span className="text-xs bg-[#FFF4F4] text-[#D62F3D] px-2 py-1 rounded font-bold">
                          {customer.dietary_restrictions}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded font-bold ${
                        customer.weeks_active && customer.weeks_active > 0
                          ? 'bg-[#EAF5EC] text-[#16A34A]'
                          : 'bg-[#F5F5F5] text-[#9CA3AF]'
                      }`}>
                        {customer.weeks_active && customer.weeks_active > 0 ? '✓ Active' : '⏸️ Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm space-y-1">
                    {customer.email && (
                      <div className="flex items-center gap-2 text-[#755B4C]">
                        <Mail className="h-4 w-4" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-[#755B4C]">
                        <Phone className="h-4 w-4" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[#755B4C] font-bold">Weeks</p>
                      <p className="text-lg font-extrabold text-[#2E527F]">{customer.weeks_active || 0}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[#755B4C] font-bold">Meals</p>
                      <p className="text-lg font-extrabold text-[#2E527F]">{customer.total_meals_ordered || 0}</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 text-center">
                    <p className="text-[#755B4C] text-xs font-bold">Lifetime Value</p>
                    <p className="text-xl font-extrabold text-[#16A34A]">
                      ${getLifetimeValue(customer.lifetime_value_cents || 0)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'insights' ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Total Customers</p>
                  <p className="text-3xl font-extrabold text-[#2E527F] mt-2">{customers.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#EDF2F7] flex items-center justify-center text-xl">👥</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Active</p>
                  <p className="text-3xl font-extrabold text-[#16A34A] mt-2">
                    {customers.filter(c => c.sales_pipeline_stage === 'active').length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#EAF5EC] flex items-center justify-center text-xl">✅</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Total Revenue</p>
                  <p className="text-3xl font-extrabold text-[#D97706] mt-2">
                    ${(customers.reduce((sum, c) => sum + (c.lifetime_value_cents || 0), 0) / 100).toFixed(0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#FFFBEB] flex items-center justify-center text-xl">💰</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Avg Customer Value</p>
                  <p className="text-3xl font-extrabold text-[#0EA5E9] mt-2">
                    ${customers.length > 0 ? (customers.reduce((sum, c) => sum + (c.lifetime_value_cents || 0), 0) / customers.length / 100).toFixed(0) : 0}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#E0F2FE] flex items-center justify-center text-xl">📈</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Prospects (Never Ordered)</p>
                  <p className="text-3xl font-extrabold text-[#9A6D34] mt-2">
                    {customers.filter(c => c.sales_pipeline_stage === 'prospect').length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#FBF6EC] flex items-center justify-center text-xl">🎯</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#755B4C]">Lost Prospects</p>
                  <p className="text-3xl font-extrabold text-[#C97C34] mt-2">
                    {customers.filter(c => c.sales_pipeline_stage === 'churned').length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-[#FFE9E0] flex items-center justify-center text-xl">🟡</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
            <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">Top Customers</h3>
            <div className="space-y-2">
              {customers.slice(0, 5).map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2E527F] text-white flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </div>
                    <p className="font-semibold text-[#4B2B1D]">{c.name}</p>
                  </div>
                  <p className="font-extrabold text-[#16A34A]">
                    ${getLifetimeValue(c.lifetime_value_cents || 0)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'activities' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Outreach Templates */}
          <div className="md:col-span-2 rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
            <h3 className="font-extrabold text-[#4B2B1D] mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5" /> Quick Outreach
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Check-in', icon: '📞', color: 'bg-[#E3F3FF]' },
                { label: 'Trial Offer', icon: '🎁', color: 'bg-[#FFF0E6]' },
                { label: 'Win-Back', icon: '💪', color: 'bg-[#FFE6EC]' },
                { label: 'Testimonial Request', icon: '⭐', color: 'bg-[#FFF9E6]' },
              ].map((template) => (
                <button
                  key={template.label}
                  className={`w-full flex items-center justify-between rounded-lg ${template.color} px-4 py-3 text-sm font-bold text-[#4B2B1D] hover:shadow-md transition border border-[#CDBDA8]`}
                >
                  <span>{template.icon} {template.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
            <h3 className="font-extrabold text-[#4B2B1D] mb-4">Recent Activity</h3>
            <div className="space-y-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <p className="font-bold text-[#4B2B1D]">Email Sent</p>
                <p className="text-xs text-[#755B4C]">2 hours ago</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="font-bold text-[#4B2B1D]">Order Placed</p>
                <p className="text-xs text-[#755B4C]">1 day ago</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="font-bold text-[#4B2B1D]">Call Logged</p>
                <p className="text-xs text-[#755B4C]">3 days ago</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add/Edit Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-3xl w-full my-8">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <button
                onClick={() => {
                  setShowAddCustomer(false)
                  setEditingCustomer(null)
                  setFormData({
                    name: '',
                    email: '',
                    phone: '',
                    address: '',
                    apt_gate_code: '',
                    payment_mode: '',
                    household_size: undefined,
                    occupation: '',
                    primary_goal: '',
                    biggest_hurdle: '',
                    protein_preference: '',
                    dietary_preference: '',
                    dietary_restrictions: '',
                    foods_to_avoid: '',
                    notes: '',
                  })
                }}
                className="text-[#755B4C] hover:text-[#4B2B1D]"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* Contact Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📋 Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      placeholder="Customer name"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      placeholder="email@example.com"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => handleFormChange('phone', e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Payment Mode</label>
                    <input
                      type="text"
                      value={formData.payment_mode || ''}
                      onChange={(e) => handleFormChange('payment_mode', e.target.value)}
                      placeholder="e.g., Credit Card, ACH"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🏠 Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Street Address</label>
                    <input
                      type="text"
                      value={formData.address || ''}
                      onChange={(e) => handleFormChange('address', e.target.value)}
                      placeholder="123 Main St"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Apt / Gate Code</label>
                    <input
                      type="text"
                      value={formData.apt_gate_code || ''}
                      onChange={(e) => handleFormChange('apt_gate_code', e.target.value)}
                      placeholder="Apt 5B or Gate: 1234"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">👤 Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Household Size</label>
                    <input
                      type="number"
                      value={formData.household_size || ''}
                      onChange={(e) => handleFormChange('household_size', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Number of people"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Occupation</label>
                    <input
                      type="text"
                      value={formData.occupation || ''}
                      onChange={(e) => handleFormChange('occupation', e.target.value)}
                      placeholder="e.g., Software Engineer"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                </div>
              </div>

              {/* Goals & Sales Info */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🎯 Sales & Goals</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Pipeline Stage</label>
                    <select
                      value={formData.sales_pipeline_stage || 'prospect'}
                      onChange={(e) => handleFormChange('sales_pipeline_stage', e.target.value as any)}
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    >
                      <option value="prospect">Prospect</option>
                      <option value="engaged">Engaged</option>
                      <option value="trial">Trial</option>
                      <option value="active">Active</option>
                      <option value="at_risk">At Risk</option>
                      <option value="churned">Churned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Win Probability (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.conversion_probability || 0}
                      onChange={(e) => handleFormChange('conversion_probability', parseInt(e.target.value))}
                      placeholder="0-100"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Primary Goal</label>
                    <input
                      type="text"
                      value={formData.primary_goal || ''}
                      onChange={(e) => handleFormChange('primary_goal', e.target.value)}
                      placeholder="e.g., Weight loss, Muscle gain, Healthier lifestyle"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Biggest Hurdle / Objection</label>
                    <input
                      type="text"
                      value={formData.biggest_hurdle || ''}
                      onChange={(e) => handleFormChange('biggest_hurdle', e.target.value)}
                      placeholder="e.g., Time management, Budget concerns"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                </div>
              </div>

              {/* Dietary Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🍽️ Dietary Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Protein Preference</label>
                    <input
                      type="text"
                      value={formData.protein_preference || ''}
                      onChange={(e) => handleFormChange('protein_preference', e.target.value)}
                      placeholder="e.g., Chicken, Beef, Fish, Vegetarian"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Dietary Preference</label>
                    <input
                      type="text"
                      value={formData.dietary_preference || ''}
                      onChange={(e) => handleFormChange('dietary_preference', e.target.value)}
                      placeholder="e.g., Keto, Vegan, Paleo, Mediterranean"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Dietary Restrictions</label>
                    <input
                      type="text"
                      value={formData.dietary_restrictions || ''}
                      onChange={(e) => handleFormChange('dietary_restrictions', e.target.value)}
                      placeholder="e.g., Gluten-free, Dairy-free, Nut allergy"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Foods to Avoid</label>
                    <textarea
                      value={formData.foods_to_avoid || ''}
                      onChange={(e) => handleFormChange('foods_to_avoid', e.target.value)}
                      placeholder="e.g., Spicy foods, Shellfish, Mushrooms"
                      className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10 resize-none h-20"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📝 Notes</h3>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  placeholder="Any additional notes about the customer..."
                  className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10 resize-none h-24"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-[#E4D8C9]">
                <button
                  onClick={() => {
                    setShowAddCustomer(false)
                    setEditingCustomer(null)
                    setFormData({
                      name: '',
                      email: '',
                      phone: '',
                      address: '',
                      apt_gate_code: '',
                      payment_mode: '',
                      household_size: undefined,
                      occupation: '',
                      primary_goal: '',
                      biggest_hurdle: '',
                      protein_preference: '',
                      dietary_preference: '',
                      dietary_restrictions: '',
                      foods_to_avoid: '',
                      notes: '',
                    })
                  }}
                  className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-4 py-3 text-sm font-extrabold text-[#4B2B1D] hover:bg-[#F8F2E8] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomer}
                  className="flex-1 rounded-lg bg-[#16A34A] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50 transition"
                >
                  {editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {showCustomerDetail && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-3xl w-full my-8">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">{selectedCustomer.name}</h2>
              <button
                onClick={() => setShowCustomerDetail(false)}
                className="text-[#755B4C] hover:text-[#4B2B1D]"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* Contact Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📋 Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.email && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Email</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.email}</p>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Phone</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.phone}</p>
                    </div>
                  )}
                  {selectedCustomer.payment_mode && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Payment Mode</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.payment_mode}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Address Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🏠 Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.address && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Street Address</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.address}</p>
                    </div>
                  )}
                  {selectedCustomer.apt_gate_code && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Apt / Gate Code</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.apt_gate_code}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">👤 Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.household_size && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Household Size</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.household_size} people</p>
                    </div>
                  )}
                  {selectedCustomer.occupation && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Occupation</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.occupation}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Goals & Preferences */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🎯 Goals & Preferences</h3>
                <div className="space-y-3">
                  {selectedCustomer.primary_goal && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Primary Goal</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.primary_goal}</p>
                    </div>
                  )}
                  {selectedCustomer.biggest_hurdle && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Biggest Hurdle</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.biggest_hurdle}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dietary Information */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🍽️ Dietary Information</h3>
                <div className="space-y-3">
                  {selectedCustomer.protein_preference && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Protein Preference</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.protein_preference}</p>
                    </div>
                  )}
                  {selectedCustomer.dietary_preference && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Dietary Preference</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.dietary_preference}</p>
                    </div>
                  )}
                  {selectedCustomer.dietary_restrictions && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Restrictions</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.dietary_restrictions}</p>
                    </div>
                  )}
                  {selectedCustomer.foods_to_avoid && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Foods to Avoid</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.foods_to_avoid}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Metrics */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📊 Order History</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Active Weeks</p>
                    <p className="text-2xl font-extrabold text-[#2E527F] mt-2">{selectedCustomer.weeks_active || 0}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Total Meals</p>
                    <p className="text-2xl font-extrabold text-[#D97706] mt-2">{selectedCustomer.total_meals_ordered || 0}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Lifetime Value</p>
                    <p className="text-2xl font-extrabold text-[#16A34A] mt-2">${getLifetimeValue(selectedCustomer.lifetime_value_cents || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedCustomer.notes && (
                <div>
                  <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📝 Notes</h3>
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-sm text-[#4B2B1D]">{selectedCustomer.notes}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-[#E4D8C9]">
                <button
                  onClick={() => {
                    openEditCustomer(selectedCustomer)
                    setShowCustomerDetail(false)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#2E527F] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#24466E] transition"
                >
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </button>
                <button
                  onClick={() => {
                    handleDeleteCustomer(selectedCustomer.id)
                    setShowCustomerDetail(false)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-[#D62F3D] text-[#D62F3D] px-4 py-3 text-sm font-extrabold hover:bg-[#FFF4F4] transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
