---
description: Automatically execute the complete SpecKit workflow from specification to implementation.
handoffs: 
  - label: View Implementation
    agent: Read
    prompt: Show me the implemented code
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This command automates the **COMPLETE** SpecKit workflow by executing ALL commands in sequence:

1. `/speckit.specify` - Create feature specification from description
2. `/speckit.clarify` - Interactive clarification of ambiguities
3. `/speckit.plan` - Generate technical implementation plan
4. `/speckit.tasks` - Create actionable, dependency-ordered tasks
5. `/speckit.checklist` - Generate acceptance checklists (optional)
6. `/speckit.analyze` - Analyze artifacts for consistency (optional)
7. `/speckit.implement` - Execute all tasks and implement the feature

## Execution Flow

### Phase 1: Feature Specification

1. **Validate input**: 
   - Check if feature description is provided in `$ARGUMENTS`
   - If empty, ERROR: "Please provide a feature description after /speckit.auto"
   - Example: `/speckit.auto Implement user authentication with OAuth2`

2. **Execute /speckit.specify**:
   - Use the SlashCommand tool to invoke `/speckit.specify` with the feature description
   - Command format: `/speckit.specify $ARGUMENTS`
   - Wait for specification generation to complete
   - Capture the generated spec file path and branch name

3. **Verify spec.md created**:
   - Check that spec.md was successfully created
   - If not, ERROR and halt workflow

### Phase 2: Clarification (Interactive)

1. **Execute /speckit.clarify**:
   - Use the SlashCommand tool to invoke `/speckit.clarify`
   - This step is interactive - the clarify workflow will ask questions
   - You MUST participate in the interactive Q&A session
   - Answer clarification questions based on:
     - Best practices for the feature type
     - Industry standards
     - Security and performance considerations
     - The original feature description context

2. **Clarification guidelines**:
   - When speckit.clarify presents multiple-choice questions with a recommendation:
     - If the recommendation aligns with best practices and feature context → Accept it
     - If you have specific requirements from $ARGUMENTS that override → Provide custom answer
   - When short-answer questions are presented:
     - Provide concise, specific answers (<=5 words as required)
     - Base answers on the feature description and industry standards
   - Maximum 5 questions will be asked
   - User can interrupt and say "done" or "proceed" to skip remaining questions

3. **Verify clarifications completed**:
   - Ensure all [NEEDS CLARIFICATION] markers resolved
   - Spec.md updated with clarification session notes

### Phase 3: Technical Planning

1. **Execute /speckit.plan**:
   - Use the SlashCommand tool to invoke `/speckit.plan`
   - Provide tech stack context if available in $ARGUMENTS
   - Wait for plan generation to complete
   - Capture generated artifacts:
     - plan.md
     - research.md
     - data-model.md
     - contracts/ directory
     - quickstart.md

2. **Verify plan artifacts**:
   - Confirm plan.md exists
   - Check that all NEEDS CLARIFICATION items were resolved in research.md

### Phase 4: Task Generation

1. **Execute /speckit.tasks**:
   - Use the SlashCommand tool to invoke `/speckit.tasks`
   - Wait for task generation to complete
   - Capture tasks.md path

2. **Verify tasks.md**:
   - Confirm tasks.md created
   - Verify task format compliance (checklist format with IDs)
   - Check user story organization

### Phase 5: Checklist Generation (Optional)

1. **Ask user preference**:
   - Use AskUserQuestion tool to ask: "Generate acceptance checklists?"
   - Options:
     - "Yes - Generate quality validation checklists"
     - "No - Skip checklist generation"
     - "Custom - I'll specify checklist types"

2. **If Yes - Execute /speckit.checklist**:
   - For standard features, generate recommended checklists:
     - UX checklist (if UI/frontend involved)
     - API checklist (if backend/API involved)
     - Security checklist (if auth/data protection involved)
   - Use the SlashCommand tool to invoke `/speckit.checklist` for each type
   - Example: `/speckit.checklist Generate UX requirements checklist`

3. **If Custom - Interactive checklist selection**:
   - Ask user which checklist types to generate
   - Execute `/speckit.checklist` for each requested type

4. **Verify checklists created**:
   - Confirm checklist files exist in FEATURE_DIR/checklists/
   - Report checklist paths and item counts

### Phase 6: Consistency Analysis (Optional)

1. **Ask user preference**:
   - Use AskUserQuestion tool to ask: "Run consistency analysis on generated artifacts?"
   - Options:
     - "Yes - Run /speckit.analyze for cross-artifact validation"
     - "No - Skip analysis and complete workflow"

2. **If Yes - Execute /speckit.analyze**:
   - Use the SlashCommand tool to invoke `/speckit.analyze`
   - Wait for analysis to complete
   - Review any inconsistencies found

