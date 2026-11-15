# Domain Model

## Core Concepts

### Empresa de servicios (tenant)
- Datos fiscales: razón social, NIF normalizado, dirección fiscal, email de
  facturación.
- Plan contratado, estado activo/suspendido.
- Modo fiscal (`NO_VERIFACTU` en el MVP).
- Tarifa horaria por defecto.
- Serie y siguiente número de factura de trabajo.
- Implementado (`company-billing-settings`): `serie_factura` es un prefijo de
  hasta 10 caracteres (`A-Z`, `0-9` y guion, sin empezar por guion),
  `tarifa_horaria` es `DECIMAL(10,2)` sin IVA (> 0 y ≤ 9999,99 en la
  validación) y `modo_fiscal` es un enum con un único valor `NO_VERIFACTU`.
  Serie y tarifa son nullables: NULL significa «sin configurar» y la
  facturación debe bloquear. El administrador las edita en `/panel/empresa`.
  El siguiente número, el año y la numeración llegan con `invoice-signed-pdf`.

### Usuario
- Email único global, contraseña, estado.
- Pertenece a una única empresa, salvo el superadmin del proveedor.
- Puede tener varios roles combinables: administrador, oficina, técnico, cliente.
- Implementado: `roles` es un atributo del usuario (lista del enum
  `rol_usuario`: `ADMINISTRADOR`, `OFICINA`, `TECNICO`). Los permisos se
  derivan en código y se suman. El superadmin no tiene roles. El rol `CLIENTE`
  se añadirá con el portal (`client-portal-invitation`), cuando exista
  `cliente_id`.
- La empresa conserva siempre al menos un administrador `ACTIVO`.

### Invitación
- Pertenece a una empresa y a un usuario invitado.
- Tipo `ADMINISTRADOR_EMPRESA` en este slice.
- Guarda solo el hash del token de invitación, la fecha de creación, la
  caducidad (7 días) y la fecha de aceptación opcional.
- Estado derivado: `Pendiente`, `Caducada` o `Aceptada`.
- La aceptación y el alta de contraseña pertenecen a la activación del
  administrador; la invitación no concede permisos por sí misma.

### Cliente
- Pertenece a una empresa de servicios.
- Razón social, NIF y dirección de facturación.
- Tiene una o varias sedes y uno o varios contactos.
- Puede tener usuarios de portal, siempre dentro de la misma empresa proveedora.
- Implementado (`client-records`): tabla `clientes` con `razon_social`,
  `nif` (obligatorio, normalizado, único por empresa: el mismo NIF puede
  existir en otra empresa), `direccion_facturacion` y `tarifa_horaria`
  opcional (la tarifa acordada que sustituye a la de la empresa; solo se
  guarda, aún no se calcula nada con ella). Es el **sujeto fiscal**: la
  factura de trabajo futura llevará `cliente_id`, no `sede_id`. Se crea siempre
  con su primera sede y su primer contacto. No se borra ni se desactiva.

### Sede
- Pertenece a un cliente.
- Dirección operativa.
- Es el lugar donde se ejecuta la intervención.
- Implementado: tabla `sedes` con `nombre` y `direccion`, sin datos fiscales.
  No hay «contacto principal» de sede en el MVP: el aviso elegirá el contacto.

### Contacto
- Persona asociada a un cliente o a una sede.
- Nombre, teléfono y email.
- Implementado: tabla `contactos` con `nombre`, `telefono` y `email`
  opcionales pero al menos uno de los dos, y `sede_id` opcional (nulo = todo
  el cliente). La sede, si existe, es del mismo cliente.

### Aviso
- Empresa, cliente, sede y contacto.
- Descripción de la avería, prioridad (Normal/Alta/Urgente) y origen (Oficina/Cliente).
- Estado, técnico asignado y fechas relevantes.
- Puede tener varios partes.
- Implementado (`office-aviso-creation`): tabla `avisos` con `empresa_id`,
  `cliente_id`, `sede_id`, `contacto_id` (los cuatro obligatorios),
  `descripcion` (1-2000 caracteres en la aplicación, no vacía en BD),
  `prioridad` (`NORMAL`/`ALTA`/`URGENTE`, Normal por defecto), `origen`
  (`OFICINA`/`CLIENTE`), `estado` (enum completo `NUEVO`, `PENDIENTE`,
  `ASIGNADO`, `EN_CURSO`, `RESUELTO`, `FACTURADO`, `CANCELADO`; nace `NUEVO`),
  `creado_por_id` (usuario que lo registró) y fechas. FK compuestos impiden
  mezclar empresa, cliente, sede y contacto; el contacto es de todo el cliente
  o de la sede del aviso. Hoy solo existe el alta desde oficina (`OFICINA`,
  `NUEVO`); las transiciones, el técnico asignado y el alta desde el portal
  llegan con sus features. No hay número correlativo de aviso: se identifica
  por cliente, sede y fecha.

### Parte
- Aviso al que pertenece (siempre uno en el MVP).
- Técnico responsable (uno solo).
- Fecha y hora de inicio y fin introducidas manualmente.
- Horas reales calculadas y posibilidad de ajuste justificado por oficina.
- Descripción y comentarios.
- Materiales consumidos.
- Foto original del parte manuscrito y resultado de la extracción IA con confianza por campo.
- Estado y datos de aprobación.

### Material de parte
- Descripción en texto libre.
- Cantidad.
- Precio unitario.

### Factura de trabajo
- Empresa emisora, cliente destinatario y aviso facturado.
- Líneas de mano de obra (horas × tarifa) y materiales.
- Base imponible, IVA y total.
- Serie, número, fecha de emisión y estado.
- Huella, firma con certificado de plataforma y PDF inmutable.

