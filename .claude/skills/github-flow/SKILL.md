---
name: github-flow
description: "Orchestrate multi-feature GitHub delivery on top of feature-flow using git worktrees and gh issues/PRs. Use when the user asks to plan, execute, or publish feature ids in a GitHub repository, to run features in parallel isolated worktrees with independent headless Claude Code sessions, to reuse or create issues, branches, worktrees, or PRs for features, or to publish accepted features as PRs. Modes: plan (planificar, read-only), execute (ejecutar), publish (publicar). Never merges."
---

# github-flow (envoltorio para Claude Code)

La fuente de verdad de esta skill es `.agents/skills/github-flow/SKILL.md`,
compartida con Codex y opencode. Este archivo solo la expone a Claude Code y
traduce lo específico de opencode.

1. Lee `.agents/skills/github-flow/SKILL.md` completo y síguelo al pie de la
   letra, junto con `references/evals.md` cuando se pida evaluar la skill.
2. Resuelve sus rutas relativas respecto a `.agents/skills/github-flow/`.

## Sesión por worktree: `opencode run` → `claude -p`

Donde la skill dice `opencode run --dir <worktree> "<prompt>"`, en Claude Code
se lanza una sesión sin interfaz desde el propio worktree, con `acceptEdits` y
una lista explícita de herramientas permitidas. En Git Bash:

```bash
cd "<worktree>" && \
PATH="/c/Program Files/nodejs:/c/Program Files/PostgreSQL/18/bin:/c/Program Files (x86)/Microsoft/Edge/Application:$PATH" \
claude -p "<prompt>" \
  --permission-mode acceptEdits \
  --add-dir "<tmp-dir>" \
  --add-dir "C:/Program Files (x86)/Microsoft/Edge/Application" \
  --add-dir "C:/Program Files/PostgreSQL/18/bin" \
  --allowedTools \
    "Read" "Glob" "Grep" "Edit" "Write" "Skill" "Agent" \
    "Bash(npm *)" "Bash(npx *)" "Bash(node *)" "Bash(bash *)" "Bash(env *)" \
    "Bash(git status *)" "Bash(git diff *)" "Bash(git log *)" \
    "Bash(git add *)" "Bash(git commit *)" "Bash(git show *)" \
    "Bash(curl *)" "Bash(taskkill *)" "Bash(netstat *)" "Bash(tasklist *)" \
    "Bash(ls *)" "Bash(cat *)" "Bash(grep *)" "Bash(sed *)" "Bash(head *)" \
    "Bash(tail *)" "Bash(wc *)" "Bash(find *)" "Bash(rm *)" "Bash(mkdir *)" \
    "Bash(export *)" "Bash(cp *)" "Bash(sleep *)" "Bash(pwd)" \
    "Bash(psql *)" "Bash(createdb *)" "Bash(dropdb *)" \
    "Bash(msedge *)" "Bash(msedge.exe *)"
```

- `<tmp-dir>` es un directorio temporal propio de la feature, fuera del
  worktree: `<worktrees-root>/.tmp-<feature-id>`. La sesión principal lo crea
  antes de lanzar la sesión y lo borra al terminar. Indica en el prompt que los
  temporales (cookies, logs, perfil de Edge, scripts de prueba) van ahí.
- Sin `--add-dir`, la sesión sin interfaz pide aprobación para cualquier ruta
  fuera del worktree (Edge, psql, temporales) y la deniega. Comprobado en
  `role-based-permissions`: la validación con navegador, el smoke y la base
  temporal quedaron bloqueados por eso.
- `psql`, `createdb`, `dropdb` y `msedge` se permiten por nombre y se ponen en el
  `PATH` de la sesión. No uses rutas completas en `--allowedTools`: el
  paréntesis de `Program Files (x86)` rompe el análisis de la regla y Claude
  Code la ignora.
- Las variables de entorno de un comando van con `env` delante (por ejemplo
  `env SMOKE_EMAIL=... bash scripts/validate-smoke.sh` o
  `env -u DATABASE_URL bash init.sh`). La forma `VAR=x comando` no encaja con
  ninguna regla y se deniega. Indícalo en el prompt.

- El prompt de la sesión es el mismo de la skill: `Use feature-flow for
  <feature-id> only, until accepted.`
- La sesión no tiene permiso de `git push`, `gh` ni `git worktree`. Push,
  issues, PRs y worktrees los gestiona solo la sesión principal, como manda la
  skill.
- Si la sesión se detiene porque necesita un comando que no está en la lista, la
  sesión principal lo informa al usuario. No amplía la lista ni pasa a
  `bypassPermissions` por su cuenta.

## Entorno independiente por worktree

La precondición 4 exige una base de datos propia por worktree, pero `.env` está
ignorado por git y no llega a los worktrees. Antes de lanzar cada sesión:

1. Copia `.env` del checkout base al worktree y cambia en `DATABASE_URL` el
   nombre de la base a `central_de_avisos_<feature_id_con_guiones_bajos>`.
2. Crea esa base (`createdb` o `CREATE DATABASE` con psql) y deja que la sesión
   aplique las migraciones (`npm run db:deploy`; `test:db` también las aplica).
3. Crea el directorio temporal `<worktrees-root>/.tmp-<feature-id>` que se pasa
   con `--add-dir`.
4. Al terminar la feature (`accept` o `block`), borra la base, el directorio
   temporal y el `.env` del
   worktree, salvo que el usuario pida conservarlos.

No dupliques aquí reglas del flujo: cualquier cambio se hace en
`.agents/skills/github-flow/`.
