# Entrega — los 14 días, paso a paso

> **Interno.** Vender es la mitad. Esto es la otra mitad, y es donde nacen los referidos y el Control
> Continuo.

---

## Día 0 — Firma

- [ ] Acuerdo de confidencialidad firmado por ambas partes.
- [ ] Contrato firmado.
- [ ] Anticipo facturado **el mismo día**.
- [ ] Instrucciones de extracción enviadas (plantilla abajo).
- [ ] Sesión de entrega agendada en el calendario del cliente para el día 14. Agéndala ahora, no después:
      conseguir 90 minutos de un gerente financiero con dos días de aviso es imposible.

### Correo de instrucciones de extracción

```
Asunto: Radar 14 — qué necesito de [Empresa] para arrancar

[Nombre], quedamos.

Lo único que necesito para empezar es un archivo. Estas son las instrucciones
para que se las pases directo a contabilidad o a sistemas:

QUÉ EXPORTAR
El mayor auxiliar de cuentas por pagar de los últimos 12 meses
(de [mes año] a [mes año]), a nivel de documento — no de saldo por proveedor.

COLUMNAS MÍNIMAS
  · Fecha del documento
  · Nombre del proveedor
  · Número de factura o documento
  · Monto

COLUMNAS QUE SUMAN MUCHO SI ESTÁN
  · RNC o código del proveedor
  · Cuenta bancaria de pago
  · Descripción o concepto
  · Categoría o centro de costo
  · Artículo, cantidad y precio unitario (si el sistema lo tiene)

FORMATO
Excel o CSV. Si es Excel: Archivo → Guardar como → CSV UTF-8.
Una fila por transacción y una sola fila de encabezados arriba.
Sin subtotales ni filas en blanco intercaladas.

Si el sistema es [su ERP], la ruta suele ser [ruta]. Si tu contador tiene
dudas, que me escriba o me llame directo — resolvemos en diez minutos.

CÓMO MANDÁRMELO
[enlace a carpeta compartida] o adjunto al correo si pesa poco.

El plazo de 14 días arranca cuando reciba el archivo completo.

Jordan
```

---

## Día 1 — Recepción y control de calidad

Antes de prometer nada, verifica que el archivo sirve. Cárgalo en `/motor/` y mira:

- [ ] ¿Cuántas transacciones son? **Menos de 300 → avisa por escrito hoy** que la garantía no aplica
      (cláusula 7.5) y ofrece devolver el anticipo o ampliar el periodo.
- [ ] ¿Cubre 10 meses o más?
- [ ] ¿El campo de monto se interpretó bien? Compara el total contra lo que el cliente dijo que compra al
      año. Si difiere más de 20%, pregunta antes de seguir — puede faltar una parte del gasto.
- [ ] ¿Viene el número de documento? Sin él pierdes las dos pruebas de duplicados, que son las que más
      dinero encuentran. **Pídelo otra vez, insiste.** Vale la pena perder dos días esperándolo.
- [ ] ¿Hay negativos? Son notas de crédito. Normal.
- [ ] ¿Las fechas se leyeron bien? Revisa el periodo que muestra el informe.

**Manda acuse el mismo día:** «Archivo recibido, [N] transacciones por [monto], periodo [x] a [y]. Todo
en orden, entrego el [fecha].» Esa confirmación tranquiliza y fija la fecha por escrito.

---

## Días 2 a 4 — Primera pasada

- [ ] Correr el motor con las 11 pruebas.
- [ ] Exportar los casos a CSV.
- [ ] Leer el informe completo **como si fueras el cliente**. ¿Qué preguntaría? ¿Qué no se entiende?
- [ ] Marcar los 20 casos de mayor monto para revisión manual.

---

## Días 5 a 9 — Revisión humana

Esta es la parte que justifica el honorario. El motor señala; tú decides.

**Duplicados exactos.** Uno por uno. Descarta abonos parciales con el mismo folio. Los que sobrevivan son
tu caja recuperable y tienen que estar impecables — es lo primero que el cliente va a verificar.

**Duplicados probables.** Filtra los alquileres, pólizas, igualas y suscripciones: montos idénticos
mensuales que son legítimos. Es donde más falsos positivos hay. Ser duro aquí te protege: un informe con
cuarenta duplicados falsos vale menos que uno con seis verdaderos.

**Proveedores duplicados.** Verifica que las variantes sean de verdad la misma empresa. Cuidado con
matrices y filiales con nombres parecidos pero RNC distinto.

**Cuentas bancarias compartidas.** Este es el hallazgo delicado. Antes de escribirlo, busca la explicación
inocente: grupo empresarial, factoring, representante de varias marcas. Si no la encuentras, **no lo pongas
en el informe general** — va aparte y se conversa a solas con quien contrató.

**Fraccionamiento.** Verifica el umbral real de aprobación con el cliente. Si te dijo un número distinto al
que estimó el motor, vuelve a correr con el correcto.

**Precios dispares.** Descarta las diferencias que se explican por volumen, urgencia o especificación.

