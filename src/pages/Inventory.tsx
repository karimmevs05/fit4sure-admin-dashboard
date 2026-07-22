import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  ChevronDown,
  Package,
  Receipt,
} from 'lucide-react'
import { ReceiptScanner } from '../components/ReceiptScanner'

type InventoryItem = {
  id: number
  name: string
  category: string
  store: string | null
  grade: string | null
  unit_price_cents: number | null
  serving_size_g: number | string
  current_stock_g: number | null
  protein_per_100g?: number | null
  carbs_per_100g?: number | null
  fat_per_100g?: number | null
  calories_per_100g?: number | null
  macros_source?: string
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('ALL')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [receiptScannerOpen, setReceiptScannerOpen] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const CATEGORIES = [
    'ALL',
    'Protein',
    'Vegetables',
    'Carbohydrates',
    'Condiments',
    'Packaging',
  ]

  useEffect(() => {
    fetchInventory()
  }, [])

  const fetchInventory = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await axios.get(`${apiUrl}/api/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems(response.data.data || [])
    } catch (err: any) {
      console.error('Fetch error:', err)
      setError(err.response?.data?.error || 'Failed to fetch inventory')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesCategory =
        activeCategory === 'ALL' || item.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [items, search, activeCategory])

  const deleteItem = async (id: number) => {
    if (!confirm('Delete this ingredient?')) return
    try {
      await axios.delete(`${apiUrl}/api/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchInventory()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete ingredient')
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  return (
    <main className="min-h-screen bg-[#E9DFD0] font-sans text-[#4B2B1D]">
      <div className="px-4 py-5 sm:px-6 lg:px-7 xl:px-8">
        <Header
          search={search}
          setSearch={setSearch}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          onAdd={() => {
            setEditingId(null)
            setDrawerOpen(true)
          }}
          onReceipt={() => setReceiptScannerOpen(true)}
        />

        {error && (
          <div className="mt-6 rounded-2xl border border-[#E8B4B9] bg-[#FFF4F5] p-4 flex gap-3">
            <div>
              <p className="font-bold text-[#D62F3D]">Error</p>
              <p className="text-sm text-[#755B4C]">{error}</p>
            </div>
          </div>
        )}

        <div className={drawerOpen ? 'mt-6 xl:pr-[380px]' : 'mt-6'}>
          {loading ? (
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-10 text-center">
              <p className="text-lg font-extrabold">Loading inventory...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-10 text-center">
              <p className="text-lg font-extrabold">No ingredients found.</p>
              <p className="mt-1 text-sm text-[#755B4C]">
                Try a different search or add a new ingredient.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E4D8C9]">
                    <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">
                      Store
                    </th>
                    <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">
                      Grade
                    </th>
                    <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">
                      Price/lb
                    </th>
                    <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">
                      Serving Size
                    </th>
                    <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">
                      Current Stock
                    </th>
                    <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">
                      Protein (g)
                    </th>
                    <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">
                      Carbs (g)
                    </th>
                    <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">
                      Fat (g)
                    </th>
                    <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">
                      Calories
                    </th>
                    <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition"
                    >
                      <td className="px-4 py-3 font-medium text-[#4B2B1D]">
                        {item.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-[#EDF2F7] px-2 py-1 text-xs font-bold text-[#2F5F98]">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#755B4C] text-xs">
                        {item.store || '-'}
                      </td>
                      <td className="px-4 py-3 text-[#755B4C] text-xs">
                        {item.grade || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">
                        {item.unit_price_cents != null
                          ? `$${(item.unit_price_cents / 100).toFixed(2)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">
                        {item.serving_size_g != null && item.serving_size_g !== '' && !isNaN(parseFloat(String(item.serving_size_g)))
                          ? item.category === 'Protein'
                            ? `${(parseFloat(String(item.serving_size_g)) / 28.3495).toFixed(1)}oz`
                            : `${parseFloat(String(item.serving_size_g)).toFixed(1)}g`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-[#755B4C]">
                        {item.current_stock_g != null
                          ? `${parseFloat(String(item.current_stock_g)).toFixed(0)}g`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[#755B4C] text-sm">
                        {item.protein_per_100g ? parseFloat(String(item.protein_per_100g)).toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[#755B4C] text-sm">
                        {item.carbs_per_100g ? parseFloat(String(item.carbs_per_100g)).toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[#755B4C] text-sm">
                        {item.fat_per_100g ? parseFloat(String(item.fat_per_100g)).toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[#755B4C] text-sm">
                        {item.calories_per_100g ? parseFloat(String(item.calories_per_100g)).toFixed(0) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingId(item.id)
                              setDrawerOpen(true)
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF6EE] text-[#2E527F] transition hover:border-[#3E6594] hover:bg-[#EDF2F7]"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4B6B9] bg-[#FFF4F4] text-[#D62F3D] transition hover:bg-[#FDEBEC]"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AddIngredientDrawer
        open={drawerOpen}
        editingItem={items.find((i) => i.id === editingId) || null}
        onClose={() => {
          setDrawerOpen(false)
          setEditingId(null)
          fetchInventory()
        }}
      />

      <ReceiptScanner
        open={receiptScannerOpen}
        onClose={() => {
          setReceiptScannerOpen(false)
          fetchInventory()
        }}
        inventoryItems={items}
      />
    </main>
  )
}

function Header({
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  onAdd,
  onReceipt,
}: {
  search: string
  setSearch: (value: string) => void
  activeCategory: string
  setActiveCategory: (value: string) => void
  onAdd: () => void
  onReceipt: () => void
}) {
  return (
    <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[#FBF7F0] text-[#2E527F]">
          <Package className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-[#755B4C]">
            Manage ingredients and pricing. All prices tracked from last purchase.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
        <div className="relative w-full sm:w-[290px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4B2B1D]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ingredients..."
            className="h-12 w-full rounded-xl border border-[#B7A58F] bg-[#FBF7F0] pl-11 pr-4 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#8D7A69] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value)}
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[#FBF7F0] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          >
            <option value="ALL">All categories</option>
            <option value="Protein">Protein</option>
            <option value="Vegetables">Vegetables</option>
            <option value="Carbohydrates">Carbohydrates</option>
            <option value="Condiments">Condiments</option>
            <option value="Packaging">Packaging</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </div>

        <button
          onClick={onReceipt}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16813D] px-5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(22,129,61,0.18)] transition hover:bg-[#0d6a2d] active:scale-[0.98]"
        >
          <Receipt className="h-5 w-5" />
          Log Receipt
        </button>

        <button
          onClick={onAdd}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2E527F] px-5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(46,82,127,0.18)] transition hover:bg-[#24466E] active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Add Ingredient
        </button>
      </div>
    </header>
  )
}

function AddIngredientDrawer({
  open,
  editingItem,
  onClose,
}: {
  open: boolean
  editingItem: InventoryItem | null
  onClose: () => void
}) {
  const editingId = editingItem?.id ?? null

  const blankForm = {
    name: '',
    category: 'Protein',
    store: '',
    grade: '',
    price_per_pound: '',
    serving_size_g: '',
    current_stock_g: '',
    protein_per_100g: null as number | null,
    carbs_per_100g: null as number | null,
    fat_per_100g: null as number | null,
    calories_per_100g: null as number | null,
  }

  const [formData, setFormData] = useState(blankForm)

  // Pre-fill the form when opening for an existing item; reset to blank for a new one
  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || '',
        category: editingItem.category || 'Protein',
        store: editingItem.store || '',
        grade: editingItem.grade || '',
        price_per_pound:
          editingItem.unit_price_cents != null
            ? (editingItem.unit_price_cents / 100).toFixed(2)
            : '',
        serving_size_g: editingItem.serving_size_g?.toString() || '',
        current_stock_g: editingItem.current_stock_g?.toString() || '',
        protein_per_100g: editingItem.protein_per_100g ?? null,
        carbs_per_100g: editingItem.carbs_per_100g ?? null,
        fat_per_100g: editingItem.fat_per_100g ?? null,
        calories_per_100g: editingItem.calories_per_100g ?? null,
      })
    } else if (open) {
      setFormData(blankForm)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, open])

  const [loading, setLoading] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        name: formData.name,
        category: formData.category,
        store: formData.store || null,
        grade: formData.grade || null,
        unit_price_cents: formData.price_per_pound
          ? Math.round(parseFloat(formData.price_per_pound) * 100)
          : undefined,
        serving_size_g: parseFloat(formData.serving_size_g) || 0,
        current_stock_g: formData.current_stock_g ? parseFloat(formData.current_stock_g) : 0,
        protein_per_100g: formData.protein_per_100g,
        carbs_per_100g: formData.carbs_per_100g,
        fat_per_100g: formData.fat_per_100g,
        calories_per_100g: formData.calories_per_100g,
      }

      if (editingId) {
        await axios.put(`${apiUrl}/api/inventory/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        await axios.post(`${apiUrl}/api/inventory`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      setFormData(blankForm)
      onClose()
    } catch (err: any) {
      console.error('Error:', err)
      alert(err.response?.data?.error || 'Failed to save ingredient')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <button
          aria-label="Close drawer"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm transform bg-[#F8F2E8] shadow-2xl transition-transform duration-300 overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="sticky top-0 z-10 flex h-16 items-center border-b border-[#D8CDBE] bg-[#F8F2E8] px-6">
          <h2 className="text-xl font-extrabold text-[#4B2B1D]">
            {editingId ? 'Edit Ingredient' : 'Add Ingredient'}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-[#755B4C] hover:text-[#4B2B1D]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Chicken Breast"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            >
              <option>Protein</option>
              <option>Vegetables</option>
              <option>Carbohydrates</option>
              <option>Condiments</option>
              <option>Packaging</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Store
            </label>
            <input
              type="text"
              value={formData.store}
              onChange={(e) =>
                setFormData({ ...formData, store: e.target.value })
              }
              placeholder="e.g., Sams Club"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Grade/Quality
            </label>
            <input
              type="text"
              value={formData.grade}
              onChange={(e) =>
                setFormData({ ...formData, grade: e.target.value })
              }
              placeholder="e.g., Organic"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Price per Pound ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_per_pound}
              onChange={(e) =>
                setFormData({ ...formData, price_per_pound: e.target.value })
              }
              placeholder="5.98"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Serving Size (g) *
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.serving_size_g}
              onChange={(e) =>
                setFormData({ ...formData, serving_size_g: e.target.value })
              }
              placeholder="141.7"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
              Current Stock (g)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.current_stock_g}
              onChange={(e) =>
                setFormData({ ...formData, current_stock_g: e.target.value })
              }
              placeholder="0"
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            />
          </div>

          <div className="border-t border-[#D8CDBE] pt-4 mt-4">
            <h3 className="text-sm font-bold text-[#4B2B1D] mb-3">Nutrition (per 100g)</h3>
            <p className="text-xs text-[#755B4C] mb-3">Auto-populated from USDA. Edit to override.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Protein (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.protein_per_100g || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, protein_per_100g: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="-"
                  className="h-10 w-full rounded-lg border border-[#B9A88F] bg-[#FBF6EE] px-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Carbs (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.carbs_per_100g || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, carbs_per_100g: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="-"
                  className="h-10 w-full rounded-lg border border-[#B9A88F] bg-[#FBF6EE] px-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Fat (g)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.fat_per_100g || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, fat_per_100g: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="-"
                  className="h-10 w-full rounded-lg border border-[#B9A88F] bg-[#FBF6EE] px-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Calories</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.calories_per_100g || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, calories_per_100g: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="-"
                  className="h-10 w-full rounded-lg border border-[#B9A88F] bg-[#FBF6EE] px-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#2E527F] text-white font-bold rounded-xl hover:bg-[#24466E] disabled:opacity-50 transition mt-6"
          >
            {loading ? 'Saving...' : 'Save Ingredient'}
          </button>
        </form>
      </div>
    </>
  )
}
