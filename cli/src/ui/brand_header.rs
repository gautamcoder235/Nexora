use ratatui::{
    layout::{Constraint, Direction, Layout, Rect, Margin},
    style::{Color, Modifier, Style as RatatuiStyle},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};
use crate::runtime::ServiceContainer;
use crate::ui::cockpit::CockpitState;

pub struct BrandHeader;

impl BrandHeader {
    pub fn draw(f: &mut Frame, area: Rect, services: &ServiceContainer, state: &CockpitState) {
        if area.height >= 7 {
            // ==========================================
            // Restored Split Layout with Slant ASCII Art
            // ==========================================
            let outer_block = Block::default()
                .borders(Borders::ALL)
                .border_style(RatatuiStyle::default().fg(Color::DarkGray))
                .title(" Nexora Cockpit v1.0.0 ");
            f.render_widget(outer_block, area);

            let inner_area = area.inner(&Margin { vertical: 1, horizontal: 2 });
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Min(57),
                    Constraint::Length(42),
                ])
                .split(inner_area);

            // True Rigid Geometry Kerning - perfectly slanted across 47 columns (1 visual space minimum)
            const SLANT_LOGO: [&str; 5] = [
                r#"    _   __  ______  _  __  ____    ____    ___ "#,
                r#"   / | / / / ____/ | |/ / / __ \  / __ \  /   |"#,
                r#"  /  |/ / / __/    |   / / / / / / /_/ / / /| |"#,
                r#" / /|  / / /___   /   | / /_/ / / _  _/ / ___ |"#,
                r#"/_/ |_/ /_____/  /_/|_| \____/ /_/ |_| /_/  |_|"#,
            ];

            let colors: [Color; 47] = [
                Color::Rgb(0, 255, 255), Color::Rgb(0, 255, 238), Color::Rgb(0, 255, 221), Color::Rgb(0, 255, 204),
                Color::Rgb(0, 255, 187), Color::Rgb(0, 255, 171), Color::Rgb(0, 255, 154), Color::Rgb(0, 255, 137),
                Color::Rgb(0, 255, 120), Color::Rgb(0, 255, 103), Color::Rgb(0, 255, 87), Color::Rgb(0, 255, 70),
                Color::Rgb(0, 255, 53), Color::Rgb(0, 255, 36), Color::Rgb(0, 255, 19), Color::Rgb(0, 255, 3),
                Color::Rgb(13, 255, 0), Color::Rgb(30, 255, 0), Color::Rgb(47, 255, 0), Color::Rgb(64, 255, 0),
                Color::Rgb(80, 255, 0), Color::Rgb(97, 255, 0), Color::Rgb(114, 255, 0), Color::Rgb(131, 255, 0),
                Color::Rgb(148, 255, 0), Color::Rgb(164, 255, 0), Color::Rgb(181, 255, 0), Color::Rgb(198, 255, 0),
                Color::Rgb(215, 255, 0), Color::Rgb(232, 255, 0), Color::Rgb(248, 255, 0), Color::Rgb(255, 244, 0),
                Color::Rgb(255, 228, 0), Color::Rgb(255, 211, 0), Color::Rgb(255, 195, 0), Color::Rgb(255, 179, 0),
                Color::Rgb(255, 163, 0), Color::Rgb(255, 146, 0), Color::Rgb(255, 130, 0), Color::Rgb(255, 114, 0),
                Color::Rgb(255, 97, 0), Color::Rgb(255, 81, 0), Color::Rgb(255, 65, 0), Color::Rgb(255, 48, 0),
                Color::Rgb(255, 32, 0), Color::Rgb(255, 16, 0), Color::Rgb(255, 0, 0),
            ];

            let mut brand_lines: Vec<Line> = Vec::new();

            for line in SLANT_LOGO.iter() {
                let mut spans = vec![Span::raw("  ")]; // left indent
                for (i, ch) in line.chars().enumerate() {
                    let color = colors.get(i).copied().unwrap_or(Color::White);
                    let style = if ch != ' ' {
                        RatatuiStyle::default().fg(color).add_modifier(Modifier::BOLD)
                    } else {
                        RatatuiStyle::default()
                    };
                    spans.push(Span::styled(ch.to_string(), style));
                }
                brand_lines.push(Line::from(spans));
            }

