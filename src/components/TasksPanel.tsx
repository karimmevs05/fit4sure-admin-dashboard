import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { CheckSquare, Square } from 'lucide-react'

type Task = {
  id: number
  customer_id: number | null
  customer_name: string | null
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCompleted, setShowCompleted] = useState(false)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const headers = { Authorization: `Bearer ${token}` }

  const fetchTasks = async () => {
    const res = await axios.get(`${apiUrl}/api/admin/crm-tasks`, { headers, params: { status: showCompleted ? 'all' : 'open' } })
    setTasks(res.data.data || [])
  }

  useEffect(() => {
    fetchTasks()
  }, [showCompleted])

  const complete = async (id: number) => {
    await axios.put(`${apiUrl}/api/admin/crm-tasks/${id}/complete`, {}, { headers })
    fetchTasks()
  }

  return (
    <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-[#4B2B1D]">Tasks</h3>
        <button onClick={() => setShowCompleted((v) => !v)} className="text-xs font-bold text-[#755B4C] underline">
          {showCompleted ? 'Show open only' : 'Show completed too'}
        </button>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && <p className="text-xs text-[#9A7E6F]">Nothing here -- automation-assigned tasks and anything logged manually will show up here.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-start gap-2 bg-white rounded-lg p-3">
            <button onClick={() => complete(t.id)} disabled={!!t.completed_at} className="mt-0.5 shrink-0">
              {t.completed_at ? <CheckSquare className="h-4 w-4 text-[#16A34A]" /> : <Square className="h-4 w-4 text-[#755B4C]" />}
            </button>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${t.completed_at ? 'text-[#9A7E6F] line-through' : 'text-[#4B2B1D]'}`}>{t.title}</p>
              {t.customer_name && <p className="text-xs text-[#755B4C]">{t.customer_name}</p>}
              {t.description && <p className="text-xs text-[#9A7E6F]">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
