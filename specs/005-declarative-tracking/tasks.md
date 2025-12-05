# Tasks: 声明式埋点上报系统

**Input**: Design documents from `/specs/005-declarative-tracking/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Unit tests and E2E tests included as specified in plan.md (target >80% coverage)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/drawnix/src/` for implementation
- **Tests**: `packages/drawnix/src/services/tracking/__tests__/` for unit tests
- **E2E**: `tests/e2e/tracking/` for end-to-end tests
- File size limit: <500 lines per file (constitution requirement)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create directory structure at packages/drawnix/src/plugins/tracking/ and packages/drawnix/src/services/tracking/
- [X] T002 [P] Create TypeScript type definitions in packages/drawnix/src/types/tracking.types.ts (<150 lines)
- [X] T003 [P] Configure Vite environment variable for version injection in vite.config.ts
- [X] T004 [P] Create tracking configuration defaults in packages/drawnix/src/services/tracking/tracking-config.ts (<150 lines)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement Umami adapter wrapper in packages/drawnix/src/services/tracking/umami-adapter.ts (<200 lines)
- [X] T006 [P] Implement batch upload service in packages/drawnix/src/services/tracking/tracking-batch-service.ts (<300 lines)
- [X] T007 [P] Implement storage/cache service using localforage in packages/drawnix/src/services/tracking/tracking-storage-service.ts (<250 lines)
- [X] T008 [P] Implement debounce utility using WeakMap in packages/drawnix/src/services/tracking/tracking-utils.ts (debounce logic, <100 lines)
- [X] T009 [P] Implement element selector utilities in packages/drawnix/src/services/tracking/tracking-utils.ts (selector matching, <100 lines)
- [X] T010 [P] Implement event name generation utility in packages/drawnix/src/services/tracking/tracking-utils.ts (auto-event naming, <100 lines)
- [X] T011 Unit test for Umami adapter in packages/drawnix/src/services/tracking/__tests__/umami-adapter.test.ts
- [X] T012 [P] Unit test for batch service in packages/drawnix/src/services/tracking/__tests__/tracking-batch-service.test.ts
- [X] T013 [P] Unit test for storage service in packages/drawnix/src/services/tracking/__tests__/tracking-storage-service.test.ts
- [X] T014 [P] Unit test for utilities in packages/drawnix/src/services/tracking/__tests__/tracking-utils.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 开发者快速添加点击埋点 (Priority: P1) 🎯 MVP

**Goal**: 开发者通过 `track="event_name"` 属性为元素添加点击埋点,系统自动上报事件到 Umami,包含元数据(version, url, timestamp, sessionId)

**Independent Test**: 在任意可点击元素上添加 `track` 属性,点击后在控制台或 Umami 面板看到事件上报

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement core tracking service class with RxJS state management in packages/drawnix/src/services/tracking/tracking-service.ts (<500 lines)
- [X] T016 [P] [US1] Implement event delegation for click events in tracking-service.ts (event listener setup, track attribute parsing)
- [X] T017 [US1] Implement metadata injection logic in tracking-service.ts (version from env, url from location.href, timestamp, sessionId generation)
- [X] T018 [US1] Implement event capture and queueing flow in tracking-service.ts (capture → debounce → enqueue to batch)
- [X] T019 [US1] Implement event bubbling prevention for nested elements in tracking-service.ts (stopPropagation for innermost track element)
- [X] T020 [US1] Integrate batch service with tracking service in tracking-service.ts (call batchService.enqueue)
- [X] T021 [US1] Implement beforeunload handler for navigator.sendBeacon in tracking-service.ts
- [X] T022 [US1] Add logging (console.warn in dev, error logs in prod) in tracking-service.ts
- [X] T023 [P] [US1] Unit test for track attribute parsing in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T024 [P] [US1] Unit test for metadata injection in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T025 [P] [US1] Unit test for event bubbling prevention in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T026 [P] [US1] Unit test for debounce integration in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts

**Checkpoint**: At this point, basic click tracking with track attribute should work - test by adding track="test_event" to a button and clicking

---

## Phase 4: User Story 2 - 上报事件时携带额外参数 (Priority: P2)

