# Architecture decisions and learning roadmap

The React UI and Node/Fastify metadata API now run locally with PostgreSQL.
`POST /api/datasets` saves a manifest atomically; `GET /api/datasets/:id` reads it.
Local byte uploads now store originals in `.data/images`; cloud resources,
deployment, embeddings, and the agent remain planned.
See [the implemented API contract](api.md) and the README for local setup.

## Recommended stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Browser | React + TypeScript + Vite + plain CSS | Already implemented; native React state is enough for this screen. |
| Application API | Node.js + TypeScript + Fastify | Fits your JS experience and the supplied architecture; owns auth, datasets, run lifecycle, and review decisions. |
| Investigator | One agent using the OpenAI Agents SDK for TypeScript, in the Node backend | You implement tool definitions, instructions, evidence validation, and the run loop integration. |
| ML service | Python + FastAPI + PyTorch/DINOv2 + NumPy + scikit-learn | A focused boundary for image decoding, embeddings, neighbors, and deterministic audit computations. |
| Metadata | PostgreSQL locally; Supabase recommended for hosting | Dataset and image metadata persistence is implemented. Runs, findings, evidence, and reviews follow later. |
| Image/artifact storage | A private Supabase Storage bucket | Learn cloud object storage without adding another provider immediately. Store file bytes and embedding artifacts here. |
| First hosted version | Render static site + Node web service + private Python service | Deploy frontend, application API, and ML service separately. Add a background worker when audits become long-running. |

Supabase provides a real PostgreSQL database, rather than a database API that
requires abandoning SQL. Its private buckets support access policies and signed
URLs. Render offers static sites, web services, private services, and workers.
These capabilities are documented in the official sources below. Provider costs
and suitable CPU/RAM capacity must be checked against a measured workload before
choosing paid resources.

There is a cost to two backend languages: HTTP contracts, two runtimes, and
cross-service failures. We accept it because the reference diagram explicitly
separates the TypeScript agent from Python ML. A Python-only FastAPI backend with
the Python Agents SDK would be simpler operationally if that split stops being a
learning objective. Start with a narrow service boundary, not specialist agents.

## Data ownership

- PostgreSQL stores metadata and relationships: dataset ownership, object keys,
  labels/splits, audit configuration, run state, findings, evidence references,
  tool events, and human decisions.
- Object storage stores images, thumbnails, manifests, embedding matrices, and
  reports. Store object keys in the database; generate temporary download URLs
  when needed rather than saving expired URLs as image identity.
- For a small first audit, load a versioned embedding matrix into NumPy and use
  scikit-learn for neighbor search. Add an indexed vector store only after
  measuring a need; a separate vector database is not a prerequisite.
- Compute dataset fingerprints, model/preprocessing versions, and configuration
  hashes so an old embedding cache cannot silently be reused for changed data.
- Review decisions are separate from source labels/files. A recommendation never
  implicitly deletes an image or rewrites its label.

Proposed tables, to design and migrate when you implement persistence:
`datasets`, `images`, `audit_runs`, `findings`, `evidence`, `investigation_runs`,
`tool_events`, and `reviews`. Each run references an immutable dataset version;
each finding references the producing run; each review references its finding.
Add user ownership constraints and indexes when those access paths exist.

## Request and compute flow

```text
React browser
  -> Node API: dataset metadata, authorized upload preparation, runs, reviews
       -> PostgreSQL: durable metadata and evidence references
       -> private object storage: images and artifacts
       -> Python ML service: deterministic audit computations
       -> one Investigator Agent
            -> typed tools -> Python / database reads
            -> evidence-backed recommendation -> human review
```

Keep image bytes out of the agent prompt by default. Tools return compact typed
summaries and evidence IDs; include selected images only when a deliberate visual
inspection step requires them. Keep API keys and privileged storage/database
credentials in server environment variables, never `VITE_*` variables.

