import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LoginPage from './pages/Login'
import Fit4SureRecipesPage from './pages/Recipes.tsx'
import InventoryPage from './pages/Inventory.tsx'
import OrdersPage from './pages/Orders.tsx'
import MenuPlannerPage from './pages/MenuPlanner.tsx'
import TaskDashboardPage from './pages/TaskDashboard.tsx'
import OperationsHubPage from './pages/OperationsHub.tsx'
import ProductionSOPPage from './pages/ProductionSOP.tsx'
import CustomersPage from './pages/Customers.tsx'
import FinancialsPage from './pages/Financials.tsx'
import ReportsPage from './pages/Reports.tsx'
import SettingsPage from './pages/Settings.tsx'
import TestPage from './pages/Test.tsx'
import { Navigation } from './components/Navigation'
import { KitchenConverter } from './components/KitchenConverter'

function MealPlan() {
  return <div style={{ padding: '2rem' }}><h1>Meal Plan</h1><p>Coming soon</p></div>
}

function App() {
  const token = localStorage.getItem('token') || (import.meta.env.DEV ? 'dev-mode' : null)
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const isSOPPage = location.pathname.startsWith('/operational-optimization/sop/')
  const [converterCollapsed, setConverterCollapsed] = React.useState(
    () => localStorage.getItem('kitchenConverterCollapsed') === 'true'
  )
  const showChrome = token && !isLoginPage && !isSOPPage
  const contentMarginLeft = showChrome ? 256 + (converterCollapsed ? 0 : 288) : 0

  return (
    <div>
      {showChrome && <Navigation />}
      {showChrome && <KitchenConverter collapsed={converterCollapsed} onCollapsedChange={setConverterCollapsed} />}
      <div style={showChrome ? { marginLeft: `${contentMarginLeft}px`, transition: 'margin-left 0.15s ease' } : {}}>
        <Routes>
          <Route path="/test" element={<TestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
          <Route path="/operational-optimization" element={token ? <OperationsHubPage /> : <Navigate to="/login" />} />
          <Route path="/operational-optimization/sop/:taskId" element={token ? <ProductionSOPPage /> : <Navigate to="/login" />} />
          <Route path="/operations-hub" element={<Navigate to="/operational-optimization" />} />
          <Route path="/task-management" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={token ? <TaskDashboardPage /> : <Navigate to="/login" />} />
          <Route path="/orders" element={token ? <OrdersPage /> : <Navigate to="/login" />} />
          <Route path="/customers" element={token ? <CustomersPage /> : <Navigate to="/login" />} />
          <Route path="/customers-proposal" element={<Navigate to="/customers" replace />} />
          <Route path="/menu-planner" element={token ? <MenuPlannerPage /> : <Navigate to="/login" />} />
          <Route path="/recipes" element={token ? <Fit4SureRecipesPage /> : <Navigate to="/login" />} />
          <Route path="/inventory" element={token ? <InventoryPage /> : <Navigate to="/login" />} />
          <Route path="/financials" element={token ? <FinancialsPage /> : <Navigate to="/login" />} />
          <Route path="/meal-plan" element={token ? <MealPlan /> : <Navigate to="/login" />} />
          <Route path="/reports" element={token ? <ReportsPage /> : <Navigate to="/login" />} />
          <Route path="/settings" element={token ? <SettingsPage /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
