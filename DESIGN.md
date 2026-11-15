---
name: Central de avisos
description: Herramienta operativa premium para empresas de servicios con técnicos de campo; navy profundo, papel cálido y acento latón.
designAssets:
  sourceOfTruth: []
  generatedConcepts: []
colors:
  primary: "#12304D"
  secondary: "#2E5A7D"
  accent: "#C08A3E"
  background: "#F6F4EF"
  surface: "#FFFFFF"
  text: "#121820"
  muted: "#59636F"
  border: "#E3DED4"
  success: "#1E7A5A"
  warning: "#B4771B"
  danger: "#B03A3A"
typography:
  display:
    fontFamily: "Instrument Sans, Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
  h1:
    fontFamily: "Instrument Sans, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
  h2:
    fontFamily: "Instrument Sans, Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "44px"
  button-primary-mobile:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  focus-ring:
    color: "{colors.accent}"
    width: "2px"
---

# Design Direction

## Overview

La interfaz debe sentirse como una herramienta profesional y cara, no como una app de consumo. La sensación premium se consigue con tipografía cuidada, jerarquía clara, espacios generosos y un acento latón usado con moderación. La prioridad operativa manda: el técnico debe completar un parte en el móvil con guantes, prisa y poca luz.

## Existing Design Assets

Ninguno. No hay logo, colores, tipografías ni capturas de referencia. La dirección de este documento es la fuente de verdad inicial.

## Generated Concept Images

Ninguna. En este entorno no hay herramienta de generación de imágenes disponible; la dirección visual se define en texto y tokens.

## Product Feel

- **Premium y comercial:** navy profundo, papel cálido, detalles en latón, tipografía editorial en titulares.
- **Operativo:** densidad controlada, estados visibles, acciones principales grandes y siempre a la vista.
- **De confianza:** cifras y facturas tratadas como documentos, con numeración monoespaciada y jerarquía de documento legal.
- Evitar el aspecto de plantilla genérica: nada de gradientes decorativos, ilustraciones infantiles ni tarjetas flotantes por todas partes.

## Colors

- **Primary `#12304D`:** navegación, botones principales y cabeceras. Transmite solidez.
- **Secondary `#2E5A7D`:** enlaces, gráficos y estados informativos.
- **Accent `#C08A3E`:** foco, subrayados, detalles de marca y elementos puntuales. No usar como color de texto pequeño.
- **Background `#F6F4EF`:** lienzo cálido que separa del blanco puro y aporta sensación editorial.
- **Surface `#FFFFFF`:** tarjetas, formularios y documentos.
- **Text `#121820`:** texto principal; **Muted `#59636F`:** metadatos.
- **Success / Warning / Danger:** estados de aviso, parte y factura. Siempre acompañados de icono y etiqueta, nunca solo color.

## Typography

- **Instrument Sans** para titulares y navegación: geométrica, moderna y con carácter.
- **Inter** para cuerpo, formularios y tablas: legible en pantalla y en móvil.
- **JetBrains Mono** para números de factura, horas, importes y referencias: refuerza la idea de documento fiable.
- Escala: 32/28/22/18/16/14/12. En móvil, los titulares bajan un paso.
- No usar más de dos pesos por pantalla. Los importes se alinean a la derecha y con cifras tabulares.

## Layout

- Escritorio: rejilla de 12 columnas, ancho máximo 1280 px, márgenes de 32 px.
- Móvil: una columna, márgenes de 16 px, acciones principales fijas al pie.
- Cabecera de aplicación sobria: marca a la izquierda, empresa y usuario a la derecha.
- Listas operativas con cabecera sticky y filtros compactos.
- Documentos de factura con ancho de lectura fijo y aspecto de papel.
- Espaciado en múltiplos de 4; secciones separadas por 24-32 px.

## Shapes

- Radios pequeños y contenidos: 8 px en controles y tarjetas, 12 px en contenedores grandes.
- Bordes de 1 px en `border`; sombras muy sutiles solo en elementos elevados.
- Chips de estado con radio completo, icono y texto.
- Sin formas decorativas ni blobs.

## Components

