# Tasks: 批量生成数量选择

**Input**: Design documents from `/specs/002-batch-generation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT included as they were not explicitly requested in the specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Package**: `packages/drawnix/src/`
- All paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and constants definition

- [ ] T001 Create generation constants file with GENERATION_COUNT config in packages/drawnix/src/constants/generation.ts
- [ ] T002 [P] Extend GenerationParams interface with batch fields in packages/drawnix/src/types/task.types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core components and hooks that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Create useGenerationCount hook for state management in packages/drawnix/src/hooks/useGenerationCount.ts
- [ ] T004 [P] Create GenerationCountSelector component in packages/drawnix/src/components/ttd-dialog/generation-count-selector/GenerationCountSelector.tsx
- [ ] T005 [P] Create SCSS styles for GenerationCountSelector in packages/drawnix/src/components/ttd-dialog/generation-count-selector/generation-count-selector.scss
- [ ] T006 Add createBatchTasks method to task-queue-service in packages/drawnix/src/services/task-queue-service.ts
- [ ] T007 Add getTasksByBatchId method to task-queue-service in packages/drawnix/src/services/task-queue-service.ts
- [ ] T008 Extend useTaskQueue hook with batch task methods in packages/drawnix/src/hooks/useTaskQueue.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 快速选择常用生成数量 (Priority: P1) 🎯 MVP

**Goal**: 用户可以通过预设按钮（1/2/4）快速选择生成数量

**Independent Test**: 打开生成弹窗，点击预设按钮，验证数量正确更新且按钮显示选中状态

### Implementation for User Story 1

- [ ] T009 [US1] Integrate GenerationCountSelector into AIImageGeneration component in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [ ] T010 [US1] Add generation count state management to AIImageGeneration in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [ ] T011 [P] [US1] Integrate GenerationCountSelector into AIVideoGeneration component in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx
- [ ] T012 [P] [US1] Add generation count state management to AIVideoGeneration in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx

**Checkpoint**: 预设数量选择功能可用

---

## Phase 4: User Story 2 - 自定义输入生成数量 (Priority: P2)

**Goal**: 用户可以输入自定义数量值，与预设按钮状态联动

**Independent Test**: 在输入框输入数值，验证预设按钮取消选中，数量正确更新

### Implementation for User Story 2

- [ ] T013 [US2] Add input validation logic to useGenerationCount hook in packages/drawnix/src/hooks/useGenerationCount.ts
- [ ] T014 [US2] Implement preset/custom state toggling in GenerationCountSelector in packages/drawnix/src/components/ttd-dialog/generation-count-selector/GenerationCountSelector.tsx
- [ ] T015 [US2] Add error message display for invalid input in GenerationCountSelector in packages/drawnix/src/components/ttd-dialog/generation-count-selector/GenerationCountSelector.tsx

**Checkpoint**: 自定义输入和预设选择完全可用

---

## Phase 5: User Story 3 - 批量生成任务执行 (Priority: P1)

**Goal**: 系统根据选择的数量创建多个并行生成任务

**Independent Test**: 设置数量为2，提交任务，验证创建了2个独立任务且均可并行执行

### Implementation for User Story 3

- [ ] T016 [US3] Modify handleGenerate in AIImageGeneration to use createBatchTasks in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [ ] T017 [US3] Update dialogTaskIds to track all batch task IDs in AIImageGeneration in packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx
- [ ] T018 [P] [US3] Modify handleGenerate in AIVideoGeneration to use createBatchTasks in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx
- [ ] T019 [P] [US3] Update dialogTaskIds to track all batch task IDs in AIVideoGeneration in packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx
- [ ] T020 [US3] Add success message showing number of tasks created in both generation components

**Checkpoint**: 批量任务创建功能完整

---

## Phase 6: User Story 4 - 批量任务结果展示 (Priority: P2)

**Goal**: 用户可以查看批量生成的所有结果并独立操作

**Independent Test**: 完成批量生成后，验证所有结果正确展示且可独立操作

### Implementation for User Story 4

- [ ] T021 [US4] Add batch grouping display to DialogTaskList in packages/drawnix/src/components/task-queue/DialogTaskList.tsx
- [ ] T022 [US4] Show batch progress indicator (e.g., 2/4 completed) in DialogTaskList in packages/drawnix/src/components/task-queue/DialogTaskList.tsx
- [ ] T023 [US4] Add batch ID label to individual task items in DialogTaskList in packages/drawnix/src/components/task-queue/DialogTaskList.tsx

**Checkpoint**: 批量结果展示完整

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T024 [P] Add localStorage persistence for user's generation count preference in packages/drawnix/src/hooks/useGenerationCount.ts
- [ ] T025 [P] Add Tooltip hints for generation count selector in GenerationCountSelector in packages/drawnix/src/components/ttd-dialog/generation-count-selector/GenerationCountSelector.tsx
- [ ] T026 Export GenerationCountSelector from ttd-dialog index in packages/drawnix/src/components/ttd-dialog/index.ts
- [ ] T027 Run quickstart.md validation steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Enhances US1 functionality
- **User Story 3 (P1)**: Can start after Foundational - No dependencies on US1/US2
- **User Story 4 (P2)**: Depends on US3 (needs batch tasks to display)

### Within Each User Story

- Core implementation before integration
- AIImageGeneration and AIVideoGeneration can be done in parallel
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 can run in parallel (Setup phase)
- T004 and T005 can run in parallel (Component and styles)
- T011/T012 can run in parallel with T009/T010 (Video vs Image components)
- T018/T019 can run in parallel with T016/T017 (Video vs Image batch generation)

---

## Parallel Example: User Story 3

```bash
# Launch image and video batch generation together:
Task: "Modify handleGenerate in AIImageGeneration to use createBatchTasks"
Task: "Modify handleGenerate in AIVideoGeneration to use createBatchTasks"

# Then update task tracking in parallel:
Task: "Update dialogTaskIds in AIImageGeneration"
Task: "Update dialogTaskIds in AIVideoGeneration"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (预设选择)
4. Complete Phase 5: User Story 3 (批量创建)
5. **STOP and VALIDATE**: Test basic batch generation flow
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 3 → Test batch generation → Deploy (MVP!)
3. Add User Story 2 → Test custom input → Deploy
4. Add User Story 4 → Test batch display → Deploy
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- File size must remain under 500 lines per constitution
