# Domain Model

## Core Concepts

### Empresa de servicios (tenant)
- Datos fiscales: razón social, NIF, dirección, email de facturación.
- Plan contratado, estado activo/suspendido.
- Modo fiscal (`NO_VERIFACTU` en el MVP).
- Tarifa horaria por defecto.
- Serie y siguiente número de factura de trabajo.

### Usuario
- Email único global, contraseña, estado.
- Pertenece a una única empresa, salvo el superadmin del proveedor.
- Puede tener varios roles combinables: administrador, oficina, técnico, cliente.

### Cliente
- Pertenece a una empresa de servicios.
- Razón social, NIF y dirección de facturación.
- Tiene una o varias sedes y uno o varios contactos.
- Puede tener usuarios de portal, siempre dentro de la misma empresa proveedora.

### Sede
- Pertenece a un cliente.
- Dirección operativa y contacto principal.
- Es el lugar donde se ejecuta la intervención.

### Contacto
- Persona asociada a un cliente o a una sede.
- Nombre, teléfono y email.

### Aviso
- Empresa, cliente, sede y contacto.
- Descripción de la avería, prioridad (Normal/Alta/Urgente) y origen (Oficina/Cliente).
- Estado, técnico asignado y fechas relevantes.
- Puede tener varios partes.

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

- Una empresa de servicios tiene muchos usuarios, clientes, avisos y facturas.
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
