import { useRef } from 'react'
import { MAX_IMAGES } from '../../shared/datasets'
import type { DatasetSaveState } from '../types'
import Icon from './Icon'

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
          <p>Name your dataset and upload its images.</p>
        </div>
        <span className="status-label">Local storage</span>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void onSave() }} aria-busy={isSaving}>
        <fieldset className="dataset-fields" disabled={isSaving}>
          <div className="dataset-form-grid">
            <div>
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
            </div>
            <div>
              <label className="file-label" htmlFor="dataset-files">Choose image files</label>
              <div className="file-picker">
                <input
                  id="dataset-files"
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-describedby="file-limits file-selection-help"
                  onChange={(event) => {
                    const selected = Array.from(event.currentTarget.files ?? [])
                    // Canceling the picker must not erase the current selection.
                    if (selected.length > 0) onFilesChange(selected)
                  }}
                />
                <div className="file-picker-copy" aria-hidden="true">
                  <Icon name="image" size={30} />
                  <strong>{files.length > 0 ? 'Replace image files' : 'Choose image files'}</strong>
                  <span id="file-limits">Up to {MAX_IMAGES.toLocaleString('en-US')} images · 100 MiB each</span>
                </div>
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="file-list" aria-label="Selected image files">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <span className="file-list-name"><Icon name="file" size={17} /><span>{file.name}</span></span>
                  <span className="help-text">{Math.ceil(file.size / 1024)} KiB</span>
                </li>
              ))}
            </ul>
          )}

          <div className="dataset-footer">
            <div className="dataset-summary">
              <div className="selection-summary" aria-live="polite">
                {files.length === 0 ? 'No images selected.' : (
                  <span>{files.length} {files.length === 1 ? 'image' : 'images'} selected · {(totalBytes / 1024 / 1024).toFixed(2)} MiB</span>
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
              <p id="file-selection-help" className="help-text">
                Images are saved on this computer. Uploading does not run an audit.
              </p>
            </div>
            <button type="submit" disabled={!name.trim() || files.length === 0 || files.length > MAX_IMAGES || saveState.status === 'success'}>
              {isSaving ? 'Uploading…' : saveState.status === 'success' ? <><Icon name="check" size={17} />Images uploaded</> : saveState.status === 'error' ? 'Retry upload' : 'Upload dataset'}
            </button>
          </div>
        </fieldset>
      </form>

      {saveState.status === 'saving' && <div role="status" className="request-feedback help-text">
        <p>Uploaded {saveState.completed} of {saveState.total} images. Keep this page open until the upload finishes.</p>
        <progress value={saveState.completed} max={saveState.total} aria-label="Image upload progress" />
      </div>}
      {saveState.status === 'error' && <p role="alert" className="error-message">{saveState.message}</p>}
      {saveState.status === 'success' && (
        <div role="status" className="save-success">
          <strong>{saveState.dataset.name} saved</strong>
          <p>{saveState.dataset.imageCount} {saveState.dataset.imageCount === 1 ? 'image' : 'images'} uploaded and saved.</p>
          <p className="help-text">Dataset ID: <code>{saveState.dataset.id}</code></p>
          <p className="help-text">Open a preview to view the stored original. Analysis comes next.</p>
          <ul className="uploaded-images" aria-label="Uploaded images">
            {saveState.dataset.images.map((image) => <li key={image.id}>
              <a href={image.url ?? undefined} target="_blank" rel="noreferrer">
                {['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(image.mimeType)
                  ? <img src={image.url ?? undefined} alt={image.filename} loading="lazy" />
                  : <span className="help-text">Preview unavailable for this format</span>}
                <span>{image.filename}</span>
              </a>
            </li>)}
          </ul>
        </div>
      )}
      {/* TODO (you): Add image decoding checks, dataset analysis, and evidence-backed findings. */}
    </section>
  )
}

export default DatasetUploader
