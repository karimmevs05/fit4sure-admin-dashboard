import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, X, KeyRound, Pencil } from 'lucide-react'

type StaffUser = {
  user_id: number
  email: string
  display_name: string
  department: string | null
  status: 'available' | 'busy' | 'off'
  is_active: boolean
  created_at: string
}

const INPUT_CLASS =
  'w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10'

export default function SettingsPage() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [me, setMe] = useState<{ user_id: number; display_name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [resettingId, setResettingId] = useState<number | null>(null)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const authConfig = { headers: { Authorization: `Bearer ${token}` } }

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const [usersRes, meRes] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/users`, authConfig),
        axios.get(`${apiUrl}/api/auth/me`, authConfig),
      ])
      setUsers(usersRes.data.data)
      setMe(meRes.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (u: StaffUser) => {
    const res = await axios.patch(`${apiUrl}/api/admin/users/${u.user_id}`, { is_active: !u.is_active }, authConfig)
    setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? res.data.data : x)))
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Team &amp; Accounts</h1>
          <p className="mt-1 text-sm text-[#755B4C]">Who can log into the admin dashboard</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-[#2E527F] text-white px-4 py-2.5 font-bold hover:bg-[#24466E] transition"
        >
          <Plus className="h-5 w-5" />
          Add team member
        </button>
      </div>

      {error && <div className="rounded-xl border border-[#E8B4B9] bg-[#FFF4F5] text-[#D62F3D] px-4 py-3">{error}</div>}

      {loading ? (
        <p className="text-sm text-[#755B4C]">Loading…</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.user_id} className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4">
              {editingId === u.user_id ? (
                <EditUserForm
                  user={u}
                  apiUrl={apiUrl}
                  authConfig={authConfig}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => { setUsers((prev) => prev.map((x) => (x.user_id === updated.user_id ? updated : x))); setEditingId(null) }}
                />
              ) : resettingId === u.user_id ? (
                <ResetPasswordForm
                  user={u}
                  isSelf={me?.user_id === u.user_id}
                  apiUrl={apiUrl}
                  authConfig={authConfig}
                  onCancel={() => setResettingId(null)}
                  onDone={() => setResettingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ background: !u.is_active ? '#9A8774' : u.status === 'available' ? '#16813D' : u.status === 'busy' ? '#DC6500' : '#9A8774' }}
                      title={!u.is_active ? 'Deactivated' : u.status}
                    />
                    <div>
                      <div className="font-bold text-[#4B2B1D] flex items-center gap-2">
                        {u.display_name}
                        {me?.user_id === u.user_id && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2E527F]">you</span>}
                        {!u.is_active && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#D62F3D]">deactivated</span>}
                      </div>
                      <div className="text-xs text-[#755B4C]">{u.email}{u.department ? ` · ${u.department}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setResettingId(u.user_id)} className="flex items-center gap-1 text-xs font-semibold text-[#755B4C] hover:text-[#2E527F] px-2 py-1 rounded-lg hover:bg-[#E4D8C9]" title="Reset password">
                      <KeyRound className="h-3.5 w-3.5" /> Password
                    </button>
                    <button onClick={() => setEditingId(u.user_id)} className="flex items-center gap-1 text-xs font-semibold text-[#755B4C] hover:text-[#2E527F] px-2 py-1 rounded-lg hover:bg-[#E4D8C9]" title="Edit">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#755B4C] cursor-pointer select-none ml-2">
                      <input type="checkbox" checked={u.is_active} onChange={() => toggleActive(u)} />
                      Active
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddUserForm
          apiUrl={apiUrl}
          authConfig={authConfig}
          onCancel={() => setShowAdd(false)}
          onCreated={(u) => { setUsers((prev) => [...prev, u]); setShowAdd(false) }}
        />
      )}
    </main>
  )
}

