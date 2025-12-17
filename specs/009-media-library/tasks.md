# Tasks: 素材管理库 (Media Library)

**Input**: Design documents from `/specs/009-media-library/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/asset-storage-service.md, research.md, quickstart.md

**Tests**: Tests are NOT explicitly requested in the specification, therefore NO test tasks are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- Monorepo structure: `packages/drawnix/src/` for source code
- Components: `packages/drawnix/src/components/media-library/`
- Services: `packages/drawnix/src/services/`
- Types: `packages/drawnix/src/types/`
- Contexts: `packages/drawnix/src/contexts/`
- Utils: `packages/drawnix/src/utils/`
- Constants: `packages/drawnix/src/constants/`
- Hooks: `packages/drawnix/src/hooks/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for media library

- [x] T001 Create directory structure for media library at packages/drawnix/src/components/media-library/
- [x] T002 [P] Create constants file at packages/drawnix/src/constants/ASSET_CONSTANTS.ts
- [x] T003 [P] Export media library components from packages/drawnix/src/components/media-library/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data types and storage service that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Define AssetType and AssetSource enums in packages/drawnix/src/types/asset.types.ts
- [x] T005 [P] Define Asset interface in packages/drawnix/src/types/asset.types.ts
- [x] T006 [P] Define StoredAsset interface and conversion functions in packages/drawnix/src/types/asset.types.ts
- [x] T007 [P] Define FilterState, SelectionMode, and related types in packages/drawnix/src/types/asset.types.ts
- [x] T008 [P] Define StorageQuota and StorageStatus types in packages/drawnix/src/types/asset.types.ts
- [x] T009 [P] Define AssetContextState and AssetContextActions interfaces in packages/drawnix/src/types/asset.types.ts
- [x] T010 [P] Define component props interfaces (MediaLibraryModalProps, AssetGridItemProps, etc.) in packages/drawnix/src/types/asset.types.ts
- [x] T011 Create factory function createAsset in packages/drawnix/src/types/asset.types.ts
- [x] T012 Implement AssetStorageService class with initialize method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T013 Implement addAsset method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T014 Implement getAllAssets method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T015 Implement getAssetById method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T016 Implement renameAsset method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T017 Implement removeAsset method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T018 Implement clearAll method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T019 Implement checkQuota method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T020 Implement canAddAsset method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T021 Implement getStorageStats method in packages/drawnix/src/services/asset-storage-service.ts
- [x] T022 Add error classes (AssetStorageError, QuotaExceededError, NotFoundError, ValidationError) in packages/drawnix/src/services/asset-storage-service.ts
- [x] T023 [P] Create validation functions (validateAssetName, validateMimeType, getAssetType) in packages/drawnix/src/utils/asset-utils.ts
- [x] T024 [P] Create filterAssets function in packages/drawnix/src/utils/asset-utils.ts
- [x] T025 [P] Create storage quota utility functions in packages/drawnix/src/utils/storage-quota.ts
- [x] T026 Create AssetContext with state management in packages/drawnix/src/contexts/AssetContext.tsx
- [x] T027 Implement useAssets hook in packages/drawnix/src/contexts/AssetContext.tsx
- [x] T028 Integrate AssetProvider in packages/drawnix/src/drawnix.tsx

**Checkpoint**: ✅ Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 浏览和管理已有素材 (Priority: P1) 🎯 MVP

**Goal**: 用户能够通过AI生成对话框访问素材库，查看所有历史素材（AI生成和本地上传的图片/视频），并支持基本的浏览和分类查看功能

**Independent Test**: 在AI生成对话框中点击"选择参考图"按钮打开素材库界面，验证能够显示所有历史素材，支持按类型和来源筛选

### Implementation for User Story 1

