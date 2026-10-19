//! What he says: `art/copy.json`, exported from `src/data/copy/{en,es}.ts`.
//!
//! A line is a string, a template (`{"t": "{1} minutes in {0}"}`) or a line
//! about the hour (`{"hours": [24 strings]}`), because the TypeScript has
//! functions there and only running them keeps their logic. The brain asks for
//! a pool by path ("click", "feelings.bored", "apps.vscode.night") and picks.

use serde_json::Value;

pub struct Copy {
    root: Value,
}

impl Copy {
    /// The lines for `language`, falling back to English.
    pub fn parse(json: &str, language: &str) -> Option<Self> {
        let mut all: Value = serde_json::from_str(json).ok()?;
        let root = match all.get_mut(language) {
            Some(lines) if lines.is_object() => lines.take(),
            _ => all.get_mut("en")?.take(),
        };
        Some(Self { root })
    }

    /// Every line at a dotted path, or none.
    pub fn pool(&self, path: &str) -> Vec<&Value> {
        let mut at = &self.root;
        for key in path.split('.') {
            match at.get(key) {
                Some(next) => at = next,
                None => return Vec::new(),
            }
        }
        match at {
            Value::Array(lines) => lines.iter().collect(),
            _ => Vec::new(),
        }
    }

    /// One line as text: the hour picks from an hour table, `args` fill `{0}`, `{1}`.
    pub fn render(line: &Value, hour: u8, args: &[&str]) -> Option<String> {
        match line {
            Value::String(text) => Some(text.clone()),
            Value::Object(map) => {
                if let Some(Value::Array(hours)) = map.get("hours") {
                    return hours.get(hour as usize)?.as_str().map(str::to_string);
                }
                let mut text = map.get("t")?.as_str()?.to_string();
                for (i, arg) in args.iter().enumerate() {
                    text = text.replace(&format!("{{{i}}}"), arg);
                }
                Some(text)
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSON: &str = r#"{
        "en": {"click": ["hi", "hello"], "dwell": [{"t": "{1} minutes in {0}."}],
               "hours": {"night": [{"hours": ["midnight", "1am"]}]}, "feelings": {"bored": ["meh"]}},
        "es": {"click": ["hola"]}
    }"#;

    #[test]
    fn pools_templates_and_hours() {
        let en = Copy::parse(JSON, "en").unwrap();
        assert_eq!(en.pool("click").len(), 2);
        assert_eq!(en.pool("feelings.bored").len(), 1);
        assert!(en.pool("feelings.nope").is_empty());
        let dwell = en.pool("dwell")[0];
        assert_eq!(Copy::render(dwell, 0, &["Xcode", "45"]).unwrap(), "45 minutes in Xcode.");
        assert_eq!(Copy::render(en.pool("hours.night")[0], 1, &[]).unwrap(), "1am");
        assert_eq!(Copy::parse(JSON, "es").unwrap().pool("click").len(), 1);
        assert_eq!(
            Copy::parse(JSON, "fr").unwrap().pool("click").len(),
            2,
            "unknown language falls back to English"
        );
    }

    #[test]
    fn the_shipped_copy_has_both_languages_and_every_pool_the_brain_asks_for() {
        let json = include_str!("../../art/copy.json");
        for language in ["en", "es"] {
            let copy = Copy::parse(json, language).unwrap();
            for path in [
                "boot",
                "click",
                "pet",
                "dizzy",
                "drag",
                "wake",
                "back",
                "idle",
                "switching",
                "unknownApp",
                "dwell",
                "behind",
                "rocketUp",
                "rocketDown",
            ] {
                assert!(!copy.pool(path).is_empty(), "{language}.{path}");
            }
            for tod in ["dawn", "day", "evening", "night"] {
                assert!(!copy.pool(&format!("hours.{tod}")).is_empty(), "{language}.hours.{tod}");
            }
        }
    }
}
