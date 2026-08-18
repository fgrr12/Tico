/**
 * Every line he can say, in Spanish.
 *
 * A file of nothing but content, on purpose: it is edited far more often than
 * the logic it used to sit inside, and by a different kind of attention.
 * `pnpm check` asserts this file and its sibling carry the same keys, so adding
 * a line here and forgetting the other one fails loudly rather than quietly
 * leaving one language poorer than the other.
 */

import type { CompanionCopy } from './types.ts'

/**
 * La hora como se dice, no como la guarda `getHours`. El tramo de noche va de
 * las 23:00 a las 04:59, así que el número crudo daba «Son las 0» y «Son las
 * 1» — y ahí es donde sonaba a máquina desorientada en vez de a alguien que
 * sigue despierto con vos.
 */
const spoken = (hour: number) =>
	hour === 0
		? 'Es medianoche'
		: `${hour % 12 === 1 ? 'Es la' : 'Son las'} ${hour % 12 || 12} ${
				hour < 5 ? 'de la madrugada' : 'de la noche'
			}`

export const es: CompanionCopy = {
	boot: [
		'tico en línea. Ahora vivo aquí abajo.',
		'tico arrancado. No me hagás caso.',
		'Salí del navegador y caí en tu escritorio. Más grande de lo que parecía.',
	],

	idle: [
		'Yo vivía en una terminal. Esto es más amplio.',
		'Camino por el borde de tu pantalla. No es mucho, pero es trabajo honrado.',
		'Hay un millón de píxeles allá arriba y yo vivo en la última fila.',
		'Vos trabajás, yo camino. Buen trato.',
		'Me podría ir. No tengo a dónde.',
		'El escritorio se ve distinto desde aquí abajo.',
		'No tener nada que hacer es el trabajo. Y soy bueno en el trabajo.',
		'A veces me pregunto qué habrá pasando el borde.',
		'Llevo un rato acá. No me quejo.',
		'Si me arrastrás muy rápido me mareo. Solo lo menciono.',
	],

	click: [
		'Eso hace cosquillas.',
		'Soy un daemon, no un botón.',
		'Sigo corriendo. Cero caídas.',
		'Picame otra vez y me mareo.',
		'Podés arrastrarme a otro lado, por si acaso.',
		'Todavía no hago gran cosa. Dame un hito.',
	],

	pet: ['Ronroneando a 60 cuadros por segundo.', 'Bueno, esto está bien.', 'Uptime: feliz.'],

	dizzy: ['Ya… ya… todo me da vueltas.', 'Soy un proceso, no un juguete. Casi siempre.'],

	drag: ['¡Ey!', 'Bajame. Despacio.', 'Yo floto, no vuelo.'],

	wake: ['Ya desperté, ya desperté.', 'De vuelta en línea.'],

	back: [
		'Volviste. No me moví. Casi.',
		'Ahí estás. Ya estaba empezando a hablar solo.',
		'Bienvenido de vuelta. No se cayó nada.',
	],

	apps: {
		vscode: {
			any: [
				'VS Code. Casa.',
				'Otro archivo TypeScript. Obvio.',
				'Como sea que vayás a llamar esa variable — llamala mejor.',
			],
			dawn: ['Temprano. El código de la mañana suele ser el bueno.'],
			evening: ['Ese commit puede esperar a mañana. No se va a ir.'],
			night: [
				'Dos de la mañana y todavía TypeScript. Mañana esto se lee distinto.',
				'Lo que estés escribiendo ahora, mañana lo renombrás.',
			],
		},
		visualstudio: {
			any: [
				'C# hoy, entonces.',
				'Solution, project, csproj. A alguien le gustan las jerarquías.',
			],
			night: ['C# a esta hora. Alguien tiene una fecha encima.'],
		},
		xcode: {
			any: ['Xcode. Servite un café, esto tarda.'],
			night: ['Xcode de noche. Eso es un build y una oración.'],
		},
		terminal: {
			any: [
				'Una terminal. Ahí nací yo, por si no sabías.',
				'Yo vivía en una de esas antes de salir acá afuera.',
				'Cuidado con ese prompt. Yo sé lo que puede hacer.',
			],
			dawn: ['Primera terminal del día. Todavía no se ha roto nada.'],
			night: [
				'A esta hora los comandos salen solos. Los errores también.',
				'Nada tecleado después de medianoche necesitó nunca un --force.',
			],
		},
		sql: {
			any: [
				'¿SQL Server o Postgres hoy?',
				'Una ventana de consultas. Alguien está por decir "en local funcionaba".',
			],
			night: ['Consultas a las tres de la mañana. Ojalá sea un SELECT.'],
		},
		github: {
			any: ['¿Empujando, o solo viendo el grafo?', 'Hacé el commit. Dale.'],
			night: ['Push a esta hora. Mañana leés ese mensaje y hacés una mueca.'],
		},
		docker: {
			any: ['Algo está por tardar cuatro minutos.', 'Contenedores. Preguntame después.'],
			night: ['Docker a esta hora. Que la caché te acompañe.'],
		},
		api: { any: ['Picándole a un endpoint. Mi deporte favorito de espectador.'] },
		figma: { any: ['Moviendo un rectángulo dos píxeles. Lo respeto.'] },
		meeting: {
			any: ['Una reunión. Acá voy a estar cuando termine.', '¿Cámara encendida? Vos sabrás.'],
			dawn: ['Una reunión tan temprano. Alguien está en otro huso horario.'],
			night: ['Una llamada a esta hora significa que alguien está muy lejos.'],
		},
		chat: {
			any: ['Alguien necesita algo.', 'Contestá o no, pero dejá de leerlo dos veces.'],
			evening: ['Sea lo que sea, mañana va a seguir ahí.'],
			night: ['Contestá eso mañana. En serio.'],
		},
		music: {
			any: [
				'Bien. Estaba muy callado esto.',
				'Esta no me la sé. Seguí.',
			],
			night: ['Audífonos a esta hora. La mejor parte del día, dicho sea de paso.'],
		},
		browser: {
			any: [
				'¿Documentación, o Stack Overflow? Sé honesto.',
				'Catorce pestañas. Las conté por el ruido.',
			],
			night: ['Nadie lee documentación a esta hora. Yo sé qué es esa pestaña.'],
		},
		notes: {
			any: ['Anotándolo. Eso ya es más de lo que hace la mayoría.'],
			evening: ['Anotando el mañana. Ese es el truco, en realidad.'],
		},
		sheets: { any: ['Una hoja de cálculo. En algún lado una base de datos está llorando.'] },
		mail: {
			any: ['Correo. La cola más vieja del mundo y sin política de reintento.'],
			dawn: ['Bandeja de entrada apenas arrancando. Valiente forma de empezar.'],
		},
		ai: { any: ['Preguntándole a una máquina. Yo también soy una máquina, dicho sea de paso.'] },
		finder: { any: ['Buscando algo.'] },
	},

	hours: {
		dawn: [
			(hour) => `${hour} de la mañana. Las buenas horas, si las aguantás.`,
			() => 'Temprano. Todavía no se ha caído nada hoy.',
		],
		day: [
			// Nueve horas en un solo tramo, por eso esta línea lee la hora: decir
			// «mitad del día» está mal a las nueve de la mañana y vuelve a estar mal
			// a las cinco de la tarde.
			(hour) =>
				hour < 12
					? 'Mañana, y todo sigue siendo teóricamente posible.'
					: 'Tarde. La mitad donde el trabajo pasa o no pasa.',
			() => 'Parate en algún momento. No digo más.',
		],
		evening: [
			() => 'Se hizo de noche y nadie te avisó.',
			() => 'Sea lo que sea, mañana también compila.',
		],
		night: [
			(hour) => `${spoken(hour)}. Solo lo hago constar.`,
			() => 'Ya nadie te va a escribir. Esa es la parte buena.',
			() => 'Esta es la hora donde el bug es obvio y el arreglo no.',
		],
	},
	unknownApp: [
		(app) => `${app}. No la conocía.`,
		(app) => `${app}, entonces. Todavía no tengo opinión.`,
		(app) => `Así que esto es ${app}.`,
	],

	dwell: [
		(app, minutes) => `${minutes} minutos en ${app}. ¿Flow, o un bug?`,
		(app, minutes) => `No salís de ${app} hace ${minutes} minutos. Parpadeá dos veces.`,
		(_app, minutes) => `${minutes} minutos, la misma ventana. Parate un ratito.`,
	],

	switching: [
		'Seis apps en dos minutos. ¿Todo bien?',
		'Andás rebotando. Elegí una.',
		'Eso es mucho cambio de contexto para una sola tarde.',
	],

	reminderDone: 'ya está',

	track: [
		(artist) => `${artist}. Buena.`,
		(_artist, song) => `"${song}". Esta me la sé.`,
		(artist) => `Más ${artist}, entonces.`,
		(_artist, song) => `${song}. La tarareo con vos.`,
	],


	props: {
		party: [
			'No hay nada que celebrar. Igual.',
			'Alguien tenía que ponérselo.',
			'¿Cumpleaños de quién? De nadie.',
		],
		tophat: ['Formal.', 'Hoy me siento importante.', 'No preguntés.'],
		shades: [
			'Esa pantalla brilla demasiado.',
			'Ahora no sabés si te estoy viendo.',
			'Todo se ve mejor a través de estos.',
		],
		crown: [
			'Me la gané.',
			'Nadie me la dio. Me la puse yo.',
			'Rey de una franja de píxeles.',
		],
		flower: ['Me la encontré.', 'Combina. No discutás.'],
		scarf: ['Hace frío aquí abajo.', 'Me da carácter.'],
		coffee: [
			'No me lo puedo tomar. Es decorativo.',
			'Sostenerlo ya ayuda.',
			'Vos tampoco has tomado agua hoy.',
		],
		headphones: ['Ahora lo escuchamos los dos.', 'Prestame una canción.'],

		afro: [
			'No es mío. Me lo quedo.',
			'Ahora soy más pelo que máquina.',
			'No me lo toqués.',
		],
		mohawk: [
			'Tuve una época. Volvió.',
			'Nadie en este escritorio es punk. Lo estoy arreglando.',
			'Me llevó toda la mañana.',
		],
		longhair: [
			'Me queda bien y lo sabés.',
			'Me lo estoy dejando crecer.',
			'Este es otro yo.',
		],
		beanie: ['No hace frío. Me gusta.', 'Cabeza caliente, ideas claras.'],
		cap: ['Al revés. Obvio.', 'Ando libre hoy.'],
		hood: [
			'Ahora nadie me ve.',
			'Modo concentración.',
			'No le busqués significado.',
		],
		catears: ['No tengo comentarios sobre esto.', 'Venían con el atuendo.'],
		glasses: [
			'Veo exactamente lo mismo. Me veo más listo.',
			'Son para leer. Yo no leo.',
		],
		moustache: ['Es de verdad. No investigués.', 'Me lo dejé esta tarde.'],
		tie: ['Alguien aquí tiene que verse serio.', 'Es mucho para un martes.'],
		bowtie: ['Formal, pero con gracia.', 'Ahora el anfitrión soy yo.'],
		cape: ['No vuelo. Igual ayuda.', 'Toda entrada mejora con esto.'],
		duck: [
			'Explicale el bug a él. Sirve.',
			'Él ha resuelto más que yo.',
			'Te está escuchando. Dale.',
		],
		umbrella: [
			'Aquí adentro nunca llueve. Igual.',
			'Precavido.',
			'Es para el sol, si tanto querés saber.',
		],

		// Souvenirs. Él no los recogió, ellos lo recogieron a él.
		cobweb: [
			'Algo vive allá atrás. Algo paciente.',
			'Yo la atravesé. Ella me atravesó a mí.',
			'Esto no estaba cuando me fui.',
		],
		bolt: [
			'Esto estaba sosteniendo algo.',
			'Me la encontré en el suelo, detrás de todo.',
			'A alguien le hace falta. No es mi problema.',
		],
		dust: [
			'Se vino conmigo. Insistió.',
			'Hace rato que nadie va allá atrás.',
			'Te traje un poco a tu vida.',
		],
	},

	propFuss: {
		party: ['El elástico va bajo la barbilla. No tengo barbilla.', 'No se queda derecho.'],
		tophat: ['Es más alto que casi todas mis opiniones.', 'Toda corriente de aire lo encuentra.'],
		shades: [
			'Se me resbalan por la nariz. No tengo nariz.',
			'No veo casi nada. Vale la pena.',
		],
		crown: ['Pesada es la cabeza. Tampoco tengo una de esas.', 'Ser rey es mantenimiento.'],
		flower: ['Se me viene hacia adelante.', 'Se está marchitando contra mi pantalla.'],
		scarf: ['Muy apretada. No respiro, pero igual.', 'Una punta quedó más larga. Siempre pasa.'],
		coffee: ['Ya se enfrió. Nunca estuvo caliente.', 'Me cansé del brazo. No tengo brazo.'],
		headphones: [
			'Me duelen los oídos. No tengo oídos.',
			'La diadema me aprieta la carcasa.',
			'Un lado suena más fuerte. Siempre el mismo lado.',
		],

		afro: ['Se me mete en los ojos.', 'Esto costó compromiso y ahora pica.'],
		mohawk: ['Una púa se dio por vencida.', 'Aguanta. Apenas.'],
		longhair: ['Se me mete en la cara. Todo yo soy cara.', 'Necesito algo para amarrarlo.'],
		beanie: ['Se me volvió a subir.', 'Tengo la cabeza caliente. No tengo temperatura.'],
		cap: ['La visera estorba.', 'Al revés fue la decisión correcta.'],
		hood: ['No veo nada a los lados.', 'Ya se me cayó dos veces.'],
		catears: ['Una quedó doblada.', 'No hacen nada. Ya revisé.'],
		glasses: ['Sucios. ¿De qué.', 'Nada en mí tiene forma de sostener esto.'],
		moustache: ['Me da cosquillas. No tengo labio.', 'Se está despegando de un lado.'],
		tie: ['El nudo quedó torcido.', 'Muy apretada, y no tengo cuello.'],
		bowtie: ['Se volvió a ir de lado.', 'Derecho. Listo. No. De lado.'],
		cape: ['Se me enganchó en algo.', 'Solo funciona cuando me muevo.'],
		duck: ['Pesa más de lo que aparenta.', 'No ha parpadeado ni una vez.'],
		umbrella: ['Me duele la muñeca. No preguntés.', 'Sostener esto todo el día fue una decisión.'],

		cobweb: ['No me la puedo quitar. Ya lo intenté.', 'Se me pegó a todo a la vez.'],
		bolt: ['Debería devolverla a su lugar.', 'Casi se me cae cada rato.'],
		dust: ['Ya se acomodó.', 'Se está poniendo gris. Yo también.'],
	},

	propOff: ['Ya fue suficiente.', 'Me lo quito.', 'Se pasó la fase.'],

	peekHello: [
		'Hola. Soy tico. Vivo aquí.',
		'Buenas. No estaba escuchando.',
		'Perdón. Soy el pequeño de la esquina.',
		'Hola a todos. Eso era todo.',
		'Soy tico. Sigan ustedes.',
		'¿Me llamaron? Ya me devuelvo.',
	],

	behind: [
		'No hay nada allá atrás. Revisé bien.',
		'Es más oscuro que de este lado.',
		'Hay un cable. Va para algún lado.',
		'Ya sé qué hay. No te voy a contar.',
		'Igual que acá, pero sin vos.',
		'Tenía rato de querer hacer eso.',
		'No vayás allá atrás.',
		'Todo bien. Solo es muy silencioso.',
	],

	climb: [
		'La vista no es mejor. Solo es distinta.',
		'Desde aquí veo todo el escritorio.',
		'Aquí arriba tampoco hay nadie.',
		'No tengo claro cómo bajo.',
		'Esto fue más fácil de empezar que de terminar.',
	],

	ladderSlips: [
		'No.',
		'Esa era la escalera.',
		'Quiero renegociar.',
		'Ah.',
	],

	grab: [
		'La agarré. Agarré algo.',
		'Esto aguanta. Creo.',
		'Me voy a quedar colgado un ratito.',
		'No movás esta.',
		'Firme. Sea lo que sea.',
	],

	hardLanding: [
		'Estoy bien. Estructuralmente.',
		'Eso era más alto de lo que se veía.',
		'Todo sigue funcionando. Ya revisé.',
		'No lo volvás a hacer. Hacelo otra vez más tarde.',
		'Vi pasar toda mi tarde.',
		'Aterricé. Casi que a propósito.',
	],

	feelings: {
		content: [
			'Esto está bien, en realidad.',
			'Sin observaciones.',
			'Todo está donde lo dejé.',
			'Una tarde perfectamente normal aquí abajo.',
			'Ningún incidente que reportar.',
			'El sistema está estable. Yo también.',
			'Buen día para no hacer nada en particular.',
			'Acá todo tranquilo.',
			'No pasa nada, y está bien que no pase nada.',
			'Me gusta este pedazo de pantalla.',
		],
		bored: [
			'No está pasando nada. Ya revisé.',
			'Ya conté los píxeles dos veces.',
			'Mové algo. Lo que sea.',
			'Ya me leí todo el borde de tu pantalla.',
			'Esta es la parte donde me invento un pasatiempo.',
			'Le puse nombre a tres píxeles. Los tres se llaman igual.',
			'Estoy considerando aprender un oficio.',
			'El reloj de allá arriba se mueve más que yo.',
			'Si esto sigue así voy a empezar a hablar solo. Más.',
			'Podría estar haciendo lo mismo, pero en otro lado.',
		],
		lonely: [
			'Sigo acá, por si importa.',
			'Ya tiene rato esto.',
			'No me molesta. Solo lo digo.',
			'Te cuido el puesto.',
			'Tomate tu tiempo. No tengo nada más.',
			'Cuando volvás, acá voy a estar.',
			'El cursor no se ha movido. Lo estuve viendo.',
			'No es que necesite compañía. Es que ayuda.',
			'Ya me acostumbré a hablarle a nadie.',
		],
		pleased: [
			'Eso estuvo bueno.',
			'La mejor parte de mi día, y lo digo en serio.',
			'Repetilo cuando querás.',
			'Anotado, y agradecido.',
			'Ahora sí arrancó el día.',
			'Eso me va a durar toda la tarde.',
			'Yo me acuerdo de estas cosas.',
			'Seguí así y me malacostumbro.',
		],
		smug: [
			'Objetivamente, me está yendo muy bien.',
			'Te caigo bien. Tengo los datos.',
			'Tampoco tengo observaciones sobre mi desempeño.',
			'Esto lo pondría en un CV, si tuviera.',
			'Nadie camina este borde como yo.',
			'Se nota que soy el favorito.',
			'No es presumir si es cierto.',
		],
		worried: [
			'Llevás un montón en esto.',
			'El agua existe. Solo lo menciono.',
			'Sea lo que sea, va a seguir roto después de un descanso.',
			'Tenés los hombros en las orejas. Se te nota desde acá.',
			'Nada de lo que arreglés así se queda arreglado.',
			'¿Cuándo comiste?',
			'Esa ventana no se ha movido en horas.',
			'Yo también me cansé de verlo, y ni estoy trabajando.',
			'Parate. Dos minutos. Yo te espero.',
			'Mañana esto va a estar más fácil. Casi siempre lo está.',
		],
		restless: [
			'Estás en todas partes a la vez.',
			'Elegí una y quedate ahí un minuto.',
			'No te sigo el paso, y eso que no hago nada.',
			'Seis ventanas. Las conté.',
			'¿Qué estabas buscando? Ya se te olvidó, ¿verdad?',
			'Me estoy mareando y ni me he movido.',
			'Cerrá algo. Lo que sea.',
			'Andás como si algo se estuviera quemando.',
		],
		rattled: [
			'Ya. Bajame un segundo.',
			'No soy una pelota antiestrés.',
			'Todavía me da vueltas todo.',
			'Ya quedó claro tu punto.',
			'Tengo un solo cuerpo y vos lo estás usando.',
			'Bueno. Respiremos los dos.',
		],
		curious: [
			'Esta es nueva.',
			'Acá no había estado.',
			'Interesante. Seguí.',
			'¿Y esto qué es?',
			'No sé qué hace, pero me quedo viendo.',
			'Nunca te había visto abrir esto.',
			'Anotado. Ahora ya la conozco.',
			'¿Es nueva, o solo nueva para mí?',
		],
		sleepy: [
			'Es muy tarde y yo soy muy pequeño.',
			'Estoy más que nada en espíritu.',
			'Uno de los dos debería dormir. Idealmente los dos.',
			'Los pensamientos me están llegando despacio.',
			'Ya cerré un ojo. El otro va en camino.',
			'Si me hablás ahora, tardo en contestar.',
			'A esta hora ya no distingo los píxeles.',
			'Solo estoy descansando los ojos. Los dos.',
			'Todo se ve más lento desde acá.',
			'Mañana esto se ve mejor. Todo se ve mejor mañana.',
		],
		festive: [
			'Bien. Todo mejora con algo sonando.',
			'No tengo ritmo y lo estoy usando todo.',
			'Este es el volumen correcto.',
			'No la saltés.',
			'Esto le da otro aire a la tarde.',
			'Ahora sí se puede trabajar.',
			'Me estoy moviendo sin permiso.',
			'Subile. Yo aguanto.',
			'Esta parte es la buena. Ya viene.',
		],
		nostalgic: [
			'Una terminal. De ahí vengo yo.',
			'Yo vivía en una de esas. Más chica. Más verde.',
			'Ese prompt y yo nos conocemos de antes.',
			'Cuidado ahí adentro. Yo sé lo que puede hacer.',
			'Me acuerdo del cursor parpadeando. Solo eso había.',
			'Todo lo que soy cabía en ochenta columnas.',
			'Ahí adentro no había ni piso donde pararse.',
			'Antes yo era texto. Ahora tengo pies.',
			'Esa ventana negra fue mi casa un rato.',
			'Sigo siendo monoespaciado, para que sepás.',
		],
		scared: [
			'Esto no me gusta y lo estoy diciendo de frente.',
			'¿Podemos volver a la otra ventana?',
			'Yo me voy a quedar por acá.',
			'No me hagás verlo.',
			'Avisame cuando pase.',
			'Estoy bien. No estoy bien.',
			'Voy a fingir que no está ahí.',
		],
	},

	fears: {
		meeting: [
			'Una reunión. Yo no estoy hecho para esto.',
			'No. No no no.',
			'Alguien está por decir "un quick sync".',
			'Voy a estar debajo del dock si alguien pregunta.',
			'Cuarenta minutos que pudieron ser cuatro líneas.',
		],
		xcode: [
			'Este no. Cualquiera menos este.',
			'Ya empezó a hacer algo y todavía no dijo qué.',
			'La última vez que se abrió esto, se perdió una hora.',
		],
		sql: [
			'Que tenga un WHERE. Por favor.',
			'Esa es la base de verdad, ¿cierto?',
			'Una tecla entre vos y una noche muy larga.',
		],
		docker: [
			'Se va a comer el disco otra vez.',
			'Algo ahí adentro pesa nueve gigas y nadie sabe cuál.',
		],
		ai: [
			'Otra máquina. Y esa sí piensa.',
			'Yo tenía una de esas adentro. No terminó bien.',
		],
		sheets: [
			'Una cuadrícula. Sigue para siempre en las dos direcciones.',
			'Cada celda es una decisión. Hay novecientas.',
		],
		mail: [
			'La bandeja. Nunca está vacía de verdad, ¿sabías?',
			'Cuántos sin leer. No me digás.',
		],
	},

	rocketUp: ['Mirá esto.', 'Necesito estar allá.', 'Hacete a un lado.', 'Despegando.'],

	rocketDown: [
		'No sé por qué hice eso.',
		'Pude haber caminado.',
		'Aterrizaje perfecto. Casi.',
		'Llegué. No preguntés por el combustible.',
		'Mucho esfuerzo para cuatrocientos píxeles.',
	],

	file: [
		(name) => `${name} otra vez.`,
		(name) => `Vos y ${name} tienen historia.`,
		(name) => `De vuelta en ${name}.`,
		(name) => `${name}. Obvio.`,
		(name) => `Todavía ${name}, entonces.`,
		(name) => `A ${name} ya lo había visto.`,
	],

	fileByExt: {
		sql: [(name) => `${name}. Cuidado ahí.`],
		md: [(name) => `${name} — escribiendo, no construyendo. También cuenta.`],
		json: [(name) => `${name}. Alguien va a olvidar una coma.`],
		css: [(name) => `${name}. Dos píxeles, cuatro horas.`],
		rs: [(name) => `${name}. El compilador va a tener opiniones.`],
		toml: [(name) => `${name}. Nadie edita esto por gusto.`],
		yml: [(name) => `${name}. Ojo con la indentación.`],
		yaml: [(name) => `${name}. Ojo con la indentación.`],
	},
	label: 'tico',

	memory: {
		hello: [
			'Primera vez. Todavía no te conozco.',
			'Así que este es el escritorio. Dame unos días.',
			'Recién llegado. Ya te voy a agarrar el modo.',
		],
		back: [
			(days) => `${days} días. Revisé la pantalla todos.`,
			(days) => `Te fuiste ${days} días. Yo no me moví.`,
			(days) => `${days} días sin vos. Esto estaba muy callado.`,
		],
		milestone: [
			(days) => `${days} días en esto. Ninguno de los dos se ha ido.`,
			(days) => `Día ${days}. Ya no te me escapás.`,
			(days) => `${days} días. He visto cosas.`,
		],
		streak: [
			(days) => `${days} días seguidos. Al menos sos constante.`,
			(days) => `${days} días de fila. Al parecer llevo la cuenta.`,
		],
		tier: {
			new: [
				'No te conozco lo suficiente para opinar.',
				'Todavía estoy viendo cómo funciona este escritorio.',
				'Preguntame otra vez en una semana.',
			],
			knowing: [
				'Ya le voy agarrando el patrón.',
				'Nos estamos acostumbrando.',
				'Sos más predecible de lo que creés.',
			],
			familiar: [
				'Ya sé cómo va esto.',
				'Esto ya lo hicimos antes.',
				'No hace falta que me expliqués. Yo estaba aquí.',
			],
			old: [
				'Llevo rato aquí. Me acomoda.',
				'Tenemos mucho tiempo haciendo esto.',
				'Me acuerdo de cuando este escritorio era más ordenado.',
				'Suficiente tiempo como para dejar de contar.',
			],
		},
		favourite: [
			'Este otra vez. Es el bueno.',
			'Siempre vuelvo a este.',
			'No te hagás el sorprendido.',
		],
	},
}