function AddUserForm({ apiUrl, authConfig, onCancel, onCreated }: { apiUrl: string; authConfig: any; onCancel: () => void; onCreated: (u: StaffUser) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [department, setDepartment] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!email.trim() || !displayName.trim() || password.length < 8) {
      setError('Name, email, and a password of at least 8 characters are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await axios.post(`${apiUrl}/api/admin/users`, {
        email: email.trim(),
        display_name: displayName.trim(),
        department: department.trim() || null,
        password,
      }, authConfig)
      onCreated(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#4B2B1D]">Add team member</h2>
          <button onClick={onCancel} className="text-[#2E527F] hover:text-[#4B2B1D]"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="rounded-lg border border-[#E8B4B9] bg-[#FFF4F5] text-[#D62F3D] px-3 py-2 text-sm">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-[#755B4C] mb-1">Name</label>
          <input className={INPUT_CLASS} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Xavier" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#755B4C] mb-1">Email</label>
          <input className={INPUT_CLASS} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="xavier@fit4sure.food" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#755B4C] mb-1">Department (optional)</label>
          <input className={INPUT_CLASS} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Operations" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#755B4C] mb-1">Temporary password</label>
          <input className={INPUT_CLASS} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-[#2E527F] text-[#755B4C] font-semibold" disabled={saving}>Cancel</button>
          <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#2E527F] text-white font-semibold hover:bg-[#24466E]" disabled={saving}>
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditUserForm({ user, apiUrl, authConfig, onCancel, onSaved }: { user: StaffUser; apiUrl: string; authConfig: any; onCancel: () => void; onSaved: (u: StaffUser) => void }) {
  const [displayName, setDisplayName] = useState(user.display_name)
  const [department, setDepartment] = useState(user.department || '')
  const [status, setStatus] = useState(user.status)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await axios.patch(`${apiUrl}/api/admin/users/${user.user_id}`, {
        display_name: displayName.trim(),
        department: department.trim() || null,
        status,
      }, authConfig)
      onSaved(res.data.data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <input className={`${INPUT_CLASS} flex-1 min-w-[140px]`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className={`${INPUT_CLASS} flex-1 min-w-[140px]`} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
        <select className={INPUT_CLASS} style={{ width: 130 }} value={status} onChange={(e) => setStatus(e.target.value as StaffUser['status'])}>
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="off">Off</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-[#2E527F] text-[#755B4C] text-sm font-semibold" disabled={saving}>Cancel</button>
        <button onClick={save} className="px-3 py-1.5 rounded-lg bg-[#2E527F] text-white text-sm font-semibold hover:bg-[#24466E]" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ResetPasswordForm({ user, isSelf, apiUrl, authConfig, onCancel, onDone }: {
  user: StaffUser
  isSelf: boolean
  apiUrl: string
  authConfig: any
  onCancel: () => void
  onDone: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    if (isSelf && !currentPassword) { setError('Enter your current password'); return }
    setSaving(true)
    setError(null)
    try {
      await axios.patch(`${apiUrl}/api/admin/users/${user.user_id}/password`, {
        current_password: isSelf ? currentPassword : undefined,
        new_password: newPassword,
      }, authConfig)
      onDone()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold text-[#4B2B1D]">{isSelf ? 'Change your password' : `Reset ${user.display_name}'s password`}</div>
      {error && <div className="rounded-lg border border-[#E8B4B9] bg-[#FFF4F5] text-[#D62F3D] px-3 py-2 text-xs">{error}</div>}
      <div className="flex gap-2 flex-wrap">
        {isSelf && (
          <input className={`${INPUT_CLASS} flex-1 min-w-[140px]`} type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        )}
        <input className={`${INPUT_CLASS} flex-1 min-w-[140px]`} type="password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-[#2E527F] text-[#755B4C] text-sm font-semibold" disabled={saving}>Cancel</button>
        <button onClick={submit} className="px-3 py-1.5 rounded-lg bg-[#2E527F] text-white text-sm font-semibold hover:bg-[#24466E]" disabled={saving}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </div>
  )
}
