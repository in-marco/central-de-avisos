---
name: feature-flow
description: "Orchestrate the planner, implementer, and validator workflow for one feature using the project's configured subagents. Use when the user asks to run the feature flow, continue the next available feature, delegate to planner/implementer/validator agents, or move a feature through spec, implementation, and validation."
---

# feature-flow (envoltorio para Claude Code)

La fuente de verdad de esta skill es `.agents/skills/feature-flow/SKILL.md`,
compartida con Codex y opencode. Este archivo solo la expone a Claude Code.

1. Lee `.agents/skills/feature-flow/SKILL.md` completo y síguelo al pie de la
   letra.
2. Resuelve sus rutas relativas (`../../../AGENTS.md`, etc.) respecto a
   `.agents/skills/feature-flow/`, no respecto a este archivo.

## Correspondencia con el runtime de Claude Code

- Los «project subagents configured for the active agent runtime» son los de
  `.claude/agents/`: `planner`, `implementer` y `validator`. Lánzalos con la
  herramienta Agent y `subagent_type` igual a su nombre.
- Cada subagente sigue su skill de `.agents/skills/` (`feature-spec`,
  `feature-implementer` y `feature-validator`). Pásales solo el contexto
  dinámico que pide la skill: ruta del repo, id de la feature, rol, ruta de la
  spec y, si aplica, el brief de reparación del validador.
- Los subagentes no hacen commit. El commit tras `accept` lo hace la sesión
  principal (el orquestador), y sin push salvo que el usuario lo pida.
- `CONSTRAINTS.md` exige verificar los formularios nuevos con un navegador real.
  Recuérdaselo al `implementer` y al `validator` cuando la feature tenga
  formularios.

No dupliques aquí reglas del flujo: cualquier cambio se hace en
`.agents/skills/feature-flow/`.
