# Project Agent Instructions

Este repositorio contiene una central de avisos multiempresa para empresas de servicios con técnicos de campo: avisos, partes y facturación en modo NO-VERIFACTU firmado.

## Read First

- `CONTEXT.md` — lenguaje de dominio: aviso, parte, sede, tenant, cuota.
- `docs/build-brief.md` — problema, usuarios, alcance del MVP y criterios de éxito.
- `docs/domain-model.md` — entidades, relaciones, estados y casos límite.
- `docs/risks-and-open-questions.md` — riesgos y decisiones pendientes.

Leer solo cuando sea relevante:

- `docs/user-and-access-model.md` — usuarios, roles, permisos, aislamiento y revocación.
- `docs/technical-discovery.md` — stack, datos, integraciones, despliegue y operación.
- `DESIGN.md` — cualquier cambio de interfaz o de dirección visual.
- `docs/adr/` — si existe y una decisión puede contradecir otra aceptada.

## Startup Workflow

Antes de escribir código:

1. Confirmar el directorio de trabajo con `pwd`.
2. Leer `PROGRESS.md` para conocer el estado verificado y el siguiente paso.
3. Leer `feature_list.json` y elegir la primera feature no terminada, en orden, cuyas dependencias estén en `accepted`.
4. Ejecutar `./init.sh`. En Windows, usar Git Bash si el `bash` por defecto es WSL: `& "C:\Program Files\Git\bin\bash.exe" init.sh`.
5. Si la verificación base falla, arreglarla antes de añadir trabajo nuevo.

## Working Rules

- Trabajar en una sola feature a la vez.
- No marcar una feature como terminada solo porque se añadió código.
- Mantener los cambios dentro del alcance de la feature; solo arreglos estrechos si hay un bloqueo.
- No cambiar las reglas de verificación durante la implementación sin dejarlo documentado.
- Actualizar los artefactos del repo en lugar de depender de resúmenes de chat.
- Preservar el aislamiento entre empresas y el registro de auditoría en cada cambio.
- No activar el modo VERIFACTU: el MVP es NO-VERIFACTU con capa de abstracción.
- La documentación del proyecto se escribe en español.

## Required Artifacts

- `feature_list.json`: fuente de verdad del estado de las features.
- `PROGRESS.md`: estado verificado actual y registro breve de sesiones.
- `init.sh`: camino estándar de arranque y verificación.

## Definition Of Done

Una feature está terminada solo si:

- el comportamiento objetivo está implementado,
- la verificación requerida se ejecutó de verdad,
- la evidencia queda registrada en `feature_list.json` o `PROGRESS.md`,
- el repositorio sigue arrancando desde el camino estándar,
- la documentación relevante se actualizó si cambió el producto, el dominio o la verificación.

## End Of Session

Antes de terminar una sesión:

1. Actualizar `PROGRESS.md`.
2. Actualizar `feature_list.json`.
3. Registrar riesgos o bloqueos sin resolver.
4. Dejar el repo listo para que la siguiente sesión ejecute `./init.sh` sin pasos manuales.
