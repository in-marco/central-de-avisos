# Risks and Open Questions

## Blocking Next Phase

- **Emisión en nombre de terceros:** confirmar con gestoría qué obligaciones tiene la plataforma al emitir facturas de trabajos con datos fiscales de cada empresa y firmarlas con su propio certificado.
- **Registro firmado NO-VERIFACTU:** concretar qué exige la normativa para el modo NO-VERIFACTU del MVP (contenido del registro, firma, conservación y verificación).
- **Certificado de firma:** decidir tipo (avanzado o cualificado), proveedor, custodia y si incluye sellado de tiempo.
- **Alcance VERIFACTU:** confirmar que aplazar el modo VERIFACTU activo es aceptable para el objetivo de la demo.

## Implementation-Time Questions

- Umbral de confianza de la IA y reglas de validación por campo para decidir cuándo se guarda o se revisa.
- Comportamiento exacto de la numeración ante anulación y posibles huecos.
- Momento de congelar la tarifa: al aprobar el parte o al emitir la factura.
- Numeración por empresa y año, y si la serie incluye el año
  (`invoice-signed-pdf`). El formato de la serie como prefijo ya está resuelto
  (ver «Resueltas»). También queda para `invoice-signed-pdf` decidir si se
  bloquea cambiar la serie después de la primera factura emitida.
- Retención y borrado de fotos de partes y PDFs.
- Contrato de tratamiento de datos y región del proveedor de IA.
- Política de reenvío/regeneración de invitaciones caducadas (la caducidad ya está fijada en 7 días).
- Reasignación automática de avisos cuando se desactiva un técnico.

## Later / Not MVP

- Modo VERIFACTU activo con registro, hash y QR de la AEAT.
- Facturas rectificativas.
- Registro de cobros y pagos.
- Pasarela de pago para la cuota mensual.
- App móvil, offline y sincronización.
- Agenda, planificación de rutas y notificaciones push/email.
- Catálogo de equipos con historial y mantenimiento preventivo.
- Catálogo de materiales con stock.
- Marca blanca y dominios propios.
- Multipaís, multimoeda e IGIC.

## Assumptions

- España, EUR, IVA general y zona horaria Europe/Madrid.
- Un usuario pertenece a una única empresa; el email es único global.
- Los avisos creados por clientes pasan por validación de la oficina antes de entrar en la bolsa.
- Un aviso genera una única factura de trabajo.
- Los materiales se escriben a mano con cantidad y precio; no hay catálogo.
- La tarifa se congela al aprobar el parte.
- El cobro y el email se simulan en la demo.
- El superadmin puede ver todos los datos operativos.
- La firma de facturas se hace con el certificado de la plataforma.

## Risks

- **Riesgo legal/fiscal alto:** emitir facturas en nombre de terceros con certificado propio puede exigir contratos, autorizaciones o un modelo distinto. Validar antes de producción.
- **Errores de extracción IA:** un JSON incorrecto puede acabar en una factura. Mitigación: aprobación obligatoria de oficina, umbral de confianza y auditoría.
- **Fuga entre tenants:** un fallo de scoping expone datos de otra empresa. Mitigación actual: `empresa_id` obligatorio, filtros centralizados en `src/db/tenant.ts`, tests de aislamiento con dos empresas y revisión de código. RLS no está activa todavía.
- **RLS diferida (riesgo residual):** una consulta nueva sin `tenantFilter` podría filtrar datos y PostgreSQL no la bloqueará. Mitigación: regla durable en `CONSTRAINTS.md`, revisión en cada feature y reevaluación de RLS antes de producción o al añadir la primera tabla operativa con consultas cruzadas.
- **Compromiso del certificado:** permitiría firmar facturas falsas. Mitigación: HSM o gestor de secretos, permisos mínimos y auditoría.
- **Alcance del MVP demasiado amplio:** portal, IA, firma y facturación mensual en un solo corte. Mitigación: demo interna y datos sembrados.
- **Mala calidad de los manuscritos:** la precisión puede no alcanzar el 80 %. Mitigación: conjunto de prueba real y fallback manual.
- **Adopción por técnicos:** formularios largos en campo. Mitigación: diseño móvil con controles grandes y mínimos campos obligatorios.
- **Confidencialidad:** el acceso total del proveedor puede ser un obstáculo comercial. Mitigación: auditoría de accesos y opción futura de restricción.
- **Fuerza bruta en el login:** el slice actual usa error genérico, hash dummy y scrypt costoso, pero no tiene rate limiting durable. Mitigación pendiente: limitador en edge/WAF o base de datos antes de exponer el login fuera de demo/producción.
- **Sesiones acumuladas:** no hay limpieza programada de sesiones caducadas/revocadas. Mitigación pendiente: job o índice de mantenimiento; el índice por `expira_en` ya está creado.
- **Credenciales de seed:** las contraseñas demo viven en `.env` local y `.env.example`. Mitigación: son solo locales, el seed rechaza producción y `.env` está ignorado; no reutilizarlas.
- **CSRF y open redirect:** login/logout son POST con comprobación de `Origin` cuando llega, `SameSite=Lax` y `next` validado. Riesgo residual: un proxy que no normalice cabeceras `x-forwarded-*` debe revisarse al desplegar.

