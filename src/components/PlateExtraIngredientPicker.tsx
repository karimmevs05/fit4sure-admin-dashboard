import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'

// A flat extra ingredient on a plate -- maple syrup on a breakfast plate,
// parmesan on a pasta plate. Sourced straight from inventory (not the
// recipe catalog, which is what sides/proteins come from), always included
// as curated rather than swappable or separately charged. Same fields the
// backend's plateExtraIngredients.js resolver already computes, so a
// picked item can be rendered immediately without waiting on a save.
export type PlateIngredientOption = {
  id: number
  name: string
  category: string
  unitPriceCents: number | null
  caloriesPer100g: number | null
  proteinPer100g: number | null
  carbsPer100g: number | null
  fatPer100g: number | null
}

const GRAMS_PER_POUND = 453.592
export const DEFAULT_EXTRA_INGREDIENT_GRAMS = 10

export function extraIngredientStats(ing: PlateIngredientOption, grams: number) {
  const frac = grams / 100
  return {
    costCents: ing.unitPriceCents ? (ing.unitPriceCents / GRAMS_PER_POUND) * grams : null,
    calories: ing.caloriesPer100g != null ? ing.caloriesPer100g * frac : 0,
    protein_g: ing.proteinPer100g != null ? ing.proteinPer100g * frac : 0,
    carbs_g: ing.carbsPer100g != null ? ing.carbsPer100g * frac : 0,
    fat_g: ing.fatPer100g != null ? ing.fatPer100g * frac : 0,
  }
}

// Type-ahead search over the full inventory catalog (not scoped to this
// week's plan, unlike the recipe pool a plate's protein/sides come from --
// a garnish like maple syrup is just always-available stock) -- same
// pattern as the recipe-building IngredientPicker.tsx, minus the
// "create new" shortcut, since a plate garnish should already exist in
// Inventory rather than be invented here.
export function PlateExtraIngredientPicker({
  ingredients,
  excludeIds,
  onAdd,
}: {
  ingredients: PlateIngredientOption[]
  excludeIds: Set<number>
  onAdd: (ingredient: PlateIngredientOption, grams: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return ingredients.filter((i) => !excludeIds.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8)
  }, [ingredients, excludeIds, query])

  return (
    <div className="relative mb-2">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search ingredients..."
        className="h-8 w-full rounded-md border border-[#D97706] bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-[#D97706]/15"
      />
      {open && query.trim() && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#D97706] bg-white shadow-lg max-h-56 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#9A7E6F]">No matches.</div>
          ) : (
            matches.map((ing) => {
              const stats = extraIngredientStats(ing, DEFAULT_EXTRA_INGREDIENT_GRAMS)
              return (
                <button
                  type="button"
                  key={ing.id}
                  onClick={() => {
                    onAdd(ing, DEFAULT_EXTRA_INGREDIENT_GRAMS)
                    setQuery('')
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#FDF3E3] border-b border-[#F0E9DC] last:border-0"
                >
                  <span>
                    <p className="font-semibold text-[#4B2B1D]">{ing.name}</p>
                    <p className="text-[10px] text-[#9A5B06]">
                      {Math.round(stats.calories)} cal · {stats.protein_g.toFixed(1)}g P · {stats.carbs_g.toFixed(1)}g C · {stats.fat_g.toFixed(1)}g F at {DEFAULT_EXTRA_INGREDIENT_GRAMS}g
                    </p>
                  </span>
                  <span className="shrink-0 rounded-full bg-[#F1EAE0] px-2 py-0.5 text-[9px] font-extrabold text-[#755B4C]">{ing.category}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// Editable grams chip for an already-picked extra ingredient -- same shape
// as a RecipePicker SelectedChip, just over inventory data.
export function PlateExtraIngredientChip({
  ingredient,
  grams,
  onUpdateGrams,
  onRemove,
}: {
  ingredient: PlateIngredientOption
  grams: number
  onUpdateGrams: (grams: number) => void
  onRemove: () => void
}) {
  const stats = extraIngredientStats(ingredient, grams)
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#D97706] bg-[#FDF3E3] px-2 py-1">
      <button onClick={onRemove} className="flex-shrink-0 text-[#D97706] hover:text-[#D62F3D]" aria-label={`Remove ${ingredient.name} from plate`}>
        <X className="h-3 w-3" />
      </button>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold text-[#4B2B1D]">{ingredient.name}</p>
        <p className="truncate text-[9.5px] text-[#9A5B06]">
          {Math.round(stats.calories)} cal · {stats.protein_g.toFixed(1)}g P · {stats.carbs_g.toFixed(1)}g C · {stats.fat_g.toFixed(1)}g F
        </p>
      </div>
      <input
        type="number"
        min="1"
        step="1"
        value={grams}
        onChange={(e) => onUpdateGrams(parseFloat(e.target.value) || 0)}
        className="w-12 h-6 flex-shrink-0 rounded border border-[#D97706] bg-white px-1 text-[11px] text-center outline-none"
      />
      <span className="text-[10px] text-[#D97706] flex-shrink-0">g</span>
    </div>
  )
}
