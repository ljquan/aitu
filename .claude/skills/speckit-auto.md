# SpecKit Auto Workflow

Execute the complete SpecKit workflow automatically, from feature specification to implementation-ready tasks.

## Description

This skill automates the entire SpecKit workflow by sequentially executing:
1. `/speckit.specify` - Create feature specification from description
2. `/speckit.clarify` - Interactive clarification of ambiguities
3. `/speckit.plan` - Generate technical implementation plan
4. `/speckit.tasks` - Create actionable, dependency-ordered tasks
5. `/speckit.checklist` - Generate acceptance checklists (optional)
6. `/speckit.analyze` - Analyze artifacts for consistency (optional)
7. `/speckit.implement` - Execute all tasks and implement the feature

## Usage

Invoke this skill when you want to go from a feature description to implementation-ready tasks in one automated flow.

## Workflow

The skill will:
1. Take your feature description as input
2. Execute each speckit command in sequence
3. Handle interactive clarifications
4. Generate all required artifacts
5. Report completion with paths to all generated files

## Prerequisites

- Git repository with `.specify/` directory structure
- SpecKit templates properly configured
- Clean working directory (or appropriate feature branch)

## Output

Upon completion, you'll have:
- Complete feature specification (spec.md)
- Clarified requirements 
- Technical implementation plan (plan.md)
- Dependency-ordered tasks (tasks.md)
- Consistency analysis report (optional)
- All artifacts in the feature directory structure
