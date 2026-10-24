import { useRef } from 'react'
import { MAX_IMAGES } from '../../shared/datasets'
import type { DatasetSaveState } from '../types'

interface DatasetUploaderProps {
  files: File[]
  name: string
  saveState: DatasetSaveState
  onFilesChange: (files: File[]) => void
  onNameChange: (name: string) => void
  onSave: () => Promise<void>
}

function DatasetUploader({ files, name, saveState, onFilesChange, onNameChange, onSave }: DatasetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isSaving = saveState.status === 'saving'
  // Count and size are derived from files, rather than duplicated in state.
  const totalBytes = files.reduce((total, file) => total + file.size, 0)

  return (
    <section id="dataset-upload" aria-labelledby="dataset-upload-heading">
      <div className="section-heading">
        <div>
          <h2 id="dataset-upload-heading">Dataset</h2>
          <p>Name your dataset and save its image manifest.</p>
        </div>
        <span className="status-label">Metadata only</span>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void onSave() }} aria-busy={isSaving}>
        <fieldset className="dataset-fields" disabled={isSaving}>
          <label className="file-label" htmlFor="dataset-name">Dataset name</label>
          <input
            id="dataset-name"
            type="text"
            value={name}
            required
            maxLength={120}
            placeholder="e.g. Wildlife training set"
            onChange={(event) => onNameChange(event.currentTarget.value)}
          />
          <label className="file-label" htmlFor="dataset-files">Choose image files</label>
          <input
            id="dataset-files"
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            aria-describedby="file-selection-help"
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? [])
              // Canceling the picker must not erase the current selection.
              if (selected.length > 0) onFilesChange(selected)
            }}
          />
          <p id="file-selection-help" className="help-text">
            Save sends the dataset name, filenames, sizes, and image types.
            Image contents stay in your browser. Select up to {MAX_IMAGES} images, 100 MiB each.
          </p>

          <div className="selection-summary" aria-live="polite">
            {files.length === 0 ? 'No images selected.' : (
              <span>{files.length} {files.length === 1 ? 'image' : 'images'} selected · {(totalBytes / 1024 / 1024).toFixed(2)} MB</span>
            )}
            {files.length > 0 && (
              <button type="button" className="text-button" onClick={() => {
                // File inputs are browser-managed; clear the native picker as well.
                if (inputRef.current) inputRef.current.value = ''
                onFilesChange([])
              }}>
                Clear selection
              </button>
            )}
          </div>

          {files.length > 0 && (
            <ul className="file-list" aria-label="Selected image files">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <span>{file.name}</span>
                  <span className="help-text">{Math.ceil(file.size / 1024)} KB</span>
                </li>
              ))}
            </ul>
          )}
          <div className="save-actions">
            <button type="submit" disabled={!name.trim() || files.length === 0 || files.length > MAX_IMAGES || saveState.status === 'success'}>
              {isSaving ? 'Saving metadata…' : saveState.status === 'success' ? 'Metadata saved' : 'Save dataset metadata'}
            </button>
            <span className="help-text">A new selection replaces the current one.</span>
          </div>
        </fieldset>
      </form>

      {saveState.status === 'saving' && <p role="status" className="help-text">Saving your dataset metadata…</p>}
      {saveState.status === 'error' && <p role="alert" className="error-message">{saveState.message}</p>}
      {saveState.status === 'success' && (
        <div role="status" className="save-success">
          <strong>{saveState.dataset.name} saved</strong>
          <p>{saveState.dataset.imageCount} image records saved. Status: awaiting upload.</p>
          <p className="help-text">Dataset ID: <code>{saveState.dataset.id}</code></p>
          <p className="help-text">Image contents have not been uploaded or analyzed.</p>
        </div>
      )}
      {/* TODO (you): Validate actual image contents and upload bytes to private storage. */}
    </section>
  )
}

export default DatasetUploader
