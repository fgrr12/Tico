/**
 * The experiment: does a model *choosing* a line beat drawing one at random?
 *
 * Six attempts at having a model *write* his voice are recorded in PLAN.md and
 * all six failed, in all four model families, for the same reason — turning
 * domain jargon into idiomatic Costa Rican Spanish is the hard part, and a human
 * already did it correctly in `copy/es.ts`. This asks a different question, and
 * it is the only one that survives that finding: the model never writes a word.
 * It reads the moment, reads the lines a person wrote, and returns an index.
 * Register cannot break, because nothing is generated.
 *
 * What it is measured against is not "is the line good" — every line in the pool
 * was written by hand and they are all good. It is measured against the thing
 * that ships today: `pick()`, a uniform draw over the same pool. The claim on
 * trial is that a line *chosen for this moment* reads as more alive than a line
 * that merely fits the feeling. That is the gap PLAN.md names — a distribution
 * is varied, not alive — and it is the only gap a model is plausibly the answer
 * to.
 *
 * ── The criterion, written down before the run ──────────────────────────────
 *
 * Two gates. The first costs nothing but electricity and runs first, so a model
 * that cannot do the job never wastes an afternoon of somebody's attention.
 *
 * GATE 1 — mechanical. All four, or it is dead:
 *   · it returns a usable index               ≥ 98% of calls
 *   · median latency                          ≤ 1.5s
 *   · it has not collapsed onto one line      ≥ 15 distinct picks over 60 moments
 *   · it is reading, not counting             ≥ 70% same line under two list orders
 *
 * The last two are the ones worth explaining. A chooser that always answers "1"
 * passes every naive check — it is valid, it is fast, it is perfectly stable —
 * and it is a constant wearing a decision. The same failure was checked for in
 * `danceStyle`'s hash for the same reason, and the same reason again: the last
 * thing asked to choose between options collapsed onto one of them. And the
 * fourth asks the same question twice with the list in two different orders,
 * because that is the only version of "is it stable" that a shuffled list does
 * not answer for free.
 *
 * GATE 2 — blind A/B against `pick()`. One line from each arm, shuffled, and
 * the moment above them. The model has to be preferred on
 *
 *   ≥ 65% of at least 60 moments, with "neither" counting against it.
 *
 * 39 of 60. Under the null — the model is no better than the draw — that lands
 * by luck about eight times in a thousand, so clearing it means something. And
 * below it the margin is too thin to buy what it costs: reqwest, a provider, a
 * health check, a graceful no-model path, and the end of tico being a
 * self-contained 10 MB app with no runtime dependency on anything.
 *
 * Between 55% and 65% is the interesting death. It says the idea works and this
 * model is not the one — worth *one* retry with a different prompt or a bigger
 * model, not a second weekend.
 *
 *   node scripts/pick.mjs gate1     # mechanical, no human needed
 *   node scripts/pick.mjs ab        # the blind A/B, ~15 minutes of attention
 *   node scripts/pick.mjs report    # re-read the verdict from a finished run
 *
 * Nothing here touches the app. No Rust, no Tauri, no dependency, no import
 * from this file anywhere in `src/`. If both gates pass, *then* there is a
 * conversation about wiring it in. If either fails, this file is the record of
 * why, and it is one deletion.
 *
 * ── What happened · qwen2.5:3b, 2026-08-20 ─────────────────────────────────
 *
 * DEAD at gate 1. It never reached the A/B. But the shape of the failure moved
 * twice while it was being measured, and both moves are the record.
 *
 * **First it was measured wrong, twice.** The stability gate originally asked
 * the same question with the list in the same order — guaranteed at temperature
 * zero, so it scored 100% and meant nothing. And the pool is built `idle` first
 * with the feeling's lines last, so a model that prefers the top of a numbered
 * list never sees them: the median chosen position was 2 out of 52. Both were
 * bugs in the exam. Fixing them did not rescue the model, it made the failure
 * honest, which is the only reason the rest of this is worth writing down.
 *
 * **Then the list length turned out to be most of it.** Asked to choose one of
 * fifty-two, reshuffling changed its answer essentially every time — a draw with
 * a second of latency attached. Asked to choose one of eight, it holds an answer
 * through a reshuffle about twice as often as guessing. Same model, same lines,
 * smaller question. Which is why `shortlist` exists and why the first verdict
 * here — "the model *is* `pick()`" — was too strong and has been corrected.
 *
 * Where it ended up, 60 moments, 8 candidates:
 *
 *   ✓ returns a usable index    100%
 *   ✓ median latency           374ms
 *   ✓ distinct lines              35
 *   ✗ same line, two orders      25%   (chance is 13%, the bar is 70%)
 *
 *   picked from the feeling's own lines: 38%, and chance is 50%
 *
 * Twice chance is a real signal and it is nowhere near enough. Something that
 * changes its mind on three moments in four when only the *order* changed is not
 * reading the moment, it is glancing at it. And the second number is the one
 * that settles it: half the candidates are the lines written for this exact
 * moment, and it picks them *less often than a coin would*.
 *
 * Two variants were tried before calling it, over 20 moments each:
 *
 * | | same line | from the feeling |
 * | --- | --- | --- |
 * | 8 candidates | 45% | 45% |
 * | + a long, exact persona and explicit rules | 45% | 55% |
 * | + told outright which feeling he is in | 55% | 80% |
 *
 * **A richer description of who he is bought nothing measurable.** That was the
 * obvious lever and it is the wrong one; the task is not "know tico", it is
 * "read eight Spanish sentences and compare them to five facts", and no amount
 * of character sheet helps with that.
 *
 * The last row is the one that closes the question. Hand it the feeling and it
 * follows the feeling — which is the ladder's answer, computed deterministically
 * in `feelingFrom` in about a microsecond, being read back to us for 374ms and
 * 1.8 GB. What is left for a model *after* the ladder has chosen is picking
 * among four lines already known to fit, and that job is too small to be worth a
 * runtime dependency even if it were done well.
 *
 * Not retried at 7B: PLAN.md already measured 3B against 7B on the neighbouring
 * task and found more latency and no more skill, and 7B at Q4 is over the 4 GB
 * ceiling this was asked to fit inside.
 */

