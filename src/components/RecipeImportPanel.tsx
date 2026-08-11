// Sits right under the "Recipe Name" field in AddRecipeDrawer. Lets you
// paste a recipe link (Pinterest -> source blog) or drop a screenshot,
// extracts a draft recipe, and shows a review screen before anything
// touches the actual form -- matched ingredients get a green check,
// low-confidence quantity reads get an amber flag, unmatched ingredients
// get a red flag and are left for manual add via the existing
// IngredientPicker rather than silently created.
//
// Only calls onApply() once, when the user explicitly confirms the review
// screen -- never autofills anything before that.

import React, { useRef, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Camera, Check, Link2, Sparkles, X } from 'lucide-react'
import { PickedIngredient } from './IngredientPicker'
import { RecipeStep } from './RecipeStepsEditor'

type ExtractedIngredient = {
  raw_text: string
  name: string
  quantity_g: number
  low_confidence: boolean
  match: {
    inventory_id: number
    name: string
    confidence: 'exact' | 'high' | 'low'
    unit_price_cents: number | null
    protein_per_100g: number | null
    carbs_per_100g: number | null
    fat_per_100g: number | null
    calories_per_100g: number | null
  } | null
}

type ExtractedStep = {
  id: string
  title: string
  description: string
  time_estimate_minutes: number | null
}

type ExtractedRecipe = {
  name: string
  category_guess: string
  servings: number
  prep_time_minutes: number | null
  steps: ExtractedStep[]
  ingredients: ExtractedIngredient[]
  source: 'jsonld' | 'text-fallback' | 'vision'
}

type ApplyPayload = {
  name: string
  category: string
  servings: number
  prep_time_minutes: number | null
  steps: RecipeStep[]
  ingredients: PickedIngredient[]
}

const VALID_CATEGORIES = ['beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

export function RecipeImportPanel({ onApply }: { onApply: (payload: ApplyPayload) => void }) {
  const [tab, setTab] = useState<'link' | 'screenshot'>('link')
  const [url, setUrl] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExtractedRecipe | null>(null)
  const [applied, setApplied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreview(result)
      setImageBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const extract = async () => {
    setError(null)
    setLoading(true)
    try {
      const body = tab === 'link' ? { url: url.trim() } : { imageBase64, mimeType: 'image/jpeg' }
      const res = await axios.post(`${apiUrl}/api/admin/recipe-import/extract`, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setDraft(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not extract a recipe from that. Try a different link or a clearer screenshot.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setDraft(null)
    setUrl('')
    setImageBase64(null)
    setImagePreview(null)
    setError(null)
    setApplied(false)
  }

  const matchedCount = draft?.ingredients.filter((i) => i.match).length ?? 0
  const unmatchedCount = draft ? draft.ingredients.length - matchedCount : 0

  const confirmApply = () => {
    if (!draft) return
    const category = VALID_CATEGORIES.includes(draft.category_guess) ? draft.category_guess : 'beef'
    const ingredients: PickedIngredient[] = draft.ingredients
      .filter((i) => i.match)
      .map((i) => ({
        inventory_id: i.match!.inventory_id,
        name: i.match!.name,
        quantity_g: i.quantity_g,
        unit_price_cents: i.match!.unit_price_cents,
        protein_per_100g: i.match!.protein_per_100g,
        carbs_per_100g: i.match!.carbs_per_100g,
        fat_per_100g: i.match!.fat_per_100g,
        calories_per_100g: i.match!.calories_per_100g,
      }))

    onApply({
      name: draft.name,
      category,
      servings: draft.servings || 1,
      prep_time_minutes: draft.prep_time_minutes,
      steps: draft.steps.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })),
      ingredients,
    })
    setApplied(true)
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-[#16834A]/40 bg-[#EAF5EC] px-3 py-2.5">
        <p className="text-xs font-bold text-[#16834A]">
          <Check className="mr-1 inline h-3.5 w-3.5" />
          Imported into the form below -- review before saving.
        </p>
        <button type="button" onClick={reset} className="text-[10px] font-bold text-[#16834A] underline">
          Import another
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#B9A88F] bg-[#FBF6EE] p-3">
      {!draft && (
        <>
          <div className="mb-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setTab('link')}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-bold transition ${
                tab === 'link' ? 'border-[#3E6594] bg-[#E8EEF5] text-[#2E527F]' : 'border-[#B9A88F] bg-[#FBF7F0] text-[#755B4C]'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Link
            </button>
            <button
              type="button"
              onClick={() => setTab('screenshot')}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-bold transition ${
                tab === 'screenshot' ? 'border-[#3E6594] bg-[#E8EEF5] text-[#2E527F]' : 'border-[#B9A88F] bg-[#FBF7F0] text-[#755B4C]'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Screenshot
            </button>
          </div>

          {tab === 'link' ? (
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a Pinterest or recipe blog link..."
              className="h-9 w-full rounded-lg border border-[#B9A88F] bg-white px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
            />
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#3E6594] bg-white text-center"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Selected screenshot" className="h-full w-full rounded-lg object-cover" />
              ) : (
                <div>
                  <Camera className="mx-auto h-5 w-5 text-[#2E527F]" />
                  <p className="mt-1 text-[11px] font-bold text-[#755B4C]">Choose a screenshot</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
            </div>
          )}

          {error && <p className="mt-2 text-[11px] font-bold text-[#D62F3D]">{error}</p>}

          <button
            type="button"
            onClick={extract}
            disabled={loading || (tab === 'link' ? !url.trim() : !imageBase64)}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2E527F] text-xs font-bold text-white transition hover:bg-[#24466E] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? 'Extracting...' : 'Extract recipe'}
          </button>
        </>
      )}

      {draft && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-extrabold text-[#4B2B1D]">{draft.name}</p>
            <button type="button" onClick={reset} className="text-[#9A7E6F]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">
            {draft.steps.length} steps -- {draft.ingredients.length} ingredients, confirm matches before saving
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {draft.ingredients.map((ing, idx) => {
              const state = ing.match ? (ing.low_confidence ? 'warn' : 'ok') : 'missing'
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
                    state === 'ok' ? 'bg-white' : state === 'warn' ? 'bg-[#FFF7E6]' : 'bg-[#FFF4F4]'
                  }`}
                >
                  {state === 'ok' && <Check className="h-3.5 w-3.5 shrink-0 text-[#16834A]" />}
                  {state !== 'ok' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#DC6500]" />}
                  <div className="flex-1">
                    <p className="font-semibold text-[#4B2B1D]">{ing.raw_text}</p>
                    <p className="text-[9px] text-[#9A7E6F]">
                      {ing.match
                        ? `matched: ${ing.match.name}${ing.low_confidence ? ' -- check quantity' : ''}`
                        : 'no inventory match -- add manually below after importing'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-9 flex-1 rounded-lg border border-[#B9A88F] bg-white text-xs font-bold text-[#4B2B1D]"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={confirmApply}
              className="h-9 flex-[2] rounded-lg bg-[#2E527F] text-xs font-bold text-white hover:bg-[#24466E]"
            >
              Use this ({matchedCount} of {draft.ingredients.length} ingredients ready{unmatchedCount > 0 ? `, ${unmatchedCount} need matching` : ''})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
