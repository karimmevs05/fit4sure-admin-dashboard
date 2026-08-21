import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Calculator, ChevronDown, ChevronUp, X, Check, Plus } from 'lucide-react'
import { RecipePicker, formatServingSize } from './RecipePicker'
import type { PickerRecipe } from './RecipePicker'

type Recipe = {
  recipe_id: number
  name: string
  category: string
  calories?: number
  protein_g?: string | number
  carbs_g?: string | number
  fat_g?: string | number
  cost_per_serving_cents?: number
  cost_per_pound_cents?: number
  per_pound?: { calories: number; protein_g: string; carbs_g: string; fat_g: string }
  suggested_serving_g?: string | number | null
  main_ingredient_store?: string | null
}

const GRAMS_PER_POUND = 455

// Same instant, no-round-trip estimate the old Plate Builder used: scales a
// recipe's real per-pound macros/cost (already receipt-fallback-priced by
// the backend) to an arbitrary gram amount, so every serving-size edit
// updates immediately instead of waiting on a request.
function macrosAtGrams(recipe: Recipe, grams: number) {
  const ratio = grams / GRAMS_PER_POUND
  const pp = recipe.per_pound
  return {
    calories: Math.round((pp?.calories ?? 0) * ratio),
    protein_g: parseFloat(String(pp?.protein_g ?? '0')) * ratio,
    carbs_g: parseFloat(String(pp?.carbs_g ?? '0')) * ratio,
    fat_g: parseFloat(String(pp?.fat_g ?? '0')) * ratio,
    cost_cents: Math.round((recipe.cost_per_pound_cents ?? 0) * ratio),
  }
}

function macroLine(m: { calories: number; protein_g: number; carbs_g: number; fat_g: number }) {
  return `${Math.round(m.calories)} cal · ${m.protein_g.toFixed(1)}g P · ${m.carbs_g.toFixed(1)}g C · ${m.fat_g.toFixed(1)}g F`
}

type PlateItem = { recipe: Recipe; servingSizeG: string }
type Customer = { id: number; name: string }

