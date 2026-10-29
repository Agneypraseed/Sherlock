import type { DatasetDetails, DatasetRecord } from '../../shared/datasets'

const statusLabels: Record<DatasetRecord['status'], string> = {
  awaiting_upload: 'Waiting for files', uploading: 'Incomplete', ready: 'Images validated', needs_attention: 'Needs attention',
}
function statusLabel(dataset: DatasetRecord) {
  return dataset.status === 'uploading' && dataset.uploadedCount === dataset.imageCount ? 'Needs validation' : statusLabels[dataset.status]
}

interface Props {
  datasets: DatasetRecord[]
  selected: DatasetDetails | null
  busy: boolean
  error: string
  onOpen: (id: string) => void
  onNew: () => void
  onRetry: () => void
  onValidate: () => void
}

export default function DatasetLibrary({ datasets, selected, busy, error, onOpen, onNew, onRetry, onValidate }: Props) {
  return <section className="dataset-library" aria-labelledby="library-heading">
    <div className="section-heading">
      <div><h2 id="library-heading">Saved datasets</h2><p>Reopen a dataset to inspect its files, resume an upload, or add more images.</p></div>
      <button className="secondary-button" disabled={busy} onClick={onNew}>New dataset</button>
    </div>
    {error && <p role="alert" className="error-message">{error} <button className="text-button" onClick={onRetry} disabled={busy}>Retry</button></p>}
    {!datasets.length && !error && <p className="help-text">{busy ? 'Loading datasets…' : 'Your saved datasets will appear here.'}</p>}
    <ul className="dataset-list" aria-label="Saved datasets">
      {datasets.map((dataset) => <li key={dataset.id}>
        <div><strong>{dataset.name}</strong><span className="help-text">{dataset.uploadedCount} / {dataset.imageCount} uploaded · {statusLabel(dataset)}</span></div>
        <button className="secondary-button" disabled={busy} aria-pressed={selected?.id === dataset.id} onClick={() => onOpen(dataset.id)}>
          {selected?.id === dataset.id ? 'Reopen' : 'Open'}<span className="sr-only"> {dataset.name}</span>
        </button>
      </li>)}
    </ul>
    {selected && <div className="stored-dataset">
      <h3>{selected.name}</h3>
      <p className="help-text">{selected.uploadedCount} of {selected.imageCount} files uploaded · {statusLabel(selected)}</p>
      {selected.images.some((image) => !image.uploadedAt || image.validationError) && <p className="notice">
        Reselect the original files or folder below to finish this upload. Match the saved relative paths. You can also add new files.
        File contents cannot be retained by the browser after refresh.
      </p>}
      {selected.images.some((image) => image.uploadedAt && !image.verifiedAt) && <button className="secondary-button" disabled={busy} onClick={onValidate}>Validate stored images</button>}
      <ul className="stored-images" aria-label="Stored image records">
        {selected.images.map((image) => <li key={image.id}>
          {image.url && <a href={image.url} target="_blank" rel="noreferrer">
            {image.mimeType === 'image/tiff' ? <span className="help-text">Open TIFF original</span>
              : <img src={image.url} alt={image.relativePath ?? image.filename} loading="lazy" />}
          </a>}
          <div><strong>{image.relativePath ?? image.filename}</strong>
            <span className="help-text">{image.validationError ?? (image.width && image.height ? `${image.width} × ${image.height} · ${image.format}` : image.uploadedAt ? 'Awaiting decode validation' : 'Waiting for file')}</span>
          </div>
        </li>)}
      </ul>
    </div>}
  </section>
}