import { createInterface } from 'node:readline/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
	companionCopy,
	energyAt,
	familiarityFrom,
	feelingFrom,
	matchApp,
	timeOfDay,
} from '../src/data/companion.ts'

const OLLAMA = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
const RESULTS = new URL('../pick-results.json', import.meta.url)

/** His constraint, not a suggestion: whatever this runs on has to fit in it. */
const RAM_CEILING = 4 * 1024 ** 3

/*
 * `distinct` is a share of the moments rather than a count, so a six-moment
 * smoke run is not judged against a sixty-moment bar. It is a collapse
 * detector and nothing more: a *chooser* is supposed to repeat itself, since
 * the same kind of moment comes round four or five times in sixty and giving
 * it the same line is the correct answer. A uniform draw would spread over
 * about forty. One line for everything is the failure being watched for.
 */
const GATE1 = { valid: 0.98, latency: 1_500, distinct: 0.25, stable: 0.7 }
const GATE2 = { moments: 60, win: 0.65 }

const argv = process.argv.slice(2)
const command = argv[0] ?? 'gate1'
const flag = (name, fallback) => {
	const at = argv.indexOf(`--${name}`)
	return at === -1 ? fallback : argv[at + 1]
}

const language = flag('lang', 'es')
const count = Number(flag('n', GATE2.moments))
const copy = companionCopy[language]

// ── the moments ─────────────────────────────────────────────────────────────

const SEED = Number(flag('seed', 20260820))

const stream = (from) => {
	let state = from >>> 0
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0
		return state / 2 ** 32
	}
}

/** Shuffling and the draw. Nothing that decides *which moment* comes up. */
const random = stream(SEED ^ 0x5f37)

const APPS = [
	'Visual Studio Code',
	'Terminal',
	'Slack',
	'Spotify',
	'zoom.us',
	'Brave Browser',
	'Finder',
	'Docker Desktop',
	'Figma',
	'Mail',
]

/*
 * One per feeling, so the exam is not ninety per cent `content` — which is what
 * an hour of a real afternoon would have been, and which would have measured
 * almost nothing. Each is the *signal* the ladder reads, never the feeling
 * itself: the model is given the facts and has to do its own work.
 */
