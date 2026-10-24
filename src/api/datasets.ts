import type { CreateDatasetRequest, DatasetRecord } from '../../shared/datasets'

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
