//! The pure half of `src/data/companion.ts`: what time of day it is to him, how
//! lively he is, how he feels about what he senses, what an application is, how
//! he dances, how well he knows you, what he is wearing. No clock, no I/O and no
//! randomness here — every function is the same answer for the same question,
//! which is what lets the tests below be the ones `scripts/check.mjs` runs.
//!
//! Ported, not rethought: the comments that explain *why* live in the
//! TypeScript, and the two are kept in step until the Tauri build retires.

use std::collections::HashMap;

/// Four buckets, not twenty-four.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum TimeOfDay {
    Dawn,
    Day,
    Evening,
    Night,
}

#[uniffi::export]
pub fn time_of_day(hour: u8) -> TimeOfDay {
    match hour {
        h if !(5..23).contains(&h) => TimeOfDay::Night,
        h if h < 9 => TimeOfDay::Dawn,
        h if h < 18 => TimeOfDay::Day,
        _ => TimeOfDay::Evening,
    }
}

/// 0 to 1 by the clock, with the dip after lunch.
const ENERGY_BY_HOUR: [f64; 24] = [
    0.2, 0.2, 0.15, 0.15, 0.2, // 0–4
    0.45, 0.6, 0.75, 0.9, // 5–8
    1.0, 1.0, 1.0, 0.9, // 9–12
    0.7, 0.65, 0.8, 0.85, 0.8, // 13–17
    0.75, 0.7, 0.65, 0.55, 0.4, 0.3, // 18–23
];

#[uniffi::export]
pub fn energy_at(hour: u8) -> f64 {
    ENERGY_BY_HOUR.get(hour as usize).copied().unwrap_or(0.6)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum Feeling {
    Content,
    Bored,
    Lonely,
    Pleased,
    Worried,
    Restless,
    Rattled,
    Smug,
    Curious,
    Sleepy,
    Festive,
    Nostalgic,
    Scared,
}

/// What the feeling ladder reads.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Sensed {
    /// Minutes since the cursor moved anywhere on screen.
    pub neglect: f64,
    /// 0–1, raised by being handled, decaying over minutes.
    pub attention: f64,
    /// Hours in the same application.
    pub dwell: f64,
    /// Application switches in the last two minutes.
    pub switches: u32,
    /// Times he has been picked up in the last two minutes.
    pub drags: u32,
    pub new_app: bool,
    pub feared: bool,
    pub music: bool,
    pub app_key: Option<String>,
    pub energy: f64,
    pub hour: u8,
}

/// A ladder, not a score: the most interesting fact about the moment wins.
#[uniffi::export]
pub fn feeling_from(seen: &Sensed) -> Feeling {
    use Feeling::*;
    if seen.drags >= 3 {
        return Rattled;
    }
    if seen.feared {
        return Scared;
    }
    if seen.neglect > 8.0 {
        return Lonely;
    }
    if seen.attention > 0.85 {
        return Smug;
    }
    if seen.attention > 0.5 {
        return Pleased;
    }
    if seen.new_app {
        return Curious;
    }
    if seen.energy < 0.25 {
        return Sleepy;
    }
    if seen.music && seen.energy > 0.5 {
        return Festive;
    }
    if seen.neglect > 3.0 {
        return Bored;
    }
    if seen.dwell >= 2.0 || (seen.dwell >= 1.0 && (seen.hour >= 23 || seen.hour < 5)) {
        return Worried;
    }
    if seen.app_key.as_deref() == Some("terminal") {
        return Nostalgic;
    }
    if seen.switches > 6 {
        return Restless;
    }
    Content
}

/// The face, the screen behind it and the LED, per feeling.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct Colours {
    pub face: String,
    pub screen: String,
    pub led: String,
}

