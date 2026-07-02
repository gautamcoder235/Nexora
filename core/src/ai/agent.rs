pub struct AgentRuntime {
    pub credential_manager: crate::config::credentials::CredentialManager,
    pub session_manager: crate::ai::session::SessionManager,
    pub intent_analyzer: crate::ai::intent::IntentAnalyzer,
    pub tool_registry: crate::ai::tools::ToolRegistry,
}

impl AgentRuntime {
    pub fn new() -> Self {
        let registry = crate::ai::tools::ToolRegistry::new();
        registry.register(std::sync::Arc::new(crate::ai::tools::fs::WriteFileTool));
        registry.register(std::sync::Arc::new(crate::ai::tools::fs::ReadFileTool));
        registry.register(std::sync::Arc::new(crate::ai::tools::fs::ListDirTool));
        registry.register(std::sync::Arc::new(crate::ai::tools::fs::ReplaceFileContentTool));
        registry.register(std::sync::Arc::new(crate::ai::tools::fs::GrepSearchTool));
        registry.register(std::sync::Arc::new(crate::ai::tools::cmd::RunCommandTool));

        Self {
            credential_manager: crate::config::credentials::CredentialManager::new(),
            session_manager: crate::ai::session::SessionManager::new(),
            intent_analyzer: crate::ai::intent::IntentAnalyzer::new(),
            tool_registry: registry,
        }
    }
    
    pub async fn init(&self) {
        let _ = self.credential_manager.load_from_config().await;
    }
    
    pub async fn chat(&self, provider: &str, model: &str, prompt: &str) -> String {
        use futures::StreamExt;
        
        let mut stream = self.chat_stream(provider, model, prompt);
        let mut full_response = String::new();
        
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(text) => full_response.push_str(&text),
                Err(e) => {
                    full_response.push_str(&format!("\n[Error: {}]", e));
                    break;
                }
            }
        }
        
        full_response
    }

    pub fn chat_stream<'a>(&'a self, provider: &'a str, model: &'a str, prompt: &'a str) -> futures::stream::BoxStream<'a, Result<String, Box<dyn std::error::Error + Send + Sync>>> {
        use crate::ai::provider::factory::ProviderFactory;
        use async_stream::stream;
        
        let provider_owned = provider.to_string();
        let model_owned = model.to_string();
        let prompt_owned = prompt.to_string();
        let cred_mgr = self.credential_manager.clone();
        let tool_registry = self.tool_registry.clone();
        
        let s = stream! {
            let _ = cred_mgr.load_from_config().await;
            
            let config = match cred_mgr.get_provider_config(&provider_owned, &model_owned).await {
                Some(c) => c,
                None => {
                    yield Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("API Key for provider '{}' not found in config.toml or environment variables", provider_owned))) as Box<dyn std::error::Error + Send + Sync>);
                    return;
                }
            };
            
            let provider_impl = match ProviderFactory::create_provider(&config) {
                Some(p) => p,
                None => {
                    yield Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Provider '{}' is not supported by ProviderFactory", provider_owned))) as Box<dyn std::error::Error + Send + Sync>);
                    return;
                }
            };
            
            let tools = tool_registry.list_tools();
            let mut sys_prompt = String::new();
            if !tools.is_empty() {
                sys_prompt.push_str("You are Nexora AI, an autonomous system capable of taking actions. You have access to the following tools. To use a tool, output a block starting EXACTLY with `<tool_call>` followed by a JSON object with 'name' and 'args' keys, and ending EXACTLY with `</tool_call>`. After the tool executes, you will receive the result in a `<tool_result>` block, after which you should continue your response to the user. Do NOT invent tools. If you use a tool, your output MUST end immediately after `</tool_call>`.\n\n");
                for tool in tools {
                    sys_prompt.push_str(&format!("Tool: {}\nDescription: {}\nSchema: {}\n\n", tool.name(), tool.description(), serde_json::to_string_pretty(&tool.schema()).unwrap_or_default()));
                }
            }

            let mut current_prompt = if sys_prompt.is_empty() { 
                prompt_owned.clone() 
            } else { 
                format!("System Instructions:\n{}\n\nUser Request:\n{}", sys_prompt, prompt_owned) 
            };

            let mut iterations = 0;
            loop {
                iterations += 1;
                if iterations > 5 {
                    yield Ok("\n\n[Agent stopped to prevent infinite execution loop. Max tool iterations reached.]".to_string());
                    break;
                }
                
                let mut full_response = String::new();
                
                {
                    let mut inner_stream = provider_impl.generate(&current_prompt, &model_owned);
                    use futures::StreamExt;
                    while let Some(chunk_res) = inner_stream.next().await {
                        match chunk_res {
                            Ok(chunk) => {
                                full_response.push_str(&chunk);
                                yield Ok(chunk);
                            },
                            Err(e) => {
                                yield Err(e);
                                return;
                            }
                        }
                    }
                }
                
                // Stream finished for this turn. Check if the LLM called a tool.
                if let Some(start_idx) = full_response.find("<tool_call>") {
                    if let Some(end_idx) = full_response[start_idx..].find("</tool_call>") {
                        let json_start = start_idx + 11;
                        let json_end = start_idx + end_idx;
                        let json_str = &full_response[json_start..json_end];
                        
                        let result_msg = match serde_json::from_str::<serde_json::Value>(json_str) {
                            Ok(parsed) => {
                                let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                let args = parsed.get("args").cloned().unwrap_or(serde_json::json!({}));
                                
                                if let Some(tool) = tool_registry.get(name) {
                                    match tool.execute(args).await {
                                        Ok(res) => format!("Success: {}", res.to_string()),
                                        Err(e) => format!("Error executing tool: {}", e),
                                    }
                                } else {
                                    format!("Error: Tool '{}' not found", name)
                                }
                            }
                            Err(e) => format!("Error: Invalid JSON payload in tool call: {}", e),
                        };
                        
                        // Append the tool result and continue the loop!
                        current_prompt.push_str("\n\nAssistant: ");
                        current_prompt.push_str(&full_response);
                        current_prompt.push_str(&format!("\n<tool_result>\n{}\n</tool_result>\nContinue your response.", result_msg));
                        continue;
                    }
                }
                
                // If no complete tool call was found, the LLM has finished its thought process.
                break;
            }
        };
        
        Box::pin(s)
    }
}
