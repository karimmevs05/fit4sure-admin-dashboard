import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { formatIngredientWeight } from '../utils/unitConversion'

export type PickedIngredient = {
  inventory_id: number
  name: string
  category: string
  quantity_g: number
  prep_section?: string | null
  unit_price_cents: number | null
  protein_per_100g: number | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
  calories_per_100g: number | null
}

type InventoryOption = {
  id: number
  name: string
  category: string
  unit_price_cents: number | null
  current_stock_g: number | null
  protein_per_100g: number | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
  calories_per_100g: number | null
}

// Same heuristic already used elsewhere in the codebase for a
// freshly-typed ingredient's likely category -- kept local so this
// component has no dependency on Recipes.tsx internals.
function guessInventoryCategory(name: string): string {
  const lower = name.toLowerCase()
  if (/chicken|beef|pork|turkey|fish|shrimp|salmon|steak|meat|egg|tofu/.test(lower)) return 'Protein'
  if (/rice|potato|pasta|bread|oat|quinoa|bean|corn|tortilla/.test(lower)) return 'Carbohydrates'
  if (/pepper|onion|carrot|broccoli|spinach|lettuce|tomato|vegetable|greens|squash|cauliflower|asparagus/.test(lower))
    return 'Vegetables'
  return 'Condiments'
}

export function IngredientPicker({ onAdd }: { onAdd: (ingredient: PickedIngredient) => void }) {
  const [options, setOptions] = useState<InventoryOption[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<InventoryOption | null>(null)
  const [quantityG, setQuantityG] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    ;(async () => {
      try {
        const res = await axios.get(`${apiUrl}/api/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setOptions(res.data.data || [])
      } catch (err) {
        console.error('Error fetching inventory options:', err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8)
  }, [options, query])

  const exactMatch = options.find((o) => o.name.toLowerCase() === query.trim().toLowerCase())

  const selectOption = (opt: InventoryOption) => {
    setSelected(opt)
    setQuery(opt.name)
    setOpen(false)
  }

  const createNew = async () => {
    const name = query.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await axios.post(
        `${apiUrl}/api/inventory`,
        { name, category: guessInventoryCategory(name), unit_price_cents: null, serving_size_g: 100 },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const created = res.data.data
      setOptions((prev) => [...prev, created])
      selectOption(created)
    } catch (err) {
      console.error('Error creating new inventory ingredient:', err)
      alert('Failed to create new ingredient')
    } finally {
      setCreating(false)
    }
  }

  const handleAdd = () => {
    const qty = parseFloat(quantityG)
    if (!selected || !qty || qty <= 0) {
      alert('Pick an ingredient from the list and enter a quantity in grams')
      return
    }
    onAdd({
      inventory_id: selected.id,
      name: selected.name,
      category: selected.category,
      quantity_g: qty,
      unit_price_cents: selected.unit_price_cents,
      protein_per_100g: selected.protein_per_100g,
      carbs_per_100g: selected.carbs_per_100g,
      fat_per_100g: selected.fat_per_100g,
      calories_per_100g: selected.calories_per_100g,
    })
    setSelected(null)
    setQuery('')
    setQuantityG('')
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Ingredient</label>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type an ingredient name..."
          className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
        />
        {open && query.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#B9A88F] bg-white shadow-lg max-h-56 overflow-y-auto">
            {matches.map((opt) => {
              const inStock = (opt.current_stock_g || 0) > 0
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => selectOption(opt)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F2E8] border-b border-[#F0E9DC] last:border-0"
                >
                  <div>
                    <p className="font-semibold text-[#4B2B1D]">{opt.name}</p>
                    {opt.protein_per_100g != null && (
                      <p className="text-[10px] text-[#9A7E6F]">
                        {opt.protein_per_100g}g pro · {opt.carbs_per_100g}g carb · {opt.fat_per_100g}g fat /100g
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                      inStock ? 'bg-[#EAF5EC] text-[#16834A]' : 'bg-[#F1EAE0] text-[#9A7E6F]'
                    }`}
                  >
                    {inStock ? `In Stock · ${formatIngredientWeight(opt.current_stock_g!, opt.category)}` : 'Not in Stock'}
                  </span>
                </button>
              )
            })}
            {matches.length === 0 && <div className="px-3 py-2 text-xs text-[#9A7E6F]">No matches.</div>}
            {!exactMatch && query.trim() && (
              <button
                type="button"
                onClick={createNew}
                disabled={creating}
                className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-bold text-[#2E527F] hover:bg-[#F8F2E8] disabled:opacity-50"
              >
                {creating ? 'Creating...' : `+ Create "${query.trim()}" as new ingredient`}
              </button>
            )}
          </div>
        )}
      </div>

      {selected && (
        <p className="text-[10px] font-bold text-[#16834A]">
          ✓ Selected: {selected.name}
          {(selected.current_stock_g || 0) <= 0 && (
            <span className="font-normal text-[#9A7E6F]"> — not currently in stock, still usable to plan this recipe</span>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1">
        <input
          type="number"
          step="1"
          value={quantityG}
          onChange={(e) => setQuantityG(e.target.value)}
          placeholder="Quantity (g)"
          className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="h-9 w-full rounded-lg bg-[#2E527F] text-xs font-bold text-white hover:bg-[#24466E] transition"
        >
          + Add
        </button>
      </div>
      <p className="text-[10px] text-[#9A7E6F]">
        Pick from your real inventory, or create a new one — either way it shows macros here, in stock or not.
      </p>
    </div>
  )
}
