// Custom OLE IDropTarget implementation for handling both file and text drops.
// This replaces Tauri/wry's default file-only drop handler with one that
// also captures text dragged from external applications (Notepad, Chrome, etc.)

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

// We define all COM/Win32 types ourselves to avoid windows-sys feature hunting.
type HWND = isize;
type HRESULT = i32;
type HGLOBAL = *mut std::ffi::c_void;
type HDROP = *mut std::ffi::c_void;
type LPVOID = *mut std::ffi::c_void;
type BOOL = i32;

const S_OK: HRESULT = 0;
const E_NOINTERFACE: HRESULT = -2147467262i32; // 0x80004002
const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_NONE: u32 = 0;
const CF_HDROP: u16 = 15;
const CF_UNICODETEXT: u16 = 13;
const TYMED_HGLOBAL: u32 = 1;
const DVASPECT_CONTENT: u32 = 1;

#[repr(C)]
#[derive(Copy, Clone)]
struct GUID {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

const IID_IUNKNOWN: GUID = GUID {
    data1: 0x00000000, data2: 0x0000, data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const IID_IDROPTARGET: GUID = GUID {
    data1: 0x00000122, data2: 0x0000, data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

#[repr(C)]
struct FORMATETC {
    cf_format: u16,
    ptd: LPVOID,
    dw_aspect: u32,
    lindex: i32,
    tymed: u32,
}

#[repr(C)]
struct STGMEDIUM {
    tymed: u32,
    h_global: HGLOBAL,
    p_unk_for_release: LPVOID,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct POINTL {
    x: i32,
    y: i32,
}

// IDataObject vtable (only the methods we need)
#[repr(C)]
struct IDataObjectVtbl {
    query_interface: unsafe extern "system" fn(LPVOID, *const GUID, *mut LPVOID) -> HRESULT,
    add_ref: unsafe extern "system" fn(LPVOID) -> u32,
    release: unsafe extern "system" fn(LPVOID) -> u32,
    get_data: unsafe extern "system" fn(LPVOID, *const FORMATETC, *mut STGMEDIUM) -> HRESULT,
}

#[repr(C)]
struct IDataObjectRaw {
    vtbl: *const IDataObjectVtbl,
}

// IDropTarget vtable
#[repr(C)]
struct IDropTargetVtbl {
    query_interface: unsafe extern "system" fn(*mut DropTargetObj, *const GUID, *mut LPVOID) -> HRESULT,
    add_ref: unsafe extern "system" fn(*mut DropTargetObj) -> u32,
    release: unsafe extern "system" fn(*mut DropTargetObj) -> u32,
    drag_enter: unsafe extern "system" fn(*mut DropTargetObj, LPVOID, u32, POINTL, *mut u32) -> HRESULT,
    drag_over: unsafe extern "system" fn(*mut DropTargetObj, u32, POINTL, *mut u32) -> HRESULT,
    drag_leave: unsafe extern "system" fn(*mut DropTargetObj) -> HRESULT,
    drop: unsafe extern "system" fn(*mut DropTargetObj, LPVOID, u32, POINTL, *mut u32) -> HRESULT,
}

// Our COM object
#[repr(C)]
struct DropTargetObj {
    vtbl: *const IDropTargetVtbl,
    ref_count: std::sync::atomic::AtomicU32,
    app_handle: Arc<AppHandle>,
    has_files: std::cell::Cell<bool>,
    has_text: std::cell::Cell<bool>,
}

// Serde payloads for Tauri events
#[derive(serde::Serialize, Clone)]
struct FileDropPayload {
    paths: Vec<String>,
    position: PositionPayload,
}

#[derive(serde::Serialize, Clone)]
struct TextDropPayload {
    text: String,
    position: PositionPayload,
}

#[derive(serde::Serialize, Clone)]
struct DragPositionPayload {
    position: PositionPayload,
}

#[derive(serde::Serialize, Clone)]
struct PositionPayload {
    x: f64,
    y: f64,
}

// Win32 FFI
extern "system" {
    fn OleInitialize(reserved: LPVOID) -> HRESULT;
    fn RegisterDragDrop(hwnd: HWND, drop_target: LPVOID) -> HRESULT;
    fn RevokeDragDrop(hwnd: HWND) -> HRESULT;
    fn DragQueryFileW(hdrop: HDROP, ifile: u32, buf: *mut u16, cch: u32) -> u32;
    fn GlobalLock(hmem: HGLOBAL) -> LPVOID;
    fn GlobalUnlock(hmem: HGLOBAL) -> BOOL;
    fn GlobalFree(hmem: HGLOBAL) -> HGLOBAL;
    fn EnumChildWindows(hwnd: HWND, callback: unsafe extern "system" fn(HWND, isize) -> BOOL, lparam: isize) -> BOOL;
    fn GetClassNameW(hwnd: HWND, buf: *mut u16, max_count: i32) -> i32;
}

// --- Helpers ---

unsafe fn try_get_data(data_obj: LPVOID, cf: u16) -> Option<HGLOBAL> {
    let raw = data_obj as *mut IDataObjectRaw;
    let vtbl = &*(*raw).vtbl;
    let fmt = FORMATETC {
        cf_format: cf,
        ptd: std::ptr::null_mut(),
        dw_aspect: DVASPECT_CONTENT,
        lindex: -1,
        tymed: TYMED_HGLOBAL,
    };
    let mut medium = std::mem::zeroed::<STGMEDIUM>();
    let hr = (vtbl.get_data)(data_obj, &fmt, &mut medium);
    if hr == S_OK && !medium.h_global.is_null() {
        Some(medium.h_global)
    } else {
        None
    }
}

unsafe fn extract_file_paths(data_obj: LPVOID) -> Vec<String> {
    let hglobal = match try_get_data(data_obj, CF_HDROP) {
        Some(h) => h,
        None => return Vec::new(),
    };
    let count = DragQueryFileW(hglobal, 0xFFFFFFFF, std::ptr::null_mut(), 0);
    let mut paths = Vec::new();
    for i in 0..count {
        let len = DragQueryFileW(hglobal, i, std::ptr::null_mut(), 0);
        if len > 0 {
            let mut buf = vec![0u16; (len + 1) as usize];
            DragQueryFileW(hglobal, i, buf.as_mut_ptr(), len + 1);
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            paths.push(String::from_utf16_lossy(&buf[..end]));
        }
    }
    GlobalFree(hglobal);
    paths
}

unsafe fn extract_text(data_obj: LPVOID) -> Option<String> {
    let hglobal = match try_get_data(data_obj, CF_UNICODETEXT) {
        Some(h) => h,
        None => return None,
    };
    let ptr = GlobalLock(hglobal) as *const u16;
    if ptr.is_null() {
        GlobalFree(hglobal);
        return None;
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 && len < 1_000_000 { len += 1; }
    let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
    GlobalUnlock(hglobal);
    GlobalFree(hglobal);
    if text.is_empty() { None } else { Some(text) }
}

fn guid_eq(a: &GUID, b: &GUID) -> bool {
    a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
}

// --- IUnknown ---

unsafe extern "system" fn qi(this: *mut DropTargetObj, riid: *const GUID, ppv: *mut LPVOID) -> HRESULT {
    if guid_eq(&*riid, &IID_IUNKNOWN) || guid_eq(&*riid, &IID_IDROPTARGET) {
        *ppv = this as LPVOID;
        ((*(*this).vtbl).add_ref)(this);
        S_OK
    } else {
        *ppv = std::ptr::null_mut();
        E_NOINTERFACE
    }
}

unsafe extern "system" fn add_ref(this: *mut DropTargetObj) -> u32 {
    (*this).ref_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1
}

unsafe extern "system" fn release(this: *mut DropTargetObj) -> u32 {
    let c = (*this).ref_count.fetch_sub(1, std::sync::atomic::Ordering::SeqCst) - 1;
    if c == 0 { let _ = Box::from_raw(this); }
    c
}

// --- IDropTarget ---

unsafe extern "system" fn drag_enter(
    this: *mut DropTargetObj, p_data_obj: LPVOID, _keys: u32, pt: POINTL, effect: *mut u32,
) -> HRESULT {
    let has_files = try_get_data(p_data_obj, CF_HDROP).map(|h| { GlobalFree(h); true }).unwrap_or(false);
    let has_text = !has_files && try_get_data(p_data_obj, CF_UNICODETEXT).map(|h| { GlobalFree(h); true }).unwrap_or(false);

    (*this).has_files.set(has_files);
    (*this).has_text.set(has_text);

    if has_files || has_text {
        *effect = DROPEFFECT_COPY;
        let pos = PositionPayload { x: pt.x as f64, y: pt.y as f64 };
        if has_files {
            let paths = extract_file_paths(p_data_obj);
            let _ = (*this).app_handle.emit("nexora://drag-enter", FileDropPayload { paths, position: pos });
        } else {
            let _ = (*this).app_handle.emit("nexora://text-drag-enter", DragPositionPayload { position: pos });
        }
    } else {
        *effect = DROPEFFECT_NONE;
    }
    S_OK
}

unsafe extern "system" fn drag_over(
    this: *mut DropTargetObj, _keys: u32, pt: POINTL, effect: *mut u32,
) -> HRESULT {
    if (*this).has_files.get() || (*this).has_text.get() {
        *effect = DROPEFFECT_COPY;
        let name = if (*this).has_files.get() { "nexora://drag-over" } else { "nexora://text-drag-over" };
        let _ = (*this).app_handle.emit(name, DragPositionPayload {
            position: PositionPayload { x: pt.x as f64, y: pt.y as f64 },
        });
    } else {
        *effect = DROPEFFECT_NONE;
    }
    S_OK
}

unsafe extern "system" fn drag_leave(this: *mut DropTargetObj) -> HRESULT {
    let name = if (*this).has_files.get() { "nexora://drag-leave" } else { "nexora://text-drag-leave" };
    let _ = (*this).app_handle.emit(name, ());
    (*this).has_files.set(false);
    (*this).has_text.set(false);
    S_OK
}

unsafe extern "system" fn drop_fn(
    this: *mut DropTargetObj, p_data_obj: LPVOID, _keys: u32, pt: POINTL, effect: *mut u32,
) -> HRESULT {
    let pos = PositionPayload { x: pt.x as f64, y: pt.y as f64 };
    if (*this).has_files.get() {
        let paths = extract_file_paths(p_data_obj);
        if !paths.is_empty() {
            let _ = (*this).app_handle.emit("nexora://drag-drop", FileDropPayload { paths, position: pos });
        }
        *effect = DROPEFFECT_COPY;
    } else if (*this).has_text.get() {
        if let Some(text) = extract_text(p_data_obj) {
            let _ = (*this).app_handle.emit("nexora://text-drop", TextDropPayload { text, position: pos });
        }
        *effect = DROPEFFECT_COPY;
    } else {
        *effect = DROPEFFECT_NONE;
    }
    (*this).has_files.set(false);
    (*this).has_text.set(false);
    S_OK
}

static VTBL: IDropTargetVtbl = IDropTargetVtbl {
    query_interface: qi,
    add_ref,
    release,
    drag_enter,
    drag_over,
    drag_leave,
    drop: drop_fn,
};

// --- Window enumeration ---

unsafe extern "system" fn find_webview_child(hwnd: HWND, lparam: isize) -> BOOL {
    let mut class_name = [0u16; 256];
    let len = GetClassNameW(hwnd, class_name.as_mut_ptr(), 256);
    if len > 0 {
        let name = String::from_utf16_lossy(&class_name[..len as usize]);
        if name.contains("Chrome_WidgetWin") {
            let result = lparam as *mut HWND;
            *result = hwnd;
            return 0; // Stop
        }
    }
    1 // Continue
}

// --- Public API ---

/// Install our custom OLE drop target on the main Tauri window.
/// Must be called during setup — the handler spawns a thread that waits
/// for WebView2 to fully initialize before registering.
pub fn install_custom_drop_handler(app_handle: AppHandle) {
    std::thread::spawn(move || {
        // Wait for WebView2 to initialize its child windows
        std::thread::sleep(std::time::Duration::from_millis(1500));

        unsafe {
            OleInitialize(std::ptr::null_mut());

            let main_window = match app_handle.get_webview_window("main") {
                Some(w) => w,
                None => { eprintln!("[DropHandler] Failed to get main window"); return; }
            };

            let parent_hwnd: HWND = match main_window.hwnd() {
                Ok(h) => h.0 as HWND,
                Err(e) => { eprintln!("[DropHandler] HWND error: {}", e); return; }
            };

            // Find WebView2 content child window
            let mut content_hwnd: HWND = 0;
            EnumChildWindows(parent_hwnd, find_webview_child, &mut content_hwnd as *mut HWND as isize);

            if content_hwnd == 0 {
                eprintln!("[DropHandler] WebView2 child not found, using parent HWND");
                content_hwnd = parent_hwnd;
            }

            // Remove any existing drop target (WebView2's default)
            let _ = RevokeDragDrop(content_hwnd);

            // Allocate our drop target
            let obj = Box::into_raw(Box::new(DropTargetObj {
                vtbl: &VTBL,
                ref_count: std::sync::atomic::AtomicU32::new(1),
                app_handle: Arc::new(app_handle),
                has_files: std::cell::Cell::new(false),
                has_text: std::cell::Cell::new(false),
            }));

            let hr = RegisterDragDrop(content_hwnd, obj as LPVOID);
            if hr == S_OK {
                println!("[DropHandler] Custom OLE drop target registered successfully");
            } else {
                eprintln!("[DropHandler] RegisterDragDrop failed: 0x{:08X}", hr as u32);
                let _ = Box::from_raw(obj);
            }
        }
    });
}