            // Workspace and Profile info moved to Dashboard status overview.

            // 2. Any extra vertical space goes at the bottom as padding
            let spacer_count = inner_area.height.saturating_sub(5);
            for _ in 0..spacer_count {
                brand_lines.push(Line::from(""));
            }

            let brand_para = Paragraph::new(brand_lines);
            f.render_widget(brand_para, chunks[0]);

            // ── Right status panel (Aligned to the top) ──
            let mut status_lines = Vec::new();

            let is_connected = services.ipc.lock().is_connected();
            let conn_span = if is_connected {
                Span::styled("● Active (Named Pipe)", RatatuiStyle::default().fg(Color::Green).add_modifier(Modifier::BOLD))
            } else {
                Span::styled("○ Offline", RatatuiStyle::default().fg(Color::Red).add_modifier(Modifier::BOLD))
            };

            status_lines.push(Line::from(vec![
                Span::styled("  Desktop App:  ", RatatuiStyle::default().fg(Color::Gray)),
                conn_span,
            ]));

            status_lines.push(Line::from(vec![
                Span::styled("  Model Engine: ", RatatuiStyle::default().fg(Color::Gray)),
                Span::styled(
                    services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()),
                    RatatuiStyle::default().fg(Color::Rgb(100, 182, 246))
                ),
            ]));

            status_lines.push(Line::from(vec![
                Span::styled("  IPC Latency:  ", RatatuiStyle::default().fg(Color::Gray)),
                Span::styled(format!("{} ms", state.latency_ms), RatatuiStyle::default().fg(Color::Yellow)),
            ]));

            status_lines.push(Line::from(vec![
                Span::styled("  Core Cache:   ", RatatuiStyle::default().fg(Color::Gray)),
                Span::styled("redb persistent key-value", RatatuiStyle::default().fg(Color::DarkGray)),
            ]));

            let status_para = Paragraph::new(status_lines);
            f.render_widget(status_para, chunks[1]);

        } else if area.height >= 3 {
            // ==========================================
            // Semi-Compact Layout (3 lines)
            // ==========================================
            let outer_block = Block::default()
                .borders(Borders::ALL)
                .border_style(RatatuiStyle::default().fg(Color::DarkGray))
                .title(" Nexora ");

            let is_connected = services.ipc.lock().is_connected();
            let conn_str = if is_connected { "● Online" } else { "○ Offline" };
            let conn_color = if is_connected { Color::Green } else { Color::Red };

            let text = vec![
                Line::from(vec![
                    Span::styled(" ▲ NEXORA ", RatatuiStyle::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::raw(" | Model: "),
                    Span::styled(services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()), RatatuiStyle::default().fg(Color::Cyan)),
                    Span::raw(" | Profile: "),
                    Span::styled(&services.config.active_profile, RatatuiStyle::default().fg(Color::Magenta)),
                    Span::raw(" | Desktop: "),
                    Span::styled(conn_str, RatatuiStyle::default().fg(conn_color).add_modifier(Modifier::BOLD)),
                ])
            ];

            let para = Paragraph::new(text).block(outer_block);
            f.render_widget(para, area);

        } else if area.height >= 1 {
            // ==========================================
            // Mini Minimal Inline Bar (1 line)
            // ==========================================
            let is_connected = services.ipc.lock().is_connected();
            let conn_str = if is_connected { "●" } else { "○" };
            let conn_color = if is_connected { Color::Green } else { Color::Red };

            let text = vec![
                Line::from(vec![
                    Span::styled(" ▲ NX ", RatatuiStyle::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(conn_str, RatatuiStyle::default().fg(conn_color)),
                    Span::raw(" | "),
                    Span::styled(services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()), RatatuiStyle::default().fg(Color::Cyan)),
                    Span::raw(" | Profile: "),
                    Span::styled(&services.config.active_profile, RatatuiStyle::default().fg(Color::Magenta)),
                ])
            ];

            let para = Paragraph::new(text);
            f.render_widget(para, area);
        }
    }
}
