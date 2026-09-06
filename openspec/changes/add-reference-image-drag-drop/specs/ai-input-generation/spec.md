## ADDED Requirements

### Requirement: AI Input Bar SHALL Accept Local Image File Drops

The AI input bar SHALL accept local image files dropped anywhere within its visible container and attach accepted images through the existing reference-input flow.

#### Scenario: Drop local images into the AI input bar
- **GIVEN** the AI input bar is enabled
- **WHEN** the user drags and drops one or more local image files anywhere within the AI input bar
- **THEN** the input bar SHALL validate and process the files through the same path used by local file selection
- **AND** accepted images SHALL appear in the existing content preview
- **AND** accepted images SHALL remain available as reference inputs for the next generation request

#### Scenario: Show valid drop feedback
- **GIVEN** the AI input bar is enabled
- **WHEN** a drag containing local files enters the AI input bar
- **THEN** the input bar SHALL show a visible drop-active state without changing its layout dimensions
- **AND** it SHALL clear that state when the drag leaves or the drop completes

#### Scenario: Preserve non-file drag behavior
- **WHEN** dragged content contains text, a web URL, HTML, or an internal canvas element without local files
- **THEN** the AI input bar SHALL NOT import it as a reference image
- **AND** SHALL NOT globally suppress the existing text or canvas drag behavior

#### Scenario: Ignore drops while disabled
- **GIVEN** the AI input bar is disabled during submission
- **WHEN** the user drops local image files into it
- **THEN** no image SHALL be added
