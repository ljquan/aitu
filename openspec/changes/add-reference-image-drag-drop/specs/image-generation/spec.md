## ADDED Requirements

### Requirement: Image Generation Dialog SHALL Accept Local Reference Image Drops

The AI image generation dialog SHALL accept local image files dropped anywhere within the dialog and add accepted files to its reference images through the existing upload pipeline.

#### Scenario: Drop local images anywhere in the dialog
- **GIVEN** the AI image generation dialog is open and not generating
- **WHEN** the user drags and drops one or more local image files anywhere within the dialog
- **THEN** the dialog SHALL process the files through the same validation, compression, asset-library, and reference-image path used by file selection
- **AND** accepted images SHALL appear in the reference image preview

#### Scenario: Enforce existing reference image constraints
- **GIVEN** the dialog has a configured reference image count or file size limit
- **WHEN** dropped files exceed the remaining count, use an unsupported type, or exceed the supported size
- **THEN** the dialog SHALL apply the existing upload constraints and user feedback
- **AND** SHALL NOT introduce different limits for drag-and-drop

#### Scenario: Handle nested drop targets once
- **GIVEN** the dialog contains the existing reference image upload drop target
- **WHEN** the user drops local images on that nested target
- **THEN** each accepted file SHALL be imported exactly once

#### Scenario: Preserve unrelated drag behavior
- **WHEN** dragged content contains text, a web URL, HTML, or an internal canvas element without local files
- **THEN** the dialog SHALL NOT import it as a reference image
- **AND** SHALL NOT suppress unrelated drag behavior outside the dialog

#### Scenario: Ignore drops while generating
- **GIVEN** the dialog is generating and reference image input is disabled
- **WHEN** the user drops local image files into the dialog
- **THEN** no reference image SHALL be added
