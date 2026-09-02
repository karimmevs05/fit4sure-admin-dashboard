import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Pencil, Check, X, ExternalLink, Send, UtensilsCrossed } from 'lucide-react'
import RecipePlanSection, { rowKey } from '../components/RecipePlanSection'
import type { Block, PlanRecipeRow } from '../components/RecipePlanSection'
import { PlateCostSimulator } from '../components/PlateCostSimulator'
import { formatIngredientWeight } from '../utils/unitConversion'
import WeeklyPrepPage from './WeeklyPrep'

const GRAMS_PER_POUND = 455

type MenuItem = { id: number; name: string; category: string; recipeId: number | null; expectedVolume: number }
type CurrentWeekMenu = { monday: MenuItem[]; thursday: MenuItem[] }

// Coarser than the raw recipe category (beef/chicken/turkey all read as
// "Proteins" here) -- This Week's Menu groups by this bucket so a 14-recipe
// week collapses to a handful of rows instead of one per recipe.
const CATEGORY_GROUP: Record<string, string> = {
  beef: 'Proteins', chicken: 'Proteins', turkey: 'Proteins',
  carbohydrates: 'Carbs',
  vegetables: 'Veggies',
  sauces: 'Sauces',
  breakfast: 'Breakfast',
  beverage: 'Beverages',
  custom: 'Custom',
}
const GROUP_ORDER = ['Proteins', 'Carbs', 'Veggies', 'Sauces', 'Breakfast', 'Beverages', 'Custom']

type PrepIngredient = {
  inventoryId: number
  name: string
  category: string
  neededG: number
  shortfallG: number
  unitPriceCents: number
  currentStockG: number
  store: string | null
}

type BlockFinancials = { costCents: number; lb: number; recipeCount: number }

type PrepAndFinancials = {
  ingredients: PrepIngredient[]
  financials: { monday: BlockFinancials; thursday: BlockFinancials; combined: BlockFinancials }
}

