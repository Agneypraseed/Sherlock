import type { DatasetDetails } from '../shared/datasets'

export type DatasetSaveState =
  | { status: 'idle' }
  | { status: 'saving'; completed: number; total: number }
  | { status: 'success'; dataset: DatasetDetails }
  | { status: 'error'; message: string }

export type FindingKind = 'duplicate' | 'label-conflict' | 'outlier'
export type FindingFilter = 'all' | FindingKind
export type ReviewDecision = 'unreviewed' | 'keep' | 'dismiss'

export interface Finding {
  id: string
  kind: FindingKind
  title: string
  summary: string
  files: string[]
  evidence: { label: string; value: string }[]
  nextCheck: string
}

export const findingKindLabels: Record<FindingKind, string> = {
  duplicate: 'Possible duplicate',
  'label-conflict': 'Label conflict',
  outlier: 'Visual outlier',
}

export const reviewDecisionLabels: Record<ReviewDecision, string> = {
  unreviewed: 'Not reviewed',
  keep: 'Kept for review',
  dismiss: 'Dismissed',
}
