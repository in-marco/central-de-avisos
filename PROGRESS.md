# Progress Log

## Current Verified State

- Repository root: `D:\desarrollo\CursoAIExpert\central-de-avisos`
- Standard startup path: `./init.sh` (en Windows, Git Bash: `& "C:\Program Files\Git\bin\bash.exe" init.sh`)
- Standard verification path: provisional; la aplicación aún no está inicializada. `init.sh` solo comprueba el harness.
- Current next ready feature: `bootstrap-web-app`
- Current blocker: none para arrancar; la validación legal/fiscal de facturación sigue abierta para producción.
- Last verified at: 2026-11-13 (harness pre-bootstrap)

## Session Log

### Session 001

- Date: 2026-11-13
- Goal: crear el harness mínimo del repositorio.
- Completed: `AGENTS.md`, `init.sh`, `PROGRESS.md` y `feature_list.json` creados a partir del build brief y del modelo de dominio.
- Verification run: `& "C:\Program Files\Git\bin\bash.exe" init.sh` y validación de `feature_list.json` como JSON (31 features, dependencias sin ciclos, cero en progreso).
- Evidence captured: los archivos requeridos existen; el JSON de features es válido; no hay features en progreso.
- Files or artifacts updated: `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`.
- Known risk or unresolved issue: confirmar con gestoría la emisión en nombre de terceros, la firma con certificado de plataforma y los requisitos del modo NO-VERIFACTU.
- Next best step: ejecutar `feature-spec` para `bootstrap-web-app`.
