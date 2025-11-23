# SpecKit Auto - Automated Workflow Guide

## Overview

`/speckit.auto` is a **FULLY AUTOMATED** command that executes the complete SpecKit workflow from feature description to **IMPLEMENTED CODE**. This is not just planning - it writes the actual implementation!

## Quick Start

Simply run:
```
/speckit.auto [Your feature description here]
```

## What It Does

Automatically executes **ALL 7 PHASES** in sequence:

1. **✍️ Specify** (`/speckit.specify`)
   - Creates feature specification (spec.md)
   - Generates branch and directory structure
   - Validates spec quality

2. **❓ Clarify** (`/speckit.clarify`)
   - Interactive Q&A session (max 5 questions)
   - Resolves ambiguities
   - Updates spec with clarifications

3. **📋 Plan** (`/speckit.plan`)
   - Generates technical implementation plan
   - Creates data models and contracts
   - Produces research documentation

4. **✅ Tasks** (`/speckit.tasks`)
   - Creates dependency-ordered task list
   - Organizes by user story
   - Marks parallelizable tasks

5. **📝 Checklist** (`/speckit.checklist`) - Optional
   - Generates acceptance checklists
   - Creates UX, API, security checklists
   - Validates requirements quality

6. **🔍 Analyze** (`/speckit.analyze`) - Optional
   - Cross-artifact consistency check
   - Identifies conflicts
   - Validates completeness

7. **🚀 Implement** (`/speckit.implement`) - **WRITES CODE!**
   - Executes all tasks from tasks.md
   - Creates files and implements features
   - Writes tests (if specified)
   - Sets up ignore files
   - Marks tasks as complete

## Example Usage

### Basic Feature
```bash
/speckit.auto Implement user authentication with email and password
```

### With Tech Context
```bash
/speckit.auto Create analytics dashboard. Using React, TypeScript, Chart.js
```

### Complex Feature
```bash
/speckit.auto Add real-time notification system with WebSocket for multiple user roles
```

## Workflow Phases

### Phase 1: Specification ✍️
- **Input**: Your feature description
- **Output**: `spec.md` with complete requirements
- **Duration**: ~1-2 minutes
- **Interactive**: No

### Phase 2: Clarification ❓
- **Input**: Automated questions about ambiguities
- **Output**: Updated `spec.md` with clarifications
- **Duration**: ~2-5 minutes
- **Interactive**: ✅ YES - Answer up to 5 questions

### Phase 3: Planning 📋
- **Input**: Clarified specification
- **Output**: `plan.md`, `research.md`, `data-model.md`, `contracts/`
- **Duration**: ~2-4 minutes
- **Interactive**: No

### Phase 4: Tasks ✅
- **Input**: Complete plan and spec
- **Output**: `tasks.md` with actionable checklist
- **Duration**: ~1-2 minutes
- **Interactive**: No

### Phase 5: Analysis 🔍
- **Input**: All generated artifacts
- **Output**: Consistency report
- **Duration**: ~1 minute
- **Interactive**: ✅ YES - Choose whether to run

### Phase 6: Checklists 📝
- **Input**: Spec, plan, tasks
- **Output**: Acceptance checklists (ux.md, api.md, etc.)
- **Duration**: ~1-2 minutes
- **Interactive**: ✅ YES - Choose which checklists to generate

### Phase 7: Implementation 🚀
- **Input**: Complete plan, tasks, and checklists
- **Output**: **ACTUAL IMPLEMENTED CODE!**
- **Duration**: ~10-30 minutes
- **Interactive**: ✅ YES - Approval required before execution

## Interactive Elements

### Clarification Questions (Phase 2)

The workflow will pause and ask questions like:

```markdown
## Question 1: Authentication Method

**Recommended:** Option B - OAuth 2.0 with social providers

| Option | Description |
|--------|-------------|
| A | Simple email/password with sessions |
| B | OAuth 2.0 with social providers |
| C | JWT tokens with refresh mechanism |

You can reply with: "B", "yes", "recommended", or provide custom answer
```

**How to respond:**
- Accept recommendation: "yes" or "recommended"
- Choose option: "A", "B", or "C"
- Custom answer: Provide your own (≤5 words)
- Skip remaining: "done" or "proceed"

### Analysis Decision (Phase 6)

```markdown
Run consistency analysis on generated artifacts?
- Yes - Run /speckit.analyze for validation
- No - Skip and proceed to checklists
```

### Checklist Generation (Phase 6)

```markdown
Generate acceptance checklists?
- Yes - Generate recommended checklists (UX, API, Security)
- No - Skip checklist generation
- Custom - I'll specify which types
```

### Implementation Approval (Phase 7)

```markdown
Ready to start implementation?
- Yes - Execute all tasks and implement the feature
- No - Stop here, I'll implement manually
- Review - Let me review artifacts first
```

**IMPORTANT**: Phase 7 will write actual code files! Make sure you're ready.

