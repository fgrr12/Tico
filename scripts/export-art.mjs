import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

/**
 * Writes his drawing out as data, for the native shells: `art/tico.json`.
 *
 * The art stays where it is drawn — `parts.tsx` and `CompanionFace.tsx` — and
 * this walks what those components return instead of re-describing it. A copy
 * would be a second drawing that someone forgets to update, and the native
 * shells would quietly draw last month's pet. So there is no copy: every node
 * in the file is an element React would have put in the DOM, with its SVG
 * attribute names, the `var(--…)` colours resolved, and the three colours that
 * change at runtime left as `{screen}`, `{led}` and `{face}`.
 *
 * What is in the file:
 * - `defs`: the gradients, pattern and clip every variant shares.
 * - `slots`: each variant of shell, hands, feet and antenna.
 * - `props`: everything he can wear, souvenirs included.
 * - `faces`: per mood, the whole drawing back to front with each slot left as a
 *   `{ "tag": "slot", "name": … }` node, so the layer order and every
 *   mood-specific shape (cheeks, the thinking dots, the z's) come from the one
 *   place that already decides them. `blink` only exists where it differs, and
 *   `singing` is the same mood with the mouth swapped and the notes added.
 * - `classStyles`: the fill and stroke `companion.css` gives limbs by class,
 *   which the SVG alone does not carry.
 *
 * Every run also proves the file: it rebuilds each mood from the JSON, as a
 * native shell would, and compares that with what React renders for the same
 * pet. A mismatch is a bug in this script, and it fails before writing.
 *
 *   node scripts/export-art.mjs
 */

const root = new URL('..', import.meta.url).pathname
const server = await createServer({
	root,
	configFile: false,
	logLevel: 'error',
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	// Nothing here is served, so there is nothing to pre-bundle — and the scan
	// otherwise wanders into src-tauri/target and complains about every HTML file.
	optimizeDeps: { noDiscovery: true, include: [] },
	esbuild: { jsx: 'automatic' },
})

