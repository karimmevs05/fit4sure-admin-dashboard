import React, { useState, useRef } from 'react'
import { DollarSign, TrendingUp, Activity, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Check, X, Upload, Loader } from 'lucide-react'
// Removed Tesseract - using GoHighLevel API instead

// Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Financials component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', margin: '2rem' }}>
          <h2 style={{ color: '#856404', marginTop: 0 }}>⚠️ Error Loading Financials</h2>
          <p style={{ color: '#856404' }}>{this.state.error?.message || 'Unknown error'}</p>
          <details style={{ marginTop: '1rem', color: '#856404' }}>
            <summary>Stack trace:</summary>
            <pre style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '12px' }}>
              {this.state.error?.stack}
            </pre>
          </details>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', marginTop: '1rem', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Image enhancement utilities - aggressive preprocessing for receipt scanning
const enhanceImageQuality = async (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Upscale 2x for better detail
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      const originalWidth = img.width
      const originalHeight = img.height
      canvas.width = originalWidth * 2
      canvas.height = originalHeight * 2

      // Draw upscaled
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, originalWidth, originalHeight, 0, 0, canvas.width, canvas.height)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Aggressive preprocessing for receipt text
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]

        // Convert to grayscale
        const gray = r * 0.299 + g * 0.587 + b * 0.114

        // Adaptive threshold - convert to black or white
        // This makes text much more readable
        const threshold = 130
        const final = gray > threshold ? 255 : 0

        data[i] = final
        data[i + 1] = final
        data[i + 2] = final
        data[i + 3] = a // Preserve alpha
      }

      ctx.putImageData(imageData, 0, 0)

      // Return enhanced image as base64 with max quality
      resolve(canvas.toDataURL('image/png').split(',')[1] || base64Image)
    }
    img.src = `data:image/jpeg;base64,${base64Image}`
  })
}

type Tab = 'overview' | 'revenue' | 'expenses' | 'profitability' | 'stripe' | 'reconciliation' | 'reports'

interface Expense {
  id: string
  date: string
  vendor: string
  category: string
  description: string
  amount: number
  status: 'pending' | 'approved' | 'reconciled'
  receiptId?: string
}

interface ReceiptItem {
  description: string
  amount: number
  category: string
  confidence: number
  quantity?: number
  unit?: string // grams, oz, ml, liters, lbs, kg, etc.
  productName?: string // User-assigned product name for database
}

