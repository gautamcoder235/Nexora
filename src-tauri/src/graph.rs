use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum RelationType {
    CommandToOutput,
    OutputToTool,
    ToolToAI,
    AIToResult,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub relation: RelationType,
}

#[derive(Default)]
pub struct DocumentGraph {
    pub edges: Vec<Edge>,
}

impl DocumentGraph {
    pub fn add_edge(&mut self, from: &str, to: &str, relation: RelationType) {
        self.edges.push(Edge {
            from: from.to_string(),
            to: to.to_string(),
            relation,
        });
    }
}
