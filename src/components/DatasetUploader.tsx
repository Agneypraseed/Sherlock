import { useRef } from 'react'

interface DatasetUploaderProps {
  files: File[]
  onFilesChange: (files: File[]) => void
}

function DatasetUploader({ files, onFilesChange }: DatasetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Count and size are derived from files, rather than duplicated in state.
  const totalBytes = files.reduce((total, file) => total + file.size, 0)

  return (
    <section id="dataset-upload" aria-labelledby="dataset-upload-heading">
      <div className="section-heading">
        <div>
          <h2 id="dataset-upload-heading">Dataset</h2>
          <p>Select images to prepare your dataset.</p>
        </div>
        <span className="status-label">Local selection only</span>
      </div>

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
        A new selection replaces the current one. Files stay in your browser;
        nothing is uploaded or analyzed yet.
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
      {/* TODO (you): Validate files on the server and implement the upload API. */}
    </section>
  )
}

export default DatasetUploader