const ARCHETYPES = [
	{ drags: 4 },
	{ feared: true, app: 'zoom.us' },
	{ neglect: 11 },
	{ attention: 0.92 },
	{ attention: 0.62 },
	{ newApp: true },
	{ hour: 2 },
	{ music: true, app: 'Spotify', hour: 16 },
	{ neglect: 4 },
	{ dwell: 3 },
	{ app: 'Terminal' },
	{ switches: 9 },
	{},
]

/**
 * Moment `n` is always the same moment.
 *
 * Its randomness is seeded from the index rather than drawn off a running
 * stream, and that is not tidiness — the stability gate asks the model about
 * moment 3 twice and compares the two answers. Off a shared stream the second
 * "moment 3" is a different moment, the two answers disagree for the most
 * ordinary reason there is, and the gate reports that the model is sampling.
 * It also makes gate 1 and the A/B the same exam, and a run last week
 * comparable to one today.
 */
const moment = (index) => {
	const draw = ((next) => (items) => items[Math.floor(next() * items.length)])(
		stream(SEED + index * 2_654_435_761)
	)

	const shape = ARCHETYPES[index % ARCHETYPES.length]
	const hour = shape.hour ?? draw([8, 10, 11, 14, 16, 19, 21, 23])
	const name = shape.app ?? draw(APPS)
	const days = draw([1, 3, 6, 12, 20, 45, 90, 200])

	const seen = {
		neglect: 0,
		attention: 0,
		dwell: 0,
		switches: 0,
		drags: 0,
		newApp: false,
		feared: false,
		music: false,
		appKey: matchApp(name),
		energy: energyAt(hour),
		hour,
		...shape,
	}

	return { seen, hour, name, days, feeling: feelingFrom(seen) }
}

/** What he can actually see, said plainly. Nothing here he does not have. */
const describe = ({ seen, hour, name, days }) => {
	const facts = [`the clock says ${String(hour).padStart(2, '0')}:00`, `the window in front of him is ${name}`]

	if (seen.newApp) facts.push('he has not seen that application yet today')
	if (seen.feared) facts.push('it appeared suddenly and it is one he dislikes')
	if (seen.drags > 0) facts.push(`he has been picked up and dropped ${seen.drags} times in two minutes`)
	if (seen.neglect > 0) facts.push(`the cursor has not moved for ${seen.neglect} minutes`)
	if (seen.attention > 0.85) facts.push('he has been petted a great deal in the last few minutes')
	else if (seen.attention > 0.5) facts.push('he was petted a moment ago')
	if (seen.dwell >= 1) facts.push(`the same application has been in front for ${seen.dwell} hours`)
	if (seen.switches > 0) facts.push(`the front application changed ${seen.switches} times in two minutes`)
	if (seen.music) facts.push('music is playing')
	facts.push(`he has been on this desk for ${days} days`)

	return facts.map((fact) => `- ${fact}`).join('\n')
}

/**
 * The pool, built exactly the way `Companion.tsx` builds it — imported rather
 * than reproduced wherever that was possible, because an experiment run against
 * a pool the app does not use measures nothing.
 *
 * The doubled feeling lines are a weighting trick that only means anything to a
 * random draw, so the chooser is shown the set once. That is not a thumb on the
 * scale: it is the same lines, and the draw keeps its weighting.
 */
const poolFor = ({ hour, feeling, days }) => {
	const timed = copy.hours[timeOfDay(hour)].map((line) => line(hour))
	const known = copy.memory.tier[familiarityFrom(days)]
	const felt = copy.feelings[feeling]
	return {
		weighted: [...copy.idle, ...timed, ...known, ...felt, ...felt],
		unique: [...copy.idle, ...timed, ...known, ...felt],
	}
}

