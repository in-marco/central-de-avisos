# User and Access Model

## User Types

- **Superadmin del proveedor:** usuario de la plataforma SaaS. No pertenece a ninguna empresa de servicios.
- **Administrador de empresa:** configura la empresa, usuarios, tarifas, clientes y facturación.
- **Oficina:** opera avisos, partes y facturas del día a día.
- **Técnico:** ejecuta avisos y registra partes.
- **Usuario de cliente:** pertenece al cliente y usa el portal.

## Roles

Los roles son combinables: un usuario puede ser administrador y técnico, u oficina y administrador. Los permisos se suman. Un usuario pertenece a una sola empresa de servicios; el superadmin es la única excepción.

## Permissions

| Acción | Superadmin | Administrador | Oficina | Técnico | Cliente |
| --- | --- | --- | --- | --- | --- |
| Crear/editar empresas y planes | Sí | No | No | No | No |
| Emitir cuota mensual | Sí | No | No | No | No |
| Ver datos operativos de cualquier empresa | Sí | Solo su empresa | Solo su empresa | Solo su empresa | Solo su cliente |
| Configurar empresa, tarifas y series | No | Sí | No | No | No |
| Gestionar usuarios de empresa | Sí | Sí | No | No | No |
| Gestionar clientes, sedes y contactos | No | Sí | Sí | No | No |
| Crear aviso | No | Sí | Sí | No | Sí, de sus sedes |
| Validar aviso y poner en bolsa | No | Sí | Sí | No | No |
| Asignar aviso | No | Sí | Sí | No | No |
| Tomar aviso de la bolsa | No | No | No | Sí | No |
| Crear/editar parte | No | No | Sí, en nombre de un técnico | Solo los suyos | No |
| Aprobar o devolver parte | No | Sí | Sí | No | No |
| Emitir/anular factura de trabajo | No | Sí | Sí | No | No |
| Ver facturas de trabajo | Sí | Su empresa | Su empresa | No | Las de su cliente |
| Ver registro de auditoría | Sí | Su empresa | Su empresa | No | No |
| Desactivar usuarios | Sí | Su empresa | No | No | No |

Notas:

- El técnico ve los avisos asignados a él, los pendientes de la bolsa de su empresa y sus propios partes.
- El usuario de cliente ve únicamente avisos y facturas de su cliente, no de otros clientes de la misma empresa.
- La oficina puede corregir partes de cualquier técnico de su empresa, con registro de auditoría.
- El superadmin tiene acceso total a los datos operativos por decisión de producto; se recomienda registrar sus accesos.

## Ownership Boundaries

- **Tenant:** la empresa de servicios. Todo dato operativo lleva `empresa_id`.
- **Cliente:** subconjunto de un tenant. Los usuarios de cliente se limitan a su `cliente_id`.
- **Técnico:** subconjunto de un tenant. Sus partes son suyos; puede ver la bolsa común.
- **Factura:** pertenece a la empresa emisora y al cliente destinatario.
- **Cuota mensual:** pertenece al proveedor y a la empresa facturada.

## Access Rules

- Registro solo por invitación. No hay autoregistro abierto.
- Login con email y contraseña. Email único global; un usuario no cambia de empresa en el MVP.
- La pertenencia a la empresa y los roles se comprueban en cada petición, no solo en la UI.
- El portal de cliente se activa invitando a un contacto; la oficina decide qué contactos tienen acceso.
- Un cliente puede tener varios usuarios de portal y varias sedes.
- El técnico solo puede registrar horas en nombre propio; la oficina puede crear o corregir en nombre de un técnico.
- El superadmin puede consultar cualquier empresa; sus accesos quedan en auditoría.

## Comportamiento implementado en este slice

- Login con email y contraseña; no hay autoregistro ni invitaciones todavía.
- La sesión es opaca, absoluta y dura 12 h; no se renueva de forma deslizante.
  Se permiten sesiones concurrentes y el logout revoca solo la actual.
- Cada petición privada valida la sesión en base de datos y comprueba que el
  usuario siga `ACTIVO` y su empresa `ACTIVA`. Suspender la empresa o
  desactivar al usuario invalida sus sesiones existentes.
- El superadmin usa el mismo flujo con `empresa_id` nulo y `es_superadmin =
  true`; el panel muestra “Proveedor SaaS” en lugar de empresa.
- Roles combinables, permisos por rol, invitaciones, recuperación de contraseña
  y revocación masiva quedan fuera de esta feature.

## Revocation / Expiry

- Desactivar un usuario invalida sus sesiones y le impide entrar.
- Los datos históricos del usuario desactivado se conservan con su identidad.
- Los avisos abiertos de un técnico desactivado se devuelven a la bolsa o se reasignan.
- Retirar el acceso de un usuario de cliente no borra avisos ni facturas ya emitidas.
- Suspender una empresa bloquea el acceso de todos sus usuarios, pero conserva sus datos y facturas.
- Las invitaciones caducan si no se aceptan en un plazo definido en implementación.

## Edge Cases

- Un técnico con rol de administrador puede configurar la empresa y además ejecutar partes.
- Un usuario de cliente que también es contacto de varias sedes mantiene un único acceso.
- Un cliente puede quedarse sin usuarios de portal y seguir operando a través de la oficina.
- Un email ya usado por otra empresa no puede invitarse de nuevo; se resuelve con otra cuenta o se rechaza la invitación.
- El superadmin no puede ser asignado como técnico de una empresa.
- Si se cambia el cliente de un aviso con partes, se bloquea; se cancela y se crea otro aviso.
