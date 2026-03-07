## ADDED Requirements

### Requirement: AI Input Bar Clipboard Image Paste

`AIInputBar` SHALL accept image files from the system clipboard when the user is interacting with the input bar.

#### Scenario: Paste image while AI input bar is active
- **GIVEN** the user has focused the AI input textarea or another control inside `AIInputBar`
- **WHEN** the user pastes one or more clipboard image items
- **THEN** `AIInputBar` SHALL intercept the paste event
- **AND** add the pasted image resources to the input content preview
- **AND** keep them available for the next generation request as reference images

#### Scenario: Ignore paste outside AI input bar
- **GIVEN** the user focus is outside `AIInputBar`
- **WHEN** the user pastes clipboard image items
- **THEN** `AIInputBar` SHALL NOT import those images

### Requirement: Unified Local Image Intake Rules

Images entering `AIInputBar` from file selection or clipboard SHALL follow the same validation and processing rules.

#### Scenario: Reject unsupported clipboard content
- **GIVEN** the clipboard contains text or non-image files only
- **WHEN** the user pastes into `AIInputBar`
- **THEN** the existing text paste behavior SHALL remain unchanged
- **AND** no image preview item SHALL be added

#### Scenario: Apply existing image constraints
- **GIVEN** the user adds a local image through upload or paste
- **WHEN** the image exceeds the configured threshold for compression but is still within the supported size limit
- **THEN** the image SHALL be compressed before being attached
- **AND** the processed image SHALL be used for preview and generation

#### Scenario: Reject oversized image
- **GIVEN** the user adds a local image through upload or paste
- **WHEN** the image exceeds the supported maximum file size
- **THEN** the image SHALL be rejected
- **AND** the user SHALL receive an error message

### Requirement: Asset Library And Workflow Integration

Pasted images SHALL integrate with the existing asset library and workflow submission flow in the same way as uploaded images.

#### Scenario: Persist pasted image into asset library
- **GIVEN** the user pastes an image into `AIInputBar`
- **WHEN** the image is accepted by validation
- **THEN** the image SHALL be added to the asset library as a local image asset

#### Scenario: Reuse pasted image during generation
- **GIVEN** the user has pasted one or more images into `AIInputBar`
- **WHEN** the user submits a generation request
- **THEN** the resulting workflow context SHALL include those images as reference inputs
- **AND** downstream generation services SHALL receive them through the existing reference image pipeline