3. **Handle analysis results**:
   - If inconsistencies found:
     - Present summary to user
     - Ask: "Fix inconsistencies automatically or review manually?"
     - If auto-fix requested: Apply fixes and re-verify
   - If no issues: Proceed to implementation

### Phase 7: Implementation Execution

1. **Prepare for implementation**:
   - Verify all previous phases completed successfully
   - Confirm that:
     - spec.md exists with no [NEEDS CLARIFICATION] markers
     - plan.md exists with technical decisions
     - tasks.md exists with complete task breakdown
     - Checklists completed (if generated)
     - No critical inconsistencies (if analysis run)

2. **Ask user confirmation**:
   - Use AskUserQuestion tool to ask: "Ready to start implementation?"
   - Options:
     - "Yes - Execute all tasks and implement the feature"
     - "No - Stop here, I'll implement manually"
     - "Review - Let me review artifacts first"

3. **If Review - Pause and report**:
   - Display summary of all generated artifacts
   - Paths to spec.md, plan.md, tasks.md, checklists
   - Wait for user to review
   - Ask again: "Ready to proceed with implementation?"

4. **If Yes - Execute /speckit.implement**:
   - Use the SlashCommand tool to invoke `/speckit.implement`
   - Monitor implementation progress
   - Track task completion
   - Report any errors or blockers

5. **Implementation monitoring**:
   - The implement command will:
     - Check checklist status (if checklists exist)
     - Execute tasks phase by phase
     - Respect dependencies and parallel execution rules
     - Mark completed tasks in tasks.md
     - Create ignore files (.gitignore, etc.)
     - Follow TDD approach (tests before implementation)
   - You should:
     - Wait for implementation to complete
     - Report progress updates to user
     - Handle any interactive prompts from implement

6. **Verify implementation**:
   - Check that all tasks marked as completed in tasks.md
   - Verify files created match the plan structure
   - Confirm tests pass (if tests were generated)

### Phase 8: Final Completion Report

1. **Generate comprehensive summary**:
   - Feature name and branch
   - All generated file paths
   - Implementation status
   - Test results (if applicable)
   - Time elapsed for entire workflow

2. **Report format**:
   ```markdown
   ## ✅ SpecKit Auto Workflow Complete - Feature Implemented!
   
   **Feature**: [Feature Name]
   **Branch**: [Branch Name]
   **Total Time**: [Duration]
   
   ### 📋 Phase 1: Specification
   - ✓ Specification: [path/to/spec.md]
     - Clarifications: [N questions answered]
   
   ### 📐 Phase 2: Planning
   - ✓ Technical Plan: [path/to/plan.md]
   - ✓ Research: [path/to/research.md]
   - ✓ Data Model: [path/to/data-model.md]
   - ✓ Contracts: [path/to/contracts/]
   - ✓ Quickstart: [path/to/quickstart.md]
   
   ### ✅ Phase 3: Tasks
   - ✓ Tasks: [path/to/tasks.md]
     - Total tasks: [N]
     - Completed: [N]
     - User stories: [N]
   
   ### 📝 Phase 4: Checklists (if generated)
   - ✓ UX Checklist: [path/to/checklists/ux.md] ([N items])
   - ✓ API Checklist: [path/to/checklists/api.md] ([N items])
   - ✓ Security Checklist: [path/to/checklists/security.md] ([N items])
   
   ### 🔍 Phase 5: Analysis (if run)
   - ✓ Consistency Analysis: [Passed/Issues Found and Fixed]
   
   ### 🚀 Phase 6: Implementation
   - ✓ Implementation Status: [Complete/Partial/Failed]
   - ✓ Files Created: [N files]
   - ✓ Tests: [Passed/Failed/Skipped]
   - ✓ Ignore Files: [.gitignore, .dockerignore, etc.]
   
   ### 📂 Implemented Files
   [List of created/modified files with paths]
   
   ### 🎯 Next Steps
   
   **If Implementation Complete**:
   1. Review implemented code
   2. Run tests: `[test command from plan]`
   3. Commit changes: `git add . && git commit -m "Implement [feature]"`
   4. Create PR: `gh pr create` or `/speckit.taskstoissues`
   
   **If Implementation Partial**:
   1. Review completed tasks in tasks.md
   2. Check error messages for blocked tasks
   3. Complete remaining tasks manually
   4. Re-run `/speckit.implement` to continue
   
   **If Implementation Failed**:
   1. Review error messages
   2. Fix blocking issues
   3. Re-run from failed phase
   ```

3. **Workflow metrics**:
   - Report success rate by phase
   - List any skipped phases
   - Highlight any warnings or issues
   - Provide recovery commands if needed