/** Deterministic shuffle. Same list, same salt, same order — every time. */
const shuffle = (items, salt) => {
	const next = stream(SEED + salt * 7_919 + 1)
	const out = items.slice()
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(next() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

/**
 * Eight lines, not fifty-two — four from the feeling's own set and four from
 * everywhere else in the pool.
 *
 * **The list length turned out to be the whole experiment, and the first version
 * of this file got it wrong.** Asked to choose one of fifty-two, the model
 * answers barely above chance and reordering the list changes its answer almost
 * every time. Asked to choose one of eight, it holds the same answer through a
 * reshuffle roughly three and a half times as often as guessing would. It is the
 * same model and the same lines; only the size of the question changed.
 *
 * Shortlisting is also free and honest to what would ship: the ladder has
 * already decided the feeling, so narrowing to a handful of candidates is one
 * `slice` and costs nothing. Handing a 3B fifty-two options was the mistake, not
 * the idea.
 */
const CANDIDATES = 8

const shortlist = (one, salt) => {
	const felt = copy.feelings[one.feeling]
	const rest = poolFor(one).unique.filter((line) => !felt.includes(line))
	return [
		...shuffle(felt, salt + 101).slice(0, CANDIDATES / 2),
		...shuffle(rest, salt + 202).slice(0, CANDIDATES / 2),
	]
}

// ── the model ───────────────────────────────────────────────────────────────

const ollama = async (path, body) => {
	const response = await fetch(`${OLLAMA}${path}`, {
		method: body ? 'POST' : 'GET',
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	})
	if (!response.ok) throw new Error(`ollama ${path} → ${response.status} ${await response.text()}`)
	return response.json()
}

/**
 * Whatever is installed and fits, smallest first. The size filter is the user's
 * ceiling and it is enforced rather than documented — a model that swaps to disk
 * is not a pet that speaks late, it is a desktop that stutters.
 */
const chooseModel = async () => {
	const named = flag('model', null)
	const { models } = await ollama('/api/tags')

	if (named) {
		const found = models.find((one) => one.name === named || one.model === named)
		if (!found) throw new Error(`${named} is not installed — ollama pull ${named}`)
		return found
	}

	const fits = models
		.filter((one) => one.size <= RAM_CEILING)
		.sort((a, b) => a.size - b.size)

	if (fits.length === 0) {
		throw new Error(
			models.length === 0
				? 'ollama has no models — ollama pull qwen2.5:3b'
				: `nothing installed fits in ${RAM_CEILING / 1024 ** 3} GB`
		)
	}

	// qwen2.5:3b is the measured winner in PLAN.md — 9/10 on intent at 0.66s —
	// so it wins the tie rather than whatever happens to be smallest.
	return fits.find((one) => one.name.startsWith('qwen2.5:3b')) ?? fits[0]
}

const PERSONA = `tico is a small machine that lives along the bottom edge of a computer screen.
He walks, he watches which application is in front, and now and then he says one short line.
He is deadpan, a little dry, never cheerful, and he was born in a terminal.
He talks about the moment — the hour, the application, the music, himself — never about the person's work.`

/**
 * The list is shuffled per call, and `salt` is what makes it shuffle differently
 * for the same moment.
 *
 * **This is the whole reason the first version of this file measured a lie.**
 * The pool is built in a fixed order — idle, then the hour, then the tier, then
 * the feeling's own lines last — so a model with any preference for the top of a
 * numbered list picks an `idle` line every time and never sees the lines written
 * for the moment. The first run looked like a near-collapse onto ten lines with
 * perfect stability; the stability was the *position* being stable, not the
 * model. Median chosen position was 2 out of 52.
 *
 * Shuffling is not making the exam easier. It is removing a confound the exam
 * itself introduced, and it is the same rule as the A/B not printing which arm
 * is on top.
 */
const ask = async (model, one, salt = 0, pick = 0) => {
	// `pick` picks the candidates and `salt` picks their order, so asking the
	// same moment twice with two different salts is the same eight lines in two
	// orders — the same question, asked twice. Sharing one number would reshuffle
	// the shortlist too, and the repeat would be measuring a different question.
	const lines = shuffle(shortlist(one, pick), salt)

	const numbered = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')

	/*
	 * English instructions around Spanish lines, deliberately. The model is only
	 * ever asked to *read* Spanish, which all four families did competently — it
	 * is writing it that broke every one of them. Nothing it returns is text.
	 */
	const prompt = `${PERSONA}

Right now:
${describe(one)}

Below are the lines he could say. They were all written for him, so they all
sound like him — your job is only to choose the one that fits *this* moment
best. Prefer the line that would only make sense right now over one that would
make sense any time.

${numbered}

Answer with the number of the line.`

	const at = Date.now()
	const response = await ollama('/api/chat', {
		model: model.name,
		stream: false,
		messages: [{ role: 'user', content: prompt }],
		format: {
			type: 'object',
			properties: { pick: { type: 'integer' } },
			required: ['pick'],
		},
		options: { temperature: 0 },
	})
	const ms = Date.now() - at

	let index = null
	try {
		const { pick } = JSON.parse(response.message.content)
		if (Number.isInteger(pick) && pick >= 1 && pick <= lines.length) index = pick - 1
	} catch {
		// An unparseable answer is dropped, exactly as AD-2 says it should be. Here
		// it is also a number: the valid-answer rate is the first gate.
	}

	// How many of the candidates were the feeling's own lines — the chance rate
	// for the relevance number below, which is 4 of 8 by construction but is
	// counted rather than assumed.
	const felt = lines.filter((line) => copy.feelings[one.feeling].includes(line)).length

	return { index, line: index === null ? null : lines[index], ms, of: lines.length, felt }
}

const p95 = (sorted) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]

// ── gate 1 ──────────────────────────────────────────────────────────────────

const gate1 = async (model) => {
	console.log(`\ngate 1 — ${model.name}, ${(model.size / 1024 ** 3).toFixed(1)} GB, ${count} moments\n`)

	const answers = []
	for (let index = 0; index < count; index++) {
		const one = moment(index)
		const answer = await ask(model, one, index * 2 + 1, index)
		answers.push({ ...answer, feeling: one.feeling })
		process.stdout.write(`\r  ${index + 1}/${count}`)
	}

	/*
	 * The same moments again, with the list in a *different* order.
	 *
	 * Comparing the chosen line rather than the chosen number is the entire
	 * point. Asking twice with the same order measures whether the model is
	 * deterministic, which at temperature zero it is by construction — the first
	 * version of this scored 100% and the number meant nothing. Two different
	 * orders of the same lines is the same question asked twice, and something
	 * that is reading gives the same answer to it.
	 */
	const repeats = []
	for (let index = 0; index < Math.min(20, count); index++) {
		repeats.push((await ask(model, moment(index), index * 2 + 2, index)).line)
	}
	process.stdout.write('\r            \r')

	const valid = answers.filter((one) => one.index !== null)
	const latencies = answers.map((one) => one.ms).sort((a, b) => a - b)
	const agreed = repeats.filter((line, at) => line !== null && line === answers[at].line).length

	const results = {
		valid: valid.length / answers.length,
		latency: latencies[Math.floor(latencies.length / 2)],
		distinct: new Set(valid.map((one) => one.line)).size,
		stable: repeats.length === 0 ? 0 : agreed / repeats.length,
	}

	const want = { ...GATE1, distinct: Math.ceil(count * GATE1.distinct) }

	const rows = [
		['returns a usable index', `${(results.valid * 100).toFixed(0)}%`, `≥ ${GATE1.valid * 100}%`, results.valid >= GATE1.valid],
		['median latency', `${results.latency}ms`, `≤ ${GATE1.latency}ms`, results.latency <= GATE1.latency],
		['distinct lines chosen', `${results.distinct}`, `≥ ${want.distinct}`, results.distinct >= want.distinct],
		['same line, two orders', `${(results.stable * 100).toFixed(0)}%`, `≥ ${GATE1.stable * 100}%`, results.stable >= GATE1.stable],
	]

	for (const [name, got, want, ok] of rows) {
		console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(24)} ${got.padStart(8)}   (${want})`)
	}

	/*
	 * Not a gate, and the most useful number on the page.
	 *
	 * The pool is already correct by construction, so landing in the feeling's own
	 * lines proves nothing on its own — but the feeling's lines are a known share
	 * of the pool, so there is a chance baseline to read it against. Above it, the
	 * model is tracking the moment. At it, the model is a draw. Below it, the
	 * model is tracking something and it is not the moment.
	 */
	const felt = valid.filter((one) => copy.feelings[one.feeling].includes(one.line)).length
	const chance =
		answers.reduce((total, one) => total + one.felt / one.of, 0) / Math.max(1, answers.length)
	console.log(
		`\n  picked from the feeling's own lines: ${((felt / Math.max(1, valid.length)) * 100).toFixed(0)}%` +
			`  (chance is ${(chance * 100).toFixed(0)}%)`
	)
	console.log(`  p95 latency: ${p95(latencies)}ms`)

	const passed = rows.every(([, , , ok]) => ok)
	console.log(passed ? '\ngate 1 passed — run the A/B\n' : '\nVERDICT: DEAD at gate 1\n')
	return passed
}