#[uniffi::export]
pub fn palette(feeling: Feeling) -> Colours {
    use Feeling::*;
    let (face, screen, led) = match feeling {
        Content => ("#bb9af7", "#1a1c23", "#9ece6a"),
        Bored => ("#6b7489", "#1a1c23", "#6b7489"),
        Lonely => ("#7aa2f7", "#171a21", "#565f78"),
        Pleased => ("#9ece6a", "#1a1f21", "#9ece6a"),
        Smug => ("#e0af68", "#1c1b1e", "#e0af68"),
        Worried => ("#e0af68", "#1c1a1e", "#e0af68"),
        Restless => ("#7dcfff", "#1a1d23", "#7dcfff"),
        Rattled => ("#f7768e", "#1e1a1e", "#f7768e"),
        Curious => ("#7dcfff", "#181c24", "#7dcfff"),
        Sleepy => ("#6a7490", "#13151b", "#3b4256"),
        Festive => ("#f7768e", "#1d1a24", "#e0af68"),
        Nostalgic => ("#9ece6a", "#0d140f", "#9ece6a"),
        Scared => ("#2a2e3a", "#d9dde8", "#f7768e"),
    };
    Colours { face: face.into(), screen: screen.into(), led: led.into() }
}

/// Lowercased substring, first match wins, so the specific entries come first.
const APP_PATTERNS: &[(&str, &[&str])] = &[
    ("sql", &["beekeeper", "tableplus", "dbeaver", "pgadmin", "azure data studio", "sequel"]),
    ("vscode", &["visual studio code", "code - insiders", "cursor", "windsurf", "vscodium"]),
    ("visualstudio", &["visual studio", "rider", "jetbrains", "intellij", "webstorm"]),
    ("xcode", &["xcode", "android studio"]),
    ("terminal", &["terminal", "iterm", "warp", "ghostty", "alacritty", "kitty", "wezterm"]),
    ("github", &["github desktop", "sourcetree", "fork", "gitkraken"]),
    ("docker", &["docker", "orbstack", "podman"]),
    ("api", &["postman", "insomnia", "bruno", "hoppscotch"]),
    ("figma", &["figma", "sketch", "penpot"]),
    ("meeting", &["zoom", "microsoft teams", "google meet", "webex"]),
    ("chat", &["slack", "discord", "whatsapp", "telegram", "messages", "signal"]),
    ("music", &["spotify", "music", "tidal", "deezer"]),
    ("browser", &["chrome", "brave", "safari", "firefox", "arc", "edge", "zen"]),
    ("notes", &["notion", "obsidian", "notes", "bear", "craft", "linear", "clickup"]),
    ("sheets", &["excel", "numbers", "sheets", "calc"]),
    ("mail", &["mail", "outlook", "spark", "superhuman"]),
    ("ai", &["claude", "chatgpt", "copilot", "perplexity", "ollama"]),
    ("finder", &["finder", "explorer", "files", "nautilus"]),
];

#[uniffi::export]
pub fn match_app(name: &str) -> Option<String> {
    let needle = name.to_lowercase();
    APP_PATTERNS
        .iter()
        .find(|(_, patterns)| patterns.iter().any(|p| needle.contains(p)))
        .map(|(key, _)| key.to_string())
}

/// The ones that hold `scared` for half a minute rather than startling him once.
pub const TERRORS: [&str; 2] = ["meeting", "xcode"];

const DOCUMENT_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "astro", //
    "rs", "go", "py", "rb", "php", "java", "kt", "swift", "dart", "lua", "ex", "exs", //
    "c", "h", "cpp", "hpp", "cs", "m", "mm", //
    "html", "css", "scss", "sass", "json", "toml", "yaml", "yml", "xml", "sql", "sh", //
    "md", "mdx", "txt", "csv", "pdf", "docx", "xlsx", //
    "png", "jpg", "jpeg", "svg", "webp",
];