- [ ] Preparar las 3 o 4 consultas para el equipo de finanzas. No más: cada pregunta gasta crédito.

---

## Días 10 a 12 — Armar el informe

- [ ] Exportar el informe del motor a PDF (botón «Descargar informe en PDF»).
- [ ] Escribir el **resumen ejecutivo a mano**. El que genera el motor es la base, no el final. Tiene que
      hablar de su empresa, con sus palabras, y mencionar lo que él te dijo en el diagnóstico.
- [ ] Armar el **plan de 90 días**: frente, responsable, plazo, monto esperado.
- [ ] Definir los **tres controles** a instalar. Concretos y ejecutables, no «mejorar el proceso»:
      1. Bloqueo de captura por proveedor + documento normalizado (sin guiones ni ceros a la izquierda).
      2. Conciliación mensual obligatoria de estados de cuenta de los 20 proveedores mayores.
      3. Depuración del maestro de proveedores y regla de alta con validación de RNC y cuenta bancaria.
- [ ] Limpiar el anexo de Excel: que se entienda sin explicación.

---

## Día 14 — La sesión

**90 minutos. Estructura:**

| Minutos | Qué |
|---|---|
| 0 – 10 | Qué se analizó y qué no. Alcance y límites, dicho de frente. |
| 10 – 25 | El número. Recuperación estimada y de dónde sale. |
| 25 – 55 | Los hallazgos de prioridad alta, con casos concretos en pantalla. |
| 55 – 70 | El plan de 90 días. Quién hace qué. |
| 70 – 85 | Los tres controles. |
| 85 – 90 | Siguiente paso. |

**Reglas:**

- Entrega el informe **impreso** además de digital. En una sala de reunión, el papel manda.
- Empieza por el alcance y los límites, no por el número. Genera credibilidad antes de impresionar.
- Cuando muestres un caso, muestra el caso real en pantalla — proveedor, factura, fecha, monto. No un
  resumen. El impacto está en el detalle.
- Si alguien discute un hallazgo, **dale la razón rápido** si la tiene: «puede ser, márcalo para verificar».
  Defender un falso positivo te cuesta la credibilidad de los treinta verdaderos.

---

## El cierre de Control Continuo — en la misma sesión

Este es el momento de mayor valor de todo el proyecto. No lo dejes para un correo posterior.

Al llegar al minuto 85, con el informe sobre la mesa y el número en el aire:

> «Última cosa y los dejo.
>
> Todo esto que encontramos se acumuló en doce meses. Si no cambia nada, en doce meses vamos a estar
> exactamente igual — con un informe distinto y los mismos números.
>
> Lo que hago con varios clientes es correr esto todos los meses sobre el gasto nuevo. Se detecta el
> duplicado a los treinta días, cuando el proveedor todavía lo reconoce sin discutir, y no a los catorce
> meses. Además doy seguimiento a lo que quedó abierto de este informe y controlo los vencimientos.
>
> Son US$1.200 al mes, mínimo tres meses. Y con lo que quedó abierto aquí, los primeros tres meses se
> pagan solos.
>
> ¿Lo vemos?»

Y te callas.

---

## Los referidos — pídelos ahí mismo

Cuando el cliente está satisfecho, con el informe en la mano, es el único momento en que pedir un referido
no incomoda. Después ya no.

> «Una cosa antes de irme. ¿Conoces a alguien más que debería mirar esto? No te pido una lista — dos
> nombres. Y si prefieres, no los contacto yo: les escribes tú y yo espero.»

**Dos nombres por entrega × seis entregas = doce prospectos calientes para el mes 2.** Eso es lo que hace
que el mes 2 no arranque desde cero.

---

## Día 15 al 30 — Seguimiento

- [ ] Saldo facturado y cobrado.
- [ ] Correo a los 7 días de la entrega: «¿cómo va la reclamación de los duplicados?» — el cliente que
      recupera dinero de verdad es el que renueva y el que refiere.
- [ ] Correo a los 30 días: «¿cuánto entró?». Ese número, con permiso escrito, es tu mejor caso de estudio.
- [ ] Anotar en el pipeline el resultado real contra lo estimado. Con tres o cuatro proyectos vas a saber
      si tus factores de conversión están bien calibrados, y podrás ajustarlos con datos propios en vez de
      con rangos de referencia.

---

## Qué hacer si el informe no alcanza la garantía

Va a pasar alguna vez. Manéjalo así:

1. **Dilo tú primero**, antes de que lo note él. En la sesión, al llegar al número: «te debo decir algo: el
   informe no alcanza el umbral de la garantía. Encontré US$3.200 y el compromiso era US$5.550. Así que
   esto no me lo pagas.»
2. Entrega el informe igual, completo.
3. Devuelve el anticipo sin que te lo pidan.
4. Y después: «lo que sí te digo es que tu control está funcionando mejor que el de la mayoría. Eso también
   es información útil, y ahora la tienes documentada.»

Un cliente al que le devolviste el dinero y le dejaste el trabajo hecho te refiere más que uno satisfecho.
Suena a consuelo pero es literalmente cierto — es la historia que la gente cuenta.
