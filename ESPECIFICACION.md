# Jornify – Especificación

Nov 6, 2026 · @Alejandro

## Resumen

Jornify es una app de escritorio hecha con Electron que vive en la bandeja del sistema y publica en un canal de Microsoft Teams los eventos de la jornada laboral: inicio, almuerzo, regreso, ausencia y fin. Reemplaza el proceso manual de escribir cada mensaje en el canal.

La app arranca sola al encender el computador, mantiene un consumo de RAM moderado en segundo plano y registra un mínimo de clics por evento. Además guarda un historial local para consultar las horas trabajadas.

Su ventana principal es un reloj digital que muestra el tiempo trabajado en el día y el tiempo que falta para completar la jornada.

## Requisitos funcionales

Cada acción publica un mensaje en el canal configurado y lo guarda en el historial local. El menú solo muestra las acciones válidas para el estado actual de la jornada. El almuerzo es uno por jornada: una vez registrada la salida y el regreso, "Salir a almorzar" deja de aparecer (en el reloj y en la bandeja) hasta que se inicie otra jornada.

| Acción | Disponible cuando el estado es | Nuevo estado | Mensaje de ejemplo |
| --- | --- | --- | --- |
| Iniciar jornada | Fuera de jornada | Trabajando | 🌅 Buenos días, inicio mi jornada @Angela Ortiz Peña |
| Salir a almorzar | Trabajando | En almuerzo | 🍲 Buenas tardes, inicio mi hora de almuerzo @Angela Ortiz Peña |
| Regresar de almuerzo | En almuerzo | Trabajando | 🍽️ Buenas tardes, termino mi hora de almuerzo @Angela Ortiz Peña |
| Ausentarme | Trabajando | Ausente | ⏸️ Buenas tardes, me ausento un momento @Angela Ortiz Peña |
| Regresar | Ausente | Trabajando | ▶️ Buenas tardes, regreso @Angela Ortiz Peña |
| Finalizar jornada | Trabajando | Fuera de jornada | 🌇 Buenas tardes, termino mi jornada @Angela Ortiz Peña |
| Finalizar jornada (con tiempo de más) | Trabajando | Fuera de jornada | ⏱️ Buenas tardes, termino mi jornada y recupero 1 hora y 30 minutos de hoy @Angela Ortiz Peña |

El saludo es "Buenos días" antes de las 12:00 y "Buenas tardes" desde entonces; al inicio y al fin el emoji (`{sol}`) es un amanecer 🌅 por la mañana y un atardecer 🌇 por la tarde, y el resto lleva uno fijo (🍲 almuerzo, 🍽️ plato vacío al regresar de almorzar, ⏸️ ausencia, ▶️ regreso, ⏱️ recuperación). Si al finalizar se trabajó al menos un minuto más que la meta del día, se usa el mensaje de recuperación con ese tiempo de más. El motivo de la ausencia se guarda en el historial, pero la plantilla por defecto no lo muestra.

### Comportamiento