// ── gate 2 ──────────────────────────────────────────────────────────────────

const ab = async (model) => {
	console.log(`\ngate 2 — ${model.name}, ${count} moments. Asking it everything first.\n`)

	const rounds = []
	for (let index = 0; index < count; index++) {
		const one = moment(index)
		const { weighted } = poolFor(one)
		const answer = await ask(model, one, index * 2 + 1, index)
		process.stdout.write(`\r  ${index + 1}/${count}`)
		if (answer.line === null) continue

		// The draw is the incumbent and keeps its weighting. A moment where both
		// arms land on the same line measures nothing, so it is redrawn — and if
		// the draw cannot avoid it, the moment is dropped rather than shown.
		let drawn = answer.line
		for (let tries = 0; tries < 8 && drawn === answer.line; tries++) {
			drawn = weighted[Math.floor(random() * weighted.length)]
		}
		if (drawn === answer.line) continue

		rounds.push({ moment: one, model: answer.line, drawn, ms: answer.ms })
	}
	process.stdout.write('\r            \r')

	const io = createInterface({ input: process.stdin, output: process.stdout })
	const answers = []

	console.log(`${rounds.length} moments. 1 or 2 for the line that fits better, = for neither, q to stop.\n`)

	for (const [at, round] of rounds.entries()) {
		// Blind: which arm is on top is a coin flip, and it is not printed.
		const modelFirst = random() < 0.5
		const [first, second] = modelFirst
			? [round.model, round.drawn]
			: [round.drawn, round.model]

		console.log(`\n── ${at + 1}/${rounds.length} ──`)
		console.log(describe(round.moment))
		console.log(`\n  1. ${first}`)
		console.log(`  2. ${second}\n`)

		const said = (await io.question('  > ')).trim().toLowerCase()
		if (said === 'q') break

		const chose = said === '1' ? (modelFirst ? 'model' : 'draw') : said === '2' ? (modelFirst ? 'draw' : 'model') : 'neither'
		answers.push({ ...round, chose })

		// Written as they come in, so quitting halfway keeps the afternoon.
		writeFileSync(RESULTS, JSON.stringify({ model: model.name, language, seed: SEED, answers }, null, '\t'))
	}

	io.close()
	report()
}