4. **Git status reminder**:
   - Remind user to commit changes
   - Suggest commit message based on feature
   - Provide PR creation guidance

## Error Handling

- **At any phase failure**:
  1. Report which phase failed and at what step
  2. Show detailed error message
  3. Provide recovery steps
  4. Ask user: "Retry failed phase, skip to next, or abort?"
  5. Handle user choice appropriately

- **Common failure scenarios**:
  - **Git not initialized** → Instruct to run `git init`
  - **.specify/ directory missing** → Instruct to set up SpecKit
  - **Spec generation fails** → Check feature description clarity, retry with more details
  - **Clarification incomplete** → Resume interactive Q&A from where it stopped
  - **Plan has unresolved items** → Re-run research phase or provide manual input
  - **Tasks.md validation fails** → Re-run `/speckit.tasks` with fixes
  - **Checklist generation fails** → Skip and continue, or retry with different parameters
  - **Analysis finds critical issues** → Fix issues before proceeding to implementation
  - **Implementation fails on specific task** → Report task ID, error, suggest manual fix or skip

- **Recovery options**:
  - **Retry**: Re-run the failed phase with same parameters
  - **Skip**: Continue to next phase (with warning about potential issues)
  - **Abort**: Stop workflow, allow user to fix manually
  - **Resume**: If user fixes issues externally, resume from next phase

- **Partial completion handling**:
  - Track which phases completed successfully
  - Allow resuming from any phase
  - Don't re-run successful phases unless explicitly requested
  - Preserve all generated artifacts even if workflow aborts

## Usage Examples

Basic usage:
```
/speckit.auto Implement user authentication with email and password
```

With tech stack context:
```
/speckit.auto Create a dashboard for analytics. Using React, TypeScript, and Chart.js
```

Complex feature:
```
/speckit.auto Add real-time notifications system with WebSocket support for multiple user roles
```

## Behavior Rules

1. **Sequential execution**: Never skip phases; each depends on previous (except optional phases)
2. **Interactive participation**: Actively participate in clarification Q&A with intelligent defaults
3. **Validation gates**: Verify artifacts at each phase before proceeding
4. **Error recovery**: Offer retry/skip/abort options on any failure
5. **Context preservation**: Carry forward feature context through all phases
6. **Best practices**: Make informed decisions based on industry standards
7. **User control**: Respect user signals ("skip", "done", "abort", custom answers)
8. **Progress transparency**: Report completion status after each phase
9. **Artifact preservation**: Never delete generated files, even on failure
10. **Optional phase handling**: Allow skipping checklist and analysis phases
11. **Implementation safety**: Confirm before starting implementation phase
12. **Resumability**: Support resuming from any phase if workflow interrupted

## Important Notes

- **Total execution time**: 15-60 minutes depending on feature complexity
  - Simple features (1-2 stories): 15-25 minutes
  - Medium features (3-5 stories): 25-40 minutes
  - Complex features (6+ stories): 40-60 minutes
- **Interactive steps**: User must be available for:
  - Clarification questions (Phase 2) - 2-5 minutes
  - Optional phase confirmations - 30 seconds each
  - Implementation approval - 30 seconds
- **Optional phases**: Checklist and Analysis can be skipped for faster completion
- **Resumable**: If interrupted, individual commands can be re-run from any phase
- **Git state**: Workflow creates a new feature branch; ensure clean working directory
- **Single feature focus**: This workflow is for ONE feature at a time
- **Implementation is automated**: AI will write actual code, not just generate tasks
- **Long-running**: Implementation phase may take 10-30 minutes for complex features

## Prerequisites Check

Before starting, verify:
- [ ] Git repository initialized (`git status` works)
- [ ] `.specify/` directory exists with templates
- [ ] Feature description provided in arguments (clear and detailed)
- [ ] Clean working directory (or on appropriate branch)
- [ ] SpecKit scripts are executable
- [ ] 15-60 minutes available for full workflow
- [ ] Ready to answer clarification questions
- [ ] Prepared for AI to write implementation code

## Time Breakdown by Phase

| Phase | Time Estimate | Interactive? |
|-------|--------------|--------------|
| 1. Specification | 2-4 min | No |
| 2. Clarification | 2-5 min | ✅ Yes (Q&A) |
| 3. Planning | 3-6 min | No |
| 4. Tasks | 2-3 min | No |
| 5. Checklists | 1-2 min | ✅ Yes (Optional) |
| 6. Analysis | 1-2 min | ✅ Yes (Optional) |
| 7. Implementation | 10-30 min | ✅ Yes (Approval) |
| **Total** | **15-60 min** | **~5-10 min interactive** |
