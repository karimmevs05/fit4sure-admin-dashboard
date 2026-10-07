import { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, AlertTriangle, ChevronDown } from 'lucide-react'

// Real, staff-editable control panel for every price and portion size the
// business actually sells against -- the live link between this backend
// and what the public order page (fit4sure.net) and the admin order picker
// both charge and portion. Backed by plate_formats / by_the_pound_prices /
// addon_rules (migrations/create_plate_config.sql) via
// /api/admin/plate-config. Editing here changes real prices immediately for
// any NEW menu row created from this point forward (already-placed orders
// and already-created menu rows never retroactively change -- see
// src/services/plateConfig.js on the backend for exactly how this flows
// through to the order page, the admin order picker, and recipe serving
// counts).

type FormatRow = {
  id: number
  key: string
  label: string
  protein_oz: string
  carbs_g: string
  veggies_g: string
  price_cents: number
  is_recipe_format: boolean
  sort_order: number
  active: boolean
}

type ByThePoundRow = { id: number; category: string; price_cents: number }

type AddonRow = { id: number; key: string; label: string; free_count: number; extra_price_cents: number }

type RecipeOption = { recipe_id: number; name: string }

// One row per format for the currently-selected recipe -- `standard` is the
// shared value (same for every recipe), `override` is this specific
// recipe's custom value if one has ever been saved (active: false means a
// custom value exists but isn't currently in effect -- "mostly comes as
// standard unless checked and changed").
type RecipeOverrideRow = {
  formatKey: string
  formatLabel: string
  standard: { proteinOz: number; carbsG: number; veggiesG: number; priceCents: number }
  override: { proteinOz: number; carbsG: number; veggiesG: number; priceCents: number; active: boolean } | null
}

function centsToDollarsStr(cents: number): string {
  return (cents / 100).toFixed(2)
}

