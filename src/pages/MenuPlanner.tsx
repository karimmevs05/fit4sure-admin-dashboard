import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Pencil, Check, X, ExternalLink, Send, UtensilsCrossed, Printer, DollarSign } from 'lucide-react'
import RecipePlanSection, { rowKey } from '../components/RecipePlanSection'
import type { Block, PlanRecipeRow, PlateOption } from '../components/RecipePlanSection'
import { PlateCostSimulator } from '../components/PlateCostSimulator'
import { formatIngredientWeight } from '../utils/unitConversion'
import { CATEGORY_GROUP, GROUP_ORDER } from '../utils/categoryGroups'
import { fetchPlateConfig, plateComponentFor, servingGramsFor } from '../utils/plateStructure'
import type { PlateFormatConfig } from '../utils/plateStructure'
import WeeklyPrepPage from './WeeklyPrep'
import PortionsPricingPanel from '../components/PortionsPricingPanel'
import type { PlateIngredientOption } from '../components/PlateExtraIngredientPicker'

const GRAMS_PER_POUND = 455

type MenuItem = { id: number; name: string; category: string; recipeId: number | null; expectedVolume: number; prepMinutes: number | null }
type CurrentWeekMenu = { monday: MenuItem[]; thursday: MenuItem[] }
type RecipeCompletion = { done: number; total: number }

