# Context

Glosario y lenguaje común del proyecto. No contiene planes, tareas ni decisiones de implementación.

## Glossary

### Plataforma / Proveedor SaaS
Empresa que opera el software, da de alta a las empresas de servicios, cobra la cuota mensual y emite las facturas de esa cuota.

### Empresa de servicios
Cliente del proveedor SaaS. Tiene técnicos propios, clientes finales, tarifas y datos fiscales. Es la unidad de aislamiento de datos (tenant) y paga un plan fijo mensual.

### Oficina
Usuario de una empresa de servicios que recibe y valida avisos, asigna técnicos, revisa y aprueba partes, gestiona clientes y emite facturas.

### Técnico
Usuario de una empresa de servicios que realiza las intervenciones, registra partes y sus horas.

### Cliente
Empresa o particular que contrata los servicios de una empresa de servicios. Puede tener varias sedes y varios usuarios de portal. Es quien recibe la factura del trabajo.

### Sede
Ubicación física de un cliente donde se realiza la intervención. La factura se emite al cliente, no a la sede.

### Contacto
Persona de la sede o del cliente con la que se coordina la intervención.

### Aviso
Solicitud de intervención. Lo crea la oficina o un usuario del cliente e incluye cliente, sede, contacto, descripción de la avería, prioridad y origen. Es la unidad que la oficina asigna o deja en la bolsa de pendientes.

### Avería
Problema reportado que describe el aviso. Es un atributo del aviso, no un objeto independiente.

### Parte
Registro del trabajo realizado en una visita. Contiene técnico, fecha y hora de inicio y fin, horas trabajadas, descripción, comentarios, materiales y evidencia fotográfica. Varios partes pueden pertenecer al mismo aviso.

### Material
Concepto consumido en un parte. En el MVP se describe en texto libre con cantidad e importe; no hay catálogo ni stock.

### Parte aprobado
Parte cerrado por el técnico y revisado por la oficina. Solo los partes aprobados son facturables.

### Bolsa de pendientes
Conjunto de avisos validados y sin asignar que cualquier técnico de la empresa puede tomar.

### Tarifa
Precio por hora de mano de obra. Hay una tarifa por defecto de la empresa y una tarifa acordada por cliente que la sustituye.

### Factura de trabajo
Factura que la plataforma emite en nombre de una empresa de servicios a su cliente, agrupando los partes aprobados de un aviso. Incluye mano de obra, materiales e IVA.

### Cuota mensual
Factura que el proveedor SaaS emite a cada empresa de servicios por su plan fijo mensual.

### Plan
Conjunto de condiciones comerciales de una empresa de servicios con el proveedor SaaS. En el MVP tiene un importe fijo mensual.

### Superadmin
Usuario del proveedor SaaS. Da de alta empresas y planes, lanza la facturación mensual y, según la decisión actual, puede consultar todos los datos operativos.

### Modo VERIFACTU / NO-VERIFACTU
Ajuste fiscal por empresa. En el MVP todas las facturas se generan en modo NO-VERIFACTU con registro firmado. El modo VERIFACTU activo queda fuera del MVP.

### Registro de auditoría
Traza de acciones sensibles: creación y corrección de partes, aprobaciones, emisión y anulación de facturas y accesos del proveedor.

## Rejected / Ambiguous Terms

### Avería
Usar `Aviso` para la solicitud y `Avería` solo para la descripción del problema. Evita confundir el objeto de trabajo con su contenido.

### Ticket
Usar `Aviso`. El dominio habla de avisos, no de tickets.

### Trabajo
Usar `Parte` cuando se habla del registro con horas y materiales. "Trabajo" es demasiado genérico.

### Ubicación / dirección
Usar `Sede` para la ubicación operativa del cliente y `Dirección` solo como dato postal.

### Factura
Distinguir siempre `Factura de trabajo` (empresa de servicios a su cliente) de `Cuota mensual` (proveedor SaaS a la empresa de servicios).
