import { useEffect, useRef, useState } from 'react'
import DatasetUploader from './DatasetUploader'
import FindingsPanel from './FindingsPanel'
import InvestigationPanel from './InvestigationPanel'
import { demoFindings } from '../data/demoFindings'
import type { DatasetSaveState, FindingFilter, ReviewDecision } from '../types'
import { appendImages, getDataset, listDatasets, saveDataset, uploadImage, validateDataset } from '../api/datasets'
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '../../shared/datasets'
import type { DatasetDetails, DatasetRecord } from '../../shared/datasets'
import DatasetLibrary from './DatasetLibrary'

function Dashboard() {
  // Shared state lives in the nearest common parent of all three panels.
  const [files, setFiles] = useState<File[]>([])
  const [datasetName, setDatasetName] = useState('')
  const [saveState, setSaveState] = useState<DatasetSaveState>({ status: 'idle' })
  const requestPending = useRef(false)
  const [dataset, setDataset] = useState<DatasetDetails | null>(null)
  const [datasets, setDatasets] = useState<DatasetRecord[]>([])
  const [libraryError, setLibraryError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const [isDemo, setIsDemo] = useState(false)
  const [filter, setFilter] = useState<FindingFilter>('all')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})

  useEffect(() => {
    let active = true
    const version = generation.current
    const id = new URL(window.location.href).searchParams.get('dataset')
    void (async () => {
      try {
        const [saved, selected] = await Promise.all([listDatasets(), id ? getDataset(id) : Promise.resolve(null)])
        if (active && generation.current === version) { setDatasets(saved); setDataset(selected); setDatasetName(selected?.name ?? '') }
      } catch { if (active) setLibraryError('Could not reopen saved datasets. Check the API and retry.') }
      finally { if (active && generation.current === version) setLoading(false) }
    })()
    return () => { active = false }
  }, [])

  function remember(id: string | null) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('dataset', id)
    else url.searchParams.delete('dataset')
    window.history.replaceState(null, '', url)
  }

  async function refreshLibrary() {
    try { setDatasets(await listDatasets()); setLibraryError('') }
    catch { setLibraryError('Could not refresh the saved-dataset list.') }
  }

  async function openDataset(id: string) {
    const version = ++generation.current
    setLoading(true); setLibraryError('')
    try {
      const selected = await getDataset(id)
      if (version !== generation.current) return
      setDataset(selected); setDatasetName(selected.name); setFiles([]); setSaveState({ status: 'idle' })
      remember(id); setIsDemo(false); resetFindings()
    } catch { setLibraryError('Could not open this dataset. Check the API and retry.') }
    finally { if (version === generation.current) setLoading(false) }
  }

  function newDataset() {
    generation.current += 1
    setDataset(null); setDatasetName(''); setFiles([]); setSaveState({ status: 'idle' }); setLoading(false)
    remember(null); setIsDemo(false); resetFindings()
  }

  async function validateStoredImages() {
    if (!dataset) return
    setLoading(true)
    try { setDataset(await validateDataset(dataset.id)); await refreshLibrary() }
    catch (error) { setLibraryError(error instanceof Error ? error.message : 'Validation failed. Retry shortly.') }
    finally { setLoading(false) }
  }

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
    setSaveState({ status: 'idle' })
    // Never let fictional findings appear to be results for newly selected files.
    setIsDemo(false)
    resetFindings()
  }

  async function handleSaveDataset() {
    // The ref closes the gap before React renders the disabled submit button.
    if (requestPending.current || loading || !files.length) return
    requestPending.current = true
    let activeDataset = dataset
    setSaveState({ status: 'saving', completed: 0, total: files.length })
    try {
      const invalidFile = files.find((file) => file.size === 0 || file.size > MAX_IMAGE_BYTES
        || !IMAGE_MIME_TYPES.some((type) => type === file.type))
      if (invalidFile) throw new Error(`${invalidFile.name}: choose a supported image between 1 byte and 100 MiB.`)
      const manifest = files.map((file) => ({ filename: file.name, relativePath: file.webkitRelativePath || file.name, byteSize: file.size, mimeType: file.type }))
      if (!activeDataset) {
        const created = await saveDataset({
          name: datasetName.trim(),
          images: manifest,
        })
        activeDataset = await getDataset(created.id)
        setDataset(activeDataset); remember(created.id)
      }
      const existing = await appendImages(activeDataset.id, manifest)
      let completed = 0
      setSaveState({ status: 'saving', completed, total: files.length })
      for (const file of files) {
        const image = existing.images.find((entry) => entry.relativePath === (file.webkitRelativePath || file.name))
        if (!image) throw new Error(`The saved manifest is missing ${file.name}. Reopen the dataset and retry.`)
        if (!image.uploadedAt || image.validationError) await uploadImage(existing.id, image.id, file)
        completed += 1
        setSaveState({ status: 'saving', completed, total: files.length })
      }
      const saved = await getDataset(existing.id)
      setDataset(saved); setFiles([])
      setSaveState({ status: 'success', dataset: saved })
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : 'Could not upload the dataset. Please retry.' })
      if (activeDataset) setDataset(await getDataset(activeDataset.id).catch(() => activeDataset))
    } finally {
      await refreshLibrary()
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
      <DatasetLibrary datasets={datasets} selected={dataset} busy={loading || saveState.status === 'saving'} error={libraryError}
        onOpen={(id) => { void openDataset(id) }} onNew={newDataset} onRetry={() => { void refreshLibrary() }} onValidate={() => { void validateStoredImages() }} />
      <DatasetUploader
        key={dataset?.id ?? 'new'}
        existingDataset={dataset}
        loading={loading}
        files={files}
        name={datasetName}
        saveState={saveState}
        onFilesChange={handleFilesChange}
        onNameChange={(name) => {
          setDatasetName(name)
          setSaveState({ status: 'idle' })
        }}
        onSave={handleSaveDataset}
        onReset={newDataset}
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
