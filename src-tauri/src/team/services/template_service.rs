use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SwarmTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tasks: Vec<String>,
}

pub struct TemplateService;

impl TemplateService {
    pub fn new() -> Self {
        TemplateService
    }

    pub fn initialize_default_templates(&self, project_path: &str) -> Result<(), String> {
        let nexora_dir = std::path::Path::new(project_path).join(".nexora");
        std::fs::create_dir_all(&nexora_dir)
            .map_err(|e| format!("Failed to create .nexora dir: {}", e))?;
        
        let template_file = nexora_dir.join("team_templates.json");
        if !template_file.exists() {
            let defaults = vec![
                SwarmTemplate {
                    id: "frontend-team".to_string(),
                    name: "Frontend Development".to_string(),
                    description: "Workflow for implementing layouts, views, and routing.".to_string(),
                    tasks: vec![
                        "Design glassmorphic component layout".to_string(),
                        "Create state store bindings".to_string(),
                        "Write automated unit tests".to_string(),
                    ],
                },
                SwarmTemplate {
                    id: "backend-team".to_string(),
                    name: "Backend Development".to_string(),
                    description: "Workflow for backend storage database schemas and event dispatchers.".to_string(),
                    tasks: vec![
                        "Define schema migrations".to_string(),
                        "Write connection pools and handlers".to_string(),
                        "Verify with integration tests".to_string(),
                    ],
                },
            ];
            let json = serde_json::to_string_pretty(&defaults).unwrap();
            let _ = std::fs::write(template_file, json);
        }
        Ok(())
    }

    pub fn get_templates(&self, project_path: &str) -> Result<Vec<SwarmTemplate>, String> {
        let template_file = std::path::Path::new(project_path).join(".nexora").join("team_templates.json");
        if !template_file.exists() {
            return Ok(Vec::new());
        }
        let json = std::fs::read_to_string(template_file).map_err(|e| e.to_string())?;
        let templates: Vec<SwarmTemplate> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        Ok(templates)
    }

    pub fn expand_template(&self, project_path: &str, template_id: &str, prefix: &str) -> Result<Vec<String>, String> {
        let templates = self.get_templates(project_path)?;
        if let Some(t) = templates.iter().find(|temp| temp.id == template_id) {
            let expanded = t.tasks.iter().map(|task| format!("{}: {}", prefix, task)).collect();
            Ok(expanded)
        } else {
            Err(format!("Template '{}' not found", template_id))
        }
    }
}