- **Ícono en la bandeja** con menú contextual de acciones; el ícono cambia de color según el estado.
- **Confirmación al arrancar:** al iniciar la app aparece un cuadro "¿Registrar inicio de jornada?" con "Registrar inicio" y "Ahora no". Nunca publica sin confirmación. Solo pregunta si hoy todavía no hay nada registrado: a mitad de jornada (p. ej. tras un reinicio) retoma el estado, y si ya se finalizó hoy no vuelve a ofrecer. Se desactiva en Ajustes → General.
- **Plantillas editables** de cada mensaje, con variables `{saludo}`, `{sol}`, `{hora}`, `{fecha}`, `{nombre}`, `{mencion}`, `{tiempo}` (solo en el fin con recuperación) y `{motivo}`.
- **Mensajes programados** (campana de la cabecera del reloj): el usuario elige una acción (p. ej. "Ausentarme"), una hora de hoy y, si quiere, un texto propio (admite las variables de las plantillas; vacío usa la plantilla de siempre). A esa hora la app registra la acción de verdad: cambia el estado, pausa o reanuda el reloj, guarda el evento en el historial y publica el mensaje. Se puede cancelar mientras esté pendiente. Reglas: solo de hoy y una sola vez; si a la hora de ejecutarse la acción ya no es válida en el estado de la jornada, se omite y se explica por qué; si la app estaba cerrada o el equipo suspendido y se descubre con más de 10 min de retraso, también se omite (no se publica tarde).
- **Reporte en Excel** (enlace "Exportar a Excel" del Historial; ya no hay botón propio en la cabecera, y "volver" regresa al Historial): "Exportar a Excel" para hoy, la semana (lunes a domingo), el mes o dos fechas (máximo 366 días). Pide dónde guardar un `.xlsx` con dos hojas. **Resumen:** una fila por día con registros (fecha, día, entrada, salida, almuerzo, ausencias, trabajado, meta del día, diferencia en horas decimales, observación) y una fila de totales. **Eventos:** cada acción con fecha, hora, acción, motivo, mensaje, estado de envío, hora de envío e intentos. Un día pasado sin cerrar cuenta solo hasta su último evento y se señala; la meta de cada día usa los ajustes de hoy (los lunes, con el recorte), cosa que se anota al pie del Resumen.
- **Ajustes** (ícono de controles en la cabecera del reloj): hora de entrada, jornada en horas netas, recorte de los lunes, duración del almuerzo (minutos), regreso automático del almuerzo a quién mencionan los mensajes y si el reloj se abre al iniciar la app. Muestra la salida planeada (entrada + jornada + almuerzo; los lunes menos el recorte), valida los límites (jornada 1–16 h, recorte menor que la jornada, almuerzo 5–240 min, todo dentro del mismo día), tiene "Valores de fábrica" y al guardar el reloj se actualiza al momento. Lo ya programado no cambia: un regreso automático que ya está pendiente conserva su hora.
- **Mensajes editables** (pestaña "Mensajes" de Ajustes): cada uno de los siete mensajes se edita con atajos para insertar variables en el cursor, una vista previa con datos de ejemplo y "Texto de fábrica". Se rechazan los vacíos, los de más de 500 caracteres y las variables que no existen. Los cambios rigen para los mensajes que se registren desde ese momento; los ya registrados conservan su texto.
- **Regreso del almuerzo automático:** al salir a almorzar se programa solo el regreso para `duracionAlmuerzoMin` después (60 min); se puede marcar antes a mano ("Regresar de almuerzo"), y entonces el automático se retira. Se desactiva con `horario.regresoAlmuerzoAutomatico: false`.
- **Motivo opcional** al ausentarse, en un cuadro de texto pequeño.
- **Historial local** de cada evento con fecha, hora, tipo y si se publicó con éxito (ícono de reloj con flecha en la cabecera). Vista **Día**: entrada, salida, trabajado frente a la meta, almuerzo y ausencias, y cada evento con su estado ("Enviado", "En cola", "No se envió"); al tocarlo se ve el mensaje y los intentos. Vista **Semana** (lunes a domingo): una barra por día hacia su meta, la diferencia y el total; al tocar un día se abre su detalle. Se navega con flechas hasta hoy.
- **Resumen** de horas trabajadas por día y semana, descontando almuerzo y ausencias (en la vista Semana del historial y en el Excel).
- **Recordatorios** (notificaciones de Windows; al tocarlas se abre el reloj): "Ya pasó tu hora de salida" si a la hora de salida planeada (los lunes, con el recorte) la jornada sigue abierta, y "Tu almuerzo ya se pasó" cuando supera la duración configurada (con un minuto de margen para que el regreso automático actúe primero). Cada aviso sale una sola vez; el de salida no se da a quien empezó después de esa hora (recuperando tiempo). Se activan o desactivan por separado en Ajustes → General.
- **Inicio con Windows** (Ajustes → General): la app instalada se abre al iniciar sesión (`--inicio-automatico`). En desarrollo no se registra nada en Windows.
- **Reintentos:** si no hay internet, el mensaje queda en cola y se envía al recuperar conexión, con la hora original del evento.
- **Recuperación de estado:** si el PC se reinicia a mitad de jornada, la app retoma el último estado del historial.

