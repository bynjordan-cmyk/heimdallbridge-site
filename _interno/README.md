# Carpeta interna — léeme antes que nada

Aquí está el material comercial: guiones, precios, plantillas de contrato y el tracker del pipeline.
No es material de cara al cliente.

---

## ⚠️ Aviso de exposición — decídelo hoy

**Este repositorio de GitHub es público.** Cualquiera que llegue a
`github.com/bynjordan-cmyk/heimdallbridge-site` puede leer esta carpeta completa: los guiones de
prospección, el manejo de objeciones y la matemática de tus precios.

Ya bloqueé el acceso desde el sitio web — `vercel.json` redirige `/_interno/*` a la portada, así que nadie
va a tropezar con esto navegando heimdallbridge.com. Pero **eso no protege el repositorio**, y sería
deshonesto dejarte creer que sí.

Tienes dos caminos:

**A. Hacer el repositorio privado** (recomendado, toma un minuto):
GitHub → Settings → General → abajo del todo, *Change repository visibility* → Private.
Vercel sigue desplegando igual: la conexión ya está autorizada y no se rompe nada.
Hecho eso, si quieres usar el pipeline desde el navegador, borra las dos líneas de `redirects` en
`vercel.json`.

**B. Dejarlo público y borrar esta carpeta** del repositorio, guardando el material en Drive o local.

Lo que no recomiendo es dejarlo como está y olvidarlo.

---

## Cómo usar el pipeline

`pipeline.html` guarda todo en el almacenamiento local de tu navegador — no hay servidor, no hay cuenta.
Como `/_interno` está bloqueado en el sitio, ábrelo de una de estas formas:

- **Descarga el archivo** y ábrelo con doble clic. Funciona sin internet.
- O haz el repositorio privado y quita el bloqueo de `vercel.json` (ver arriba), y queda en
  `heimdallbridge.com/_interno/pipeline.html`.

Dos cosas importantes:

- Los datos viven en **ese navegador y ese equipo**. Si lo abres en el teléfono, empieza vacío.
- **Respalda cada viernes** con el botón «Respaldar». Si limpias los datos de navegación, se borra todo.

---

## Los documentos, en el orden en que se usan

| Archivo | Cuándo |
|---|---|
| `00-PLAN-30-DIAS.md` | Hoy. La aritmética de los US$10.000 y qué hacer mañana hora por hora. |
| `01-PROSPECCION.md` | Todos los días, en la mañana. Guiones para copiar y enviar. |
| `02-LLAMADA-DIAGNOSTICO.md` | Antes de cada diagnóstico. El documento que más veces vas a releer. |
| `03-PROPUESTA.md` | Después de cada diagnóstico, el mismo día. |
| `04-CONTRATO-SOW.md` | Al cerrar. **Que un abogado lo revise antes del primer cliente.** |
| `05-OBJECIONES.md` | Cuando se traba una venta. |
| `06-ENTREGA.md` | Los 14 días de ejecución, y el cierre de Control Continuo. |
| `pipeline.html` | Todos los días, al terminar. |

---

## Lo que hay del lado público

| Ruta | Qué es |
|---|---|
| `/auditoria/` | Página de venta de Radar 14. El enlace que mandas a un prospecto. |
| `/auditoria/calculadora.html` | Calculadora de fuga. Tu mejor herramienta de segundo toque. |
| `/motor/` | El motor de detección. Demostración en vivo y herramienta de entrega. |

El motor lleva `noindex`: no va a aparecer en Google, pero quien tenga el enlace entra. Es a propósito —
mandarlo a un prospecto es la jugada más persuasiva que tienes.