**Goal**: 开发者通过 `track-params='{"key": "value"}'` 属性为事件添加自定义参数,系统解析并包含在上报数据中

**Independent Test**: 在元素上同时添加 `track` 和 `track-params`,点击后验证上报数据包含自定义参数

### Implementation for User Story 2

- [X] T027 [P] [US2] Implement track-params parsing logic in packages/drawnix/src/services/tracking/tracking-service.ts (JSON.parse with try-catch)
- [X] T028 [P] [US2] Implement JSON validation and error handling in tracking-service.ts (catch parse errors, log warnings)
- [X] T029 [US2] Integrate track-params with event creation in tracking-service.ts (merge params into TrackEvent.params)
- [X] T030 [US2] Add dev/prod logging for invalid JSON in tracking-service.ts (console.warn in dev, error log in prod)
- [X] T031 [P] [US2] Unit test for valid JSON parsing in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T032 [P] [US2] Unit test for invalid JSON handling in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T033 [P] [US2] Unit test for params integration with events in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts

**Checkpoint**: track-params support complete - test with `track-params='{"userId": "123"}'` and verify in Umami

---

## Phase 5: User Story 3 - 批量为可点击元素自动添加埋点 (Priority: P3)

**Goal**: 启用自动埋点模式后,系统自动识别可点击元素(button, a, role="button", onClick handlers)并生成事件名,但排除nav/header/footer和data-track-ignore元素

**Independent Test**: 启用 autoTrack 配置,点击未添加 track 属性的 button,验证自动生成事件名并上报

### Implementation for User Story 3

- [X] T034 [P] [US3] Implement shouldAutoTrack selector logic in packages/drawnix/src/services/tracking/tracking-utils.ts (CSS selector + React Fiber check)
- [X] T035 [P] [US3] Implement element exclusion logic in tracking-utils.ts (check nav/header/footer/data-track-ignore)
- [X] T036 [P] [US3] Implement auto event name generation in tracking-utils.ts (based on text content, ID, aria-label)
- [X] T037 [US3] Integrate auto-tracking with event delegation in packages/drawnix/src/services/tracking/tracking-service.ts (check autoTrack config, call shouldAutoTrack)
- [X] T038 [US3] Add auto-tracking configuration support in tracking-service.ts (autoTrack flag, excludedSelectors)
- [X] T039 [US3] Prioritize manual track over auto-track in tracking-service.ts (check for track attribute first)
- [X] T040 [P] [US3] Unit test for shouldAutoTrack logic in packages/drawnix/src/services/tracking/__tests__/tracking-utils.test.ts
- [X] T041 [P] [US3] Unit test for exclusion logic in packages/drawnix/src/services/tracking/__tests__/tracking-utils.test.ts
- [X] T042 [P] [US3] Unit test for event name generation in packages/drawnix/src/services/tracking/__tests__/tracking-utils.test.ts
- [X] T043 [P] [US3] Unit test for auto-track integration in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts

**Checkpoint**: Auto-tracking complete - test with autoTrack: true config and verify 95%+ clickable elements are tracked

---

## Phase 6: User Story 4 - 支持多种交互事件类型的埋点 (Priority: P3)

**Goal**: 支持 track-hover, track-focus 等属性,监听 hover/focus 事件并上报

**Independent Test**: 在元素上添加 `track-hover="hover_event"`,鼠标悬停时验证事件上报

### Implementation for User Story 4

- [X] T044 [P] [US4] Implement MutationObserver setup in packages/drawnix/src/services/tracking/tracking-service.ts (<100 lines, only when track-hover/focus enabled)
- [X] T045 [P] [US4] Implement track-hover attribute support in tracking-service.ts (parse track-hover, attach mouseenter listener)
- [X] T046 [P] [US4] Implement track-focus attribute support in tracking-service.ts (parse track-focus, attach focus listener with capture)
- [X] T047 [US4] Implement event listener attachment logic in tracking-service.ts (WeakMap to track attached listeners, prevent duplicates)
- [X] T048 [US4] Integrate multi-event types with existing tracking flow in tracking-service.ts (support eventType in TrackEvent.metadata)
- [X] T049 [P] [US4] Unit test for MutationObserver logic in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T050 [P] [US4] Unit test for track-hover support in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T051 [P] [US4] Unit test for track-focus support in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
- [X] T052 [P] [US4] Unit test for listener deduplication in packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts

**Checkpoint**: Multi-event support complete - test track-hover and track-focus attributes

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Plugin integration, React hooks, E2E tests, documentation

- [X] T053 [P] Implement withTracking plugin wrapper in packages/drawnix/src/plugins/tracking/withTracking.ts (<200 lines)
- [X] T054 [P] Implement useTracking React hook in packages/drawnix/src/plugins/tracking/hooks/useTracking.ts (<150 lines)
- [X] T055 [P] Create plugin index exports in packages/drawnix/src/plugins/tracking/index.ts
- [X] T056 Integrate withTracking into Drawnix in packages/drawnix/src/drawnix.tsx (add withTracking to plugin composition)
- [X] T057 [P] Unit test for withTracking plugin in packages/drawnix/src/plugins/tracking/__tests__/withTracking.test.ts
- [X] T058 [P] Unit test for useTracking hook in packages/drawnix/src/plugins/tracking/__tests__/useTracking.test.ts
- [X] T059 [P] E2E test for declarative tracking (track attribute) in tests/e2e/tracking/declarative-tracking.spec.ts
- [X] T060 [P] E2E test for track-params in tests/e2e/tracking/declarative-tracking.spec.ts
- [X] T061 [P] E2E test for auto-tracking in tests/e2e/tracking/auto-tracking.spec.ts
- [X] T062 [P] E2E test for multi-event types in tests/e2e/tracking/multi-event-types.spec.ts
- [X] T063 [P] E2E test for batch upload and caching in tests/e2e/tracking/batch-and-cache.spec.ts
- [X] T064 [P] Update quickstart.md with final examples and troubleshooting
- [X] T065 [P] Verify file size compliance (all files <500 lines)
- [X] T066 Run full test suite and verify >80% coverage
- [X] T067 Run quickstart.md validation (follow guide end-to-end)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P3)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1) - Basic Tracking**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2) - track-params**: Can start after Foundational (Phase 2) - Extends US1 but independently testable
- **User Story 3 (P3) - Auto-tracking**: Can start after Foundational (Phase 2) - Uses US1 infrastructure but independently testable
- **User Story 4 (P3) - Multi-events**: Can start after Foundational (Phase 2) - Uses US1 infrastructure but independently testable

### Within Each User Story

- Tests can be written in parallel with implementation (TDD approach)
- Utility functions before service integration
- Core logic before edge case handling
- Unit tests before moving to next user story

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 can run in parallel
- **Phase 2**: T006, T007, T008, T009, T010 can run in parallel (after T005 Umami adapter)
- **Phase 2 Tests**: T011, T012, T013, T014 can run in parallel
- **US1**: T015, T016 can run in parallel; T023, T024, T025, T026 tests can run in parallel
- **US2**: T027, T028 can run in parallel; T031, T032, T033 tests can run in parallel
- **US3**: T034, T035, T036 can run in parallel; T040, T041, T042, T043 tests can run in parallel
- **US4**: T044, T045, T046 can run in parallel; T049, T050, T051, T052 tests can run in parallel
- **Polish**: T053, T054, T055, T057, T058, T059, T060, T061, T062, T063, T064, T065 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all utility implementations for US1 together:
Task T015: "Implement core tracking service class with RxJS state management"
Task T016: "Implement event delegation for click events"

# Launch all unit tests for US1 together:
Task T023: "Unit test for track attribute parsing"
Task T024: "Unit test for metadata injection"
Task T025: "Unit test for event bubbling prevention"
Task T026: "Unit test for debounce integration"
```

---

## Parallel Example: Foundational Phase

```bash
# Launch all service implementations in parallel:
Task T006: "Implement batch upload service"
Task T007: "Implement storage/cache service using localforage"
Task T008: "Implement debounce utility using WeakMap"
Task T009: "Implement element selector utilities"
Task T010: "Implement event name generation utility"