let failed = false
try {
	const { PARTS } = await server.ssrLoadModule('/src/companion/parts.tsx')
	const { CompanionFace, Prop } = await server.ssrLoadModule('/src/companion/CompanionFace.tsx')
	const { WEARS } = await server.ssrLoadModule('/src/data/companion.ts')

	const css = readFileSync(`${root}src/companion.css`, 'utf8')
	const palette = Object.fromEntries([...css.matchAll(/^\s*--([a-z-]+):\s*(#[0-9a-f]{3,8});/gim)].map((m) => [m[1], m[2]]))
	const TOKENS = { screen: '{screen}', led: '{led}', face: '{face}' }
	const MOODS = ['idle', 'happy', 'thinking', 'error', 'wow', 'love', 'dizzy', 'sleep', 'held', 'watching', 'muted', 'yawn', 'scared']

	// ── React element → node ──────────────────────────────────────────────────

	// React's own list of SVG attributes it does *not* hyphenate.
	const CAMEL = new Set(['viewBox', 'patternUnits', 'patternTransform', 'gradientUnits', 'gradientTransform', 'clipPathUnits', 'preserveAspectRatio'])
	const attrName = (k) => (k === 'className' ? 'class' : CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
	const colour = (v) =>
		String(v).replace(/var\(--([a-z-]+)\)/g, (whole, name) => {
			if (!(name in palette)) throw new Error(`unknown colour ${whole}`)
			return palette[name]
		})

	const SLOT = 'tico-slot'
	const walk = (el) => {
		if (el === null || el === undefined || el === false || el === true) return []
		if (Array.isArray(el)) return el.flatMap(walk)
		if (typeof el === 'string' || typeof el === 'number') return [{ text: String(el) }]
		if (el.type === Fragment) return walk(el.props.children)
		if (typeof el.type === 'function') return walk(el.type(el.props))
		if (el.type === SLOT) return [{ tag: 'slot', name: el.props.name }]
		if (typeof el.type !== 'string') throw new Error(`cannot export element ${String(el.type)}`)

		const node = { tag: el.type }
		const attrs = {}
		for (const [k, v] of Object.entries(el.props)) {
			if (k === 'children' || k === 'key' || v === undefined || v === null || v === false) continue
			if (k.startsWith('aria-')) continue
			if (k === 'style') {
				attrs.style = Object.fromEntries(Object.entries(v).map(([sk, sv]) => [attrName(sk), colour(sv)]))
				continue
			}
			attrs[attrName(k)] = colour(v)
		}
		if (Object.keys(attrs).length) node.attrs = attrs
		const children = walk(el.props.children)
		if (children.length) node.children = children
		return [node]
	}
	const one = (el) => {
		const nodes = walk(el)
		return nodes.length === 1 ? nodes[0] : { tag: 'g', children: nodes }
	}

	// ── The file ──────────────────────────────────────────────────────────────

	const colours = { screenColor: TOKENS.screen, ledColor: TOKENS.led }
	const slots = Object.fromEntries(
		Object.entries(PARTS).map(([slot, variants]) => [slot, Object.fromEntries(Object.entries(variants).map(([name, Part]) => [name, one(Part(colours))]))])
	)

	// Each registry gets a variant that draws a placeholder, so the face is
	// exported once with the slots left open instead of once per body. Removed
	// again straight after, though nothing outlives this process anyway.
	for (const slot of Object.keys(PARTS)) PARTS[slot].__slot = () => createElement(SLOT, { name: slot })
	const open = { shell: '__slot', hands: '__slot', feet: '__slot', antenna: '__slot' }
	const face = (mood, extra) =>
		one(CompanionFace({ mood, blink: false, singing: false, worn: [], faceColor: TOKENS.face, screenColor: TOKENS.screen, ledColor: TOKENS.led, parts: open, ...extra }))

	const faces = {}
	let defs
	for (const mood of MOODS) {
		const svg = face(mood)
		defs ??= svg.children.find((n) => n.tag === 'defs').children
		const strip = (n) => ({ ...n, children: n.children.filter((c) => c.tag !== 'defs') })
		const entry = { normal: strip(svg).children }
		const blink = strip(face(mood, { blink: true })).children
		if (JSON.stringify(blink) !== JSON.stringify(entry.normal)) entry.blink = blink
		entry.singing = strip(face(mood, { singing: true })).children
		faces[mood] = entry
	}
	for (const slot of Object.keys(PARTS)) delete PARTS[slot].__slot

	const props = Object.fromEntries(Object.keys(WEARS).map((kind) => [kind, one(createElement(Prop, { kind }))]))
	const empty = Object.entries(props).filter(([, n]) => !n.children?.length && n.tag === 'g')
	if (empty.length) throw new Error(`props that draw nothing: ${empty.map(([k]) => k).join(', ')}`)

	const limb = css.match(/\.companion-svg \.companion-hand,\s*\.companion-svg \.companion-foot \{([^}]*)\}/)
	if (!limb) throw new Error('the limb rule in companion.css moved; update classStyles here')
	const declarations = Object.fromEntries([...limb[1].matchAll(/([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], colour(m[2].trim())]))
	const classStyles = { 'companion-hand': declarations, 'companion-foot': declarations }

	const motion = motionFrom(css, readFileSync(`${root}src/companion/Companion.tsx`, 'utf8'))
	const { companionCopy } = await server.ssrLoadModule('/src/data/companion.ts')
	const copy = Object.fromEntries(Object.entries(companionCopy).map(([language, lines]) => [language, copyFrom(lines, language)]))
	const art = { version: 2, viewBox: [0, 0, 96, 96], tokens: Object.values(TOKENS), palette, defs, classStyles, slots, props, faces, motion }

	// ── The proof ─────────────────────────────────────────────────────────────

	// Rebuilds a pet from the file, the way a native shell will: the face for the
	// mood, each slot node swapped for its variant, the defs on top. Then React
	// renders the same pet and the two have to agree to the character.
	const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	const attr = (s) => esc(s).replace(/"/g, '&quot;')
	const markup = (n) => {
		if ('text' in n) return esc(n.text)
		const a = Object.entries(n.attrs ?? {})
			.map(([k, v]) => ` ${k}="${attr(typeof v === 'object' ? Object.entries(v).map(([sk, sv]) => `${sk}:${sv}`).join(';') : v)}"`)
			.join('')
		return `<${n.tag}${a}>${(n.children ?? []).map(markup).join('')}</${n.tag}>`
	}
	const SAMPLE = { screen: '#101010', led: '#00ff00', face: '#ffffff' }
	const fill = (s) => s.replaceAll('{screen}', SAMPLE.screen).replaceAll('{led}', SAMPLE.led).replaceAll('{face}', SAMPLE.face)
	// React writes `stroke-width="2"`, `stop-color`, `class` — the same names the
	// file uses — but hex colours keep the case they were typed in, and it closes
	// empty elements as `<rect/>`. Normalise only those.
	const norm = (s) => s.replace(/<(\w+)([^>]*)\/>/g, '<$1$2></$1>').replace(/#[0-9A-F]{3,8}\b/g, (h) => h.toLowerCase())

	const body = { shell: 'terminal', hands: 'mitts', feet: 'pills', antenna: 'led' }
	const bodies = [body, ...Object.keys(PARTS.shell).map((shell) => ({ ...body, shell }))]
	let compared = 0
	for (const parts of bodies) {
		for (const mood of MOODS) {
			for (const variant of ['normal', 'singing']) {
				const layers = art.faces[mood][variant].map((n) => (n.tag === 'slot' ? art.slots[n.name][parts[n.name]] : n))
				const ours = norm(fill(markup({ tag: 'svg', attrs: { viewBox: '0 0 96 96', class: 'companion-svg' }, children: [{ tag: 'defs', children: art.defs }, ...layers] })))
				const theirs = norm(
					renderToStaticMarkup(
						createElement(CompanionFace, { mood, blink: false, singing: variant === 'singing', worn: [], faceColor: SAMPLE.face, screenColor: SAMPLE.screen, ledColor: SAMPLE.led, parts })
					)
						.replace(/ aria-hidden="true"/g, '')
						.replace(/var\(--([a-z-]+)\)/g, (_, name) => palette[name])
				)
				// A slot that exports as several top-level shapes comes back wrapped in
				// one `<g>`; React draws them loose. Same picture, so unwrap to compare.
				if (ours.replace(/<g>|<\/g>/g, '') !== theirs.replace(/<g>|<\/g>/g, '')) {
					const at = [...ours].findIndex((c, i) => c !== theirs[i])
					console.error(`✗ ${parts.shell}/${mood}/${variant} differs at ${at}:\n  ours:   …${ours.slice(at - 60, at + 80)}\n  react:  …${theirs.slice(at - 60, at + 80)}`)
					failed = true
				}
				compared++
			}
		}
	}

	for (const [kind, node] of Object.entries(art.props)) {
		const ours = norm(markup(node)).replace(/<g>|<\/g>/g, '')
		const theirs = norm(renderToStaticMarkup(createElement(Prop, { kind })).replace(/var\(--([a-z-]+)\)/g, (_, name) => palette[name])).replace(/<g>|<\/g>/g, '')
		if (ours !== theirs) {
			console.error(`✗ prop ${kind} differs:\n  ours:  ${ours.slice(0, 200)}\n  react: ${theirs.slice(0, 200)}`)
			failed = true
		}
		compared++
	}

	if (!failed) {
		mkdirSync(`${root}art`, { recursive: true })
		writeFileSync(`${root}art/tico.json`, `${JSON.stringify(art)}\n`)
		writeFileSync(`${root}art/copy.json`, `${JSON.stringify(copy)}\n`)
		const count = (o) => Object.values(o).reduce((n, v) => n + Object.keys(v).length, 0)
		const leaf = (o) => typeof o === 'string' || typeof o.t === 'string' || (Array.isArray(o.hours) && typeof o.hours[0] === 'string')
		const lines = (o) => (leaf(o) ? 1 : (Array.isArray(o) ? o : Object.values(o)).reduce((n, v) => n + lines(v), 0))
		console.log(`✓ art/copy.json: ${Object.entries(copy).map(([l, c]) => `${lines(c)} ${l}`).join(', ')} lines`)
		console.log(
			`✓ art/tico.json: ${count(slots)} slot variants, ${Object.keys(props).length} props, ${MOODS.length} moods, ${Object.keys(motion.effects).length} effects; ${compared} drawings match React`
		)
	}
} finally {
	await server.close()
}
process.exit(failed ? 1 : 0)

/**
 * What he says, out of `src/data/copy/{en,es}.ts`, for the core to pick from.
 *
 * Most lines are strings. The rest are functions, and a function cannot be
 * JSON, so each is run instead of copied:
 *
 * - A line about the hour (`(hour) => …`) is run for all 24 and stored as
 *   `{ "hours": [24 strings] }` — `spoken(hour)` has real logic in it
 *   ("Es la una", "Son las tres de la madrugada") and only running it keeps it.
 * - Anything else is run twice with two different sentinel values per
 *   parameter and stored as `{ "t": "… {0} … {1} …" }`. Both runs must come
 *   back as the same template: a line that branches on its argument (a plural,
 *   say) would differ, and this throws rather than export half of it.
 */
function copyFrom(lines, language) {
	const params = (fn) => (fn.toString().match(/^\(?([^)=]*)\)?\s*=>/)?.[1] ?? '').split(',').map((p) => p.trim()).filter(Boolean)
	const template = (fn, where) => {
		const names = params(fn)
		if (names.length === 0) return fn()
		if (names.length === 1 && names[0] === 'hour') return { hours: Array.from({ length: 24 }, (_, h) => fn(h)) }
		const numeric = (name) => ['days', 'minutes', 'hour', 'n'].includes(name)
		const run = (a, b) => {
			const args = names.map((name, i) => (numeric(name) ? [7771, 8882][i] + (a ? 0 : 1000) : `${a ? '⟦' : '⟪'}${i}${a ? '⟧' : '⟫'}`))
			let out = fn(...args)
			names.forEach((name, i) => {
				out = out.replaceAll(String(args[i]), `{${i}}`)
			})
			return out
		}
		const first = run(true)
		if (first !== run(false)) throw new Error(`${language}.${where}: a line that branches on its argument cannot be a template`)
		// Numbers can change the words around them ("1 day"): check a small one too.
		names.forEach((name, i) => {
			if (!numeric(name)) return
			const args = names.map((n, j) => (j === i ? 1 : numeric(n) ? 7771 + j : `⟦${j}⟧`))
			let one = fn(...args)
			names.forEach((n, j) => {
				one = one.replaceAll(j === i ? '1' : String(args[j]), `{${j}}`)
			})
			if (one !== first) console.warn(`  ! ${language}.${where}: differs for 1 — "${one}" against "${first}"`)
		})
		return { t: first }
	}
	const walk = (value, where) => {
		if (typeof value === 'string') return value
		if (typeof value === 'function') return template(value, where)
		if (Array.isArray(value)) return value.map((v, i) => walk(v, `${where}[${i}]`))
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, where ? `${where}.${k}` : k)]))
	}
	return walk(lines, '')
}

/**
 * How he moves, out of companion.css: the keyframes, which effect plays which
 * of them, the posture each feeling holds, sitting, and what singing animates.
 * The same rule as the drawing — read from where it is written, never copied —
 * and the same proof: every effect `Companion.tsx` asks for has to exist here,
 * or this throws.
 *
 * Numbers are CSS's, units dropped: translate in px (which the shells treat as
 * points), rotate and skew in degrees, y down, rotation clockwise. Converting to
 * a platform's axes is the shell's job, in one place.
 */
function motionFrom(css, companion) {
	const declarations = (body) => Object.fromEntries([...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
	const ops = (transform) =>
		[...transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)].map(([, fn, args]) => [fn, ...args.split(/[\s,]+/).filter(Boolean).map(parseFloat)])

	const keyframes = {}
	for (const [, name, body] of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
		const frames = []
		for (const [, stops, block] of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
			const d = declarations(block)
			for (const stop of stops.split(',')) {
				const at = stop.trim() === 'from' ? 0 : stop.trim() === 'to' ? 1 : parseFloat(stop) / 100
				const frame = { at }
				if (d.transform) frame.transform = d.transform === 'none' ? [] : ops(d.transform)
				if (d.opacity !== undefined) frame.opacity = parseFloat(d.opacity)
				frames.push(frame)
			}
		}
		keyframes[name] = frames.sort((a, b) => a.at - b.at)
	}

	/** `name duration timing [delay] [count|infinite] [alternate]`, in any order CSS allows. */
	const animation = (shorthand) => {
		const spec = { name: null, duration: 0, timing: 'ease', delay: 0, iterations: 1, alternate: false }
		const timings = shorthand.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)/)
		if (timings) spec.timing = timings[0]
		const rest = shorthand.replace(/cubic-bezier\([^)]*\)|steps\([^)]*\)/, ' ').split(/\s+/).filter(Boolean)
		let seconds = 0
		for (const token of rest) {
			if (/^-?[\d.]+m?s$/.test(token)) {
				const value = token.endsWith('ms') ? parseFloat(token) / 1000 : parseFloat(token)
				if (seconds++ === 0) spec.duration = value
				else spec.delay = value
			} else if (['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(token)) spec.timing = token
			else if (token === 'infinite') spec.iterations = -1
			else if (/^[\d.]+$/.test(token)) spec.iterations = parseFloat(token)
			else if (token === 'alternate') spec.alternate = true
			else if (token === 'reverse') spec.reverse = true
			else if (['forwards', 'backwards', 'both', 'none'].includes(token)) spec.fill = token
			else spec.name = token
		}
		if (!spec.name || !keyframes[spec.name]) throw new Error(`animation "${shorthand}" names no keyframes`)
		return spec
	}

	// One entry per selector, so `a, b { … }` is found under either name.
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) =>
		selectors
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.split(',')
			.map((selector) => ({ selector: selector.trim().replace(/\s+/g, ' '), d: declarations(body) }))
	)

	const effects = {}
	for (const { selector, d } of rules) {
		const m = selector.match(/^\.companion-anim\[data-anim="(\w+)"\]( \.([\w-]+))?$/)
		if (!m || !d.animation) continue
		if (m[3]) (effects[m[1]].also ??= []).push({ target: m[3], ...animation(d.animation) })
		else effects[m[1]] = { ...effects[m[1]], ...animation(d.animation) }
	}

	const postures = {}
	const pace = {}
	for (const { selector, d } of rules) {
		const m = selector.match(/^\.companion\[data-feeling="(\w+)"\] \.companion-(anim|body)$/)
		if (!m) continue
		if (m[2] === 'anim' && d.transform) {
			const [duration, ...timing] = (d.transition ?? 'transform 0.6s ease').replace(/^transform\s+/, '').split(/\s+(?![^(]*\))/)
			postures[m[1]] = { transform: ops(d.transform), duration: parseFloat(duration), timing: timing.join(' ') || 'ease' }
		}
		if (m[2] === 'body') pace[m[1]] = { ...(d['animation-name'] && { name: d['animation-name'] }), duration: parseFloat(d['animation-duration']) }
	}

	const find = (selector) => rules.find((r) => r.selector === selector)?.d ?? {}
	const sitAnim = find('.companion[data-pose="sit"] .companion-anim')
	const sit = {
		transform: ops(sitAnim.transform),
		duration: parseFloat(sitAnim.transition.split(/\s+/)[1]),
		timing: sitAnim.transition.match(/cubic-bezier\([^)]*\)/)?.[0] ?? 'ease',
		feet: ops(find('.companion[data-pose="sit"] .companion-foot').transform),
		breathe: find('.companion[data-pose="sit"] .companion-body')['animation-name'],
	}

	// Singing: which class animates how, with the side or child index that
	// tells a left hand from a right one.
	const singing = []
	for (const { selector, d } of rules) {
		if (!d.animation && !d['animation-delay']) continue
		const m =
			selector.match(/^\.companion\[data-singing="true"\](:not\(\[data-walking="true"\]\))? ?\.([\w-]+)(\[data-side="(\w+)"\])?$/) ??
			selector.match(/^()\.(companion-sing)()()$/) ??
			selector.match(/^()\.(companion-notes) text:nth-child\((\d)\)()$/)
		if (!m) continue
		const entry = { target: m[2] }
		if (m[4]) entry.side = m[4]
		if (m[2] === 'companion-notes') entry.child = Number(m[3]) - 1
		if (d.animation) Object.assign(entry, animation(d.animation))
		if (d['animation-delay']) {
			const base = singing.find((e) => e.target === entry.target && !e.side)
			Object.assign(entry, { ...base, ...entry, delay: parseFloat(d['animation-delay']) })
		}
		singing.push(entry)
	}

	// Limbs that move with a mood: hands up when happy, over the ears when muted.
	const limbs = []
	for (const { selector, d } of rules) {
		const m = selector.match(/^\.companion\[data-mood="(\w+)"\] \.companion-(hand|foot)(\[data-side="(\w+)"\])?$/)
		if (m && d.transform) limbs.push({ mood: m[1], target: `companion-${m[2]}`, ...(m[4] && { side: m[4] }), transform: ops(d.transform) })
	}
	const limbTransition = find('.companion-svg .companion-hand').transition

	// Walking steps his feet; flying tilts him into the direction of travel and
	// lights his feet. `side` here is facing, not which foot.
	const stateRule = (state) => {
		const out = []
		for (const { selector, d } of rules) {
			const m = selector.match(new RegExp(`^\\.companion\\[data-${state}="true"\\](\\[data-side="(\\w+)"\\])? \\.([\\w-]+)(\\[data-side="(\\w+)"\\])?$`))
			if (!m) continue
			const entry = { target: m[3], ...(m[2] && { facing: m[2] }), ...(m[5] && { side: m[5] }) }
			if (d.animation) Object.assign(entry, animation(d.animation))
			if (d['animation-delay']) {
				const base = out.find((e) => e.target === entry.target && !e.side)
				Object.assign(entry, { ...base, ...entry, delay: parseFloat(d['animation-delay']) })
			}
			if (d.transform) entry.transform = ops(d.transform)
			if (d.fill) entry.fill = d.fill.replace(/var\(--([a-z-]+)\)/, (_, n) => palette[n])
			if (d.stroke) entry.stroke = d.stroke.replace(/var\(--([a-z-]+)\)/, (_, n) => palette[n])
			if (entry.name || entry.transform || entry.fill) out.push(entry)
		}
		return out
	}
	const palette = Object.fromEntries([...css.matchAll(/^\s*--([a-z-]+):\s*(#[0-9a-f]{3,8});/gim)].map((m) => [m[1], m[2]]))
	const walking = stateRule('walking')
	const flying = stateRule('flying')

	const base = {
		wear: animation(find('.companion-worn').animation),
		unwear: animation(find('.companion-worn[data-leaving]').animation),
		travel: find('.companion')['transition-timing-function'],
		limbTransition: parseFloat(limbTransition.split(/\s+/)[1]),
		origin: find('.companion-anim')['transform-origin'],
		bob: animation(find('.companion-body').animation),
		pulse: animation(find('.companion-led').animation),
		look: ops(find('.companion-eyes').transform.replace(/calc\(var\(--look-(x|y), 0\) \* ([\d.]+)px\)/g, '$2')),
	}

	// The proof: every effect the component plays exists. `react('mood', 'x')`
	// and the dance table are the two places names come from.
	const asked = new Set([
		...[...companion.matchAll(/react\('\w+', '(\w+)'/g)].map((m) => m[1]),
		...[...companion.matchAll(/\['(\w+)', [\d_]+\]/g)].map((m) => m[1]),
	])
	const missing = [...asked].filter((name) => !effects[name])
	if (missing.length) throw new Error(`effects Companion.tsx plays but companion.css does not define: ${missing.join(', ')}`)

	return { base, keyframes, effects, postures, pace, sit, singing, limbs, walking, flying }
}
