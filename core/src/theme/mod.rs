use std::io::IsTerminal;
use owo_colors::Style;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ThemeName {
    NeonDark,
    Light,
    HighContrast,
    Minimal,
    NoColor,
    CiMode,
}

#[derive(Clone)]
pub struct Theme {
    pub name: ThemeName,
    pub primary: Style,
    pub success: Style,
    pub warning: Style,
    pub error: Style,
    pub muted: Style,
    pub border: Style,
    pub unicode_icons: bool,
}

impl Theme {
    pub fn new(name: ThemeName) -> Self {
        let is_atty = std::io::stdout().is_terminal();
        if name == ThemeName::NoColor || name == ThemeName::CiMode || !is_atty {
            return Self::no_color();
        }

        match name {
            ThemeName::NeonDark => Self {
                name,
                primary: Style::new().cyan().bold(),
                success: Style::new().green(),
                warning: Style::new().yellow(),
                error: Style::new().red().bold(),
                muted: Style::new().truecolor(100, 116, 139), // Slate
                border: Style::new().truecolor(39, 39, 42),   // Zinc
                unicode_icons: true,
            },
            ThemeName::Light => Self {
                name,
                primary: Style::new().blue().bold(),
                success: Style::new().green(),
                warning: Style::new().yellow(),
                error: Style::new().red().bold(),
                muted: Style::new().truecolor(100, 116, 139),
                border: Style::new().truecolor(200, 200, 200),
                unicode_icons: true,
            },
            ThemeName::HighContrast => Self {
                name,
                primary: Style::new().white().bold().underline(),
                success: Style::new().bright_green().bold(),
                warning: Style::new().bright_yellow().bold(),
                error: Style::new().bright_red().bold(),
                muted: Style::new().white(),
                border: Style::new().white().bold(),
                unicode_icons: true,
            },
            ThemeName::Minimal => Self {
                name,
                primary: Style::new().bold(),
                success: Style::new(),
                warning: Style::new(),
                error: Style::new().bold(),
                muted: Style::new().dimmed(),
                border: Style::new(),
                unicode_icons: false,
            },
            ThemeName::NoColor | ThemeName::CiMode => Self::no_color(),
        }
    }

    fn no_color() -> Self {
        Self {
            name: ThemeName::NoColor,
            primary: Style::new(),
            success: Style::new(),
            warning: Style::new(),
            error: Style::new(),
            muted: Style::new(),
            border: Style::new(),
            unicode_icons: false,
        }
    }

    pub fn icon_ok(&self) -> &'static str {
        if self.unicode_icons { "✔" } else { "[OK]" }
    }

    pub fn icon_err(&self) -> &'static str {
        if self.unicode_icons { "✖" } else { "[ERR]" }
    }

    pub fn icon_warn(&self) -> &'static str {
        if self.unicode_icons { "▲" } else { "[WARN]" }
    }

    pub fn icon_info(&self) -> &'static str {
        if self.unicode_icons { "ℹ" } else { "[INFO]" }
    }
}
