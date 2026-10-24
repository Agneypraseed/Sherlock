import { useState } from 'react'
import DatasetUploader from './DatasetUploader'
import FindingsPanel from './FindingsPanel'
import InvestigationPanel from './InvestigationPanel'
import { demoFindings } from '../data/demoFindings'
import type { FindingFilter, ReviewDecision } from '../types'

function Dashboard() {
  // Shared state lives in the nearest common parent of all three panels.
  const [files, setFiles] = useState<File[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [filter, setFilter] = useState<FindingFilter>('all')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})

  const findings = isDemo ? demoFindings : []
  const visibleFindings = findings.filter((finding) => filter === 'all' || finding.kind === filter)
  const selectedFinding = visibleFindings.find((finding) => finding.id === selectedFindingId)
    ?? visibleFindings[0] ?? null
  const reviewedCount = findings.filter((finding) => decisions[finding.id] && decisions[finding.id] !== 'unreviewed').length

  function resetFindings() {
    setFilter('all')
    setSelectedFindingId(null)
    setDecisions({})
  }

  function handleFilesChange(nextFiles: File[]) {
    setFiles(nextFiles)
    // Never let fictional findings appear to be results for newly selected files.
    setIsDemo(false)
    resetFindings()
  }

  function handleReview(decision: ReviewDecision) {
    if (!selectedFinding) return
    // Functional updates preserve decisions for other findings.
    setDecisions((previous) => ({ ...previous, [selectedFinding.id]: decision }))
  }

  return (
    <div id="dashboard">
      <div className="dashboard-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Inspect your image datasets and investigate potential problems.</p>
        </div>
        <span className="help-text">Frontend workspace</span>
      </div>
      <DatasetUploader files={files} onFilesChange={handleFilesChange} />
      {isDemo && <p className="review-summary" role="status">Demo review: {reviewedCount} of {findings.length} findings reviewed.</p>}
      <div className="dashboard-sections">
        <FindingsPanel
          findings={visibleFindings}
          filter={filter}
          selectedFindingId={selectedFinding?.id ?? null}
          decisions={decisions}
          isDemo={isDemo}
          onFilterChange={(nextFilter) => {
            setFilter(nextFilter)
            setSelectedFindingId(null)
          }}
          onSelectFinding={setSelectedFindingId}
          onToggleDemo={() => {
            setIsDemo((previous) => !previous)
            resetFindings()
          }}
        />
        <InvestigationPanel
          finding={selectedFinding}
          decision={selectedFinding ? decisions[selectedFinding.id] ?? 'unreviewed' : 'unreviewed'}
          onReview={handleReview}
        />
      </div>
    </div>
  )
}

export default Dashboard
