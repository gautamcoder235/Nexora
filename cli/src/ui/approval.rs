use ratatui::widgets::{Block, Borders, Clear};
use ratatui::layout::{Rect, Layout, Direction, Constraint};
use ratatui::style::{Style, Color};
use ratatui::Frame;

pub struct ApprovalDialog {
    pub is_active: bool,
    pub pending_action: Option<String>,
}

impl ApprovalDialog {
    pub fn new() -> Self {
        Self {
            is_active: false,
            pending_action: None,
        }
    }

    pub fn render(&self, f: &mut Frame, area: Rect) {
        if !self.is_active {
            return;
        }
        
        let popup_layout = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Percentage(30),
                Constraint::Percentage(40),
                Constraint::Percentage(30),
            ])
            .split(area);

        let inner_layout = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(30),
                Constraint::Percentage(40),
                Constraint::Percentage(30),
            ])
            .split(popup_layout[1]);

        let popup_area = inner_layout[1];
        
        f.render_widget(Clear, popup_area);
        
        let block = Block::default()
            .title(" Action Approval Required ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Yellow));
            
        let text = match &self.pending_action {
            Some(action) => format!("The AI wants to execute:\n\n> {}\n\nPress [Enter] to Approve, [Esc] to Deny", action),
            None => "Waiting...".to_string(),
        };

        let para = ratatui::widgets::Paragraph::new(text)
            .block(block)
            .style(Style::default().fg(Color::White));
            
        f.render_widget(para, popup_area);
    }
}
