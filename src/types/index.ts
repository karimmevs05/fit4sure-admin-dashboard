export interface User {
  user_id: number
  email: string
  display_name?: string
  role: 'admin' | 'customer' | 'meal_prep' | 'finance'
}

export interface Client {
  client_id: number
  name: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  status: 'active' | 'paused' | 'inactive'
  subscription_type: 'weekly' | 'biweekly' | 'monthly'
  participants_count: number
  dietary_restrictions: string[]
  notes?: string
  created_at: string
}

export interface Recipe {
  recipe_id: number
  name: string
  category: string
  prep_time_minutes: number
  servings: number
  instructions: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  cost_per_serving_cents: number
  tags: string[]
  is_available: boolean
  created_at: string
}

export interface InventoryItem {
  inventory_id: number
  ingredient_name: string
  current_quantity: number
  unit: string
  location: 'fridge' | 'freezer' | 'pantry'
  low_stock_threshold: number
  cost_per_unit_cents: number
  last_restocked_at: string
}

export interface WeeklyPrepSchedule {
  schedule_id: number
  week_start: string
  recipe_id: number
  client_id?: number
  servings_needed: number
  prep_date: string
  status: 'pending' | 'in_prep' | 'ready' | 'delivered'
  prep_notes?: string
}

export interface MenuSubmission {
  submission_id: number
  client_id: number
  week_start: string
  status: 'submitted' | 'approved' | 'rejected' | 'pending_review'
  preferences: Record<string, any>
  submitted_at: string
  reviewed_at?: string
  review_notes?: string
}
