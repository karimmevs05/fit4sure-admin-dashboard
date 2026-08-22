import React, { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'

export type PickerRecipe = {
  recipe_id: number
  name: string
  category: string
  costPerPoundCents: number
  suggestedServingG: number | null
  supplierName: string | null
}

const GRAMS_PER_POUND = 455

// Protein recipes are butcher-portioned (ounces), not weighed in grams like
// everything else -- matches formatLbOz/formatIngredientWeight's convention
// elsewhere in the app.
export const PROTEIN_RECIPE_CATEGORIES = new Set(['beef', 'chicken', 'turkey'])

export function formatServingSize(grams: number, category: string) {
  if (PROTEIN_RECIPE_CATEGORIES.has(category)) return `${(grams / 28.3495).toFixed(1)}oz`
  return `${Math.round(grams)}g`
}

// Quick-glance line: $/lb, the regular serving size, how many of those fit
// in a lb, and $/serving -- no calories, since this is about what to
// buy/charge, not nutrition, at the moment you're deciding whether to add it.
export function pickerInfoLine(r: PickerRecipe) {
  const pricePerLb = `$${(r.costPerPoundCents / 100).toFixed(2)}/lb`
  if (!r.suggestedServingG || r.suggestedServingG <= 0) return pricePerLb
  const servingsPerLb = GRAMS_PER_POUND / r.suggestedServingG
  const pricePerServing = (r.costPerPoundCents / 100) / servingsPerLb
  const servingSize = formatServingSize(r.suggestedServingG, r.category)
  return `${pricePerLb} · Regular serving size: ${servingSize} (${servingsPerLb.toFixed(1)}/lb) · $${pricePerServing.toFixed(2)}/srv`
}

const CATEGORY_LABELS: Record<string, string> = {
  beef: 'Beef',
  chicken: 'Chicken',
  turkey: 'Turkey',
  carbohydrates: 'Carb',
  vegetables: 'Veg',
  sauces: 'Sauces',
  beverage: 'Beverage',
  breakfast: 'Breakfast',
}

// Shared browse/search/filter panel -- category pills, search, a list of
// recipes not already added, each row showing $/lb, regular serving size,
// $/serving, and a supplier tag. Used by both the Weekly Recipe Plan blocks
// and the Custom Plate Builder so adding a recipe reads and behaves
// identically in both places.
//
// selectedAmounts/onUpdateAmount/onRemoveSelected are optional: when passed
// (Plate Builder only), a recipe that's already in the plate stays visible
// in this same list instead of being excluded, shown checked with an
// editable gram amount, its macros at that amount, and a remove control --
// so there's one list to scan, not a picker plus a separate "what's in the
// plate" list saying the same names twice. Selected items sit in their own
// section above the category/search filters, so switching category or
// searching never hides what's already in the plate.
export function RecipePicker({
  recipes,
  excludeIds,
  onAdd,
  selectedAmounts,
  onUpdateAmount,
  onRemoveSelected,
  selectedMacros,
}: {
  recipes: PickerRecipe[]
  excludeIds: Set<number>
  onAdd: (recipe: PickerRecipe) => void
  selectedAmounts?: Map<number, string>
  onUpdateAmount?: (recipeId: number, grams: string) => void
  onRemoveSelected?: (recipeId: number) => void
  selectedMacros?: Map<number, string>
}) {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')

  const categories = Array.from(new Set(recipes.map((r) => r.category)))
  // Selected chips sit in a fixed row right under the category pills --
  // never affected by category/search, and never scrolled out of view by
  // the browsable list underneath, which is the part that actually needs
  // to scroll through dozens of recipes.
  const selectedList = selectedAmounts ? recipes.filter((r) => selectedAmounts.has(r.recipe_id)) : []
  const available = recipes.filter(
    (r) =>
      !selectedAmounts?.has(r.recipe_id) &&
      !excludeIds.has(r.recipe_id) &&
      (category === 'all' || r.category === category) &&
      (search.trim() === '' || r.name.toLowerCase().includes(search.trim().toLowerCase()))
  )

  return (
    <div className="rounded-lg border border-[#2E527F] bg-white p-2.5 mb-2">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9A7E6F]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="h-8 w-full rounded-md border border-[#E4D8C9] bg-[#FBF7F0] pl-7 pr-2 text-xs outline-none focus:border-[#2E527F]"
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        <button
          onClick={() => setCategory('all')}
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
            category === 'all' ? 'bg-[#2E527F] text-white' : 'bg-[#F1EAE0] text-[#755B4C] hover:bg-[#E4D8C9]'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
              category === c ? 'bg-[#2E527F] text-white' : 'bg-[#F1EAE0] text-[#755B4C] hover:bg-[#E4D8C9]'
            }`}
          >
            {CATEGORY_LABELS[c] || c}
          </button>
        ))}
      </div>

      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-[#E4D8C9]">
          {selectedList.map((r) => {
            const amount = selectedAmounts!.get(r.recipe_id)!
            return (
              <div key={r.recipe_id} className="flex items-center gap-1.5 rounded-md bg-[#EAF0F7] px-2 py-1.5">
                <button
                  onClick={() => onRemoveSelected?.(r.recipe_id)}
                  className="flex-shrink-0 text-[#2E527F] hover:text-[#D62F3D] transition"
                  aria-label={`Remove ${r.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <p className="font-medium text-[#4B2B1D] whitespace-nowrap text-xs">{r.name}</p>
                    {r.supplierName && (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-1.5 py-[1px] text-[9px] font-bold text-[#755B4C]">{r.supplierName}</span>
                    )}
                  </span>
                  {selectedMacros?.get(r.recipe_id) && (
                    <p className="whitespace-nowrap text-[10.5px] text-[#2E527F]">{selectedMacros.get(r.recipe_id)}</p>
                  )}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => onUpdateAmount?.(r.recipe_id, e.target.value)}
                  className="w-14 h-7 flex-shrink-0 rounded border border-[#2E527F] bg-white px-1 text-xs text-center outline-none"
                />
                <span className="text-[10px] text-[#2E527F] flex-shrink-0 w-3">g</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="max-h-[220px] overflow-y-auto space-y-1">
        {available.length === 0 ? (
          <p className="text-xs text-[#755B4C] italic px-1 py-1">
            {recipes.every((r) => excludeIds.has(r.recipe_id) || selectedAmounts?.has(r.recipe_id))
              ? 'Everything in this category is already added'
              : 'No matches'}
          </p>
        ) : (
          available.map((r) => (
            <button
              key={r.recipe_id}
              onClick={() => onAdd(r)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[#F1EAE0] transition"
            >
              <Plus className="h-3 w-3 text-[#2E527F] flex-shrink-0 mt-[3px]" />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <p className="font-medium text-[#4B2B1D] truncate text-xs">{r.name}</p>
                  {r.supplierName && (
                    <span className="shrink-0 rounded-full bg-[#F1EAE0] px-1.5 py-[1px] text-[9px] font-bold text-[#755B4C]">{r.supplierName}</span>
                  )}
                </span>
                <p className="text-[10.5px] text-[#2E527F] truncate">{pickerInfoLine(r)}</p>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