- **Enlace de invitación irrecuperable:** el token crudo solo se muestra una vez
  desde una cookie flash de 60 s; si se pierde, no hay reenvío, regeneración ni
  email real en este slice. Mitigación: el superadmin debe copiarlo en el
  momento. La activación (`company-admin-onboarding`) no añadió reenvío ni
  regeneración: una invitación perdida o caducada no se puede sustituir desde
  la interfaz. Pendiente de una feature de gestión de invitaciones.
- **Token de invitación en el path del enlace:** el enlace `/invitacion/<token>`
  lleva el token en la URL, que puede quedar en el historial del navegador o
  en logs de un proxy. Mitigación: un solo uso, 7 días, `Referrer-Policy:
  same-origin`, `no-store`, `noindex`, token en el cuerpo del POST y nunca en
  la redirección final; `next start` no lo registra (verificado). Revisar los
  logs del proxy al desplegar.
- **Aceptación sin auditoría:** la activación del administrador no deja un
  registro append-only (solo `aceptada_en`). Mitigación: queda en
  `audit-trail-view`.
- **Invitaciones sin auditoría avanzada:** crear empresas, editar planes y
  generar invitaciones no deja todavía un registro append-only. Mitigación:
  queda en `audit-trail-view`; no se añaden acciones que dependan de auditoría.
- **Cambio de importe sin histórico:** editar un plan cambia el importe que
  verán futuras altas; no hay versionado de precios. Mitigación: la facturación
  mensual congelará el importe aplicable al generar la cuota.
- **Superficie de proveedor sensible:** un fallo en `requireSuperadmin` expone
  datos de todas las empresas. Mitigación: guard en layout/páginas/route
  handlers, `forbidden()` verificado con 403, same-origin y tests de
  autorización.
- **Cambios de rol sin auditoría:** dar o quitar roles en `/panel/usuarios` no
  deja un registro append-only; solo cambia `usuarios.roles`. Mitigación:
  queda en `audit-trail-view`; mientras tanto solo el administrador puede
  cambiar roles y nadie puede quitarse su propio rol de administrador.
- **Sin alta de oficina ni técnicos:** ninguna feature del backlog invita o
  crea usuarios de oficina o técnicos desde la interfaz; hoy solo los crea el
  seed demo. Decidir antes de `office-aviso-creation`/`technician-inbox` si se
  añade una feature de invitación de equipo o se amplía `user-deactivation`.
- **Petición en vuelo tras perder un rol:** el permiso se comprueba al inicio
  de cada petición; una petición que empezó justo antes de retirar un rol
  puede completarse. El recuento de administradores activos dentro de la
  transacción impide, aun así, dejar a la empresa sin administrador.
- **Normalización de NIF en la migración:** si una base existente tuviera dos
  NIF que solo difieren en mayúsculas o espacios, la normalización chocaría con
  el índice único. Mitigación: revisar duplicados antes de desplegar; en local
  solo existía el NIF demo.
- **Cambios fiscales sin auditoría:** el administrador puede cambiar en
  `/panel/empresa` la razón social, el NIF (con el que el proveedor le factura
  la cuota), la serie y la tarifa sin registro append-only. Mitigación: queda
  en `audit-trail-view`; solo el rol Administrador puede hacerlo y la tarifa se
  congela al aprobar cada parte.
- **NIF duplicado revela su existencia:** el mensaje «Ese NIF ya está
  registrado en la plataforma» confirma que otra empresa lo usa. Es inevitable
  con el índice único global; el mensaje no dice qué empresa es.
- **Cambiar la serie tras emitir:** hoy nada impide cambiar la serie después de
  emitir facturas, porque todavía no se emiten. `invoice-signed-pdf` debe
  decidir si lo bloquea.
- **Tope de tarifa:** la tarifa horaria de empresa es > 0 y ≤ 9999,99 €/h, sin
  IVA. Si negocio necesita tarifa 0 u otro tope, hay que cambiar el CHECK y la
  validación.
