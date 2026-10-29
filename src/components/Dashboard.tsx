import { useRef, useState } from 'react'
import DatasetUploader from './DatasetUploader'
import FindingsPanel from './FindingsPanel'
import InvestigationPanel from './InvestigationPanel'
import { demoFindings } from '../data/demoFindings'
import type { DatasetSaveState, FindingFilter, ReviewDecision } from '../types'
import { getDataset, saveDataset, uploadImage } from '../api/datasets'
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '../../shared/datasets'
import type { DatasetRecord } from '../../shared/datasets'

function Dashboard() {
  // Shared state lives in the nearest common parent of all three panels.
  const [files, setFiles] = useState<File[]>([])
  const [datasetName, setDatasetName] = useState('')
  const [saveState, setSaveState] = useState<DatasetSaveState>({ status: 'idle' })
  const requestPending = useRef(false)
  // Retain the manifest after a partial failure so retry resumes this dataset.
  const savedManifest = useRef<DatasetRecord | null>(null)
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
    savedManifest.current = null
    setFiles(nextFiles)
    setSaveState({ status: 'idle' })
    // Never let fictional findings appear to be results for newly selected files.
    setIsDemo(false)
    resetFindings()
  }

  async function handleSaveDataset() {
    // The ref closes the gap before React renders the disabled submit button.
    if (requestPending.current || saveState.status === 'success') return
    requestPending.current = true
    setSaveState({ status: 'saving', completed: 0, total: files.length })
    try {
      const invalidFile = files.find((file) => file.size === 0 || file.size > MAX_IMAGE_BYTES
        || !IMAGE_MIME_TYPES.some((type) => type === file.type))
      if (invalidFile) throw new Error(`${invalidFile.name}: choose a supported image between 1 byte and 100 MiB.`)
      if (!savedManifest.current) {
        savedManifest.current = await saveDataset({
          name: datasetName.trim(),
          images: files.map((file) => ({
            filename: file.name,
            relativePath: file.webkitRelativePath || file.name,
            byteSize: file.size,
            mimeType: file.type,
          })),
        })
      }
      const existing = await getDataset(savedManifest.current.id)
      let completed = existing.images.filter((image) => image.uploadedAt).length
      setSaveState({ status: 'saving', completed, total: files.length })
      for (const image of existing.images) {
        if (image.uploadedAt) continue
        await uploadImage(existing.id, image.id, files[image.position])
        completed += 1
        setSaveState({ status: 'saving', completed, total: files.length })
      }
      const dataset = await getDataset(existing.id)
      setSaveState({ status: 'success', dataset })
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : 'Could not upload the dataset. Please retry.' })
    } finally {
      requestPending.current = false
    }
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
      </div>
      <DatasetUploader
        files={files}
        name={datasetName}
        saveState={saveState}
        onFilesChange={handleFilesChange}
        onNameChange={(name) => {
          savedManifest.current = null
          setDatasetName(name)
          setSaveState({ status: 'idle' })
        }}
        onSave={handleSaveDataset}
        onReset={() => {
          savedManifest.current = null
          setFiles([])
          setDatasetName('')
          setSaveState({ status: 'idle' })
        }}
      />
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
