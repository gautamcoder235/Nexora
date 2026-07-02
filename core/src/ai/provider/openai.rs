use super::ModelProvider;
use async_stream::stream;
use futures::stream::BoxStream;
use reqwest::Client;
use serde_json::json;
use std::error::Error;

pub struct GenericOpenAIProvider {
    client: Client,
    base_url: String,
    api_key: String,
    auth_header_format: String, // E.g. "Bearer {}"
}

impl GenericOpenAIProvider {
    pub fn new(base_url: &str, api_key: &str, auth_header_format: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.to_string(),
            api_key: api_key.to_string(),
            auth_header_format: auth_header_format.to_string(),
        }
    }
}

impl ModelProvider for GenericOpenAIProvider {
    fn generate<'a>(&'a self, prompt: &'a str, model: &'a str) -> BoxStream<'a, Result<String, Box<dyn Error + Send + Sync>>> {
        let api_key = self.api_key.clone();
        let client = self.client.clone();
        
        let prompt_owned = prompt.to_string();
        let model_owned = model.to_string();
        let base_url_owned = self.base_url.clone();
        let auth_header = self.auth_header_format.replace("{}", &api_key);

        let s = stream! {
            let request_body = json!({
                "model": model_owned,
                "messages": [
                    {"role": "user", "content": prompt_owned}
                ],
                "stream": true
            });

            let mut req = client.post(&base_url_owned)
                .header("Authorization", auth_header)
                .json(&request_body);
                
            // OpenRouter specific headers (benign for others but good to keep)
            if base_url_owned.contains("openrouter.ai") {
                req = req
                    .header("HTTP-Referer", "https://github.com/gautamcoder235/Nexora")
                    .header("X-Title", "Nexora");
            }

            let mut res = match req.send().await {
                Ok(r) => {
                    if !r.status().is_success() {
                        let status = r.status();
                        let text = r.text().await.unwrap_or_default();
                        yield Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("HTTP Error {}: {}", status, text))) as Box<dyn Error + Send + Sync>);
                        return;
                    }
                    r
                },
                Err(e) => {
                    yield Err(Box::new(e) as Box<dyn Error + Send + Sync>);
                    return;
                }
            };

            while let Some(chunk) = res.chunk().await.transpose() {
                match chunk {
                    Ok(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        // SSE parsing
                        for line in text.lines() {
                            if line.starts_with("data: ") && line != "data: [DONE]" {
                                let data = &line[6..];
                                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                                        yield Ok(content.to_string());
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        yield Err(Box::new(e) as Box<dyn Error + Send + Sync>);
                    }
                }
            }
        };

        Box::pin(s)
    }
}
