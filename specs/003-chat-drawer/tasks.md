# Tasks: 对话抽屉 (Chat Drawer)

**Input**: Design documents from `/specs/001-chat-drawer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested - implementation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo structure**: `packages/drawnix/src/` for all source files
- Components: `packages/drawnix/src/components/chat-drawer/`
- Hooks: `packages/drawnix/src/hooks/`
- Services: `packages/drawnix/src/services/`
- Types: `packages/drawnix/src/types/`
- Constants: `packages/drawnix/src/constants/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, types, and constants

- [x] T001 [P] Create type definitions in packages/drawnix/src/types/chat.types.ts (copy from contracts/chat-api.ts)
- [x] T002 [P] Create constants file in packages/drawnix/src/constants/CHAT_CONSTANTS.ts
- [x] T003 [P] Create chat-drawer component directory structure in packages/drawnix/src/components/chat-drawer/
- [x] T004 Create index.ts barrel export in packages/drawnix/src/components/chat-drawer/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create chat storage service in packages/drawnix/src/services/chat-storage-service.ts with localforage configuration
- [x] T006 Create useChatStorage hook in packages/drawnix/src/hooks/useChatStorage.ts for IndexedDB operations
- [x] T007 Create chat API service in packages/drawnix/src/services/chat-service.ts with streaming support
- [x] T008 Create useChatStream hook in packages/drawnix/src/hooks/useChatStream.ts for handling SSE responses
- [x] T009 Create base styles in packages/drawnix/src/components/chat-drawer/chat-drawer.scss with BEM naming

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 基本对话交互 (Priority: P1) 🎯 MVP

**Goal**: 用户能够展开/收起对话抽屉，与AI进行基本的连续对话

**Independent Test**: 点击抽屉按钮展开，输入消息，接收流式AI回复，保持上下文

### Implementation for User Story 1

- [x] T010 [P] [US1] Create StreamingText component in packages/drawnix/src/components/chat-drawer/StreamingText.tsx for token-by-token display
- [x] T011 [P] [US1] Create MessageItem component in packages/drawnix/src/components/chat-drawer/MessageItem.tsx for single message display
- [x] T012 [US1] Create MessageList component in packages/drawnix/src/components/chat-drawer/MessageList.tsx (depends on T011)
- [x] T013 [P] [US1] Create AttachmentPreview component in packages/drawnix/src/components/chat-drawer/AttachmentPreview.tsx for file preview
- [x] T014 [US1] Create MessageInput component in packages/drawnix/src/components/chat-drawer/MessageInput.tsx with attachment support (depends on T013)
- [x] T015 [US1] Create useChatMessages hook in packages/drawnix/src/hooks/useChatMessages.ts for message state management
- [x] T016 [US1] Create ChatDrawerTrigger component in packages/drawnix/src/components/chat-drawer/ChatDrawerTrigger.tsx
- [x] T017 [US1] Create ChatDrawer main component in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx (depends on T012, T014, T015, T016)
- [x] T018 [US1] Add drawer styles for expand/collapse animation in packages/drawnix/src/components/chat-drawer/chat-drawer.scss
- [x] T019 [US1] Integrate ChatDrawer into drawnix.tsx in packages/drawnix/src/drawnix.tsx
- [x] T020 [US1] Update DrawnixState in packages/drawnix/src/hooks/use-drawnix.tsx to include chat drawer state
- [x] T021 [US1] Import chat-drawer.scss in packages/drawnix/src/styles/index.scss

**Checkpoint**: User Story 1 complete - basic chat interaction works independently

---

## Phase 4: User Story 2 - 对话历史持久化 (Priority: P2)

**Goal**: 对话历史能够保存到IndexedDB，页面刷新后自动恢复

**Independent Test**: 进行对话，刷新页面，验证历史记录完整恢复

### Implementation for User Story 2

- [x] T022 [US2] Extend chat-storage-service.ts with message persistence methods in packages/drawnix/src/services/chat-storage-service.ts
- [x] T023 [US2] Add history restoration logic to useChatMessages hook in packages/drawnix/src/hooks/useChatMessages.ts
- [x] T024 [US2] Add auto-save on message send/receive in packages/drawnix/src/hooks/useChatMessages.ts
- [x] T025 [US2] Add storage cleanup and pruning logic in packages/drawnix/src/services/chat-storage-service.ts
- [x] T026 [US2] Add loading state for history restoration in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx

**Checkpoint**: User Story 2 complete - history persists across page reloads

---

## Phase 5: User Story 3 - 多会话管理 (Priority: P3)

**Goal**: 用户能够创建、切换、删除多个独立的对话会话

**Independent Test**: 创建新会话，切换会话，验证各会话独立，删除会话

### Implementation for User Story 3