export default function PortionsPricingPanel() {
  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formats, setFormats] = useState<FormatRow[]>([])
  const [byThePound, setByThePound] = useState<ByThePoundRow[]>([])
  const [addons, setAddons] = useState<AddonRow[]>([])

  // Dollar-string editing buffers, keyed by row id -- lets a field hold
  // "13.7" mid-type without fighting a parsed-number round-trip on every
  // keystroke. Populated from the fetched cents values, converted back to
  // integer cents only when actually saving.
  const [formatPriceInputs, setFormatPriceInputs] = useState<Record<number, string>>({})
  const [byThePoundInputs, setByThePoundInputs] = useState<Record<number, string>>({})
  const [addonExtraInputs, setAddonExtraInputs] = useState<Record<number, string>>({})

  const [savingFormats, setSavingFormats] = useState(false)
  const [savingByThePound, setSavingByThePound] = useState(false)
  const [savingAddons, setSavingAddons] = useState(false)
  const [formatsError, setFormatsError] = useState<string | null>(null)
  const [byThePoundError, setByThePoundError] = useState<string | null>(null)
  const [addonsError, setAddonsError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Recipe toggle -- no selection (default) edits the shared standard above;
  // selecting a recipe switches the Plate Formats table to that recipe's
  // effective values, each with its own "Custom for this recipe" checkbox.
  const [recipes, setRecipes] = useState<RecipeOption[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | ''>('')
  const [recipeOverrides, setRecipeOverrides] = useState<RecipeOverrideRow[]>([])
  const [recipeOverridePriceInputs, setRecipeOverridePriceInputs] = useState<Record<string, string>>({})
  const [loadingRecipeOverrides, setLoadingRecipeOverrides] = useState(false)
  const [savingRecipeOverrides, setSavingRecipeOverrides] = useState(false)
  const [recipeOverridesError, setRecipeOverridesError] = useState<string | null>(null)

  const fetchRecipes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/recipes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setRecipes((res.data.data || []).map((r: any) => ({ recipe_id: r.recipe_id, name: r.name })).sort((a: RecipeOption, b: RecipeOption) => a.name.localeCompare(b.name)))
    } catch {
      // Non-fatal -- the recipe dropdown just stays empty; the shared
      // standard editor above still works fine without it.
    }
  }

  const fetchRecipeOverrides = async (recipeId: number) => {
    try {
      setLoadingRecipeOverrides(true)
      setRecipeOverridesError(null)
      const res = await axios.get(`${apiUrl}/api/admin/plate-config/recipe-overrides/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows: RecipeOverrideRow[] = res.data.data
      setRecipeOverrides(rows)
      const inputs: Record<string, string> = {}
      for (const r of rows) {
        inputs[r.formatKey] = centsToDollarsStr(r.override ? r.override.priceCents : r.standard.priceCents)
      }
      setRecipeOverridePriceInputs(inputs)
    } catch (err: any) {
      setRecipeOverridesError(err.response?.data?.error || 'Failed to load this recipe\'s overrides')
    } finally {
      setLoadingRecipeOverrides(false)
    }
  }

  const fetchConfig = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await axios.get(`${apiUrl}/api/admin/plate-config`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = res.data.data
      setFormats(data.formats)
      setByThePound(data.byThePound)
      setAddons(data.addons)

      const fmtPrices: Record<number, string> = {}
      for (const f of data.formats) fmtPrices[f.id] = centsToDollarsStr(f.price_cents)
      setFormatPriceInputs(fmtPrices)

      const btpPrices: Record<number, string> = {}
      for (const b of data.byThePound) btpPrices[b.id] = centsToDollarsStr(b.price_cents)
      setByThePoundInputs(btpPrices)

      const addonPrices: Record<number, string> = {}
      for (const a of data.addons) addonPrices[a.id] = centsToDollarsStr(a.extra_price_cents)
      setAddonExtraInputs(addonPrices)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load portions & pricing config')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
    fetchRecipes()
  }, [])

  useEffect(() => {
    if (selectedRecipeId === '') {
      setRecipeOverrides([])
      return
    }
    fetchRecipeOverrides(selectedRecipeId)
  }, [selectedRecipeId])

  const flashSaved = (label: string) => {
    setSavedMessage(label)
    setTimeout(() => setSavedMessage(null), 2500)
  }

  const saveFormats = async () => {
    setFormatsError(null)
    const payload = formats.map((f) => {
      const dollars = Number(formatPriceInputs[f.id])
      return {
        key: f.key,
        protein_oz: Number(f.protein_oz),
        carbs_g: Number(f.carbs_g),
        veggies_g: Number(f.veggies_g),
        price_cents: Math.round(dollars * 100),
        is_recipe_format: f.is_recipe_format,
        active: f.active,
      }
    })
    for (const p of payload) {
      if (!Number.isFinite(p.price_cents) || p.price_cents <= 0) {
        setFormatsError(`${p.key}: enter a valid price greater than $0`)
        return
      }
      if ([p.protein_oz, p.carbs_g, p.veggies_g].some((n) => !Number.isFinite(n) || n < 0)) {
        setFormatsError(`${p.key}: portion sizes must be non-negative numbers`)
        return
      }
    }
    setSavingFormats(true)
    try {
      await axios.put(`${apiUrl}/api/admin/plate-config/formats`, { formats: payload }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchConfig()
      flashSaved('Prices & portions saved')
    } catch (err: any) {
      setFormatsError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingFormats(false)
    }
  }

  const saveByThePound = async () => {
    setByThePoundError(null)
    const payload = byThePound.map((b) => ({
      category: b.category,
      price_cents: Math.round(Number(byThePoundInputs[b.id]) * 100),
    }))
    for (const p of payload) {
      if (!Number.isFinite(p.price_cents) || p.price_cents <= 0) {
        setByThePoundError(`${p.category}: enter a valid price greater than $0`)
        return
      }
    }
    setSavingByThePound(true)
    try {
      await axios.put(`${apiUrl}/api/admin/plate-config/by-the-pound`, { prices: payload }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchConfig()
      flashSaved('By The LB prices saved')
    } catch (err: any) {
      setByThePoundError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingByThePound(false)
    }
  }

  const saveAddons = async () => {
    setAddonsError(null)
    const payload = addons.map((a) => ({
      key: a.key,
      free_count: a.free_count,
      extra_price_cents: Math.round(Number(addonExtraInputs[a.id]) * 100),
    }))
    for (const p of payload) {
      if (!Number.isInteger(p.free_count) || p.free_count < 0) {
        setAddonsError(`${p.key}: free count must be a non-negative whole number`)
        return
      }
      if (!Number.isFinite(p.extra_price_cents) || p.extra_price_cents < 0) {
        setAddonsError(`${p.key}: extra price must be a valid, non-negative amount`)
        return
      }
    }
    setSavingAddons(true)
    try {
      await axios.put(`${apiUrl}/api/admin/plate-config/addons`, { rules: payload }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchConfig()
      flashSaved('Add-on rules saved')
    } catch (err: any) {
      setAddonsError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingAddons(false)
    }
  }

  // Flip one format's "Custom for this recipe" checkbox. Turning it ON for
  // a format that's never had an override saved pre-fills the editable
  // fields with the current standard, so there's always a sensible
  // starting point to adjust from rather than a blank/zeroed row.
  const toggleRecipeOverrideActive = (formatKey: string, active: boolean) => {
    setRecipeOverrides((prev) =>
      prev.map((r) => {
        if (r.formatKey !== formatKey) return r
        const base = r.override ?? { ...r.standard, active: false }
        return { ...r, override: { ...base, active } }
      })
    )
    setRecipeOverridePriceInputs((prev) => {
      const row = recipeOverrides.find((r) => r.formatKey === formatKey)
      if (!row) return prev
      if (prev[formatKey] && row.override) return prev // keep whatever's already typed
      return { ...prev, [formatKey]: centsToDollarsStr(row.override ? row.override.priceCents : row.standard.priceCents) }
    })
  }

  const updateRecipeOverrideField = (formatKey: string, field: 'proteinOz' | 'carbsG' | 'veggiesG', value: number) => {
    setRecipeOverrides((prev) =>
      prev.map((r) => {
        if (r.formatKey !== formatKey || !r.override) return r
        return { ...r, override: { ...r.override, [field]: value } }
      })
    )
  }

  const saveRecipeOverrides = async () => {
    if (selectedRecipeId === '') return
    setRecipeOverridesError(null)
    const payload = recipeOverrides.map((r) => {
      const active = r.override?.active ?? false
      const proteinOz = r.override?.proteinOz ?? r.standard.proteinOz
      const carbsG = r.override?.carbsG ?? r.standard.carbsG
      const veggiesG = r.override?.veggiesG ?? r.standard.veggiesG
      const dollars = Number(recipeOverridePriceInputs[r.formatKey] ?? centsToDollarsStr(r.standard.priceCents))
      return { format_key: r.formatKey, protein_oz: proteinOz, carbs_g: carbsG, veggies_g: veggiesG, price_cents: Math.round(dollars * 100), active }
    })
    for (const p of payload) {
      if (!Number.isFinite(p.price_cents) || p.price_cents <= 0) {
        setRecipeOverridesError(`${p.format_key}: enter a valid price greater than $0`)
        return
      }
      if ([p.protein_oz, p.carbs_g, p.veggies_g].some((n) => !Number.isFinite(n) || n < 0)) {
        setRecipeOverridesError(`${p.format_key}: portion sizes must be non-negative numbers`)
        return
      }
    }
    setSavingRecipeOverrides(true)
    try {
      const res = await axios.put(
        `${apiUrl}/api/admin/plate-config/recipe-overrides/${selectedRecipeId}`,
        { overrides: payload },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const rows: RecipeOverrideRow[] = res.data.data
      setRecipeOverrides(rows)
      const inputs: Record<string, string> = {}
      for (const r of rows) inputs[r.formatKey] = centsToDollarsStr(r.override ? r.override.priceCents : r.standard.priceCents)
      setRecipeOverridePriceInputs(inputs)
      flashSaved(`${recipes.find((r) => r.recipe_id === selectedRecipeId)?.name || 'Recipe'} overrides saved`)
    } catch (err: any) {
      setRecipeOverridesError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingRecipeOverrides(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
        <p className="text-lg font-extrabold text-[#4B2B1D]">Loading portions & pricing...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[#D62F3D] bg-[#FFF4F5] p-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[#D62F3D] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[#D62F3D]">{error}</p>
          <button onClick={fetchConfig} className="mt-2 text-sm font-bold text-[#2E527F] underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {savedMessage && (
        <div className="rounded-xl border border-[#16A34A] bg-[#EAF4EC] px-4 py-3 text-sm font-bold text-[#16813D]">
          ✓ {savedMessage}
        </div>
      )}

      <div className="rounded-xl border border-[#2E527F] bg-[#EAF0F7] px-4 py-3 text-xs font-semibold text-[#2E527F]">
        This is the real, live source for every price and portion size sold -- the public order page, the admin order
        picker, and each recipe's "Regular Servings" count all read from here. Changes apply to new orders/menu rows
        immediately; already-placed orders never change retroactively.
      </div>

      {/* Plate formats: price + portion sizes -- the recipe toggle at top
          switches this whole card between editing the shared standard
          (no recipe selected) and one specific recipe's overrides. */}
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
        <div className="mb-4">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#755B4C] mb-1.5">Recipe</label>
          <div className="relative max-w-sm">
            <select
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full appearance-none rounded-lg border border-[#B9A88F] bg-white px-3 py-2 pr-9 text-sm font-semibold text-[#4B2B1D]"
            >
              <option value="">Standard (applies to every recipe)</option>
              {recipes.map((r) => (
                <option key={r.recipe_id} value={r.recipe_id}>{r.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#755B4C]" />
          </div>
          <p className="mt-1.5 text-xs text-[#755B4C]">
            {selectedRecipeId === ''
              ? 'Editing the shared standard every recipe uses by default.'
              : 'A recipe uses the standard unless "Custom" is checked below for a format.'}
          </p>
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-extrabold text-[#4B2B1D]">
              {selectedRecipeId === '' ? 'Plate Formats' : recipes.find((r) => r.recipe_id === selectedRecipeId)?.name || 'Plate Formats'}
            </h3>
            <p className="text-xs text-[#755B4C] mt-0.5">Price and portion sizes (protein oz / carbs g / veggies g) per format</p>
          </div>
          <button
            onClick={selectedRecipeId === '' ? saveFormats : saveRecipeOverrides}
            disabled={selectedRecipeId === '' ? savingFormats : savingRecipeOverrides}
            className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#254368] transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {selectedRecipeId === ''
              ? (savingFormats ? 'Saving...' : 'Save Formats')
              : (savingRecipeOverrides ? 'Saving...' : 'Save This Recipe')}
          </button>
        </div>

        {selectedRecipeId === '' && formatsError && <p className="mb-3 text-sm font-bold text-[#D62F3D]">{formatsError}</p>}
        {selectedRecipeId !== '' && recipeOverridesError && <p className="mb-3 text-sm font-bold text-[#D62F3D]">{recipeOverridesError}</p>}

        {selectedRecipeId === '' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[#755B4C] border-b border-[#D8CDBE]">
                  <th className="py-2 pr-3">Format</th>
                  <th className="py-2 px-3">Protein (oz)</th>
                  <th className="py-2 px-3">Carbs (g)</th>
                  <th className="py-2 px-3">Veggies (g)</th>
                  <th className="py-2 px-3">Price ($)</th>
                  <th className="py-2 px-3">Per-recipe format</th>
                  <th className="py-2 pl-3">Active</th>
                </tr>
              </thead>
              <tbody>
                {formats.map((f, idx) => (
                  <tr key={f.id} className="border-b border-[#EFE8DB] last:border-0">
                    <td className="py-2.5 pr-3 font-bold text-[#4B2B1D] whitespace-nowrap">{f.label}</td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={f.protein_oz}
                        onChange={(e) => setFormats((prev) => prev.map((row, i) => (i === idx ? { ...row, protein_oz: e.target.value } : row)))}
                        className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D]"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0}
                        value={f.carbs_g}
                        onChange={(e) => setFormats((prev) => prev.map((row, i) => (i === idx ? { ...row, carbs_g: e.target.value } : row)))}
                        className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D]"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0}
                        value={f.veggies_g}
                        onChange={(e) => setFormats((prev) => prev.map((row, i) => (i === idx ? { ...row, veggies_g: e.target.value } : row)))}
                        className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D]"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={formatPriceInputs[f.id] ?? ''}
                        onChange={(e) => setFormatPriceInputs((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        className="w-24 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D]"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={f.is_recipe_format}
                        onChange={(e) => setFormats((prev) => prev.map((row, i) => (i === idx ? { ...row, is_recipe_format: e.target.checked } : row)))}
                        className="h-4 w-4 accent-[#2E527F]"
                      />
                    </td>
                    <td className="py-2.5 pl-3 text-center">
                      <input
                        type="checkbox"
                        checked={f.active}
                        onChange={(e) => setFormats((prev) => prev.map((row, i) => (i === idx ? { ...row, active: e.target.checked } : row)))}
                        className="h-4 w-4 accent-[#2E527F]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : loadingRecipeOverrides ? (
          <p className="text-sm text-[#755B4C]">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[#755B4C] border-b border-[#D8CDBE]">
                  <th className="py-2 pr-3">Format</th>
                  <th className="py-2 px-3">Protein (oz)</th>
                  <th className="py-2 px-3">Carbs (g)</th>
                  <th className="py-2 px-3">Veggies (g)</th>
                  <th className="py-2 px-3">Price ($)</th>
                  <th className="py-2 pl-3">Custom</th>
                </tr>
              </thead>
              <tbody>
                {recipeOverrides.map((r) => {
                  const isCustom = r.override?.active ?? false
                  const proteinOz = r.override?.proteinOz ?? r.standard.proteinOz
                  const carbsG = r.override?.carbsG ?? r.standard.carbsG
                  const veggiesG = r.override?.veggiesG ?? r.standard.veggiesG
                  return (
                    <tr key={r.formatKey} className="border-b border-[#EFE8DB] last:border-0">
                      <td className="py-2.5 pr-3 font-bold text-[#4B2B1D] whitespace-nowrap">{r.formatLabel}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          disabled={!isCustom}
                          value={proteinOz}
                          onChange={(e) => updateRecipeOverrideField(r.formatKey, 'proteinOz', Number(e.target.value))}
                          className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D] disabled:bg-[#F3ECDE] disabled:text-[#9A8774]"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          disabled={!isCustom}
                          value={carbsG}
                          onChange={(e) => updateRecipeOverrideField(r.formatKey, 'carbsG', Number(e.target.value))}
                          className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D] disabled:bg-[#F3ECDE] disabled:text-[#9A8774]"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          disabled={!isCustom}
                          value={veggiesG}
                          onChange={(e) => updateRecipeOverrideField(r.formatKey, 'veggiesG', Number(e.target.value))}
                          className="w-20 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D] disabled:bg-[#F3ECDE] disabled:text-[#9A8774]"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          disabled={!isCustom}
                          value={recipeOverridePriceInputs[r.formatKey] ?? ''}
                          onChange={(e) => setRecipeOverridePriceInputs((prev) => ({ ...prev, [r.formatKey]: e.target.value }))}
                          className="w-24 rounded-lg border border-[#B9A88F] bg-white px-2 py-1 text-sm text-[#4B2B1D] disabled:bg-[#F3ECDE] disabled:text-[#9A8774]"
                        />
                      </td>
                      <td className="py-2.5 pl-3 text-center">
                        <input
                          type="checkbox"
                          checked={isCustom}
                          onChange={(e) => toggleRecipeOverrideActive(r.formatKey, e.target.checked)}
                          className="h-4 w-4 accent-[#2E527F]"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By The LB */}
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-extrabold text-[#4B2B1D]">By The LB</h3>
            <p className="text-xs text-[#755B4C] mt-0.5">Price per pound, by ingredient type -- a separate menu category from the formats above</p>
          </div>
          <button
            onClick={saveByThePound}
            disabled={savingByThePound}
            className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#254368] transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingByThePound ? 'Saving...' : 'Save By The LB'}
          </button>
        </div>
        {byThePoundError && <p className="mb-3 text-sm font-bold text-[#D62F3D]">{byThePoundError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {byThePound.map((b) => (
            <div key={b.id}>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-[#755B4C] mb-1.5">{b.category}</label>
              <div className="flex items-center gap-1.5">
                <span className="text-[#755B4C] font-bold">$</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={byThePoundInputs[b.id] ?? ''}
                  onChange={(e) => setByThePoundInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  className="w-full rounded-lg border border-[#B9A88F] bg-white px-2 py-1.5 text-sm text-[#4B2B1D]"
                />
                <span className="text-xs text-[#9A8774] whitespace-nowrap">/ lb</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add-ons */}
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-extrabold text-[#4B2B1D]">Sides & Sauce Add-Ons</h3>
            <p className="text-xs text-[#755B4C] mt-0.5">Free allowance per plate before an extra charge kicks in</p>
          </div>
          <button
            onClick={saveAddons}
            disabled={savingAddons}
            className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#254368] transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingAddons ? 'Saving...' : 'Save Add-Ons'}
          </button>
        </div>
        {addonsError && <p className="mb-3 text-sm font-bold text-[#D62F3D]">{addonsError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {addons.map((a, idx) => (
            <div key={a.id} className="rounded-xl border border-[#D8CDBE] bg-white p-4">
              <p className="font-bold text-[#4B2B1D] mb-3">{a.label}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-[#755B4C] mb-1.5">Free count</label>
                  <input
                    type="number"
                    min={0}
                    value={a.free_count}
                    onChange={(e) =>
                      setAddons((prev) => prev.map((row, i) => (i === idx ? { ...row, free_count: Number(e.target.value) } : row)))
                    }
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-2 py-1.5 text-sm text-[#4B2B1D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-[#755B4C] mb-1.5">Extra price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addonExtraInputs[a.id] ?? ''}
                    onChange={(e) => setAddonExtraInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-2 py-1.5 text-sm text-[#4B2B1D]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