// Same picker (category pills, search, $/lb + regular serving + $/serving +
// supplier tag) the Weekly Recipe Plan blocks use -- building a plate is the
// same "pick a recipe" action, just with a per-item gram amount instead of
// a per-block lb forecast. Each recipe defaults to its own regular serving
// size when added (not a blanket 1lb), staying editable afterward for a
// bigger/smaller portion.
export function PlateCostSimulator({
  onAddToBlock,
}: {
  onAddToBlock?: (
    block: 'monday' | 'thursday',
    combo: { name: string; lb: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; costPerPoundCents: number }
  ) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [plate, setPlate] = useState<PlateItem[]>([])
  const [addOpen, setAddOpen] = useState(false)

  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [showCustomerMatches, setShowCustomerMatches] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [plateName, setPlateName] = useState('')
  const [priceOverride, setPriceOverride] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMessage, setAssignMessage] = useState<string | null>(null)

  const [blockTarget, setBlockTarget] = useState<'monday' | 'thursday'>('monday')
  const [blockLb, setBlockLb] = useState('')
  const [addedToBlock, setAddedToBlock] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    axios
      .get(`${apiUrl}/api/admin/recipes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows: Recipe[] = res.data.data || res.data || []
        setAllRecipes(rows.filter((r: any) => r.category !== 'prepared_meal'))
      })
      .catch(() => {})
    axios
      .get(`${apiUrl}/api/admin/customers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows = res.data.data || res.data || []
        setAllCustomers(rows.map((c: any) => ({ id: c.id, name: c.name })))
      })
      .catch(() => {})
  }, [])

  const customerMatches = useMemo(() => {
    if (!customerQuery.trim()) return []
    const q = customerQuery.toLowerCase()
    return allCustomers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [customerQuery, allCustomers])

  const pickerRecipes: PickerRecipe[] = allRecipes.map((r) => ({
    recipe_id: r.recipe_id,
    name: r.name,
    category: r.category,
    costPerPoundCents: r.cost_per_pound_cents ?? 0,
    suggestedServingG: r.suggested_serving_g != null ? parseFloat(String(r.suggested_serving_g)) : null,
    supplierName: r.main_ingredient_store ?? null,
  }))
  const plateIds = new Set(plate.map((p) => p.recipe.recipe_id))

  const addRecipe = (picked: PickerRecipe) => {
    const recipe = allRecipes.find((r) => r.recipe_id === picked.recipe_id)
    if (!recipe || plate.some((p) => p.recipe.recipe_id === recipe.recipe_id)) return
    // Regular format assumed: defaults to this recipe's own suggested
    // serving size, not a blanket 1lb -- still editable per item below.
    const servingSizeG = picked.suggestedServingG && picked.suggestedServingG > 0 ? String(picked.suggestedServingG) : String(GRAMS_PER_POUND)
    setPlate((prev) => [...prev, { recipe, servingSizeG }])
  }

  const updateServingSize = (recipeId: number, grams: string) => {
    setPlate((prev) => prev.map((p) => (p.recipe.recipe_id === recipeId ? { ...p, servingSizeG: grams } : p)))
  }

  const removeRecipe = (recipeId: number) => {
    setPlate((prev) => prev.filter((p) => p.recipe.recipe_id !== recipeId))
  }

  const totals = useMemo(() => {
    return plate.reduce(
      (acc, p) => {
        const grams = parseFloat(p.servingSizeG) || 0
        const m = macrosAtGrams(p.recipe, grams)
        return {
          calories: acc.calories + m.calories,
          protein_g: acc.protein_g + m.protein_g,
          carbs_g: acc.carbs_g + m.carbs_g,
          fat_g: acc.fat_g + m.fat_g,
          cost_cents: acc.cost_cents + m.cost_cents,
        }
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost_cents: 0 }
    )
  }, [plate])

  const autoName = plate.map((p) => p.recipe.name).join(' + ').slice(0, 120)

  // The combo's totals are at whatever gram amounts are currently set --
  // convert to a per-lb rate (same shape the Weekly Recipe Plan already
  // uses for every real recipe) so it scales correctly whenever the block's
  // forecasted lb is edited later, instead of freezing today's totals in.
  const totalGrams = plate.reduce((sum, p) => sum + (parseFloat(p.servingSizeG) || 0), 0)
  const lbEquivalent = totalGrams / GRAMS_PER_POUND
  const perLb =
    lbEquivalent > 0
      ? {
          calories: totals.calories / lbEquivalent,
          protein_g: totals.protein_g / lbEquivalent,
          carbs_g: totals.carbs_g / lbEquivalent,
          fat_g: totals.fat_g / lbEquivalent,
          costPerPoundCents: Math.round(totals.cost_cents / lbEquivalent),
        }
      : { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, costPerPoundCents: 0 }

  // Sends this combo into a Weekly Recipe Plan block as one line item --
  // the hybrid path between "just testing a combo" and "assign to a client
  // order" above. Block state lives in the parent page, not here, so this
  // is a callback rather than its own save call.
  const addToBlock = () => {
    if (!onAddToBlock || plate.length === 0) return
    const lb = parseFloat(blockLb) || 0
    if (lb <= 0) return
    onAddToBlock(blockTarget, {
      name: (plateName.trim() || autoName).slice(0, 120),
      lb,
      calories: perLb.calories,
      protein_g: perLb.protein_g,
      carbs_g: perLb.carbs_g,
      fat_g: perLb.fat_g,
      costPerPoundCents: perLb.costPerPoundCents,
    })
    setAddedToBlock(true)
    setTimeout(() => setAddedToBlock(false), 2500)
    setBlockLb('')
  }

  // One-command "make this real for a real client": creates a real menu
  // item priced at exactly what's shown here (or an edited name/price, for
  // when this plate is meant to become a standing custom meal plan rather
  // than just a cost estimate), and a real order for them -- no separate
  // modal, no day/format picker, just pick a customer and go.
  const assignToClient = async () => {
    if (!selectedCustomer || plate.length === 0) return
    setAssigning(true)
    setAssignMessage(null)
    try {
      const name = (plateName.trim() || autoName).slice(0, 120)
      const priceCents = priceOverride.trim() ? Math.round(parseFloat(priceOverride) * 100) : totals.cost_cents
      await axios.post(
        `${apiUrl}/api/admin/orders/custom-plate`,
        {
          customerId: selectedCustomer.id,
          name,
          priceCents,
          notes: `Custom plate from simulator: ${plate.map((p) => `${p.recipe.name} (${p.servingSizeG}g)`).join(', ')}`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAssignMessage(`Added to ${selectedCustomer.name}'s order`)
      setSelectedCustomer(null)
      setCustomerQuery('')
      setPlateName('')
      setPriceOverride('')
    } catch (err: any) {
      setAssignMessage(err.response?.data?.error || 'Failed to assign')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#E4D8C9] bg-[rgba(251,247,240,0.9)]">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-[#2E527F]" />
          <span className="text-xs font-bold text-[#4B2B1D]">Custom Plate Builder</span>
          <span className="hidden sm:inline text-[11px] text-[#2E527F]">test a combo before committing to a plate</span>
        </div>
        <div className="flex items-center gap-2.5">
          {plate.length > 0 && (
            <span className="text-xs font-semibold text-[#755B4C]">
              {plate.length} recipe{plate.length === 1 ? '' : 's'} · ${(totals.cost_cents / 100).toFixed(2)}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-[#2E527F]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#2E527F]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#E4D8C9] pt-3">
          {/* Selected list -- what's in the plate so far, nothing to scroll past */}
          <div className="space-y-1.5 mb-2">
            {plate.length === 0 ? (
              <p className="text-xs text-[#755B4C] italic px-1 py-2">Nothing added yet</p>
            ) : (
              plate.map((p) => {
                const grams = parseFloat(p.servingSizeG) || 0
                const m = macrosAtGrams(p.recipe, grams)
                const regularG = p.recipe.suggested_serving_g != null ? parseFloat(String(p.recipe.suggested_serving_g)) : null
                return (
                  <div key={p.recipe.recipe_id} className="flex items-center gap-2 rounded-lg bg-white border border-[#E4D8C9] px-2.5 py-1.5">
                    <button
                      onClick={() => removeRecipe(p.recipe.recipe_id)}
                      className="flex-shrink-0 text-[#9A7E6F] hover:text-[#D62F3D] transition"
                      aria-label={`Remove ${p.recipe.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <p className="font-medium text-[#4B2B1D] truncate w-32 flex-shrink-0 text-sm">{p.recipe.name}</p>
                    <p className="text-[11px] text-[#2E527F] flex-1 truncate">
                      {macroLine(m)}
                      {regularG != null && ` · regular ${formatServingSize(regularG, p.recipe.category)}`}
                    </p>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={p.servingSizeG}
                      onChange={(e) => updateServingSize(p.recipe.recipe_id, e.target.value)}
                      className="w-14 h-7 rounded border border-[#B9A88F] bg-white px-1 text-xs text-center outline-none flex-shrink-0"
                    />
                    <span className="text-[10px] text-[#2E527F] flex-shrink-0 w-3">g</span>
                    <span className="w-14 text-right text-xs font-bold text-[#2E527F] flex-shrink-0">${(m.cost_cents / 100).toFixed(2)}</span>
                  </div>
                )
              })
            )}
          </div>

          <button
            onClick={() => setAddOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#2E527F] py-1.5 text-xs font-bold text-[#2E527F] hover:bg-[#EAF0F7] transition mb-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add recipe
          </button>

          {addOpen && <RecipePicker recipes={pickerRecipes} excludeIds={plateIds} onAdd={addRecipe} />}

          {/* Stats footer -- summarizes the plate built above */}
          <div className="pt-3 border-t border-[#E4D8C9] flex items-center justify-between">
            <p className="text-xs text-[#2E527F]">{macroLine(totals)}</p>
            <p className="text-sm font-extrabold text-[#16A34A]">${(totals.cost_cents / 100).toFixed(2)}</p>
          </div>

          {plate.length > 0 && (
            <>
              {/* Simple command: name it, price it, pick a customer, one
                  click makes this plate a real custom meal plan for them --
                  no separate modal. Name/price default to the computed
                  combo but are editable, since a plan meant to stick around
                  usually wants a real name and a set price, not the raw
                  ingredient cost. */}
              <div className="pt-2 border-t border-[#E4D8C9] space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={plateName}
                    onChange={(e) => setPlateName(e.target.value)}
                    placeholder={autoName || 'Plate name'}
                    className="h-8 flex-1 min-w-0 rounded-md border border-[#E4D8C9] bg-white px-2 text-xs text-[#4B2B1D] outline-none focus:border-[#2E527F]"
                  />
                  <span className="text-xs text-[#2E527F] flex-shrink-0">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    placeholder={(totals.cost_cents / 100).toFixed(2)}
                    className="h-8 w-16 flex-shrink-0 rounded-md border border-[#E4D8C9] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#2E527F]"
                  />
                </div>
                <div className="relative flex items-center gap-1.5">
                  <input
                    value={selectedCustomer ? selectedCustomer.name : customerQuery}
                    onChange={(e) => {
                      setSelectedCustomer(null)
                      setCustomerQuery(e.target.value)
                      setShowCustomerMatches(true)
                    }}
                    onFocus={() => setShowCustomerMatches(true)}
                    onBlur={() => setTimeout(() => setShowCustomerMatches(false), 150)}
                    placeholder="Assign to client..."
                    className="h-8 flex-1 min-w-0 rounded-md border border-[#E4D8C9] bg-white px-2 text-xs text-[#4B2B1D] outline-none focus:border-[#2E527F]"
                  />
                  <button
                    onClick={assignToClient}
                    disabled={!selectedCustomer || assigning}
                    className="h-8 flex-shrink-0 rounded-md bg-[#16A34A] px-2.5 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#15873F] transition"
                  >
                    {assigning ? '...' : 'Assign'}
                  </button>
                  {assignMessage && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[#755B4C] flex-shrink-0">
                      <Check className="h-3 w-3 text-[#16A34A]" />
                      {assignMessage}
                    </span>
                  )}
                  {showCustomerMatches && customerMatches.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-[#E4D8C9] bg-white shadow-md max-h-40 overflow-y-auto">
                      {customerMatches.map((c) => (
                        <button
                          key={c.id}
                          onMouseDown={() => {
                            setSelectedCustomer(c)
                            setCustomerQuery('')
                            setShowCustomerMatches(false)
                          }}
                          className="block w-full px-2.5 py-1.5 text-left text-xs text-[#4B2B1D] hover:bg-[#F1EAE0]"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hybrid path: this same named/priced combo can also become
                    one line item in a Weekly Recipe Plan block, instead of
                    (or as well as) a real client order -- picks up the
                    combo's per-lb macros/cost so it scales correctly if the
                    block's forecasted lb is edited later. */}
                {onAddToBlock && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={blockTarget}
                      onChange={(e) => setBlockTarget(e.target.value as 'monday' | 'thursday')}
                      className="h-8 flex-shrink-0 rounded-md border border-[#E4D8C9] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#2E527F]"
                    >
                      <option value="monday">Block 1 (Mon–Wed)</option>
                      <option value="thursday">Block 2 (Thu–Sun)</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={blockLb}
                      onChange={(e) => setBlockLb(e.target.value)}
                      placeholder="lb"
                      className="h-8 w-16 flex-shrink-0 rounded-md border border-[#E4D8C9] bg-white px-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#2E527F]"
                    />
                    <button
                      onClick={addToBlock}
                      disabled={!blockLb.trim() || parseFloat(blockLb) <= 0}
                      className="h-8 flex-1 flex-shrink-0 rounded-md bg-[#2E527F] px-2.5 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#24466E] transition"
                    >
                      Add to Block
                    </button>
                    {addedToBlock && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-[#755B4C] flex-shrink-0">
                        <Check className="h-3 w-3 text-[#16A34A]" /> Added
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
