---
name: feature-implementer
description: "Implement exactly one planned feature from a feature spec file under docs/specs. Use when the user asks to implement a feature spec, execute the selected feature, act as the generator/implementer in a planner-generator-validator workflow, or turn a feature implementation spec into code. The skill self-verifies the work, updates progress/evidence, and updates durable documentation when required, but it does not perform final independent validation."
---

# feature-implementer (envoltorio para Claude Code)

La fuente de verdad de esta skill es `.agents/skills/feature-implementer/SKILL.md`,
compartida con Codex y opencode. Este archivo solo la expone a Claude Code.

1. Lee `.agents/skills/feature-implementer/SKILL.md` completo y síguelo al pie de la letra.
2. Resuelve sus rutas relativas (`../../../AGENTS.md`, `references/...`)
   respecto a `.agents/skills/feature-implementer/`, no respecto a este archivo.
3. Lee los archivos de `.agents/skills/feature-implementer/references/` cuando la skill los
   cite.
4. La notación `$<skill>` de la skill equivale a invocar esa skill con la
   herramienta Skill de Claude Code.

No dupliques aquí reglas del flujo: cualquier cambio se hace en
`.agents/skills/feature-implementer/`.
