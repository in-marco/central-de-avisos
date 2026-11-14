---
name: feature-validator
description: "Independently validate one implemented feature against a feature spec file under docs/specs, feature_list.json, PROGRESS.md, and the current diff. Use when the user asks to validate, review, QA, evaluate, or accept/reject a feature after implementation. The skill checks behavior, verification evidence, scope discipline, architecture, security, durable documentation, and handoff readiness, then returns accept/revise/block."
---

# feature-validator (envoltorio para Claude Code)

La fuente de verdad de esta skill es `.agents/skills/feature-validator/SKILL.md`,
compartida con Codex y opencode. Este archivo solo la expone a Claude Code.

1. Lee `.agents/skills/feature-validator/SKILL.md` completo y síguelo al pie de la letra.
2. Resuelve sus rutas relativas (`../../../AGENTS.md`, `references/...`)
   respecto a `.agents/skills/feature-validator/`, no respecto a este archivo.
3. Lee los archivos de `.agents/skills/feature-validator/references/` cuando la skill los
   cite.
4. La notación `$<skill>` de la skill equivale a invocar esa skill con la
   herramienta Skill de Claude Code.

No dupliques aquí reglas del flujo: cualquier cambio se hace en
`.agents/skills/feature-validator/`.
