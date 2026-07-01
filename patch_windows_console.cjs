const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src-tauri', 'src');

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it has CommandExt, if not add it at the top
    if (!content.includes('std::os::windows::process::CommandExt')) {
        const insertIndex = content.indexOf('use std::');
        if (insertIndex !== -1) {
            content = content.replace(/use std::([a-zA-Z0-9_:]+);/, 'use std::$1;\n#[cfg(target_os = "windows")]\nuse std::os::windows::process::CommandExt;');
        } else {
            // Just add it after the first line
            content = '#[cfg(target_os = "windows")]\nuse std::os::windows::process::CommandExt;\n' + content;
        }
    }
    
    // Create a safe replacement string
    const outputReplacement = `#[cfg(target_os = "windows")]\n        .creation_flags(0x08000000)\n        .output()`;
    const spawnReplacement = `#[cfg(target_os = "windows")]\n        .creation_flags(0x08000000)\n        .spawn()`;
    const statusReplacement = `#[cfg(target_os = "windows")]\n        .creation_flags(0x08000000)\n        .status()`;

    // Only apply if they aren't already patched!
    // A simple trick is to replace .output() first, then fix any double-applications.
    content = content.split('.output()').join(outputReplacement);
    content = content.split('.spawn()').join(spawnReplacement);
    content = content.split('.status()').join(statusReplacement);
    
    // Clean up if the file was already patched previously (prevents recursive growth if run multiple times)
    content = content.split(outputReplacement + outputReplacement.replace('.output()', '')).join(outputReplacement);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched: ' + path.basename(filePath));
}

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            walk(filePath);
        } else if (filePath.endsWith('.rs')) {
            const text = fs.readFileSync(filePath, 'utf8');
            if (text.includes('Command::new') || text.includes('std::process::Command')) {
                patchFile(filePath);
            }
        }
    });
}

walk(srcDir);
console.log('Finished patching all Rust files.');
