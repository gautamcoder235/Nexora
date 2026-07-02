use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::layout::{Rect, Layout, Direction, Constraint};
use ratatui::style::{Style, Color};
use ratatui::Frame;

pub enum NotificationType {
    Info,
    Success,
    Warning,
    Error,
}

pub struct Notification {
    pub message: String,
    pub notification_type: NotificationType,
}

pub struct NotificationCenter {
    pub active_notification: Option<Notification>,
}

impl NotificationCenter {
    pub fn new() -> Self {
        Self {
            active_notification: None,
        }
    }

    pub fn render(&self, f: &mut Frame, area: Rect) {
        if let Some(notif) = &self.active_notification {
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Min(1), Constraint::Length(3)])
                .split(area);

            let toast_area = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Min(1), Constraint::Length(40)])
                .split(chunks[1])[1];
                
            f.render_widget(Clear, toast_area);
            
            let color = match notif.notification_type {
                NotificationType::Info => Color::Cyan,
                NotificationType::Success => Color::Green,
                NotificationType::Warning => Color::Yellow,
                NotificationType::Error => Color::Red,
            };

            let block = Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(color));
                
            let p = Paragraph::new(notif.message.as_str())
                .block(block)
                .style(Style::default().fg(Color::White));
                
            f.render_widget(p, toast_area);
        }
    }
}
