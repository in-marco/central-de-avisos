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

- Login con email y contraseña; no hay autoregistro abierto.
- La sesión es opaca, absoluta y dura 12 h; no se renueva de forma deslizante.
  Se permiten sesiones concurrentes y el logout revoca solo la actual.
- Cada petición privada valida la sesión en base de datos y comprueba que el
  usuario siga `ACTIVO` y su empresa `ACTIVA`. Suspender la empresa o
  desactivar al usuario invalida sus sesiones existentes.
- El superadmin usa el mismo flujo con `empresa_id` nulo y `es_superadmin =
  true`; el panel muestra «Proveedor SaaS» en lugar de empresa.
- `/superadmin` y `/api/superadmin/*` exigen `es_superadmin` con
  `empresa_id` nulo. Un usuario de empresa recibe 403; un anónimo va al login.
- El superadmin crea y edita el catálogo global de planes. No los borra.
- El alta de empresa crea en una transacción la empresa, un administrador
  `INACTIVO` sin `password_hash` y una invitación de 7 días. El email del
  invitado es el email único de `usuarios`.
- La invitación guarda solo el SHA-256 del token. El enlace local se muestra
  una vez desde una cookie flash de 60 s; no se envía por email y no se puede
  recuperar.
- El invitado abre `/invitacion/<token>`, define una contraseña de 12 a 128
  caracteres (con confirmación) y entra en `/panel` con una sesión de su
  empresa. La aceptación marca la invitación, guarda la contraseña, activa al
  usuario y crea la sesión en una sola transacción; es de un solo uso.
- Una invitación caducada, ya utilizada o de una empresa `SUSPENDIDA` no
  activa la cuenta. La de una empresa suspendida sigue pendiente hasta que
  caduque.
- Si el navegador tenía otra sesión abierta, se revoca al activar la cuenta.
- Los usuarios de empresa tienen roles combinables persistidos
  (`ADMINISTRADOR`, `OFICINA`, `TECNICO`). La matriz de permisos de este
  documento (columnas Administrador, Oficina y Técnico) está en
  `src/lib/authz/permissions.ts`; los permisos de varios roles se suman y, por
  defecto, se deniega. Un usuario de empresa sin roles solo ve `/panel` con el
  aviso «Sin roles asignados».
- Los roles se leen de la base de datos en cada petición: dar o quitar un rol
  surte efecto en la siguiente petición del usuario, sin cerrar su sesión.
- El administrador gestiona los roles de su empresa en `/panel/usuarios`. No
  puede dejar a un usuario sin roles ni quitarse su propio rol de
  administrador, y la empresa conserva siempre al menos un administrador
  `ACTIVO`, también ante cambios simultáneos.
- Oficina, técnico, usuario sin roles y superadmin reciben 403 en
  `/panel/usuarios` y en su API; la navegación solo muestra «Usuarios» a quien
  tiene el permiso.
- El superadmin no tiene roles de empresa (CHECK en base de datos) ni gestiona
  roles desde `/panel`; su acceso sigue siendo `es_superadmin` con
  `empresa_id` nulo. La fila «Gestionar usuarios de empresa: Superadmin Sí»
  queda pendiente de una superficie de proveedor específica.
- El alta de empresa crea al administrador invitado con el rol
  `ADMINISTRADOR`.
- «Configurar empresa, tarifas y series» (permiso `empresa.configurar`, solo
  Administrador, incluido el encargado `ADMINISTRADOR+TECNICO`) se ejerce en
  `/panel/empresa`: datos fiscales, serie, tarifa horaria y modo
  NO-VERIFACTU, siempre sobre la empresa de la sesión. Oficina, técnico,
  usuario sin roles y superadmin reciben 403 en la página y en
  `POST /api/panel/empresa`; la navegación solo muestra «Empresa» a quien
  tiene el permiso. Oficina y técnico no leen la configuración en este slice.
- «Gestionar clientes, sedes y contactos» (permiso `clientes.gestionar`,
  Administrador y Oficina, incluidas sus combinaciones con Técnico): ven
  «Clientes» en la navegación y usan `/panel/clientes` para dar de alta,
  editar y listar clientes de su empresa con sus sedes y contactos. Técnico, usuario sin roles
  y superadmin reciben 403 en las páginas y en `/api/panel/clientes/*`; un
  anónimo va al login con `next`. Un cliente, sede o contacto de otra empresa
  se trata como inexistente (404 o `?error=no-encontrado`), sin revelar que
  existe. El superadmin no ve clientes desde `/panel` (queda para
  `superadmin-tenant-view`).
- «Crear aviso» (permiso `avisos.crear`, Administrador y Oficina, incluidas sus
  combinaciones con Técnico, como el encargado): ven «Avisos» en la
  navegación y usan `/panel/avisos` (listado), `/panel/avisos/nuevo` (alta) y
  `/panel/avisos/<id>` (detalle), con `POST /api/panel/avisos`. Técnico,
  usuario sin roles y superadmin reciben 403 en las tres páginas y en el POST;
  un anónimo va al login con `next`. La empresa y el creador salen de la
  sesión; cliente, sede y contacto se resuelven dentro de la empresa, y un
  cliente o aviso de otra empresa se trata como inexistente. El origen
  (`OFICINA`) y el estado (`NUEVO`) los fija el servidor. La parte de Cliente
  («Sí, de sus sedes») llegará con `client-aviso-creation`.
- Siguen fuera de este slice: rol Cliente y portal (`client-portal-invitation`),
  invitar usuarios de oficina o técnicos, desactivar usuarios
  (`user-deactivation`), auditoría de cambios de rol, reenvío de invitaciones,
  recuperación de contraseña y revocación masiva.

## Revocation / Expiry

- Desactivar un usuario invalida sus sesiones y le impide entrar.
- Los datos históricos del usuario desactivado se conservan con su identidad.
- Los avisos abiertos de un técnico desactivado se devuelven a la bolsa o se reasignan.
- Retirar el acceso de un usuario de cliente no borra avisos ni facturas ya emitidas.
- Suspender una empresa bloquea el acceso de todos sus usuarios, pero conserva sus datos y facturas.
- Las invitaciones caducan a los 7 días si no se aceptan. El enlace mostrado
  desde la cookie flash no se puede recuperar ni reenviar en este slice.

## Edge Cases

- Un técnico con rol de administrador puede configurar la empresa y además ejecutar partes.
- Un usuario de cliente que también es contacto de varias sedes mantiene un único acceso.
- Un cliente puede quedarse sin usuarios de portal y seguir operando a través de la oficina.
- Un email ya usado por otra empresa no puede invitarse de nuevo; se resuelve con otra cuenta o se rechaza la invitación.
- El superadmin no puede ser asignado como técnico de una empresa.
- Si se cambia el cliente de un aviso con partes, se bloquea; se cancela y se crea otro aviso.
