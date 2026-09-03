// Sits right under the "Recipe Name" field in AddRecipeDrawer. Lets you
// paste a recipe link (Pinterest -> source blog) or drop a screenshot,
// extracts a draft recipe, and turns the whole thing into an editable
// review screen -- name, photo, category, servings/prep time, every step
// with its own time estimate, and every ingredient with its inventory
// match -- so everything the source actually said can be checked and fixed
// right here before it ever touches the real form. Matched ingredients get
// a green check, low-confidence matches/quantities get an amber flag,
// unmatched ingredients get a red flag with an inline picker to resolve
// them (or drop them) rather than silently creating anything.
//
// Only calls onApply() once, when the user explicitly confirms the review
// screen -- never autofills anything before that.

import React, { useRef, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Camera, Check, ChevronDown, ChevronUp, Flame, GripVertical, Link2, Sparkles, X } from 'lucide-react'
import { IngredientPicker, PickedIngredient } from './IngredientPicker'
import { RecipeStep } from './RecipeStepsEditor'

type ExtractedIngredient = {
  raw_text: string
  name: string
  quantity_g: number
  is_liquid: boolean
  low_confidence: boolean
  match: {
    inventory_id: number
    name: string
    category: string
    confidence: 'exact' | 'high' | 'low'
    unit_price_cents: number | null
    protein_per_100g: number | null
    carbs_per_100g: number | null
    fat_per_100g: number | null
    calories_per_100g: number | null
  } | null
}

type ExtractedRecipe = {
  name: string
  category_guess: string
  servings: number
  prep_time_minutes: number | null
  image: string | null
  steps: { id: string; title: string; description: string; time_estimate_minutes: number | null; step_type: 'prep' | 'cook' }[]
  ingredients: ExtractedIngredient[]
  source: 'jsonld' | 'text-fallback' | 'vision'
}

type DraftIngredientRow = {
  key: string
  raw_text: string
  matchConfidence: 'exact' | 'high' | 'low' | null
  quantityLowConfidence: boolean
  // The AI's wet/dry guess (used for the cup/tbsp/tsp -> grams conversion at
  // extraction time -- see recipeImportService.js). Wrong often enough on
  // ambiguous ingredients that it needs a quick human fix here, via drag and
  // drop between the two sections below, before Apply.
  isLiquid: boolean
  resolved: PickedIngredient | null
}

type ApplyPayload = {
  name: string
  category: string
  servings: number
  prep_time_minutes: number | null
  image: string | null
  steps: RecipeStep[]
  ingredients: (PickedIngredient & { prep_section: 'wet' | 'dry' })[]
}

const VALID_CATEGORIES = ['beef', 'chicken', 'turkey', 'carbohydrates', 'vegetables', 'sauces', 'beverage', 'breakfast']

