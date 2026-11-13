# Build Brief

## Problem

Las empresas de servicios que trabajan con técnicos de campo gestionan avisos de avería, partes de trabajo y facturación con herramientas dispersas o sin proceso definido. Pierden información de horas y materiales, no tienen una bolsa común de avisos pendientes y emiten facturas sin trazabilidad fiscal suficiente.

## Current Workaround / Existing System

Proyecto nuevo. No hay proceso previo consolidado ni sistema que sustituir. La referencia de trabajo es el ciclo aviso → parte → factura descrito por el promotor.

## Target Users

- **Proveedor SaaS (superadmin):** da de alta empresas y planes, lanza la facturación mensual de cuotas y consulta datos.
- **Administrador de empresa de servicios:** configura datos fiscales, tarifas, usuarios, clientes y sedes.
- **Oficina:** valida avisos, asigna técnicos, revisa y aprueba partes, emite facturas.
- **Técnico:** consulta avisos asignados o de la bolsa, registra partes y consume materiales.
- **Usuario de cliente:** crea avisos de sus sedes, consulta su estado y descarga sus facturas.

## Goals

- Centralizar avisos, partes y facturación en una única aplicación web multiempresa.
- Permitir que un parte se registre con formulario o a partir de una foto de un parte manuscrito, usando IA para extraer los datos.
- Dar a los técnicos una bolsa de pendientes y una asignación por oficina.
- Calcular horas reales, materiales e IVA y emitir una factura firmada por aviso, en nombre de cada empresa de servicios.
- Facturar la cuota mensual del plan de cada empresa desde el panel del proveedor.
- Mantener aislamiento de datos entre empresas y trazabilidad de las acciones fiscales.
- Dejar una capa de abstracción fiscal para activar VERIFACTU más adelante sin rehacer el dominio.

## Non-Goals

- Modo VERIFACTU activo (registro, hash y QR de la AEAT) en el MVP.
- Facturas rectificativas, control de cobros/pagos y conciliación bancaria.
- Pasarela de pago real para la cuota mensual.
- App móvil nativa, funcionamiento offline y sincronización diferida.
- Agenda o calendario de visitas, planificación de rutas y notificaciones push/email.
- Catálogo de máquinas/equipos, historial de averías y mantenimiento preventivo.
- Catálogo de materiales con stock e inventario.
- Portal de cliente con visibilidad de partes internos.
- Marca blanca, dominio propio y personalización visual por empresa.
- Multipaís, multimoeda, IGIC o regímenes fiscales especiales.

## MVP Slice

Un ciclo completo con datos de demo:

1. El superadmin crea una empresa de servicios, le asigna un plan fijo y invita a su administrador.
2. El administrador configura datos fiscales, tarifa horaria, usuarios de oficina y técnicos, y da de alta un cliente con sede y contacto.
3. La oficina o un usuario del cliente crea un aviso con prioridad. La oficina lo valida y lo deja en bolsa o lo asigna.
4. El técnico ve el aviso, lo toma, registra el parte manualmente o sube una foto de un parte manuscrito. La IA devuelve un JSON con los campos; por encima del umbral de confianza se guarda como parte pendiente de aprobación.
5. El técnico cierra el parte con horas reales y materiales. La oficina revisa, corrige con justificación si hace falta y aprueba.
6. Con todos los partes aprobados, la oficina emite la factura del aviso con mano de obra, materiales e IVA. La factura se firma con el certificado de la plataforma, se guarda como PDF inmutable y queda visible para el cliente.
7. El superadmin lanza la generación mensual de cuotas y emite una factura firmada por cada empresa activa.
8. Todas las acciones sensibles quedan en el registro de auditoría.

Fuera del corte: VERIFACTU activo, rectificativas, cobros, offline, agenda y marca blanca.

## Validation Plan

Demo interna guiada con datos precargados:

- Crear aviso desde oficina y desde portal de cliente.
- Asignar un aviso y tomar otro desde la bolsa con un técnico.
- Digitalizar un parte manuscrito de prueba y comparar el JSON extraído con el original.
- Corregir horas y materiales, aprobar y emitir la factura.
- Descargar el PDF firmado y verificar su huella.
- Lanzar la cuota mensual de dos empresas y comprobar importes e IVA.
- Intentar acceder a datos de otra empresa con cada rol y confirmar que no es posible, salvo el superadmin.

## Success Criteria

- El ciclo aviso → parte → factura se completa en la demo sin pasos manuales fuera del sistema.
- La extracción IA acierta al menos el 80 % de los campos en un conjunto de 10 fotos manuscritas de prueba y ningún parte llega a facturación sin aprobación de oficina.
- Los importes de mano de obra, materiales, IVA y totales cuadran al céntimo.
- El PDF de cada factura se genera con firma verificable y huella registrada.
- Ningún rol de empresa puede leer ni modificar datos de otra empresa.
- La generación mensual de cuotas produce una factura correcta por empresa activa.
- La demo se ejecuta en menos de 15 minutos sin errores bloqueantes.

## Notes

- "Central de avisos" es un nombre provisional.
- Ámbito inicial: España, EUR, IVA general, zona horaria Europe/Madrid.
- El cobro y el envío de emails se simulan o registran en log durante la demo.
- La prioridad del aviso tiene tres niveles: Normal, Alta y Urgente.