# Launch all tests in parallel:
Task T011: "Unit test for Umami adapter"
Task T012: "Unit test for batch service"
Task T013: "Unit test for storage service"
Task T014: "Unit test for utilities"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T014) - CRITICAL
3. Complete Phase 3: User Story 1 (T015-T026)
4. **STOP and VALIDATE**: Test basic click tracking independently
5. Deploy/demo if ready - developers can use `track="event_name"` attribute

**MVP Deliverable**: Basic declarative tracking with `track` attribute, batch upload, caching, metadata injection

### Incremental Delivery

1. **Sprint 1**: Setup + Foundational → Foundation ready
2. **Sprint 2**: Add User Story 1 → Test independently → Deploy (MVP!)
3. **Sprint 3**: Add User Story 2 → Test independently → Deploy (track-params support)
4. **Sprint 4**: Add User Story 3 → Test independently → Deploy (auto-tracking)
5. **Sprint 5**: Add User Story 4 → Test independently → Deploy (multi-event types)
6. **Sprint 6**: Polish → Full E2E tests → Production release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T014)
2. Once Foundational is done:
   - Developer A: User Story 1 (T015-T026)
   - Developer B: User Story 2 (T027-T033) - waits for US1 completion
   - Developer C: User Story 3 (T034-T043) - can start in parallel
   - Developer D: User Story 4 (T044-T052) - can start in parallel
3. Polish phase (T053-T067) - team collaboration

---

## Validation Checkpoints

### After Phase 2 (Foundational)
- ✅ Umami adapter can send test events
- ✅ Batch service queues and flushes events correctly
- ✅ Storage service persists and retrieves cached events
- ✅ Debounce prevents duplicate events within 500ms
- ✅ All unit tests pass (>80% coverage for foundational code)

### After Phase 3 (User Story 1)
- ✅ Clicking element with `track="test_event"` uploads event to Umami
- ✅ Event includes metadata: version, url, timestamp, sessionId
- ✅ Nested elements with track attributes only report innermost element
- ✅ Events batch every 10 events or 5 seconds
- ✅ beforeunload sends remaining events with sendBeacon
- ✅ All US1 unit tests pass

### After Phase 4 (User Story 2)
- ✅ `track-params='{"key": "value"}'` correctly parses and includes in event
- ✅ Invalid JSON logs warning in dev, error in prod, continues without params
- ✅ Events without track-params work normally
- ✅ All US2 unit tests pass

### After Phase 5 (User Story 3)
- ✅ autoTrack: true auto-tracks 95%+ clickable elements
- ✅ Elements in nav/header/footer are excluded
- ✅ data-track-ignore prevents auto-tracking
- ✅ Auto-generated event names are meaningful (based on text/ID/aria-label)
- ✅ Manual track attributes override auto-tracking
- ✅ All US3 unit tests pass

### After Phase 6 (User Story 4)
- ✅ `track-hover="hover_event"` reports on mouseenter
- ✅ `track-focus="focus_event"` reports on focus
- ✅ MutationObserver attaches listeners to dynamic elements
- ✅ WeakMap prevents duplicate listener attachment
- ✅ All US4 unit tests pass

### After Phase 7 (Polish)
- ✅ withTracking plugin integrates into Drawnix
- ✅ useTracking hook provides React-friendly API
- ✅ All E2E tests pass (declarative, auto, multi-event, batch, cache)
- ✅ Overall test coverage >80%
- ✅ All files comply with <500 line limit
- ✅ quickstart.md validated end-to-end
- ✅ Performance: <2% page load overhead, 60%+ network request reduction

---

## Notes

- [P] tasks = different files, no dependencies - can run in parallel
- [Story] label (US1, US2, US3, US4) maps task to specific user story
- Each user story is independently completable and testable
- All unit tests use Jest + React Testing Library
- All E2E tests use Playwright
- Constitution compliance: all files <500 lines (verified in T065)
- Stop at any checkpoint to validate story independently before proceeding
- TypeScript strict mode enforced throughout
- Follow existing Drawnix patterns (services/, plugins/, RxJS)
