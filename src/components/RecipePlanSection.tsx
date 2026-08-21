import React, { useState } from 'react'
import { AlertCircle, Plus, X } from 'lucide-react'
import { RecipePicker } from './RecipePicker'
import type { PickerRecipe } from './RecipePicker'

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
  onAddRecipe,
  onRemoveRow,
  onUpdateVolume,
  onSaveBlock,
}: {
  rows: Record<Block, PlanRecipeRow[]>
  weekStart?: string
  dirty: Record<Block, boolean>
  savingBlock: Block | null
  onAddRecipe: (block: Block, recipeId: number) => void
  onRemoveRow: (block: Block, row: PlanRecipeRow) => void
  onUpdateVolume: (block: Block, row: PlanRecipeRow, volume: number) => void
  onSaveBlock: (block: Block) => void
}) {
  const [addOpen, setAddOpen] = useState<Record<Block, boolean>>({ monday: false, thursday: false })

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-extrabold text-[#4B2B1D]">Weekly Menu Planner</h2>
        <p className="mt-1 text-sm text-[#755B4C]">
          What's live for {weekStart ? new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'next week'} --
          feeds both delivery orders and counter sales. Forecasts are in lb; macros/cost are per lb (455g).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {(['monday', 'thursday'] as Block[]).map((block) => {
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
                <button
                  onClick={() => onSaveBlock(block)}
                  disabled={!dirty[block] || savingBlock === block}
                  className="rounded-lg text-white px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
                  style={{ backgroundColor: cfg.color }}
                >
                  {savingBlock === block ? 'Saving...' : dirty[block] ? 'Save Block' : 'Saved'}
                </button>
              </div>

              {/* Selected list -- just what's live for this block, nothing to scroll past */}
              <div className="space-y-1.5 mb-2">
                {selected.length === 0 ? (
                  <p className="text-xs text-[#755B4C] italic px-1 py-2">Nothing added yet</p>
                ) : (
                  selected.map((r) => (
                    <div key={rowKey(r)} className="flex items-center gap-2 rounded-lg bg-white border border-[#E4D8C9] px-2.5 py-1.5">
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
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={r.expected_volume}
                        onChange={(e) => onUpdateVolume(block, r, parseFloat(e.target.value) || 0)}
                        placeholder="lb"
                        className="w-14 h-7 rounded border border-[#B9A88F] bg-white px-1 text-xs text-center outline-none flex-shrink-0"
                      />
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

              {/* Stats footer -- summarizes what's actually been chosen above */}
              <div className="mt-3 pt-3 border-t border-[#E4D8C9] flex items-center justify-between">
                <p className="text-xs text-[#2E527F]">
                  {selected.length} item{selected.length === 1 ? '' : 's'} live · {totalLb} lb forecasted
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
