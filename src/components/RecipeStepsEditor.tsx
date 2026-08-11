// Structured prep steps -- title + description + optional time estimate,
// added one at a time and numbered in order. Mirrors the add-row-then-list
// interaction pattern from IngredientPicker so the two feel the same inside
// the recipe drawer.
//
// Parent owns the actual `steps` array (same ownership model as
// `ingredients` in Recipes.tsx) -- this component just renders it and
// reports changes back via onChange.

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

export type RecipeStep = {
  id: string
  title: string
  description: string
  time_estimate_minutes: number | null
}

export function RecipeStepsEditor({
  steps,
  onChange,
}: {
  steps: RecipeStep[]
  onChange: (steps: RecipeStep[]) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('')

  const addStep = () => {
    if (!description.trim()) return
    onChange([
      ...steps,
      {
        id: Date.now().toString(),
        title: title.trim(),
        description: description.trim(),
        time_estimate_minutes: minutes ? Number(minutes) : null,
      },
    ])
    setTitle('')
    setDescription('')
    setMinutes('')
  }

  const removeStep = (id: string) => onChange(steps.filter((s) => s.id !== id))

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#B9A88F] bg-[#FBF6EE] p-3">
      <div className="space-y-1.5 border-b border-[#D8CDBE] pb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title (optional) -- e.g. Brown the turkey"
          className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What to do -- tools, technique, surface..."
          className="min-h-16 w-full resize-none rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 py-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Minutes (optional)"
            className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
          />
          <button
            type="button"
            onClick={addStep}
            className="h-9 w-full rounded-lg bg-[#2E527F] text-xs font-bold text-white hover:bg-[#24466E] transition"
          >
            + Add step
          </button>
        </div>
      </div>

      {steps.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {steps.map((step, i) => (
            <div key={step.id} className="rounded-lg border border-[#E4D8C9] bg-[#FBF7F0] p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#4B2B1D]">
                    Step {i + 1}
                    {step.title ? ` -- ${step.title}` : ''}
                    {step.time_estimate_minutes ? (
                      <span className="ml-1.5 rounded-full bg-[#E8EEF5] px-1.5 py-0.5 text-[9px] font-extrabold text-[#134DA1]">
                        {step.time_estimate_minutes} min
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#755B4C]">{step.description}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveStep(i, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-[#755B4C] hover:bg-[#EDF2F7] disabled:opacity-30"
                    aria-label={`Move step ${i + 1} up`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === steps.length - 1}
                    className="rounded p-0.5 text-[#755B4C] hover:bg-[#EDF2F7] disabled:opacity-30"
                    aria-label={`Move step ${i + 1} down`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {steps.length === 0 && (
        <p className="text-[10px] text-[#9A7E6F]">
          No steps yet -- add them in order, or import a recipe above to fill them in automatically.
        </p>
      )}
    </div>
  )
}
