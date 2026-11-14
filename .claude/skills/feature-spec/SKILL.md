---
name: feature-spec
description: "Create an implementation-ready specification for one feature from feature_list.json. Use when the user asks to plan a feature, create a feature spec, apply lightweight SDD/spec-driven development, prepare work for another implementation agent, or generate specs/tasks/technical plan from the feature list. If no feature id is provided, select the first dependency-ready feature in feature_list.json order that is neither passing nor accepted."
---

# feature-spec (envoltorio para Claude Code)

La fuente de verdad de esta skill es `.agents/skills/feature-spec/SKILL.md`,
compartida con Codex y opencode. Este archivo solo la expone a Claude Code.

1. Lee `.agents/skills/feature-spec/SKILL.md` completo y síguelo al pie de la letra.
2. Resuelve sus rutas relativas (`../../../AGENTS.md`, `references/...`)
   respecto a `.agents/skills/feature-spec/`, no respecto a este archivo.
3. Lee los archivos de `.agents/skills/feature-spec/references/` cuando la skill los
   cite.
4. La notación `$<skill>` de la skill equivale a invocar esa skill con la
   herramienta Skill de Claude Code.

No dupliques aquí reglas del flujo: cualquier cambio se hace en
`.agents/skills/feature-spec/`.