- [ ] T029 [P] [US1] Create MediaLibraryModal container component in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [ ] T030 [P] [US1] Create MediaLibraryModal styles with BEM naming in packages/drawnix/src/components/media-library/MediaLibraryModal.scss
- [ ] T031 [P] [US1] Create MediaLibraryGrid component in packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx
- [ ] T032 [P] [US1] Create MediaLibraryGrid styles in packages/drawnix/src/components/media-library/MediaLibraryGrid.scss
- [ ] T033 [P] [US1] Create AssetGridItem component with React.memo in packages/drawnix/src/components/media-library/AssetGridItem.tsx
- [ ] T034 [P] [US1] Create AssetGridItem styles with BEM naming in packages/drawnix/src/components/media-library/AssetGridItem.scss
- [ ] T035 [P] [US1] Create MediaLibraryEmpty component for empty state in packages/drawnix/src/components/media-library/MediaLibraryEmpty.tsx
- [ ] T036 [P] [US1] Create MediaLibrarySidebar component with type and source filters in packages/drawnix/src/components/media-library/MediaLibrarySidebar.tsx
- [ ] T037 [P] [US1] Create MediaLibrarySidebar styles in packages/drawnix/src/components/media-library/MediaLibrarySidebar.scss
- [ ] T038 [P] [US1] Create MediaLibraryStorageBar component in packages/drawnix/src/components/media-library/MediaLibraryStorageBar.tsx
- [ ] T039 [US1] Implement filter state management in AssetContext (setFilters method) in packages/drawnix/src/contexts/AssetContext.tsx
- [ ] T040 [US1] Implement selected asset state management in AssetContext (setSelectedAssetId method) in packages/drawnix/src/contexts/AssetContext.tsx
- [ ] T041 [US1] Implement storage quota checking in AssetContext (checkStorageQuota method) in packages/drawnix/src/contexts/AssetContext.tsx
- [ ] T042 [US1] Add search functionality to filters in MediaLibrarySidebar in packages/drawnix/src/components/media-library/MediaLibrarySidebar.tsx
- [ ] T043 [US1] Add sort options to MediaLibrarySidebar (DATE_DESC, DATE_ASC, NAME_ASC) in packages/drawnix/src/components/media-library/MediaLibrarySidebar.tsx
- [ ] T044 [US1] Implement responsive layout for mobile in MediaLibraryModal.scss in packages/drawnix/src/components/media-library/MediaLibraryModal.scss

**Checkpoint**: At this point, User Story 1 should be fully functional - users can open media library, view all assets, and filter by type/source

---

## Phase 4: User Story 2 - 从素材库选择参考图片用于AI生成 (Priority: P1)

**Goal**: 用户可以在AI生图/生视频对话框中从素材库快速选择已有图片作为参考图，而不是每次都从本地文件夹中寻找

**Independent Test**: 在AI生图/生视频对话框中点击选择参考图按钮，验证能够打开素材库选择界面，选中素材后能够正确应用到生成参数中

### Implementation for User Story 2

- [x] T045 [P] [US2] Create MediaLibraryInspector component for asset details in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T046 [P] [US2] Create MediaLibraryInspector styles in packages/drawnix/src/components/media-library/MediaLibraryInspector.scss
- [x] T047 [US2] Add onSelect callback handling in MediaLibraryModal in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [x] T048 [US2] Add filterType prop support to MediaLibraryModal for filtering only images in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [x] T049 [US2] Implement double-click to select in AssetGridItem in packages/drawnix/src/components/media-library/AssetGridItem.tsx
- [x] T050 [US2] Add "使用到画板" button in MediaLibraryInspector in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T051 [US2] Modify AI image generation dialog to add media library selection option in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [x] T052 [US2] Add state management for showMediaLibrary and referenceImage in ai-image-generation.tsx in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [x] T053 [US2] Integrate MediaLibraryModal with onSelect callback in ai-image-generation.tsx in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [x] T054 [US2] Add source selector buttons (从素材库选择 / 从本地选择) in ai-image-generation.tsx in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [x] T055 [US2] Modify AI video generation dialog to add media library selection option in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx
- [x] T056 [US2] Integrate MediaLibraryModal with filterType=IMAGE in ai-video-generation.tsx in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - users can select assets from library as reference images in AI generation dialogs

---

## Phase 5: User Story 3 - 上传新素材到素材库 (Priority: P2)

**Goal**: 用户能够直接向素材库上传本地的图片和视频文件，以便统一管理所有素材资源

**Independent Test**: 打开素材库，点击上传按钮或拖拽文件到界面，验证文件能够成功添加到素材库并正确显示

### Implementation for User Story 3

- [x] T057 [P] [US3] Add file upload button to MediaLibraryModal toolbar in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [x] T058 [P] [US3] Create file input handler for local file selection in MediaLibraryModal in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [x] T059 [US3] Implement drag and drop functionality in MediaLibraryGrid in packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx
- [x] T060 [US3] Add drag-over visual feedback styling in MediaLibraryGrid.scss in packages/drawnix/src/components/media-library/MediaLibraryGrid.scss
- [x] T061 [US3] Implement file validation (type and MIME) before upload in packages/drawnix/src/utils/asset-utils.ts
- [x] T062 [US3] Add magic number validation for security in packages/drawnix/src/utils/asset-utils.ts
- [x] T063 [US3] Handle file upload errors and display user-friendly messages in MediaLibraryModal in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [ ] T064 [US3] Add "从本地文件选择" button in MediaLibraryInspector for quick upload in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T065 [US3] Ensure newly uploaded assets appear at the top of the list (sort by createdAt DESC) in MediaLibraryGrid in packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx

