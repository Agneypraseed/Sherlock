import { findingKindLabels, reviewDecisionLabels } from '../types'
import type { Finding, ReviewDecision } from '../types'

// A proposed plan, not a run log. No step invokes tools or a model.
const investigationSteps = [
  { title: 'Inspect dataset context', detail: 'Check labels, splits, image metadata, and audit configuration.' },
  { title: 'Retrieve supporting evidence', detail: 'Inspect hashes, embeddings, and nearest neighbors.' },
  { title: 'Test alternative explanations', detail: 'Distinguish likely errors from valid rare examples.' },
  { title: 'Present a recommendation', detail: 'Cite evidence and limitations for human review.' },
]

interface InvestigationPanelProps {
  finding: Finding | null
  decision: ReviewDecision
  onReview: (decision: ReviewDecision) => void
}

function InvestigationPanel({ finding, decision, onReview }: InvestigationPanelProps) {
  return (
    <section id="investigation" className="investigation-panel" aria-labelledby="investigation-heading">
      <div className="section-heading">
        <div>
          <h2 id="investigation-heading">Investigation</h2>
          <p>One Investigator Agent, backed by verifiable tools.</p>
        </div>
      </div>
      <p className="plan-note"><span className="plan-dot" aria-hidden="true" />Static plan · no model is called.</p>

      <ol className="investigation-steps">
        {investigationSteps.map((step, index) => (
          <li key={step.title}>
            <span className="step-number" aria-hidden="true">{index + 1}</span>
            <div><strong>{step.title}</strong><p>{step.detail}</p></div>
          </li>
        ))}
      </ol>

      <div className="evidence-detail">
        {finding ? (
          <>
            <span className="finding-kind">{findingKindLabels[finding.kind]} · demo</span>
            <h3>{finding.title}</h3>
            <h4>Example files</h4>
            <ul className="evidence-files">
              {finding.files.map((file) => <li key={file}><code>{file}</code></li>)}
            </ul>
            <h4>Illustrative evidence</h4>
            <dl>
              {finding.evidence.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            <h4>What to verify next</h4>
            <p>{finding.nextCheck}</p>
            <fieldset className="review-actions">
              <legend>Your review</legend>
              <button type="button" aria-pressed={decision === 'keep'} onClick={() => onReview('keep')}>
                Keep for review
              </button>
              <button type="button" className="secondary-button" aria-pressed={decision === 'dismiss'} onClick={() => onReview('dismiss')}>
                Dismiss finding
              </button>
              {decision !== 'unreviewed' && (
                <button type="button" className="text-button" onClick={() => onReview('unreviewed')}>Reset review</button>
              )}
            </fieldset>
            <p className="help-text" role="status">{reviewDecisionLabels[decision]}. Review choices are local and reset on reload; no files or labels are changed.</p>
          </>
        ) : (
          <p className="help-text">Select a finding to inspect its evidence here.</p>
        )}
      </div>
      {/* TODO (you): Implement the Investigator with the Agents SDK on the server. */}
      {/* TODO (you): Feed this panel persisted tool evidence and public run events. */}
    </section>
  )
}

export default InvestigationPanel
