use std::collections::{HashMap, VecDeque};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use portable_pty::{MasterPty, Child};
use crate::stream::{StreamEvent, StreamOp};
use crate::execution_engine::ExecutionEngine;
use crate::terminal::state::TerminalState;
use vte::Parser;

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Visibility {
    Visible,
    Hidden,
    Collapsed,
    Background,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TerminalChunk {
    pub id: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    pub text: String,
    #[serde(rename = "byteCount")]
    pub byte_count: usize,
}

pub struct PtySession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send>,
    pub visibility: Visibility,
    pub document: crate::document::WorkspaceDocument,
    pub engine: ExecutionEngine,
    pub terminal_state: TerminalState,
    pub vte_parser: Parser,
    
    // Telemetry and Metrics
    pub start_time: Instant,
    pub total_bytes_written: usize,
    pub total_messages_sent: usize,
    pub peak_batch_size: usize,
    pub flush_latencies: VecDeque<u128>, // microseconds
}

impl PtySession {
    pub fn new(
        id: String,
        writer: Box<dyn Write + Send>,
        master: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send>,
        max_bytes: usize,
    ) -> Self {
        Self {
            id: id.clone(),
            writer,
            master,
            child,
            visibility: Visibility::Visible, // Default to visible
            document: crate::document::WorkspaceDocument::new(max_bytes),
            engine: {
                let mut engine = ExecutionEngine::new();
                engine.handle_event(StreamEvent {
                    op: StreamOp::CreateCell,
                    session_id: id.clone(),
                    cell_id: format!("{}-cell-1", id),
                    block_id: None,
                    data: Some("Initial Session".to_string()),
                });
                engine
            },
            terminal_state: TerminalState::new(100, 30, 1000), // 100 columns, 30 rows, 1000 scrollback
            vte_parser: Parser::new(),
            start_time: Instant::now(),
            total_bytes_written: 0,
            total_messages_sent: 0,
            peak_batch_size: 0,
            flush_latencies: VecDeque::with_capacity(100),
        }
    }

    pub fn set_visibility(&mut self, visibility: Visibility) {
        self.visibility = visibility;
    }

    /// Append a data chunk to the queue, enforcing bounded memory limits.
    pub fn append_chunk(&mut self, text: String) {
        let byte_count = text.len();
        if byte_count == 0 {
            return;
        }

        // Enforce telemetry tracking
        self.total_bytes_written += byte_count;
        self.total_messages_sent += 1;
        if byte_count > self.peak_batch_size {
            self.peak_batch_size = byte_count;
        }

        // Add to document
        // For Stage 2, group continuous output into a single block to prevent massive block spam
        let block_id = format!("{}-block-output", self.id);
        self.document.append_text(text.clone(), block_id.clone());

        // Stage 3 Engine Pipeline
        let event = StreamEvent {
            op: StreamOp::PatchBlock,
            session_id: self.id.clone(),
            cell_id: format!("{}-cell-1", self.id),
            block_id: Some(block_id),
            data: Some(text),
        };
        self.engine.handle_event(event);
    }

    pub fn record_flush_latency(&mut self, latency_micros: u128) {
        if self.flush_latencies.len() >= 100 {
            self.flush_latencies.pop_front();
        }
        self.flush_latencies.push_back(latency_micros);
    }
}

// Global registry singleton
static SESSION_MANAGER: OnceLock<Mutex<HashMap<String, PtySession>>> = OnceLock::new();

pub fn get_sessions() -> &'static Mutex<HashMap<String, PtySession>> {
    SESSION_MANAGER.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(serde::Serialize, Clone)]
pub struct TelemetryReport {
    #[serde(rename = "activeSessions")]
    pub active_sessions: usize,
    #[serde(rename = "visibleTerminals")]
    pub visible_terminals: usize,
    #[serde(rename = "hiddenTerminals")]
    pub hidden_terminals: usize,
    #[serde(rename = "totalBytesSec")]
    pub total_bytes_sec: f64,
    #[serde(rename = "totalMsgsSec")]
    pub total_msgs_sec: f64,
    #[serde(rename = "avgBatchSize")]
    pub avg_batch_size: f64,
    #[serde(rename = "peakBatchSize")]
    pub peak_batch_size: usize,
    #[serde(rename = "memoryUsageBytes")]
    pub memory_usage_bytes: usize,
    #[serde(rename = "avgFlushLatencyMs")]
    pub avg_flush_latency_ms: f64,
}

pub fn generate_telemetry_report() -> TelemetryReport {
    let sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    let active_sessions = sessions.len();
    let mut visible_terminals = 0;
    let mut hidden_terminals = 0;
    
    let mut total_bytes = 0;
    let mut total_msgs = 0;
    let mut peak_batch = 0;
    let mut total_memory = 0;
    let mut total_latency_sum = 0.0;
    let mut total_latency_count = 0;
    
    let mut elapsed_secs = 0.0;

    for session in sessions.values() {
        match session.visibility {
            Visibility::Visible => visible_terminals += 1,
            Visibility::Hidden | Visibility::Collapsed => hidden_terminals += 1,
            Visibility::Background => {}
        }

        total_bytes += session.total_bytes_written;
        total_msgs += session.total_messages_sent;
        if session.peak_batch_size > peak_batch {
            peak_batch = session.peak_batch_size;
        }
        total_memory += session.document.get_total_bytes_in_memory();

        let session_elapsed = session.start_time.elapsed().as_secs_f64();
        if session_elapsed > elapsed_secs {
            elapsed_secs = session_elapsed;
        }

        let latencies = &session.flush_latencies;
        if !latencies.is_empty() {
            let sum: u128 = latencies.iter().sum();
            total_latency_sum += (sum as f64) / 1000.0; // convert micros to ms
            total_latency_count += latencies.len();
        }
    }

    if elapsed_secs == 0.0 {
        elapsed_secs = 1.0;
    }

    let avg_batch = if total_msgs > 0 {
        (total_bytes as f64) / (total_msgs as f64)
    } else {
        0.0
    };

    let avg_flush = if total_latency_count > 0 {
        total_latency_sum / (total_latency_count as f64)
    } else {
        0.0
    };

    TelemetryReport {
        active_sessions,
        visible_terminals,
        hidden_terminals,
        total_bytes_sec: (total_bytes as f64) / elapsed_secs,
        total_msgs_sec: (total_msgs as f64) / elapsed_secs,
        avg_batch_size: avg_batch,
        peak_batch_size: peak_batch,
        memory_usage_bytes: total_memory,
        avg_flush_latency_ms: avg_flush,
    }
}