**Checkpoint**: User Stories 1, 2, AND 3 should all work independently - users can upload new assets to the library

---

## Phase 6: User Story 4 - 管理素材（重命名、删除、下载） (Priority: P2)

**Goal**: 用户能够对素材进行基本的管理操作（重命名、删除、下载），以便保持素材库的整洁和组织性

**Independent Test**: 选中素材，验证能够成功执行重命名、删除和下载操作，并且操作结果正确反映在素材库中

### Implementation for User Story 4

- [x] T066 [P] [US4] Add rename functionality with inline edit in MediaLibraryInspector in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T067 [P] [US4] Add download button and downloadAsset function in MediaLibraryInspector in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T068 [P] [US4] Implement downloadAsset utility function in packages/drawnix/src/utils/asset-utils.ts
- [x] T069 [US4] Add delete button with confirmation dialog in MediaLibraryInspector in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T070 [US4] Create delete confirmation dialog component using TDesign Dialog in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T071 [US4] Implement removeAsset in AssetContext with error handling in packages/drawnix/src/contexts/AssetContext.tsx
- [x] T072 [US4] Implement renameAsset in AssetContext with validation in packages/drawnix/src/contexts/AssetContext.tsx
- [x] T073 [US4] Add success and error messages using TDesign MessagePlugin in packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx
- [x] T074 [US4] Handle case where asset is already used as reference image in AI dialog (should still work) in packages/drawnix/src/contexts/AssetContext.tsx

**Checkpoint**: All management operations (rename, delete, download) should work correctly

---

## Phase 7: User Story 5 - AI生成的内容自动进入素材库 (Priority: P1)

**Goal**: 当用户使用AI生成图片或视频时，生成的内容应该自动保存到素材库中，以便后续可以复用这些内容

**Independent Test**: 执行AI生成任务，验证生成成功后的图片/视频能够自动出现在素材库中，并标记为"AI生成"来源

### Implementation for User Story 5

- [x] T075 [P] [US5] Create asset-integration-service.ts for auto-save integration in packages/drawnix/src/services/asset-integration-service.ts
- [x] T076 [US5] Implement initializeAssetIntegration function to subscribe to task queue in packages/drawnix/src/services/asset-integration-service.ts
- [x] T077 [US5] Implement generateAssetName function for AI-generated assets in packages/drawnix/src/services/asset-integration-service.ts
- [x] T078 [US5] Handle task completion events and filter for completed image/video tasks in packages/drawnix/src/services/asset-integration-service.ts
- [x] T079 [US5] Fetch result blob from task.resultUrl in packages/drawnix/src/services/asset-integration-service.ts
- [x] T080 [US5] Call assetStorageService.addAsset with AI_GENERATED source in packages/drawnix/src/services/asset-integration-service.ts
- [x] T081 [US5] Add savedToLibrary flag to task queue service to prevent duplicate saves in packages/drawnix/src/services/task-queue-service.ts
- [x] T082 [US5] Implement markAsSaved method in task-queue-service.ts in packages/drawnix/src/services/task-queue-service.ts
- [x] T083 [US5] Handle auto-save errors gracefully without blocking task queue in packages/drawnix/src/services/asset-integration-service.ts
- [x] T084 [US5] Initialize asset integration service in drawnix.tsx on app startup in packages/drawnix/src/drawnix.tsx
- [x] T085 [US5] Store AI generation metadata (prompt, modelName) with assets in packages/drawnix/src/services/asset-integration-service.ts
- [x] T086 [US5] Display AI badge on AI-generated assets in AssetGridItem in packages/drawnix/src/components/media-library/AssetGridItem.tsx

**Checkpoint**: AI-generated content should automatically appear in media library after successful generation

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and ensure production quality