export function RecipeImportPanel({ onApply }: { onApply: (payload: ApplyPayload) => void }) {
  const [tab, setTab] = useState<'link' | 'screenshot'>('link')
  const [url, setUrl] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Editable review state -- seeded from the extraction, then owned here
  // until the user confirms. Nothing in the real form changes until Apply.
  const [hasDraft, setHasDraft] = useState(false)
  const [source, setSource] = useState<ExtractedRecipe['source'] | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('beef')
  const [draftServings, setDraftServings] = useState('1')
  const [draftPrepTime, setDraftPrepTime] = useState('')
  const [draftImage, setDraftImage] = useState('')
  const [draftSteps, setDraftSteps] = useState<RecipeStep[]>([])
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredientRow[]>([])
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null)

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

  const loadDraft = (extracted: ExtractedRecipe) => {
    setSource(extracted.source)
    setDraftName(extracted.name || '')
    setDraftCategory(VALID_CATEGORIES.includes(extracted.category_guess) ? extracted.category_guess : 'beef')
    setDraftServings(String(extracted.servings || 1))
    setDraftPrepTime(extracted.prep_time_minutes != null ? String(extracted.prep_time_minutes) : '')
    setDraftImage(extracted.image || '')
    setDraftSteps(
      extracted.steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        time_estimate_minutes: s.time_estimate_minutes,
        step_type: s.step_type === 'cook' ? 'cook' : 'prep',
      }))
    )
    setDraftIngredients(
      extracted.ingredients.map((ing, idx) => ({
        key: `ing-${idx}`,
        raw_text: ing.raw_text,
        matchConfidence: ing.match?.confidence ?? null,
        quantityLowConfidence: ing.low_confidence,
        isLiquid: ing.is_liquid !== false,
        resolved: ing.match
          ? {
              inventory_id: ing.match.inventory_id,
              name: ing.match.name,
              category: ing.match.category,
              quantity_g: ing.quantity_g,
              unit_price_cents: ing.match.unit_price_cents,
              protein_per_100g: ing.match.protein_per_100g,
              carbs_per_100g: ing.match.carbs_per_100g,
              fat_per_100g: ing.match.fat_per_100g,
              calories_per_100g: ing.match.calories_per_100g,
            }
          : null,
      }))
    )
    setHasDraft(true)
  }

  const extract = async () => {
    setError(null)
    setLoading(true)
    try {
      const body = tab === 'link' ? { url: url.trim() } : { imageBase64, mimeType: 'image/jpeg' }
      const res = await axios.post(`${apiUrl}/api/admin/recipe-import/extract`, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      loadDraft(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not extract a recipe from that. Try a different link or a clearer screenshot.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setHasDraft(false)
    setSource(null)
    setUrl('')
    setImageBase64(null)
    setImagePreview(null)
    setError(null)
    setApplied(false)
    setPickerOpenFor(null)
  }

  const updateIngredientQty = (key: string, quantity_g: number) => {
    setDraftIngredients((prev) => prev.map((r) => (r.key === key ? { ...r, resolved: r.resolved ? { ...r.resolved, quantity_g } : null } : r)))
  }

  const removeIngredientRow = (key: string) => {
    setDraftIngredients((prev) => prev.filter((r) => r.key !== key))
    if (pickerOpenFor === key) setPickerOpenFor(null)
  }

  const resolveIngredientRow = (key: string, picked: PickedIngredient) => {
    setDraftIngredients((prev) => prev.map((r) => (r.key === key ? { ...r, resolved: picked, matchConfidence: 'exact' } : r)))
    setPickerOpenFor(null)
  }

  const setIngredientLiquid = (key: string, isLiquid: boolean) => {
    setDraftIngredients((prev) => prev.map((r) => (r.key === key ? { ...r, isLiquid } : r)))
  }

  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<'wet' | 'dry' | null>(null)

  const matchedCount = draftIngredients.filter((r) => r.resolved).length
  const dryRows = draftIngredients.filter((r) => !r.isLiquid)
  const wetRows = draftIngredients.filter((r) => r.isLiquid)

  // Steps mirror the ingredients' wet/dry pattern: one flat array, grouped
  // into two columns purely for display/drag-drop, reassembled prep-then-
  // cook (not raw array order) on Apply so physical execution order is
  // always right regardless of how DnD left the underlying array.
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null)
  const [dragOverStepSection, setDragOverStepSection] = useState<'prep' | 'cook' | null>(null)
  const prepSteps = draftSteps.filter((s) => s.step_type !== 'cook')
  const cookSteps = draftSteps.filter((s) => s.step_type === 'cook')

  const updateStep = (id: string, patch: Partial<RecipeStep>) => {
    setDraftSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStepRow = (id: string) => setDraftSteps((prev) => prev.filter((s) => s.id !== id))

  // Reorders within whichever column the step is already in -- swaps
  // absolute array positions with its same-type neighbor so the per-type
  // filtered order (what the columns actually render) moves as expected.
  const moveStepInColumn = (id: string, direction: -1 | 1) => {
    setDraftSteps((prev) => {
      const step = prev.find((s) => s.id === id)
      if (!step) return prev
      const peers = prev.filter((s) => (s.step_type === 'cook') === (step.step_type === 'cook'))
      const peerIdx = peers.findIndex((s) => s.id === id)
      const targetPeer = peers[peerIdx + direction]
      if (!targetPeer) return prev
      const aPos = prev.findIndex((s) => s.id === id)
      const bPos = prev.findIndex((s) => s.id === targetPeer.id)
      const next = [...prev]
      ;[next[aPos], next[bPos]] = [next[bPos], next[aPos]]
      return next
    })
  }

  // Drag from one column to the other -- moved to the end of the underlying
  // array so it renders at the bottom of its new column, matching where it
  // was visually dropped.
  const reassignStepType = (id: string, type: 'prep' | 'cook') => {
    setDraftSteps((prev) => {
      const step = prev.find((s) => s.id === id)
      if (!step || step.step_type === type) return prev
      return [...prev.filter((s) => s.id !== id), { ...step, step_type: type }]
    })
  }

  const addStepToColumn = (type: 'prep' | 'cook') => {
    setDraftSteps((prev) => [...prev, { id: `new-${Date.now()}`, title: '', description: '', time_estimate_minutes: null, step_type: type }])
  }

  const confirmApply = () => {
    onApply({
      name: draftName.trim(),
      category: draftCategory,
      servings: Number(draftServings) || 1,
      prep_time_minutes: draftPrepTime ? Number(draftPrepTime) : null,
      image: draftImage.trim() || null,
      steps: [...prepSteps, ...cookSteps],
      ingredients: draftIngredients
        .filter((r) => r.resolved)
        .map((r) => ({ ...r.resolved!, prep_section: r.isLiquid ? ('wet' as const) : ('dry' as const) })),
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
      {!hasDraft && (
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

      {hasDraft && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">
              Review everything below, then Apply -- nothing saves until Create Recipe
              {source === 'vision' ? ' (from screenshot)' : source === 'jsonld' ? ' (from page data)' : ''}
            </p>
            <button type="button" onClick={reset} className="text-[#9A7E6F] shrink-0 ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          {draftImage && (
            <div className="flex gap-2">
              <img src={draftImage} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover border border-[#E4D8C9]" />
              <input
                type="text"
                value={draftImage}
                onChange={(e) => setDraftImage(e.target.value)}
                placeholder="Image URL"
                className="h-9 flex-1 rounded-lg border border-[#B9A88F] bg-white self-center px-2 text-[10px] text-[#755B4C] outline-none focus:border-[#3E6594]"
              />
            </div>
          )}

          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Recipe name"
            className="h-9 w-full rounded-lg border border-[#B9A88F] bg-white px-2 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
          />

          <div className="grid grid-cols-3 gap-1.5">
            <select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#B9A88F] bg-white px-1.5 text-[11px] font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={draftServings}
              onChange={(e) => setDraftServings(e.target.value)}
              placeholder="Servings"
              className="h-9 w-full rounded-lg border border-[#B9A88F] bg-white px-2 text-[11px] font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
            />
            <input
              type="number"
              min={0}
              value={draftPrepTime}
              onChange={(e) => setDraftPrepTime(e.target.value)}
              placeholder="Prep min"
              className="h-9 w-full rounded-lg border border-[#B9A88F] bg-white px-2 text-[11px] font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">
              Steps ({draftSteps.length}) -- drag between columns if a step's phase is wrong
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['prep', 'cook'] as const).map((section) => {
                const rows = section === 'prep' ? prepSteps : cookSteps
                return (
                  <div
                    key={section}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverStepSection(section)
                    }}
                    onDragLeave={() => setDragOverStepSection((s) => (s === section ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain')
                      if (id) reassignStepType(id, section)
                      setDraggingStepId(null)
                      setDragOverStepSection(null)
                    }}
                    className={`rounded-lg border p-1.5 transition ${
                      dragOverStepSection === section ? 'border-[#3E6594] bg-[#EAF0F7]' : 'border-[#E4D8C9] bg-[#FBF6EE]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <p className="text-[9px] font-extrabold uppercase tracking-wide text-[#9A7E6F] flex items-center gap-1">
                        {section === 'cook' && <Flame className="h-2.5 w-2.5 text-[#B5651D]" />}
                        {section === 'prep' ? 'Prep' : 'Cook'} ({rows.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => addStepToColumn(section)}
                        className="text-[9px] font-bold text-[#2E527F] hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="max-h-72 space-y-1.5 overflow-y-auto">
                      {rows.map((step, i) => (
                        <div
                          key={step.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', step.id)
                            setDraggingStepId(step.id)
                          }}
                          onDragEnd={() => {
                            setDraggingStepId(null)
                            setDragOverStepSection(null)
                          }}
                          className={`rounded-lg border p-1.5 text-[11px] cursor-grab active:cursor-grabbing ${
                            draggingStepId === step.id ? 'opacity-40' : ''
                          } ${section === 'cook' ? 'border-[#F0C89A] bg-white' : 'border-[#E4D8C9] bg-white'}`}
                        >
                          <div className="flex items-start gap-1.5">
                            <GripVertical className="h-3 w-3 shrink-0 mt-0.5 text-[#C9BBA8]" />
                            <span className="flex-1 min-w-0 text-[9px] font-extrabold text-[#9A7E6F]">Step {i + 1}</span>
                            <div className="flex shrink-0 flex-col">
                              <button
                                type="button"
                                onClick={() => moveStepInColumn(step.id, -1)}
                                disabled={i === 0}
                                className="rounded text-[#755B4C] hover:bg-[#EDF2F7] disabled:opacity-20"
                                aria-label="Move up"
                              >
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveStepInColumn(step.id, 1)}
                                disabled={i === rows.length - 1}
                                className="rounded text-[#755B4C] hover:bg-[#EDF2F7] disabled:opacity-20"
                                aria-label="Move down"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStepRow(step.id)}
                              className="shrink-0 text-[#D62F3D] hover:bg-[#FDEBEC] p-0.5 rounded"
                              aria-label="Remove step"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={step.title}
                            onChange={(e) => updateStep(step.id, { title: e.target.value })}
                            placeholder="Step title (optional)"
                            className="mt-1 h-6 w-full rounded border border-[#E4D8C9] bg-[#FBF7F0] px-1.5 text-[10px] font-semibold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                          />
                          <textarea
                            value={step.description}
                            onChange={(e) => updateStep(step.id, { description: e.target.value })}
                            placeholder="What to do..."
                            className="mt-1 min-h-10 w-full resize-none rounded border border-[#E4D8C9] bg-[#FBF7F0] px-1.5 py-1 text-[10px] text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                          />
                          <input
                            type="number"
                            min={0}
                            value={step.time_estimate_minutes ?? ''}
                            onChange={(e) => updateStep(step.id, { time_estimate_minutes: e.target.value ? Number(e.target.value) : null })}
                            placeholder="Minutes"
                            className="mt-1 h-6 w-20 rounded border border-[#E4D8C9] bg-[#FBF7F0] px-1.5 text-[10px] text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                          />
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <p className="px-1 py-2 text-center text-[10px] text-[#9A7E6F]">Drop {section} steps here</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">
              Ingredients ({matchedCount} of {draftIngredients.length} matched) -- drag between sections if the wet/dry guess is wrong
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['dry', 'wet'] as const).map((section) => {
                const rows = section === 'dry' ? dryRows : wetRows
                return (
                  <div
                    key={section}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverSection(section)
                    }}
                    onDragLeave={() => setDragOverSection((s) => (s === section ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const key = e.dataTransfer.getData('text/plain')
                      if (key) setIngredientLiquid(key, section === 'wet')
                      setDraggingKey(null)
                      setDragOverSection(null)
                    }}
                    className={`rounded-lg border p-1.5 transition ${
                      dragOverSection === section ? 'border-[#3E6594] bg-[#EAF0F7]' : 'border-[#E4D8C9] bg-[#FBF6EE]'
                    }`}
                  >
                    <p className="mb-1 px-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#9A7E6F]">
                      {section === 'dry' ? 'Dry' : 'Wet'} ({rows.length})
                    </p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {rows.map((row) => {
                        const uncertain = row.resolved && row.matchConfidence === 'low'
                        const state = row.resolved ? (uncertain || row.quantityLowConfidence ? 'warn' : 'ok') : 'missing'
                        return (
                          <div
                            key={row.key}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', row.key)
                              setDraggingKey(row.key)
                            }}
                            onDragEnd={() => {
                              setDraggingKey(null)
                              setDragOverSection(null)
                            }}
                            className={`rounded-lg px-1.5 py-1.5 text-[11px] cursor-grab active:cursor-grabbing ${
                              draggingKey === row.key ? 'opacity-40' : ''
                            } ${state === 'ok' ? 'bg-white' : state === 'warn' ? 'bg-[#FFF7E6]' : 'bg-[#FFF4F4]'}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <GripVertical className="h-3 w-3 shrink-0 text-[#C9BBA8]" />
                              {state === 'ok' && <Check className="h-3.5 w-3.5 shrink-0 text-[#16834A]" />}
                              {state !== 'ok' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#DC6500]" />}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[#4B2B1D] truncate">{row.raw_text}</p>
                                <p className="text-[9px] text-[#9A7E6F] truncate">
                                  {row.resolved
                                    ? `matched: ${row.resolved.name}${uncertain ? ' -- check this' : ''}${row.quantityLowConfidence ? ' -- check qty' : ''}`
                                    : 'no inventory match'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeIngredientRow(row.key)}
                                className="shrink-0 text-[#D62F3D] hover:bg-[#FDEBEC] p-0.5 rounded"
                                aria-label="Remove ingredient"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
                              {row.resolved && (
                                <input
                                  type="number"
                                  min={0}
                                  value={row.resolved.quantity_g}
                                  onChange={(e) => updateIngredientQty(row.key, Number(e.target.value) || 0)}
                                  className="h-7 w-16 shrink-0 rounded border border-[#B9A88F] bg-white px-1.5 text-[10px] text-center outline-none focus:border-[#3E6594]"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setPickerOpenFor(pickerOpenFor === row.key ? null : row.key)}
                                className="shrink-0 text-[10px] font-bold text-[#2E527F] underline"
                              >
                                {row.resolved ? 'Change' : 'Pick match'}
                              </button>
                            </div>

                            {pickerOpenFor === row.key && (
                              <div className="mt-2 rounded-lg border border-[#3E6594] bg-white p-2">
                                <IngredientPicker onAdd={(picked) => resolveIngredientRow(row.key, picked)} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {rows.length === 0 && (
                        <p className="px-1 py-2 text-center text-[10px] text-[#9A7E6F]">Drop {section} ingredients here</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {draftIngredients.length === 0 && <p className="mt-1.5 text-[11px] text-[#9A7E6F] px-1">No ingredients left -- add some via the picker below once applied.</p>}
          </div>

          <div className="flex gap-2">
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
              disabled={!draftName.trim()}
              className="h-9 flex-[2] rounded-lg bg-[#2E527F] text-xs font-bold text-white hover:bg-[#24466E] disabled:opacity-50"
            >
              Apply to form ({matchedCount} of {draftIngredients.length} ingredients ready)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