const formatMinutes = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`)

// Green once every checklist item is done, amber mid-way, plain gray before
// the recipe's prep day has even arrived (total === 0 -- nothing to be
// behind on yet, so it shouldn't read as a problem the way 0% of a nonzero
// total would).
const completionColor = (done: number, total: number) => {
  if (total === 0) return '#9A7E6F'
  if (done >= total) return '#16A34A'
  return '#D97706'
}

type PrepIngredient = {
  inventoryId: number
  name: string
  category: string
  neededG: number
  neededGByBlock: { monday: number; thursday: number }
  shortfallG: number
  unitPriceCents: number
  currentStockG: number
  store: string | null
  grade: string | null
}

type BlockFinancials = { costCents: number; lb: number; recipeCount: number }

type PrepAndFinancials = {
  ingredients: PrepIngredient[]
  financials: { monday: BlockFinancials; thursday: BlockFinancials; combined: BlockFinancials }
}

// Kitchen + Procurement + Operations tasks for the selected week -- the
// departments that actually get that week's meals out the door (shopping,
// prep/production, packing, delivery), as opposed to Sales/Marketing/
// Finance/etc. Sourced from the same recurring task-template system
// Operations Hub manages; this is a read + check-off view, not a second
// place to create or edit tasks.
const FULFILLMENT_DEPARTMENTS = new Set(['Kitchen', 'Procurement', 'Operations'])
const OPERATIONAL_DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

type FulfillmentTask = {
  id: number
  title: string
  department: string
  status: string
  operational_day: string | null
  owner_name: string | null
  checklist_total: number
  checklist_done: number
}

// One row per customer with a real order this week -- who's actually
// getting what, split Monday/Thursday/Breakfast. Same shape and source
// (/api/admin/prep/:week) as Weekly Prep's own Customer Orders table.
type Delivery = {
  id: number
  name: string
  total_meals_monday: number
  total_meals_thursday: number
  breakfast_meals: number
  total_meals: number
}

export default function MenuPlannerPage() {
  const [weekStart, setWeekStart] = useState<{ sunday?: string; monday?: string; thursday?: string }>({})
  const [currentWeekMenu, setCurrentWeekMenu] = useState<CurrentWeekMenu>({ monday: [], thursday: [] })
  const [showPrepPage, setShowPrepPage] = useState(false)
  const [activeTab, setActiveTab] = useState<'plan' | 'pricing'>('plan')
  const [editingPlanItemId, setEditingPlanItemId] = useState<number | null>(null)
  const [editVolumeValue, setEditVolumeValue] = useState('')
  const [savingVolume, setSavingVolume] = useState(false)
  const [openMenuGroup, setOpenMenuGroup] = useState<string | null>(null)
  const [recipeCompletion, setRecipeCompletion] = useState<Record<string, RecipeCompletion>>({})
  const [prepFinancials, setPrepFinancials] = useState<PrepAndFinancials>({
    ingredients: [],
    financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
  })
  const [loading, setLoading] = useState(true)
  const [publishStatus, setPublishStatus] = useState<{ published: boolean; publishedAt: string | null } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)

  // Weekly Recipe Plan block state -- owned here (not inside
  // RecipePlanSection) so the Custom Plate Builder can add a combo straight
  // into a block's in-memory state without a second component racing to
  // read-modify-write the same replace-all save endpoint independently.
  const [planWeekStart, setPlanWeekStart] = useState<string | undefined>()
  const [rows, setRows] = useState<Record<Block, PlanRecipeRow[]>>({ monday: [], thursday: [] })
  const [dirty, setDirty] = useState<Record<Block, boolean>>({ monday: false, thursday: false })
  const [savingBlock, setSavingBlock] = useState<Block | null>(null)

  // Recipes actually live on this week's plan (either block, checked "on")
  // -- scopes Portions & Pricing's recipe selector to what's really being
  // sold this week instead of every recipe ever created.
  const weekActiveRecipes = useMemo(() => {
    const byId = new Map<number, string>()
    for (const block of ['monday', 'thursday'] as Block[]) {
      for (const r of rows[block]) {
        if (r.selected && r.recipe_id != null) byId.set(r.recipe_id, r.name)
      }
    }
    return Array.from(byId, ([recipe_id, name]) => ({ recipe_id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  // ISO date (YYYY-MM-DD) for the Sunday that starts "this week" -- same
  // Sunday-anchored boundary Orders.tsx uses for its own "View Weekly Prep"
  // button, so Weekly Prep opens on the same week regardless of which page
  // it's launched from.
  const currentWeekStart = useMemo(() => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    const y = sunday.getFullYear()
    const m = String(sunday.getMonth() + 1).padStart(2, '0')
    const d = String(sunday.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  const nextWeekStart = useMemo(() => {
    const [y, m, d] = currentWeekStart.split('-').map(Number)
    const sunday = new Date(y, m - 1, d + 7)
    return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
  }, [currentWeekStart])

  // Defaults to the ongoing week (what's actually live right now) rather
  // than next week's blank draft -- landing on an empty "Nothing added yet"
  // screen read as broken. Next week is still one click away via the
  // "Next week" quick-jump below, for planning ahead.
  const [targetWeekStart, setTargetWeekStart] = useState<string>(currentWeekStart)
  // Owned here, not inside RecipePlanSection, so isolating to one block
  // also filters This Week's Menu / Shopping List / Financials below --
  // not just that section's own two cards.
  const [blockView, setBlockView] = useState<'both' | Block>('both')
  const [plateFormats, setPlateFormats] = useState<PlateFormatConfig[]>([])
  const [fulfillmentTasks, setFulfillmentTasks] = useState<FulfillmentTask[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  // Real ordered quantity per recipe name + day, for the ALWAYS-current
  // week (not whichever week is being planned above) -- keyed
  // "name|day" since /api/admin/prep's recipes array is keyed by menu_id,
  // not recipe_id, and name is the one thing both sides share. Same
  // name-based matching This Week's Menu already uses for prep completion.
  const [currentWeekOrderedByRecipe, setCurrentWeekOrderedByRecipe] = useState<Record<string, number>>({})
  const [plateOptions, setPlateOptions] = useState<PlateOption[]>([])
  const [storeAddresses, setStoreAddresses] = useState<Record<string, string>>({})
  // Full inventory catalog (not scoped to this week's plan) -- lets the
  // Plate Builder's "Add Ingredient" offer any garnish on file (maple
  // syrup, parmesan, etc.), not just this week's selected recipes.
  const [inventoryItems, setInventoryItems] = useState<PlateIngredientOption[]>([])

  useEffect(() => {
    fetchAll()
    fetchPlateConfig(apiUrl, token).then((cfg) => cfg && setPlateFormats(cfg.formats))
    fetchStoreAddresses()
    fetchInventoryItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchInventoryItems = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setInventoryItems(
        (res.data.data || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          unitPriceCents: i.unit_price_cents,
          caloriesPer100g: i.calories_per_100g,
          proteinPer100g: i.protein_per_100g,
          carbsPer100g: i.carbs_per_100g,
          fatPer100g: i.fat_per_100g,
        }))
      )
    } catch (error) {
      console.error('Error fetching inventory items:', error)
    }
  }

  const fetchStoreAddresses = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/store-addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const byStore: Record<string, string> = {}
      for (const s of res.data.data || []) {
        if (s.address) byStore[s.store] = s.address
      }
      setStoreAddresses(byStore)
    } catch (error) {
      console.error('Error fetching store addresses:', error)
    }
  }

  const saveStoreAddress = async (store: string, address: string) => {
    try {
      await axios.put(
        `${apiUrl}/api/admin/menu-planner/store-addresses/${encodeURIComponent(store)}`,
        { address },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setStoreAddresses((current) => ({ ...current, [store]: address }))
    } catch (error) {
      console.error('Error saving store address:', error)
      alert('Failed to save store address')
    }
  }

  // Re-fetches the draft plan, publish status, and prep/financials together
  // whenever the target week changes -- Submit Menu's label/status live
  // next to this picker, so they need to update together, not just the
  // block cards below.
  useEffect(() => {
    loadWeek(targetWeekStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWeekStart])

  // weekStart is always explicit (never defaulted from targetWeekStart
  // inside fetchPlan/fetchPrepFinancials) -- undefined here means "the
  // default week", same as the backend's own default-when-omitted.
  const loadWeek = (weekStart?: string) => {
    fetchPlan(weekStart)
    fetchPublishStatus(weekStart)
    fetchPrepFinancials(weekStart)
    fetchFulfillmentTasks(weekStart || currentWeekStart)
    fetchDeliveries(weekStart || currentWeekStart)
    fetchPlateOptions(weekStart)
  }

  const fetchDeliveries = async (weekStart: string) => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/prep/${weekStart}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setDeliveries(res.data.data?.orders || [])
    } catch (error) {
      console.error('Error fetching deliveries:', error)
    }
  }

  const fetchPlateOptions = async (weekStart?: string) => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/plate-options`, {
        headers: { Authorization: `Bearer ${token}` },
        params: weekStart ? { week_start: weekStart } : undefined,
      })
      setPlateOptions(res.data.data || [])
    } catch (error) {
      console.error('Error fetching plate options:', error)
    }
  }

  const createPlateOption = async (
    block: Block,
    proteinRecipeId: number,
    sideRecipeIds: number[],
    name: string,
    extraIngredients: { inventoryId: number; grams: number }[]
  ) => {
    try {
      await axios.post(
        `${apiUrl}/api/admin/menu-planner/plate-options`,
        {
          block,
          protein_recipe_id: proteinRecipeId,
          side_recipe_ids: sideRecipeIds,
          extra_ingredients: extraIngredients,
          name: name || null,
          week_start: targetWeekStart,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchPlateOptions(targetWeekStart)
    } catch (error: any) {
      console.error('Error creating plate option:', error)
      alert(error.response?.data?.error || 'Failed to create plate')
    }
  }

  const updatePlateOption = async (
    id: number,
    block: Block,
    proteinRecipeId: number,
    sideRecipeIds: number[],
    name: string,
    extraIngredients: { inventoryId: number; grams: number }[]
  ) => {
    try {
      await axios.put(
        `${apiUrl}/api/admin/menu-planner/plate-options/${id}`,
        {
          block,
          protein_recipe_id: proteinRecipeId,
          side_recipe_ids: sideRecipeIds,
          extra_ingredients: extraIngredients,
          name: name || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchPlateOptions(targetWeekStart)
    } catch (error: any) {
      console.error('Error updating plate option:', error)
      alert(error.response?.data?.error || 'Failed to update plate')
    }
  }

  const deletePlateOption = async (id: number) => {
    const previous = plateOptions
    setPlateOptions((current) => current.filter((p) => p.id !== id))
    try {
      await axios.delete(`${apiUrl}/api/admin/menu-planner/plate-options/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (error) {
      console.error('Error deleting plate option:', error)
      setPlateOptions(previous)
    }
  }

  const fetchFulfillmentTasks = async (weekStart: string) => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/tasks/week/${weekStart}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const days: Record<string, any[]> = res.data.data?.days || {}
      const tasks = Object.values(days)
        .flat()
        .filter((t: any) => FULFILLMENT_DEPARTMENTS.has(t.department))
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          department: t.department,
          status: t.status,
          operational_day: t.operational_day,
          owner_name: t.owner_name,
          checklist_total: parseInt(t.checklist_total, 10) || 0,
          checklist_done: parseInt(t.checklist_done, 10) || 0,
        }))
      setFulfillmentTasks(tasks)
    } catch (error) {
      console.error('Error fetching fulfillment tasks:', error)
    }
  }

  const toggleFulfillmentTask = async (task: FulfillmentTask) => {
    const completed = task.status !== 'completed'
    setFulfillmentTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: completed ? 'completed' : 'not_started' } : t))
    )
    try {
      await axios.post(
        `${apiUrl}/api/admin/tasks/${task.id}/complete`,
        { completed },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (error) {
      console.error('Error toggling fulfillment task:', error)
      setFulfillmentTasks((current) => current.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const createFulfillmentTask = async (title: string, department: string, operationalDay: string) => {
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/tasks`,
        { title, department, operational_day: operationalDay, week_start: targetWeekStart },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const t = res.data.data
      setFulfillmentTasks((current) => [
        ...current,
        {
          id: t.id,
          title: t.title,
          department: t.department,
          status: t.status,
          operational_day: t.operational_day,
          owner_name: null,
          checklist_total: 0,
          checklist_done: 0,
        },
      ])
    } catch (error: any) {
      console.error('Error creating fulfillment task:', error)
      alert(error.response?.data?.error || 'Failed to create task')
    }
  }

  // Drag-and-drop between day accordions -- re-homes a task to a
  // different operational_day, same field Operations Hub's own task
  // editor writes. Optimistic update with rollback on failure, same
  // pattern as the checkbox toggle above.
  const moveFulfillmentTaskToDay = async (taskId: number, operationalDay: string) => {
    const previous = fulfillmentTasks
    setFulfillmentTasks((current) => current.map((t) => (t.id === taskId ? { ...t, operational_day: operationalDay } : t)))
    try {
      await axios.patch(
        `${apiUrl}/api/admin/tasks/${taskId}`,
        { operational_day: operationalDay },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (error) {
      console.error('Error moving fulfillment task:', error)
      setFulfillmentTasks(previous)
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const [currentWeekRes, nextWeekRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/current-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/next-week`, { headers }),
      ])

      setCurrentWeekMenu(currentWeekRes.data.data || { monday: [], thursday: [] })
      setWeekStart(nextWeekRes.data.data || {})
    } catch (error) {
      console.error('Error fetching menu planner data:', error)
    } finally {
      setLoading(false)
    }
    fetchRecipeCompletion()
    fetchCurrentWeekOrdered()
  }

  // Real ordered quantity per menu item this week, matched back onto This
  // Week's Menu by name (same name-based join fetchRecipeCompletion
  // already relies on) -- lets a recipe row show how much of its
  // forecasted lb customers have actually committed to, not just the
  // forecast itself.
  const fetchCurrentWeekOrdered = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/prep/${currentWeekStart}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const byRecipe: Record<string, number> = {}
      for (const r of res.data.data?.recipes || []) {
        const key = `${(r.name || '').toLowerCase()}|${(r.day_of_week || '').toLowerCase()}`
        byRecipe[key] = (byRecipe[key] || 0) + (parseFloat(r.quantity) || 0)
      }
      setCurrentWeekOrderedByRecipe(byRecipe)
    } catch (error) {
      console.error('Error fetching current week ordered quantities:', error)
    }
  }

  // weekStart omitted = the default "next week" check, same as before this
  // picker existed.
  const fetchPublishStatus = async (weekStart?: string) => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/publish-status`, {
        headers: { Authorization: `Bearer ${token}` },
        params: weekStart ? { week_start: weekStart } : undefined,
      })
      setPublishStatus(res.data.data || null)
    } catch (error) {
      console.error('Error fetching publish status:', error)
    }
  }

  // Real completion, from the exact same Kitchen batch/production tasks
  // weekly_recipe_plan generates -- not a separate estimate. Matched back
  // onto This Week's Menu by recipe name (task_checklist_items.group_label
  // is the recipe name, same join adminTasks.js's recipe-status endpoint
  // already does), so "what we committed to" and "how much is actually
  // done" sit in the same row instead of two different pages.
  const fetchRecipeCompletion = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/tasks/week/${currentWeekStart}/recipe-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const byName: Record<string, RecipeCompletion> = {}
      for (const r of res.data.data?.recipes || []) {
        byName[r.name] = { done: r.done, total: r.total }
      }
      setRecipeCompletion(byName)
    } catch (error) {
      console.error('Error fetching recipe completion:', error)
    }
  }

  const startEditVolume = (item: MenuItem) => {
    setEditingPlanItemId(item.id)
    setEditVolumeValue(String(item.expectedVolume))
  }

  // How much of a This Week's Menu row's forecasted lb real customer
  // orders have already claimed -- grams committed (at the Regular
  // serving size, the same approximation the rest of the app uses for
  // "how many servings does this lb support") and that as a % of the
  // forecast. Null when there's nothing to compare (no orders yet, no
  // category mapping, or regular format config not loaded).
  const committedFor = (item: MenuItem, dayLabel: string) => {
    const regularFormat = plateFormats?.find((f) => f.structure === 'Regular')
    if (!regularFormat) return null
    const orderedQty = currentWeekOrderedByRecipe[`${item.name.toLowerCase()}|${dayLabel.toLowerCase()}`] || 0
    if (orderedQty === 0) return null
    const component = plateComponentFor(item.category)
    if (!component) return null
    const servingG = servingGramsFor(regularFormat, component)
    if (!servingG) return null
    const committedG = Math.round(orderedQty * servingG)
    const forecastG = (item.expectedVolume || 0) * 453.592
    return { committedG, forecastG: Math.round(forecastG), pct: forecastG > 0 ? Math.round((committedG / forecastG) * 100) : null }
  }

  // Corrects a single row's forecasted lb after the fact -- see the
  // PATCH /weekly-plan/:id comment on the backend for why this
  // deliberately doesn't re-run the prep/procurement sync a real block
  // save does (this week may already have checklist progress on it).
  const saveExpectedVolume = async (item: MenuItem) => {
    const volume = Number(editVolumeValue)
    if (!Number.isFinite(volume) || volume < 0) return
    setSavingVolume(true)
    try {
      await axios.patch(
        `${apiUrl}/api/admin/menu-planner/weekly-plan/${item.id}`,
        { expected_volume: volume },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setCurrentWeekMenu((prev) => ({
        monday: prev.monday.map((i) => (i.id === item.id ? { ...i, expectedVolume: volume } : i)),
        thursday: prev.thursday.map((i) => (i.id === item.id ? { ...i, expectedVolume: volume } : i)),
      }))
      setEditingPlanItemId(null)
    } catch (error) {
      console.error('Error updating expected volume:', error)
    } finally {
      setSavingVolume(false)
    }
  }

  // Go-live for the whole week (both blocks) at once -- until this is
  // confirmed, saved block edits stay staff-only; the real customer
  // ordering page keeps showing "not posted yet" regardless of what's
  // saved. Gated behind a review modal (see showPublishConfirm) so a
  // block that looks wrong is caught before it reaches real customers,
  // not after.
  const publishMenu = async () => {
    setPublishing(true)
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/menu-planner/publish`,
        { week_start: targetWeekStart },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPublishStatus(res.data.data)
      setShowPublishConfirm(false)
    } catch (error) {
      console.error('Error publishing menu:', error)
    } finally {
      setPublishing(false)
    }
  }

  // weekStart is always explicit, never defaulted from targetWeekStart here
  // -- undefined vs. "not passed" can't be told apart through a single `??`
  // fallback (bit us once: a quick-jump button passing a deliberate value
  // got silently coalesced back to the stale week still sitting in state).
  // Callers that want the currently-selected week pass targetWeekStart
  // themselves.
  const fetchPlan = async (ws?: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      // Two calls: the plan endpoint knows what's selected/forecasted, the
      // recipes endpoint knows the per-lb (455g) macros/cost every other
      // recipe view in this app already uses -- merge them by recipe_id
      // rather than duplicating that calculation on the backend here too.
      const [planRes, recipesRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/recipe-plan`, {
          headers,
          params: ws ? { week_start: ws } : undefined,
        }),
        axios.get(`${apiUrl}/api/admin/recipes`, { headers }),
      ])

      const macrosById: Record<number, { calories: number; protein_g: number; carbs_g: number; fat_g: number; costPerPoundCents: number; suggestedServingG: number | null; supplierName: string | null }> = {}
      for (const r of recipesRes.data.data || []) {
        macrosById[r.recipe_id] = {
          calories: r.per_pound?.calories ?? 0,
          protein_g: parseFloat(r.per_pound?.protein_g ?? '0'),
          carbs_g: parseFloat(r.per_pound?.carbs_g ?? '0'),
          fat_g: parseFloat(r.per_pound?.fat_g ?? '0'),
          costPerPoundCents: r.cost_per_pound_cents ?? 0,
          suggestedServingG: r.suggested_serving_g != null ? parseFloat(r.suggested_serving_g) : null,
          supplierName: r.main_ingredient_store || null,
        }
      }

      // Custom rows already carry their own macros/cost straight from the
      // server -- don't stomp them with the (nonexistent) recipe lookup.
      const withMacros = (list: any[]): PlanRecipeRow[] =>
        list.map((r) => (r.isCustom ? r : { ...r, ...(macrosById[r.recipe_id] || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, costPerPoundCents: 0, suggestedServingG: null, supplierName: null }) }))

      setRows({
        monday: withMacros(planRes.data.data?.monday || []),
        thursday: withMacros(planRes.data.data?.thursday || []),
      })
      // weekStart comes back as a full ISO timestamp; the date <input>
      // above only accepts a plain YYYY-MM-DD or it silently renders blank.
      setPlanWeekStart(planRes.data.data?.weekStart?.slice(0, 10))
      setDirty({ monday: false, thursday: false })
    } catch (error) {
      console.error('Error fetching recipe plan:', error)
    }
  }

  const addRecipe = (block: Block, recipeId: number) => {
    setRows((current) => ({
      ...current,
      [block]: current[block].map((r) =>
        r.recipe_id === recipeId ? { ...r, selected: true, expected_volume: r.expected_volume || 1 } : r
      ),
    }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  const removeRow = (block: Block, row: PlanRecipeRow) => {
    const key = rowKey(row)
    setRows((current) => ({
      ...current,
      [block]: row.isCustom
        ? current[block].filter((r) => rowKey(r) !== key)
        : current[block].map((r) => (rowKey(r) === key ? { ...r, selected: false } : r)),
    }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  const updateVolume = (block: Block, row: PlanRecipeRow, volume: number) => {
    const key = rowKey(row)
    setRows((current) => ({
      ...current,
      [block]: current[block].map((r) => (rowKey(r) === key ? { ...r, expected_volume: volume } : r)),
    }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  // Hybrid entry point for the Custom Plate Builder above -- a combo of real
  // recipes (already priced/macro'd per lb by the simulator) becomes one
  // line item in a block, same as a manually-typed custom row would.
  const addComboToBlock = (
    block: Block,
    combo: { name: string; lb: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; costPerPoundCents: number }
  ) => {
    const newRow: PlanRecipeRow = {
      recipe_id: null,
      tempId: Date.now(),
      isCustom: true,
      name: combo.name,
      category: 'custom',
      selected: true,
      expected_volume: combo.lb,
      calories: combo.calories,
      protein_g: combo.protein_g,
      carbs_g: combo.carbs_g,
      fat_g: combo.fat_g,
      costPerPoundCents: combo.costPerPoundCents,
    }
    setRows((current) => ({ ...current, [block]: [...current[block], newRow] }))
    setDirty((d) => ({ ...d, [block]: true }))
  }

  const buildSelections = (block: Block) =>
    rows[block]
      .filter((r) => r.selected)
      .map((r) =>
        r.isCustom
          ? {
              custom_name: r.name,
              expected_volume: r.expected_volume || 0,
              custom_calories: r.calories || undefined,
              custom_protein_g: r.protein_g || undefined,
              custom_carbs_g: r.carbs_g || undefined,
              custom_fat_g: r.fat_g || undefined,
              custom_cost_per_pound_cents: r.costPerPoundCents || undefined,
            }
          : { recipe_id: r.recipe_id, expected_volume: r.expected_volume || 0 }
      )

  const saveBlock = async (block: Block) => {
    setSavingBlock(block)
    try {
      await axios.post(
        `${apiUrl}/api/admin/menu-planner/recipe-plan`,
        { block, selections: buildSelections(block), week_start: targetWeekStart },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDirty((d) => ({ ...d, [block]: false }))
      fetchPrepFinancials(targetWeekStart)
      fetchPlan(targetWeekStart) // custom rows need their server-assigned `id` in place of `tempId`
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save recipe plan')
    } finally {
      setSavingBlock(null)
    }
  }

  // Re-homes an already-built block to a different date instead of
  // requiring it be torn down and rebuilt from scratch at the new week.
  // Two calls to the same replace-all endpoint: write the block's current
  // content to the new week, then clear it from the old week (empty
  // selections = delete-all for that block/week, same semantics Save Block
  // already relies on) -- a real move, not a copy that leaves a duplicate
  // behind at the old date.
  const moveBlockToWeek = async (block: Block, newWeekStart: string) => {
    setSavingBlock(block)
    try {
      const selections = buildSelections(block)
      await axios.post(
        `${apiUrl}/api/admin/menu-planner/recipe-plan`,
        { block, selections, week_start: newWeekStart },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (newWeekStart !== targetWeekStart) {
        await axios.post(
          `${apiUrl}/api/admin/menu-planner/recipe-plan`,
          { block, selections: [], week_start: targetWeekStart },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
      setDirty((d) => ({ ...d, [block]: false }))
      setTargetWeekStart(newWeekStart)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to move block')
    } finally {
      setSavingBlock(null)
    }
  }

  // Called after the Weekly Recipe Plan saves a block -- prep/financials are
  // derived from that plan, so they'd otherwise go stale until a full page
  // reload. Refetches just this one endpoint rather than everything.
  const fetchPrepFinancials = async (ws?: string) => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/prep-and-financials`, {
        headers: { Authorization: `Bearer ${token}` },
        params: ws ? { week_start: ws } : undefined,
      })
      setPrepFinancials(
        res.data.data || {
          ingredients: [],
          financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
        }
      )
    } catch (error) {
      console.error('Error fetching prep and financials:', error)
    }
  }

  if (showPrepPage) {
    return (
      <WeeklyPrepPage
        week={currentWeekStart}
        onBack={() => setShowPrepPage(false)}
        focusBlock={blockView !== 'both' ? blockView : undefined}
      />
    )
  }

  if (loading) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="text-[#755B4C]">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <>
    <main className="flex-1 space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Menu Planner</h1>
          <p className="mt-1 text-sm text-[#755B4C]">
            Building here creates the real menu for the week of {planWeekStart ? new Date(planWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} -- Block 1 delivers Monday, Block 2 delivers Thursday, that week.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#2E527F]">Week of:</label>
            <input
              type="date"
              value={targetWeekStart || planWeekStart || ''}
              onChange={(e) => e.target.value && setTargetWeekStart(e.target.value)}
              className="h-8 rounded border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
            />
            {targetWeekStart !== currentWeekStart && (
              <button
                onClick={() => setTargetWeekStart(currentWeekStart)}
                className="text-xs font-bold text-[#2E527F] hover:underline"
              >
                This week
              </button>
            )}
            {targetWeekStart !== nextWeekStart && (
              <button
                onClick={() => setTargetWeekStart(nextWeekStart)}
                className="text-xs font-bold text-[#2E527F] hover:underline"
              >
                Next week
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://fit4sure-admin-dashboard.pages.dev/order/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2E527F] px-3 text-xs font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View customer order page
            </a>
            <button
              onClick={() => setShowPublishConfirm(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 text-xs font-bold text-white hover:bg-[#15873F] transition"
            >
              <Send className="h-3.5 w-3.5" />
              {publishStatus?.published ? 'Re-submit Menu' : 'Submit Menu'}
            </button>
          </div>
          {publishStatus && (
            <p className={`text-xs font-medium text-right ${publishStatus.published ? 'text-[#16A34A]' : 'text-[#D97706]'}`}>
              {publishStatus.published
                ? `Live to customers for the week of ${new Date(publishStatus.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${publishStatus.publishedAt ? ` since ${new Date(publishStatus.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''} — further block edits go live immediately.`
                : `Draft for the week of ${new Date(publishStatus.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — customers see "menu isn't posted yet" until you press Submit Menu.`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#D8CDBE] pb-0">
        <button
          onClick={() => setActiveTab('plan')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'plan' ? 'border-[#2E527F] text-[#2E527F]' : 'border-transparent text-[#9A8774] hover:text-[#4B2B1D]'
          }`}
        >
          <UtensilsCrossed className="h-4 w-4" />
          Plan
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'pricing' ? 'border-[#2E527F] text-[#2E527F]' : 'border-transparent text-[#9A8774] hover:text-[#4B2B1D]'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Portions & Pricing
        </button>
      </div>

      {activeTab === 'pricing' && (
        <PortionsPricingPanel
          recipes={weekActiveRecipes}
          onSaved={() => fetchPlateConfig(apiUrl, token).then((cfg) => cfg && setPlateFormats(cfg.formats))}
        />
      )}

      <div className={activeTab === 'plan' ? 'space-y-6' : 'hidden'}>

      <PlateCostSimulator onAddToBlock={addComboToBlock} />

      <RecipePlanSection
        rows={rows}
        weekStart={planWeekStart}
        dirty={dirty}
        savingBlock={savingBlock}
        plateFormats={plateFormats}
        blockView={blockView}
        onBlockViewChange={setBlockView}
        onAddRecipe={addRecipe}
        onRemoveRow={removeRow}
        onUpdateVolume={updateVolume}
        onSaveBlock={saveBlock}
        onMoveBlock={moveBlockToWeek}
        plateOptions={plateOptions}
        onCreatePlate={createPlateOption}
        onUpdatePlate={updatePlateOption}
        onDeletePlate={deletePlateOption}
        inventoryItems={inventoryItems}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* This Week's Menu (real data -- the live weekly_recipe_plan for
            the current calendar week, not a retrospective of past orders).
            Grouped by category bucket (Proteins/Carbs/Veggies/Sauces/
            Breakfast) into one collapsible row each -- a 14-recipe week
            used to be a 14-row wall that dwarfed Shopping List and
            Financials next to it. Same collapsible-row pattern Shopping
            List uses for stores, expand a group to see (and edit) the
            individual recipes in it. */}
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="whitespace-nowrap text-lg font-extrabold text-[#4B2B1D]">This Week's Menu</h2>
            <button
              onClick={() => setShowPrepPage(true)}
              className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#16813D] px-3 text-xs font-bold text-white shadow-[0_6px_14px_rgba(22,129,61,0.18)] transition hover:bg-[#0d6a2d] active:scale-[0.98]"
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              View Weekly Prep
            </button>
          </div>

          {/* Two headline numbers: what this selection commits us to in
              labor (forecasted, scaled by lb -- see GET /current-week), and
              how much of that committed work is actually done so far
              (real, from the same Kitchen tasks Operations Hub tracks).
              The whole point of this section existing before Submit Menu
              is knowing both before it's live, not after. */}
          {(() => {
            const allItems = [
              ...(blockView !== 'thursday' ? currentWeekMenu.monday : []),
              ...(blockView !== 'monday' ? currentWeekMenu.thursday : []),
            ]
            const weekPrepMinutes = allItems.reduce((sum, i) => sum + (i.prepMinutes || 0), 0)
            const withCompletion = allItems.map((i) => recipeCompletion[i.name]).filter((c): c is RecipeCompletion => !!c && c.total > 0)
            const doneTotal = withCompletion.reduce((sum, c) => sum + c.done, 0)
            const itemsTotal = withCompletion.reduce((sum, c) => sum + c.total, 0)
            if (weekPrepMinutes === 0 && itemsTotal === 0) return null
            return (
              <div className="mb-4 grid grid-cols-2 gap-3">
                {weekPrepMinutes > 0 && (
                  <div className="rounded-xl border border-[#3E6594] bg-[#EAF0F7] px-4 py-3">
                    <p className="text-xs font-bold text-[#2E527F]">Est. prep time, this selection</p>
                    <p className="text-lg font-extrabold text-[#2E527F]">{formatMinutes(weekPrepMinutes)}</p>
                  </div>
                )}
                {itemsTotal > 0 && (
                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: completionColor(doneTotal, itemsTotal), backgroundColor: doneTotal >= itemsTotal ? '#EAF5EC' : '#FFF7E9' }}>
                    <p className="text-xs font-bold" style={{ color: completionColor(doneTotal, itemsTotal) }}>Prep completed so far</p>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-extrabold" style={{ color: completionColor(doneTotal, itemsTotal) }}>
                        {doneTotal}/{itemsTotal}
                      </p>
                      <p className="text-xs font-bold text-[#755B4C]">{Math.round((doneTotal / itemsTotal) * 100)}%</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          <div className="max-h-[420px] overflow-y-auto space-y-5 pr-1">
            {([
              { label: 'Monday', color: '#16A34A', items: currentWeekMenu.monday },
              { label: 'Thursday', color: '#D97706', items: currentWeekMenu.thursday },
            ] as const)
              .filter((day) => blockView === 'both' || (blockView === 'monday' ? day.label === 'Monday' : day.label === 'Thursday'))
              .map((day) => {
              const totalLb = day.items.reduce((sum, i) => sum + (i.expectedVolume || 0), 0)
              const totalPrepMinutes = day.items.reduce((sum, i) => sum + (i.prepMinutes || 0), 0)
              const dayCompletion = day.items.reduce(
                (acc, i) => {
                  const c = recipeCompletion[i.name]
                  if (c && c.total > 0) { acc.done += c.done; acc.total += c.total }
                  return acc
                },
                { done: 0, total: 0 }
              )
              const groups = GROUP_ORDER.map((group) => {
                const items = day.items.filter((i) => (CATEGORY_GROUP[i.category] || 'Custom') === group)
                const groupCompletion = items.reduce(
                  (acc, i) => {
                    const c = recipeCompletion[i.name]
                    if (c && c.total > 0) { acc.done += c.done; acc.total += c.total }
                    return acc
                  },
                  { done: 0, total: 0 }
                )
                return {
                  group,
                  items,
                  lb: items.reduce((sum, i) => sum + (i.expectedVolume || 0), 0),
                  prepMinutes: items.reduce((sum, i) => sum + (i.prepMinutes || 0), 0),
                  completion: groupCompletion,
                }
              }).filter((g) => g.items.length > 0)

              return (
                <div key={day.label}>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: day.color }}></div>
                    <p className="text-sm font-bold" style={{ color: day.color }}>{day.label}</p>
                    <span className="text-[10px] font-bold text-[#9A7E6F]">
                      {day.items.length} item{day.items.length === 1 ? '' : 's'}{totalLb > 0 ? ` · ${totalLb} lb total` : ''}{totalPrepMinutes > 0 ? ` · ~${formatMinutes(totalPrepMinutes)} prep` : ''}
                    </span>
                    {dayCompletion.total > 0 && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: completionColor(dayCompletion.done, dayCompletion.total), backgroundColor: dayCompletion.done >= dayCompletion.total ? '#EAF5EC' : '#FFF7E9' }}
                      >
                        {dayCompletion.done}/{dayCompletion.total} prepped
                      </span>
                    )}
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-[#755B4C] italic">No data</p>
                  ) : (
                    <div className="space-y-1.5">
                      {groups.map(({ group, items, lb, prepMinutes, completion }) => {
                        const groupKey = `${day.label}:${group}`
                        const isOpen = openMenuGroup === groupKey
                        return (
                          <div key={group} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                            <button
                              onClick={() => setOpenMenuGroup(isOpen ? null : groupKey)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                            >
                              <span className="text-xs font-bold text-[#4B2B1D]">{group}</span>
                              <span className="flex items-center gap-2 flex-shrink-0 text-[10px] font-bold text-[#9A7E6F]">
                                {items.length} recipe{items.length === 1 ? '' : 's'} · {lb} lb{prepMinutes > 0 ? ` · ~${formatMinutes(prepMinutes)}` : ''}
                                {completion.total > 0 && (
                                  <span style={{ color: completionColor(completion.done, completion.total) }}>
                                    · {completion.done}/{completion.total} prepped
                                  </span>
                                )}
                                <span className="text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                              </span>
                            </button>
                            {isOpen && (
                              <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                                {items.map((item) => {
                                  const c = recipeCompletion[item.name]
                                  const committed = committedFor(item, day.label)
                                  return (
                                  <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                      <span className="flex items-center gap-1.5">
                                        <p className="truncate text-xs font-medium text-[#4B2B1D]">{item.name}</p>
                                        {committed && committed.pct != null && (
                                          <span
                                            title={`${committed.committedG}g / ${committed.forecastG}g assigned`}
                                            className="flex-shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold"
                                            style={{
                                              color: committed.pct >= 90 ? '#16A34A' : committed.pct >= 40 ? '#D97706' : '#D62F3D',
                                              backgroundColor: committed.pct >= 90 ? '#E8F5E9' : committed.pct >= 40 ? '#FEF3E2' : '#FDEAEA',
                                            }}
                                          >
                                            {committed.pct}% committed
                                          </span>
                                        )}
                                      </span>
                                      <p className="text-[9px] text-[#9A7E6F] flex items-center gap-1.5">
                                        {item.prepMinutes != null && item.prepMinutes > 0 && <span>~{formatMinutes(item.prepMinutes)} prep</span>}
                                        {c && c.total > 0 && (
                                          <span className="font-bold" style={{ color: completionColor(c.done, c.total) }}>
                                            {c.done}/{c.total} checklist items done
                                          </span>
                                        )}
                                      </p>
                                      {c && c.total > 0 && (
                                        <span className="mt-1 block h-1 w-24 rounded-full bg-[#F0EAE0] overflow-hidden">
                                          <span className="block h-full rounded-full" style={{ width: `${Math.round((c.done / c.total) * 100)}%`, backgroundColor: completionColor(c.done, c.total) }} />
                                        </span>
                                      )}
                                    </div>
                                    {editingPlanItemId === item.id ? (
                                      <span className="flex flex-shrink-0 items-center gap-1">
                                        <input
                                          autoFocus
                                          type="number"
                                          min={0}
                                          step="0.5"
                                          value={editVolumeValue}
                                          onChange={(e) => setEditVolumeValue(e.target.value)}
                                          onKeyDown={(e) => e.key === 'Enter' && saveExpectedVolume(item)}
                                          className="h-6 w-14 rounded border border-[#2E527F] bg-white px-1 text-right text-xs text-[#4B2B1D] outline-none"
                                        />
                                        <button
                                          onClick={() => saveExpectedVolume(item)}
                                          disabled={savingVolume}
                                          className="text-[#16A34A] hover:text-[#15873F] disabled:opacity-40"
                                          aria-label={`Save quantity for ${item.name}`}
                                        >
                                          <Check className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setEditingPlanItemId(null)}
                                          className="text-[#9A7E6F] hover:text-[#D62F3D]"
                                          aria-label="Cancel"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => startEditVolume(item)}
                                        className="group flex flex-shrink-0 items-center gap-1"
                                        title="Edit quantity"
                                      >
                                        <p className="w-14 text-right text-xs font-bold text-[#2E527F]">{item.expectedVolume} lb</p>
                                        <Pencil className="h-3 w-3 text-[#C9BBA8] opacity-0 transition group-hover:opacity-100" />
                                      </button>
                                    )}
                                  </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <FulfillmentChecklistColumn
          tasks={blockView === 'both' ? fulfillmentTasks : fulfillmentTasks.filter((t) => t.operational_day === blockView)}
          onToggle={toggleFulfillmentTask}
          onCreateTask={createFulfillmentTask}
          onMoveToDay={moveFulfillmentTaskToDay}
          deliveries={
            blockView === 'both'
              ? deliveries
              : deliveries.filter((d) => (blockView === 'monday' ? d.total_meals_monday > 0 : d.total_meals_thursday > 0))
          }
        />

        <FinancialsColumn
          financials={prepFinancials.financials}
          ingredients={prepFinancials.ingredients}
          blockView={blockView}
          onStoreUpdated={() => fetchPrepFinancials(targetWeekStart)}
          storeAddresses={storeAddresses}
          onSaveStoreAddress={saveStoreAddress}
        />
      </div>
      </div>
    </main>

    {showPublishConfirm && (
      <PublishConfirmModal
        rows={rows}
        dirty={dirty}
        publishing={publishing}
        alreadyPublished={!!publishStatus?.published}
        onConfirm={publishMenu}
        onCancel={() => setShowPublishConfirm(false)}
      />
    )}
    </>
  )
}

// One last visual check of exactly what's about to go live -- both blocks'
// selected items, side by side -- before the irreversible-feeling step of
// exposing it to real customers. Reads straight from the same `rows` state
// the blocks themselves render from, so this is never out of sync with
// what's on screen; a dirty block gets flagged since publish goes live
// with whatever's already saved in the database, not an unsaved edit.
function PublishConfirmModal({
  rows,
  dirty,
  publishing,
  alreadyPublished,
  onConfirm,
  onCancel,
}: {
  rows: Record<Block, PlanRecipeRow[]>
  dirty: Record<Block, boolean>
  publishing: boolean
  alreadyPublished: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const blocks: { key: Block; label: string; sub: string; color: string }[] = [
    { key: 'monday', label: 'Block 1', sub: 'Mon – Wed', color: '#16A34A' },
    { key: 'thursday', label: 'Block 2', sub: 'Thu – Sun', color: '#D97706' },
  ]
  const anyDirty = dirty.monday || dirty.thursday

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-2xl w-full my-8">
        <div className="border-b border-[#E4D8C9] p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-[#4B2B1D]">Review before submitting</h2>
            <p className="mt-1 text-xs text-[#755B4C]">This is exactly what customers will see on the order page once submitted.</p>
          </div>
          <button onClick={onCancel} className="text-[#755B4C] hover:text-[#4B2B1D]">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {anyDirty && (
            <div className="rounded-lg border border-[#F0C5B8] bg-[#FFF4F0] p-3 text-xs font-bold text-[#B8571F]">
              You have unsaved changes in {dirty.monday && dirty.thursday ? 'both blocks' : dirty.monday ? 'Block 1' : 'Block 2'} — Save Block first, or submitting now will publish the last saved version instead.
            </div>
          )}

          {blocks.map(({ key, label, sub, color }) => {
            const selected = rows[key].filter((r) => r.selected)
            return (
              <div key={key} className="rounded-lg border border-[#E4D8C9] bg-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }}></div>
                  <h3 className="text-sm font-extrabold" style={{ color }}>{label}</h3>
                  <span className="text-xs text-[#2E527F]">{sub}</span>
                </div>
                {selected.length === 0 ? (
                  <p className="text-xs text-[#755B4C] italic">Nothing added — customers will see no options for this delivery day</p>
                ) : (
                  <ul className="space-y-1">
                    {selected.map((r) => (
                      <li key={rowKey(r)} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#4B2B1D]">
                          {r.name}
                          {r.isCustom && <span className="ml-1.5 rounded-full bg-[#EAF0F7] px-1.5 py-[1px] text-[9px] font-bold text-[#2E527F] align-middle">combo</span>}
                        </span>
                        <span className="text-[#2E527F]">{r.expected_volume} lb</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-[#E4D8C9] p-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 rounded-lg border border-[#B9A88F] px-4 text-xs font-bold text-[#4B2B1D] hover:bg-[#F1EAE0] transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={publishing}
            className="h-9 rounded-lg bg-[#16A34A] px-4 text-xs font-bold text-white hover:bg-[#15873F] disabled:opacity-50 transition"
          >
            {publishing ? 'Submitting...' : alreadyPublished ? 'Looks good — Re-submit' : 'Looks good — Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// What actually needs to be bought this week -- only ingredients short of
// what's on hand (needed minus current inventory stock), grouped by
// whichever store the receipt-sync pipeline last recorded that ingredient
// being bought at (inventory.store), so a run to Costco vs. Sam's Club can
// be planned as two separate lists instead of one flat ingredient dump.
// A subtle pencil (visible on row hover) lets that store be assigned or
// corrected inline -- PATCHes only the store column (not the full PUT
// used by Inventory's edit modal, which would also re-run allergen
// tagging/USDA lookup), then refetches so the item regroups immediately.
// Kitchen + Operations tasks for the selected week, grouped by day -- the
// recurring prep-through-delivery checklist, generated the same way
// Operations Hub's weekly task templates always have been. Read + check-off
// only; creating/editing tasks or their templates stays in Operations Hub
// so there's one place that actually owns the task system.
const FULFILLMENT_TASK_DEPARTMENTS = ['Kitchen', 'Procurement', 'Operations']

function FulfillmentChecklistColumn({
  tasks,
  onToggle,
  onCreateTask,
  onMoveToDay,
  deliveries,
}: {
  tasks: FulfillmentTask[]
  onToggle: (task: FulfillmentTask) => void
  onCreateTask: (title: string, department: string, operationalDay: string) => void
  onMoveToDay: (taskId: number, operationalDay: string) => void
  deliveries: Delivery[]
}) {
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [openDeliveryDay, setOpenDeliveryDay] = useState<'monday' | 'thursday' | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDepartment, setNewTaskDepartment] = useState('Kitchen')
  const [newTaskDay, setNewTaskDay] = useState('monday')

  // Every operational day, not just ones with tasks already -- an empty
  // day still needs to render so it's a valid drag-and-drop target, not
  // just something you can only reach through the Add Task form.
  const byDay = useMemo(() => {
    const map = new Map<string, FulfillmentTask[]>()
    for (const t of tasks) {
      const key = t.operational_day || 'unscheduled'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return OPERATIONAL_DAY_ORDER.map((d) => ({ day: d, tasks: map.get(d) || [] }))
  }, [tasks])

  const doneCount = tasks.filter((t) => t.status === 'completed').length

  const submitNewTask = () => {
    const title = newTaskTitle.trim()
    if (!title) return
    onCreateTask(title, newTaskDepartment, newTaskDay)
    setNewTaskTitle('')
    setShowAddTask(false)
    setOpenDay(newTaskDay)
  }

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">Fulfillment Checklist</h2>
        <button
          onClick={() => setShowAddTask((v) => !v)}
          className="flex-shrink-0 rounded-lg border border-[#2E527F] px-2 py-1 text-[10.5px] font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition"
        >
          + Add task
        </button>
      </div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-xs text-[#755B4C]">This week's recurring prep-through-delivery process -- drag a task onto a day to move it</p>
        {tasks.length > 0 && (
          <span className="flex-shrink-0 rounded-full bg-[#F1EAE0] px-2 py-0.5 text-[10px] font-bold text-[#755B4C]">
            {doneCount}/{tasks.length} done
          </span>
        )}
      </div>

      {showAddTask && (
        <div className="mb-3 space-y-2 rounded-lg border border-dashed border-[#2E527F] p-2.5">
          <input
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNewTask()}
            placeholder="Task title..."
            className="h-8 w-full rounded border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
          />
          <div className="flex items-center gap-1.5">
            <select
              value={newTaskDepartment}
              onChange={(e) => setNewTaskDepartment(e.target.value)}
              className="h-8 flex-1 rounded border border-[#B9A88F] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none"
            >
              {FULFILLMENT_TASK_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={newTaskDay}
              onChange={(e) => setNewTaskDay(e.target.value)}
              className="h-8 flex-1 rounded border border-[#B9A88F] bg-white px-1.5 text-xs capitalize text-[#4B2B1D] outline-none"
            >
              {OPERATIONAL_DAY_ORDER.map((d) => (
                <option key={d} value={d} className="capitalize">{d}</option>
              ))}
            </select>
            <button
              onClick={submitNewTask}
              disabled={!newTaskTitle.trim()}
              className="h-8 flex-shrink-0 rounded-lg bg-[#16A34A] px-3 text-xs font-bold text-white transition disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-xs text-[#755B4C] italic">No fulfillment tasks generated for this week yet — add one above, or set up a recurring template in Operational Optimization.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto space-y-2">
          {byDay.map(({ day, tasks: dayTasks }) => {
            const isOpen = openDay === day
            const dayDone = dayTasks.filter((t) => t.status === 'completed').length
            const isDragOver = dragOverDay === day
            return (
              <div
                key={day}
                className="rounded-lg border bg-white overflow-hidden transition"
                style={{ borderColor: isDragOver ? '#2E527F' : '#E4D8C9', boxShadow: isDragOver ? '0 0 0 2px #2E527F33' : undefined }}
                onDragOver={(e) => { e.preventDefault(); setDragOverDay(day) }}
                onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverDay(null)
                  const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10)
                  if (Number.isFinite(taskId)) onMoveToDay(taskId, day)
                }}
              >
                <button
                  onClick={() => setOpenDay(isOpen ? null : day)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-bold capitalize text-[#4B2B1D]">{day}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    {dayTasks.length === 0 ? (
                      <span className="text-[10px] text-[#9A7E6F]">no tasks</span>
                    ) : (
                      <span className="text-xs font-bold" style={{ color: dayDone === dayTasks.length ? '#16A34A' : '#D97706' }}>
                        {dayDone}/{dayTasks.length}
                      </span>
                    )}
                    <span className="text-xs text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                    {dayTasks.length === 0 ? (
                      <p className="px-3 py-2 text-[10.5px] italic text-[#9A7E6F]">Drag a task here, or add one for {day}.</p>
                    ) : (
                      dayTasks.map((task) => {
                        const completed = task.status === 'completed'
                        return (
                          <label
                            key={task.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(task.id))}
                            className="flex cursor-grab items-center gap-2.5 px-3 py-2 hover:bg-[#FBF7F0] active:cursor-grabbing"
                          >
                            <input
                              type="checkbox"
                              checked={completed}
                              onChange={() => onToggle(task)}
                              className="h-4 w-4 flex-shrink-0 accent-[#16A34A]"
                            />
                            <span className="min-w-0 flex-1">
                              <p className={`truncate text-xs font-medium ${completed ? 'text-[#9A7E6F] line-through' : 'text-[#4B2B1D]'}`}>{task.title}</p>
                              <span className="flex items-center gap-1.5">
                                <span className="rounded-full bg-[#F1EAE0] px-1.5 py-[1px] text-[9px] font-bold text-[#755B4C]">{task.department}</span>
                                {task.owner_name && <span className="text-[9px] text-[#9A7E6F]">{task.owner_name}</span>}
                                {task.checklist_total > 0 && (
                                  <span className="text-[9px] text-[#9A7E6F]">{task.checklist_done}/{task.checklist_total} items</span>
                                )}
                              </span>
                            </span>
                          </label>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[#E4D8C9] pt-4">
          <p className="text-sm font-extrabold text-[#4B2B1D]">Deliveries</p>
          {([
            { day: 'monday' as const, label: 'Monday', color: '#16A34A', customers: deliveries.filter((d) => d.total_meals_monday > 0) },
            { day: 'thursday' as const, label: 'Thursday', color: '#D97706', customers: deliveries.filter((d) => d.total_meals_thursday > 0) },
          ])
            .filter((g) => g.customers.length > 0)
            .map((group) => {
              const isOpen = openDeliveryDay === group.day
              return (
                <div key={group.day} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                  <button
                    onClick={() => setOpenDeliveryDay(isOpen ? null : group.day)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-bold" style={{ color: group.color }}>{group.label}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="rounded-full bg-[#F1EAE0] px-2 py-0.5 text-[10px] font-bold text-[#755B4C]">
                        {group.customers.length} customer{group.customers.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-xs text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                      {group.customers.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#4B2B1D]">{d.name}</p>
                          <span className="flex flex-shrink-0 items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-[1px] text-[10px] font-bold"
                              style={{ color: group.color, backgroundColor: group.color === '#16A34A' ? '#E8F5E9' : '#FEF3E2' }}
                            >
                              ×{group.day === 'monday' ? d.total_meals_monday : d.total_meals_thursday}
                            </span>
                            {d.breakfast_meals > 0 && (
                              <span className="rounded bg-[#E0F2FE] px-1.5 py-[1px] text-[10px] font-bold text-[#0EA5E9]">AM {d.breakfast_meals}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

// Cost and what's left to buy, all per day -- one place for every
// cost-adjacent number instead of a separate Shopping List column. Per-day
// shortfall is approximated against the same total current stock for both
// days (the same approximation the Block 1/Block 2 isolation view already
// makes elsewhere); the Combined total at the bottom uses the real,
// un-split shortfall instead, so it never double-counts an ingredient
// needed both days.
function FinancialsColumn({
  financials,
  ingredients,
  blockView,
  onStoreUpdated,
  storeAddresses,
  onSaveStoreAddress,
}: {
  financials: PrepAndFinancials['financials']
  ingredients: PrepIngredient[]
  blockView: 'both' | Block
  onStoreUpdated: () => void
  storeAddresses: Record<string, string>
  onSaveStoreAddress: (store: string, address: string) => void
}) {
  const [openDay, setOpenDay] = useState<Block | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const formatLb = (g: number) => (g / GRAMS_PER_POUND).toFixed(1)
  const formatNeeded = (ing: PrepIngredient, g: number) =>
    ing.category?.toLowerCase() === 'protein' ? formatIngredientWeight(g, ing.category) : `${formatLb(g)} lb`
  // Real $/lb from inventory -- null (not 0) when the price isn't on file,
  // so a total can honestly say "some prices unknown" instead of silently
  // undercounting those items as free.
  const estCostCents = (ing: PrepIngredient, shortfallG: number) =>
    ing.unitPriceCents ? (ing.unitPriceCents / 453.592) * shortfallG : null

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Opens a clean, checkbox-per-item printable page grouped by store --
  // what an employee actually carries into a store, not a screenshot of
  // this app's own UI chrome. A new window rather than this page's own
  // print styles, so it isn't constrained by whatever else is on screen.
  // Grade/price/address make it something a staffer can actually shop
  // from, not just a reminder of names -- "Print" in the toolbar is a
  // real PDF export via the browser's own Save as PDF destination.
  const exportShoppingList = (title: string, items: { ing: PrepIngredient; shortfallG: number }[]) => {
    const byStore = new Map<string, { ing: PrepIngredient; shortfallG: number }[]>()
    for (const item of items) {
      const key = item.ing.store || 'Store not on file'
      if (!byStore.has(key)) byStore.set(key, [])
      byStore.get(key)!.push(item)
    }
    let grandTotalCents = 0
    const sections = Array.from(byStore.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([store, storeItems]) => {
        const address = storeAddresses[store]
        return `
          <h2>${escapeHtml(store)}${address ? `<span class="addr">${escapeHtml(address)}</span>` : ''}</h2>
          <ul>
            ${storeItems
              .sort((a, b) => a.ing.name.localeCompare(b.ing.name))
              .map(({ ing, shortfallG }) => {
                const costCents = estCostCents(ing, shortfallG)
                if (costCents != null) grandTotalCents += costCents
                return `<li><input type="checkbox"><span class="name">${escapeHtml(ing.name)}${ing.grade ? `<span class="grade">${escapeHtml(ing.grade)}</span>` : ''}${ing.unitPriceCents ? `<span class="unit">$${(ing.unitPriceCents / 100).toFixed(2)}/lb</span>` : ''}</span><span class="qty">${formatNeeded(ing, shortfallG)}${costCents != null ? ` · $${(costCents / 100).toFixed(2)}` : ''}</span></li>`
              })
              .join('')}
          </ul>`
      })
      .join('')

    const html = `<!doctype html>
<html>
<head>
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2B2016; max-width: 640px; margin: 0 auto; padding: 24px; }
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .toolbar button { font: inherit; font-weight: 700; color: #2E527F; border: 1px solid #2E527F; background: white; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .date { color: #755B4C; font-size: 13px; margin: 0 0 4px; }
  .total { color: #2E527F; font-size: 14px; font-weight: 700; margin: 0 0 24px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 2px solid #2E527F; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .addr { font-size: 11px; font-weight: 400; color: #755B4C; text-align: right; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #E4D8C9; font-size: 15px; }
  input[type=checkbox] { width: 20px; height: 20px; flex-shrink: 0; }
  .name { flex: 1; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .grade { font-size: 10px; font-weight: 700; color: #16A34A; background: #E8F5E9; border-radius: 999px; padding: 2px 7px; }
  .unit { font-size: 11px; font-weight: 400; color: #755B4C; }
  .qty { font-weight: 700; color: #D62F3D; text-align: right; white-space: nowrap; }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${title}</h1>
<p class="date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
${sections ? `<p class="total">Estimated total: $${(grandTotalCents / 100).toFixed(2)}</p>` : ''}
${sections || '<p>Nothing to buy.</p>'}
</body>
</html>`

    // Blob URL rather than document.write into a window.open('') handle --
    // a real, navigable URL the browser treats as an actual page (title,
    // print, back/forward all work normally), not an opaque about:blank.
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank')
  }

  const knownStores = useMemo(
    () => Array.from(new Set(ingredients.map((i) => i.store).filter((s): s is string => !!s))).sort(),
    [ingredients]
  )

  const startEdit = (ing: PrepIngredient) => {
    setEditingId(ing.inventoryId)
    setEditValue(ing.store || '')
  }

  const saveStore = async (inventoryId: number) => {
    setSaving(true)
    try {
      await axios.patch(
        `${apiUrl}/api/inventory/${inventoryId}/store`,
        { store: editValue.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setEditingId(null)
      onStoreUpdated()
    } catch (error) {
      console.error('Error updating ingredient store:', error)
    } finally {
      setSaving(false)
    }
  }

  const dayRows: { block: Block; label: string; color: string; data: BlockFinancials }[] = [
    { block: 'monday', label: 'Block 1 (Mon–Wed)', color: '#16A34A', data: financials.monday },
    { block: 'thursday', label: 'Block 2 (Thu–Sun)', color: '#D97706', data: financials.thursday },
  ].filter((row) => blockView === 'both' || row.block === blockView)

  const combinedCents = financials.combined.costCents
  // Share of combined cost, for the split bar below -- guards the
  // div-by-zero case (nothing planned yet) by just showing an even split
  // rather than NaN-ing the bar width.
  const monPct = combinedCents > 0 ? (financials.monday.costCents / combinedCents) * 100 : 50
  const costPerLb = (data: BlockFinancials) => (data.lb > 0 ? data.costCents / data.lb / 100 : null)

  const combinedShoppingCents = ingredients.reduce((sum, ing) => sum + (estCostCents(ing, ing.shortfallG) || 0), 0)
  const combinedUnknownCost = ingredients.some((ing) => ing.shortfallG > 0 && !ing.unitPriceCents)

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <h2 className="mb-1 text-lg font-extrabold text-[#4B2B1D]">Financials</h2>
      <p className="mb-4 text-xs text-[#755B4C]">Cost and what's left to buy — from this week's recipe plan</p>
      <datalist id="financials-known-stores">
        {knownStores.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="space-y-3">
        {dayRows.map((row) => {
          const perLb = costPerLb(row.data)
          const dayShortfall = ingredients
            .map((ing) => ({ ing, shortfallG: Math.max(0, Math.round(ing.neededGByBlock[row.block] - ing.currentStockG)) }))
            .filter((x) => x.shortfallG > 0)
            .sort((a, b) => b.shortfallG - a.shortfallG)
          const dayShoppingCents = dayShortfall.reduce((sum, { ing, shortfallG }) => sum + (estCostCents(ing, shortfallG) || 0), 0)
          const isOpen = openDay === row.block

          return (
            <div key={row.label} className="rounded-lg border border-[#E4D8C9] bg-white px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }}></div>
                <p className="text-xs font-bold text-[#4B2B1D]">{row.label}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xl font-extrabold" style={{ color: row.color }}>${(row.data.costCents / 100).toFixed(2)}</p>
                <div className="text-right">
                  <p className="text-xs text-[#2E527F]">{row.data.recipeCount} recipe{row.data.recipeCount === 1 ? '' : 's'} · {row.data.lb} lb</p>
                  {perLb != null && <p className="text-[10px] text-[#9A7E6F]">${perLb.toFixed(2)}/lb</p>}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 border-t border-[#F0EAE0] pt-2">
                <button
                  onClick={() => setOpenDay(isOpen ? null : row.block)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="text-[10.5px] font-bold text-[#755B4C]">
                    {dayShortfall.length === 0 ? 'Nothing to buy for this block' : `${dayShortfall.length} item${dayShortfall.length === 1 ? '' : 's'} to buy`}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    {dayShoppingCents > 0 && <span className="text-[10.5px] font-bold text-[#D62F3D]">~${(dayShoppingCents / 100).toFixed(2)}</span>}
                    {dayShortfall.length > 0 && <span className="text-[10px] text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>}
                  </span>
                </button>
                {dayShortfall.length > 0 && (
                  <button
                    onClick={() => exportShoppingList(`Shopping List — ${row.label}`, dayShortfall)}
                    title="Export shopping list for employees"
                    className="flex-shrink-0 text-[#755B4C] hover:text-[#2E527F]"
                    aria-label={`Export shopping list for ${row.label}`}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isOpen && dayShortfall.length > 0 && (
                <div className="mt-1.5 max-h-[220px] overflow-y-auto divide-y divide-[#F0EAE0]">
                  {dayShortfall.map(({ ing, shortfallG }) =>
                    editingId === ing.inventoryId ? (
                      <div key={ing.inventoryId} className="flex items-center gap-1.5 py-1.5">
                        <input
                          autoFocus
                          list="financials-known-stores"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveStore(ing.inventoryId)}
                          placeholder="Store name..."
                          className="h-6 flex-1 min-w-0 rounded border border-[#2E527F] bg-white px-1.5 text-[10.5px] text-[#4B2B1D] outline-none"
                        />
                        <button
                          onClick={() => saveStore(ing.inventoryId)}
                          disabled={saving}
                          className="flex-shrink-0 text-[#16A34A] hover:text-[#15873F] disabled:opacity-40"
                          aria-label="Save store"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]"
                          aria-label="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div key={ing.inventoryId} className="group flex items-center gap-1.5 py-1.5">
                        <p className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-[#4B2B1D]">{ing.name}</p>
                        <button
                          onClick={() => startEdit(ing)}
                          className="flex-shrink-0 text-[#D9CBB8] opacity-0 transition group-hover:opacity-100 hover:text-[#2E527F]"
                          aria-label={`Assign store for ${ing.name}`}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <span className="flex-shrink-0 rounded-full bg-[#F1EAE0] px-1.5 py-[1px] text-[9px] font-bold text-[#755B4C]">{ing.store || 'no store'}</span>
                        <span className="w-14 flex-shrink-0 text-right text-[10.5px] font-bold text-[#D62F3D]">{formatNeeded(ing, shortfallG)}</span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}

        {blockView === 'both' && combinedCents > 0 && (
          <div>
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-[#F1EAE0]">
              <div className="h-full" style={{ width: `${monPct}%`, backgroundColor: '#16A34A' }}></div>
              <div className="h-full" style={{ width: `${100 - monPct}%`, backgroundColor: '#D97706' }}></div>
            </div>
            <p className="mt-1 text-[9px] text-[#9A7E6F]">{Math.round(monPct)}% Block 1 · {Math.round(100 - monPct)}% Block 2</p>
          </div>
        )}

        {blockView === 'both' && (
          <div className="rounded-lg bg-[#4B2B1D] px-3 py-2.5">
            <p className="text-xs font-bold text-[#E9DFD0] mb-1">Combined</p>
            <div className="flex items-center justify-between">
              <p className="text-xl font-extrabold text-white">${(financials.combined.costCents / 100).toFixed(2)}</p>
              <div className="text-right">
                <p className="text-xs text-[#2E527F]">{financials.combined.recipeCount} recipes · {financials.combined.lb} lb</p>
                {costPerLb(financials.combined) != null && (
                  <p className="text-[10px] text-[#9A6D34]">${(costPerLb(financials.combined) as number).toFixed(2)}/lb</p>
                )}
              </div>
            </div>
            {combinedShoppingCents > 0 && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-bold text-[#E9DFD0]">
                  Shopping: ~${(combinedShoppingCents / 100).toFixed(2)}{combinedUnknownCost ? '+' : ''} grand total
                </p>
                <button
                  onClick={() => exportShoppingList('Shopping List — Combined', ingredients.filter((ing) => ing.shortfallG > 0).map((ing) => ({ ing, shortfallG: ing.shortfallG })))}
                  title="Export combined shopping list for employees"
                  className="flex-shrink-0 text-[#E9DFD0] hover:text-white"
                  aria-label="Export combined shopping list"
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {knownStores.length > 0 && (
          <StoreAddressEditor stores={knownStores} addresses={storeAddresses} onSave={onSaveStoreAddress} />
        )}
      </div>
    </div>
  )
}

// Addresses feed the shopping-list export's store headers -- set once per
// store here, reused on every future export instead of typed out each
// time. Collapsed by default since it's a setup task, not something
// checked every week.
function StoreAddressEditor({
  stores,
  addresses,
  onSave,
}: {
  stores: string[]
  addresses: Record<string, string>
  onSave: (store: string, address: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  return (
    <div className="border-t border-[#E4D8C9] pt-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-[10.5px] font-bold text-[#755B4C]">Store addresses</span>
        <span className="text-[10px] text-[#2E527F]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {stores.map((store) =>
            editingStore === store ? (
              <div key={store} className="flex items-center gap-1.5">
                <span className="w-24 flex-shrink-0 truncate text-[10.5px] font-bold text-[#4B2B1D]">{store}</span>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { onSave(store, editValue.trim()); setEditingStore(null) }
                  }}
                  placeholder="Street address..."
                  className="h-6 flex-1 min-w-0 rounded border border-[#2E527F] bg-white px-1.5 text-[10.5px] text-[#4B2B1D] outline-none"
                />
                <button onClick={() => { onSave(store, editValue.trim()); setEditingStore(null) }} className="flex-shrink-0 text-[#16A34A] hover:text-[#15873F]" aria-label="Save address">
                  <Check className="h-3 w-3" />
                </button>
                <button onClick={() => setEditingStore(null)} className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]" aria-label="Cancel">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                key={store}
                onClick={() => { setEditingStore(store); setEditValue(addresses[store] || '') }}
                className="group flex w-full items-center gap-1.5 text-left"
              >
                <span className="w-24 flex-shrink-0 truncate text-[10.5px] font-bold text-[#4B2B1D]">{store}</span>
                <span className="flex-1 min-w-0 truncate text-[10.5px] text-[#755B4C]">{addresses[store] || 'No address set'}</span>
                <Pencil className="h-2.5 w-2.5 flex-shrink-0 text-[#C9BBA8] opacity-0 transition group-hover:opacity-100" />
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
