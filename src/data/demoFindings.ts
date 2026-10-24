import type { Finding } from '../types'

// Fictional fixtures for developing the UI. Never treat these as audit results.
export const demoFindings: Finding[] = [
  {
    id: 'demo-duplicate',
    kind: 'duplicate',
    title: 'Two images may show the same scene',
    summary: 'A training image and a validation image look like a near-duplicate pair.',
    files: ['train/cat_014.jpg', 'validation/cat_089.jpg'],
    evidence: [
      { label: 'Example cosine similarity', value: '0.98 (illustrative, not confidence)' },
      { label: 'Dataset splits', value: 'Training / validation' },
      { label: 'Content hashes', value: 'Not checked' },
    ],
    nextCheck: 'Compare content hashes and inspect the images before deciding whether this is split leakage.',
  },
  {
    id: 'demo-label-conflict',
    kind: 'label-conflict',
    title: 'A label disagrees with its visual neighbors',
    summary: 'An image labeled dog is surrounded by mostly cat-labeled examples.',
    files: ['train/dog_042.jpg', 'train/cat_015.jpg', 'train/cat_031.jpg'],
    evidence: [
      { label: 'Assigned label', value: 'dog' },
      { label: 'Example neighbor labels', value: '8 of 10 labeled cat (illustrative)' },
      { label: 'Visual confirmation', value: 'Not performed' },
    ],
    nextCheck: 'Inspect the image and its neighbors. Neighbor agreement alone does not prove that a label is wrong.',
  },
  {
    id: 'demo-outlier',
    kind: 'outlier',
    title: 'An image may be unusual within its class',
    summary: 'One example sits far from the other examples with the same label.',
    files: ['train/bird_107.jpg'],
    evidence: [
      { label: 'Assigned label', value: 'bird' },
      { label: 'Example distance percentile', value: '99th percentile (illustrative)' },
      { label: 'Possible explanations', value: 'Rare example, unusual crop, or incorrect label' },
    ],
    nextCheck: 'Check image quality and class diversity before flagging a valid rare example as an error.',
  },
]