### Ventana principal: reloj de jornada

&#91;embedded content: ventana del reloj · boceto con valores de ejemplo\]

- **Reloj digital** (HH:MM:SS) con el tiempo trabajado hoy, descontando almuerzo y ausencias. Se pausa en almuerzo o ausencia.
- **Tiempo que falta** para completar la jornada objetivo (configurable, por defecto 10 h netas, sin contar el almuerzo; **los lunes se recorta 1 h**, es decir, 9 h). Al superarla, cambia a "Horas extra" con otro color.
- **Salida estimada:** hora actual más el tiempo que falta.
- **Barra de progreso** de la jornada y **chip de estado** (Trabajando, En almuerzo, Ausente, Fuera de jornada).
- **Botones** con las acciones válidas para el estado actual; son las mismas del menú de la bandeja.
- Ventana pequeña (unos 380 × 420 px), opción de "siempre visible" y modo claro u oscuro según Windows.
- Se abre al hacer clic en el ícono de la bandeja. Al cerrarla, la app sigue en la bandeja.
- El reloj avanza en la propia ventana a partir de la hora de inicio guardada; no pide datos al proceso principal cada segundo.
- **Temas de temporada y festividades de Colombia.** La ventana cambia de aspecto según la fecha: estaciones por mes (invierno en enero y febrero, primavera de marzo a mayo, verano de junio a agosto, otoño de septiembre a noviembre, Navidad en diciembre) y, por encima de ellas, festividades colombianas: Año nuevo (31 dic y 1 ene), Día de las Velitas (7 y 8 dic), San Juan y San Pedro (24 al 29 jun, fiestas sanjuaneras del Tolima y el Huila), Carnaval de Barranquilla (sábado a martes antes del Miércoles de Ceniza), Día de la Madre y Día del Padre (la semana que termina el segundo domingo de mayo y el tercero de junio), Día de la Independencia (20 jul), Batalla de Boyacá (7 ago), Amor y Amistad (la semana del tercer sábado de septiembre) y Halloween (28 al 31 oct). Un tema cambia solo lo neutro (fondo, superficies, bordes, color de foco) y pone un **friso** decorativo al pie de la ventana; los colores de estado (trabajando, almuerzo, ausente, fuera de jornada) y los de error nunca cambian. El **logo** (ventana, barra de tareas y avisos) cambia con el tema: mismo diseño con otro degradado y una forma propia del tema en lugar del punto (hoja, copo, flor, sol, estrella, corazón, luna, sombrero, bandera…). El ícono de la **bandeja** sigue siendo el disco del color del estado con manecillas y, con un tema activo, lleva una pequeña insignia redonda con esa forma. En Ajustes > General se elige "Según la fecha" (por defecto), "Clásico" (sin tema) o un tema concreto, con vista previa al elegir.

## Requisitos no funcionales

| Requisito | Meta |
| --- | --- |
| Sistema operativo | Windows 10 y 11 |
| RAM solo en bandeja (ventana cerrada) | Menos de 120 MB, sumando todos los procesos de Electron |
| RAM con el reloj abierto | Menos de 220 MB |
| CPU en reposo | Cercana a 0 %; el reloj solo se redibuja mientras la ventana está visible |
| Arranque | Automático al iniciar sesión con `app.setLoginItemSettings` (activable o desactivable desde la app) |
| Instancia única | `app.requestSingleInstanceLock()`; abrir la app otra vez muestra el reloj |
| Distribución | Instalador `.exe` con electron-builder (NSIS); actualizaciones opcionales con electron-updater |
| Seguridad | Tokens cifrados con `safeStorage` (DPAPI de Windows); `contextIsolation` activado, `nodeIntegration` desactivado y `sandbox` en la ventana |
| Registro | `electron-log` con rotación de archivos |

