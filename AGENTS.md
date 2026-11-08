# Agent notes

## Task dossiers live in `razzia-workflow/tasks/`

Task dossiers (plans, deep dives, progress, evidence) go in **`razzia-workflow/tasks/<NNNN-slug>/`**, not in `.workflow/tasks/`.

- `razzia-workflow/` is the private repo `insominx/razzia-workflow`, cloned into the project root and ignored by this repo (`.gitignore`). Its tasks continue one sequence (`0001`–`0009` exist; the next is `0010`).
- The g-skills `create-task-folder` tool defaults to `.workflow/tasks/`, where it restarts at `0001`. Point it at the right place:

  ```
  node <g-skills>/bin/create-task-folder.js <slug> --tasks-dir razzia-workflow/tasks --path
  ```

  The tool may also leave a generated `.workflow/distillations/README.md`; delete it. Distillations belong in `razzia-workflow/distillations/`.
- Leave `.workflow/` as it is. It holds only the tracked `README.md`, which both repos share.
- Commit and push dossier changes from inside `razzia-workflow/`, not from this repo.

## Source of truth

- Decisions: `docs/adr/`.
- Design language: `packages/web/STYLE.md`.
- Contribution rules: `.github/CONTRIBUTING.md`.
