use std::collections::HashMap;

use crate::stream::{StreamEvent, StreamOp};
use crate::cell::{Cell, CellType};
use crate::graph::{DocumentGraph, RelationType};

pub struct ExecutionEngine {
    pub cells: HashMap<String, Cell>,
    pub graph: DocumentGraph,
}

impl ExecutionEngine {

    pub fn new() -> Self {
        Self {
            cells: HashMap::new(),
            graph: DocumentGraph::default(),
        }
    }

    pub fn handle_event(&mut self, event: StreamEvent) {

        match event.op {

            StreamOp::CreateCell => {
                let cell = Cell {
                    id: event.cell_id.clone(),
                    cell_type: CellType::Command,
                    input: event.data.clone(),
                    output_blocks: vec![],
                    created_at: 0,
                    is_active: true,
                };

                self.cells.insert(event.cell_id.clone(), cell);
            }

            StreamOp::Append => {
                // future: stream patch to block system
            }

            StreamOp::CloseCell => {
                if let Some(cell) = self.cells.get_mut(&event.cell_id) {
                    cell.is_active = false;
                }
            }

            StreamOp::PatchBlock => {
                if let Some(block_id) = &event.block_id {
                    if let Some(cell) = self.cells.get_mut(&event.cell_id) {
                        cell.output_blocks.push(block_id.clone());
                    }

                    // graph linkage
                    self.graph.add_edge(
                        &event.cell_id,
                        block_id,
                        RelationType::CommandToOutput,
                    );
                }
            }
        }
    }
}
