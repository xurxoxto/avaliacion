import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Save, FileText, BarChart3, Users } from 'lucide-react'

// --- Constants & Config ---
const GRADE_VALUES = {
  '🟢': { value: 9.5, label: 'Mastery (Sobresaliente)', color: 'grade-green' },
  '🟡': { value: 7.5, label: 'In Progress (Notable)', color: 'grade-yellow' },
  '🔴': { value: 4.0, label: 'Needs Support (Insuficiente)', color: 'grade-red' },
  '⚪': { value: null, label: 'No Evidence', color: 'grade-empty' }
}

const DEFAULT_STUDENTS = [
  { id: 1, name: "García, Martín" },
  { id: 2, name: "López, Sofía" },
  { id: 3, name: "Rodríguez, Lucas" },
  { id: 4, name: "Fernández, Valentina" },
  { id: 5, name: "Martínez, Hugo" },
]

const DEFAULT_PROJECTS = [
  { id: 'p1', name: 'Project 1: Ecosystems' },
  { id: 'p2', name: 'Project 2: Local History' },
  { id: 'p3', name: 'Project 3: Geometry Art' }
]

const DEFAULT_COMPETENCIES = [
  { id: 'c1', name: 'Oral Communication', weight: 0.3 },
  { id: 'c2', name: 'Written Production', weight: 0.4 },
  { id: 'c3', name: 'Teamwork & Autonomy', weight: 0.3 }
]

