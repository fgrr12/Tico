use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

/// Directories whose contents are never what you meant. A repository has one
/// `Cargo.toml` you care about and four in `target/`.
const NOISE: [&str; 9] = [
    "/node_modules/",
    "/target/",
    "/dist/",
    "/build/",
    "/.git/",
    "/Library/Caches/",
    "/Library/pnpm/",
    "/.cargo/registry/",
    "/.Trash/",
];

#[derive(Serialize)]
pub struct Outcome {
    pub ok: bool,
    /// What to tell the user he did — a filename, a host, or the failed query.
    pub label: String,
}

/// Strip the model's output back to search terms.
///
/// Two things get through the schema that should not. Small models leak the verb
/// back into the query ("abrir Companion.tsx"), and qwen in particular sometimes
/// drops a CJK token into the middle of a Spanish sentence. Neither is worth a
/// retry — both are cheaper to clean here than to prompt away.
fn clean(query: &str) -> String {
    const VERBS: [&str; 12] = [
        "abrir", "abrime", "abrí", "abre", "mostrar", "mostrame", "buscar", "open", "show", "find",
        "reveal", "please",
    ];

    query
        .split_whitespace()
        .map(|word| {
            word.chars()
                // Anything outside Latin-1 plus the punctuation a filename uses.
                .filter(|c| c.is_ascii_alphanumeric() || "áéíóúñüÁÉÍÓÚÑÜ.-_".contains(*c))
                .collect::<String>()
        })
        .filter(|word| !word.is_empty() && !VERBS.contains(&word.to_lowercase().as_str()))
        .take(6)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Spotlight, which is already indexing the disk and is better at this than
/// anything worth writing.
///
/// The model never sees a path and never produces one — it produces search terms
/// and this turns them into a real file that already exists. That is the whole
/// security boundary: a hallucinated filename finds nothing, where a hallucinated
/// *path* would be something opened on trust.
fn mdfind(predicate: &str) -> Vec<String> {
    let Ok(output) = Command::new("mdfind").arg(predicate).output() else {
        return Vec::new();
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !NOISE.iter().any(|noise| line.contains(noise)))
        .map(str::to_string)
        .collect()
}

/// Two passes, because of how people actually name things.
///
/// The first tries every word against the *filename*, which is right for
/// "Companion.tsx". It is wrong for "the Cargo.toml of tico" — a real and
/// natural way to ask, where the project is in the path and only the file is in
/// the name. So the second pass puts the most file-like word against the name
/// and requires the rest to appear anywhere in the path.
fn search(query: &str) -> Vec<PathBuf> {
    let cleaned = clean(query);
    let terms: Vec<&str> = cleaned.split_whitespace().collect();
    if terms.is_empty() {
        return Vec::new();
    }

    let by_name = terms
        .iter()
        .map(|term| format!("kMDItemFSName == '*{term}*'cd"))
        .collect::<Vec<_>>()
        .join(" && ");

    let mut hits = mdfind(&by_name);

    if hits.is_empty() && terms.len() > 1 {
        // A word with a dot in it is a filename; failing that, the longest one
        // carries the most signal.
        let anchor = terms
            .iter()
            .max_by_key(|term| (term.contains('.') as usize) * 100 + term.len())
            .copied()
            .unwrap_or(terms[0]);

        hits = mdfind(&format!("kMDItemFSName == '*{anchor}*'cd"));

        for term in terms.iter().filter(|term| **term != anchor) {
            let needle = term.to_lowercase();
            hits.retain(|path| path.to_lowercase().contains(&needle));
        }
    }

    let mut paths: Vec<PathBuf> = hits.into_iter().map(PathBuf::from).collect();

    // Shallowest wins. The file you meant is nearly always closer to the top of a
    // project than its copies are.
    paths.sort_by_key(|path| path.components().count());
    paths.truncate(10);
    paths
}

fn label_of(path: &PathBuf) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn run_open(args: &[&str]) -> bool {
    Command::new("open")
        .args(args)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// A bare word becomes a domain rather than a web search: opening
/// `https://github.com` is unambiguous, and handing a stray word to a search
/// engine is the kind of thing that surprises people.
fn to_url(query: &str) -> Option<String> {
    let raw = query.trim().trim_matches('"');
    if raw.is_empty() || raw.contains(' ') && !raw.contains('.') {
        return None;
    }

    if raw.starts_with("http://") || raw.starts_with("https://") {
        return Some(raw.to_string());
    }

    let host = raw.split_whitespace().next()?;
    if host.contains('.') {
        Some(format!("https://{host}"))
    } else {
        Some(format!("https://{host}.com"))
    }
}

#[tauri::command]
pub fn run_action(action: String, query: String) -> Outcome {
    // A query that looks like a path was invented rather than extracted, and the
    // one thing this must never do is open something the model made up.
    if query.contains('/') && action != "open_url" {
        return Outcome {
            ok: false,
            label: query,
        };
    }

    match action.as_str() {
        "open_file" | "reveal_file" => {
            let Some(hit) = search(&query).into_iter().next() else {
                return Outcome {
                    ok: false,
                    label: clean(&query),
                };
            };

            let path = hit.to_string_lossy().to_string();
            let ok = if action == "reveal_file" {
                run_open(&["-R", &path])
            } else {
                run_open(&[&path])
            };

            Outcome {
                ok,
                label: label_of(&hit),
            }
        }

        "open_url" => match to_url(&query) {
            Some(url) => {
                let ok = run_open(&[&url]);
                let label = url.trim_start_matches("https://").to_string();
                Outcome { ok, label }
            }
            None => Outcome {
                ok: false,
                label: query,
            },
        },

        _ => Outcome {
            ok: false,
            label: query,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_verbs_and_foreign_characters() {
        // Both seen coming out of qwen2.5:3b during the intent tests.
        assert_eq!(clean("abrir Companion.tsx"), "Companion.tsx");
        assert_eq!(clean("lyra 隱藏的文件夹"), "lyra");
    }

    #[test]
    fn a_path_in_the_name_is_still_found() {
        // The case the second pass exists for: the project is in the path and
        // only the file is in the name. Requires a Spotlight index, so it asserts
        // nothing when run somewhere without this repository.
        let hits = search("Cargo.toml tico");
        if !hits.is_empty() {
            assert!(hits[0].to_string_lossy().contains("tico"));
            assert_eq!(label_of(&hits[0]), "Cargo.toml");
        }
    }

    #[test]
    fn urls_are_built_not_searched() {
        assert_eq!(to_url("github").as_deref(), Some("https://github.com"));
        assert_eq!(to_url("crates.io").as_deref(), Some("https://crates.io"));
        assert_eq!(
            to_url("https://example.com/x").as_deref(),
            Some("https://example.com/x")
        );
    }
}
