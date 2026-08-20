import React, { useMemo, useState } from 'react'
import type { Task, Tag, Urgency, StaffUser } from './types'
import { COLORS, TAG_LABELS } from './ui'
import { dueBucketForTask, tagProgress } from './selectors'
import { TaskRow } from './TaskRow'
import { AddTaskForm } from './AddTaskForm'
import * as api from './api'

const TAGS: Tag[] = ['operations', 'admin', 'marketing', 'sales']

function selectCls() {
  return 'text-[13px] px-[10px] py-[7px] rounded-xl border font-[inherit]'
}

export function ListView({ tasks, today, investor, roster, currentUserId, onChanged, onDeleted, onCreated }: {
  tasks: Task[]
  today: Date
  investor: boolean
  roster: StaffUser[]
  currentUserId?: number
  onChanged: (t: Task) => void
  onDeleted: (id: number) => void
  onCreated: (t: Task) => void
}) {
  const [search, setSearch] = useState('')
  const [fOwner, setFOwner] = useState('')
  const [fUrgency, setFUrgency] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fDue, setFDue] = useState('')
  const [sort, setSort] = useState('')
  const [addingTag, setAddingTag] = useState<Tag | null>(null)

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const statusVal = t.needs_decision && fStatus === 'needs-decision' ? 'needs-decision' : t.status
      const dueBucket = dueBucketForTask(t, today)
      if (fOwner && String(t.owner_id) !== fOwner) return false
      if (fUrgency && t.urgency !== fUrgency) return false
      if (fStatus && statusVal !== fStatus && !(fStatus === 'needs-decision' && t.needs_decision)) return false
      if (fDue && dueBucket !== fDue) return false
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [tasks, fOwner, fUrgency, fStatus, fDue, search, today])

  const clear = () => { setFOwner(''); setFUrgency(''); setFStatus(''); setFDue(''); setSearch('') }

  const createTask = async (tag: Tag, data: { name: string; owner_id: number; tag: Tag; urgency: Urgency; due_date: string }) => {
    const task = await api.createTask(data)
    onCreated(task)
    setAddingTag(null)
  }

  return (
    <div>
      {!investor && (
        <>
          <div className="flex gap-2 mb-2 flex-wrap">
            <input
              type="search"
              placeholder="Search tasks..."
              className="text-[13px] px-[10px] py-[7px] rounded-xl border flex-1 min-w-[160px] box-border"
              style={{ borderColor: COLORS.cardBorder }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <select className={selectCls()} style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
              <option value="">Owner: all</option>
              {roster.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}
            </select>
            <select className={selectCls()} style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={fUrgency} onChange={(e) => setFUrgency(e.target.value)}>
              <option value="">Urgency: all</option>
              <option value="critical">Critical</option>
              <option value="workon">To work on</option>
              <option value="eventually">Eventually</option>
            </select>
            <select className={selectCls()} style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Status: all</option>
              <option value="done">Done</option>
              <option value="open">Open</option>
              <option value="needs-decision">Needs decision</option>
            </select>
            <select className={selectCls()} style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={fDue} onChange={(e) => setFDue(e.target.value)}>
              <option value="">Due: all</option>
              <option value="overdue">Overdue</option>
              <option value="thisweek">This week</option>
              <option value="later">Later</option>
              <option value="done">Done</option>
            </select>
            <select className={selectCls()} style={{ borderColor: COLORS.cardBorder, background: COLORS.cardBg, color: COLORS.textSecondary }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="">Sort: default</option>
              <option value="due">Due date</option>
              <option value="cost">Cost (high to low)</option>
            </select>
            <div className="text-[13px] px-[10px] py-[7px] cursor-pointer" style={{ color: COLORS.textMuted }} onClick={clear}>Clear</div>
          </div>

          <div className="flex items-center gap-[10px] px-[14px] pb-[14px] mt-1 text-[10.5px] uppercase tracking-wide" style={{ color: '#B9A88F' }}>
            <span className="w-[14px]" />
            <span className="w-[16px]" />
            <span className="flex-1">Task</span>
            <span className="w-[74px] text-center">Tag</span>
            <span className="w-[60px]">Assignee</span>
            <span className="w-[100px]">Due date</span>
            <span className="w-[76px] text-right">Cost</span>
            <span className="w-[21px]" />
          </div>
        </>
      )}

      {TAGS.map((tag) => {
        const tagTasks = filtered.filter((t) => t.tag === tag)
        const filtersActive = fOwner || fUrgency || fStatus || fDue || search
        if (!investor && tagTasks.length === 0 && filtersActive && addingTag !== tag) return null

        const sorted = [...tagTasks].sort((a, b) => {
          if (sort === 'due') return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          if (sort === 'cost') return b.budget_cents - a.budget_cents
          return 0
        })
        const progress = tagProgress(tasks, tag)
        const defaultDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

        return (
          <div key={tag}>
            <div className="text-[13px] font-semibold mt-5 mb-2 flex items-center gap-[10px]" style={{ color: COLORS.textSecondary }}>
              {TAG_LABELS[tag]}
              {investor && (
                <>
                  <div className="flex-1 h-[5px] rounded max-w-[160px] overflow-hidden" style={{ background: '#e8e6e0' }}>
                    <div className="h-full" style={{ width: `${progress.pct}%`, background: COLORS.green }} />
                  </div>
                  <span className="text-[11px] font-normal" style={{ color: '#B9A88F' }}>{progress.done} of {progress.total} done</span>
                </>
              )}
            </div>

            {sorted.map((task) => (
              <TaskRow key={task.id} task={task} today={today} investor={investor} roster={roster} onChanged={onChanged} onDeleted={onDeleted} />
            ))}

            {!investor && (
              addingTag === tag ? (
                <AddTaskForm
                  defaultDueDate={defaultDateStr}
                  defaultTag={tag}
                  roster={roster}
                  defaultOwnerId={currentUserId}
                  onSubmit={(data) => createTask(tag, data)}
                  onCancel={() => setAddingTag(null)}
                />
              ) : (
                <div
                  className="flex items-center gap-[10px] px-[14px] py-3 border border-dashed rounded-2xl text-[14px] cursor-pointer"
                  style={{ borderColor: COLORS.cardBorder, color: COLORS.textMuted }}
                  onClick={() => setAddingTag(tag)}
                >
                  <span className="text-[15px] w-[14px] text-center">+</span> Add task
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
