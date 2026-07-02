use ratatui::widgets::{Block, Borders, Clear, List, ListItem};
use ratatui::layout::{Rect, Layout, Direction, Constraint};
use ratatui::style::{Style, Color, Modifier};
use ratatui::Frame;

pub struct CommandPalette {
    pub is_active: bool,
    pub search_query: String,
    pub selected_index: usize,
    pub items: Vec<String>,
}

impl CommandPalette {
    pub fn new() -> Self {
        Self {
            is_active: false,
            search_query: String::new(),
            selected_index: 0,
            items: vec![
                "Settings".to_string(),
                "Models".to_string(),
                "Providers".to_string(),
                "History".to_string(),
                "Exit".to_string(),
            ],
        }
    }

    pub fn render(&self, f: &mut Frame, area: Rect) {
        if !self.is_active {
            return;
        }

        // Center popup
        let popup_layout = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Percentage(20),
                Constraint::Percentage(60),
                Constraint::Percentage(20),
            ])
            .split(area);

        let inner_layout = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(20),
                Constraint::Percentage(60),
                Constraint::Percentage(20),
            ])
            .split(popup_layout[1]);

        let popup_area = inner_layout[1];
        
        // Clear background
        f.render_widget(Clear, popup_area);

        // Search box and list
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(3), Constraint::Min(1)])
            .split(popup_area);

        let search_block = Block::default()
            .title(" Command Palette (Ctrl+K) ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan));
            
        let search_text = ratatui::widgets::Paragraph::new(format!("> {}", self.search_query))
            .block(search_block)
            .style(Style::default().fg(Color::White));
            
        f.render_widget(search_text, chunks[0]);

        let items: Vec<ListItem> = self.items.iter().enumerate().map(|(i, item)| {
            let style = if i == self.selected_index {
                Style::default().bg(Color::Cyan).fg(Color::Black).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };
            ListItem::new(item.clone()).style(style)
        }).collect();

        let list = List::new(items)
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));

        f.render_widget(list, chunks[1]);
    }
}
