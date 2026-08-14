
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { List, Zap, X, Users } from 'lucide-react'

type ListSummary = { id: number; name: string; member_count: string }
type Rule = { id: number; name: string }

function useLookups() {
  const [lists, setLists] = useState<ListSummary[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const headers = { Authorization: `Bearer ${token}` }

  const refresh = async () => {
    const [listsRes, rulesRes] = await Promise.all([
      axios.get(`${apiUrl}/api/admin/customer-lists`, { headers }),
      axios.get(`${apiUrl}/api/admin/automation-rules`, { headers }),
    ])
    setLists(listsRes.data.data || [])
    setRules(rulesRes.data.data || [])
  }
  useEffect(() => {
    refresh()
  }, [])

  return { lists, rules, refresh, apiUrl, headers }
}

export function BulkActionBar({ selectedIds, onClear }: { selectedIds: number[]; onClear: () => void }) {
  const { lists, rules, refresh, apiUrl, headers } = useLookups()
  const [mode, setMode] = useState<'none' | 'list' | 'trigger'>('none')
  const [newListName, setNewListName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (selectedIds.length === 0) return null

  const addToExistingList = async (listId: number) => {
    setBusy(true)
    await axios.post(`${apiUrl}/api/admin/customer-lists/${listId}/members`, { customer_ids: selectedIds }, { headers })
    setBusy(false)
    setMessage(`Added ${selectedIds.length} to list.`)
    setMode('none')
  }

  const createListWithSelection = async () => {
    if (!newListName.trim()) return
    setBusy(true)
    await axios.post(`${apiUrl}/api/admin/customer-lists`, { name: newListName.trim(), customer_ids: selectedIds }, { headers })
    setBusy(false)
    setMessage(`Created "${newListName.trim()}" with ${selectedIds.length} customers.`)
    setNewListName('')
    setMode('none')
    refresh()
  }

  const triggerSequence = async (ruleId: number) => {
    setBusy(true)
    const res = await axios.post(`${apiUrl}/api/admin/automation-rules/${ruleId}/enroll`, { customer_ids: selectedIds }, { headers })
    setBusy(false)
    setMessage(`Enrolled ${res.data.enrolled} customer(s).`)
    setMode('none')
  }

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-[#3E6594] bg-[#E8EEF5] px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-extrabold text-[#2E527F]">{selectedIds.length} selected</span>

      {mode === 'none' && (
        <>
          <button onClick={() => setMode('list')} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-[#B9A88F] text-xs font-bold text-[#4B2B1D]">
            <List className="h-3.5 w-3.5" /> Add to list
          </button>
          <button onClick={() => setMode('trigger')} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-[#B9A88F] text-xs font-bold text-[#4B2B1D]">
            <Zap className="h-3.5 w-3.5" /> Trigger sequence
          </button>
        </>
      )}

      {mode === 'list' && (
        <div className="flex items-center gap-2 flex-wrap">
          {lists.map((l) => (
            <button key={l.id} disabled={busy} onClick={() => addToExistingList(l.id)} className="h-8 px-3 rounded-lg bg-white border border-[#B9A88F] text-xs font-bold text-[#4B2B1D]">
              {l.name} ({l.member_count})
            </button>
          ))}
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="New list name..."
            className="h-8 rounded-lg border border-[#B9A88F] bg-white px-2 text-xs"
          />
          <button disabled={busy || !newListName.trim()} onClick={createListWithSelection} className="h-8 px-3 rounded-lg bg-[#2E527F] text-white text-xs font-bold disabled:opacity-50">
            Create
          </button>
        </div>
      )}

      {mode === 'trigger' && (
        <div className="flex items-center gap-2 flex-wrap">
          {rules.length === 0 && <span className="text-xs text-[#755B4C]">No automations yet -- create one in the Automations tab first.</span>}
          {rules.map((r) => (
            <button key={r.id} disabled={busy} onClick={() => triggerSequence(r.id)} className="h-8 px-3 rounded-lg bg-white border border-[#B9A88F] text-xs font-bold text-[#4B2B1D]">
              {r.name}
            </button>
          ))}
        </div>
      )}

      {message && <span className="text-xs font-bold text-[#16834A]">{message}</span>}

      <button onClick={onClear} className="ml-auto text-[#755B4C]">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ListsTab() {
  const { lists, rules, apiUrl, headers } = useLookups()
  const [openListId, setOpenListId] = useState<number | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const viewList = async (id: number) => {
    setOpenListId(id)
    const res = await axios.get(`${apiUrl}/api/admin/customer-lists/${id}/members`, { headers })
    setMembers(res.data.data || [])
  }

  const triggerOnList = async (ruleId: number) => {
    if (!openListId) return
    const res = await axios.post(
      `${apiUrl}/api/admin/automation-rules/${ruleId}/enroll`,
      { customer_ids: members.map((m) => m.id) },
      { headers }
    )
    setMessage(`Enrolled ${res.data.enrolled} customer(s) from this list.`)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
        <h3 className="font-extrabold text-[#4B2B1D] mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" /> Lists
        </h3>
        <div className="space-y-2">
          {lists.length === 0 && <p className="text-xs text-[#9A7E6F]">No lists yet -- select customers in Pipeline or Active Customers to create one.</p>}
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => viewList(l.id)}
              className={`w-full text-left rounded-lg px-4 py-3 border transition ${openListId === l.id ? 'border-[#3E6594] bg-[#E8EEF5]' : 'border-[#E4D8C9] bg-white'}`}
            >
              <p className="text-sm font-bold text-[#4B2B1D]">{l.name}</p>
              <p className="text-xs text-[#755B4C]">{l.member_count} customers</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
        <h3 className="font-extrabold text-[#4B2B1D] mb-4">List details</h3>
        {!openListId ? (
          <p className="text-xs text-[#9A7E6F]">Select a list to view members and trigger a sequence.</p>
        ) : (
          <div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto mb-3">
              {members.map((m) => (
                <div key={m.id} className="bg-white rounded-lg px-3 py-2 text-xs font-semibold text-[#4B2B1D]">
                  {m.name}
                </div>
              ))}
            </div>
            <p className="text-xs font-bold text-[#4B2B1D] mb-1.5">Trigger a sequence on this list</p>
            <div className="flex gap-1.5 flex-wrap">
              {rules.map((r) => (
                <button key={r.id} onClick={() => triggerOnList(r.id)} className="h-8 px-3 rounded-lg bg-[#2E527F] text-white text-xs font-bold">
                  {r.name}
                </button>
              ))}
            </div>
            {message && <p className="text-xs font-bold text-[#16834A] mt-2">{message}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
