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
- Formato de serie y numeración por empresa y año.
- Retención y borrado de fotos de partes y PDFs.
- Contrato de tratamiento de datos y región del proveedor de IA.
- Política de invitaciones: caducidad y reenvío.
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

## Research Tasks

- Sesión con gestoría sobre emisión en nombre de terceros, firma y NO-VERIFACTU.
- Comparativa de proveedores de certificado y firma con sellado de tiempo.
- Lectura de la especificación VERIFACTU y de las obligaciones del modo NO-VERIFACTU.
- Prueba de precisión con 10-20 partes manuscritos reales y varios proveedores de IA.
- Revisión de DPAs y residencia de datos de los proveedores de IA y cloud.
- Reevaluación de RLS al llegar la autenticación o una tabla operativa con consultas cruzadas.

## Resueltas

- **ORM:** Prisma 7.10.1 con migraciones SQL versionadas; decisión registrada en `ARCHITECTURE.md` y `docs/technical-discovery.md`.
- **Aislamiento inicial:** filtros de aplicación obligatorios con `tenantFilter`/`requireEmpresaId`/`assertTenantAccess`; RLS diferida con riesgo y trigger registrados. Ver `CONSTRAINTS.md`.
- **Desarrollo local:** PostgreSQL nativo 18.7; no se requiere Docker en este repositorio.
