import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  PieChart,
  ShoppingCart,
  Users,
  Calendar,
  UtensilsCrossed,
  Package,
  DollarSign,
  ListTodo,
  FileText,
  Settings,
  LogOut
} from 'lucide-react'

export function Navigation() {
  const location = useLocation()

  const tabs = [
    { path: '/operational-optimization', label: 'Operational Optimization', icon: BarChart3 },
    { path: '/dashboard', label: 'Dashboard', icon: PieChart },
    { path: '/task-management', label: 'Task Management', icon: ListTodo },
    { path: '/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/customers', label: 'Customers', icon: Users },
    { path: '/menu-planner', label: 'Menu Planner', icon: Calendar },
    { path: '/recipes', label: 'Recipes', icon: UtensilsCrossed },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/financials', label: 'Financials', icon: DollarSign },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 bg-[#E9DFD0] border-r border-[#D8CDBE] flex flex-col" style={{ width: '256px', minWidth: '256px', zIndex: 40 }}>
      {/* Logo/Branding */}
      <div className="p-6 border-b border-[#D8CDBE]">
        <h1 className="text-2xl font-bold text-[#4B2B1D]">Fit4Sure</h1>
        <p className="text-xs text-[#9A8774] mt-1">Admin Dashboard</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = location.pathname === tab.path

            return (
              <li key={tab.path}>
                <Link
                  to={tab.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#2F5F98] text-white'
                      : 'text-[#4B2B1D] hover:bg-[#D8CDBE] hover:text-[#2F5F98]'
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-medium truncate">{tab.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-[#D8CDBE]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-[#4B2B1D] hover:bg-[#D8CDBE] transition-colors"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  )
}
