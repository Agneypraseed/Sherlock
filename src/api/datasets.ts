import type { CreateDatasetRequest, DatasetDetails, DatasetRecord } from '../../shared/datasets'

export async function saveDataset(input: CreateDatasetRequest): Promise<DatasetRecord> {
  let response: Response
  try {
    response = await fetch('/api/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('Could not reach the dataset service. Check that the API is running and try again.')
  }

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof result?.error?.message === 'string'
      ? result.error.message
      : 'Could not save the dataset. Check that the API and database are running.')
  }
  if (!result || typeof result.id !== 'string' || result.status !== 'awaiting_upload'
    || typeof result.name !== 'string' || !Number.isInteger(result.imageCount)
    || !Number.isSafeInteger(result.totalBytes) || typeof result.createdAt !== 'string') {
    throw new Error('The dataset service returned an unexpected response.')
  }
  return result as DatasetRecord
}

export async function getDataset(id: string, signal = AbortSignal.timeout(15000)): Promise<DatasetDetails> {
  const response = await fetch(`/api/datasets/${id}`, { signal })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message ?? 'Could not load the saved dataset.')
  if (!result || result.id !== id || !Array.isArray(result.images)) throw new Error('Unexpected dataset response.')
  return result as DatasetDetails
}

export async function listDatasets(): Promise<DatasetRecord[]> {
  const response = await fetch('/api/datasets', { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Could not load saved datasets. Check the API and database, then retry.')
  return response.json()
}

export async function appendImages(id: string, images: CreateDatasetRequest['images']): Promise<DatasetDetails> {
  const response = await fetch(`/api/datasets/${id}/images`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }), signal: AbortSignal.timeout(15000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message ?? 'Could not add images to this dataset.')
  return result
}

export async function validateDataset(id: string): Promise<DatasetDetails> {
  const response = await fetch(`/api/datasets/${id}/validate`, { method: 'POST', signal: AbortSignal.timeout(120000) })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error?.message ?? 'Could not validate stored images.')
  return result
}

export async function uploadImage(datasetId: string, imageId: string, file: File): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/datasets/${datasetId}/images/${imageId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
      body: file, signal: AbortSignal.timeout(120000),
    })
  } catch {
    throw new Error(`Could not upload ${file.name}. Check the connection and retry.`)
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error?.message ?? `Could not upload ${file.name}. Please retry.`)
  }
}
