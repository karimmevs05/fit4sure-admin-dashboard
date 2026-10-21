import React, { useState } from 'react'
import { AlertCircle, Pencil, Plus, X } from 'lucide-react'
import { RecipePicker } from './RecipePicker'
import type { PickerRecipe } from './RecipePicker'
import { PlateExtraIngredientPicker, PlateExtraIngredientChip, extraIngredientStats } from './PlateExtraIngredientPicker'
import type { PlateIngredientOption } from './PlateExtraIngredientPicker'
import { rowAccentForCategory } from '../utils/categoryColors'
import { plateComponentFor, servingGramsFor } from '../utils/plateStructure'
import type { PlateFormatConfig } from '../utils/plateStructure'

export type PlanRecipeRow = {
  recipe_id: number | null
  id?: number // server-assigned weekly_recipe_plan row id -- only set for custom rows loaded from GET
  tempId?: number // client-only id for a custom row added this session, before it has a server id
  isCustom?: boolean
  name: string
  category: string
  selected: boolean
  expected_volume: number // lb -- the standing unit for this plan, always
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  costPerPoundCents: number
  suggestedServingG?: number | null
  supplierName?: string | null
}

export type Block = 'monday' | 'thursday'

// A staff-curated protein + default-sides combo for a block, surfaced on
// the ordering page as a featured, still-customizable recommendation --
// see POST /api/admin/menu-planner/plate-options.
// A flat extra, already resolved against live inventory (name/macros/cost
// at its saved gram amount) -- see plateExtraIngredients.js on the backend.
export type PlateExtraIngredient = {
  inventoryId: number
  name: string
  grams: number
  costCents: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type PlateOption = {
  id: number
  block: Block
  name: string | null
  proteinRecipeId: number
  proteinName: string
  sides: { recipeId: number; name: string }[]
  extraIngredients: PlateExtraIngredient[]
}

export const BLOCK_CONFIG: Record<Block, { label: string; sub: string; color: string }> = {
  monday: { label: 'Block 1', sub: 'Mon – Wed', color: '#16A34A' },
  thursday: { label: 'Block 2', sub: 'Thu – Sun', color: '#D97706' },
}

export const rowKey = (r: PlanRecipeRow) => (r.recipe_id != null ? `r${r.recipe_id}` : `c${r.id ?? r.tempId}`)

// Same recipe pool feeds delivery orders and walk-up counter sales -- this
// section is the single place the chef decides what's live for a block and
// roughly how much of it to expect, which drives what operations buys and
// preps in bulk. Purely presentational -- block state lives in
// MenuPlannerPage so the Custom Plate Builder above can add a combo
// straight into a block without two components racing to save the same
// replace-all endpoint independently.
export default function RecipePlanSection({
  rows,
  weekStart,
  dirty,
  savingBlock,
  plateFormats,
  blockView,
  onBlockViewChange,
  onAddRecipe,
  onRemoveRow,
  onUpdateVolume,
  onSaveBlock,
  onMoveBlock,
  plateOptions,
  onCreatePlate,
  onUpdatePlate,
  onDeletePlate,
  inventoryItems,
}: {
  rows: Record<Block, PlanRecipeRow[]>
  weekStart?: string
  dirty: Record<Block, boolean>
  savingBlock: Block | null
  plateFormats?: PlateFormatConfig[]
  // 'both' (default, side by side) or one block alone, full width --
  // controlled by the parent page so the rest of the page (This Week's
  // Menu, Shopping List, Financials) can isolate to the same block too,
  // not just this section's own cards.
  blockView: 'both' | Block
  onBlockViewChange: (view: 'both' | Block) => void
  onAddRecipe: (block: Block, recipeId: number) => void
  onRemoveRow: (block: Block, row: PlanRecipeRow) => void
  onUpdateVolume: (block: Block, row: PlanRecipeRow, volume: number) => void
  onSaveBlock: (block: Block) => void
  // Re-homes this block's already-built content to a different date,
  // instead of having to tear it down and rebuild it at the new week.
  onMoveBlock: (block: Block, newWeekStart: string) => void
  plateOptions: PlateOption[]
  onCreatePlate: (
    block: Block,
    proteinRecipeId: number,
    sideRecipeIds: number[],
    name: string,
    extraIngredients: { inventoryId: number; grams: number }[]
  ) => void
  onUpdatePlate: (
    id: number,
    block: Block,
    proteinRecipeId: number,
    sideRecipeIds: number[],
    name: string,
    extraIngredients: { inventoryId: number; grams: number }[]
  ) => void
  onDeletePlate: (id: number) => void
  // The full ingredient catalog (not scoped to this week's plan, unlike
  // the recipe pool above) -- a garnish like maple syrup or parmesan isn't
  // something the chef "plans" onto the week, it's just always available
  // stock, same as everything else in Inventory.
  inventoryItems: PlateIngredientOption[]
}) {
  const [addOpen, setAddOpen] = useState<Record<Block, boolean>>({ monday: false, thursday: false })
  const [movingOpen, setMovingOpen] = useState<Block | null>(null)
  const [moveDate, setMoveDate] = useState('')
  // Drag-and-drop plate builder: drag a recipe row from the selected list
  // above straight onto this block's drop zone -- a protein becomes the
  // plate's main, anything else becomes a side. No separate picker UI, so
  // building a plate reuses the exact same rows already on screen.
  // Extra ingredients (garnishes pulled from inventory, not the week's
  // recipe pool) are added separately via the Add Ingredient button/picker
  // below, since they're not draggable rows on this page.
  // editingId tracks whether this draft is building a brand-new plate
  // (null) or editing an already-saved one in place (that plate's id) --
  // same draft shape either way, "Create Plate" becomes "Save Changes".
  type PlateDraft = {
    proteinId: number | null
    sideIds: number[]
    extraIngredients: { inventoryId: number; grams: number }[]
    name: string
    nameEdited: boolean
    editingId: number | null
  }
  const emptyDraft = (): PlateDraft => ({ proteinId: null, sideIds: [], extraIngredients: [], name: '', nameEdited: false, editingId: null })
  const [plateDraft, setPlateDraft] = useState<Record<Block, PlateDraft>>({
    monday: emptyDraft(),
    thursday: emptyDraft(),
  })
  const [plateDropActive, setPlateDropActive] = useState<Block | null>(null)
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState<Record<Block, boolean>>({ monday: false, thursday: false })

  // "{Protein} with {side, side}" -- a reasonable starting point, not a
  // final answer. Only applied while the name field hasn't been hand-
  // edited, so typing a real name sticks even as sides keep changing.
  const suggestPlateName = (proteinName: string, sideNames: string[]) =>
    sideNames.length > 0 ? `${proteinName} with ${sideNames.join(', ')}` : proteinName

  // "Regular" is the standing default serving size every other plate
  // format (Large, Low Carb, etc.) is defined relative to -- same reason
  // the public order page and Portions & Pricing both treat it as the
  // reference size. A recipe's category decides which plate component
  // (protein/carbs/veggies) its lb figure should be measured against;
  // recipes with no mapping (sauces, beverages, custom combos) get no
  // servings estimate rather than a meaningless one.
  const regularFormat = plateFormats?.find((f) => f.structure === 'Regular')
  const regularServingsFor = (row: PlanRecipeRow): { count: number; servingG: number } | null => {
    if (!regularFormat || row.isCustom) return null
    const component = plateComponentFor(row.category)
    if (!component) return null
    const servingG = servingGramsFor(regularFormat, component)
    if (!servingG) return null
    const availableG = (row.expected_volume || 0) * 453.592
    return { count: Math.floor(availableG / servingG), servingG }
  }

  // The Regular serving size (in grams) a recipe's category maps to, or
  // null when there's no mapping (sauces, beverages, custom combos) --
  // those keep the old direct-lb entry since there's nothing to convert
  // servings against. This is what lets the row input below be "servings
  // to cook" instead of lb: the chef enters a plate count, and the lb
  // figure that actually drives prep tasks/procurement/cost downstream
  // is calculated from it automatically, not typed by hand.
  const regularServingSizeFor = (row: PlanRecipeRow): number | null => {
    if (!regularFormat || row.isCustom) return null
    const component = plateComponentFor(row.category)
    if (!component) return null
    return servingGramsFor(regularFormat, component) || null
  }

  // Real per-plate cost/macros at the Regular serving size -- what a
  // customer actually gets, not the per-lb forecast figures the rest of
  // the block shows. Items with no Regular-format mapping (sauces) are
  // silently skipped, matching how sauces price as separate add-ons
  // everywhere else in the app rather than part of the base plate.
  const regularFormatStatsFor = (items: PlanRecipeRow[]) => {
    if (!regularFormat) return null
    const sized = items
      .map((r) => {
        const component = plateComponentFor(r.category)
        const servingG = component ? servingGramsFor(regularFormat, component) : null
        return servingG ? { r, servingG } : null
      })
      .filter((x): x is { r: PlanRecipeRow; servingG: number } => !!x)
    if (sized.length === 0) return null
    return sized.reduce(
      (acc, { r, servingG }) => {
        const frac = servingG / 453.592
        return {
          costCents: acc.costCents + r.costPerPoundCents * frac,
          calories: acc.calories + r.calories * frac,
          protein_g: acc.protein_g + r.protein_g * frac,
          carbs_g: acc.carbs_g + r.carbs_g * frac,
          fat_g: acc.fat_g + r.fat_g * frac,
        }
      },
      { costCents: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    )
  }

  const nameFor = (block: Block, recipeId: number | null) =>
    recipeId == null ? null : rows[block].find((r) => r.recipe_id === recipeId)?.name ?? null

  const withSuggestedName = (block: Block, draft: PlateDraft): PlateDraft => {
    if (draft.nameEdited) return draft
    const proteinName = nameFor(block, draft.proteinId)
    if (!proteinName) return { ...draft, name: '' }
    const sideNames = draft.sideIds.map((id) => nameFor(block, id)).filter((n): n is string => !!n)
    return { ...draft, name: suggestPlateName(proteinName, sideNames) }
  }

  const dropOnPlate = (block: Block, recipeId: number, category: string) => {
    const isProtein = plateComponentFor(category) === 'protein'
    setPlateDraft((current) => {
      const draft = current[block]
      if (isProtein) {
        return { ...current, [block]: withSuggestedName(block, { ...draft, proteinId: recipeId }) }
      }
      if (draft.sideIds.includes(recipeId)) return current
      return { ...current, [block]: withSuggestedName(block, { ...draft, sideIds: [...draft.sideIds, recipeId] }) }
    })
  }

  const removeFromPlateDraft = (block: Block, recipeId: number) => {
    setPlateDraft((current) => {
      const draft = current[block]
      const next = {
        ...draft,
        proteinId: draft.proteinId === recipeId ? null : draft.proteinId,
        sideIds: draft.sideIds.filter((id) => id !== recipeId),
      }
      return { ...current, [block]: withSuggestedName(block, next) }
    })
  }

  const setPlateDraftName = (block: Block, name: string) => {
    setPlateDraft((current) => ({ ...current, [block]: { ...current[block], name, nameEdited: true } }))
  }

  // Extra ingredients don't factor into the auto-suggested name (that's
  // protein + sides only, same as before) -- just appended to/removed
  // from the draft's own list.
  const addExtraIngredientToDraft = (block: Block, ingredient: PlateIngredientOption, grams: number) => {
    setPlateDraft((current) => {
      const draft = current[block]
      if (draft.extraIngredients.some((e) => e.inventoryId === ingredient.id)) return current
      return { ...current, [block]: { ...draft, extraIngredients: [...draft.extraIngredients, { inventoryId: ingredient.id, grams }] } }
    })
  }

  const updateExtraIngredientGrams = (block: Block, inventoryId: number, grams: number) => {
    setPlateDraft((current) => {
      const draft = current[block]
      return {
        ...current,
        [block]: { ...draft, extraIngredients: draft.extraIngredients.map((e) => (e.inventoryId === inventoryId ? { ...e, grams } : e)) },
      }
    })
  }

  const removeExtraIngredientFromDraft = (block: Block, inventoryId: number) => {
    setPlateDraft((current) => {
      const draft = current[block]
      return { ...current, [block]: { ...draft, extraIngredients: draft.extraIngredients.filter((e) => e.inventoryId !== inventoryId) } }
    })
  }

  // Loads an already-saved plate into the same draft editor used for
  // creating one -- same fields, same controls, just pre-filled and
  // routed to onUpdatePlate on submit instead of onCreatePlate.
  const startEditingPlate = (block: Block, plate: PlateOption) => {
    setPlateDraft((current) => ({
      ...current,
      [block]: {
        proteinId: plate.proteinRecipeId,
        sideIds: plate.sides.map((s) => s.recipeId),
        extraIngredients: plate.extraIngredients.map((e) => ({ inventoryId: e.inventoryId, grams: e.grams })),
        name: plate.name || plate.proteinName,
        nameEdited: true, // don't clobber a staff-chosen name with the auto-suggestion while editing
        editingId: plate.id,
      },
    }))
  }

  const cancelPlateDraft = (block: Block) => setPlateDraft((current) => ({ ...current, [block]: emptyDraft() }))

  const submitPlate = (block: Block) => {
    const draft = plateDraft[block]
    if (!draft.proteinId) return
    if (draft.editingId != null) {
      onUpdatePlate(draft.editingId, block, draft.proteinId, draft.sideIds, draft.name.trim(), draft.extraIngredients)
    } else {
      onCreatePlate(block, draft.proteinId, draft.sideIds, draft.name.trim(), draft.extraIngredients)
    }
    setPlateDraft((current) => ({ ...current, [block]: emptyDraft() }))
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold text-[#4B2B1D]">Weekly Menu Planner</h2>
          <p className="mt-1 text-sm text-[#755B4C]">
            What's live for {weekStart ? new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} --
            feeds both delivery orders and counter sales. Enter servings to cook; lb, cost, and ingredient
            quantities are calculated automatically from the Regular serving size. Items with no standard
            serving size (sauces, custom combos) are entered directly in lb.
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {([
            ['both', 'Both'],
            ['monday', BLOCK_CONFIG.monday.label],
            ['thursday', BLOCK_CONFIG.thursday.label],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onBlockViewChange(key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                blockView === key ? 'bg-[#2E527F] text-white' : 'bg-white text-[#4B2B1D] border border-[#D7C9B7] hover:bg-[#F5F0E8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-6 mb-6 ${blockView === 'both' ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {(blockView === 'both' ? (['monday', 'thursday'] as Block[]) : [blockView]).map((block) => {
          const cfg = BLOCK_CONFIG[block]
          const selected = rows[block].filter((r) => r.selected)
          const totalLb = selected.reduce((sum, r) => sum + (r.expected_volume || 0), 0)
          const totalCostCents = selected.reduce((sum, r) => sum + (r.costPerPoundCents || 0) * (r.expected_volume || 0), 0)
          const catalog = rows[block].filter((r) => !r.isCustom)
          const pickerRecipes: PickerRecipe[] = catalog.map((r) => ({
            recipe_id: r.recipe_id!,
            name: r.name,
            category: r.category,
            costPerPoundCents: r.costPerPoundCents,
            suggestedServingG: r.suggestedServingG ?? null,
            supplierName: r.supplierName ?? null,
          }))
          const excludeIds = new Set(catalog.filter((r) => r.selected).map((r) => r.recipe_id!))

          return (
            <div key={block} className="rounded-xl border border-[#E4D8C9] bg-[rgba(251,247,240,0.9)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.color }}></div>
                  <h3 className="text-sm font-extrabold" style={{ color: cfg.color }}>{cfg.label}</h3>
                  <span className="text-xs text-[#2E527F]">{cfg.sub}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setMovingOpen(movingOpen === block ? null : block); setMoveDate('') }}
                    disabled={savingBlock === block || selected.length === 0}
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-40"
                    style={{ borderColor: cfg.color, color: cfg.color }}
                    title="Move this block's built content to a different date"
                  >
                    Move to...
                  </button>
                  <button
                    onClick={() => onSaveBlock(block)}
                    disabled={!dirty[block] || savingBlock === block}
                    className="rounded-lg text-white px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
                    style={{ backgroundColor: cfg.color }}
                  >
                    {savingBlock === block ? 'Saving...' : dirty[block] ? 'Save Block' : 'Saved'}
                  </button>
                </div>
              </div>

              {/* Re-home this block's already-built content to a different
                  date -- distinct from the page-level "Week of" picker
                  (which is for browsing/building at a chosen week), this
                  moves what's already here, not what you're about to build. */}
              {movingOpen === block && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed p-2" style={{ borderColor: cfg.color }}>
                  <label className="text-xs font-bold" style={{ color: cfg.color }}>Move to week of:</label>
                  <input
                    type="date"
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                    className="h-7 rounded border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
                  />
                  <button
                    onClick={() => { if (moveDate) { onMoveBlock(block, moveDate); setMovingOpen(null) } }}
                    disabled={!moveDate || savingBlock === block}
                    className="rounded-lg text-white px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
                    style={{ backgroundColor: cfg.color }}
                  >
                    Confirm Move
                  </button>
                  <button onClick={() => setMovingOpen(null)} className="text-xs font-bold text-[#755B4C] hover:underline">
                    Cancel
                  </button>
                </div>
              )}

              {/* Selected list -- just what's live for this block, nothing to scroll past */}
              <div className="space-y-1.5 mb-2">
                {selected.length === 0 ? (
                  <p className="text-xs text-[#755B4C] italic px-1 py-2">Nothing added yet</p>
                ) : (
                  selected.map((r) => (
                    <div
                      key={rowKey(r)}
                      draggable={!r.isCustom}
                      onDragStart={(e) => !r.isCustom && e.dataTransfer.setData('text/plain', String(r.recipe_id))}
                      className={`flex items-center gap-2 rounded-lg ${rowAccentForCategory(r.category)} border border-[#E4D8C9] px-2.5 py-1.5 ${!r.isCustom ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      title={!r.isCustom ? 'Drag onto "Build a plate" below to use in a plate' : undefined}
                    >
                      <button
                        onClick={() => onRemoveRow(block, r)}
                        className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D] transition"
                        aria-label={`Remove ${r.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <p className="font-medium text-[#4B2B1D] truncate w-32 flex-shrink-0 text-sm">
                        {r.name}
                        {r.isCustom && (
                          <span className="ml-1.5 rounded-full bg-[#EAF0F7] px-1.5 py-[1px] text-[9px] font-bold text-[#2E527F] align-middle">combo</span>
                        )}
                      </p>
                      <p className="text-[11px] text-[#2E527F] flex-1 truncate">
                        {r.calories} cal · {r.protein_g.toFixed(0)}g P · {r.carbs_g.toFixed(0)}g C · {r.fat_g.toFixed(0)}g F · ${(r.costPerPoundCents / 100).toFixed(2)}/lb
                      </p>
                      {(() => {
                        const servingG = regularServingSizeFor(r)
                        if (servingG) {
                          // Primary entry is servings to cook -- lb (what
                          // actually gets saved to expected_volume, and from
                          // there drives ingredient scaling, prep tasks,
                          // procurement, and cost) is calculated from it, not
                          // typed by hand.
                          const servings = Math.round(((r.expected_volume || 0) * 453.592) / servingG)
                          return (
                            <>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={servings}
                                onChange={(e) => {
                                  const newServings = parseFloat(e.target.value) || 0
                                  onUpdateVolume(block, r, (newServings * servingG) / 453.592)
                                }}
                                placeholder="servings"
                                title="Servings to cook -- lb is calculated automatically from the Regular serving size"
                                className="w-16 h-7 rounded border border-[#B9A88F] bg-white px-1 text-xs text-center outline-none flex-shrink-0"
                              />
                              <span
                                className="flex-shrink-0 rounded-full bg-[#EAF0F7] px-1.5 py-[1px] text-[9px] font-bold text-[#2E527F] whitespace-nowrap"
                                title={`${servings} servings x ${Math.round(servingG)}g (Regular) = ${(r.expected_volume || 0).toFixed(1)} lb forecasted`}
                              >
                                ≈ {(r.expected_volume || 0).toFixed(1)} lb
                              </span>
                            </>
                          )
                        }
                        // No Regular-format mapping for this category (sauces,
                        // beverages, custom combos) -- nothing to convert
                        // servings against, so this one row keeps direct lb entry.
                        return (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={r.expected_volume}
                            onChange={(e) => onUpdateVolume(block, r, parseFloat(e.target.value) || 0)}
                            placeholder="lb"
                            title="No standard serving size for this category -- enter lb directly"
                            className="w-14 h-7 rounded border border-[#B9A88F] bg-white px-1 text-xs text-center outline-none flex-shrink-0"
                          />
                        )
                      })()}
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setAddOpen((m) => ({ ...m, [block]: !m[block] }))}
                className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#2E527F] py-1.5 text-xs font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition mb-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add recipe
              </button>

              {addOpen[block] && (
                <RecipePicker recipes={pickerRecipes} excludeIds={excludeIds} onAdd={(r) => onAddRecipe(block, r.recipe_id)} />
              )}

              {/* Plates -- a protein paired with default sides, featured
                  (but still customizable) on the ordering page. Built from
                  whatever's already selected above, not a separate recipe
                  pool, so a plate can only ever reference what's actually
                  live for this block. */}
              {(() => {
                const blockPlates = plateOptions.filter((p) => p.block === block)
                const draft = plateDraft[block]
                const draftProtein = draft.proteinId ? selected.find((r) => r.recipe_id === draft.proteinId) : null
                const draftSides = draft.sideIds.map((id) => selected.find((r) => r.recipe_id === id)).filter((r): r is PlanRecipeRow => !!r)
                const draftIngredientById = new Map(inventoryItems.map((i) => [i.id, i]))
                const isDropActive = plateDropActive === block
                const rowById = (id: number) => selected.find((r) => r.recipe_id === id)
                const macroLine = (r: PlanRecipeRow) =>
                  `${r.calories} cal · ${r.protein_g.toFixed(0)}g P · ${r.carbs_g.toFixed(0)}g C · ${r.fat_g.toFixed(0)}g F`
                // Same Regular-format stats as the draft above, resolved
                // from whatever ingredients are still live in this block --
                // a side pulled out of the block after the plate was saved
                // just drops out of the total rather than erroring. Extra
                // ingredients are flat (their grams are explicit, not
                // format-scaled), so they're added on top of the recipe
                // total rather than run through regularFormatStatsFor.
                const plateExtraStats = (extras: PlateExtraIngredient[]) =>
                  extras.reduce(
                    (acc, e) => ({
                      costCents: acc.costCents + (e.costCents || 0),
                      calories: acc.calories + e.calories,
                      protein_g: acc.protein_g + e.protein_g,
                      carbs_g: acc.carbs_g + e.carbs_g,
                      fat_g: acc.fat_g + e.fat_g,
                    }),
                    { costCents: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
                  )
                const combineStats = (
                  a: { costCents: number; calories: number; protein_g: number; carbs_g: number; fat_g: number } | null,
                  b: { costCents: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }
                ) =>
                  a
                    ? { costCents: a.costCents + b.costCents, calories: a.calories + b.calories, protein_g: a.protein_g + b.protein_g, carbs_g: a.carbs_g + b.carbs_g, fat_g: a.fat_g + b.fat_g }
                    : b.costCents || b.calories || b.protein_g || b.carbs_g || b.fat_g
                    ? b
                    : null
                const plateRegularStats = (plate: PlateOption) => {
                  const ids = [plate.proteinRecipeId, ...plate.sides.map((s) => s.recipeId)]
                  const matched = ids.map((id) => selected.find((r) => r.recipe_id === id)).filter((r): r is PlanRecipeRow => !!r)
                  return combineStats(regularFormatStatsFor(matched), plateExtraStats(plate.extraIngredients))
                }

                // How many of this exact plate can actually be assembled
                // this week, bottlenecked by whichever component (protein
                // or a side) runs out first at its own Regular-serving
                // size -- not a separately staff-guessed number, so it
                // can't drift from what's really been prepped/forecasted.
                // A component recipe no longer live in this block (pulled
                // out after the plate was saved) hard-zeroes the count
                // rather than silently being skipped, since that's a real
                // "this plate can't be made as configured" signal, not a
                // rounding edge case. Extra ingredients (garnishes from
                // inventory, not the recipe pool) never bottleneck this --
                // same "recipes matching the plate" scope as the rest of
                // this feature.
                const plateServingsAvailable = (proteinRecipeId: number | null, sideRecipeIds: number[]): number | null => {
                  if (!proteinRecipeId) return null
                  const counts: number[] = []
                  for (const id of [proteinRecipeId, ...sideRecipeIds]) {
                    const row = selected.find((r) => r.recipe_id === id)
                    if (!row) { counts.push(0); continue }
                    const servings = regularServingsFor(row)
                    if (servings) counts.push(servings.count)
                  }
                  return counts.length > 0 ? Math.min(...counts) : null
                }

                return (
                  <div className="mt-2 border-t border-[#E4D8C9] pt-2">
                    {blockPlates.length > 0 && (
                      <div className="mb-1.5 space-y-1">
                        {blockPlates.map((plate) => {
                          const stats = plateRegularStats(plate)
                          const servingsAvailable = plateServingsAvailable(plate.proteinRecipeId, plate.sides.map((s) => s.recipeId))
                          return (
                            <div key={plate.id} className="flex items-center gap-2 rounded-lg border border-[#E4D8C9] bg-white px-2.5 py-1.5">
                              <button
                                onClick={() => onDeletePlate(plate.id)}
                                className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D] transition"
                                aria-label={`Remove plate ${plate.name || plate.proteinName}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs">
                                  <span className="font-bold text-[#4B2B1D]">{plate.name || plate.proteinName}</span>
                                  {plate.sides.length > 0 && (
                                    <span className="text-[#755B4C]"> · {plate.sides.map((s) => s.name).join(', ')}</span>
                                  )}
                                  {plate.extraIngredients.length > 0 && (
                                    <span className="text-[#9A5B06]"> · + {plate.extraIngredients.map((e) => `${e.name} (${e.grams}g)`).join(', ')}</span>
                                  )}
                                </p>
                                {stats && (
                                  <p className="truncate text-[10px] text-[#2E527F]">
                                    Regular: ${(stats.costCents / 100).toFixed(2)} · {Math.round(stats.calories)} cal · {stats.protein_g.toFixed(0)}g P · {stats.carbs_g.toFixed(0)}g C · {stats.fat_g.toFixed(0)}g F
                                  </p>
                                )}
                              </div>
                              {servingsAvailable != null && (
                                <span
                                  className={`flex-shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold whitespace-nowrap ${
                                    servingsAvailable > 0 ? 'bg-[#EAF0F7] text-[#2E527F]' : 'bg-[#FFF4F5] text-[#D62F3D]'
                                  }`}
                                  title="How many of this plate can be assembled this week, bottlenecked by whichever protein/side recipe runs out first at Regular serving size"
                                >
                                  {servingsAvailable} plate{servingsAvailable === 1 ? '' : 's'} this week
                                </span>
                              )}
                              <button
                                onClick={() => startEditingPlate(block, plate)}
                                className="flex-shrink-0 text-[#2E527F] hover:text-[#16425F] transition"
                                aria-label={`Edit plate ${plate.name || plate.proteinName}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <span className="flex-shrink-0 rounded-full bg-[#F1EAE0] px-1.5 py-[1px] text-[9px] font-bold text-[#755B4C]">plate</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {draft.editingId != null && (
                      <div className="mb-1.5 flex items-center justify-between rounded-lg border border-dashed border-[#2E527F] bg-[#EAF0F7] px-2.5 py-1.5">
                        <p className="text-[10.5px] font-bold text-[#2E527F]">Editing: {draft.name || 'this plate'}</p>
                        <button onClick={() => cancelPlateDraft(block)} className="text-[10.5px] font-bold text-[#2E527F] hover:underline">
                          Cancel
                        </button>
                      </div>
                    )}

                    <div
                      onDragOver={(e) => { e.preventDefault(); setPlateDropActive(block) }}
                      onDragLeave={() => setPlateDropActive((b) => (b === block ? null : b))}
                      onDrop={(e) => {
                        e.preventDefault()
                        setPlateDropActive(null)
                        const recipeId = parseInt(e.dataTransfer.getData('text/plain'), 10)
                        const row = rowById(recipeId)
                        if (row) dropOnPlate(block, recipeId, row.category)
                      }}
                      className="rounded-lg border border-dashed p-2.5 transition"
                      style={{ borderColor: isDropActive ? cfg.color : '#9A7E6F', backgroundColor: isDropActive ? '#F1EAE0' : 'transparent' }}
                    >
                      {!draftProtein && draftSides.length === 0 && draft.extraIngredients.length === 0 ? (
                        <p className="text-center text-[10.5px] font-bold text-[#755B4C]">
                          Drag a protein + sides from above to build a plate
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {/* All dragged items plus any extra ingredients in
                              one wrapping row -- recipes stay category-
                              colored, extras get their own dashed/amber
                              "garnish" style so it's clear at a glance which
                              items are swappable plate structure vs. always-
                              included flat add-ons. */}
                          <div className="flex flex-wrap gap-1.5">
                            {draftProtein && (
                              <div className={`flex items-center gap-1.5 rounded-lg ${rowAccentForCategory(draftProtein.category)} border border-[#E4D8C9] px-2 py-1`}>
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-bold text-[#4B2B1D]">{draftProtein.name}</p>
                                  <p className="truncate text-[9.5px] text-[#2E527F]">{macroLine(draftProtein)}</p>
                                </div>
                                <button onClick={() => removeFromPlateDraft(block, draftProtein.recipe_id!)} className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]" aria-label={`Remove ${draftProtein.name} from plate`}>
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            {draftSides.map((side) => (
                              <div key={side.recipe_id} className={`flex items-center gap-1.5 rounded-lg ${rowAccentForCategory(side.category)} border border-[#E4D8C9] px-2 py-1`}>
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-bold text-[#4B2B1D]">{side.name}</p>
                                  <p className="truncate text-[9.5px] text-[#2E527F]">{macroLine(side)}</p>
                                </div>
                                <button onClick={() => removeFromPlateDraft(block, side.recipe_id!)} className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]" aria-label={`Remove ${side.name} from plate`}>
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {draft.extraIngredients.map((extra) => {
                              const ing = draftIngredientById.get(extra.inventoryId)
                              if (!ing) return null
                              return (
                                <PlateExtraIngredientChip
                                  key={extra.inventoryId}
                                  ingredient={ing}
                                  grams={extra.grams}
                                  onUpdateGrams={(grams) => updateExtraIngredientGrams(block, extra.inventoryId, grams)}
                                  onRemove={() => removeExtraIngredientFromDraft(block, extra.inventoryId)}
                                />
                              )
                            })}
                          </div>
                          {!draftProtein && (
                            <p className="text-[10px] font-bold text-[#D97706]">Drag a protein in too -- a plate needs one</p>
                          )}

                          <button
                            onClick={() => setIngredientPickerOpen((m) => ({ ...m, [block]: !m[block] }))}
                            className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#D97706] py-1.5 text-[10.5px] font-bold text-[#D97706] hover:bg-[#FDF3E3] transition"
                          >
                            <Plus className="h-3 w-3" /> Add Ingredient
                          </button>

                          {ingredientPickerOpen[block] && (
                            <PlateExtraIngredientPicker
                              ingredients={inventoryItems}
                              excludeIds={new Set(draft.extraIngredients.map((e) => e.inventoryId))}
                              onAdd={(ing, grams) => addExtraIngredientToDraft(block, ing, grams)}
                            />
                          )}

                          {/* What a customer actually gets at the Regular
                              format -- real per-serving cost/macros, not the
                              per-lb forecast figures shown on the chips
                              above. Items with no Regular-format mapping
                              (sauces) show on the chips but don't count here,
                              matching how sauces price as separate add-ons
                              everywhere else in the app. Extra ingredients
                              are flat -- added on top regardless of format. */}
                          {(() => {
                            const items = [draftProtein, ...draftSides].filter((r): r is PlanRecipeRow => !!r)
                            const extras = draft.extraIngredients
                              .map((e) => {
                                const ing = draftIngredientById.get(e.inventoryId)
                                if (!ing) return null
                                const s = extraIngredientStats(ing, e.grams)
                                return { costCents: s.costCents || 0, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g }
                              })
                              .filter((x): x is { costCents: number; calories: number; protein_g: number; carbs_g: number; fat_g: number } => !!x)
                            const totals = combineStats(regularFormatStatsFor(items), extras.reduce(
                              (acc, e) => ({ costCents: acc.costCents + e.costCents, calories: acc.calories + e.calories, protein_g: acc.protein_g + e.protein_g, carbs_g: acc.carbs_g + e.carbs_g, fat_g: acc.fat_g + e.fat_g }),
                              { costCents: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
                            ))
                            if (!totals) return null
                            const servingsAvailable = plateServingsAvailable(draft.proteinId, draft.sideIds)
                            return (
                              <div className="rounded-lg bg-[#F1EAE0] px-2.5 py-1.5">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-[#755B4C]">Plate stats · Regular format</p>
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-extrabold" style={{ color: cfg.color }}>${(totals.costCents / 100).toFixed(2)}</p>
                                  <p className="text-[10.5px] font-bold text-[#2E527F]">
                                    {Math.round(totals.calories)} cal · {totals.protein_g.toFixed(0)}g P · {totals.carbs_g.toFixed(0)}g C · {totals.fat_g.toFixed(0)}g F
                                  </p>
                                </div>
                                {servingsAvailable != null && (
                                  <p className={`mt-0.5 text-[10px] font-bold ${servingsAvailable > 0 ? 'text-[#2E527F]' : 'text-[#D62F3D]'}`}>
                                    {servingsAvailable} plate{servingsAvailable === 1 ? '' : 's'} makeable this week -- bottlenecked by {
                                      (() => {
                                        const rowsIn = [draft.proteinId, ...draft.sideIds]
                                          .map((id) => selected.find((r) => r.recipe_id === id))
                                          .filter((r): r is PlanRecipeRow => !!r)
                                        const bottleneck = rowsIn
                                          .map((r) => ({ r, s: regularServingsFor(r) }))
                                          .filter((x): x is { r: PlanRecipeRow; s: { count: number; servingG: number } } => !!x.s)
                                          .sort((a, b) => a.s.count - b.s.count)[0]
                                        return bottleneck ? bottleneck.r.name : 'a missing ingredient'
                                      })()
                                    }
                                  </p>
                                )}
                              </div>
                            )
                          })()}

                          <input
                            value={draft.name}
                            onChange={(e) => setPlateDraftName(block, e.target.value)}
                            placeholder="Plate name..."
                            className="h-7 w-full rounded border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => submitPlate(block)}
                              disabled={!draftProtein}
                              className="h-7 flex-1 rounded-lg text-white px-3 text-xs font-bold transition disabled:opacity-40"
                              style={{ backgroundColor: cfg.color }}
                            >
                              {draft.editingId != null ? 'Save Changes' : 'Create Plate'}
                            </button>
                            <button
                              onClick={() => cancelPlateDraft(block)}
                              className="text-xs font-bold text-[#755B4C] hover:underline"
                            >
                              {draft.editingId != null ? 'Cancel' : 'Clear'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Stats footer -- summarizes what's actually been chosen above */}
              <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex items-center justify-between">
                <p className="text-xs text-[#2E527F]">
                  {selected.length} item{selected.length === 1 ? '' : 's'} live · {totalLb.toFixed(2)} lb forecasted
                </p>
                <p className="text-xs font-bold" style={{ color: cfg.color }}>${(totalCostCents / 100).toFixed(2)}</p>
              </div>

              {dirty[block] && (
                <p className="mt-2 flex items-center gap-1 text-xs text-[#D97706]">
                  <AlertCircle className="h-3.5 w-3.5" /> Unsaved changes
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
