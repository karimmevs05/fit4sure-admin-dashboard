import React, { useMemo, useState } from 'react'
import { Calculator, ChevronsLeft, ChevronsRight } from 'lucide-react'

// Base-unit anchors taken directly from the kitchen's own laminated
// conversion card (Good Start Packaging), not re-derived from lab-precise
// conversion factors -- so numbers shown here always agree with what's
// taped to the wall. Volume rounds small units for recipe convenience
// (tsp/tbsp/fl oz/cup) but uses real container sizes for pint/quart/gallon,
// exactly like the card does; that's normal for kitchen charts, not a bug.
const ML_PER_UNIT: Record<string, number> = {
  tsp: 5,
  tbsp: 15,
  'fl oz': 30,
  cup: 240,
  pint: 470,
  quart: 946,
  gallon: 3800,
}
const VOLUME_ORDER = ['tsp', 'tbsp', 'fl oz', 'cup', 'pint', 'quart', 'gallon']

// Weight: oz/lb use the precise US customary conversion (matches
// formatLbOz elsewhere in the app, so a protein weight reads the same
// here as it does on Inventory/Weekly Prep). tbsp/cup are the card's own
// generic dry-measure reference -- real g-per-cup depends on the
// ingredient's density, flagged below rather than presented as exact.
const G_PER_UNIT: Record<string, number> = {
  tsp: 4.67, // 1/3 of the card's dry tbsp (14g / 3)
  tbsp: 14,
  oz: 28.3495,
  cup: 227,
  g: 1,
  lb: 453.592,
}
const WEIGHT_ORDER = ['tsp', 'tbsp', 'oz', 'cup', 'g', 'lb']

function formatAmount(n: number): string {
  if (!isFinite(n)) return '—'
  if (n === 0) return '0'
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function KitchenConverter({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const [mode, setMode] = useState<'volume' | 'weight'>('volume')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState('cup')

  const toggle = () => {
    localStorage.setItem('kitchenConverterCollapsed', String(!collapsed))
    onCollapsedChange(!collapsed)
  }

  const table = mode === 'volume' ? ML_PER_UNIT : G_PER_UNIT
  const order = mode === 'volume' ? VOLUME_ORDER : WEIGHT_ORDER

  const results = useMemo(() => {
    const parsed = parseFloat(amount)
    if (!isFinite(parsed)) return null
    const base = parsed * (table[unit] || 0)
    return order.map((u) => ({ unit: u, value: base / table[u] }))
  }, [amount, unit, mode])

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        title="Open Kitchen Converter"
        className="fixed top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 rounded-r-lg border border-l-0 border-[#D8CDBE] bg-[#E9DFD0] px-2 py-4 text-[#4B2B1D] hover:bg-[#D8CDBE] transition"
        style={{ left: '256px' }}
      >
        <Calculator size={16} />
        <ChevronsRight size={14} />
      </button>
    )
  }

  return (
    <aside
      className="fixed left-[256px] top-0 bottom-0 flex flex-col bg-[#FBF7F0] border-r border-[#D8CDBE] overflow-y-auto z-30"
      style={{ width: '288px' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-[#D8CDBE]">
        <div className="flex items-center gap-2">
          <Calculator size={18} className="text-[#2E527F]" />
          <h2 className="text-sm font-extrabold text-[#4B2B1D]">Kitchen Converter</h2>
        </div>
        <button onClick={toggle} title="Collapse" className="text-[#755B4C] hover:text-[#4B2B1D]">
          <ChevronsLeft size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Mode tabs */}
        <div className="flex rounded-lg border border-[#D8CDBE] overflow-hidden text-xs font-bold">
          <button
            onClick={() => {
              setMode('volume')
              setUnit('cup')
            }}
            className={`flex-1 py-2 transition ${mode === 'volume' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#755B4C] hover:bg-[#F8F2E8]'}`}
          >
            Liquid (Volume)
          </button>
          <button
            onClick={() => {
              setMode('weight')
              setUnit('oz')
            }}
            className={`flex-1 py-2 transition ${mode === 'weight' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#755B4C] hover:bg-[#F8F2E8]'}`}
          >
            Dry (Weight)
          </button>
        </div>

        {/* Live input */}
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-20 h-10 rounded-lg border border-[#B9A88F] bg-white px-2 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="flex-1 h-10 rounded-lg border border-[#B9A88F] bg-white px-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
          >
            {order.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        {/* Live results */}
        <div className="rounded-lg border border-[#E4D8C9] bg-white divide-y divide-[#F0EAE0]">
          {results === null ? (
            <p className="p-3 text-xs text-[#9A7E6F]">Enter a number above</p>
          ) : (
            results.map((r) => (
              <div
                key={r.unit}
                className={`flex items-center justify-between px-3 py-2 text-sm ${r.unit === unit ? 'bg-[#EDF2F7]' : ''}`}
              >
                <span className="text-[#755B4C]">{r.unit}</span>
                <span className="font-bold text-[#2E527F]">{formatAmount(r.value)}</span>
              </div>
            ))
          )}
        </div>
        {mode === 'weight' && (
          <p className="text-[10px] text-[#9A8774] leading-snug">
            tsp/tbsp/cup for dry weight are a generic reference (~227g/cup) — actual grams per cup varies by ingredient
            density. oz and lb are exact.
          </p>
        )}

        {/* Quick reference, same as the printed card */}
        <div className="pt-2 border-t border-[#E4D8C9] space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#9A8774]">Quick reference</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-[#4B2B1D]">
            <p>1 tsp = 5 mL</p>
            <p>1 tbsp = 15 mL</p>
            <p>dash = 1/16 tsp</p>
            <p>pinch = 1/8 tsp</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[#755B4C]">
            <div className="rounded bg-[#F5F0E8] px-2 py-1.5">
              <p className="font-bold text-[#4B2B1D]">1 cup</p>
              <p>16 tbsp · 8 fl oz · 240 mL</p>
            </div>
            <div className="rounded bg-[#F5F0E8] px-2 py-1.5">
              <p className="font-bold text-[#4B2B1D]">1 pint</p>
              <p>2 cups · 16 fl oz · 470 mL</p>
            </div>
            <div className="rounded bg-[#F5F0E8] px-2 py-1.5">
              <p className="font-bold text-[#4B2B1D]">1 quart</p>
              <p>2 pints · 4 cups · 946 mL</p>
            </div>
            <div className="rounded bg-[#F5F0E8] px-2 py-1.5">
              <p className="font-bold text-[#4B2B1D]">1 gallon</p>
              <p>4 qt · 16 cups · 3.8 L</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
