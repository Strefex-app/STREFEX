import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useProjectStore } from '../store/projectStore'
import { useAuthStore } from '../store/authStore'
import { useLimit } from '../services/featureFlags'
/* jspdf & html2canvas loaded dynamically only when exporting PDF */
import '../styles/app-page.css'
import './ProgramManagement.css'
import './ProjectManagement.css'

/* ═══════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════ */
const DAY_W = 32                // pixels per day column
const ROW_H = 34                // pixels per task row
const HANDLE_W = 6              // drag handle width (px)
const PROJECT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
const STATUS_COLORS = { complete: '#27ae60', 'in-progress': '#2563eb', 'not-started': '#94a3b8' }
const DEP_LABELS = { FS: 'Finish → Start', SS: 'Start → Start' }
const MS_PER_DAY = 24 * 60 * 60 * 1000

/* ═══════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════ */
function flattenTasks(tasks) {
  const out = []
  ;(tasks || []).forEach((t) => { out.push(t); if (t.children?.length) out.push(...flattenTasks(t.children)) })
  return out
}
function getInitials(name) {
  if (!name?.trim()) return '—'
  return name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}
function fmtShortDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`
}
function fmtMonthYear(d) {
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

/* ═══════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════ */
const ProjectManagement = () => {
  const navigate = useNavigate()
  const ganttRef = useRef(null)
  const fitWrapRef = useRef(null)
  const taskListRef = useRef(null)
  const timelineRef = useRef(null)
  const dragRef = useRef(null)
  const storeProjects = useProjectStore((s) => s.projects)
  const _addProject = useProjectStore((s) => s.addProject)
  const updateProject = useProjectStore((s) => s.updateProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const addTask = useProjectStore((s) => s.addTask)
  const updateTask = useProjectStore((s) => s.updateTask)
  const deleteTask = useProjectStore((s) => s.deleteTask)
  const addResource = useProjectStore((s) => s.addResource)
  const removeResource = useProjectStore((s) => s.removeResource)
  const saveRevision = useProjectStore((s) => s.saveRevision)
  const deleteRevision = useProjectStore((s) => s.deleteRevision)
  const setBaseline = useProjectStore((s) => s.setBaseline)
  const restoreRevision = useProjectStore((s) => s.restoreRevision)
  const getProjectStats = useProjectStore((s) => s.getProjectStats)
  const calcDuration = useProjectStore((s) => s.calcDuration)
  const calcEndDate = useProjectStore((s) => s.calcEndDate)
  const addDays = useProjectStore((s) => s.addDays)

  const currentUser = useAuthStore((s) => s.user)
  const currentEmail = currentUser?.email || ''
  const projects = useMemo(() => (storeProjects || []).filter((p) => !p.createdBy || p.createdBy === currentEmail), [storeProjects, currentEmail])
  const addProject = (data) => _addProject({ ...data, createdBy: currentEmail })
  const projectLimit = useLimit('maxProjects', projects.length)

  /* ── UI State ─────────────────────────────────────── */
  const [view, setView] = useState('timeline')
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [taskListOpen, setTaskListOpen] = useState(true)
  const [expandedPhases, setExpandedPhases] = useState({ t4: true })

  const [showFilter, setShowFilter] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')

  const [showAddProject, setShowAddProject] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showEditTask, setShowEditTask] = useState(null)
  const [showRevisions, setShowRevisions] = useState(false)
  const [showResources, setShowResources] = useState(false)
  const [showBaseline, setShowBaseline] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [newResourceName, setNewResourceName] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [editTaskProjectId, setEditTaskProjectId] = useState(null)
  const [fitState, setFitState] = useState(null) // null = normal, { scale, contentW, contentH } = fitted
  const [, forceRender] = useState(0)

  /* Predecessor selector state (controlled — avoids DOM getElementById bugs) */
  const [newPredTask, setNewPredTask] = useState('')
  const [newPredType, setNewPredType] = useState('FS')
  const [editPredTask, setEditPredTask] = useState('')
  const [editPredType, setEditPredType] = useState('FS')

  const [newProject, setNewProject] = useState({ name: '', budget: '', currency: 'USD' })
  const [newTask, setNewTask] = useState({ name: '', startDate: '', duration: '', assignee: '', cost: '', predecessors: [] })
  const [editTask, setEditTask] = useState({})

  const selectedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : null
  const stats = selectedProjectId ? getProjectStats(selectedProjectId) : null

  /* ── Flatten tasks for display ───────────────────── */
  const allTasksFlat = useMemo(() => {
    const proj = selectedProject || projects[0]
    if (!proj) return []
    const rows = []
    ;(proj.tasks || []).forEach((t) => {
      if (t.children?.length) {
        rows.push({ ...t, _isPhase: true })
        if (expandedPhases[t.id]) {
          t.children.forEach((c) => rows.push({ ...c, _isChild: true }))
        }
      } else {
        rows.push(t)
      }
    })
    let list = rows
    if (filterStatus) list = list.filter((t) => t.status === filterStatus)
    if (filterAssignee) list = list.filter((t) => t.assignee === filterAssignee)
    return list
  }, [selectedProject, projects, expandedPhases, filterStatus, filterAssignee])

  const taskRowMap = useMemo(() => {
    const map = {}
    allTasksFlat.forEach((t, i) => { map[t.id] = i })
    return map
  }, [allTasksFlat])

  const assignees = useMemo(() => {
    const set = new Set()
    allTasksFlat.forEach((t) => t.assignee && set.add(t.assignee))
    return [...set].sort()
  }, [allTasksFlat])

  /* ── Date range for timeline ─────────────────────── */
  const dateRange = useMemo(() => {
    let min = null, max = null
    allTasksFlat.forEach((t) => {
      ;[t.startDate, t.endDate, t.baselineStart, t.baselineEnd].filter(Boolean).forEach((d) => {
        if (!min || d < min) min = d
        if (!max || d > max) max = d
      })
    })
    if (!min) min = new Date().toISOString().slice(0, 10)
    if (!max) max = min
    // Add padding
    const s = new Date(min); s.setDate(s.getDate() - 3)
    const e = new Date(max); e.setDate(e.getDate() + 10)
    return { min: s.toISOString().slice(0, 10), max: e.toISOString().slice(0, 10), minMs: s.getTime(), maxMs: e.getTime() }
  }, [allTasksFlat])

  const days = useMemo(() => {
    const d = []; const s = new Date(dateRange.min); const e = new Date(dateRange.max)
    for (let t = new Date(s); t <= e; t.setDate(t.getDate() + 1)) d.push(new Date(t))
    return d
  }, [dateRange.min, dateRange.max])

  const timelineWidth = days.length * DAY_W

  /* ── Pixel helpers ───────────────────────────────── */
  const dateToPx = useCallback((dateStr) => {
    if (!dateStr) return 0
    return Math.round(((new Date(dateStr).getTime() - dateRange.minMs) / MS_PER_DAY) * DAY_W)
  }, [dateRange.minMs])

  const pxToDate = useCallback((px) => {
    const ms = dateRange.minMs + (px / DAY_W) * MS_PER_DAY
    return new Date(ms).toISOString().slice(0, 10)
  }, [dateRange.minMs])

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayPx = dateToPx(todayStr)

  /* ── Month headers ───────────────────────────────── */
  const monthHeaders = useMemo(() => {
    const months = []; let cur = null
    days.forEach((d, i) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (key !== cur) { months.push({ label: fmtMonthYear(d), startIdx: i, days: 1 }); cur = key }
      else months[months.length - 1].days++
    })
    return months
  }, [days])

  /* ── Scroll sync ─────────────────────────────────── */
  const syncScroll = useCallback((src) => {
    if (src === 'tasks' && taskListRef.current && timelineRef.current) {
      timelineRef.current.scrollTop = taskListRef.current.scrollTop
    } else if (src === 'timeline' && taskListRef.current && timelineRef.current) {
      taskListRef.current.scrollTop = timelineRef.current.scrollTop
    }
  }, [])

  /* ═══════════════════════════════════════════════════
   *  DRAG & RESIZE — via ref + force-render
   * ═══════════════════════════════════════════════════ */
  const handleBarMouseDown = useCallback((e, task, projectId, mode) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      taskId: task.id, projectId, mode,
      startX: e.clientX,
      origStartDate: task.startDate,
      origEndDate: task.endDate,
      dx: 0,
    }
    forceRender((n) => n + 1)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      dragRef.current.dx = e.clientX - dragRef.current.startX
      forceRender((n) => n + 1)
    }
    const onUp = () => {
      if (!dragRef.current) return
      const dr = dragRef.current
      const daysDelta = Math.round(dr.dx / DAY_W)
      const pid = dr.projectId
      if (daysDelta !== 0) {
        if (dr.mode === 'move') {
          updateTask(pid, dr.taskId, { startDate: addDays(dr.origStartDate, daysDelta), endDate: addDays(dr.origEndDate, daysDelta) })
        } else if (dr.mode === 'resize-end') {
          const newEnd = addDays(dr.origEndDate, daysDelta)
          if (newEnd >= dr.origStartDate) updateTask(pid, dr.taskId, { endDate: newEnd })
        } else if (dr.mode === 'resize-start') {
          const newStart = addDays(dr.origStartDate, daysDelta)
          if (newStart <= dr.origEndDate) updateTask(pid, dr.taskId, { startDate: newStart })
        }
      }
      dragRef.current = null
      forceRender((n) => n + 1)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [updateTask, addDays])

  /* ── Dependency arrow paths (SVG) ────────────────── */
  const arrowPaths = useMemo(() => {
    const paths = []
    allTasksFlat.forEach((task) => {
      ;(task.predecessors || []).forEach((dep) => {
        const fromIdx = taskRowMap[dep.taskId]
        const toIdx = taskRowMap[task.id]
        if (fromIdx == null || toIdx == null) return
        const pred = allTasksFlat[fromIdx]
        if (!pred) return

        const fromLeft = dateToPx(pred.startDate)
        const fromRight = dateToPx(pred.endDate) + DAY_W
        const toLeft = dateToPx(task.startDate)
        const fromY = fromIdx * ROW_H + ROW_H / 2
        const toY = toIdx * ROW_H + ROW_H / 2
        const pad = 10

        let d
        if (dep.type === 'FS') {
          const midX = fromRight + pad
          if (toLeft > fromRight + pad * 2) {
            d = `M${fromRight},${fromY} L${midX},${fromY} L${midX},${toY} L${toLeft},${toY}`
          } else {
            const downY = Math.max(fromY, toY) + ROW_H * 0.6
            d = `M${fromRight},${fromY} L${midX},${fromY} L${midX},${downY} L${toLeft - pad},${downY} L${toLeft - pad},${toY} L${toLeft},${toY}`
          }
        } else {
          const midX = Math.min(fromLeft, toLeft) - pad
          d = `M${fromLeft},${fromY} L${midX},${fromY} L${midX},${toY} L${toLeft},${toY}`
        }
        paths.push({ d, type: dep.type, key: `${dep.taskId}-${task.id}` })
      })
    })
    return paths
  }, [allTasksFlat, taskRowMap, dateToPx])

  /* ── Get predecessor label for task table ─────────── */
  const getPredLabel = (task) => {
    if (!task.predecessors?.length) return '—'
    return task.predecessors.map((p) => {
      const idx = allTasksFlat.findIndex((t) => t.id === p.taskId)
      return idx >= 0 ? `${idx + 1}${p.type}` : p.type
    }).join(', ')
  }

  /* ═══════════════════════════════════════════════════
   *  HANDLERS
   * ═══════════════════════════════════════════════════ */
  const handleAddProject = () => {
    if (!newProject.name.trim()) return
    if (!projectLimit.allowed) return
    const id = addProject({ name: newProject.name.trim(), budget: parseFloat(newProject.budget) || 0, currency: newProject.currency })
    setSelectedProjectId(id)
    setNewProject({ name: '', budget: '', currency: 'USD' })
    setShowAddProject(false)
  }

  const handleDeleteProject = (projectId) => {
    const pid = projectId || selectedProjectId
    if (!pid) return
    const proj = projects.find((p) => p.id === pid)
    if (!proj || !window.confirm(`Delete project "${proj.name}" and all its tasks?`)) return
    deleteProject(pid)
    const next = projects.filter((p) => p.id !== pid)
    if (selectedProjectId === pid) setSelectedProjectId(next[0]?.id || null)
  }

  const handleAddTask = () => {
    const pid = selectedProjectId || projects[0]?.id
    if (!newTask.name.trim() || !pid) return
    const startDate = newTask.startDate || new Date().toISOString().slice(0, 10)
    const dur = parseInt(newTask.duration) || 1
    addTask(pid, {
      name: newTask.name.trim(), startDate,
      endDate: calcEndDate(startDate, dur),
      assignee: newTask.assignee, cost: parseFloat(newTask.cost) || 0,
      predecessors: newTask.predecessors || [],
    })
    setNewTask({ name: '', startDate: '', duration: '', assignee: '', cost: '', predecessors: [] })
    setShowAddTask(false)
  }

  const handleEditTaskOpen = (task, projectId) => {
    setEditTask({
      ...task,
      duration: calcDuration(task.startDate, task.endDate),
      predecessors: task.predecessors || [],
    })
    setEditPredTask('')
    setEditPredType('FS')
    setShowEditTask(task.id)
    setEditTaskProjectId(projectId ?? selectedProjectId)
  }

  const handleEditTaskSave = () => {
    const pid = editTaskProjectId ?? selectedProjectId
    if (!showEditTask || !pid) return
    const dur = parseInt(editTask.duration) || calcDuration(editTask.startDate, editTask.endDate)
    updateTask(pid, showEditTask, {
      name: editTask.name,
      startDate: editTask.startDate,
      endDate: calcEndDate(editTask.startDate, dur),
      progressPercent: parseInt(editTask.progressPercent) || 0,
      assignee: editTask.assignee,
      cost: parseFloat(editTask.cost) || 0,
      predecessors: editTask.predecessors || [],
    })
    setShowEditTask(null)
    setEditTask({})
    setEditTaskProjectId(null)
  }

  const handleDeleteTask = (taskId) => {
    const pid = contextMenu?.projectId ?? selectedProjectId
    if (!pid || !window.confirm('Delete this task?')) return
    deleteTask(pid, taskId)
    setContextMenu(null)
  }

  const handleContextMenu = (e, task, projectId) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, task, projectId: projectId ?? selectedProjectId })
  }

  /* ── PDF Export — platform-styled, logo image, full project fit-to-screen ─── */
  const handleExportPDF = async () => {
    if (!ganttRef.current) return
    try {
      /* Always reset fit for clean capture */
      const wasFitted = !!fitState
      if (wasFitted) setFitState(null)
      await new Promise((r) => setTimeout(r, 150))

      /* ── Temporarily expand all elements to full content size ── */
      const el = ganttRef.current
      const timeline = timelineRef.current
      const tasklist = taskListRef.current
      const fitWrap = fitWrapRef.current

      /* Save original styles */
      const saved = []
      const expand = (node, styles) => {
        if (!node) return
        const orig = {}
        Object.keys(styles).forEach((k) => { orig[k] = node.style[k]; node.style[k] = styles[k] })
        saved.push({ node, orig })
      }

      /* Expand: remove all overflow clipping, set explicit full dimensions */
      const fullTimelineW = timeline ? timeline.scrollWidth : timelineWidth
      const fullTimelineH = timeline ? timeline.scrollHeight : allTasksFlat.length * ROW_H + 60
      const taskListW = tasklist ? tasklist.offsetWidth : 420
      const fullW = taskListW + 28 + fullTimelineW
      const fullH = Math.max(fullTimelineH, tasklist ? tasklist.scrollHeight : fullTimelineH)

      expand(fitWrap, { overflow: 'visible', width: fullW + 'px', height: fullH + 'px', maxHeight: 'none' })
      expand(el, { overflow: 'visible', width: fullW + 'px', height: fullH + 'px', maxHeight: 'none', flex: 'none' })
      expand(timeline, { overflow: 'visible', width: fullTimelineW + 'px', height: fullTimelineH + 'px', maxHeight: 'none', flex: 'none' })
      expand(tasklist, { overflow: 'visible', height: fullH + 'px', maxHeight: 'none' })

      await new Promise((r) => setTimeout(r, 100)) // let layout settle

      /* Capture the fully expanded content */
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true,
        width: el.scrollWidth || fullW,
        height: el.scrollHeight || fullH,
        windowWidth: el.scrollWidth || fullW,
        windowHeight: el.scrollHeight || fullH,
        scrollX: 0, scrollY: 0,
        x: 0, y: 0,
      })

      /* Restore all original styles */
      saved.forEach(({ node, orig }) => {
        Object.keys(orig).forEach((k) => { node.style[k] = orig[k] })
      })

      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF('l', 'mm', 'a4')
      const w = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()

      /* ═══ HEADER — Platform-styled dark banner ═══ */
      const headerH = 18
      /* Dark gradient band (matches platform: #000222 → #000888) */
      pdf.setFillColor(0, 2, 34)
      pdf.rect(0, 0, w * 0.5, headerH, 'F')
      pdf.setFillColor(0, 8, 136)
      pdf.rect(w * 0.5, 0, w * 0.5, headerH, 'F')
      /* Overlay gradient effect with semi-transparent steps */
      for (let i = 0; i < 20; i++) {
        const r = Math.round(0 + (0 - 0) * (i / 20))
        const g = Math.round(2 + (8 - 2) * (i / 20))
        const b = Math.round(34 + (136 - 34) * (i / 20))
        pdf.setFillColor(r, g, b)
        pdf.rect((w / 20) * i, 0, w / 20 + 0.5, headerH, 'F')
      }

      /* Logo image — strip black background, keep white text */
      try {
        const logoImg = new Image()
        logoImg.crossOrigin = 'anonymous'
        logoImg.src = '/assets/strefex-logo.png'
        await new Promise((res, rej) => { logoImg.onload = res; logoImg.onerror = rej; setTimeout(rej, 3000) })
        const lc = document.createElement('canvas')
        lc.width = logoImg.width; lc.height = logoImg.height
        const ctx = lc.getContext('2d')
        ctx.drawImage(logoImg, 0, 0)
        const imgData = ctx.getImageData(0, 0, lc.width, lc.height)
        const px = imgData.data
        for (let i = 0; i < px.length; i += 4) {
          const brightness = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
          if (brightness < 60) { px[i + 3] = 0 }
          else { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = Math.round(brightness / 255 * 255) }
        }
        ctx.putImageData(imgData, 0, 0)
        const logoData = lc.toDataURL('image/png')
        const logoH = 10
        const logoW = (logoImg.width / logoImg.height) * logoH
        pdf.addImage(logoData, 'PNG', 8, (headerH - logoH) / 2, logoW, logoH)
      } catch {
        /* Fallback: text logo if image unavailable */
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(14)
        pdf.setTextColor(255, 255, 255)
        pdf.text('STREFEX', 10, headerH / 2 + 2)
      }

      /* Project name — centered on banner (white) */
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.setTextColor(255, 255, 255)
      pdf.text(selectedProject?.name || 'Project Timeline', w / 2, headerH / 2 + 2, { align: 'center' })

      /* Date of print — right side on banner (light) */
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(180, 190, 220)
      pdf.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), w - 10, headerH / 2 + 2, { align: 'right' })

      /* ═══ SUBTITLE BAR — stats row ═══ */
      const subY = headerH
      const subH = 7
      pdf.setFillColor(244, 246, 249)
      pdf.rect(0, subY, w, subH, 'F')
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(100, 100, 120)
      if (stats && selectedProject) {
        const statsText = `Tasks: ${stats.totalTasks}  |  Done: ${stats.completedTasks}  |  Progress: ${stats.avgProgress}%  |  Budget: ${selectedProject.currency} ${stats.budget.toLocaleString()}  |  Spent: ${selectedProject.currency} ${stats.totalCost.toLocaleString()}`
        pdf.text(statsText, 10, subY + subH / 2 + 1)
      }

      /* ═══ GANTT IMAGE — full project scaled to fit page ═══ */
      const contentTop = subY + subH + 2
      const contentAvailH = pageH - contentTop - 14 // reserve footer space
      const contentAvailW = w - 16
      const imgRatio = canvas.height / canvas.width
      let imgW = contentAvailW
      let imgH = imgW * imgRatio
      if (imgH > contentAvailH) {
        imgH = contentAvailH
        imgW = imgH / imgRatio
      }
      const imgX = 8 + (contentAvailW - imgW) / 2 // center horizontally
      /* Light border around chart */
      pdf.setDrawColor(220, 225, 235)
      pdf.setLineWidth(0.3)
      pdf.roundedRect(imgX - 1, contentTop - 1, imgW + 2, imgH + 2, 1, 1, 'S')
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, contentTop, imgW, imgH)

      /* ═══ FOOTER — Platform-styled dark footer bar ═══ */
      const footerH = 8
      const footerY = pageH - footerH
      /* Dark footer band */
      for (let i = 0; i < 20; i++) {
        const r = Math.round(0 + (0 - 0) * (i / 20))
        const g = Math.round(8 + (2 - 8) * (i / 20))
        const b = Math.round(136 + (34 - 136) * (i / 20))
        pdf.setFillColor(r, g, b)
        pdf.rect((w / 20) * i, footerY, w / 20 + 0.5, footerH, 'F')
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)

      /* Left: Who printed */
      const userName = currentUser?.name || currentUser?.companyName || currentEmail || 'Unknown'
      pdf.setTextColor(180, 190, 220)
      pdf.text(`Printed by: ${userName}`, 10, footerY + footerH / 2 + 1)

      /* Center: confidential */
      pdf.setTextColor(140, 150, 180)
      pdf.text('STREFEX Platform — Confidential', w / 2, footerY + footerH / 2 + 1, { align: 'center' })

      /* Right: page */
      pdf.setTextColor(180, 190, 220)
      pdf.text('Page 1 of 1', w - 10, footerY + footerH / 2 + 1, { align: 'right' })

      pdf.save(`${selectedProject?.name || 'project'}-gantt.pdf`)

      /* Restore fit if was active */
      if (wasFitted) setTimeout(() => handleFitToggle(), 200)
    } catch (err) { console.error('PDF export:', err) }
  }

  /* ── Fit-to-Screen toggle — shrink everything to one window ─── */
  const handleFitToggle = useCallback(() => {
    if (fitState) {
      setFitState(null)
      return
    }
    const gantt = ganttRef.current
    const timeline = timelineRef.current
    if (!gantt || !timeline) return

    /* Available space from parent wrapper */
    const wrap = fitWrapRef.current || gantt.parentElement
    const availW = wrap?.clientWidth || gantt.clientWidth
    const availH = wrap?.clientHeight || gantt.clientHeight

    /* Full content dimensions */
    const taskListW = taskListRef.current?.offsetWidth || 0
    const fullW = taskListW + 28 + timeline.scrollWidth
    const fullH = Math.max(timeline.scrollHeight, gantt.scrollHeight)

    if (fullW <= availW && fullH <= availH) return // already fits

    const sx = availW / fullW
    const sy = availH / fullH
    setFitState({ scale: Math.min(sx, sy, 1), contentW: fullW, contentH: fullH })
  }, [fitState])

  const togglePhase = (id) => setExpandedPhases((p) => ({ ...p, [id]: !p[id] }))
  const handleCloseContextMenu = () => setContextMenu(null)

  /* ═══════════════════════════════════════════════════
   *  RENDER — Gantt Bar
   * ═══════════════════════════════════════════════════ */
  const renderGanttBar = (task, rowIdx, projectId, color) => {
    const dr = dragRef.current
    const isDragging = dr && dr.taskId === task.id
    let left = dateToPx(task.startDate)
    let width = Math.max(DAY_W, dateToPx(task.endDate) - dateToPx(task.startDate) + DAY_W)

    if (isDragging) {
      const dx = dr.dx || 0
      if (dr.mode === 'move') { left += dx }
      else if (dr.mode === 'resize-end') { width = Math.max(DAY_W, width + dx) }
      else if (dr.mode === 'resize-start') { left += dx; width = Math.max(DAY_W, width - dx) }
    }

    const pct = task.progressPercent ?? 0
    const barColor = STATUS_COLORS[task.status] || color
    const isPhase = task._isPhase
    const pid = projectId || selectedProjectId

    return (
      <div
        key={task.id}
        className={`gc-bar-row ${isDragging ? 'gc-dragging' : ''}`}
        style={{ top: rowIdx * ROW_H, height: ROW_H }}
        onContextMenu={(e) => handleContextMenu(e, task, pid)}
        onDoubleClick={() => handleEditTaskOpen(task, pid)}
      >
        {/* Baseline ghost */}
        {showBaseline && task.baselineStart && task.baselineEnd && (
          <div
            className="gc-bar-baseline"
            style={{ left: dateToPx(task.baselineStart), width: Math.max(DAY_W, dateToPx(task.baselineEnd) - dateToPx(task.baselineStart) + DAY_W) }}
          />
        )}
        {/* Main bar */}
        <div
          className={`gc-bar ${isPhase ? 'gc-bar-phase' : ''} ${isDragging ? 'gc-bar-active' : ''}`}
          style={{ left, width }}
        >
          {/* Left resize handle */}
          <div className="gc-bar-handle gc-bar-handle-l" onMouseDown={(e) => handleBarMouseDown(e, task, pid, 'resize-start')} />
          {/* Bar body — drag to move */}
          <div className="gc-bar-body" onMouseDown={(e) => handleBarMouseDown(e, task, pid, 'move')} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
            <div className="gc-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
            <div className="gc-bar-remaining" style={{ width: `${100 - pct}%` }} />
          </div>
          {/* Right resize handle */}
          <div className="gc-bar-handle gc-bar-handle-r" onMouseDown={(e) => handleBarMouseDown(e, task, pid, 'resize-end')} />
          {/* Label */}
          <span className="gc-bar-label">{pct > 0 ? `${pct}%` : ''}</span>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════
   *  RENDER — Main
   * ═══════════════════════════════════════════════════ */
  const pid = selectedProjectId || projects[0]?.id
  const projColor = PROJECT_COLORS[(projects.findIndex((p) => p.id === pid) || 0) % PROJECT_COLORS.length]

  return (
    <AppLayout>
      <div className="gc-page" onClick={handleCloseContextMenu}>
        {/* ── Compact Top Bar ──────────────────────────── */}
        <div className="gc-topbar">
          <div className="gc-topbar-left">
            <button className="gc-back" onClick={() => navigate(-1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            </button>
            <h1 className="gc-title">Project Management</h1>
            <div className="gc-view-tabs">
              <button className={`gc-vtab ${view === 'timeline' ? 'active' : ''}`} onClick={() => setView('timeline')}>Gantt Chart</button>
              <button className={`gc-vtab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>Table</button>
            </div>
          </div>
          <div className="gc-topbar-actions">
            <button className="gc-btn-sm" onClick={() => setShowFilter(!showFilter)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filter
            </button>
            <button className="gc-btn-sm" onClick={handleExportPDF}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-5l5 5 5-5m-5 5V3"/></svg>
              PDF
            </button>
            <button className={`gc-btn-sm ${fitState ? 'gc-btn-active' : ''}`} onClick={handleFitToggle} title={fitState ? 'Reset zoom to normal' : 'Fit entire project in one screen'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {fitState
                  ? <><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></>
                  : <><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></>
                }
              </svg>
              {fitState ? 'Reset Zoom' : 'Fit to Screen'}
            </button>
            {selectedProjectId && (
              <>
                <button className="gc-btn-sm" onClick={() => setShowRevisions(true)}>Revisions</button>
                <button className="gc-btn-sm" onClick={() => setShowResources(true)}>Resources</button>
                <button className="gc-btn-sm" onClick={() => { setBaseline(selectedProjectId); setShowBaseline(true) }}>Baseline</button>
                <button className="gc-btn-sm" onClick={() => setShowBaseline(!showBaseline)}>{showBaseline ? 'Hide BL' : 'Show BL'}</button>
              </>
            )}
            <button className="gc-btn-sm gc-btn-outline" onClick={() => projectLimit.allowed ? setShowAddProject(true) : alert(`Project limit reached (${projectLimit.limit}).`)}>
              + Project{projectLimit.limit !== Infinity ? ` (${projectLimit.remaining})` : ''}
            </button>
            <button className="gc-btn-primary" onClick={() => setShowAddTask(true)}>+ New Task</button>
          </div>
        </div>

        {/* ── Filter Row ───────────────────────────────── */}
        {showFilter && (
          <div className="gc-filter-row">
            <label>Status <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="">All</option><option value="not-started">Not Started</option><option value="in-progress">In Progress</option><option value="complete">Complete</option></select></label>
            <label>Assignee <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}><option value="">All</option>{assignees.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          </div>
        )}

        {/* ── Compact Stats ────────────────────────────── */}
        {stats && selectedProject && (
          <div className="gc-stats-bar">
            <div className="gc-stat"><span className="gc-stat-n">{stats.totalTasks}</span> Tasks</div>
            <div className="gc-stat gc-stat-green"><span className="gc-stat-n">{stats.completedTasks}</span> Done</div>
            <div className="gc-stat gc-stat-blue"><span className="gc-stat-n">{stats.avgProgress}%</span> Progress</div>
            <div className="gc-stat"><span className="gc-stat-n">{selectedProject.currency} {stats.budget.toLocaleString()}</span> Budget</div>
            <div className="gc-stat gc-stat-orange"><span className="gc-stat-n">{selectedProject.currency} {stats.totalCost.toLocaleString()}</span> Spent</div>
            <div className={`gc-stat ${stats.budgetRemaining < 0 ? 'gc-stat-red' : 'gc-stat-green'}`}>
              <span className="gc-stat-n">{selectedProject.currency} {stats.budgetRemaining.toLocaleString()}</span> Remaining
            </div>
          </div>
        )}

        {/* ── Body ─────────────────────────────────────── */}
        <div className="gc-body">
          {/* Sidebar */}
          <aside className={`gc-sidebar ${sidebarOpen ? '' : 'gc-sidebar-collapsed'}`}>
            <button className="gc-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarOpen ? <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/> : <path d="M13 5l7 7-7 7M6 5l7 7-7 7"/>}
              </svg>
            </button>
            {sidebarOpen && (
              <>
                <div className="gc-ws-title">
                  Workspaces
                  <span className="gc-ws-badge">{projects.length}{projectLimit.limit !== Infinity ? `/${projectLimit.limit}` : ''}</span>
                </div>
                <button className={`gc-ws-item ${!selectedProjectId ? 'active' : ''}`} onClick={() => setSelectedProjectId(null)}>
                  <span className="gc-ws-dot" style={{ background: '#94a3b8' }} />All Projects
                </button>
                {projects.map((p, i) => (
                  <div key={p.id} className={`gc-ws-item ${selectedProjectId === p.id ? 'active' : ''}`}>
                    <button className="gc-ws-select" onClick={() => setSelectedProjectId(p.id)}>
                      <span className="gc-ws-dot" style={{ background: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                      <span className="gc-ws-name">{p.name}</span>
                      <span className="gc-ws-count">{flattenTasks(p.tasks).length}</span>
                    </button>
                    <button className="gc-ws-del" onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id) }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </>
            )}
          </aside>

          {/* Main Area */}
          <main className="gc-main">
            {view === 'table' && (
              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead><tr><th>#</th><th>Task</th><th>Duration</th><th>Start</th><th>End</th><th>Assignee</th><th>Status</th><th>Progress</th><th>Predecessors</th></tr></thead>
                  <tbody>
                    {allTasksFlat.length === 0 && <tr><td colSpan={9} className="gc-empty">No tasks. Click "+ New Task" to create one.</td></tr>}
                    {allTasksFlat.map((t, i) => (
                      <tr key={t.id} className={t._isPhase ? 'gc-row-phase' : t._isChild ? 'gc-row-child' : ''} onContextMenu={(e) => handleContextMenu(e, t)} onDoubleClick={() => handleEditTaskOpen(t)}>
                        <td className="gc-col-num">{i + 1}</td>
                        <td className="gc-col-name">
                          {t._isPhase && <button className="gc-expand-btn" onClick={() => togglePhase(t.id)}>{expandedPhases[t.id] ? '▼' : '▶'}</button>}
                          {t._isChild && <span className="gc-indent" />}
                          {t.name}
                        </td>
                        <td className="gc-col-dur">{calcDuration(t.startDate, t.endDate)}d</td>
                        <td className="gc-col-date">{fmtShortDate(t.startDate)}</td>
                        <td className="gc-col-date">{fmtShortDate(t.endDate)}</td>
                        <td className="gc-col-assign">{t.assignee || '—'}</td>
                        <td><span className={`gc-status gc-status-${t.status}`}>{t.status === 'complete' ? 'Done' : t.status === 'in-progress' ? 'Active' : 'Pending'}</span></td>
                        <td className="gc-col-pct">{t.progressPercent ?? 0}%</td>
                        <td className="gc-col-pred">{getPredLabel(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'timeline' && (
              <div className={`gc-fit-wrapper ${fitState ? 'gc-fit-active' : ''}`} ref={fitWrapRef}>
                <div
                  className={`gc-gantt ${fitState ? 'gc-gantt-fitted' : ''}`}
                  ref={ganttRef}
                  style={fitState ? {
                    transform: `scale(${fitState.scale})`,
                    transformOrigin: '0 0',
                    width: fitState.contentW,
                    height: fitState.contentH,
                  } : {}}
                >
                  {/* Toggle task list panel */}
                  <button className="gc-tasklist-toggle" onClick={() => setTaskListOpen(!taskListOpen)} title={taskListOpen ? 'Collapse task list' : 'Expand task list'}>
                    {taskListOpen ? '◁' : '▷'}
                  </button>

                {/* Task list (left panel) */}
                {taskListOpen && (
                  <div className="gc-tasklist" ref={taskListRef} onScroll={() => syncScroll('tasks')}>
                    <div className="gc-tl-header">
                      <span className="gc-tl-h-num">#</span>
                      <span className="gc-tl-h-name">Task Name</span>
                      <span className="gc-tl-h-dur">Dur.</span>
                      <span className="gc-tl-h-date">Start</span>
                      <span className="gc-tl-h-date">Finish</span>
                      <span className="gc-tl-h-pred">Pred.</span>
                    </div>
                    <div className="gc-tl-body">
                      {allTasksFlat.map((t, i) => (
                        <div
                          key={t.id}
                          className={`gc-tl-row ${t._isPhase ? 'gc-tl-phase' : ''} ${t._isChild ? 'gc-tl-child' : ''}`}
                          style={{ height: ROW_H }}
                          onDoubleClick={() => handleEditTaskOpen(t)}
                          onContextMenu={(e) => handleContextMenu(e, t)}
                        >
                          <span className="gc-tl-num">{i + 1}</span>
                          <span className="gc-tl-name">
                            {t._isPhase && <button className="gc-expand-btn" onClick={() => togglePhase(t.id)}>{expandedPhases[t.id] ? '▼' : '▶'}</button>}
                            {t._isChild && <span className="gc-indent" />}
                            {t.name}
                          </span>
                          <span className="gc-tl-dur">{calcDuration(t.startDate, t.endDate)}d</span>
                          <span className="gc-tl-date">{fmtShortDate(t.startDate)}</span>
                          <span className="gc-tl-date">{fmtShortDate(t.endDate)}</span>
                          <span className="gc-tl-pred">{getPredLabel(t)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline (right panel) */}
                <div className="gc-timeline" ref={timelineRef} onScroll={() => syncScroll('timeline')}>
                  {/* Month headers */}
                  <div className="gc-tm-months" style={{ width: timelineWidth }}>
                    {monthHeaders.map((m, i) => (
                      <div key={i} className="gc-tm-month" style={{ width: m.days * DAY_W }}>{m.label}</div>
                    ))}
                  </div>
                  {/* Day headers */}
                  <div className="gc-tm-days" style={{ width: timelineWidth }}>
                    {days.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      const isToday = d.toISOString().slice(0, 10) === todayStr
                      return <div key={i} className={`gc-tm-day ${isWeekend ? 'gc-tm-weekend' : ''} ${isToday ? 'gc-tm-today' : ''}`} style={{ width: DAY_W }}>{d.getDate()}</div>
                    })}
                  </div>
                  {/* Bars area */}
                  <div className="gc-tm-body" style={{ width: timelineWidth, height: allTasksFlat.length * ROW_H }}>
                    {/* Grid lines */}
                    {days.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      return <div key={i} className={`gc-tm-gridline ${isWeekend ? 'gc-tm-gl-weekend' : ''}`} style={{ left: i * DAY_W, width: DAY_W, height: '100%' }} />
                    })}
                    {/* Row separators */}
                    {allTasksFlat.map((_, i) => (
                      <div key={i} className="gc-tm-rowline" style={{ top: (i + 1) * ROW_H }} />
                    ))}
                    {/* Today line */}
                    {todayPx > 0 && todayPx < timelineWidth && (
                      <div className="gc-today-line" style={{ left: todayPx + DAY_W / 2 }}>
                        <span className="gc-today-label">Today</span>
                      </div>
                    )}
                    {/* Dependency arrows (SVG) */}
                    <svg className="gc-arrows-svg" width={timelineWidth} height={allTasksFlat.length * ROW_H} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                      <defs>
                        <marker id="arrowFS" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#e74c3c" /></marker>
                        <marker id="arrowSS" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#f39c12" /></marker>
                      </defs>
                      {arrowPaths.map((a) => (
                        <path key={a.key} d={a.d} fill="none" stroke={a.type === 'FS' ? '#e74c3c' : '#f39c12'} strokeWidth="1.5" markerEnd={`url(#arrow${a.type})`} opacity="0.7" />
                      ))}
                    </svg>
                    {/* Gantt bars */}
                    {allTasksFlat.map((t, i) => renderGanttBar(t, i, pid, projColor))}
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* Legend */}
            {view === 'timeline' && (
              <div className="gc-legend">
                <span className="gc-legend-item"><span className="gc-legend-box" style={{ background: '#27ae60' }} /> Complete</span>
                <span className="gc-legend-item"><span className="gc-legend-box" style={{ background: '#2563eb' }} /> In Progress</span>
                <span className="gc-legend-item"><span className="gc-legend-box" style={{ background: '#94a3b8' }} /> Not Started</span>
                <span className="gc-legend-item"><span className="gc-legend-line" style={{ background: '#e74c3c' }} /><svg width="8" height="8" style={{ marginLeft: -4 }}><path d="M0,0 L8,4 L0,8 Z" fill="#e74c3c" /></svg> FS Dependency</span>
                <span className="gc-legend-item"><span className="gc-legend-line" style={{ background: '#f39c12' }} /><svg width="8" height="8" style={{ marginLeft: -4 }}><path d="M0,0 L8,4 L0,8 Z" fill="#f39c12" /></svg> SS Dependency</span>
                {showBaseline && <span className="gc-legend-item"><span className="gc-legend-box gc-legend-bl" /> Baseline</span>}
              </div>
            )}
          </main>
        </div>

        {/* ═══════════════════════════════════════════════
         *  MODALS
         * ═══════════════════════════════════════════════ */}

        {/* Add Project */}
        {showAddProject && (
          <div className="pm-modal-overlay" onClick={() => setShowAddProject(false)}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
              <h3>New Project</h3>
              <div className="pm-form-group"><label className="pm-label">Project Name *</label><input className="pm-input" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="My Project" /></div>
              <div className="pm-form-row">
                <div className="pm-form-group"><label className="pm-label">Budget</label><input type="number" className="pm-input" value={newProject.budget} onChange={(e) => setNewProject({ ...newProject, budget: e.target.value })} placeholder="50000" /></div>
                <div className="pm-form-group"><label className="pm-label">Currency</label><select className="pm-select" value={newProject.currency} onChange={(e) => setNewProject({ ...newProject, currency: e.target.value })}><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="RUB">RUB</option><option value="CNY">CNY</option></select></div>
              </div>
              <div className="pm-modal-buttons"><button className="pm-btn-secondary" onClick={() => setShowAddProject(false)}>Cancel</button><button className="pm-btn-primary" onClick={handleAddProject}>Create</button></div>
            </div>
          </div>
        )}

        {/* Add Task */}
        {showAddTask && (
          <div className="pm-modal-overlay" onClick={() => setShowAddTask(false)}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
              <h3>New Task</h3>
              <div className="pm-form-group"><label className="pm-label">Task Name *</label><input className="pm-input" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} placeholder="Task name" /></div>
              <div className="pm-form-row">
                <div className="pm-form-group"><label className="pm-label">Start Date</label><input type="date" className="pm-input" value={newTask.startDate} onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })} /></div>
                <div className="pm-form-group">
                  <label className="pm-label">Duration (days)</label>
                  <input type="number" min="1" className="pm-input" value={newTask.duration} onChange={(e) => setNewTask({ ...newTask, duration: e.target.value })} placeholder="5" />
                </div>
              </div>
              {newTask.startDate && newTask.duration && (
                <div className="gc-calc-date">End Date: <strong>{calcEndDate(newTask.startDate, parseInt(newTask.duration) || 1)}</strong></div>
              )}
              <div className="pm-form-row">
                <div className="pm-form-group"><label className="pm-label">Assignee</label><select className="pm-select" value={newTask.assignee} onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}><option value="">Unassigned</option>{(selectedProject?.resources || assignees || []).map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                <div className="pm-form-group"><label className="pm-label">Cost</label><input type="number" className="pm-input" value={newTask.cost} onChange={(e) => setNewTask({ ...newTask, cost: e.target.value })} placeholder="0" /></div>
              </div>
              {/* Predecessor selector (controlled React state) */}
              {allTasksFlat.length > 0 && (
                <div className="pm-form-group">
                  <label className="pm-label">Predecessor</label>
                  <div className="gc-pred-selector">
                    <select className="pm-select" value={newPredTask} onChange={(e) => setNewPredTask(e.target.value)}>
                      <option value="">Select task…</option>
                      {allTasksFlat.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.name}</option>)}
                    </select>
                    <select className="pm-select gc-pred-type" value={newPredType} onChange={(e) => setNewPredType(e.target.value)}>
                      <option value="FS">FS</option><option value="SS">SS</option>
                    </select>
                    <button className="gc-btn-sm gc-btn-outline" onClick={() => {
                      if (!newPredTask) return
                      const already = (newTask.predecessors || []).some((p) => p.taskId === newPredTask && p.type === newPredType)
                      if (already) return
                      setNewTask((prev) => ({ ...prev, predecessors: [...(prev.predecessors || []), { taskId: newPredTask, type: newPredType }] }))
                      setNewPredTask('')
                    }}>Add</button>
                  </div>
                  {newTask.predecessors?.length > 0 && (
                    <div className="gc-pred-tags">
                      {newTask.predecessors.map((p, i) => {
                        const idx = allTasksFlat.findIndex((t) => t.id === p.taskId)
                        return <span key={i} className="gc-pred-tag">{idx >= 0 ? `${idx + 1}` : '?'} {p.type} <button onClick={() => setNewTask((prev) => ({ ...prev, predecessors: prev.predecessors.filter((_, j) => j !== i) }))}>×</button></span>
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="pm-modal-buttons"><button className="pm-btn-secondary" onClick={() => setShowAddTask(false)}>Cancel</button><button className="pm-btn-primary" onClick={handleAddTask}>Add Task</button></div>
            </div>
          </div>
        )}

        {/* Edit Task */}
        {showEditTask && (
          <div className="pm-modal-overlay" onClick={() => setShowEditTask(null)}>
            <div className="pm-modal pm-modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3>Edit Task</h3>
              <div className="pm-form-group"><label className="pm-label">Task Name</label><input className="pm-input" value={editTask.name || ''} onChange={(e) => setEditTask({ ...editTask, name: e.target.value })} /></div>
              <div className="pm-form-row">
                <div className="pm-form-group"><label className="pm-label">Start Date</label><input type="date" className="pm-input" value={editTask.startDate || ''} onChange={(e) => {
                  const dur = parseInt(editTask.duration) || calcDuration(editTask.startDate, editTask.endDate)
                  setEditTask({ ...editTask, startDate: e.target.value, endDate: calcEndDate(e.target.value, dur), duration: dur })
                }} /></div>
                <div className="pm-form-group"><label className="pm-label">Duration (days)</label><input type="number" min="1" className="pm-input" value={editTask.duration || ''} onChange={(e) => {
                  const dur = parseInt(e.target.value) || 1
                  setEditTask({ ...editTask, duration: dur, endDate: editTask.startDate ? calcEndDate(editTask.startDate, dur) : editTask.endDate })
                }} /></div>
                <div className="pm-form-group"><label className="pm-label">End Date</label><input type="date" className="pm-input" value={editTask.endDate || ''} onChange={(e) => setEditTask({ ...editTask, endDate: e.target.value, duration: calcDuration(editTask.startDate, e.target.value) })} /></div>
              </div>
              <div className="pm-form-row">
                <div className="pm-form-group"><label className="pm-label">Assignee</label><select className="pm-select" value={editTask.assignee || ''} onChange={(e) => setEditTask({ ...editTask, assignee: e.target.value })}><option value="">Unassigned</option>{(selectedProject?.resources || assignees || []).map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                <div className="pm-form-group"><label className="pm-label">Cost</label><input type="number" className="pm-input" value={editTask.cost || ''} onChange={(e) => setEditTask({ ...editTask, cost: e.target.value })} /></div>
              </div>
              <div className="pm-form-group"><label className="pm-label">Completion: {editTask.progressPercent || 0}%</label><input type="range" min="0" max="100" className="pm-range" value={editTask.progressPercent || 0} onChange={(e) => setEditTask({ ...editTask, progressPercent: parseInt(e.target.value) })} /></div>
              {/* Dependency editor (controlled React state) */}
              <div className="pm-form-group">
                <label className="pm-label">Predecessors</label>
                <div className="gc-pred-selector">
                  <select className="pm-select" value={editPredTask} onChange={(e) => setEditPredTask(e.target.value)}>
                    <option value="">Select task…</option>
                    {allTasksFlat.filter((t) => t.id !== showEditTask).map((t) => <option key={t.id} value={t.id}>{allTasksFlat.indexOf(t) + 1}. {t.name}</option>)}
                  </select>
                  <select className="pm-select gc-pred-type" value={editPredType} onChange={(e) => setEditPredType(e.target.value)}>
                    <option value="FS">FS</option><option value="SS">SS</option>
                  </select>
                  <button className="gc-btn-sm gc-btn-outline" onClick={() => {
                    if (!editPredTask) return
                    const already = (editTask.predecessors || []).some((p) => p.taskId === editPredTask && p.type === editPredType)
                    if (already) return
                    setEditTask((prev) => ({ ...prev, predecessors: [...(prev.predecessors || []), { taskId: editPredTask, type: editPredType }] }))
                    setEditPredTask('')
                  }}>Add</button>
                </div>
                {editTask.predecessors?.length > 0 && (
                  <div className="gc-pred-tags">
                    {editTask.predecessors.map((p, i) => {
                      const idx = allTasksFlat.findIndex((t) => t.id === p.taskId)
                      return <span key={i} className="gc-pred-tag">{idx >= 0 ? `${idx + 1}` : '?'} {p.type} <button onClick={() => setEditTask((prev) => ({ ...prev, predecessors: prev.predecessors.filter((_, j) => j !== i) }))}>×</button></span>
                    })}
                  </div>
                )}
              </div>
              {editTask.baselineStart && <div className="pm-baseline-info"><strong>Baseline:</strong> {editTask.baselineStart} → {editTask.baselineEnd}{editTask.startDate !== editTask.baselineStart || editTask.endDate !== editTask.baselineEnd ? <span className="pm-variance"> (Variance)</span> : null}</div>}
              <div className="pm-modal-buttons"><button className="pm-btn-secondary" onClick={() => setShowEditTask(null)}>Cancel</button><button className="pm-btn-primary" onClick={handleEditTaskSave}>Save</button></div>
            </div>
          </div>
        )}

        {/* Revisions */}
        {showRevisions && (
          <div className="pm-modal-overlay" onClick={() => setShowRevisions(false)}>
            <div className="pm-modal pm-modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3>Revision History</h3>
              <div className="pm-form-group">
                <div className="pm-form-row"><input className="pm-input" value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="Note..." style={{ flex: 1 }} /><button className="pm-btn-primary" onClick={() => { saveRevision(selectedProjectId, revisionNote || 'Manual save'); setRevisionNote('') }}>Save</button></div>
              </div>
              <div className="pm-revisions-list">
                {(selectedProject?.revisions || []).length === 0 ? <p className="pm-no-tasks">No revisions.</p> : (selectedProject?.revisions || []).slice().reverse().map((rev) => (
                  <div key={rev.id} className="pm-revision-item">
                    <div className="pm-revision-info"><span className="pm-revision-date">{rev.date}</span><span className="pm-revision-note">{rev.note}</span></div>
                    <div className="pm-revision-actions">{rev.snapshot && <button className="pm-btn-sm" onClick={() => restoreRevision(selectedProjectId, rev.id)}>Restore</button>}<button className="pm-btn-sm pm-btn-danger" onClick={() => deleteRevision(selectedProjectId, rev.id)}>Delete</button></div>
                  </div>
                ))}
              </div>
              <div className="pm-modal-buttons"><button className="pm-btn-secondary" onClick={() => setShowRevisions(false)}>Close</button></div>
            </div>
          </div>
        )}

        {/* Resources */}
        {showResources && (
          <div className="pm-modal-overlay" onClick={() => setShowResources(false)}>
            <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Resources</h3>
              <div className="pm-form-group"><div className="pm-form-row"><input className="pm-input" value={newResourceName} onChange={(e) => setNewResourceName(e.target.value)} placeholder="Name..." style={{ flex: 1 }} /><button className="pm-btn-primary" onClick={() => { if (newResourceName.trim()) { addResource(selectedProjectId, newResourceName.trim()); setNewResourceName('') } }}>Add</button></div></div>
              <div className="pm-resources-list">
                {(selectedProject?.resources || []).length === 0 ? <p className="pm-no-tasks">No resources.</p> : (selectedProject?.resources || []).map((r) => (
                  <div key={r} className="pm-resource-item"><span>{r}</span><button className="pm-btn-sm pm-btn-danger" onClick={() => removeResource(selectedProjectId, r)}>Remove</button></div>
                ))}
              </div>
              <div className="pm-modal-buttons"><button className="pm-btn-secondary" onClick={() => setShowResources(false)}>Close</button></div>
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div className="pm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <button className="pm-context-item" onClick={() => { handleEditTaskOpen(contextMenu.task, contextMenu.projectId); setContextMenu(null) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Task
            </button>
            <button className="pm-context-item pm-context-danger" onClick={() => { handleDeleteTask(contextMenu.task.id); setContextMenu(null) }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Delete Task
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default ProjectManagement