export default function MenuPlannerPage() {
  const [weekStart, setWeekStart] = useState<{ sunday?: string; monday?: string; thursday?: string }>({})
  const [currentWeekMenu, setCurrentWeekMenu] = useState<CurrentWeekMenu>({ monday: [], thursday: [] })
  const [showPrepPage, setShowPrepPage] = useState(false)
  const [editingPlanItemId, setEditingPlanItemId] = useState<number | null>(null)
  const [editVolumeValue, setEditVolumeValue] = useState('')
  const [savingVolume, setSavingVolume] = useState(false)
  const [openMenuGroup, setOpenMenuGroup] = useState<string | null>(null)
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

  useEffect(() => {
    fetchAll()
    fetchPlan()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const [currentWeekRes, nextWeekRes, prepFinancialsRes, publishStatusRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/current-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/next-week`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/prep-and-financials`, { headers }),
        axios.get(`${apiUrl}/api/admin/menu-planner/publish-status`, { headers }),
      ])

      setCurrentWeekMenu(currentWeekRes.data.data || { monday: [], thursday: [] })
      setWeekStart(nextWeekRes.data.data || {})
      setPrepFinancials(
        prepFinancialsRes.data.data || {
          ingredients: [],
          financials: { monday: { costCents: 0, lb: 0, recipeCount: 0 }, thursday: { costCents: 0, lb: 0, recipeCount: 0 }, combined: { costCents: 0, lb: 0, recipeCount: 0 } },
        }
      )
      setPublishStatus(publishStatusRes.data.data || null)
    } catch (error) {
      console.error('Error fetching menu planner data:', error)
    } finally {
      setLoading(false)
    }
  }

  const startEditVolume = (item: MenuItem) => {
    setEditingPlanItemId(item.id)
    setEditVolumeValue(String(item.expectedVolume))
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
        {},
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

  const fetchPlan = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` }
      // Two calls: the plan endpoint knows what's selected/forecasted, the
      // recipes endpoint knows the per-lb (455g) macros/cost every other
      // recipe view in this app already uses -- merge them by recipe_id
      // rather than duplicating that calculation on the backend here too.
      const [planRes, recipesRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/menu-planner/recipe-plan`, { headers }),
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
      setPlanWeekStart(planRes.data.data?.weekStart)
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

  const saveBlock = async (block: Block) => {
    setSavingBlock(block)
    try {
      const selections = rows[block]
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

      await axios.post(
        `${apiUrl}/api/admin/menu-planner/recipe-plan`,
        { block, selections },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDirty((d) => ({ ...d, [block]: false }))
      fetchPrepFinancials()
      fetchPlan() // custom rows need their server-assigned `id` in place of `tempId`
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save recipe plan')
    } finally {
      setSavingBlock(null)
    }
  }

  // Called after the Weekly Recipe Plan saves a block -- prep/financials are
  // derived from that plan, so they'd otherwise go stale until a full page
  // reload. Refetches just this one endpoint rather than everything.
  const fetchPrepFinancials = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/menu-planner/prep-and-financials`, {
        headers: { Authorization: `Bearer ${token}` },
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
    return <WeeklyPrepPage week={currentWeekStart} onBack={() => setShowPrepPage(false)} />
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
            Building here creates the real menu for {weekStart.monday ? new Date(weekStart.monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} delivery
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
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
      </div>

      {publishStatus && (
        <p className={`text-xs font-medium ${publishStatus.published ? 'text-[#16A34A]' : 'text-[#D97706]'}`}>
          {publishStatus.published
            ? `Live to customers${publishStatus.publishedAt ? ` since ${new Date(publishStatus.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''} — further block edits go live immediately.`
            : "Draft — customers see \"menu isn't posted yet\" until you press Submit Menu."}
        </p>
      )}

      <PlateCostSimulator onAddToBlock={addComboToBlock} />

      <RecipePlanSection
        rows={rows}
        weekStart={planWeekStart}
        dirty={dirty}
        savingBlock={savingBlock}
        onAddRecipe={addRecipe}
        onRemoveRow={removeRow}
        onUpdateVolume={updateVolume}
        onSaveBlock={saveBlock}
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
            <h2 className="text-lg font-extrabold text-[#4B2B1D]">This Week's Menu</h2>
            <button
              onClick={() => setShowPrepPage(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#16813D] px-3 text-xs font-bold text-white shadow-[0_6px_14px_rgba(22,129,61,0.18)] transition hover:bg-[#0d6a2d] active:scale-[0.98]"
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              View Weekly Prep
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-5 pr-1">
            {([
              { label: 'Monday', color: '#16A34A', items: currentWeekMenu.monday },
              { label: 'Thursday', color: '#D97706', items: currentWeekMenu.thursday },
            ] as const).map((day) => {
              const totalLb = day.items.reduce((sum, i) => sum + (i.expectedVolume || 0), 0)
              const groups = GROUP_ORDER.map((group) => {
                const items = day.items.filter((i) => (CATEGORY_GROUP[i.category] || 'Custom') === group)
                return { group, items, lb: items.reduce((sum, i) => sum + (i.expectedVolume || 0), 0) }
              }).filter((g) => g.items.length > 0)

              return (
                <div key={day.label}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: day.color }}></div>
                    <p className="text-sm font-bold" style={{ color: day.color }}>{day.label}</p>
                    <span className="text-[10px] font-bold text-[#9A7E6F]">
                      {day.items.length} item{day.items.length === 1 ? '' : 's'}{totalLb > 0 ? ` · ${totalLb} lb total` : ''}
                    </span>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-[#755B4C] italic">No data</p>
                  ) : (
                    <div className="space-y-1.5">
                      {groups.map(({ group, items, lb }) => {
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
                                {items.length} recipe{items.length === 1 ? '' : 's'} · {lb} lb
                                <span className="text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                              </span>
                            </button>
                            {isOpen && (
                              <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                                {items.map((item) => (
                                  <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                                    <p className="flex-1 truncate text-xs font-medium text-[#4B2B1D]">{item.name}</p>
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
            })}
          </div>
        </div>

        <ShoppingListColumn ingredients={prepFinancials.ingredients} onStoreUpdated={fetchAll} />

        <FinancialsColumn financials={prepFinancials.financials} />
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
function ShoppingListColumn({ ingredients, onStoreUpdated }: { ingredients: PrepIngredient[]; onStoreUpdated: () => void }) {
  const [openStore, setOpenStore] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const formatLb = (g: number) => (g / GRAMS_PER_POUND).toFixed(1)
  const formatNeeded = (ing: PrepIngredient, g: number) =>
    ing.category?.toLowerCase() === 'protein' ? formatIngredientWeight(g, ing.category) : `${formatLb(g)} lb`

  // Real $/lb from inventory -- null (not 0) when the price isn't on file,
  // so a store total can honestly say "some prices unknown" instead of
  // silently undercounting those items as free.
  const estCostCents = (ing: PrepIngredient) => (ing.unitPriceCents ? (ing.unitPriceCents / 453.592) * ing.shortfallG : null)

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

  const byStore = useMemo(() => {
    const toBuy = ingredients.filter((ing) => ing.shortfallG > 0)
    const map = new Map<string, PrepIngredient[]>()
    for (const ing of toBuy) {
      const key = ing.store || 'Store not on file'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ing)
    }
    return Array.from(map.entries())
      .map(([store, items]) => {
        const sorted = items.sort((a, b) => b.shortfallG - a.shortfallG)
        const costs = sorted.map(estCostCents)
        return {
          store,
          items: sorted,
          costCents: costs.reduce((sum: number, c) => sum + (c || 0), 0),
          hasUnknownCost: costs.some((c) => c == null),
        }
      })
      .sort((a, b) => b.items.length - a.items.length)
  }, [ingredients])

  const grandTotalCents = byStore.reduce((sum, s) => sum + s.costCents, 0)
  const anyUnknownCost = byStore.some((s) => s.hasUnknownCost)

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <h2 className="mb-1 text-lg font-extrabold text-[#4B2B1D]">Shopping List</h2>
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-xs text-[#755B4C]">What's short vs. current stock, grouped by where you last bought it</p>
        {byStore.length > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-lg font-extrabold text-[#2E527F] leading-none">${(grandTotalCents / 100).toFixed(2)}</p>
            <p className="text-[9px] text-[#9A7E6F]">est. total{anyUnknownCost ? ' · some unpriced' : ''}</p>
          </div>
        )}
      </div>
      <datalist id="shopping-list-known-stores">
        {knownStores.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {byStore.length === 0 ? (
        <p className="text-xs text-[#755B4C] italic">Nothing to buy — current stock covers this week's plan</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto space-y-2">
          {byStore.map(({ store, items, costCents, hasUnknownCost }) => {
            const isOpen = openStore === store
            return (
              <div key={store} className="rounded-lg border border-[#E4D8C9] bg-white overflow-hidden">
                <button
                  onClick={() => setOpenStore(isOpen ? null : store)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-bold text-[#4B2B1D]">{store}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-[#16A34A]">
                      {costCents > 0 ? `~$${(costCents / 100).toFixed(2)}` : ''}{hasUnknownCost ? '+' : ''}
                    </span>
                    <span className="rounded-full bg-[#F1EAE0] px-2 py-0.5 text-[10px] font-bold text-[#755B4C]">
                      {items.length} item{items.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs text-[#2E527F]">{isOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[#E4D8C9] divide-y divide-[#F0EAE0]">
                    {items.map((ing) =>
                      editingId === ing.inventoryId ? (
                        <div key={ing.name} className="flex items-center gap-1.5 px-3 py-2">
                          <input
                            autoFocus
                            list="shopping-list-known-stores"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveStore(ing.inventoryId)}
                            placeholder="Store name..."
                            className="h-7 flex-1 min-w-0 rounded border border-[#2E527F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
                          />
                          <button
                            onClick={() => saveStore(ing.inventoryId)}
                            disabled={saving}
                            className="flex-shrink-0 text-[#16A34A] hover:text-[#15873F] disabled:opacity-40"
                            aria-label="Save store"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]"
                            aria-label="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div key={ing.name} className="group flex items-center gap-2 px-3 py-2">
                          <p className="flex-1 truncate text-xs font-medium text-[#4B2B1D]">{ing.name}</p>
                          <button
                            onClick={() => startEdit(ing)}
                            className="flex-shrink-0 text-[#C9BBA8] opacity-0 transition group-hover:opacity-100 hover:text-[#2E527F]"
                            aria-label={`Assign store for ${ing.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <span className="flex-shrink-0 text-right">
                            <p className="text-xs font-bold text-[#D62F3D]">{formatNeeded(ing, ing.shortfallG)}</p>
                            {estCostCents(ing) != null && (
                              <p className="text-[9px] text-[#9A7E6F]">~${((estCostCents(ing) as number) / 100).toFixed(2)}</p>
                            )}
                          </span>
                        </div>
                      )
                    )}
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

// Cost rollup for the same recipe plan, split by block so the chef can see
// what Mon-Wed vs Thu-Sun is actually going to cost before it's committed.
function FinancialsColumn({ financials }: { financials: PrepAndFinancials['financials'] }) {
  const rows: { label: string; color: string; data: BlockFinancials }[] = [
    { label: 'Block 1 (Mon–Wed)', color: '#16A34A', data: financials.monday },
    { label: 'Block 2 (Thu–Sun)', color: '#D97706', data: financials.thursday },
  ]
  const combinedCents = financials.combined.costCents
  // Share of combined cost, for the split bar below -- guards the
  // div-by-zero case (nothing planned yet) by just showing an even split
  // rather than NaN-ing the bar width.
  const monPct = combinedCents > 0 ? (financials.monday.costCents / combinedCents) * 100 : 50
  const costPerLb = (data: BlockFinancials) => (data.lb > 0 ? data.costCents / data.lb / 100 : null)

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
      <h2 className="mb-1 text-lg font-extrabold text-[#4B2B1D]">Financials</h2>
      <p className="mb-4 text-xs text-[#755B4C]">Forecasted ingredient cost, from this week's recipe plan</p>

      <div className="space-y-3">
        {rows.map((row) => {
          const perLb = costPerLb(row.data)
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
            </div>
          )
        })}

        {combinedCents > 0 && (
          <div>
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-[#F1EAE0]">
              <div className="h-full" style={{ width: `${monPct}%`, backgroundColor: '#16A34A' }}></div>
              <div className="h-full" style={{ width: `${100 - monPct}%`, backgroundColor: '#D97706' }}></div>
            </div>
            <p className="mt-1 text-[9px] text-[#9A7E6F]">{Math.round(monPct)}% Block 1 · {Math.round(100 - monPct)}% Block 2</p>
          </div>
        )}

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
        </div>
      </div>
    </div>
  )
}