For small development inputs a synchronous ML endpoint is sufficient. Before
hosting nontrivial audits, move computation into durable jobs with IDs, bounded
retries, idempotency, cancellation, and persisted progress. Return a job ID from
the API and poll status initially; streaming progress can come later. Keep the
Node request process responsive while the Python worker computes embeddings.

## One agent and verifiable evidence

The supplied diagram has dataset, vision, and evaluation specialists. Treat
those initially as responsibilities of deterministic tools, not separate agents.
Suggested contracts for YOU to implement later:

- `get_dataset_summary`: counts, splits, labels, and configuration for one dataset version.
- `compare_image_hashes`: exact byte/hash checks with referenced images.
- `get_visual_neighbors`: distances and labels using a specified embedding version.
- `get_finding_evidence`: measurements and source references for one finding.

Tool inputs need validation, dataset authorization, timeouts, and bounded output.
An LLM should interpret and challenge evidence, not invent similarity scores or
declare a label incorrect solely because most neighbors have another label.
Persist observable tool calls/results and decisions, not private chain-of-thought.
The Agents SDK provides orchestration and tracing capabilities, but using it
does not itself establish that an investigation is correct.

## Demonstrating reliability

Build a held-out benchmark from a small dataset with known injected problems:
exact duplicates across splits, near duplicates, mislabeled examples, and valid
rare examples. Freeze the dataset version and expected answers before evaluation.

Compare three systems on the same cases:

1. An LLM response given the same initial question and permitted input context.
2. Deterministic audit findings without an LLM.
3. One Investigator using bounded tools and evidence citations.

Predeclare prompt/model settings and comparable cost/time budgets; run repeated
trials where model variance matters. Measure issue precision and recall, false
positives on rare valid examples, unsupported claim rate, evidence citation
correctness, abstention behavior, latency, and cost. Report both aggregate and
per-issue outcomes. Distinguish improved evidence access from improvements due to
reasoning or orchestration. Use a held-out set for final claims, not only examples
used to tune thresholds and prompts.

Save a reproducible run record: dataset fingerprint, model/preprocessing version,
thresholds, tool inputs/results, evidence IDs, recommendation, and human decision.
The current demo UI proves none of these ML or agent quality claims.

## Deployment path

1. Implemented: local metadata API, PostgreSQL persistence, folder-aware local
   uploads, and server-backed image previews.
2. Replace local image storage with private cloud objects. Add authentication,
   server-side ownership checks, signed URLs, and limits on file size/count.
3. Implement and evaluate deterministic ML checks locally. Measure RAM and latency.
4. Add one Investigator with read-oriented tools, structured recommendations,
   evidence validation, and explicit human review for proposed mutations.
5. Deploy the frontend to Render as a static site: app root `dataset-sherlock`
   if it remains a subdirectory of the Git repository, build `npm ci && npm run build`,
   publish `dist`. If the Git root is this app folder, leave the root directory unset.
6. Deploy Node as a public web service and Python as a private service/worker.
   Bind HTTP services to `0.0.0.0` and the provider-assigned port. Use narrowly
   scoped service authentication and an explicit browser CORS origin allowlist.
7. Keep PostgreSQL and private buckets in Supabase. Choose compatible regions to
   reduce data transfer and latency. Do not use ephemeral app disks for datasets.
8. Configure migrations, health checks, persistent job recovery, request limits,
   logs, and build/evaluation gates. Revisit GPU hosting only after measurements
   show it is needed; no GPU capacity assumption is made for this deployment plan.

## Official sources

Checked 2026-10-24. Recommendations above are project design choices.

- [Supabase PostgreSQL overview](https://supabase.com/docs/guides/database/overview)
- [Supabase private buckets and access models](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Render static sites](https://render.com/docs/static-sites)
- [Render service types](https://render.com/docs/service-types)
- [Render web services and binding requirements](https://render.com/docs/web-services)
- [OpenAI SDKs: when to use the Agents SDK](https://developers.openai.com/api/docs/libraries#use-the-agents-sdk)