- [x] T087 [P] Add loading states and skeletons to MediaLibraryGrid during asset loading in packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx
- [ ] T088 [P] Add error boundary around MediaLibraryModal in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [ ] T089 [P] Implement lazy loading for asset thumbnails using IntersectionObserver in packages/drawnix/src/components/media-library/AssetGridItem.tsx
- [x] T090 [P] Add performance optimization with React.memo for all grid items in packages/drawnix/src/components/media-library/AssetGridItem.tsx
- [x] T091 [P] Optimize filterAssets function with useMemo in MediaLibraryGrid in packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx
- [x] T092 [P] Add storage warning at 80% usage in MediaLibraryStorageBar in packages/drawnix/src/components/media-library/MediaLibraryStorageBar.tsx
- [ ] T093 [P] Add critical storage error at 95% usage preventing new uploads in packages/drawnix/src/contexts/AssetContext.tsx
- [ ] T094 [P] Add keyboard shortcuts for asset selection (arrow keys, Enter, Delete) in MediaLibraryModal in packages/drawnix/src/components/media-library/MediaLibraryModal.tsx
- [ ] T095 [P] Add accessibility attributes (ARIA labels, roles) to all interactive elements in packages/drawnix/src/components/media-library/
- [ ] T096 [P] Ensure all TDesign components use light theme in packages/drawnix/src/components/media-library/
- [x] T097 [P] Add declarative tracking data-track attributes to all buttons in packages/drawnix/src/components/media-library/
- [x] T098 Code cleanup: Ensure all files are under 500 lines limit across packages/drawnix/src/components/media-library/
- [x] T099 Code cleanup: Apply BEM naming consistently across all SCSS files in packages/drawnix/src/components/media-library/
- [ ] T100 Run quickstart.md validation checklist and ensure all acceptance criteria pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (US1 → US2 → US5 → US3 → US4)
  - US1 and US5 are P1 (highest priority)
  - US3 and US4 are P2 (lower priority)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on User Story 1 (needs MediaLibraryModal and grid components)
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Extends User Story 1 with upload
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Extends User Story 1 with management
- **User Story 5 (P1)**: Can start after Foundational (Phase 2) - Independent integration with task queue

### Within Each User Story

- Models/types before services
- Services before components
- Container components before presentation components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: All tasks marked [P] can run in parallel (T002, T003)
- **Phase 2**: All type definition tasks (T004-T011) can run in parallel
- **Phase 2**: Validation utilities (T023, T024, T025) can run in parallel
- **Phase 3**: Component files (T029-T038) can be created in parallel
- **Phase 4**: MediaLibraryInspector and dialog modifications (T045-T046, T051-T056) can run in parallel
- **Phase 5**: File validation (T061, T062) can run in parallel with upload button (T057)
- **Phase 6**: Rename, download, delete UI (T066-T068) can run in parallel
- **Phase 7**: Asset integration service creation (T075-T077) can run in parallel
- **Phase 8**: All polish tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all UI component creation tasks together:
Task T029: "Create MediaLibraryModal container component"
Task T030: "Create MediaLibraryModal styles"
Task T031: "Create MediaLibraryGrid component"
Task T032: "Create MediaLibraryGrid styles"
Task T033: "Create AssetGridItem component with React.memo"
Task T034: "Create AssetGridItem styles"
Task T035: "Create MediaLibraryEmpty component"
Task T036: "Create MediaLibrarySidebar component"
Task T037: "Create MediaLibrarySidebar styles"
Task T038: "Create MediaLibraryStorageBar component"
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 5 - All P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Browse and view assets)
4. Complete Phase 4: User Story 2 (Select assets as reference images)
5. Complete Phase 7: User Story 5 (Auto-save AI generated content)
6. **STOP and VALIDATE**: Test P1 features independently
7. Deploy/demo MVP

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Can browse assets
3. Add User Story 2 → Test independently → Can select from library (MVP!)
4. Add User Story 5 → Test independently → Auto-save works
5. Add User Story 3 → Test independently → Can upload files
6. Add User Story 4 → Test independently → Can manage assets
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (browse)
   - Developer B: User Story 5 (auto-save integration)
   - Developer C: User Story 3 (upload)
3. Then:
   - Developer A: User Story 2 (selection integration with dialogs)
   - Developer B: User Story 4 (management operations)
4. Stories complete and integrate independently

---

## Summary

- **Total Tasks**: 100
- **Setup**: 3 tasks
- **Foundational**: 25 tasks (BLOCKS all stories)
- **User Story 1** (P1 - Browse): 16 tasks
- **User Story 2** (P1 - Select): 12 tasks
- **User Story 3** (P2 - Upload): 9 tasks
- **User Story 4** (P2 - Manage): 9 tasks
- **User Story 5** (P1 - Auto-save): 12 tasks
- **Polish**: 14 tasks

**Parallel Opportunities**: 38 tasks marked with [P] can be executed in parallel within their phases

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 7 (User Stories 1, 2, 5)

**Independent Test Criteria**:
- US1: Can open media library, view all assets, filter by type/source
- US2: Can select asset from library as reference image in AI dialogs
- US3: Can upload new files via button or drag-and-drop
- US4: Can rename, delete, and download assets
- US5: AI-generated content automatically appears in library

---

**Tasks generated**: 2025-12-11
**Feature**: 009-media-library
**Ready for**: Implementation via `/speckit.implement` or manual execution