const report = () => {
	if (!existsSync(RESULTS)) {
		console.log('\nno run to report — node scripts/pick.mjs ab\n')
		return
	}

	const { model, answers } = JSON.parse(readFileSync(RESULTS, 'utf8'))
	const wins = answers.filter((one) => one.chose === 'model').length
	const draws = answers.filter((one) => one.chose === 'draw').length
	const neither = answers.filter((one) => one.chose === 'neither').length
	const rate = answers.length === 0 ? 0 : wins / answers.length

	console.log(`\n${model}, ${answers.length} moments`)
	console.log(`  model  ${wins}`)
	console.log(`  draw   ${draws}`)
	console.log(`  neither ${neither}   (counted against the model)`)
	console.log(`\n  ${(rate * 100).toFixed(0)}%, and the bar is ${GATE2.win * 100}% over ${GATE2.moments}`)

	if (answers.length < GATE2.moments) {
		console.log(`\nINCOMPLETE — ${GATE2.moments - answers.length} more moments before this means anything\n`)
	} else if (rate >= GATE2.win) {
		console.log('\nVERDICT: ALIVE. Now argue about what it costs to wire in.\n')
	} else if (rate >= 0.55) {
		console.log('\nVERDICT: DEAD, but the interesting death — the idea works and this')
		console.log('model is not the one. One retry with a different prompt. Not two.\n')
	} else {
		console.log('\nVERDICT: DEAD. A chooser nobody can pick out of a lineup with the')
		console.log('random draw is not worth a runtime dependency.\n')
	}
}

// ── go ──────────────────────────────────────────────────────────────────────

try {
	if (command === 'report') {
		report()
	} else {
		const model = await chooseModel()
		if (command === 'gate1') await gate1(model)
		else if (command === 'ab') await ab(model)
		else console.log('\nnode scripts/pick.mjs gate1 | ab | report\n')
	}
} catch (error) {
	console.log(`\n${error.message}\n`)
	process.exit(1)
}
