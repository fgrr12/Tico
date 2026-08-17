use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::actions;
use serde_json::json;

/// Ollama's default port. Nothing here ever leaves the machine.
const OLLAMA: &str = "http://127.0.0.1:11434";
/// Long enough for a cold model load on a slow machine, short enough that a pet
/// staring into space eventually gives up and says so.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(90);
/// Detection has to be quick — it runs before every answer and on startup.
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Serialize)]
pub struct BrainStatus {
    available: bool,
    model: Option<String>,
}

#[derive(Deserialize)]
struct Tags {
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
struct TagModel {
    name: String,
    size: u64,
}

#[derive(Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

/// What the model is allowed to answer with. `mood` is a closed list because the
/// frontend executes it — an invented mood is a dead branch, not a surprise.
#[derive(Debug, Default, Deserialize, Serialize)]
pub struct Answer {
    pub say: String,
    #[serde(default)]
    pub mood: Option<String>,
    /// One of the actions below, or `answer`. The frontend decides what to do
    /// with it; Rust decides what the list is, because Rust is what executes it.
    #[serde(default)]
    pub action: Option<String>,
    /// Search terms only. Never a path — see the note in `actions.rs`.
    #[serde(default)]
    pub query: Option<String>,
}

#[derive(Deserialize)]
struct Intent {
    action: String,
    #[serde(default)]
    query: String,
}

/// The parser's contract, and it lives here rather than with the persona copy
/// because it is a description of what Rust can execute, not of who he is.
const INTENT_RULES: &str = "\
You are the intent parser for a desktop assistant. Turn what the user says into \
an action.

Actions:
- open_file: they want a file or folder opened. `query` = the words to search \
for, nothing else.
- reveal_file: they want to SEE where something is, not open it. `query` = \
search words.
- open_url: they want a website. `query` = the url or the bare site name.
- answer: anything else — a question, a comment, small talk.

Rules: `query` holds ONLY search terms, never a sentence, and never a path you \
invented. If unsure, use answer.

A QUESTION is always `answer`, even when it contains the word open. Only an \
INSTRUCTION to open something is open_file. If you cannot name a specific file \
in their words, it is `answer`.

Examples:
  \"qué tengo abierto\"           -> answer          (a question about the screen)
  \"what am I looking at\"        -> answer
  \"cuál archivo tengo abierto\"  -> answer
  \"abrime el Companion.tsx\"     -> open_file, query \"Companion.tsx\"
  \"open my cv\"                  -> open_file, query \"cv\"
  \"dónde está el plan\"          -> reveal_file, query \"plan\"
  \"andá a github\"               -> open_url, query \"github\"";

/// Classification wants a cold model and an answer wants a warm one, which is
/// most of why this is two calls rather than one schema doing both. The other
/// half is latency where it is felt: opening a file returns after this call
/// alone, and only a real question pays for the second.
async fn classify(question: &str) -> Intent {
    let fallback = Intent {
        action: "answer".into(),
        query: String::new(),
    };

    let body = json!({
        "model": "",
        "stream": false,
        "format": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["open_file", "reveal_file", "open_url", "answer"]
                },
                "query": { "type": "string" }
            },
            "required": ["action", "query"]
        },
        "options": { "temperature": 0.1, "num_predict": 80 },
        "messages": [
            { "role": "system", "content": INTENT_RULES },
            { "role": "user", "content": question }
        ]
    });

    let Some(model) = smallest_model().await else {
        return fallback;
    };

    let mut body = body;
    body["model"] = json!(model);

    let response = reqwest::Client::new()
        .post(format!("{OLLAMA}/api/chat"))
        .timeout(ANSWER_TIMEOUT)
        .json(&body)
        .send()
        .await;

    let Ok(response) = response else { return fallback };
    let Ok(chat) = response.json::<ChatResponse>().await else {
        return fallback;
    };

    serde_json::from_str::<Intent>(&chat.message.content).unwrap_or(fallback)
}

#[derive(Deserialize)]
pub struct AskRequest {
    /// Built in the frontend, where the rest of his personality lives.
    system: String,
    question: String,
}

/// The smallest installed model wins.
///
/// For a pet, latency beats quality every time: a short answer in one second is
/// company, and a better one in eight is a spinner with a face. Embedding models
/// are filtered out — they are small, and they cannot chat.
async fn smallest_model() -> Option<String> {
    let tags: Tags = reqwest::Client::new()
        .get(format!("{OLLAMA}/api/tags"))
        .timeout(PROBE_TIMEOUT)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    tags.models
        .into_iter()
        .filter(|model| !model.name.contains("embed"))
        .min_by_key(|model| model.size)
        .map(|model| model.name)
}

#[tauri::command]
pub async fn brain_status() -> BrainStatus {
    let model = smallest_model().await;
    BrainStatus {
        available: model.is_some(),
        model,
    }
}

#[tauri::command]
pub async fn ask(request: AskRequest) -> Result<Answer, String> {
    let Some(model) = smallest_model().await else {
        return Err("no-brain".into());
    };

    // Something to do outranks something to say: if this is a request to open
    // anything, it returns here and never pays for a second round trip.
    // The classifier is right about nine times in ten. `is_searchable` catches
    // most of the tenth: a query with nothing distinctive left in it is a
    // question wearing a verb, and answering it is both safer and more useful —
    // especially now that the window title is in the prompt.
    let intent = classify(&request.question).await;
    let actionable = intent.action == "open_url" || actions::is_searchable(&intent.query);

    if intent.action != "answer" && actionable {
        return Ok(Answer {
            say: String::new(),
            mood: Some("happy".into()),
            action: Some(intent.action),
            query: Some(intent.query),
        });
    }

    let body = json!({
        "model": model,
        "stream": false,
        // Structured output, the same technique as the farm app's Whisper
        // pipeline: the model cannot answer with anything the frontend does not
        // already know how to execute.
        "format": {
            "type": "object",
            "properties": {
                "say": { "type": "string" },
                "mood": {
                    "type": "string",
                    "enum": ["idle", "happy", "wow", "love", "dizzy", "watching"]
                }
            },
            // `mood` is required: left optional the model simply skips it, and he
            // ends up wearing the same default face for every answer.
            "required": ["say", "mood"]
        },
        "options": {
            "temperature": 0.7,
            // A pet interrupts you with one sentence, not an essay. The prompt asks
            // for 30 words; this is the ceiling if it does not listen.
            "num_predict": 120
        },
        "messages": [
            { "role": "system", "content": request.system },
            { "role": "user", "content": request.question }
        ]
    });

    let response: ChatResponse = reqwest::Client::new()
        .post(format!("{OLLAMA}/api/chat"))
        .timeout(ANSWER_TIMEOUT)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("unreachable: {error}"))?
        .json()
        .await
        .map_err(|error| format!("unreadable: {error}"))?;

    // Constrained decoding makes this parse essentially always succeed, but
    // "essentially" is not "always" — and a pet that prints raw JSON at you is
    // worse than one that stays quiet.
    let mut answer: Answer = serde_json::from_str(&response.message.content)
        .map_err(|error| format!("unparseable: {error}"))?;

    answer.action = Some("answer".into());
    Ok(answer)
}
