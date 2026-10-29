import { useRef, useState } from 'react'
import { IMAGE_MIME_TYPES, MAX_IMAGES } from '../../shared/datasets'
import type { DatasetSaveState } from '../types'
import Icon from './Icon'

interface DatasetUploaderProps {
  files: File[]
  name: string
  saveState: DatasetSaveState
  onFilesChange: (files: File[]) => void
  onNameChange: (name: string) => void
  onSave: () => Promise<void>
  onReset: () => void
}

function DatasetUploader({ files, name, saveState, onFilesChange, onNameChange, onSave, onReset }: DatasetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [selectionNotice, setSelectionNotice] = useState('')
  const isSaving = saveState.status === 'saving'
  // Count and size are derived from files, rather than duplicated in state.
  const totalBytes = files.reduce((total, file) => total + file.size, 0)

  function addFiles(incoming: File[]) {
    const accepted = incoming.filter((file) => IMAGE_MIME_TYPES.some((type) => type === file.type))
    const ignoredCount = incoming.length - accepted.length
    const merged = new Map(files.map((file) => [fileKey(file), file]))
    const countBefore = merged.size
    for (const file of accepted) merged.set(fileKey(file), file)
    const addedCount = merged.size - countBefore
    const duplicateCount = accepted.length - addedCount
    if (addedCount > 0) onFilesChange(Array.from(merged.values()))
    setSelectionNotice([
      ignoredCount > 0 ? `${ignoredCount} unsupported ${ignoredCount === 1 ? 'file was' : 'files were'} skipped.` : '',
      duplicateCount > 0 ? `${duplicateCount} already-selected ${duplicateCount === 1 ? 'image was' : 'images were'} skipped.` : '',
    ].filter(Boolean).join(' '))
  }

  return (
    <section id="dataset-upload" aria-labelledby="dataset-upload-heading">
      <div className="section-heading">
        <div>
          <h2 id="dataset-upload-heading">Dataset</h2>
          <p>Add images in batches or choose a folder, then upload once.</p>
        </div>
        <span className="status-label">Local storage</span>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void onSave() }} aria-busy={isSaving}>
        <fieldset className="dataset-fields" disabled={isSaving || saveState.status === 'success'}>
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
              <div className="image-selection">
                <label className="file-label" htmlFor="dataset-files">Add images</label>
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
                      if (selected.length > 0) addFiles(selected)
                      // Permit choosing the same file again after removing it.
                      event.currentTarget.value = ''
                    }}
                  />
                  <div className="file-picker-copy" aria-hidden="true">
                    <Icon name="image" size={30} />
                    <strong>Choose image files</strong>
                    <span id="file-limits">Add more any time · Up to {MAX_IMAGES.toLocaleString('en-US')} images</span>
                  </div>
                </div>
                <div className="folder-picker">
                  <input
                    id="dataset-folder"
                    ref={(element) => {
                      folderInputRef.current = element
                      if (element) element.webkitdirectory = true
                    }}
                    className="visually-hidden-file-input"
                    type="file"
                    multiple
                    accept="image/*"
                    aria-describedby="file-limits file-selection-help"
                    onChange={(event) => {
                      const selected = Array.from(event.currentTarget.files ?? [])
                      if (selected.length > 0) addFiles(selected)
                      event.currentTarget.value = ''
                    }}
                  />
                  <label className="secondary-button" htmlFor="dataset-folder">Add a folder</label>
                  <span className="help-text">Folder names are kept for each image.</span>
                </div>
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="file-list" aria-label="Selected image files">
              {files.map((file, index) => (
                <li key={`${fileKey(file)}-${index}`}>
                  <span className="file-list-name"><Icon name="file" size={17} /><span>{file.webkitRelativePath || file.name}</span></span>
                  <span className="help-text">{Math.ceil(file.size / 1024)} KiB</span>
                  <button type="button" className="text-button remove-file" aria-label={`Remove ${file.webkitRelativePath || file.name}`} onClick={() => {
                    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))
                    setSelectionNotice('')
                  }}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {files.length > MAX_IMAGES && <p className="error-message" role="alert">
            This dataset has {files.length} images. Remove at least {files.length - MAX_IMAGES} to upload the {MAX_IMAGES.toLocaleString('en-US')}-image limit.
          </p>}

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
                    if (folderInputRef.current) folderInputRef.current.value = ''
                    onFilesChange([])
                    setSelectionNotice('')
                  }}>
                    Clear selection
                  </button>
                )}
              </div>
              {selectionNotice && <p className="selection-notice" role="status">{selectionNotice}</p>}
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
                  ? <img src={image.url ?? undefined} alt={image.relativePath} loading="lazy" />
                  : <span className="help-text">Preview unavailable for this format</span>}
                <span>{image.relativePath}</span>
              </a>
            </li>)}
          </ul>
          <button type="button" className="secondary-button new-dataset-button" onClick={() => {
            setSelectionNotice('')
            onReset()
          }}>Start another dataset</button>
        </div>
      )}
      {/* TODO (you): Add image decoding checks, dataset analysis, and evidence-backed findings. */}
    </section>
  )
}

export default DatasetUploader

function fileKey(file: File) {
  return `${file.webkitRelativePath || file.name}\0${file.size}\0${file.lastModified}\0${file.type}`
}
