pub mod cockpit;
pub mod brand_header;
pub mod palette;
pub mod approval;
pub mod autocomplete;
pub mod notifications;
pub mod markdown;

use owo_colors::OwoColorize;
use nexora_core::theme::Theme;

pub fn print_divider(theme: &Theme, label: Option<&str>) {
    let width = 60;
    let border_style = theme.border;
    if let Some(lbl) = label {
        let padding = (width - lbl.len() - 4) / 2;
        let left = "─".repeat(padding);
        let right = "─".repeat(width - padding - lbl.len() - 2);
        println!(
            "{}",
            format!("{} {} {}", left, lbl, right).style(border_style)
        );
    } else {
        println!("{}", "─".repeat(width).style(border_style));
    }
}

pub fn print_alert(theme: &Theme, level: &str, message: &str) {
    let (icon, color_style, prefix) = match level.to_lowercase().as_str() {
        "success" | "ok" => (theme.icon_ok(), theme.success, "SUCCESS"),
        "warning" | "warn" => (theme.icon_warn(), theme.warning, "WARNING"),
        "error" | "err" => (theme.icon_err(), theme.error, "ERROR"),
        _ => (theme.icon_info(), theme.primary, "INFO"),
    };

    println!(
        "  {} [{}] {}",
        icon.style(color_style),
        prefix.style(color_style).bold(),
        message.bold()
    );
}

pub fn print_panel(theme: &Theme, title: &str, content: &[&str]) {
    let border = theme.border;
    let primary = theme.primary;
    let width = 60;

    println!("  ┌{}┐", "─".repeat(width - 2).style(border));
    let title_padding = width - title.len() - 4;
    println!("  │ {}{}│", title.style(primary).bold(), " ".repeat(title_padding - 2));
    println!("  ├{}┤", "─".repeat(width - 2).style(border));
    
    for line in content {
        let truncated = if line.len() > width - 6 {
            format!("{}...", &line[0..width - 9])
        } else {
            line.to_string()
        };
        let padding = width - truncated.len() - 6;
        println!("  │  {}{}  │", truncated, " ".repeat(padding));
    }
    println!("  └{}┘", "─".repeat(width - 2).style(border));
}

pub fn print_table(theme: &Theme, headers: &[&str], rows: &[Vec<&str>]) {
    let border = theme.border;
    let primary = theme.primary;

    // Output header
    let header_line = headers
        .iter()
        .map(|h| format!("{:<15}", h.style(primary).bold()))
        .collect::<Vec<String>>()
        .join(&"│".style(border).to_string());
    println!("  {}", header_line);
    
    let divider = headers
        .iter()
        .map(|_| "───────────────")
        .collect::<Vec<&str>>()
        .join("┼");
    println!("  {}", divider.style(border));

    // Output rows
    for row in rows {
        let row_line = row
            .iter()
            .map(|r| format!("{:<15}", r))
            .collect::<Vec<String>>()
            .join(&"│".style(border).to_string());
        println!("  {}", row_line);
    }
    println!();
}

pub fn print_code_block(theme: &Theme, lang: &str, code: &str) {
    let border = theme.border;
    println!("  {} [ {} ]", "┌".style(border), lang.bold().cyan());
    for line in code.lines() {
        println!("  {}  {}", "│".style(border), line);
    }
    println!("  {}", "└".style(border));
}

pub fn show_spinner(theme: &Theme, message: &str) -> indicatif::ProgressBar {
    let pb = indicatif::ProgressBar::new_spinner();
    let tick_chars = if theme.unicode_icons {
        "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    } else {
        "-\\|/"
    };
    pb.set_style(
        indicatif::ProgressStyle::default_spinner()
            .tick_chars(tick_chars)
            .template("{spinner:.cyan} {msg}")
            .unwrap(),
    );
    pb.set_message(message.to_string());
    pb.enable_steady_tick(std::time::Duration::from_millis(80));
    pb
}