/// The filename inside a window title, when there is one.
#[uniffi::export]
pub fn document_in(title: Option<String>) -> Option<String> {
    let title = title?;
    title
        .split(|c: char| c.is_whitespace() || matches!(c, '—' | '–' | '|' | ':'))
        .map(|raw| raw.trim_start_matches(['●', '•', '*']).trim())
        .find(|token| match token.rfind('.') {
            Some(dot) if dot > 0 && dot < token.len() - 1 => {
                DOCUMENT_EXTENSIONS.contains(&token[dot + 1..].to_lowercase().as_str())
            }
            _ => false,
        })
        .map(str::to_string)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum DanceStyle {
    Heavy,
    Fast,
    Smooth,
    Slow,
    Bright,
}

const GENRE_STYLES: &[(DanceStyle, &[&str])] = &[
    (DanceStyle::Heavy, &["metal", "hard rock", "grunge", "industrial"]),
    (
        DanceStyle::Fast,
        &["punk", "electronic", "techno", "house", "drum", "dance", "ska", "trance"],
    ),
    (
        DanceStyle::Smooth,
        &["hip", "rap", "r&b", "soul", "funk", "jazz", "reggae", "latin", "salsa", "bossa"],
    ),
    (
        DanceStyle::Slow,
        &["classical", "ambient", "acoustic", "folk", "blues", "soundtrack", "piano"],
    ),
    (DanceStyle::Bright, &["pop", "indie", "alternative", "country", "rock"]),
];

const STYLES: [DanceStyle; 5] =
    [DanceStyle::Heavy, DanceStyle::Fast, DanceStyle::Smooth, DanceStyle::Slow, DanceStyle::Bright];

/// Tempo, then genre, then a hash of the track so a song always gets the same
/// dance. The hash is FNV-1a over what JavaScript's `charCodeAt(0)` sees for
/// each code point — its first UTF-16 unit — so it matches the Tauri build.
#[uniffi::export]
pub fn dance_style(artist: &str, song: &str, genre: &str, bpm: f64) -> DanceStyle {
    if bpm > 0.0 {
        return match bpm {
            b if b < 85.0 => DanceStyle::Slow,
            b if b < 110.0 => DanceStyle::Smooth,
            b if b < 145.0 => DanceStyle::Bright,
            _ => DanceStyle::Fast,
        };
    }
    let needle = genre.to_lowercase();
    if !needle.is_empty()
        && let Some((style, _)) =
            GENRE_STYLES.iter().find(|(_, words)| words.iter().any(|w| needle.contains(w)))
    {
        return *style;
    }
    let mut hash: u32 = 0x811c9dc5;
    let mut unit = [0u16; 2];
    for c in format!("{artist}\u{0}{song}").to_lowercase().chars() {
        hash ^= c.encode_utf16(&mut unit)[0] as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    STYLES[(hash % STYLES.len() as u32) as usize]
}

/// How well he knows you, from distinct days together. Only moves one way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum Familiarity {
    New,
    Knowing,
    Familiar,
    Old,
}

#[uniffi::export]
pub fn familiarity_from(days: u32) -> Familiarity {
    match days {
        d if d >= 60 => Familiarity::Old,
        d if d >= 14 => Familiarity::Familiar,
        d if d >= 4 => Familiarity::Knowing,
        _ => Familiarity::New,
    }
}

/// Where a thing is worn; one of each at a time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
pub enum Where {
    Body,
    Neck,
    Feet,
    Head,
    Face,
    Hand,
}

impl Where {
    /// The key `tico.json` uses for this place.
    fn key(self) -> &'static str {
        match self {
            Where::Body => "body",
            Where::Neck => "neck",
            Where::Feet => "feet",
            Where::Head => "head",
            Where::Face => "face",
            Where::Hand => "hand",
        }
    }
}

/// What he might put on for no reason; the preferences offer the same list.
pub const PROPS: [&str; 25] = [
    "party",
    "tophat",
    "shades",
    "crown",
    "flower",
    "scarf",
    "coffee",
    "afro",
    "mohawk",
    "longhair",
    "beanie",
    "cap",
    "hood",
    "catears",
    "glasses",
    "moustache",
    "tie",
    "bowtie",
    "cape",
    "duck",
    "umbrella",
    "sneakers",
    "wellies",
    "monocle",
    "ninjamask",
];

/// Never chosen: only ever brought back from behind the screen.
pub const SOUVENIRS: [&str; 3] = ["cobweb", "bolt", "dust"];

/// Back to front.
pub const WORN_ORDER: [Where; 6] =
    [Where::Body, Where::Neck, Where::Feet, Where::Head, Where::Face, Where::Hand];

