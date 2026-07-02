use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

#[derive(Debug, Clone, Copy, PartialEq)]
enum ParserState {
    Normal,
    Thinking,
    CodeBlock,
    ToolCall,
}

pub fn parse_rich_text<'a>(content: &'a str) -> Vec<Line<'a>> {
    let mut lines = Vec::new();
    let mut state = ParserState::Normal;

    let default_style = Style::default();
    let thinking_style = Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC);
    let code_style = Style::default().fg(Color::Cyan); // Distinct style for code blocks
    let tool_style = Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD);

    for raw_line in content.split('\n') {
        let mut line_spans = Vec::new();
        let mut remaining = raw_line;

        while !remaining.is_empty() {
            match state {
                ParserState::Normal => {
                    if let Some(idx) = remaining.find("<think>") {
                        if idx > 0 {
                            line_spans.push(Span::styled(&remaining[..idx], default_style));
                        }
                        state = ParserState::Thinking;
                        remaining = &remaining[idx + 7..];
                    } else if let Some(idx) = remaining.find("<tool_call>") {
                        if idx > 0 {
                            line_spans.push(Span::styled(&remaining[..idx], default_style));
                        }
                        state = ParserState::ToolCall;
                        remaining = &remaining[idx + 11..];
                        line_spans.push(Span::styled(" [⚙ Executing Tool... ", tool_style));
                    } else if let Some(idx) = remaining.find("```") {
                        if idx > 0 {
                            line_spans.push(Span::styled(&remaining[..idx], default_style));
                        }
                        state = ParserState::CodeBlock;
                        remaining = &remaining[idx + 3..];
                    } else {
                        line_spans.push(Span::styled(remaining, default_style));
                        break;
                    }
                }
                ParserState::Thinking => {
                    if let Some(idx) = remaining.find("</think>") {
                        if idx > 0 {
                            line_spans.push(Span::styled(&remaining[..idx], thinking_style));
                        }
                        state = ParserState::Normal;
                        remaining = &remaining[idx + 8..];
                    } else {
                        line_spans.push(Span::styled(remaining, thinking_style));
                        break;
                    }
                }
                ParserState::ToolCall => {
                    if let Some(idx) = remaining.find("</tool_call>") {
                        state = ParserState::Normal;
                        remaining = &remaining[idx + 12..];
                        line_spans.push(Span::styled(" Done] ", tool_style));
                    } else {
                        // Render JSON payload in tool style
                        line_spans.push(Span::styled(remaining, tool_style));
                        break;
                    }
                }
                ParserState::CodeBlock => {
                    if let Some(idx) = remaining.find("```") {
                        if idx > 0 {
                            line_spans.push(Span::styled(&remaining[..idx], code_style));
                        }
                        state = ParserState::Normal;
                        remaining = &remaining[idx + 3..];
                    } else {
                        line_spans.push(Span::styled(remaining, code_style));
                        break;
                    }
                }
            }
        }
        lines.push(Line::from(line_spans));
    }
    
    lines
}