function FinancialsPage() {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    weekly: true,
    meals: true,
    expenses: true,
    details: false,
    expenseForm: false,
    receiptScanner: false,
  })

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', date: '2026-07-05', vendor: 'Local Produce Co', category: 'food_cogs', description: 'Weekly vegetables and proteins', amount: 245.50, status: 'reconciled' },
    { id: '2', date: '2026-07-06', vendor: 'Packaging Plus', category: 'packaging', description: 'Food containers (500 units)', amount: 125.00, status: 'reconciled' },
    { id: '3', date: '2026-07-08', vendor: 'Delivery Partner', category: 'delivery', description: 'Tuesday delivery service', amount: 85.50, status: 'approved' },
    { id: '4', date: '2026-07-12', vendor: 'Farmers Market', category: 'food_cogs', description: 'Weekly ingredients', amount: 198.75, status: 'pending' },
  ])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    category: 'food_cogs',
    description: '',
    amount: 0,
    status: 'pending',
  })

  const [scannedReceipt, setScannedReceipt] = useState<{
    image: string
    text: string
    items: ReceiptItem[]
    vendor: string
    total: number
  } | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null)
  const [editingPrice, setEditingPrice] = useState<string>('')
  const [receiptTab, setReceiptTab] = useState<'scanner' | 'screenshot' | 'gdrive' | 'manual'>('manual')
  const [screenshotItems, setScreenshotItems] = useState<ReceiptItem[]>([])
  const [screenshotVendor, setScreenshotVendor] = useState('')
  const [showScreenshotForm, setShowScreenshotForm] = useState(false)
  const [syncInProgress, setSyncInProgress] = useState(false)
  const [syncResult, setSyncResult] = useState<{ processed: number; failed: number; errors?: { filename: string; error: string }[] } | null>(null)
  const [manualItems, setManualItems] = useState<ReceiptItem[]>([
    { description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }
  ])
  const [manualVendor, setManualVendor] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const categoryColors: Record<string, { bg: string; text: string; label: string }> = {
    food_cogs: { bg: '#8B6F47', text: 'white', label: 'Food COGS' },
    packaging: { bg: '#F4A460', text: 'white', label: 'Packaging' },
    delivery: { bg: '#4B7BA7', text: 'white', label: 'Delivery' },
    labor: { bg: '#D4AF37', text: 'white', label: 'Labor' },
    utilities: { bg: '#755B4C', text: 'white', label: 'Utilities' },
    other: { bg: '#9A7E6F', text: 'white', label: 'Other' },
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    reconciled: 'bg-green-100 text-green-800',
  }

  // Standard inventory units
  const unitOptions = [
    { value: 'g', label: 'Grams (g)' },
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'oz', label: 'Ounces (oz)' },
    { value: 'lb', label: 'Pounds (lb)' },
    { value: 'ml', label: 'Milliliters (ml)' },
    { value: 'L', label: 'Liters (L)' },
    { value: 'fl oz', label: 'Fluid Ounces (fl oz)' },
    { value: 'cup', label: 'Cups' },
    { value: 'tbsp', label: 'Tablespoons (tbsp)' },
    { value: 'tsp', label: 'Teaspoons (tsp)' },
    { value: 'count', label: 'Count (units)' },
  ]

  // Keywords for automatic categorization
  const categoryKeywords: Record<string, string[]> = {
    food_cogs: ['vegetable', 'fruit', 'meat', 'chicken', 'beef', 'fish', 'produce', 'organic', 'ingredient', 'spice', 'oil', 'butter', 'cream', 'cheese', 'milk', 'protein', 'fresh', 'organic', 'lettuce', 'tomato', 'onion', 'pepper', 'garlic'],
    packaging: ['container', 'box', 'bag', 'wrap', 'foil', 'plastic', 'cup', 'lid', 'label', 'tape', 'package', 'shipping', 'carton', 'tray'],
    delivery: ['delivery', 'fuel', 'gas', 'transportation', 'shipping', 'courier', 'logistics', 'freight'],
    labor: ['wage', 'salary', 'payroll', 'staff', 'employee', 'labor', 'hourly'],
    utilities: ['electricity', 'water', 'gas', 'internet', 'phone', 'utility', 'electric', 'bill'],
  }

  // Categorize based on keywords
  const categorizeItem = (description: string): string => {
    const lowerDesc = description.toLowerCase()
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => lowerDesc.includes(kw))) {
        return category
      }
    }
    return 'other'
  }

  // Parse amounts from text using regex - improved to catch more patterns
  const extractAmounts = (text: string): number[] => {
    // Match: $123.45, 123.45, 123,45, $123, etc.
    const amountPattern = /\$?\s*(\d{1,}[.,]?\d{0,2})/g
    const matches = text.match(amountPattern) || []
    return matches
      .map(m => {
        const cleaned = m.replace(/[$\s]/g, '').replace(',', '.')
        return parseFloat(cleaned)
      })
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => b - a) // Sort descending to get total at front
  }

  // Parse vendor name from receipt text
  const extractVendor = (text: string): string => {
    const lines = text.split('\n').filter(l => l.trim().length > 0)
    // Usually vendor is in first few lines
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim()
      if (line.length > 5 && line.length < 50) {
        return line
      }
    }
    return 'Receipt Vendor'
  }

  // Extract quantity and unit from receipt line (e.g., "500g", "2 lbs", "1.5L")
  const extractQuantityAndUnit = (line: string): { quantity?: number; unit?: string } => {
    // Look for patterns like: "500g", "2 lbs", "1.5L", "16 oz", "250ml", "1kg", "2.5 liters"
    const unitPatterns = [
      /(\d+(?:\.\d+)?)\s*(g|gram|grams|gr)/i,                    // grams
      /(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)/i,              // kilograms
      /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)/i,                    // ounces
      /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)/i,                // pounds
      /(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters)/i,          // milliliters
      /(\d+(?:\.\d+)?)\s*(l|liter|liters|litre|litres)/i,        // liters
      /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounce|fl oz)/i,       // fluid ounces
      /(\d+(?:\.\d+)?)\s*(cup|cups|c\.)/i,                       // cups
      /(\d+(?:\.\d+)?)\s*(tsp|teaspoon|tbsp|tablespoon)/i,       // spoons
    ]

    for (const pattern of unitPatterns) {
      const match = line.match(pattern)
      if (match && match[1] && match[2]) {
        const quantity = parseFloat(match[1])
        let unit = match[2].toLowerCase().replace(/s$/, '') // Remove plural 's'

        // Normalize units
        const unitMap: Record<string, string> = {
          'g': 'g',
          'gram': 'g',
          'gr': 'g',
          'kg': 'kg',
          'kilogram': 'kg',
          'oz': 'oz',
          'ounce': 'oz',
          'lb': 'lb',
          'lbs': 'lb',
          'pound': 'lb',
          'ml': 'ml',
          'milliliter': 'ml',
          'l': 'L',
          'liter': 'L',
          'litre': 'L',
          'fl. oz': 'fl oz',
          'fl oz': 'fl oz',
          'fluid ounce': 'fl oz',
          'cup': 'cup',
          'c.': 'cup',
          'c': 'cup',
          'tsp': 'tsp',
          'teaspoon': 'tsp',
          'tbsp': 'tbsp',
          'tablespoon': 'tbsp',
        }

        unit = unitMap[unit] || unit

        if (quantity > 0 && quantity < 100000) {
          return { quantity, unit }
        }
      }
    }
    return {}
  }

  // Complete receipt parser - extracts items, prices, and quantities
  const parseReceiptData = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // Extract vendor (usually first line)
    const vendor = lines[0] || 'Unknown Vendor'

    // Keywords that indicate a line is NOT a product item
    const excludeKeywords = ['TOTAL', 'SUBTOTAL', 'TAX', 'AMOUNT DUE', 'CHANGE', 'BALANCE', 'PAYMENT', 'TENDER', 'CASH', 'CARD', 'DEBIT', 'CREDIT', 'REGISTER', 'CASHIER', 'TERMINAL', 'TRANSACTION', 'RECEIPT', 'DATE', 'TIME', 'STORE', 'PHONE', 'RETURN', 'REFUND', 'DISCOUNT', 'COUPON', 'VOID', 'CANCELED', 'VISA', 'MASTERCARD', 'AMEX', 'AMERICAN EXPRESS']

    // Extract all amounts and their line numbers
    const lineItems: { line: string; amount: number; quantity?: number; unit?: string }[] = []

    lines.forEach((line) => {
      const upperLine = line.toUpperCase()

      // Skip lines with excluded keywords
      if (excludeKeywords.some(kw => upperLine.includes(kw))) {
        return
      }

      // Look for lines that have both text and a price
      const amountMatch = line.match(/(\d+[.,]\d{2})/)
      if (amountMatch && line.length > 3) {
        const amount = parseFloat(amountMatch[1].replace(',', '.'))

        // Extract description (everything before the price)
        const description = line.replace(/\$?\s*\d+[.,]\d{2}\s*$/, '').trim()

        // Extract quantity and unit if available
        const { quantity, unit } = extractQuantityAndUnit(line)

        if (description.length > 2 && amount > 0 && amount < 10000) {
          lineItems.push({
            line: description,
            amount,
            quantity,
            unit
          })
        }
      }
    })

    // Find the total (look for TOTAL keyword)
    let total = 0
    lineItems.forEach((item) => {
      if (item.line.toUpperCase().includes('TOTAL')) {
        total = item.amount
      }
    })

    // If no total found, use the largest amount
    if (total === 0 && lineItems.length > 0) {
      total = Math.max(...lineItems.map(i => i.amount))
    }

    // Convert to receipt items, excluding any line marked as TOTAL
    const items: ReceiptItem[] = lineItems
      .filter((item) => !item.line.toUpperCase().includes('TOTAL'))
      .map(item => ({
        description: item.line,
        amount: item.amount,
        quantity: item.quantity,
        unit: item.unit,
        category: categorizeItem(item.line),
        confidence: 0.85
      }))

    return {
      vendor,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0)
    }
  }

  // Process receipt using GoHighLevel API
  const processReceiptImage = async (file: File) => {
    setIsProcessing(true)
    setProcessingStatus('Sending to GoHighLevel...')

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const imageDataUrl = e.target?.result as string
          const base64Image = imageDataUrl.split(',')[1]

          // Call GoHighLevel receipt parser endpoint
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/task-management-test/parse-receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Image,
              fileName: file.name
            })
          })

          if (!response.ok) {
            throw new Error('GoHighLevel parsing failed')
          }

          const result = await response.json()
          const receiptData = result.data

          setProcessingStatus('')

          setScannedReceipt({
            image: imageDataUrl,
            text: receiptData.vendor || 'Receipt',
            items: receiptData.items || [],
            vendor: receiptData.vendor || 'Unknown Vendor',
            total: receiptData.total || 0,
          })
        } catch (error) {
          console.error('GoHighLevel Error:', error)
          setProcessingStatus('')
          alert(`Parsing Error: ${error instanceof Error ? error.message : 'Failed to parse receipt'}`)
        }
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing receipt:', error)
      setProcessingStatus('')
      alert('Error processing receipt image')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      processReceiptImage(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (file) {
      processReceiptImage(file)
    }
  }

  const createExpensesFromReceipt = async () => {
    if (!scannedReceipt) return

    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      // Call backend to save products and expenses
      const response = await fetch(`${apiUrl}/api/admin/expenses/save-receipt-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: scannedReceipt.items,
          vendor: scannedReceipt.vendor
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save receipt items')
      }

      const result = await response.json()
      console.log('Saved products:', result.data.productsAdded)
      console.log('Created expenses:', result.data.expensesCreated)

      // Also add to local state for immediate display
      const newExpenses = scannedReceipt.items.map((item, idx) => ({
        id: `receipt-${Date.now()}-${idx}`,
        date: new Date().toISOString().split('T')[0],
        vendor: scannedReceipt.vendor,
        category: item.category,
        description: item.productName || item.description,
        amount: item.amount,
        status: 'pending' as const,
        receiptId: `receipt-${Date.now()}`,
      }))

      setExpenses([...expenses, ...newExpenses])
      setScannedReceipt(null)
      setExpandedSections(prev => ({ ...prev, receiptScanner: false }))

      // Show success message
      alert(`✓ Added ${scannedReceipt.items.length} products to database and created ${newExpenses.length} expenses`)
    } catch (error) {
      console.error('Error saving receipt:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save receipt'}`)
    }
  }

  // Load receipt images from Google Drive and parse them
  const loadFromGoogleDrive = async () => {
    try {
      setIsProcessing(true)
      setProcessingStatus('Loading receipts from Google Drive...')

      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const response = await fetch(`${apiUrl}/api/admin/receipt-read/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load receipts from Google Drive')
      }

      const result = await response.json()
      const receipts = result.data.receipts

      if (receipts.length === 0) {
        alert('No receipts found in Google Drive folder')
        setIsProcessing(false)
        return
      }

      console.log(`Found ${receipts.length} receipts, parsing...`)
      setProcessingStatus(`Analyzing ${receipts.length} receipts...`)

      // Parse each receipt with simple regex (no API calls needed)
      const allItems: ReceiptItem[] = []

      for (const receipt of receipts) {
        setProcessingStatus(`Processing ${receipt.filename}...`)
        setManualVendor(receipt.vendor)

        // Simple extraction from filename for now
        // User will manually enter the items
        const item: ReceiptItem = {
          description: receipt.filename,
          amount: 0,
          category: 'food_cogs',
          confidence: 0.5,
          productName: '',
          unit: 'count',
          quantity: undefined
        }
        allItems.push(item)
      }

      // Show first receipt's vendor
      if (receipts.length > 0) {
        setManualVendor(receipts[0].vendor)
        setManualDate(new Date().toISOString().split('T')[0])
      }

      setProcessingStatus('')
      setIsProcessing(false)
      alert(`✓ Loaded ${receipts.length} receipts from Google Drive.\n\nReceipt images are displayed in your folder.\nPlease manually enter the items below from each receipt.`)
    } catch (error) {
      console.error('Error loading from Drive:', error)
      setProcessingStatus('')
      setIsProcessing(false)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to load'}`)
    }
  }

  // Save manually entered receipt items
  const saveManualReceipt = async () => {
    try {
      if (!manualVendor || manualItems.length === 0) {
        alert('Please enter vendor name and at least one item')
        return
      }

      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const validItems = manualItems.filter(item => item.productName && item.amount > 0)

      if (validItems.length === 0) {
        alert('Please enter at least one item with name and price')
        return
      }

      const response = await fetch(`${apiUrl}/api/admin/receipt-review/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: validItems,
          vendor: manualVendor,
          date: manualDate
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save receipt')
      }

      const result = await response.json()
      alert(`✓ Saved ${result.data.productsAdded} products and created ${result.data.expensesCreated} expenses`)

      // Reset form
      setManualVendor('')
      setManualItems([{ description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }])
      setManualDate(new Date().toISOString().split('T')[0])

      // Refresh expenses
      setExpandedSections(prev => ({ ...prev, expenses: true }))
    } catch (error) {
      console.error('Error saving receipt:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`)
    }
  }

  // Sync receipts from Google Drive
  const syncGoogleDrive = async () => {
    try {
      setSyncInProgress(true)
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const response = await fetch(`${apiUrl}/api/admin/receipt-sync/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Sync failed')
      }

      const data = await response.json()
      setSyncResult(data.data)
      if (data.data.failed > 0) {
        alert(`Sync complete: ${data.data.processed} processed, ${data.data.failed} failed. See "Why these failed" below for details.`)
      } else {
        alert(`✓ Sync complete: ${data.data.processed} processed, ${data.data.failed} failed`)
      }
    } catch (error) {
      console.error('Sync error:', error)
      alert(`Sync error: ${error instanceof Error ? error.message : 'Failed to sync'}`)
    } finally {
      setSyncInProgress(false)
    }
  }

  // Handle screenshot upload for online orders - manual entry mode
  const handleScreenshotUpload = async (file: File) => {
    if (!file) return

    setIsProcessing(true)
    setProcessingStatus('Loading image...')

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const imageDataUrl = e.target?.result as string

          // Just show the image for manual entry
          setScreenshotItems([
            {
              description: 'Screenshot uploaded - enter items manually below',
              amount: 0,
              category: 'food_cogs',
              confidence: 0.5,
              productName: '',
              unit: 'g',
              quantity: undefined
            }
          ])
          setShowScreenshotForm(true)
          setProcessingStatus('')
        } catch (error) {
          console.error('Upload Error:', error)
          setProcessingStatus('')
          alert(`Error: ${error instanceof Error ? error.message : 'Failed to load image'}`)
        }
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing screenshot:', error)
      setProcessingStatus('')
      alert('Error processing screenshot')
    } finally {
      setIsProcessing(false)
    }
  }

  // Add manual item from screenshot
  const addScreenshotItem = () => {
    if (!screenshotItems[0]?.productName || !screenshotItems[0]?.amount) {
      alert('Please enter product name and price')
      return
    }

    setScreenshotItems([
      ...screenshotItems,
      {
        description: '',
        amount: 0,
        category: 'food_cogs',
        confidence: 0,
        productName: '',
        unit: 'g',
        quantity: undefined
      }
    ])
  }

  // Save screenshot items as expenses
  const saveScreenshotItems = async () => {
    if (!screenshotVendor || screenshotItems.length === 0 || !screenshotItems[0].productName) {
      alert('Please enter vendor name and at least one item')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      // Filter out empty items
      const validItems = screenshotItems.filter(item => item.productName && item.amount > 0)

      if (validItems.length === 0) {
        alert('No valid items to save')
        return
      }

      // Call backend to save products and expenses
      const response = await fetch(`${apiUrl}/api/admin/expenses/save-receipt-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: validItems,
          vendor: screenshotVendor
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save items')
      }

      const result = await response.json()

      // Add to local expenses
      const newExpenses = validItems.map((item, idx) => ({
        id: `screenshot-${Date.now()}-${idx}`,
        date: new Date().toISOString().split('T')[0],
        vendor: screenshotVendor,
        category: item.category,
        description: item.productName,
        amount: item.amount,
        status: 'pending' as const,
      }))

      setExpenses([...expenses, ...newExpenses])
      setShowScreenshotForm(false)
      setScreenshotItems([])
      setScreenshotVendor('')
      setExpandedSections(prev => ({ ...prev, receiptScanner: false }))

      alert(`✓ Added ${validItems.length} items from screenshot`)
    } catch (error) {
      console.error('Error saving screenshot items:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save items'}`)
    }
  }

  const addExpense = () => {
    if (!formData.vendor || !formData.amount) return

    const newExpense: Expense = {
      id: Date.now().toString(),
      date: formData.date || new Date().toISOString().split('T')[0],
      vendor: formData.vendor || '',
      category: formData.category || 'food_cogs',
      description: formData.description || '',
      amount: formData.amount || 0,
      status: formData.status || 'pending',
    }

    setExpenses([...expenses, newExpense])
    setFormData({
      date: new Date().toISOString().split('T')[0],
      vendor: '',
      category: 'food_cogs',
      description: '',
      amount: 0,
      status: 'pending',
    })
    setExpandedSections(prev => ({ ...prev, expenseForm: false }))
  }

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, ...updates } : e))
    setEditingId(null)
  }

  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id))
  }

  const expensesByCategory = expenses.reduce((acc, exp) => {
    if (!acc[exp.category]) acc[exp.category] = 0
    acc[exp.category] += exp.amount
    return acc
  }, {} as Record<string, number>)

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const pendingExpenses = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0)

  // July 2026 actual meal count data
  const week1 = {
    week: 'Week of 7.5',
    regularMeals: 27,
    largeMeals: 23,
    breakfastMeals: 8,
  }

  const week2 = {
    week: 'Week of 7.12',
    regularMeals: 21,
    largeMeals: 28,
    breakfastMeals: 6,
  }

  // Calculate totals
  const week1Revenue = (week1.regularMeals * 15) + (week1.largeMeals * 18) + (week1.breakfastMeals * 13)
  const week2Revenue = (week2.regularMeals * 15) + (week2.largeMeals * 18) + (week2.breakfastMeals * 13)
  const totalRevenue = week1Revenue + week2Revenue

  const stripeFees = Math.round(totalRevenue * 0.0315 * 100) / 100
  const netRevenue = totalRevenue - stripeFees

  const totalMeals = week1.regularMeals + week1.largeMeals + week1.breakfastMeals + week2.regularMeals + week2.largeMeals + week2.breakfastMeals
  const netOperatingProfit = netRevenue - totalExpenses

  const Section = ({ id, title, children }: any) => (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between p-6 hover:bg-[#FDFBF7] transition"
      >
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">{title}</h2>
        {expandedSections[id] ? (
          <ChevronUp className="h-5 w-5 text-[#8B6F47]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[#8B6F47]" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="border-t border-[#E8DCC8] p-6 space-y-4">
          {children}
        </div>
      )}
    </div>
  )

  return (
    <main className="space-y-6 bg-[#FDFBF7] p-8">
      <div>
        <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Financials</h1>
        <p className="mt-1 text-[#755B4C]">July 2026 Overview</p>
      </div>

      {/* KPI Cards - Always visible */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#755B4C]">Gross Revenue</p>
              <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-[#9A7E6F]">From {totalMeals} meals</p>
            </div>
            <div className="rounded-lg bg-[#FBF7F0] p-3">
              <DollarSign className="h-5 w-5 text-[#8B6F47]" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#755B4C]">Total Expenses</p>
              <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${totalExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-[#9A7E6F]">{expenses.length} tracked expenses</p>
            </div>
            <div className="rounded-lg bg-[#FBF7F0] p-3">
              <DollarSign className="h-5 w-5 text-[#8B6F47]" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#755B4C]">Net Revenue</p>
              <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${netRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-[#9A7E6F]">After fees</p>
            </div>
            <div className="rounded-lg bg-[#FBF7F0] p-3">
              <DollarSign className="h-5 w-5 text-[#8B6F47]" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#755B4C]">Net Operating Profit</p>
              <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${netOperatingProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-[#9A7E6F]">{((netOperatingProfit / totalRevenue) * 100).toFixed(1)}% margin</p>
            </div>
            <div className="rounded-lg bg-[#FBF7F0] p-3">
              <Activity className="h-5 w-5 text-[#8B6F47]" />
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-4">
        {/* Receipt Scanner */}
        <Section id="receiptScanner" title="📸 Log Receipts (Physical, Online & Google Drive)">
          {/* Tab Buttons */}
          <div className="flex gap-2 mb-4 border-b border-[#E8DCC8] flex-wrap">
            <button
              onClick={() => setReceiptTab('manual')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'manual'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              ✏️ Manual Entry
            </button>
            <button
              onClick={() => setReceiptTab('gdrive')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'gdrive'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              ☁️ Google Drive (Auto)
            </button>
            <button
              onClick={() => setReceiptTab('scanner')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'scanner'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              📷 Physical Receipt
            </button>
            <button
              onClick={() => setReceiptTab('screenshot')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'screenshot'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              📧 Online Order
            </button>
          </div>

          {/* Manual Entry Tab */}
          {receiptTab === 'manual' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">✏️ Manual Receipt Entry</h3>
                <p className="text-sm text-blue-800">
                  Quickly add receipt items by filling in the table below. No OCR needed.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#755B4C] mb-2">VENDOR *</label>
                  <input
                    type="text"
                    value={manualVendor}
                    onChange={(e) => setManualVendor(e.target.value)}
                    placeholder="Costco, Amazon, etc..."
                    className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#755B4C] mb-2">DATE *</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setManualItems([...manualItems, { description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }])
                    }}
                    className="w-full bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition text-sm"
                  >
                    + Add Row
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={loadFromGoogleDrive}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                  >
                    ☁️ Load from Drive
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto border border-[#E8DCC8] rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#8B6F47] text-white">
                      <th className="border-r border-[#D4A574] px-3 py-2 text-left">Product Name</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 text-right w-24">Price ($)</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 text-center w-20">Qty</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 w-20">Unit</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 w-32">Category</th>
                      <th className="px-3 py-2 text-center w-12">×</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-[#E8DCC8] hover:bg-[#FBF7F0]">
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="text"
                            value={item.productName || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].productName = e.target.value
                              setManualItems(updated)
                            }}
                            placeholder="Blueberries"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].amount = parseFloat(e.target.value) || 0
                              setManualItems(updated)
                            }}
                            placeholder="0.00"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                              setManualItems(updated)
                            }}
                            placeholder="-"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <select
                            value={item.unit || 'count'}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].unit = e.target.value
                              setManualItems(updated)
                            }}
                            className="w-full px-1 py-1 border border-[#D4A574] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          >
                            {unitOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.value}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <select
                            value={item.category}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].category = e.target.value
                              setManualItems(updated)
                            }}
                            className="w-full px-1 py-1 border border-[#D4A574] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          >
                            {Object.entries(categoryColors).map(([key, val]) => (
                              <option key={key} value={key}>{val.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {manualItems.length > 1 && (
                            <button
                              onClick={() => {
                                const updated = manualItems.filter((_, i) => i !== idx)
                                setManualItems(updated)
                              }}
                              className="text-red-600 hover:text-red-700 font-bold text-lg"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Save Button */}
              <button
                onClick={saveManualReceipt}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition text-lg"
              >
                ✓ Save Receipt to Database
              </button>
            </div>
          )}

          {/* Google Drive Sync Tab */}
          {receiptTab === 'gdrive' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">☁️ Google Drive Receipt Sync</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Drop receipts and online order screenshots in your Google Drive folder. AI automatically:
                </p>
                <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
                  <li>Extracts vendor name</li>
                  <li>Reads each item, price, and quantity/weight</li>
                  <li>Auto-categorizes (Food, Packaging, etc.)</li>
                  <li>Saves to database automatically</li>
                </ul>
              </div>

              <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                <p className="text-sm text-[#755B4C] mb-3">
                  <strong>Status:</strong> {syncInProgress ? 'Syncing...' : 'Ready. Syncs automatically every 5 minutes.'}
                </p>
                {syncResult && (
                  <>
                    <p className="text-sm text-[#4B2B1D] mb-3">
                      <strong>Last sync:</strong> {syncResult.processed} processed, {syncResult.failed} failed
                    </p>
                    {syncResult.errors && syncResult.errors.length > 0 && (
                      <div className="mt-2 rounded-lg bg-[#FFF4F5] border border-[#E8B4B9] p-3">
                        <p className="text-xs font-bold text-[#D62F3D] mb-2">Why these failed:</p>
                        <ul className="space-y-1">
                          {syncResult.errors.map((e, idx) => (
                            <li key={idx} className="text-xs text-[#755B4C]">
                              <span className="font-semibold text-[#4B2B1D]">{e.filename}:</span> {e.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={syncGoogleDrive}
                disabled={syncInProgress}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {syncInProgress ? (
                  <>
                    <Loader className="inline-block h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  '🔄 Sync Google Drive Now'
                )}
              </button>

              <div className="text-xs text-[#9A7E6F] bg-[#FBF7F0] p-3 rounded">
                <p><strong>📁 Folder name:</strong> "Fit4Sure Receipts"</p>
                <p><strong>✅ Processed items:</strong> Automatically moved to "Fit4Sure Receipts/Processed"</p>
              </div>
            </div>
          )}

          {/* Receipt Scanner Tab */}
          {receiptTab === 'scanner' && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                disabled={isProcessing}
                className="hidden"
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-[#8B6F47] rounded-lg p-8 text-center cursor-pointer hover:bg-[#FBF7F0] transition ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex flex-col items-center gap-3">
                  {isProcessing ? (
                    <>
                      <Loader className="h-8 w-8 text-[#8B6F47] animate-spin" />
                      <p className="font-semibold text-[#4B2B1D]">{processingStatus}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-[#8B6F47]" />
                      <div>
                        <p className="font-semibold text-[#4B2B1D]">Drop receipt image here or click to upload</p>
                        <p className="text-sm text-[#755B4C] mt-1">🤖 AI-powered by GoHighLevel for accurate parsing</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Online Order Tab */}
          {receiptTab === 'screenshot' && (
            <div className="space-y-4">
              {!showScreenshotForm ? (
                <>
                  <div className="bg-[#FBF7F0] p-4 rounded-lg border border-[#E8DCC8]">
                    <p className="text-sm text-[#755B4C]"><strong>📧 Online Orders:</strong> Upload screenshot → Manually enter items below with prices and quantities</p>
                  </div>

                  <input
                    type="file"
                    ref={screenshotInputRef}
                    onChange={(e) => e.target.files?.[0] && handleScreenshotUpload(e.target.files[0])}
                    accept="image/*"
                    disabled={isProcessing}
                    className="hidden"
                  />

                  <div
                    onClick={() => !isProcessing && screenshotInputRef.current?.click()}
                    className={`border-2 border-dashed border-[#8B6F47] rounded-lg p-8 text-center cursor-pointer hover:bg-[#FBF7F0] transition ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      {isProcessing ? (
                        <>
                          <Loader className="h-8 w-8 text-[#8B6F47] animate-spin" />
                          <p className="font-semibold text-[#4B2B1D]">{processingStatus}</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-[#8B6F47]" />
                          <div>
                            <p className="font-semibold text-[#4B2B1D]">Drop screenshot here or click to upload</p>
                            <p className="text-sm text-[#755B4C] mt-1">OCR will extract item names automatically</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Vendor Name */}
                  <div>
                    <label className="block text-xs font-bold text-[#755B4C] mb-2">VENDOR/STORE NAME</label>
                    <input
                      type="text"
                      value={screenshotVendor}
                      onChange={(e) => setScreenshotVendor(e.target.value)}
                      placeholder="e.g., Amazon, Instacart, Costco Online..."
                      className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                    />
                  </div>

                  {/* Extracted Items */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-[#4B2B1D]">Extracted Items - Confirm Details</h3>
                    {screenshotItems.map((item, idx) => (
                      <div key={idx} className="rounded-lg bg-white border-2 border-[#D4A574] p-4 space-y-3">
                        {/* Product Name (extracted from OCR - can edit) */}
                        <div>
                          <label className="block text-xs font-bold text-[#755B4C] mb-1">PRODUCT NAME</label>
                          <input
                            type="text"
                            value={item.productName || ''}
                            onChange={(e) => {
                              const updated = [...screenshotItems]
                              updated[idx].productName = e.target.value
                              setScreenshotItems(updated)
                            }}
                            className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                          />
                        </div>

                        {/* Price, Quantity, Category, Unit */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">PRICE ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.amount || ''}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].amount = parseFloat(e.target.value) || 0
                                setScreenshotItems(updated)
                              }}
                              placeholder="0.00"
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">AMOUNT</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                                setScreenshotItems(updated)
                              }}
                              placeholder="500"
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">UNIT</label>
                            <select
                              value={item.unit || 'g'}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].unit = e.target.value
                                setScreenshotItems(updated)
                              }}
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            >
                              {unitOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">CATEGORY</label>
                            <select
                              value={item.category}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].category = e.target.value
                                setScreenshotItems(updated)
                              }}
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            >
                              {Object.entries(categoryColors).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {screenshotItems.length > 1 && (
                          <button
                            onClick={() => {
                              const updated = screenshotItems.filter((_, i) => i !== idx)
                              setScreenshotItems(updated)
                            }}
                            className="text-xs text-red-600 hover:text-red-700 font-semibold"
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={saveScreenshotItems}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                    >
                      ✓ Save Order
                    </button>
                    <button
                      onClick={() => {
                        setShowScreenshotForm(false)
                        setScreenshotItems([])
                        setScreenshotVendor('')
                      }}
                      className="flex-1 bg-gray-400 text-white py-2 rounded-lg font-semibold hover:bg-gray-500 transition"
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {scannedReceipt && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Receipt Image Preview */}
                <div className="rounded-lg border border-[#E8DCC8] p-3">
                  <img src={scannedReceipt.image} alt="Receipt" className="w-full rounded-lg max-h-64 object-cover" />
                </div>

                {/* Extracted Details */}
                <div className="md:col-span-2 space-y-3">
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Extracted Vendor</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">{scannedReceipt.vendor}</p>
                  </div>
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Total Amount</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">${scannedReceipt.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Items Found</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">{scannedReceipt.items.length} line items</p>
                  </div>
                </div>
              </div>

              {/* Extracted Text Preview */}
              <details className="rounded-lg border border-[#E8DCC8] p-4 cursor-pointer hover:bg-[#FDFBF7]">
                <summary className="font-semibold text-[#4B2B1D]">📄 Raw OCR Text</summary>
                <pre className="mt-3 text-xs text-[#755B4C] whitespace-pre-wrap bg-white p-3 rounded border border-[#E8DCC8] max-h-48 overflow-y-auto">
                  {scannedReceipt.text}
                </pre>
              </details>

              {/* Extracted Items with Auto-Categorization */}
              <div className="space-y-2">
                <h3 className="font-semibold text-[#4B2B1D]">Items (Auto-Categorized)</h3>
                {scannedReceipt.items.map((item, idx) => (
                  <div key={idx} className="rounded-lg bg-white border-2 border-[#D4A574] p-4 space-y-4">
                    {/* Receipt Text & Price Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-[#4B2B1D] text-sm text-gray-600 italic">{item.description}</p>
                        <span className="text-xs text-[#9A7E6F] block">OCR confidence: {Math.round(item.confidence * 100)}%</span>
                      </div>
                      <div className="text-right">
                        {editingPriceIdx === idx ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              step="0.01"
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              className="w-24 px-2 py-1 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                const updated = [...scannedReceipt.items]
                                updated[idx].amount = parseFloat(editingPrice) || item.amount
                                setScannedReceipt({ ...scannedReceipt, items: updated })
                                setEditingPriceIdx(null)
                                setEditingPrice('')
                              }}
                              className="px-2 py-1 bg-[#8B6F47] text-white rounded text-xs font-bold hover:bg-[#6B5437]"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setEditingPriceIdx(null)
                                setEditingPrice('')
                              }}
                              className="px-2 py-1 bg-gray-400 text-white rounded text-xs font-bold hover:bg-gray-500"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="font-bold text-lg text-[#4B2B1D]">${(item.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                            <button
                              onClick={() => {
                                setEditingPriceIdx(idx)
                                setEditingPrice(item.amount.toString())
                              }}
                              className="text-xs text-[#8B6F47] hover:text-[#6B5437] font-semibold mt-1 underline"
                            >
                              Edit Price
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Product Name / Assignment */}
                    <div>
                      <label className="block text-xs font-bold text-[#755B4C] mb-1">PRODUCT NAME</label>
                      <input
                        type="text"
                        value={item.productName || ''}
                        onChange={(e) => {
                          const updated = [...scannedReceipt.items]
                          updated[idx].productName = e.target.value
                          setScannedReceipt({ ...scannedReceipt, items: updated })
                        }}
                        placeholder="e.g., Blueberries, Chicken Breast, Olive Oil..."
                        className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {/* Category Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">CATEGORY</label>
                        <select
                          value={item.category}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].category = e.target.value
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        >
                          {Object.entries(categoryColors).map(([key, val]) => (
                            <option key={key} value={key}>
                              {val.label}
                            </option>
                          ))}
                        </select>
                        <div
                          className="mt-1 h-2 rounded"
                          style={{ backgroundColor: categoryColors[item.category]?.bg }}
                        ></div>
                      </div>

                      {/* Quantity for Inventory */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">AMOUNT</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity || ''}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          placeholder="500"
                          className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        />
                      </div>

                      {/* Unit Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">UNIT</label>
                        <select
                          value={item.unit || 'g'}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].unit = e.target.value
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        >
                          {unitOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={createExpensesFromReceipt}
                  className="flex-1 bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition"
                >
                  ✓ Add All Items to Expenses
                </button>
                <button
                  onClick={() => setScannedReceipt(null)}
                  className="flex-1 bg-gray-400 text-white py-2 rounded-lg font-semibold hover:bg-gray-500 transition"
                >
                  ✕ Discard
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* Expense Management */}
        <Section id="expenses" title={`Expense Management (${expenses.length} expenses)`}>
          <div className="space-y-4">
            {/* Summary by Category */}
            <div className="bg-[#FDFBF7] p-4 rounded-lg border border-[#E8DCC8]">
              <h3 className="font-semibold text-[#4B2B1D] mb-3">Expenses by Category</h3>
              <div className="space-y-2">
                {Object.entries(expensesByCategory).map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: categoryColors[cat]?.bg || '#9A7E6F' }}></div>
                      <span className="text-[#755B4C]">{categoryColors[cat]?.label || cat}</span>
                    </div>
                    <span className="font-bold text-[#4B2B1D]">${(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
              {pendingExpenses > 0 && (
                <div className="mt-3 pt-3 border-t border-[#E8DCC8]">
                  <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded">
                    ⚠️ ${pendingExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })} pending approval
                  </p>
                </div>
              )}
            </div>

            {/* Add Expense Form */}
            <Section id="expenseForm" title="Add New Expense">
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={formData.date || ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                  <input
                    type="text"
                    placeholder="Vendor/Supplier name"
                    value={formData.vendor || ''}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={formData.category || 'food_cogs'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  >
                    {Object.entries(categoryColors).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                />
                <button
                  onClick={addExpense}
                  className="w-full bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Expense
                </button>
              </div>
            </Section>

            {/* Expense List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {expenses.map(expense => (
                <div key={expense.id} className="rounded-lg border border-[#E8DCC8] p-4 bg-white hover:bg-[#FDFBF7] transition">
                  {editingId === expense.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={expense.vendor}
                          onChange={(e) => updateExpense(expense.id, { vendor: e.target.value })}
                          className="px-2 py-1 border border-[#E8DCC8] rounded text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={expense.amount}
                          onChange={(e) => updateExpense(expense.id, { amount: parseFloat(e.target.value) })}
                          className="px-2 py-1 border border-[#E8DCC8] rounded text-sm"
                        />
                      </div>
                      <select
                        value={expense.status}
                        onChange={(e) => updateExpense(expense.id, { status: e.target.value as any })}
                        className="w-full px-2 py-1 border border-[#E8DCC8] rounded text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="reconciled">Reconciled</option>
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 bg-green-500 text-white py-1 rounded text-sm flex items-center justify-center gap-1 hover:bg-green-600"
                        >
                          <Check className="h-4 w-4" /> Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 bg-gray-500 text-white py-1 rounded text-sm flex items-center justify-center gap-1 hover:bg-gray-600"
                        >
                          <X className="h-4 w-4" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: categoryColors[expense.category]?.bg }}>
                            {categoryColors[expense.category]?.label}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${statusColors[expense.status]}`}>
                            {expense.status}
                          </span>
                        </div>
                        <p className="font-semibold text-[#4B2B1D]">{expense.vendor}</p>
                        <p className="text-xs text-[#755B4C]">{expense.description} • {expense.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#4B2B1D] text-lg">${(expense.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        <button
                          onClick={() => setEditingId(expense.id)}
                          className="p-2 hover:bg-[#FBF7F0] rounded text-[#8B6F47]"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="p-2 hover:bg-red-50 rounded text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Weekly Breakdown */}
        <Section id="weekly" title="Weekly Breakdown">
          <div className="overflow-x-auto">
            <div className="space-y-3 min-w-min">
              {[week1, week2].map((week, idx) => (
                <div key={idx} className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8] min-w-96">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-[#4B2B1D]">{week.week}</h3>
                    <span className="text-xs bg-[#8B6F47] text-white px-3 py-1 rounded-full">
                      {week.regularMeals + week.largeMeals + week.breakfastMeals} meals
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-[#755B4C]">Revenue</p>
                      <p className="mt-1 font-bold text-[#4B2B1D]">${(idx === 0 ? week1Revenue : week2Revenue).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#755B4C]">Expenses</p>
                      <p className="mt-1 font-bold text-[#4B2B1D]">${(totalExpenses / 2).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#755B4C]">Net</p>
                      <p className="mt-1 font-bold text-[#4B2B1D]">${((idx === 0 ? week1Revenue : week2Revenue) - (totalExpenses / 2)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Meal Breakdown */}
        <Section id="meals" title="Meal Breakdown by Type">
          <div className="overflow-x-auto">
            <div className="space-y-3 min-w-min">
              {[week1, week2].map((week, idx) => (
                <div key={idx} className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8] min-w-96">
                  <h3 className="font-semibold text-[#4B2B1D] mb-3">{week.week}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#755B4C]">Regular Meals ({week.regularMeals})</span>
                      <span className="font-bold text-[#4B2B1D]">${(week.regularMeals * 15).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#755B4C]">Large Meals ({week.largeMeals})</span>
                      <span className="font-bold text-[#4B2B1D]">${(week.largeMeals * 18).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#755B4C]">Breakfast ({week.breakfastMeals})</span>
                      <span className="font-bold text-[#4B2B1D]">${(week.breakfastMeals * 13).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </main>
  )
}

export default function FinancialsPageWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <FinancialsPage />
    </ErrorBoundary>
  )
}
