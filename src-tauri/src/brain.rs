use std::time::Duration;

use serde::{Deserialize, Serialize};
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
    serde_json::from_str::<Answer>(&response.message.content)
        .map_err(|error| format!("unparseable: {error}"))
}
