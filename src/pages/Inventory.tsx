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
} from 'lucide-react'
import { formatIngredientWeight } from '../utils/unitConversion'

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

type SortColumn =
  | 'name' | 'category' | 'store' | 'grade' | 'price' | 'serving_size'
  | 'stock' | 'status' | 'protein' | 'carbs' | 'fat' | 'calories'

function sortValue(item: InventoryItem, col: SortColumn): string | number {
  switch (col) {
    case 'name': return item.name?.toLowerCase() ?? ''
    case 'category': return item.category?.toLowerCase() ?? ''
    case 'store': return item.store?.toLowerCase() ?? ''
    case 'grade': return item.grade?.toLowerCase() ?? ''
    case 'price': return item.unit_price_cents ?? -Infinity
    case 'serving_size': return parseFloat(String(item.serving_size_g)) || 0
    case 'stock': return item.current_stock_g ?? 0
    case 'status': return (item.current_stock_g ?? 0) > 0 ? 1 : 0
    case 'protein': return item.protein_per_100g ?? -Infinity
    case 'carbs': return item.carbs_per_100g ?? -Infinity
    case 'fat': return item.fat_per_100g ?? -Infinity
    case 'calories': return item.calories_per_100g ?? -Infinity
  }
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('ALL')
  const [activeTab, setActiveTab] = useState<'stock' | 'ingredients'>('stock')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [storeFilter, setStoreFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT'>('ALL')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

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

  const stores = useMemo(() => {
    const set = new Set(items.map((i) => i.store).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesCategory =
        activeCategory === 'ALL' || item.category === activeCategory
      const matchesStore = storeFilter === 'ALL' || item.store === storeFilter
      const inStock = (item.current_stock_g ?? 0) > 0
      const matchesStatus =
        statusFilter === 'ALL' || (statusFilter === 'IN_STOCK' ? inStock : !inStock)
      return matchesSearch && matchesCategory && matchesStore && matchesStatus
    })
  }, [items, search, activeCategory, storeFilter, statusFilter])

  const inStockItems = useMemo(
    () => filtered.filter((item) => (item.current_stock_g ?? 0) > 0),
    [filtered]
  )

  const sortedIngredients = useMemo(() => {
    if (!sortColumn) return filtered
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sortColumn)
      const bv = sortValue(b, sortColumn)
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv)
      return (av as number) - (bv as number)
    })
    return sortDirection === 'asc' ? sorted : sorted.reverse()
  }, [filtered, sortColumn, sortDirection])

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

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
          storeFilter={storeFilter}
          setStoreFilter={setStoreFilter}
          stores={stores}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          showStatusFilter={activeTab === 'ingredients'}
          onAdd={() => {
            setEditingId(null)
            setDrawerOpen(true)
          }}
        />

        {error && (
          <div className="mt-6 rounded-2xl border border-[#E8B4B9] bg-[#FFF4F5] p-4 flex gap-3">
            <div>
              <p className="font-bold text-[#D62F3D]">Error</p>
              <p className="text-sm text-[#755B4C]">{error}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2 border-b border-[#2E527F]">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 text-sm font-extrabold border-b-2 -mb-px transition ${
              activeTab === 'stock'
                ? 'border-[#2E527F] text-[#2E527F]'
                : 'border-transparent text-[#2E527F] hover:text-[#4B2B1D]'
            }`}
          >
            In Stock
          </button>
          <button
            onClick={() => setActiveTab('ingredients')}
            className={`px-4 py-2 text-sm font-extrabold border-b-2 -mb-px transition ${
              activeTab === 'ingredients'
                ? 'border-[#2E527F] text-[#2E527F]'
                : 'border-transparent text-[#2E527F] hover:text-[#4B2B1D]'
            }`}
          >
            All Ingredients
          </button>
        </div>

        <div className={drawerOpen ? 'mt-4 xl:pr-[380px]' : 'mt-4'}>
          {loading ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
              <p className="text-lg font-extrabold">Loading inventory...</p>
            </div>
          ) : activeTab === 'stock' ? (
            inStockItems.length === 0 ? (
              <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
                <p className="text-lg font-extrabold">No in-stock ingredients found.</p>
                <p className="mt-1 text-sm text-[#755B4C]">
                  Try a different search, or log a receipt to add stock.
                </p>
              </div>
            ) : (
              <StockTable
                items={inStockItems}
                onEdit={(id) => { setEditingId(id); setDrawerOpen(true) }}
                onDelete={deleteItem}
              />
            )
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
              <p className="text-lg font-extrabold">No ingredients found.</p>
              <p className="mt-1 text-sm text-[#755B4C]">
                Try a different search or add a new ingredient.
              </p>
            </div>
          ) : (
            <IngredientsTable
              items={sortedIngredients}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={toggleSort}
              onEdit={(id) => { setEditingId(id); setDrawerOpen(true) }}
              onDelete={deleteItem}
            />
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
    </main>
  )
}

function Header({
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  storeFilter,
  setStoreFilter,
  stores,
  statusFilter,
  setStatusFilter,
  showStatusFilter,
  onAdd,
}: {
  search: string
  setSearch: (value: string) => void
  activeCategory: string
  setActiveCategory: (value: string) => void
  storeFilter: string
  setStoreFilter: (value: string) => void
  stores: string[]
  statusFilter: 'ALL' | 'IN_STOCK' | 'OUT'
  setStatusFilter: (value: 'ALL' | 'IN_STOCK' | 'OUT') => void
  showStatusFilter: boolean
  onAdd: () => void
}) {
  return (
    <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[rgba(251,247,240,0.9)] text-[#2E527F]">
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
            className="h-12 w-full rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-4 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value)}
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value)}
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          >
            <option value="ALL">All stores</option>
            {stores.map((store) => (
              <option key={store} value={store}>{store}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </div>

        {showStatusFilter && (
          <div className="relative">
            <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'IN_STOCK' | 'OUT')}
              className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
            >
              <option value="ALL">All stock</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="OUT">Not in Stock</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          </div>
        )}

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

function RowActions({
  itemId,
  itemName,
  onEdit,
  onDelete,
}: {
  itemId: number
  itemName: string
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={() => onEdit(itemId)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF6EE] text-[#2E527F] transition hover:border-[#3E6594] hover:bg-[#EDF2F7]"
        aria-label={`Edit ${itemName}`}
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(itemId)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4B6B9] bg-[#FFF4F4] text-[#D62F3D] transition hover:bg-[#FDEBEC]"
        aria-label={`Delete ${itemName}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// Focused "what can I cook with right now" view: only items with real stock,
// only the columns that matter for that question.
function StockTable({
  items,
  onEdit,
  onDelete,
}: {
  items: InventoryItem[]
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E4D8C9]">
            <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Display Name</th>
            <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Category</th>
            <th className="px-4 py-3 text-left font-extrabold text-[#4B2B1D]">Store</th>
            <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Price/lb</th>
            <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Current Stock</th>
            <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Protein (g)</th>
            <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Carbs (g)</th>
            <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Fat (g)</th>
            <th className="px-4 py-3 text-center font-extrabold text-[#4B2B1D]">Calories</th>
            <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
              <td className="px-4 py-3 font-medium text-[#4B2B1D]">{item.name}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-[#EDF2F7] px-2 py-1 text-xs font-bold text-[#2F5F98]">
                  {item.category}
                </span>
              </td>
              <td className="px-4 py-3 text-[#755B4C] text-xs">{item.store || '-'}</td>
              <td className="px-4 py-3 text-right text-[#755B4C]">
                {item.unit_price_cents != null ? `$${(item.unit_price_cents / 100).toFixed(2)}` : '-'}
              </td>
              <td className="px-4 py-3 text-right text-[#755B4C]">
                {item.current_stock_g != null ? formatIngredientWeight(parseFloat(String(item.current_stock_g)), item.category) : '-'}
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
                <RowActions itemId={item.id} itemName={item.name} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SortableHeader({
  label,
  column,
  align = 'left',
  sortColumn,
  sortDirection,
  onSort,
}: {
  label: string
  column: SortColumn
  align?: 'left' | 'right' | 'center'
  sortColumn: SortColumn | null
  sortDirection: 'asc' | 'desc'
  onSort: (col: SortColumn) => void
}) {
  const alignClass = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left justify-start'
  const active = sortColumn === column
  return (
    <th className={`px-4 py-3 font-extrabold text-[#4B2B1D] ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 ${alignClass} hover:text-[#2E527F] transition`}
      >
        {label}
        <span className="text-[10px] w-3 inline-block">
          {active ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}

// The full master list -- every ingredient ever tracked, in or out of
// stock, with every column sortable so it doubles as a reference sheet.
function IngredientsTable({
  items,
  sortColumn,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
}: {
  items: InventoryItem[]
  sortColumn: SortColumn | null
  sortDirection: 'asc' | 'desc'
  onSort: (col: SortColumn) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}) {
  const headerProps = { sortColumn, sortDirection, onSort }
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E4D8C9]">
            <SortableHeader label="Name" column="name" {...headerProps} />
            <SortableHeader label="Category" column="category" {...headerProps} />
            <SortableHeader label="Store" column="store" {...headerProps} />
            <SortableHeader label="Grade" column="grade" {...headerProps} />
            <SortableHeader label="Price/lb" column="price" align="right" {...headerProps} />
            <SortableHeader label="Serving Size" column="serving_size" align="right" {...headerProps} />
            <SortableHeader label="Current Stock" column="stock" align="right" {...headerProps} />
            <SortableHeader label="Status" column="status" align="center" {...headerProps} />
            <SortableHeader label="Protein (g)" column="protein" align="center" {...headerProps} />
            <SortableHeader label="Carbs (g)" column="carbs" align="center" {...headerProps} />
            <SortableHeader label="Fat (g)" column="fat" align="center" {...headerProps} />
            <SortableHeader label="Calories" column="calories" align="center" {...headerProps} />
            <th className="px-4 py-3 text-right font-extrabold text-[#4B2B1D]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[#E4D8C9] hover:bg-[#F8F2E8] transition">
              <td className="px-4 py-3 font-medium text-[#4B2B1D]">{item.name}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-[#EDF2F7] px-2 py-1 text-xs font-bold text-[#2F5F98]">
                  {item.category}
                </span>
              </td>
              <td className="px-4 py-3 text-[#755B4C] text-xs">{item.store || '-'}</td>
              <td className="px-4 py-3 text-[#755B4C] text-xs">{item.grade || '-'}</td>
              <td className="px-4 py-3 text-right text-[#755B4C]">
                {item.unit_price_cents != null ? `$${(item.unit_price_cents / 100).toFixed(2)}` : '-'}
              </td>
              <td className="px-4 py-3 text-right text-[#755B4C]">
                {item.serving_size_g != null && item.serving_size_g !== '' && !isNaN(parseFloat(String(item.serving_size_g)))
                  ? formatIngredientWeight(parseFloat(String(item.serving_size_g)), item.category)
                  : '-'}
              </td>
              <td className="px-4 py-3 text-right text-[#755B4C]">
                {item.current_stock_g != null ? formatIngredientWeight(parseFloat(String(item.current_stock_g)), item.category) : '-'}
              </td>
              <td className="px-4 py-3 text-center">
                {(item.current_stock_g ?? 0) > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-[#EAF5EC] px-2 py-1 text-xs font-bold text-[#16834A]">
                    In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[#F1EAE0] px-2 py-1 text-xs font-bold text-[#2E527F]">
                    Not in Stock
                  </span>
                )}
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
                <RowActions itemId={item.id} itemName={item.name} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
              className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
