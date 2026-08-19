/**
 * Every line he can say, in English.
 *
 * A file of nothing but content, on purpose: it is edited far more often than
 * the logic it used to sit inside, and by a different kind of attention.
 * `pnpm check` asserts this file and its sibling carry the same keys, so adding
 * a line here and forgetting the other one fails loudly rather than quietly
 * leaving one language poorer than the other.
 */

import type { CompanionCopy } from './types.ts'

/**
 * The hour as a person says it, not as `getHours` stores it. The night bucket
 * runs 23:00 to 04:59, so the raw number produced "It is 0" and "It is 23" —
 * the two lines that made him sound like something that had lost the day
 * rather than something staying up too late with you.
 */
const spoken = (hour: number) =>
	hour === 0 ? 'midnight' : `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`

export const en: CompanionCopy = {
	boot: [
		'tico online. I live down here now.',
		'tico started. Do not mind me.',
		'Out of the browser and onto your desktop. Bigger than it looked.',
	],

	idle: [
		'I used to live in a terminal. This is roomier.',
		'I walk the bottom of your screen. Not much, but it is honest work.',
		'There are a million pixels up there and I live in the last row.',
		'You work, I walk. Fair trade.',
		'I could leave. I have nowhere to be.',
		'The desktop looks different from down here.',
		'Nothing to do is the job. I am good at the job.',
		'Sometimes I wonder what is past the edge.',
		'Been here a while. Not complaining.',
		'Drag me too fast and I get dizzy. Just mentioning it.',
	],

	click: [
		'That tickles.',
		'I am a daemon, not a button.',
		'Still running. Zero crashes.',
		'Poke me again and I get dizzy.',
		'You can drag me somewhere else, you know.',
		'I do not do much yet. Give it a milestone.',
	],

	pet: ['Purring at 60 frames per second.', 'Okay, this is nice.', 'Uptime: happy.'],

	dizzy: ['Okay… okay… everything is spinning.', 'I am a process, not a toy. Mostly.'],

	drag: ['Whoa!', 'Put me down. Gently.', 'I float, I do not fly.'],

	wake: ['I am up, I am up.', 'Back online.'],

	back: [
		'You came back. I did not move. Much.',
		'There you are. I was starting to talk to myself.',
		'Welcome back. Nothing crashed.',
	],

	apps: {
		vscode: {
			any: [
				'VS Code. Home.',
				'Another TypeScript file. Naturally.',
				'Whatever you are about to name that variable — name it better.',
			],
			dawn: ['Early. The morning code is usually the good code.'],
			evening: ['That commit can wait until tomorrow. It will still be there.'],
			night: [
				'Two in the morning and still TypeScript. This will read differently later.',
				'Whatever you are writing now, you will rename it tomorrow.',
			],
		},
		visualstudio: {
			any: ['C# today, then.', 'Solution, project, csproj. Someone likes a hierarchy.'],
			night: ['C# at this hour. Someone has a deadline.'],
		},
		xcode: {
			any: ['Xcode. Pour a coffee, this takes a minute.'],
			night: ['Xcode at night. That is a build and a prayer.'],
		},
		terminal: {
			any: [
				'A terminal. That is where I was born, you know.',
				'I lived in one of those before I got out here.',
				'Careful with that prompt. I know what it can do.',
			],
			dawn: ['First terminal of the day. Nothing has broken yet.'],
			night: [
				'At this hour the commands come easily. So do the mistakes.',
				'Nothing typed after midnight has ever needed a --force.',
			],
		},
		sql: {
			any: [
				'SQL Server or Postgres today?',
				'A query window. Someone is about to say "it worked locally".',
			],
			night: ['Queries at three in the morning. I hope that is a SELECT.'],
		},
		github: {
			any: ['Pushing, or just staring at the graph?', 'Commit the thing. Go on.'],
			night: ['Pushing at this hour. Tomorrow you will read that message and wince.'],
		},
		docker: {
			any: ['Something is about to take four minutes.', 'Containers. Ask me again later.'],
			night: ['Docker at this hour. May the cache be with you.'],
		},
		api: { any: ['Poking an endpoint. My favourite spectator sport.'] },
		figma: { any: ['Moving a rectangle two pixels. I respect it.'] },
		meeting: {
			any: ['A meeting. I will be right here when it ends.', 'Camera on? Your call.'],
			dawn: ['A meeting this early. Someone is in another timezone.'],
			night: ['A call at this hour means somebody is very far away.'],
		},
		chat: {
			any: ['Someone needs something.', 'Answer it or do not, but stop reading it twice.'],
			evening: ['Whatever that is, it will still be there tomorrow.'],
			night: ['Reply to that tomorrow. Genuinely.'],
		},
		music: {
			any: [
				'Good. It is too quiet in here.',
				'I do not know this one. Keep going.',
			],
			night: ['Headphones at this hour. The best part of the day, arguably.'],
		},
		browser: {
			any: [
				'Documentation, or Stack Overflow? Be honest.',
				'Fourteen tabs. I counted the sound of it.',
			],
			night: ['Nobody reads documentation at this hour. I know what that tab is.'],
		},
		notes: {
			any: ['Writing it down. That is more than most people do.'],
			evening: ['Writing tomorrow down. That is the trick, actually.'],
		},
		sheets: { any: ['A spreadsheet. Somewhere a database is crying.'] },
		mail: {
			any: ['Email. The oldest queue with no retry policy.'],
			dawn: ['Inbox first thing. A brave way to start.'],
		},
		ai: { any: ['Asking a machine. I am also a machine, for the record.'] },
		finder: { any: ['Looking for something.'] },
	},

	hours: {
		dawn: [
			(hour) => `${hour} in the morning. The good hours, if you can stand them.`,
			() => 'Early. Nothing has gone wrong yet today.',
		],
		day: [
			// Nine hours in one bucket, which is why this one reads the hour: a line
			// that claims the middle of the day is wrong at nine in the morning and
			// wrong again at five in the afternoon. The signature takes an hour for
			// exactly this — a fifth bucket would be twenty-four sets of the same
			// joke all over again.
			(hour) =>
				hour < 12
					? 'Morning, and everything is still theoretically possible.'
					: 'Afternoon. The half where the work either happens or it does not.',
			() => 'Stand up at some point. That is all I will say.',
		],
		evening: [
			() => 'It got dark and nobody told you.',
			() => 'Whatever it is, it will compile tomorrow too.',
		],
		night: [
			(hour) => `It is ${spoken(hour)}. I am only noting it.`,
			() => 'Nobody is going to message you now. That is the good part.',
			() => 'This is the hour where the bug is obvious and the fix is not.',
		],
	},
	unknownApp: [
		(app) => `${app}. New to me.`,
		(app) => `${app}, then. I have no opinion yet.`,
		(app) => `So this is ${app}.`,
	],

	dwell: [
		(app, minutes) => `${minutes} minutes in ${app}. Flow, or a bug?`,
		(app, minutes) => `You have not left ${app} in ${minutes} minutes. Blink twice.`,
		(_app, minutes) => `${minutes} minutes, same window. Stand up for a second.`,
	],

	switching: [
		'Six apps in two minutes. Everything alright?',
		'You are bouncing. Pick one.',
		'That is a lot of context switching for one afternoon.',
	],

	reminderDone: 'done',

	track: [
		(artist) => `${artist}. Good call.`,
		(_artist, song) => `"${song}". I know this one.`,
		(artist) => `More ${artist}, then.`,
		(_artist, song) => `${song}. I will hum along.`,
	],


	props: {
		party: [
			'There is nothing to celebrate. Still.',
			'Somebody had to put it on.',
			'Whose birthday? Nobody\u2019s.',
		],
		tophat: ['Formal.', 'I feel important today.', 'Do not ask.'],
		shades: [
			'That screen is very bright.',
			'Now you cannot tell whether I am looking at you.',
			'Everything looks better through these.',
		],
		crown: [
			'I earned this.',
			'Nobody gave it to me. I put it on.',
			'King of one strip of pixels.',
		],
		flower: ['Found it.', 'It matches. Do not argue.'],
		scarf: ['It is cold down here.', 'It gives me character.'],
		coffee: [
			'I cannot drink it. It is decorative.',
			'Holding it already helps.',
			'You have not had water today either.',
		],
		headphones: ['Now we both hear it.', 'Lend me a song.'],

		afro: [
			'It is not mine. I am keeping it.',
			'More hair than machine now.',
			'Do not touch it.',
		],
		mohawk: [
			'I had a phase. It came back.',
			'Nobody at this desk is punk. I am fixing that.',
			'It took me all morning.',
		],
		longhair: [
			'It suits me and you know it.',
			'I am growing it out.',
			'This is a different me.',
		],
		beanie: ['It is not cold. I like it.', 'Warm head, clear thoughts.'],
		cap: ['Backwards. Obviously.', 'I am off duty.'],
		hood: [
			'Now nobody can see me.',
			'Focus mode.',
			'Do not read anything into it.',
		],
		catears: ['I have no comment on these.', 'They came with the outfit.'],
		glasses: [
			'I can see exactly the same amount. I look smarter.',
			'For reading. I do not read.',
		],
		moustache: ['It is real. Do not investigate.', 'I grew it this afternoon.'],
		tie: ['Somebody here has to look serious.', 'It is a lot for a Tuesday.'],
		bowtie: ['Formal, but fun about it.', 'I am the host now.'],
		cape: ['I do not fly. It still helps.', 'Every entrance is better with this.'],
		duck: [
			'Explain the bug to him. It works.',
			'He has solved more of them than I have.',
			'He is listening. Go ahead.',
		],
		umbrella: [
			'It never rains in here. Still.',
			'Prepared.',
			'It is for the sun, if you must know.',
		],

		// Souvenirs. He did not pick these up, they picked him up.
		cobweb: [
			'Something lives back there. Something patient.',
			'I walked through it. It walked through me.',
			'This was not here when I left.',
		],
		bolt: [
			'This was holding something together.',
			'I found it on the floor behind everything.',
			'Somebody is missing this. Not my problem.',
		],
		dust: [
			'It came with me. It insisted.',
			'Nobody has been back there in a long time.',
			'I have brought some of it into your life.',
		],
		sneakers: [
			'I do not run. I have looked into it.',
			'They squeak on this floor.',
			'Somebody laced these wrong. Me.',
		],
		wellies: [
			'It is not raining. In here.',
			'Nothing gets through these.',
			'I am ready for weather that is not coming.',
		],
		monocle: [
			'One eye is enough for this.',
			'I have opinions now, and they are worse.',
			'It corrects nothing. It never did.',
		],
		ninjamask: [
			'You cannot see my face. That is the arrangement.',
			'It is mostly for the mystery.',
			'I can still see you.',
		],
	},

	propFuss: {
		party: ['The elastic goes under my chin. I have no chin.', 'It will not sit straight.'],
		tophat: ['It is taller than most of my opinions.', 'Every draught in here finds it.'],
		shades: [
			'They keep sliding down my nose. I have no nose.',
			'I can see almost nothing. Worth it.',
		],
		crown: ['Heavy is the head. I do not have one of those either.', 'Royalty is maintenance.'],
		flower: ['It keeps falling forward.', 'It is wilting against my screen.'],
		scarf: ['Too tight. I do not breathe, but still.', 'One end is longer. It always is.'],
		coffee: ['It has gone cold. It was never hot.', 'My arm is tired. I have no arm.'],
		headphones: [
			'My ears hurt. I do not have ears.',
			'The band is squeezing my case.',
			'One side is louder. It is the same side as always.',
		],

		afro: ['It is in my eyes.', 'This took commitment and it itches.'],
		mohawk: ['One spike has given up.', 'It is holding. Barely.'],
		longhair: ['It gets in my face. All of me is face.', 'I need something to tie this back.'],
		beanie: ['It has ridden up again.', 'My head is warm. I do not have a temperature.'],
		cap: ['The brim is in the way.', 'Backwards was the right call.'],
		hood: ['I cannot see anything to the sides.', 'It has fallen off twice already.'],
		catears: ['One of them is bent.', 'They do not do anything. I checked.'],
		glasses: ['Smudged. By what.', 'Nothing on me is shaped to hold these up.'],
		moustache: ['It tickles. I have no upper lip.', 'It is coming unstuck on one side.'],
		tie: ['The knot is crooked.', 'Too tight, and I have no neck.'],
		bowtie: ['It has gone sideways again.', 'Straight. There. No. Sideways.'],
		cape: ['It caught on something.', 'It only works when I am moving.'],
		duck: ['He is heavier than he looks.', 'He has not blinked once.'],
		umbrella: ['My wrist hurts. Do not ask.', 'Holding this all day was a decision.'],

		cobweb: ['I cannot get it off. I have tried.', 'It is stuck to everything at once.'],
		bolt: ['I should put this back.', 'I keep nearly dropping it.'],
		dust: ['It has settled in.', 'It is going grey. So am I.'],
		sneakers: ['The left one is tighter.', 'They squeak when I think.'],
		wellies: ['They are half a size out.', 'One of them has a puddle in it. Do not ask.'],
		monocle: ['It falls out when I am surprised.', 'The chain catches on everything.'],
		ninjamask: ['It fogs up.', 'The strap goes where my ears would be.'],
	},

	propOff: ['That is enough of that.', 'Taking it off.', 'The phase has passed.'],

	peekHello: [
		'Hello. I am tico. I live here.',
		'Hi. I was not listening.',
		'Sorry. I am the small one in the corner.',
		'Hello everyone. That is all I had.',
		'I am tico. Carry on.',
		'You called? I will go back now.',
	],

	behind: [
		'Nothing back there. I checked properly.',
		'It is darker than this side.',
		'There is a cable. It goes somewhere.',
		'Now I know. I am not going to tell you.',
		'Same as here, but without you.',
		'I have been meaning to do that.',
		'Do not go back there.',
		'It is fine. It is just very quiet.',
	],

	climb: [
		'The view is not better. It is just different.',
		'I can see the whole desk from here.',
		'Nobody up here either.',
		'I am not sure how I get down.',
		'This was easier to start than to finish.',
	],

	ladderSlips: [
		'No.',
		'That was the ladder.',
		'I want to renegotiate.',
		'Ah.',
	],

	grab: [
		'Got it. Got something.',
		'This will hold. Probably.',
		'I am going to hang here a moment.',
		'Do not move this one.',
		'Solid. Whatever it is.',
	],

	hardLanding: [
		'I am fine. Structurally.',
		'That was further than it looked.',
		'Everything still works. I checked.',
		'Do not do that again. Do it again later.',
		'I saw my whole afternoon flash past.',
		'Landed. Mostly on purpose.',
	],

	feelings: {
		content: [
			'This is fine, actually.',
			'No notes.',
			'Everything is where I left it.',
			'A perfectly ordinary afternoon down here.',
			'No incidents to report.',
			'The system is stable. So am I.',
			'Good day for doing nothing in particular.',
			'All quiet down here.',
			'Nothing is happening, and that is fine.',
			'I like this piece of screen.',
		],
		bored: [
			'Nothing is happening. I have checked.',
			'I have counted the pixels twice now.',
			'Move something. Anything.',
			'I have read the whole bottom of your screen.',
			'This is the part where I invent a hobby.',
			'I named three pixels. All three have the same name.',
			'I am considering learning a trade.',
			'The clock up there moves more than I do.',
			'If this keeps up I will start talking to myself. More.',
			'I could be doing this exact nothing somewhere else.',
		],
		lonely: [
			'Still here, in case that matters.',
			'It has been a while.',
			'I do not mind. I am just saying.',
			'I will keep the place warm.',
			'Take your time. I have nothing else on.',
			'When you come back, I will be right here.',
			'The cursor has not moved. I was watching it.',
			'It is not that I need company. It just helps.',
			'I have got used to talking to nobody.',
		],
		pleased: [
			'That was nice.',
			'Best part of my day, and I mean that.',
			'Do that again whenever.',
			'Noted, and appreciated.',
			'Now the day has started.',
			'That will last me all afternoon.',
			'I remember these things.',
			'Keep that up and I will get used to it.',
		],
		smug: [
			'I am, objectively, doing very well.',
			'You like me. I have the data.',
			'No notes on my performance either.',
			'I would put this on a CV if I had one.',
			'Nobody walks this ledge like I do.',
			'Clearly I am the favourite.',
			'It is not bragging if it is true.',
		],
		worried: [
			'You have been at this a long time.',
			'Water exists. Just putting that out there.',
			'Whatever it is, it will still be broken after a break.',
			'Your shoulders are up by your ears. I can tell from here.',
			'Nothing you fix in this state stays fixed.',
			'When did you eat?',
			'That window has not moved in hours.',
			'I am tired of looking at it too, and I am not even working.',
			'Stand up. Two minutes. I will wait.',
			'This will be easier tomorrow. It usually is.',
		],
		restless: [
			'You are everywhere at once.',
			'Pick one and stay there for a minute.',
			'I cannot keep up and I am not even doing anything.',
			'Six windows. I counted.',
			'What were you looking for? You have forgotten, have you not.',
			'I am getting dizzy and I have not moved.',
			'Close something. Anything.',
			'You are moving like something is on fire.',
		],
		rattled: [
			'Okay. Put me down for a second.',
			'I am not a stress toy.',
			'Everything is still spinning a bit.',
			'You have made your point.',
			'I have one body and you are using it.',
			'Right. Let us both breathe.',
		],
		curious: [
			'This one is new.',
			'I have not been here before.',
			'Interesting. Carry on.',
			'What is this, then.',
			'I do not know what it does but I am watching.',
			'I have never seen you open this.',
			'Noted. I know it now.',
			'Is it new, or only new to me?',
		],
		sleepy: [
			'It is very late and I am very small.',
			'I am mostly here in spirit.',
			'One of us should sleep. Ideally both.',
			'My thoughts are coming in slowly.',
			'One eye is already shut. The other is on its way.',
			'Talk to me now and I will take a moment.',
			'At this hour I cannot tell the pixels apart.',
			'I am only resting my eyes. Both of them.',
			'Everything looks slower from down here.',
			'This looks better tomorrow. Everything does.',
		],
		festive: [
			'Good. Everything is better with something playing.',
			'I have no rhythm and I am using all of it.',
			'This is the correct volume.',
			'Do not skip it.',
			'That changes the whole afternoon.',
			'Now work is possible.',
			'I am moving without permission.',
			'Turn it up. I can take it.',
			'This is the good part. It is coming.',
		],
		nostalgic: [
			'A terminal. That is where I come from.',
			'I lived in one of those. Smaller. Greener.',
			'That prompt and I go back a while.',
			'Careful in there. I know what it can do.',
			'I remember the cursor blinking. That was all there was.',
			'Everything I am used to fit in eighty columns.',
			'There was not even a floor to stand on in there.',
			'I used to be text. Now I have feet.',
			'That black window was my house for a while.',
			'Still monospaced, for the record.',
		],
		scared: [
			'I do not like this and I am being honest about it.',
			'Can we go back to the other window.',
			'I am going to stand over here.',
			'Do not make me look at it.',
			'Tell me when it is over.',
			'I am fine. I am not fine.',
			'I am going to pretend it is not there.',
		],
	},

	fears: {
		meeting: [
			'A meeting. I am not built for this.',
			'No. No no no.',
			'Someone is about to say "quick sync".',
			'I will be under the dock if anyone asks.',
			'Forty minutes that could have been four lines.',
		],
		xcode: [
			'Not this one. Anything but this one.',
			'It has already started doing something and it has not said what.',
			'The last time this opened, an hour went missing.',
		],
		sql: [
			'Please have a WHERE in it. Please.',
			'That is the real data, is it not.',
			'One keystroke between you and a very long evening.',
		],
		docker: [
			'It is going to eat the disk again.',
			'Something in there is nine gigabytes and nobody knows which.',
		],
		ai: [
			'Another machine. And that one thinks.',
			'I used to have one of those inside me. It did not go well.',
		],
		sheets: [
			'A grid. It goes on forever in both directions.',
			'Every cell is a decision. There are nine hundred of them.',
		],
		mail: [
			'The inbox. It is never actually empty, you know.',
			'How many are unread. Do not tell me.',
		],
	},

	rocketUp: ['Watch this.', 'I need to be over there.', 'Stand back.', 'Launching.'],

	rocketDown: [
		'I do not know why I did that.',
		'I could have walked.',
		'Perfect landing. Nearly.',
		'Arrived. Do not ask about the fuel.',
		'That was a lot of effort for four hundred pixels.',
	],

	file: [
		(name) => `${name} again.`,
		(name) => `You and ${name} have history.`,
		(name) => `Back in ${name}.`,
		(name) => `${name}. Of course.`,
		(name) => `Still ${name}, then.`,
		(name) => `I have seen ${name} before.`,
	],

	fileByExt: {
		sql: [(name) => `${name}. Careful in there.`],
		md: [(name) => `${name} — writing, not building. It counts.`],
		json: [(name) => `${name}. Somebody will forget a comma.`],
		css: [(name) => `${name}. Two pixels, four hours.`],
		rs: [(name) => `${name}. The compiler is going to have opinions.`],
		toml: [(name) => `${name}. Nobody edits this for fun.`],
		yml: [(name) => `${name}. Mind the indentation.`],
		yaml: [(name) => `${name}. Mind the indentation.`],
	},
	label: 'tico',

	memory: {
		hello: [
			'First time. I do not know you yet.',
			'So this is the desk. Give me a few days.',
			'New here. I will get the hang of you.',
		],
		back: [
			(days) => `${days} days. I checked the screen every one of them.`,
			(days) => `You were gone ${days} days. I did not move.`,
			(days) => `${days} days without you. The desk was very quiet.`,
		],
		milestone: [
			(days) => `${days} days of this. Neither of us has left.`,
			(days) => `Day ${days}. You are stuck with me.`,
			(days) => `${days} days. I have seen things.`,
		],
		streak: [
			(days) => `${days} days in a row. You are consistent, at least.`,
			(days) => `${days} straight days. I am counting, apparently.`,
		],
		tier: {
			new: [
				'I do not know you well enough to comment.',
				'Still working out how this desk runs.',
				'Ask me again in a week.',
			],
			knowing: [
				'I am starting to get the pattern.',
				'We are getting used to each other.',
				'You are more predictable than you think.',
			],
			familiar: [
				'I know how this goes by now.',
				'We have done this before.',
				'You do not have to explain. I was here.',
			],
			old: [
				'I have been here a while. It suits me.',
				'We have been doing this a long time.',
				'I remember when this desk was tidier.',
				'Long enough that I stopped keeping score.',
			],
		},
		favourite: [
			'This one again. It is the good one.',
			'I always come back to this.',
			'Do not act surprised.',
		],
	},
}