export default function EvaluationSystem() {
  const [activeTab, setActiveTab] = useState('entry')
  const [grades, setGrades] = useState({})
  const [selectedStudent, setSelectedStudent] = useState(null)
  // editable datasets persisted to localStorage
  const [students, setStudents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('triangulation_students_v1')) || DEFAULT_STUDENTS } catch(e){ return DEFAULT_STUDENTS }
  })
  const [projects, setProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem('triangulation_projects_v1')) || DEFAULT_PROJECTS } catch(e){ return DEFAULT_PROJECTS }
  })
  const [competencies, setCompetencies] = useState(() => {
    try { return JSON.parse(localStorage.getItem('triangulation_competencies_v1')) || DEFAULT_COMPETENCIES } catch(e){ return DEFAULT_COMPETENCIES }
  })
  const [manageOpen, setManageOpen] = useState(false)
  const saveTimerRef = useRef(null)
  const [toast, setToast] = useState('')
  const toastTimerRef = useRef(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const clearTimerRef = useRef(null)
  const modalCloseRef = useRef(null)

  // Load persisted grades on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('triangulation_grades_v1')
      if (raw) {
        setGrades(JSON.parse(raw))
      }
    } catch (e) {
      console.error('Failed to load saved grades', e)
    }
  }, [])

  // Persist grades to localStorage (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem('triangulation_grades_v1', JSON.stringify(grades))
      } catch (e) {
        console.error('Failed to save grades', e)
      }
    }, 300)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [grades])

  // Persist editable datasets when they change
  useEffect(() => {
    try { localStorage.setItem('triangulation_students_v1', JSON.stringify(students)) } catch(e) { console.error(e) }
  }, [students])
  useEffect(() => {
    try { localStorage.setItem('triangulation_projects_v1', JSON.stringify(projects)) } catch(e) { console.error(e) }
  }, [projects])
  useEffect(() => {
    try { localStorage.setItem('triangulation_competencies_v1', JSON.stringify(competencies)) } catch(e) { console.error(e) }
  }, [competencies])

  // Export / Import / Clear dataset helpers
  const exportAll = () => {
    const payload = { students, projects, competencies, grades }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'triangulation-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.students) setStudents(data.students)
      if (data.projects) setProjects(data.projects)
      if (data.competencies) setCompetencies(data.competencies)
      if (data.grades) setGrades(data.grades)
      showToast('Import successful')
    } catch (e) {
      console.error(e)
      showToast('Import failed')
    }
  }

  const showToast = (msg, ms = 3000) => {
    try { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) } catch(_){}
    setToast(msg)
    toastTimerRef.current = setTimeout(()=> setToast(''), ms)
  }

  const clearAll = () => {
    if (!clearConfirm) {
      setClearConfirm(true)
      showToast('Click Clear again within 4s to confirm')
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      clearTimerRef.current = setTimeout(()=> setClearConfirm(false), 4000)
      return
    }
    // confirmed
    localStorage.removeItem('triangulation_students_v1')
    localStorage.removeItem('triangulation_projects_v1')
    localStorage.removeItem('triangulation_competencies_v1')
    localStorage.removeItem('triangulation_grades_v1')
    setStudents(DEFAULT_STUDENTS)
    setProjects(DEFAULT_PROJECTS)
    setCompetencies(DEFAULT_COMPETENCIES)
    setGrades({})
    setClearConfirm(false)
    showToast('All data cleared')
  }

  // Helpers
  const getGradeKey = (studentId, projectId, compId) => `${studentId}-${projectId}-${compId}`
  const handleGradeCycle = (studentId, projectId, compId) => {
    const key = getGradeKey(studentId, projectId, compId)
    const current = grades[key] || '⚪'
    const cycle = { '⚪': '🟢', '🟢': '🟡', '🟡': '🔴', '🔴': '⚪' }
    setGrades(prev => ({ ...prev, [key]: cycle[current] }))
  }

  // Small helper component used inside Manage Data modal
  function AddItem({ placeholder, onAdd }) {
    const [val, setVal] = useState('')
    return (
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <input value={val} onChange={(e)=>setVal(e.target.value)} placeholder={placeholder} style={{flex:1,padding:8,borderRadius:6,border:'1px solid #e6eef8'}} />
        <button onClick={()=>{ if(val.trim()){ onAdd(val.trim()); setVal('') } }} style={{padding:'6px 10px'}}>Add</button>
      </div>
    )
  }

  // Triangulation calculation logic
  const calculateStudentScore = (studentId) => {
    let totalScore = 0
    let totalWeight = 0
    const competenceBreakdown = {}

    competencies.forEach(comp => {
      let compTotal = 0
      let compCount = 0
      let evidenceCount = 0

      projects.forEach(proj => {
        const key = getGradeKey(studentId, proj.id, comp.id)
        const gradeSymbol = grades[key]
        const gradeVal = gradeSymbol ? GRADE_VALUES[gradeSymbol].value : null

        if (gradeVal !== null) {
          compTotal += gradeVal
          compCount++
          evidenceCount++
        }
      })

      const compAvg = compCount > 0 ? compTotal / compCount : 0
      competenceBreakdown[comp.id] = { avg: compAvg, evidence: evidenceCount }

      if (compCount > 0) {
        totalScore += compAvg * comp.weight
        totalWeight += comp.weight
      }
    })

    const finalScore = totalWeight > 0 ? (totalScore / totalWeight) : 0

    return { finalScore: finalScore.toFixed(1), breakdown: competenceBreakdown, hasData: totalWeight > 0 }
  }

  // total weight helper
  const totalWeight = competencies.reduce((s,c)=> s + (Number(c.weight) || 0), 0)

  // Views
  const DataEntryView = () => (
    <div className="table-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>Student Name</th>
            {projects.map(proj => (
              <th key={proj.id} colSpan={competencies.length}>{proj.name}</th>
            ))}
          </tr>
          <tr>
            <th></th>
              {projects.map(proj => (
                competencies.map(comp => (
                <th key={`${proj.id}-${comp.id}`} className="comp-th">{comp.name}</th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map(student => (
            <tr key={student.id}>
              <td className="sticky-name">{student.name}</td>
              {projects.map(proj => (
                competencies.map(comp => {
                  const key = getGradeKey(student.id, proj.id, comp.id)
                  const currentGrade = grades[key] || '⚪'
                  const styleClass = GRADE_VALUES[currentGrade].color
                  return (
                    <td key={key} onClick={() => handleGradeCycle(student.id, proj.id, comp.id)} className="cell">
                      <div className={`grade ${styleClass}`}>{currentGrade === '⚪' ? '·' : currentGrade}</div>
                    </td>
                  )
                })
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const DashboardView = () => (
    <div>
      {totalWeight <= 0 || Math.abs(totalWeight - 1) > 0.001 ? (
        <div className="weight-banner">
          <div>
            <strong>Warning:</strong> Competency weights sum to <strong>{totalWeight.toFixed(2)}</strong>. This affects scoring.
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{
              const sum = totalWeight
              if (sum <= 0) { showToast('Cannot normalize: total weight is zero. Add positive weights first.'); return }
              setCompetencies(competencies.map(c=> ({ ...c, weight: Number(((Number(c.weight)||0)/sum).toFixed(2)) })))
              showToast('Weights normalized')
            }}>Normalize weights</button>
            <button onClick={()=>{ navigator.clipboard.writeText(JSON.stringify({competencies},null,2)); showToast('Weights copied to clipboard') }}>Copy weights</button>
          </div>
        </div>
      ) : null}

      <div className="dashboard-grid">
      {students.map(student => {
        const stats = calculateStudentScore(student.id)
        const scoreNum = parseFloat(stats.finalScore)
        const cardClass = stats.hasData ? (scoreNum >= 8.5 ? 'card-green' : scoreNum >= 5 ? 'card-yellow' : 'card-red') : ''
          return (
            <div key={student.id} className={`card ${cardClass}`} onClick={() => setSelectedStudent(student)} style={{cursor:'pointer', position:'relative'}} role="button" tabIndex={0} aria-label={`Open details for ${student.name}`} onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { setSelectedStudent(student); e.preventDefault(); } }}>
            <div className="card-head">
              <strong>{student.name}</strong>
              <div className="score">{stats.hasData ? stats.finalScore : '--'}</div>
            </div>
            <div className="card-body">
              {competencies.map(comp => {
                const cStats = stats.breakdown[comp.id] || { avg: 0, evidence: 0 }
                return (
                  <div key={comp.id} className="comp-row">
                    <div className="comp-name" title={comp.name}>{comp.name}</div>
                    <div className="comp-val">{cStats.evidence > 0 ? cStats.avg.toFixed(1) : '-'}</div>
                  </div>
                )
              })}
            </div>
            <div className="card-foot">Data Points: {Object.values(stats.breakdown).reduce((acc, curr) => acc + curr.evidence, 0)}</div>
            { (totalWeight <= 0 || Math.abs(totalWeight - 1) > 0.001) && (
              <div className="invalid-badge">Weights invalid</div>
            ) }
          </div>
        )
      })}
      </div>
    </div>
  )

  // Student detail modal: shows triangulation data for selected student
  function StudentDetail({ student, onClose }) {
    if (!student) return null

    // build grid and compute per-competence averages
    const grid = projects.map(proj => {
      return competencies.map(comp => {
        const key = getGradeKey(student.id, proj.id, comp.id)
        const sym = grades[key] || '⚪'
        const val = GRADE_VALUES[sym].value
        return { projId: proj.id, compId: comp.id, symbol: sym, value: val }
      })
    })

    const compAgg = {}
    competencies.forEach(comp => { compAgg[comp.id] = { sum:0, count:0 } })
    grid.forEach(col => col.forEach(cell => {
      if (cell.value !== null && cell.value !== undefined) {
        compAgg[cell.compId].sum += cell.value
        compAgg[cell.compId].count += 1
      }
    }))

    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Detalle de ${student.name}`} onKeyDown={(e)=>{ if(e.key==='Escape') onClose(); }}>
        <div className="modal-card">
          <div className="modal-head">
            <h3>Detalle — {student.name}</h3>
            <div>
              <button ref={modalCloseRef} aria-label="Cerrar detalle" onClick={onClose}>Cerrar</button>
            </div>
          </div>

          <div style={{overflowX:'auto'}}>
            <table className="matrix" style={{minWidth:600}}>
              <thead>
                <tr>
                  <th>Competencia \ Proyecto</th>
                  {projects.map(p => <th key={p.id}>{p.name}</th>)}
                  <th>Media</th>
                </tr>
              </thead>
              <tbody>
                {competencies.map(comp => (
                  <tr key={comp.id}>
                    <td style={{textAlign:'left', paddingLeft:12}}>{comp.name}</td>
                    {projects.map((p, pi) => {
                      const key = getGradeKey(student.id, p.id, comp.id)
                      const sym = grades[key] || '⚪'
                      const val = GRADE_VALUES[sym].value
                      return (
                        <td key={p.id} style={{textAlign:'center'}}>
                          <div className={`grade ${GRADE_VALUES[sym].color}`}>{sym === '⚪' ? '·' : sym}</div>
                          <div style={{fontSize:12, color:'#6b7280', marginTop:6}}>{val !== null ? val.toFixed(1) : '-'}</div>
                        </td>
                      )
                    })}
                    <td style={{textAlign:'center', fontWeight:700}}>
                      {compAgg[comp.id].count > 0 ? (Math.round((compAgg[comp.id].sum / compAgg[comp.id].count) * 10) / 10).toFixed(1) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:12}}>
            <strong>Overall:</strong> {calculateStudentScore(student.id).finalScore} / 10
          </div>
        </div>
      </div>
    )
  }

  const ReportGeneratorView = () => (
    <div className="reports">
      <h2>Automated Narrative Reports</h2>
      {students.map(student => (
        <div key={student.id} className="report-card">
          <div className="report-head">
            <strong>{student.name}</strong>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => navigator.clipboard.writeText(generateNarrative(student))}>Copy</button>
              <button onClick={() => setSelectedStudent(student)}>View Detail</button>
            </div>
          </div>
          <p className="narrative">"{generateNarrative(student)}"</p>
        </div>
      ))}
    </div>
  )

  const generateNarrative = (student) => {
    const stats = calculateStudentScore(student.id)
    if (!stats.hasData) return 'No sufficient data recorded yet.'
    const strengths = []
    const weaknesses = []
    competencies.forEach(comp => {
      const val = stats.breakdown[comp.id].avg
      if (val >= 8) strengths.push(comp.name.toLowerCase())
      if (val > 0 && val < 5) weaknesses.push(comp.name.toLowerCase())
    })
    let text = `${student.name} has finished the term with a calculated performance level of ${stats.finalScore}. `
    if (strengths.length > 0) text += `The student demonstrates clear mastery in ${strengths.join(' and ')}. `
    if (weaknesses.length > 0) text += `However, reinforced support is recommended for ${weaknesses.join(' and ')}.`
    return text
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div style={{display:'flex', alignItems:'center', gap:18}}>
          <h1 style={{margin:0}}>Triangulation Evaluation System</h1>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" onClick={exportAll}>Export</button>
            <input id="import-file" type="file" accept="application/json" style={{display:'none'}} onChange={(e)=>{ if(e.target.files && e.target.files[0]) importFile(e.target.files[0]) }} />
            <button className="btn" onClick={()=>document.getElementById('import-file').click()}>Import</button>
            <button className="btn btn-danger" onClick={clearAll}>{clearConfirm ? 'Confirm Clear' : 'Clear'}</button>
            <button className="btn btn-ghost" onClick={()=>setManageOpen(true)}>Manage Data</button>
          </div>
        </div>
        <div className="tabs">
          <button onClick={() => setActiveTab('entry')} className={activeTab === 'entry' ? 'active' : ''}><Users/> Data Entry</button>
          <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'active' : ''}><BarChart3/> Dashboard</button>
          <button onClick={() => setActiveTab('reports')} className={activeTab === 'reports' ? 'active' : ''}><FileText/> Reports</button>
        </div>
      </header>

      <main className="container">
        {activeTab === 'entry' && <DataEntryView />}
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'reports' && <ReportGeneratorView />}
      </main>
      {manageOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div style={{width:800,maxWidth:'95%',background:'#fff',borderRadius:8,padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0}}>Manage Data</h3>
              <div>
                <button onClick={()=>setManageOpen(false)} style={{padding:'6px 10px'}}>Close</button>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginTop:12}}>
              <div>
                <h4>Students</h4>
                <ul style={{maxHeight:220,overflow:'auto',paddingLeft:12}}>
                  {students.map(s=> (
                    <li key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span>{s.name}</span>
                      <button onClick={()=> setStudents(students.filter(x=>x.id!==s.id))}>Remove</button>
                    </li>
                  ))}
                </ul>
                <AddItem
                  placeholder="New student (Lastname, Name)"
                  onAdd={(val)=>{ const id = Date.now(); setStudents([...students, {id, name:val}]) }}
                />
              </div>

              <div>
                <h4>Projects</h4>
                <ul style={{maxHeight:220,overflow:'auto',paddingLeft:12}}>
                  {projects.map(p=> (
                    <li key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span>{p.name}</span>
                      <button onClick={()=> setProjects(projects.filter(x=>x.id!==p.id))}>Remove</button>
                    </li>
                  ))}
                </ul>
                <AddItem
                  placeholder="New project name"
                  onAdd={(val)=>{ const id = `p${Date.now()}`; setProjects([...projects, {id, name:val}]) }}
                />
              </div>

              <div>
                <h4>Competencies</h4>
                <ul style={{maxHeight:220,overflow:'auto',paddingLeft:12}}>
                  {competencies.map(c=> (
                    <li key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                      <div style={{display:'flex',flexDirection:'column',flex:1}}>
                        <span style={{fontWeight:600}}>{c.name}</span>
                        <small style={{color:'#6b7280'}}>id: {c.id}</small>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <input className="weight-input" type="number" min="0" max="1" step="0.01" value={typeof c.weight === 'number' ? c.weight : 0} onChange={(e)=>{
                          const v = parseFloat(e.target.value)
                          setCompetencies(competencies.map(x=> x.id===c.id ? {...x, weight: isNaN(v) ? 0 : v} : x))
                        }} style={{width:80,padding:6,borderRadius:6,border:'1px solid #e6eef8'}} />
                        <button onClick={()=> setCompetencies(competencies.filter(x=>x.id!==c.id))}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <AddItem
                  placeholder="New competence name"
                  onAdd={(val)=>{ const id = `c${Date.now()}`; setCompetencies([...competencies, {id, name:val, weight: 0.3}]) }}
                />

                <div style={{marginTop:8,display:'flex',alignItems:'center',gap:12}}>
                  <div>Total weight: <strong>{competencies.reduce((s,c)=>s + (Number(c.weight) || 0),0).toFixed(2)}</strong></div>
                  <button onClick={()=>{
                    const sum = competencies.reduce((s,c)=>s + (Number(c.weight) || 0),0)
                    if (sum <= 0) { showToast('Cannot normalize: total weight is zero. Add positive weights first.'); return }
                    setCompetencies(competencies.map(c=> ({ ...c, weight: Number(((Number(c.weight)||0)/sum).toFixed(2)) })))
                    showToast('Weights normalized')
                  }}>Normalize weights</button>
                  <div style={{color:'#92400e',fontSize:13}}>
                    {competencies.reduce((s,c)=>s + (Number(c.weight) || 0),0) <= 0 && <span>Warning: total weight is zero.</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedStudent && (
        <StudentDetail student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}
    </div>
  )
}

// focus management: focus close button when modal opens
// note: keep separate effect to avoid hooking into component render above
export function useModalFocus(selectedStudent, modalCloseRef) {
  useEffect(()=>{
    if (selectedStudent && modalCloseRef && modalCloseRef.current) {
      try { modalCloseRef.current.focus() } catch(_){}
    }
  }, [selectedStudent, modalCloseRef])

}
