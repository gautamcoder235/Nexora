// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn ensure_hidden_parent_console() {
    unsafe {
        // Allocate a console for this GUI process
        windows_sys::Win32::System::Console::AllocConsole();
        
        // Find the newly allocated console window
        let hwnd = windows_sys::Win32::System::Console::GetConsoleWindow();
        if hwnd != std::ptr::null_mut() {
            // Instantly hide it
            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                hwnd,
                windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE,
            );
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    ensure_hidden_parent_console();

    nexora_lib::run()
}
