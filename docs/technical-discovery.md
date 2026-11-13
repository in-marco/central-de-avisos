# Technical Discovery

## Product Surface

- Aplicación web responsive única.
- Oficina y superadmin trabajan principalmente en escritorio.
- Técnicos usan el móvil a pie de máquina: bandeja, parte, foto y materiales con controles grandes.
- Clientes usan un portal web sencillo.
- Sin app nativa, sin offline y sin notificaciones push en el MVP.

## Candidate Stack

- **Framework:** Next.js con TypeScript (App Router).
- **Base de datos:** PostgreSQL gestionado.
- **ORM:** Prisma o Drizzle; decidir al iniciar implementación.
- **UI:** Tailwind CSS con componentes accesibles; seguir `DESIGN.md`.
- **Auth:** email y contraseña con invitaciones, sesiones seguras y recuperación de contraseña.
- **PDF:** generación server-side de facturas.
- **Almacenamiento:** object storage europeo para fotos y PDFs.
- **IA:** proveedor cloud con capa de abstracción; salida JSON validada por esquema.
- **Email:** simulado o registrado en log durante la demo.
- **Pagos:** fuera del MVP.

## Data and Storage

- PostgreSQL en región UE.
- Aislamiento multiempresa con `empresa_id` en todas las tablas operativas. Decidir entre Row Level Security y filtros de aplicación con pruebas de autorización.
- Fotos originales de partes y PDFs firmados en object storage privado, con URLs firmadas.
- Facturas emitidas inmutables: se guarda el PDF, su huella y los datos de firma.
- Registro de auditoría append-only para acciones sensibles.
- Copias de seguridad y política de retención pendientes de definir; referencia inicial: conservación fiscal de 5 años.

## Integrations

- **IA de digitalización:** subida de foto, extracción de campos, confianza por campo y validación de esquema. Proveedor intercambiable.
- **Firma de facturas:** certificado de la plataforma; el servicio de firma debe usar un almacén de secretos o HSM y no exponer la clave al frontend.
- **VERIFACTU:** no se integra en el MVP; se deja una interfaz de emisión fiscal para conectar un proveedor homologado o implementación propia más adelante.
- **Email:** simulado en demo; proveedor real más adelante.
- **Pagos:** fuera de alcance.

## Authentication and Authorization

- Invitaciones por email; email único global.
- Roles combinables: administrador, oficina, técnico, cliente; superadmin separado.
- Comprobación de tenant y permisos en servidor en cada petición.
- Sesiones revocables al desactivar un usuario o suspender una empresa.
- Acceso del superadmin registrado en auditoría.

## Deployment and Operations

- Cloud gestionado en la UE: hosting de la aplicación, PostgreSQL y object storage.
- Secretos en gestor de secretos; certificado de firma con acceso restringido.
- Entornos separados de demo y producción; la demo usa datos sembrados.
- El promotor actúa como superadmin el primer día.
- Sin requisitos de on-premise.

## Testing and Verification

- **Unitarias:** cálculo de horas, ajustes justificados, totales, IVA, numeración y máquina de estados.
- **Integración:** aprobación → factura, anulación, generación mensual, aislamiento entre empresas.
- **E2E:** ciclo completo con Playwright, incluida subida de foto de parte manuscrito y descarga de PDF.
- **Seguridad:** pruebas de autorización por rol y por tenant; ninguna ruta debe confiar en el cliente.
- **Fiscal:** verificar firma y huella de cada PDF generado.

## Observability

- Logs estructurados con identificador de empresa y usuario.
- Seguimiento de errores en producción.
- Auditoría de acciones fiscales y de accesos del proveedor.
- Métricas mínimas: avisos creados, partes aprobados, facturas emitidas, errores de extracción IA y tiempo de emisión.

## Constraints

- Cumplimiento fiscal español y RGPD; datos y documentos en la UE.
- La emisión en nombre de terceros y el uso de un certificado de plataforma requieren validación legal y fiscal antes de producción.
- La calidad de la escritura manuscrita condiciona la precisión de la IA; hace falta un conjunto de prueba real.
- El modo VERIFACTU activo queda fuera del MVP, pero la arquitectura no debe bloquearlo.
- El coste y la latencia de la IA deben medirse con el proveedor elegido.
- Un único equipo pequeño: priorizar un monolito Next.js y evitar infraestructura prematura.
