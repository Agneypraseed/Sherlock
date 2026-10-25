# Dashboard visual refresh

The concept was generated with the built-in image generation tool and implemented
as native React, CSS, and SVG. The raster image is a reference, not application UI.

## Design specification

- Neutral `#f7f8fa` page, true white panels, `#e5e9e7` borders, `#1c2722` text.
- Forest `#2e624c` accent; no gradients, background illustrations, or decorative charts.
- System sans typography: 44px desktop title, 24px section titles, 14px controls.
- A 1240px content maximum, 14px panel corners, 26–28px panel padding.
- Horizontal navigation; two-column dataset form; findings and investigation below.
- Mobile stacks the form and panels, with a full-width primary button.
- Small outline SVG search/image/document icons; quiet numbered investigation steps.

## Allowed interface content

The existing product name, navigation, dashboard heading/subtitle, Dataset,
Findings, Investigation, Metadata only, name/file labels, existing save actions,
review/filter actions, demo disclosure, and request feedback are retained.
The concept shortens empty-state and static-plan descriptions without changing
the workflow or claiming that uploads, audit results, or agent execution exist.

The file picker remains a native file input. Its visible surface is styled via an
input overlay and a decorative copy layer, with keyboard focus shown on its frame.
No drag-and-drop capability is claimed. All existing state and API behavior stays
in the existing Dashboard and request helper.

## Concept prompt

Clean, minimal DatasetSherlock dashboard. White panels on a soft neutral canvas,
forest accent, readable sans typography, a compact two-column metadata form,
quiet findings empty state, and static numbered investigation timeline. Preserve
the existing workflow; no new features, charts, metrics, account controls, or
agent execution. Desktop concept covers the complete primary screen.

## Intentional implementation choices

- System fonts replace the raster concept's approximate font; no font downloads.
- Selected-file, demo, review, and request feedback states extend the same tokens.
- Working input limits and disclosure text are retained from the current application.

## Verification and concept comparison

Verified with the in-app browser on 2026-10-25. Final desktop viewport:
1435 × 1096 (the concept's native dimensions). Mobile checks: 390 × 844 and
320 × 740. Saved captures use the browser screenshot API; viewport capture
was reliable when full-document captures intermittently failed.

`view_image` was used to inspect the concept, desktop preview, and mobile preview
in the same final comparison pass. The implementation was verified against the
concept's hierarchy and visual system, with system-font rendering as the
intentional difference described above.

| Comparison | Result / correction |
| --- | --- |
| Layout | Header, title, dataset form, and two lower panels retain the concept order and alignment. Desktop dataset starts at about 225px; lower panels at about 608px. |
| Palette | True white panels on the neutral background; forest accents, quiet borders, no gradients or image overlays. |
| Typography | Increased the title, small form labels, and timeline text after the first screenshot. Controls and descriptions have explicit sizes. |
| Spacing | Reduced excess form/footer and timeline spacing so the complete empty dashboard fits the concept's native viewport. |
| Icons | Native SVG search, image, document/search, and numbered timeline indicators match their roles and share a consistent stroke. |
| Copy | Navigation, headings, actions, metadata disclosure, empty-state copy, and static plan follow the concept. Above-the-fold copy audit found no unplanned additions. |
| Responsive behavior | Form and panels stack on mobile; the button becomes full width; long filenames wrap and page content does not overflow horizontally. |
| Interaction | Native picker, keyboard focus ring, file replacement/clearing, filters, selected finding, per-finding reviews, API success, and server validation errors checked. |

The successful metadata-save check used real PostgreSQL. The temporary dataset
was removed after verification. No backend behavior or dependency changes were
needed for this refresh. No material visual mismatches remain beyond the
intentional system-font rendering difference.