### Cuota mensual
- Empresa facturada, plan y periodo.
- Importe fijo, IVA, total.
- Serie y número propios del proveedor.
- Huella, firma y PDF.

### Plan
- Nombre y importe fijo mensual.

### Registro de auditoría
- Actor, empresa, acción, entidad afectada, datos anteriores y posteriores, fecha.

## Relationships

- Una empresa de servicios tiene muchos usuarios, clientes, avisos, facturas
  e invitaciones.
- Una invitación apunta a un usuario; al borrar el usuario se elimina en
  cascada, pero la empresa no se puede borrar mientras conserve invitaciones.
- Un cliente pertenece a una empresa y tiene muchas sedes y contactos.
- Una sede pertenece a un cliente.
- Un aviso pertenece a un cliente y a una sede.
- Un aviso tiene uno o varios partes.
- Un parte tiene un técnico y cero o muchos materiales.
- Un aviso genera una factura de trabajo en el MVP.
- Una empresa recibe una cuota mensual por periodo.
- Un usuario de cliente solo ve avisos y facturas de su cliente dentro de su empresa.

## States and Lifecycles

### Aviso

```txt
Nuevo ──validar──> Pendiente ──asignar──> Asignado ──iniciar parte──> En curso
  │                   │                      │                          │
  │                   └──tomar de bolsa──────┘                          │
  └──cancelar──> Cancelado <──cancelar──────────────────────────────────┘
                                             │
                                  todos los partes aprobados
                                             ▼
                                         Resuelto ──facturar──> Facturado
```

- **Nuevo:** creado y pendiente de validación de oficina. Si lo crea la oficina, puede validarse en el mismo acto.
- **Pendiente:** validado y disponible en la bolsa.
- **Asignado:** tiene técnico responsable.
- **En curso:** al menos un parte iniciado.
- **Resuelto:** todos los partes están aprobados y el aviso puede facturarse.
- **Facturado:** tiene factura emitida.
- **Cancelado:** no se ejecutará; requiere motivo.

### Parte

```txt
Borrador ──iniciar──> En curso ──cerrar técnico──> Pendiente de aprobación
   ▲                                                   │
   │                                                   ├──aprobar──> Aprobado ──facturar──> Facturado
   └────────────────devolver───────────────────────────┘
                                                       └──anular──> Anulado
```

- **Borrador:** creado manualmente o desde IA; editable.
- **En curso:** tiene hora de inicio.
- **Pendiente de aprobación:** cerrado por el técnico.
- **Aprobado:** revisado por oficina; único estado facturable.
- **Facturado:** incluido en una factura emitida.
- **Anulado:** descartado con motivo.

### Factura

```txt
Borrador ──firmar/emitir──> Emitida ──anular──> Anulada
```

- **Borrador:** calculada, aún corregible.
- **Emitida:** firmada e inmutable; consume número de serie.
- **Anulada:** conserva el registro y el número; no se borra.

### Invitación

```txt
Pendiente ──aceptar──> Aceptada
    │
    └──caducar──> Caducada
```

- **Pendiente:** no aceptada y dentro del plazo de 7 días.
- **Caducada:** no aceptada y con `expira_en <= ahora`.
- **Aceptada:** tiene `aceptada_en`. La transición ocurre en la misma
  operación que guarda la contraseña, activa al usuario y crea su sesión; no
  existe una invitación aceptada con el usuario aún `INACTIVO`.
- Una invitación de una empresa `SUSPENDIDA` no se puede aceptar y sigue
  pendiente.

## Important Scenarios

1. **Aviso desde portal:** el cliente crea el aviso con sede y contacto; la oficina lo valida y lo pone en bolsa.
2. **Toma de bolsa:** un técnico ve avisos pendientes de su empresa y toma uno; pasa a asignado a él.
3. **Varias visitas:** un aviso acumula varios partes; la factura agrupa todos los aprobados.
4. **Parte por foto:** el técnico sube una foto; la IA extrae un JSON; si supera el umbral se guarda como borrador o pendiente de aprobación; si no, se revisa manualmente.
5. **Corrección de oficina:** la oficina ajusta horas con justificación y queda en auditoría.
6. **Devolución de parte:** la oficina devuelve un parte al técnico; vuelve a edición.
7. **Facturación por aviso:** solo se factura cuando todos los partes están aprobados; se congela la tarifa aplicada.
8. **Anulación:** una factura emitida se anula dejando rastro y sin reutilizar su número.
9. **Cuota mensual:** el superadmin genera en lote las facturas de las empresas activas del periodo.
10. **Aislamiento:** cualquier acceso cruza la comprobación de empresa; el superadmin es la única excepción.

## Edge Cases

- Aviso cancelado con partes en borrador o en curso: los partes deben anularse o cerrarse antes.
- Cambio de tarifa después de aprobar un parte: la factura usa la tarifa congelada en la aprobación.
- Cliente sin usuario de portal: la oficina crea y gestiona sus avisos.
- Aviso con partes aprobados y uno devuelto: no se puede facturar hasta resolverlo.
- Foto ilegible o extracción de baja confianza: se cae al formulario manual.
- Foto duplicada del mismo parte: se advierte antes de crear un segundo registro.
- Técnico desactivado: sus avisos abiertos se reasignan; sus partes históricos se conservan.
- Cambio de datos fiscales del cliente después de emitir: no altera facturas pasadas; requiere rectificativa fuera del MVP.
- Cambio de hora (DST) en Europe/Madrid: horas calculadas sobre instantes, no sobre texto.
- Anulación de factura: el número no se reutiliza y el registro firmado se conserva.
- Invitación no recuperable: si caduca la cookie flash, el enlace local ya no
  se puede mostrar; reenviar o regenerar la invitación queda fuera de este
  slice.