- **Reglas de tarifa distintas en empresa y cliente:** la tarifa acordada del
  cliente (`clientes.tarifa_horaria`, decimal(12,2)) admite 0 y no tiene el
  tope de 9999,99 €, mientras que la de empresa exige > 0. Las dos features se
  aceptaron por separado; `invoice-draft`, que aplica el fallback cliente →
  empresa, debe decidir si unifica las reglas o si una tarifa de cliente 0
  significa trabajo sin cargo.
- **Clientes sin borrado ni desactivación:** un cliente, sede o contacto creado
  por error no se puede eliminar ni ocultar desde la interfaz; solo editar. Los
  duplicados tampoco se fusionan. Mitigación: NIF único por empresa; pendiente
  de una feature específica si hace falta antes de la demo.
- **Cambios de clientes sin auditoría:** altas y ediciones de clientes, sedes y
  contactos no dejan registro append-only; las ediciones son «última escritura
  gana». Mitigación: queda en `audit-trail-view`.
- **Listado de clientes sin paginación ni búsqueda:** `/panel/clientes` carga
  todos los clientes de la empresa. Aceptable para la demo; revisar con
  volúmenes reales.
- **Sede del contacto validada solo en la aplicación:** `contactos.sede_id` es
  un FK simple a `sedes(id)` (limitación de Prisma con relaciones opcionales);
  que la sede sea del mismo cliente lo garantiza `upsertContacto` y lo cubre
  `test:db`, no PostgreSQL. Un insert fuera del repositorio podría vincular un
  contacto a una sede de otro cliente **o incluso de otra empresa**: el FK
  compuesto ata el contacto a su cliente y empresa, pero `sede_id` no se
  comprueba contra `empresa_id` en la base (verificado por psql en la
  validación). Mitigación: escribir contactos solo vía
  `src/lib/clientes/clientes.ts`; mejora futura posible: trigger o FK compuesto
  `(sede_id, cliente_id)`.
- **NIF obligatorio para particulares:** el MVP exige NIF a todo cliente
  porque la factura completa lo requiere. Confirmar con la gestoría.

## Research Tasks

- Sesión con gestoría sobre emisión en nombre de terceros, firma y NO-VERIFACTU.
- Comparativa de proveedores de certificado y firma con sellado de tiempo.
- Lectura de la especificación VERIFACTU y de las obligaciones del modo NO-VERIFACTU.
- Prueba de precisión con 10-20 partes manuscritos reales y varios proveedores de IA.
- Revisión de DPAs y residencia de datos de los proveedores de IA y cloud.
- Reevaluación de RLS al llegar la autenticación o una tabla operativa con consultas cruzadas. Revisada en `client-records`: sigue diferida (sin consultas cruzadas; ver `CONSTRAINTS.md`); confirmar antes de producción o con `superadmin-tenant-view`.

## Resueltas

- **ORM:** Prisma 7.10.1 con migraciones SQL versionadas; decisión registrada en `ARCHITECTURE.md` y `docs/technical-discovery.md`.
- **Aislamiento inicial:** filtros de aplicación obligatorios con `tenantFilter`/`requireEmpresaId`/`assertTenantAccess`; RLS diferida con riesgo y trigger registrados. Ver `CONSTRAINTS.md`.
- **Desarrollo local:** PostgreSQL nativo 18.7; no se requiere Docker en este repositorio.
- **Autenticación:** sesión propia opaca en PostgreSQL, sin Auth.js; scrypt nativo versionado, cookie `HttpOnly`/`SameSite=Lax` de 12 h, revocación por logout y validación de usuario/empresa en cada petición. Ver `ARCHITECTURE.md` y `CONSTRAINTS.md`.
- **Seed local:** `tsx` 4.23.15 + `prisma/seed.ts`, idempotente con `upsert`, rechaza producción y no entra en `init.sh`.
- **Invitación de administrador:** caducidad de 7 días, token opaco hasheado
  con SHA-256, usuario `INACTIVO` sin contraseña y enlace local mostrado una
  sola vez desde una cookie flash.
- **Activación del invitado:** aceptación atómica y de un solo uso que activa
  al usuario y crea su sesión; contraseña nueva de 12 a 128 caracteres; una
  empresa suspendida bloquea la aceptación. Ver `ARCHITECTURE.md`.
- **Autorización de superadmin:** `forbidden()` con `experimental.authInterrupts`
  funciona de forma fiable en Next.js 16.4.6 y devuelve 403; no se usó la
  alternativa de render manual. Ver `ARCHITECTURE.md`.
- **Formato de serie de factura:** prefijo de 1 a 10 caracteres (`A-Z`, `0-9`
  y guion, sin empezar por guion), normalizado a mayúsculas y respaldado por
  el CHECK `empresas_serie_factura_formato`. El año y la numeración siguen
  abiertos (ver arriba).