## Output Structure

After completion, you'll have **COMPLETE IMPLEMENTED FEATURE**:

```
specs/
└── N-feature-name/
    ├── spec.md              # Feature specification
    ├── plan.md              # Technical plan
    ├── tasks.md             # Task checklist (all marked complete!)
    ├── research.md          # Technical decisions
    ├── data-model.md        # Data entities
    ├── quickstart.md        # Test scenarios
    ├── contracts/           # API contracts
    │   ├── openapi.yaml
    │   └── ...
    └── checklists/          # Quality checklists
        ├── ux.md
        ├── api.md
        └── security.md

src/                         # ACTUAL IMPLEMENTED CODE!
├── models/                  # Data models
│   └── user.py
├── services/                # Business logic
│   └── auth_service.py
├── api/                     # API endpoints
│   └── routes.py
├── middleware/              # Middleware components
│   └── auth.py
└── tests/                   # Tests (if specified)
    ├── test_models.py
    └── test_services.py

.gitignore                   # Auto-generated
.dockerignore               # Auto-generated (if Docker used)
```

## Success Criteria

✅ Workflow successful when:
- All 7 phases complete without critical errors
- spec.md has no [NEEDS CLARIFICATION] markers
- plan.md has all technical decisions documented
- tasks.md follows checklist format with all tasks marked [X]
- (Optional) Checklists generated and validated
- (Optional) Analysis shows no critical inconsistencies
- **Implementation complete with all files created**
- **Tests pass (if tests were generated)**
- **Code matches specification requirements**

## Error Recovery

If workflow fails at any phase:

1. **Specification Phase**
   - Check feature description clarity
   - Ensure .specify/ directory exists
   - Verify git repository initialized

2. **Clarification Phase**
   - Resume from where it stopped
   - Answer remaining questions
   - Or run `/speckit.clarify` manually

3. **Planning Phase**
   - Check spec.md completeness
   - Verify all clarifications resolved
   - Re-run `/speckit.plan` if needed

4. **Tasks Phase**
   - Ensure plan.md exists
   - Check data-model.md validity
   - Re-run `/speckit.tasks` if needed

5. **Analysis Phase**
   - Review reported inconsistencies
   - Fix artifacts manually
   - Re-run `/speckit.analyze`

6. **Checklist Phase**
   - Check feature requirements
   - Re-run `/speckit.checklist [type]`
   - Complete checklist items

7. **Implementation Phase**
   - Review error for specific task that failed
   - Fix blocking issue manually
   - Re-run `/speckit.implement` to continue
   - Or skip failed task and continue with rest

## Time Estimates

| Feature Complexity | Total Time | Interactive Time | Implementation Time |
|-------------------|------------|------------------|---------------------|
| Simple (1-2 stories) | 15-25 min | 2-3 min | 10-15 min |
| Medium (3-5 stories) | 25-40 min | 3-5 min | 15-25 min |
| Complex (6+ stories) | 40-60 min | 5-10 min | 25-40 min |

**Note**: Implementation time is the AI actually writing code, not just planning!

## Tips for Best Results

1. **Clear descriptions**: More detail = fewer clarification questions
2. **Tech stack**: Mention preferred technologies in description
3. **Stay available**: Be ready for interactive clarification phase
4. **Trust recommendations**: Auto workflow uses industry best practices
5. **Review outputs**: Check generated artifacts before implementation

## Comparison: Manual vs Auto

### Manual Workflow
```bash
/speckit.specify [description]
# Review spec.md
/speckit.clarify
# Answer questions
/speckit.plan
# Review plan.md
/speckit.tasks
# Review tasks.md
/speckit.checklist
# Generate checklists
/speckit.analyze
# Review analysis
/speckit.implement
# Monitor implementation
# Review code
# Run tests
# Commit changes
```
**Time**: 30-90 minutes (with context switching)

### Auto Workflow
```bash
/speckit.auto [description]
# Answer clarification questions when prompted
# Optionally choose to generate checklists
# Optionally choose to run analysis  
# Approve implementation
# Wait for completion
# Review and commit
```
**Time**: 15-60 minutes (streamlined, less context switching)

**Savings**: 15-30 minutes + significantly less mental overhead!

## When to Use Manual vs Auto

### Use `/speckit.auto` when:
- ✅ Starting fresh feature from description
- ✅ Want streamlined end-to-end flow
- ✅ Available for 15-60 minutes continuously
- ✅ Trust automated best practices
- ✅ **Want AI to write the implementation**
- ✅ **Ready for complete automation**

### Use manual commands when:
- ✅ Need to review/iterate on specific phase
- ✅ Want granular control at each step
- ✅ Updating existing artifacts
- ✅ Learning the SpecKit workflow
- ✅ **Want to write code yourself**
- ✅ **Need to pause between phases**

## Prerequisites

Before running `/speckit.auto`:

- [x] Git repository initialized
- [x] `.specify/` directory with templates
- [x] SpecKit scripts executable
- [x] Clean working directory
- [x] **15-60 minutes available** (not 10-20!)
- [x] Feature description ready
- [x] **Ready to let AI write implementation code**
- [x] **Prepared to review and test generated code**

## Next Steps After Completion

1. **Review Implementation**
   - Check generated code files
   - Review implementation matches spec
   - Verify tests pass (if generated)

2. **Test the Feature**
   ```bash
   # Run tests
   npm test  # or pytest, cargo test, etc.
   
   # Run the application
   npm start  # or python app.py, etc.
   
   # Manual testing
   # Follow scenarios from quickstart.md
   ```

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "Implement [feature name]

   - Add [component 1]
   - Implement [component 2]
   - Add tests for [functionality]
   
   Generated via /speckit.auto"
   ```

4. **Create Pull Request** (optional)
   ```bash
   # Push to remote
   git push -u origin [branch-name]
   
   # Create PR
   gh pr create --title "[Feature name]" --body "$(cat specs/N-feature-name/spec.md)"
   
   # Or convert tasks to issues
   /speckit.taskstoissues
   ```

5. **Next Feature**
   ```bash
   # Start another feature
   /speckit.auto [next feature description]
   ```

## Troubleshooting

### "No feature description provided"
- **Cause**: Empty $ARGUMENTS
- **Fix**: Provide description after command
  ```bash
  /speckit.auto Add user profile page
  ```

### "Git repository not initialized"
- **Cause**: Not in git repo
- **Fix**: 
  ```bash
  git init
  ```

### ".specify/ directory missing"
- **Cause**: SpecKit not set up
- **Fix**: Set up SpecKit structure first

### "Clarification incomplete"
- **Cause**: Questions not answered
- **Fix**: Answer all questions or say "done"

### "NEEDS CLARIFICATION markers remain"
- **Cause**: Clarification phase skipped/failed
- **Fix**: Re-run `/speckit.clarify`

### "Checklist incomplete - cannot proceed"
- **Cause**: Generated checklists have unchecked items
- **Fix**: Review and complete checklist items, or approve to proceed anyway

### "Task implementation failed"
- **Cause**: Specific task couldn't be completed by AI
- **Fix**: Review error, fix manually, re-run `/speckit.implement` or skip task

### "Tests failing after implementation"
- **Cause**: Generated tests don't pass
- **Fix**: Review test failures, fix implementation, or adjust tests

**Remember**: `/speckit.auto` now goes all the way to implementation!

## Advanced Usage

### Skip Optional Phases
Say "No" when prompted for:
- Checklist generation (saves 1-2 min)
- Consistency analysis (saves 1 min)

### Minimal Interaction Mode
Accept all recommendations:
- Clarification: Say "yes" or "recommended" to each question
- Checklists: Say "No" to skip
- Analysis: Say "No" to skip
- Implementation: Say "Yes" immediately

**Fastest possible**: 15-20 minutes for simple features

### Custom Checklist Types
When prompted for checklists, choose "Custom" and specify:
```
Generate performance and accessibility checklists
```

### Pause Before Implementation
Choose "Review" when asked about implementation:
- Review all generated artifacts
- Make manual adjustments if needed
- Resume with "Yes" when ready

### Implementation with TDD
Include in feature description:
```
/speckit.auto Add user authentication. Include comprehensive tests using TDD approach
```
AI will generate tests before implementation code.

### Tech Stack Specification
Include in feature description:
```
/speckit.auto Create REST API for products. Using Python FastAPI with PostgreSQL and SQLAlchemy
```
This guides the implementation phase.

## Support

For issues or questions:
- Check individual command docs: `/speckit.specify`, `/speckit.clarify`, etc.
- Review generated artifacts for specific error messages
- Ensure all prerequisites are met

---

## 🎯 Key Takeaways

1. **`/speckit.auto` is FULLY AUTOMATED** - It writes actual code, not just plans
2. **Budget 15-60 minutes** - Not just planning time, but full implementation
3. **Be available for interaction** - Clarification Q&A (~5 min) and approvals (~1 min)
4. **Review before committing** - AI-generated code should always be reviewed
5. **Optional phases are skippable** - Checklists and analysis save time if skipped
6. **Errors are recoverable** - Can retry, skip, or resume from any phase
7. **One feature at a time** - Focus on completing one feature fully before starting next

## 🚀 Quick Start Command

For the impatient:

```bash
# Minimal interaction - fastest path to implemented code
/speckit.auto Implement user authentication with email and password
# Then:
# - Answer 3-5 clarification questions (say "yes" to recommendations)
# - Say "No" to checklists
# - Say "No" to analysis
# - Say "Yes" to implementation
# - Wait 10-20 minutes
# - Review and commit code
```

---

**Happy automating! 🚀 Now with actual implementation!**