Al cerrar el reloj, la ventana se destruye en lugar de ocultarse, así su proceso libera la memoria y solo queda el proceso principal con la bandeja. Las pantallas de historial y configuración se cargan dentro de la misma ventana, sin abrir procesos extra.

## Integración con Teams

La app define una interfaz común `Publicador` con dos implementaciones intercambiables desde la configuración. El método principal es iniciar sesión con Microsoft (Graph API): el usuario se loguea una vez con su cuenta del trabajo y cada mensaje sale publicado a su nombre; el webhook de Workflows queda como alternativa si TI no aprueba el registro de la app.

| Aspecto | Microsoft Graph API | Webhook de Workflows (Power Automate) |
| --- | --- | --- |
| Autor visible del mensaje | El usuario | Workflows (el nombre va en el texto) |
| Configuración | Registrar app en Microsoft Entra ID | Crear flujo "publicar cuando se reciba una solicitud webhook" en el canal |
| Autenticación | Inicio de sesión con MSAL; token en caché | URL secreta del webhook |
| Posible bloqueo | Política de la empresa sobre consentimiento de apps | Políticas de Power Automate |
| Complejidad | Media | Baja |

Los antiguos "Incoming Webhooks" (conectores de Office 365) dejaron de funcionar en mayo de 2026 y no deben usarse ([fuente](https://www.virtosoftware.com/microsoft-365-guides/office-365-connectors/)).

### Inicio de sesión con Microsoft (Graph): detalles

- Primera ejecución: pantalla de bienvenida con el botón **Iniciar sesión con Microsoft**, que abre el navegador del sistema para el login (flujo con PKCE).
- Registrar una app tipo *cliente público* en Entra ID, con redirección `http://localhost`.
- Permisos delegados: `ChannelMessage.Send`, `Team.ReadBasic.All`, `Channel.ReadBasic.All` y `User.Read`. Además, `User.ReadBasic.All` (opcional): solo se pide al pulsar "Activar menciones", para que el inicio de sesión no dependa de él.
- Datos de la app registrada (`teams.clientId`, `teams.tenantId`) se escriben en la pestaña Teams de la ventana; el ID de la aplicación debe ser un GUID.
- **Inquilino:** si la app se registra como *solo este directorio* (un solo inquilino), hay que pegar el **ID de directorio (inquilino)** en `teams.tenantId`: una app de un solo inquilino no acepta la autoridad `organizations`, que es el valor por defecto. Ese valor solo sirve si la app se registró como multiinquilino.
- Consentimiento: según Microsoft ninguno de estos permisos exige administrador, pero si el inquilino bloquea el consentimiento de usuarios, un administrador debe pulsar "Conceder consentimiento de administrador" en la página de permisos de la app.
- Librería `@azure/msal-node` (`PublicClientApplication`); la caché de tokens se cifra con `safeStorage` y se renueva en silencio. El usuario no vuelve a loguearse salvo que el token expire o cierre sesión.
- Tras el login, la app muestra el nombre y la foto del usuario (`GET /me`) y lista sus equipos y canales (`GET /me/joinedTeams`, `GET /teams/{id}/channels`) para elegir el canal de control de horario.
- Envío: `POST /teams/{team-id}/channels/{channel-id}/messages` con el cuerpo en HTML simple.
- Hilo de la jornada: cada **inicio de jornada** se publica como un mensaje nuevo del canal (con su propio id) y los mensajes que le siguen (almuerzo, regreso, ausencia, fin…) como respuestas a él: `POST .../messages/{message-id}/replies` (mismo permiso `ChannelMessage.Send`). El `fin` es la última respuesta; el siguiente inicio abre otro hilo, también el mismo día. El id que devuelve Graph se guarda en el historial (`teams_mensaje_id`, `teams_es_raiz`) y cada mensaje responde al último hilo abierto a la hora de su evento (no a la del envío, y sin importar el cambio de día). Si no hay hilo abierto, o la respuesta da 404 (el mensaje se borró o se cambió de canal), el mensaje se publica como uno nuevo y ese abre el hilo. `teams.respuestasEnHilo` (por defecto `true`) lo desactiva; se cambia con la casilla "Responder en el hilo de cada jornada en Teams" de Ajustes > General y rige para los mensajes que se publiquen desde ese momento.
- Opción "Cerrar sesión" en configuración, que borra la caché de tokens (`tokens.bin`, cifrada con `safeStorage`).
- **Menciones reales:** `{mencion}` se envía como `<at id="0">Nombre</at>` más un arreglo `mentions` con el id del usuario (`GET /users?$filter=displayName eq ...`). Si falta el permiso, no se encuentra a la persona o hay más de una coincidencia, el mensaje sale igual con "@Nombre" como texto.
- **Cola con reintentos:** los eventos `pendiente` del historial son la cola; se entregan en orden cronológico y, si uno falla, los siguientes esperan para no desordenar el canal. Espera entre intentos 15 s, 30 s, 1 min, 2 min y 5 min (se repite la última). Si falta iniciar sesión o elegir canal no se cuentan intentos ni se programan temporizadores: se entrega al quedar listo. Un error sin remedio (p. ej. 403) pasa a `fallido` tras 3 intentos y la cola sigue; los errores de red nunca. Un mensaje entregado con más de 5 min de retraso lleva al final "(registrado a las H:MM)".

### Webhook: detalles

- En Teams: canal → Workflows → plantilla de webhook. Copiar la URL generada.
- Envío: `POST` a la URL con una Adaptive Card o un texto simple en JSON.

Antes de construir la parte de Graph, conviene confirmar con TI que se permite registrar la app o dar consentimiento a esos permisos.

## Stack técnico

Electron con TypeScript, organizado con electron-vite. La interfaz es React y la lógica vive en el proceso principal (Node).

| Necesidad | Librería o API | Motivo |
| --- | --- | --- |
| Base del proyecto | `electron` + `electron-vite` + TypeScript | Plantilla con main, preload y renderer separados |
| Interfaz (reloj, historial, configuración) | React + CSS módulos | Componentes simples; sin librerías de UI pesadas |
| Ícono y menú en bandeja | `Tray` y `Menu` de Electron | Nativo, sin dependencias |
| Notificaciones | `Notification` de Electron | Notificaciones nativas de Windows |
| Peticiones HTTP | `fetch` nativo de Node | Sin dependencias extra |
| Inicio de sesión con Microsoft | `@azure/msal-node` | Login con PKCE y renovación de tokens |
| Secretos | `safeStorage` de Electron | Cifrado con DPAPI de Windows |
| Historial | `better-sqlite3` | SQLite rápido y síncrono |
| Configuración | `electron-store` + `zod` | JSON validado en `%APPDATA%` |
| Comunicación main ↔ interfaz | `ipcMain` / `contextBridge` | API mínima y segura en el preload |
| Registro | `electron-log` | Logs rotativos |
| Empaquetado | `electron-builder` | Instalador NSIS para Windows |
| Pruebas | `vitest` | Pruebas de la lógica sin abrir Electron |

Gestión de dependencias con `npm` o `pnpm`. `better-sqlite3` es un módulo nativo: se recompila para Electron con `electron-builder install-app-deps`.

## Arquitectura

&#91;embedded content: componentes de la app · 7 módulos\]

La interfaz nunca habla con Teams directamente: el controlador valida la acción, la guarda en el historial y la pone en la cola, que la entrega al publicador configurado.

### Estructura de carpetas

```
jornify/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── README.md
├── CLAUDE.md                     # este documento resumido para Claude Code
├── resources/                    # logo clásico para el instalador (icono.png/.ico) y sonidos; los demás íconos se dibujan en código
├── src/
│   ├── main/                     # proceso principal (Node)
│   │   ├── index.ts              # arranque, instancia única, inicio con Windows
│   │   ├── estado.ts             # máquina de estados de la jornada
│   │   ├── tiempo.ts             # cálculo de tiempo trabajado y restante
│   │   ├── controlador.ts        # coordina acciones, historial, cola y recordatorios
│   │   ├── plantillas.ts         # formateo de mensajes
│   │   ├── config.ts             # electron-store + zod
│   │   ├── historial.ts          # better-sqlite3
│   │   ├── cola.ts               # envíos pendientes y reintentos
│   │   ├── recordatorios.ts
│   │   ├── auth.ts               # inicio de sesión con Microsoft (msal-node)
│   │   ├── bandeja.ts            # Tray y menú
│   │   ├── ventana.ts            # crea y destruye la ventana del reloj
│   │   ├── ipc.ts                # canales entre main e interfaz
│   │   └── publicadores/
│   │       ├── base.ts           # interfaz Publicador
│   │       ├── graph.ts
│   │       └── webhook.ts
│   ├── preload/
│   │   └── index.ts              # API segura expuesta con contextBridge
│   └── renderer/                 # interfaz en React
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── components/Reloj.tsx
│           ├── components/Acciones.tsx
│           ├── pages/Bienvenida.tsx  # botón Iniciar sesión con Microsoft
│           ├── pages/Historial.tsx
│           └── pages/Configuracion.tsx
└── tests/
```

La lógica (`estado`, `tiempo`, `controlador`, `plantillas`, `historial`, `cola`) no importa nada de Electron, para poder probarla con Vitest. La interfaz no accede a Node: solo llama a la API mínima que expone el preload.

## Modelo de datos y configuración

Los datos viven en `%APPDATA%\Jornify\`: `historial.db`, `config.json` y la carpeta `logs/`. Los secretos van en el Administrador de credenciales, no en esos archivos.

### Tabla `eventos` (SQLite)

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | INTEGER PK | Autoincremental |
| `tipo` | TEXT | `inicio`, `almuerzo`, `regreso_almuerzo`, `ausencia`, `regreso`, `fin` |
| `ocurrido_en` | TEXT (ISO 8601) | Hora real del evento, con zona horaria |
| `motivo` | TEXT NULL | Solo para ausencias |
| `mensaje` | TEXT | Texto final enviado |
| `estado_envio` | TEXT | `pendiente`, `enviado`, `fallido` |
| `enviado_en` | TEXT NULL | Hora de publicación en Teams |
| `intentos` | INTEGER | Número de reintentos |

Tabla `programados` (acciones programadas de hoy): `id`, `tipo`, `programado_para` (ISO 8601 con zona), `mensaje` (texto propio, opcional), `origen` (`manual` o `automatico`), `estado` (`pendiente`, `ejecutado`, `omitido`, `cancelado`), `nota` (por qué no se ejecutó), `evento_id` (evento que se registró) y `creado_en`.

El estado actual de la jornada se deriva del último evento del día; no se guarda aparte.

### Ejemplo de `config.json`

```
{
  "teams": {
    "metodo": "graph",
    "teamId": "",
    "channelId": "",
    "mencionar": "Angela Ortiz Peña",
    "respuestasEnHilo": true
  },
  "horario": {
    "horaEntrada": "08:00",
    "horaSalida": "19:00",
    "jornadaObjetivoHoras": 10,
    "recorteLunesHoras": 1,
    "duracionAlmuerzoMin": 60,
    "regresoAlmuerzoAutomatico": true,
    "descontarAusencias": true
  },
  "plantillas": {
    "inicio": "{sol} {saludo}, inicio mi jornada {mencion}",
    "almuerzo": "🍲 {saludo}, inicio mi hora de almuerzo {mencion}",
    "regresoAlmuerzo": "🍽️ {saludo}, termino mi hora de almuerzo {mencion}",
    "ausencia": "⏸️ {saludo}, me ausento un momento {mencion}",
    "regreso": "▶️ {saludo}, regreso {mencion}",
    "fin": "{sol} {saludo}, termino mi jornada {mencion}",
    "finConRecuperacion": "⏱️ {saludo}, termino mi jornada y recupero {tiempo} de hoy {mencion}"
  },
  "app": {
    "iniciarConWindows": true,
    "confirmarInicioAlArrancar": true,
    "abrirRelojAlIniciar": true,
    "siempreVisible": false,
    "tema": "auto"
  }
}
```

El nombre del usuario ya no se configura: se toma de la cuenta de Microsoft al iniciar sesión.

## Plan de implementación

Cada fase termina con algo que funciona y se puede probar. Conviene pedirle a Claude Code una fase a la vez.

1. **Base del proyecto:** plantilla electron-vite con TypeScript y React, instancia única, configuración con electron-store y logs.
   - [ ] Probado: la app arranca, aparece en la bandeja y crea `%APPDATA%\Jornify\`.
2. **Lógica sin interfaz:** máquina de estados, cálculo de tiempo trabajado y restante, plantillas e historial SQLite, con pruebas en Vitest.
   - [ ] Probado: las transiciones inválidas se rechazan y los tiempos se calculan bien con almuerzo y ausencias.
3. **Ventana del reloj y bandeja:** reloj digital, tiempo que falta, salida estimada, botones y menú de la bandeja, usando un publicador de prueba que solo escribe en el log.
   - [ ] Probado: el reloj avanza, se pausa en almuerzo y el menú cambia según el estado.
4. **Inicio de sesión con Microsoft y envío por Graph:** pantalla de bienvenida, login con msal-node, selección de equipo y canal, envío y cola con reintentos.
   - [x] Probado: el mensaje aparece con tu nombre en el canal; sin internet queda en cola y se envía después.
5. **Webhook de Workflows (plan B):** solo si TI no permite el login con Graph.
6. **Pantallas de historial y configuración:** historial por día y semana, plantillas editables y ajustes generales. *Hecha y confirmada.*
7. **Recordatorios e inicio con Windows.** *Implementada; pendiente de confirmación.*
8. **Empaquetado:** instalador con electron-builder y medición de RAM (metas: menos de 120 MB en bandeja y 220 MB con el reloj abierto). Hecho: `npm run empaquetar` genera `dist/Jornify-Instalador-<versión>.exe` (NSIS, por usuario, sin firmar); medido con la app empaquetada, ~85 MB en bandeja y 140 a 195 MB con el reloj abierto.

Conviene preguntar a TI por el registro de la app antes de la fase 4; si lo bloquean, se hace la fase 5 en su lugar.

## Cómo empezar en Claude Code

Exporta este documento como Markdown, guárdalo en la carpeta del proyecto como `ESPECIFICACION.md` y usa este primer mensaje:

```
Lee ESPECIFICACION.md. Es la especificación de Jornify, una app de escritorio para Windows hecha con Electron, TypeScript y React. Vive en la bandeja, muestra un reloj con mi tiempo trabajado y publica mi jornada laboral en un canal de Teams iniciando sesión con Microsoft.

1. Crea un CLAUDE.md con un resumen de la especificación, las convenciones del proyecto (nombres en español, TypeScript estricto, Vitest, contextIsolation activado) y los comandos para ejecutar, probar y empaquetar.
2. Implementa solo la Fase 1 del plan.
3. Al terminar, dime cómo probarla y espera mi confirmación antes de pasar a la Fase 2.
```

En las siguientes sesiones basta con pedir: "Implementa la Fase N de ESPECIFICACION.md".

## Decisiones pendientes

- [x] Confirmar con TI si se permite registrar una app en Entra ID para iniciar sesión con Microsoft y enviar mensajes con Graph.
- [ ] Definir el texto exacto que el equipo espera en el canal (formato y emojis).
- [ ] Decidir si la app propone el fin de jornada automáticamente al apagar el PC.
- [x] Jornada de 10 h netas sin contar el almuerzo; los lunes se recorta 1 h (9 h netas y la hora de salida planeada una hora antes). Con entrada a las 08:00 y 1 h de almuerzo, la salida por defecto es 19:00 (18:00 los lunes).
- [ ] Confirmar la duración del almuerzo (hoy 60 min) y la hora de entrada (hoy 08:00).
