import React, { useState } from 'react'
import axios from 'axios'
import { X, Plus, Trash2 } from 'lucide-react'
import { convertToGrams, parseQuantityAndUnit } from '../utils/unitConversion'

type ReceiptLineItem = {
  id: string
  inventory_id: number | null
  inventory_name: string
  quantity: number
  unit: string
  price: number
  quantity_grams: number
}

export function ReceiptScanner({
  open,
  onClose,
  inventoryItems,
}: {
  open: boolean
  onClose: () => void
  inventoryItems: Array<{ id: number; name: string }>
}) {
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([])
  const [newItem, setNewItem] = useState({
    inventory_name: '',
    quantity: '',
    unit: 'g',
    price: '',
  })
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [store, setStore] = useState('')
  const [loading, setLoading] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const handleAddItem = () => {
    if (!newItem.inventory_name || !newItem.quantity || !newItem.price) {
      alert('Please fill in all fields')
      return
    }

    const { quantity, unit } = parseQuantityAndUnit(
      `${newItem.quantity} ${newItem.unit}`
    )
    const quantityGrams = convertToGrams(quantity, unit)

    const matchedInventory = inventoryItems.find(
      (item) =>
        item.name.toLowerCase() ===
        newItem.inventory_name.toLowerCase()
    )

    const item: ReceiptLineItem = {
      id: Math.random().toString(),
      inventory_id: matchedInventory?.id || null,
      inventory_name: newItem.inventory_name,
      quantity,
      unit,
      price: parseFloat(newItem.price),
      quantity_grams: quantityGrams,
    }

    setLineItems([...lineItems, item])
    setNewItem({ inventory_name: '', quantity: '', unit: 'g', price: '' })
  }

  const handleRemoveItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id))
  }

  const handleSubmit = async () => {
    if (lineItems.length === 0) {
      alert('Please add at least one item')
      return
    }

    // Confirmation before saving
    const summary = lineItems
      .map(
        (item) =>
          `${item.inventory_name}: ${item.quantity.toFixed(2)} ${item.unit} (${item.quantity_grams.toFixed(1)}g) - $${item.price.toFixed(2)}`
      )
      .join('\n')

    const confirmMsg = `Review receipt before saving:\n\nDate: ${receiptDate}\nStore: ${store || 'Not specified'}\n\n${summary}\n\nTotal: $${lineItems.reduce((sum, item) => sum + item.price, 0).toFixed(2)}\n\nThis will update inventory quantities and create financial records.\n\nProceed?`

    if (!window.confirm(confirmMsg)) {
      return
    }

    setLoading(true)

    try {
      // Submit receipt and get the receipt ID
      const receiptRes = await axios.post(
        `${apiUrl}/api/receipts`,
        {
          date: receiptDate,
          store,
          total_amount_cents: Math.round(
            lineItems.reduce((sum, item) => sum + item.price, 0) * 100
          ),
          items: lineItems.map((item) => ({
            inventory_id: item.inventory_id,
            inventory_name: item.inventory_name,
            quantity_grams: item.quantity_grams,
            unit_price_cents: Math.round(item.price * 100),
            unit: item.unit,
            quantity: item.quantity,
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      alert(
        `✅ Receipt saved! ${lineItems.length} items added to inventory.`
      )
      setLineItems([])
      setReceiptDate(new Date().toISOString().split('T')[0])
      setStore('')
      onClose()
    } catch (err: any) {
      console.error('Error:', err)
      alert(
        err.response?.data?.error ||
          'Failed to save receipt'
      )
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
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-2xl transform bg-[#F8F2E8] shadow-2xl transition-transform duration-300 overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="sticky top-0 z-10 flex h-16 items-center border-b border-[#D8CDBE] bg-[#F8F2E8] px-6">
          <h2 className="text-xl font-extrabold text-[#4B2B1D]">
            Log Receipt
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-[#755B4C] hover:text-[#4B2B1D]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Receipt Header */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
                Receipt Date
              </label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#4B2B1D] mb-2">
                Store/Vendor
              </label>
              <input
                type="text"
                value={store}
                onChange={(e) => setStore(e.target.value)}
                placeholder="e.g., Sams Club"
                className="h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              />
            </div>
          </div>

          {/* Add Item Form */}
          <div className="border-t border-[#D8CDBE] pt-4">
            <h3 className="text-sm font-bold text-[#4B2B1D] mb-3">
              Add Line Items
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={newItem.inventory_name}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      inventory_name: e.target.value,
                    })
                  }
                  placeholder="Type item name..."
                  list="inventory-items"
                  className="h-10 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-xs font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
                <datalist id="inventory-items">
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1">
                    Qty
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        quantity: e.target.value,
                      })
                    }
                    placeholder="10"
                    className="h-10 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1">
                    Unit
                  </label>
                  <select
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        unit: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                    <option value="cup">cup</option>
                    <option value="tbsp">tbsp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.price}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        price: e.target.value,
                      })
                    }
                    placeholder="0.00"
                    className="h-10 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs font-medium text-[#4B2B1D] outline-none placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  />
                </div>
              </div>

              <button
                onClick={handleAddItem}
                className="w-full h-10 bg-[#2E527F] text-white font-bold text-sm rounded-xl hover:bg-[#24466E] transition flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
          </div>

          {/* Line Items List */}
          {lineItems.length > 0 && (
            <div className="border-t border-[#D8CDBE] pt-4">
              <h3 className="text-sm font-bold text-[#4B2B1D] mb-3">
                Items ({lineItems.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-[#FBF7F0] p-3 rounded-lg border border-[#E4D8C9]"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[#4B2B1D]">
                        {item.inventory_name}
                      </p>
                      <p className="text-xs text-[#755B4C]">
                        {item.quantity.toFixed(2)} {item.unit} ({item.quantity_grams.toFixed(1)}g) · ${item.price.toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="ml-2 p-2 text-[#D62F3D] hover:bg-[#FDEBEC] rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {lineItems.length > 0 && (
            <div className="border-t border-[#D8CDBE] pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-[#4B2B1D]">Total:</span>
                <span className="text-lg font-extrabold text-[#16813D]">
                  $
                  {lineItems
                    .reduce((sum, item) => sum + item.price, 0)
                    .toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-12 bg-[#2E527F] text-white font-bold rounded-xl hover:bg-[#24466E] disabled:opacity-50 transition"
              >
                {loading ? 'Saving Receipt...' : 'Save Receipt & Update Inventory'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