- [x] T027 [P] [US3] Create SessionItem component in packages/drawnix/src/components/chat-drawer/SessionItem.tsx
- [x] T028 [US3] Create SessionList component in packages/drawnix/src/components/chat-drawer/SessionList.tsx (depends on T027)
- [x] T029 [US3] Create useChatSessions hook in packages/drawnix/src/hooks/useChatSessions.ts for session CRUD operations
- [x] T030 [US3] Add session management methods to chat-storage-service.ts in packages/drawnix/src/services/chat-storage-service.ts
- [x] T031 [US3] Add session title auto-generation logic (from first message) in packages/drawnix/src/hooks/useChatSessions.ts
- [x] T032 [US3] Integrate SessionList into ChatDrawer in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx
- [x] T033 [US3] Add session switching UI and logic in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx
- [x] T034 [US3] Add session deletion confirmation in packages/drawnix/src/components/chat-drawer/SessionList.tsx

**Checkpoint**: User Story 3 complete - multiple sessions work independently

---

## Phase 6: User Story 4 - 消息操作功能 (Priority: P4)

**Goal**: 用户能够复制消息、重新生成回复、停止生成

**Independent Test**: 复制AI消息到剪贴板，点击重新生成获取新回复，点击停止中断生成

### Implementation for User Story 4

- [x] T035 [US4] Add message action buttons (copy, regenerate) to MessageItem in packages/drawnix/src/components/chat-drawer/MessageItem.tsx
- [x] T036 [US4] Implement copy to clipboard functionality in packages/drawnix/src/components/chat-drawer/MessageItem.tsx
- [x] T037 [US4] Add stop generation button to MessageInput in packages/drawnix/src/components/chat-drawer/MessageInput.tsx
- [x] T038 [US4] Implement stop generation logic with AbortController in packages/drawnix/src/hooks/useChatStream.ts
- [x] T039 [US4] Implement regenerate response logic in packages/drawnix/src/hooks/useChatMessages.ts
- [x] T040 [US4] Add regenerate API method to chat-service.ts in packages/drawnix/src/services/chat-service.ts

**Checkpoint**: User Story 4 complete - all message operations work

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T041 [P] Add responsive styles for mobile full-screen mode in packages/drawnix/src/components/chat-drawer/chat-drawer.scss
- [ ] T042 [P] Add error boundary for chat drawer in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx
- [ ] T043 Add error handling and retry logic for network failures in packages/drawnix/src/services/chat-service.ts
- [ ] T044 Add virtual scrolling for long message lists in packages/drawnix/src/components/chat-drawer/MessageList.tsx
- [x] T045 [P] Add keyboard shortcuts (Enter to send, Escape to close) in packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx
- [x] T046 [P] Add i18n strings for chat drawer UI in packages/drawnix/src/i18n.tsx
- [x] T047 Update barrel exports in packages/drawnix/src/components/chat-drawer/index.ts
- [ ] T048 Run quickstart.md validation to verify all features work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can proceed in priority order (P1 → P2 → P3 → P4)
  - US2 depends on US1 (needs basic messaging to persist)
  - US3 depends on US2 (needs persistence for sessions)
  - US4 can partially overlap with US2/US3
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (needs messages to persist)
- **User Story 3 (P3)**: Depends on US2 (needs persistence layer)
- **User Story 4 (P4)**: Depends on US1 (needs messages to operate on)

### Within Each User Story

- Components before integration
- Hooks before components that use them
- Services before hooks that call them
- Base components before composite components

### Parallel Opportunities

**Phase 1 (Setup)**:
```bash
# All can run in parallel:
T001: Create type definitions
T002: Create constants
T003: Create directory structure
```

**Phase 3 (User Story 1)**:
```bash
# Can run in parallel (different files):
T010: StreamingText component
T011: MessageItem component
T013: AttachmentPreview component
T016: ChatDrawerTrigger component
```

**Phase 5 (User Story 3)**:
```bash
# Can run in parallel:
T027: SessionItem component (then T028 depends on it)
```

**Phase 7 (Polish)**:
```bash
# Can run in parallel:
T041: Responsive styles
T042: Error boundary
T045: Keyboard shortcuts
T046: i18n strings
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T009)
3. Complete Phase 3: User Story 1 (T010-T021)
4. **STOP and VALIDATE**: Test basic chat interaction independently
5. Deploy/demo if ready - users can already chat with AI!

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP Release** (basic chat)
3. Add User Story 2 → Test independently → Release (chat + persistence)
4. Add User Story 3 → Test independently → Release (multi-session)
5. Add User Story 4 → Test independently → Release (full features)
6. Add Polish → Final release

### Estimated Task Counts

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Phase 1: Setup | 4 | 3 |
| Phase 2: Foundational | 5 | 0 |
| Phase 3: US1 (P1) | 12 | 4 |
| Phase 4: US2 (P2) | 5 | 0 |
| Phase 5: US3 (P3) | 8 | 1 |
| Phase 6: US4 (P4) | 6 | 0 |
| Phase 7: Polish | 8 | 4 |
| **Total** | **48** | **12** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently testable after completion
- Follow TDesign light theme and BEM naming conventions
- Keep each file under 500 lines (split if necessary)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
