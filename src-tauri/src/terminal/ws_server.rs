use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use std::sync::OnceLock;
use tokio::sync::broadcast;
use crate::diff::builder::DiffPayload;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum WsMessage {
    #[serde(rename = "diff")]
    Diff {
        #[serde(rename = "sessionId")]
        session_id: String,
        diffs: Vec<crate::diff::builder::CellDiff>,
        cursor_x: usize,
        cursor_y: usize,
    },
    #[serde(rename = "input")]
    Input { data: String, session_id: String },
}

static TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

pub fn get_tx() -> broadcast::Sender<String> {
    TX.get_or_init(|| {
        let (tx, _) = broadcast::channel(100);
        tx
    }).clone()
}

pub fn broadcast_diff(payload: DiffPayload) {
    let msg = WsMessage::Diff {
        session_id: payload.session_id,
        diffs: payload.diffs,
        cursor_x: payload.cursor_x,
        cursor_y: payload.cursor_y,
    };
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = get_tx().send(json);
    }
}

pub async fn start_server() {
    let addr = "127.0.0.1:9999";
    let listener = TcpListener::bind(&addr).await.expect("Can't listen");
    println!("WebSocket listening on: {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(stream));
    }
}

async fn handle_connection(stream: TcpStream) {
    let ws_stream = accept_async(stream).await.expect("Failed to accept");
    let (mut write, mut read) = ws_stream.split();
    let mut rx = get_tx().subscribe();

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            if let Ok(tokio_tungstenite::tungstenite::Message::Text(text)) = msg {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let WsMessage::Input { data, session_id } = ws_msg {
                        // Write to PTY session
                        if let Ok(mut sessions) = crate::session::get_sessions().lock() {
                            if let Some(session) = sessions.get_mut(&session_id) {
                                let _ = session.writer.write_all(data.as_bytes());
                                let _ = session.writer.flush();
                            }
                        }
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