- **Botón primario:** navy, alto 48 px en móvil y 44 px en escritorio, texto blanco.
- **Botón secundario:** fondo transparente, borde `border`, texto navy.
- **Acción destructiva:** solo texto danger o botón con confirmación.
- **Inputs:** etiqueta siempre visible, ayuda breve, error inline; altura 44-48 px.
- **Tarjeta de aviso:** prioridad, cliente, sede, antigüedad, descripción y acción principal. En móvil, toda la tarjeta es pulsable.
- **Chip de prioridad:** Normal (neutro), Alta (warning), Urgente (danger).
- **Franja de demo:** solo con `DEMO_MODE=true`; primer elemento visible de cada página, a todo el ancho, fondo `warning` con texto `text` (#121820, 4.75:1; el blanco sobre `warning` da 3.75:1 y no cumple AA a 14 px), 14 px semibold centrado, padding 8 px, `role="note"`, sin cerrar ni sticky. Texto fijo: «Entorno de demostración · datos ficticios».
- **Resumen de horas:** inicio, fin, duración y ajuste; tipografía monoespaciada.
- **Tabla de factura:** líneas, base, IVA y total; total destacado.
- **Sello de firma:** indicador discreto de factura firmada con huella abreviada.

## Core Screens

1. **Bandeja del técnico (pantalla que define la dirección):** cabecera compacta, conmutador "Mis avisos / Bolsa", tarjetas de aviso ordenadas por prioridad y antigüedad, botón grande "Tomar aviso" o "Abrir parte". Debe funcionar a plena luz y con una mano.
2. **Editor de parte:** flujo por pasos (datos, foto/IA, horas, materiales, cierre), resumen persistente de horas e importe estimado, guardado claro y cierre con confirmación.
3. **Panel de oficina:** tabla de avisos con filtros por estado, cliente y técnico; panel lateral de detalle; aprobación de partes y emisión de factura.
4. **Factura:** vista de documento con datos fiscales, líneas, totales, sello de firma y descarga de PDF.
5. **Portal de cliente:** lista sencilla de avisos con estado, alta de aviso y facturas descargables.
6. **Panel de superadmin:** empresas, planes, estado y generación mensual de cuotas en lote.

## Responsive Baseline

- Mobile-first para técnicos y clientes; desktop-first para oficina y superadmin.
- Breakpoints: 640, 1024 y 1280 px.
- Objetivos táctiles mínimos de 48 × 48 px en móvil.
- Formularios a una columna en móvil y dos en escritorio.
- Tablas de oficina con scroll horizontal controlado; nunca comprimir texto hasta hacerlo ilegible.
- La bandeja del técnico debe ser usable con guantes: sin gestos ocultos ni menús anidados.

## Accessibility Baseline

- WCAG 2.1 AA: contraste mínimo 4.5:1 en texto y 3:1 en componentes.
- Foco visible con anillo latón de 2 px.
- Etiquetas persistentes, errores junto al campo y resumen de errores al enviar.
- Estados nunca solo por color: icono + texto.
- Soporte de zoom al 200 % sin pérdida de función.
- Respetar `prefers-reduced-motion`; animaciones cortas y funcionales.
- Texto legible al sol: evitar grises claros sobre blanco para información crítica.

## Do's and Don'ts

**Do**

- Usar el navy como base y el latón como detalle escaso.
- Tratar las facturas como documentos: jerarquía, cifras tabulares y sello de firma.
- Mantener una acción principal evidente por pantalla.
- Diseñar primero la bandeja del técnico en 390 px de ancho.
- Mostrar el estado del parte y del aviso en todo momento.

**Don't**

- No usar gradientes llamativos, sombras difusas ni glassmorphism.
- No esconder acciones críticas en menús de tres puntos.
- No usar texto menor de 14 px en campo.
- No inventar logo ni símbolos de marca definitivos; usar un wordmark tipográfico provisional.
- No mostrar datos de otra empresa ni de otro cliente, ni siquiera en estados de error.

## Open Design Questions

- Nombre y wordmark definitivos del producto.
- ~~Si el portal de cliente comparte el mismo shell visual o usa una versión más simple.~~
  Resuelta en `client-portal-invitation`: versión más simple. Mismos tokens,
  cabecera con wordmark, «Portal de cliente», nombre, email · razón social y
  «Cerrar sesión»; sin navegación de oficina; contenido de una columna
  (`max-w-3xl`), mobile-first a 390 px; sedes como tarjetas enlazables de 48 px
  como mínimo; 403 propio con texto genérico.
- Branding del PDF de factura mientras no haya marca blanca.
- Necesidad de modo oscuro para técnicos que trabajan de noche.
- Nivel de densidad deseado en el panel de oficina.
