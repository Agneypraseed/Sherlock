import { findingKindLabels, reviewDecisionLabels } from '../types'
import type { Finding, FindingFilter, ReviewDecision } from '../types'
import Icon from './Icon'

interface FindingsPanelProps {
  findings: Finding[]
  filter: FindingFilter
  selectedFindingId: string | null
  decisions: Record<string, ReviewDecision>
  isDemo: boolean
  onFilterChange: (filter: FindingFilter) => void
  onSelectFinding: (id: string) => void
  onToggleDemo: () => void
}

function FindingsPanel({
  findings, filter, selectedFindingId, decisions, isDemo,
  onFilterChange, onSelectFinding, onToggleDemo,
}: FindingsPanelProps) {
  return (
    <section id="audit-findings" className="findings-panel" aria-labelledby="audit-findings-heading">
      <div className="section-heading">
        <div>
          <h2 id="audit-findings-heading">Findings</h2>
          <p>Review potential dataset issues and their evidence.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onToggleDemo}>
          {isDemo ? 'Close demo' : 'Load demo findings'}
        </button>
      </div>

      {isDemo ? (
        <>
          <p className="notice">Demo data: these fictional findings are unrelated to your selected files.</p>
          <div className="filter-row">
            <label htmlFor="finding-filter">Issue type</label>
            <select
              id="finding-filter"
              value={filter}
              onChange={(event) => onFilterChange(event.currentTarget.value as FindingFilter)}
            >
              <option value="all">All issues</option>
              <option value="duplicate">Possible duplicates</option>
              <option value="label-conflict">Label conflicts</option>
              <option value="outlier">Visual outliers</option>
            </select>
            <span className="help-text" aria-live="polite">{findings.length} shown</span>
          </div>
          <ul className="findings-list" aria-label="Demo findings">
            {findings.map((finding) => (
              <li key={finding.id}>
                <button
                  type="button"
                  className="finding-button"
                  aria-pressed={selectedFindingId === finding.id}
                  onClick={() => onSelectFinding(finding.id)}
                >
                  <span className="finding-kind">{findingKindLabels[finding.kind]}</span>
                  <strong>{finding.title}</strong>
                  <span>{finding.summary}</span>
                  <span className="review-status">{reviewDecisionLabels[decisions[finding.id] ?? 'unreviewed']}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon"><Icon name="file-search" size={40} /></span>
          <h3>No audit results yet</h3>
          <p>Load the demo to explore the review interface.</p>
        </div>
      )}
      {/* TODO (you): Replace demo fixtures with findings from a completed audit run. */}
    </section>
  )
}

export default FindingsPanel
