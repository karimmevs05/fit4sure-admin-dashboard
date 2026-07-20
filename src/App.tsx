import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard.tsx'
import OperationalOptimizationPage from './pages/OperationalOptimization.tsx'
import TaskManagementPage from './pages/TaskManagement.tsx'
import Fit4SureRecipesPage from './pages/Recipes.tsx'
import InventoryPage from './pages/Inventory.tsx'
import OrdersPage from './pages/Orders.tsx'
import MenuPlannerPage from './pages/MenuPlanner.tsx'
import CustomersPage from './pages/Customers.tsx'
import FinancialsPage from './pages/Financials.tsx'
import ReportsPage from './pages/Reports.tsx'
import TestPage from './pages/Test.tsx'
import { Navigation } from './components/Navigation'

function MealPlan() {
  return <div style={{ padding: '2rem' }}><h1>Meal Plan</h1><p>Coming soon</p></div>
}

function Settings() {
  return <div style={{ padding: '2rem' }}><h1>Settings</h1><p>Coming soon</p></div>
}

function App() {
  const token = localStorage.getItem('token') || (import.meta.env.DEV ? 'dev-mode' : null)
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  return (
    <div>
      {token && !isLoginPage && <Navigation />}
      <div style={token && !isLoginPage ? { marginLeft: '256px' } : {}}>
        <Routes>
          <Route path="/test" element={<TestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={token ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
          <Route path="/operational-optimization" element={token ? <OperationalOptimizationPage /> : <Navigate to="/login" />} />
          <Route path="/task-management" element={token ? <TaskManagementPage /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={token ? <DashboardPage /> : <Navigate to="/login" />} />
          <Route path="/orders" element={token ? <OrdersPage /> : <Navigate to="/login" />} />
          <Route path="/customers" element={token ? <CustomersPage /> : <Navigate to="/login" />} />
          <Route path="/menu-planner" element={token ? <MenuPlannerPage /> : <Navigate to="/login" />} />
          <Route path="/recipes" element={token ? <Fit4SureRecipesPage /> : <Navigate to="/login" />} />
          <Route path="/inventory" element={token ? <InventoryPage /> : <Navigate to="/login" />} />
          <Route path="/financials" element={token ? <FinancialsPage /> : <Navigate to="/login" />} />
          <Route path="/meal-plan" element={token ? <MealPlan /> : <Navigate to="/login" />} />
          <Route path="/reports" element={token ? <ReportsPage /> : <Navigate to="/login" />} />
          <Route path="/settings" element={token ? <Settings /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