#[uniffi::export]
pub fn wears(kind: &str) -> Option<Where> {
    use Where::*;
    Some(match kind {
        "party" | "tophat" | "crown" | "flower" | "beanie" | "cap" | "hood" | "catears"
        | "headphones" | "duck" | "afro" | "mohawk" | "longhair" | "dust" => Head,
        "shades" | "glasses" | "monocle" | "ninjamask" | "moustache" => Face,
        "scarf" | "tie" | "bowtie" => Neck,
        "cape" | "cobweb" => Body,
        "coffee" | "umbrella" | "bolt" => Hand,
        "sneakers" | "wellies" => Feet,
        _ => return None,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct WornProp {
    pub kind: String,
    pub leaving: bool,
}

/// Everything he has on, back to front: pins are the floor, his own choice
/// covers the pin in its place, and a pin in the wrong place is dropped.
#[uniffi::export]
pub fn worn_from(
    pinned: HashMap<String, String>,
    own: Option<String>,
    leaving: bool,
) -> Vec<WornProp> {
    let mut by: HashMap<Where, WornProp> = HashMap::new();
    for (place, kind) in pinned {
        if let Some(at) = wears(&kind)
            && at.key() == place
        {
            by.insert(at, WornProp { kind, leaving: false });
        }
    }
    if let Some(kind) = own
        && let Some(at) = wears(&kind)
    {
        by.insert(at, WornProp { kind, leaving });
    }
    WORN_ORDER.iter().filter_map(|at| by.remove(at)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors scripts/check.mjs, case for case.

    #[test]
    fn every_hour_has_an_energy_and_a_bucket() {
        for hour in 0..24 {
            let e = energy_at(hour);
            assert!(e > 0.0 && e <= 1.0, "hour {hour} → {e}");
        }
        assert_eq!(time_of_day(2), TimeOfDay::Night);
        assert_eq!(time_of_day(7), TimeOfDay::Dawn);
        assert_eq!(time_of_day(14), TimeOfDay::Day);
        assert_eq!(time_of_day(20), TimeOfDay::Evening);
        assert_eq!(time_of_day(23), TimeOfDay::Night);
    }

    fn base() -> Sensed {
        Sensed {
            neglect: 0.0,
            attention: 0.0,
            dwell: 0.0,
            switches: 0,
            drags: 0,
            new_app: false,
            feared: false,
            music: false,
            app_key: Some("vscode".into()),
            energy: 0.9,
            hour: 14,
        }
    }

    #[test]
    fn the_ladder_reaches_every_feeling_it_should() {
        use Feeling::*;
        type Tweak = Box<dyn Fn(&mut Sensed)>;
        let cases: Vec<(Feeling, Tweak)> = vec![
            (Rattled, Box::new(|s| s.drags = 3)),
            (Scared, Box::new(|s| s.feared = true)),
            (Lonely, Box::new(|s| s.neglect = 12.0)),
            (Smug, Box::new(|s| s.attention = 0.9)),
            (Pleased, Box::new(|s| s.attention = 0.6)),
            (Curious, Box::new(|s| s.new_app = true)),
            (Sleepy, Box::new(|s| s.energy = 0.15)),
            (Festive, Box::new(|s| s.music = true)),
            (Bored, Box::new(|s| s.neglect = 5.0)),
            (Worried, Box::new(|s| s.dwell = 3.0)),
            (Nostalgic, Box::new(|s| s.app_key = Some("terminal".into()))),
            (Restless, Box::new(|s| s.switches = 8)),
            (Content, Box::new(|_| {})),
        ];
        for (want, set) in cases {
            let mut s = base();
            set(&mut s);
            assert_eq!(feeling_from(&s), want, "{s:?}");
        }
    }

    #[test]
    fn a_filename_is_found_and_nothing_else_is() {
        let cases = [
            (Some("Companion.tsx — tico"), Some("Companion.tsx")),
            (Some("● app.rs — tico"), Some("app.rs")),
            (Some("tico — PLAN.md"), Some("PLAN.md")),
            (Some(".env-prod — Condominios"), None),
            (Some("Fabricio Rojas — Full Stack Developer - Google Chrome"), None),
            (Some("github.com/fgrr12 - Brave"), None),
            (Some("Spotify Premium"), None),
            (None, None),
        ];
        for (title, want) in cases {
            assert_eq!(document_in(title.map(String::from)).as_deref(), want, "{title:?}");
        }
    }

    #[test]
    fn apps_match_as_in_the_tauri_build() {
        // Values printed by `matchApp` in companion.ts.
        for (name, key) in [
            ("Visual Studio Code", Some("vscode")),
            ("Code - Insiders", Some("vscode")),
            ("Terminal", Some("terminal")),
            ("Spotify", Some("music")),
            ("Beekeeper Studio", Some("sql")),
            ("Brave Browser", Some("browser")),
            ("Finder", Some("finder")),
            ("Microsoft Teams", Some("meeting")),
            ("Xcode", Some("xcode")),
            ("Calculator", Some("sheets")),
            ("Hopper Disassembler", None),
        ] {
            assert_eq!(match_app(name).as_deref(), key, "{name}");
        }
    }

    #[test]
    fn dances_match_the_tauri_build() {
        // Values printed by `danceStyle` in companion.ts, accents and emoji
        // included: the hash has to see the same UTF-16 units JavaScript does.
        use DanceStyle::*;
        for (artist, song, want) in [
            ("Boards of Canada", "Roygbiv", Slow),
            ("Daft Punk", "One More Time", Fast),
            ("Bad Bunny", "Tití Me Preguntó", Bright),
            ("Björk", "Jóga", Slow),
            ("artist 1", "song 1", Slow),
            ("Ünïcødé 🎵", "Émoji ✨", Slow),
        ] {
            assert_eq!(dance_style(artist, song, "", 0.0), want, "{artist} – {song}");
        }
        assert_eq!(dance_style("x", "y", "Heavy Metal", 0.0), Heavy);
        assert_eq!(dance_style("x", "y", "Hip-Hop/Rap", 0.0), Smooth);
        assert_eq!(dance_style("x", "y", "Pop", 120.0), Bright);
        assert_eq!(dance_style("x", "y", "", 70.0), Slow);
    }

    #[test]
    fn every_style_is_reachable_and_the_hash_spreads() {
        let all: std::collections::HashSet<_> = (0..300)
            .map(|i| dance_style(&format!("artist {i}"), &format!("song {i}"), "", 0.0))
            .collect();
        assert_eq!(all.len(), 5);
    }

    #[test]
    fn familiarity_reaches_every_level() {
        let reached: std::collections::HashSet<_> =
            [0, 1, 3, 4, 13, 14, 59, 60, 400].map(familiarity_from).into();
        assert_eq!(reached.len(), 4);
        assert_eq!(familiarity_from(3), Familiarity::New);
        assert_eq!(familiarity_from(60), Familiarity::Old);
    }

    #[test]
    fn worn_things_keep_their_places() {
        let kinds = |w: Vec<WornProp>| w.into_iter().map(|p| p.kind).collect::<Vec<_>>();
        let pins: HashMap<String, String> =
            [("hand", "coffee"), ("head", "cap")].map(|(a, b)| (a.into(), b.into())).into();
        assert!(
            kinds(worn_from(pins.clone(), None, false)).contains(&"coffee".into()),
            "a pinned coffee is not held"
        );
        assert!(
            kinds(worn_from(pins.clone(), Some("tophat".into()), false)).contains(&"coffee".into()),
            "a hat emptied his hand"
        );
        assert!(
            !kinds(worn_from(pins.clone(), Some("tophat".into()), false)).contains(&"cap".into()),
            "two things on one head"
        );
        let going = worn_from(pins, Some("tophat".into()), true);
        assert!(going.iter().any(|p| p.kind == "tophat" && p.leaving));
        let order: HashMap<String, String> =
            [("hand", "coffee"), ("body", "cape"), ("head", "cap")]
                .map(|(a, b)| (a.into(), b.into()))
                .into();
        assert_eq!(kinds(worn_from(order, None, false)), ["cape", "cap", "coffee"]);
        let wrong: HashMap<String, String> = [("head".to_string(), "coffee".to_string())].into();
        assert!(worn_from(wrong, None, false).is_empty(), "a coffee was worn as a hat");
    }
}
