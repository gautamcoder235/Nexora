/**
 * Strips ANSI control characters, escape sequences, and terminal color codes
 * from standard output process buffers so they can be processed as clean text.
 */
export function stripAnsi(text: string): string {
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ansiRegex, "");
}

/**
 * Strips ANSI codes and processes backspace and carriage return control characters
 * to output final rendered terminal line states.
 */
export function cleanTerminalOutput(text: string): string {
  const clean = stripAnsi(text);
  const lines = clean.split(/\r?\n/);
  const processed = lines.map((line) => {
    const result: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '\b' || c === '\x7f') {
        result.pop();
      } else if (c === '\r') {
        result.length = 0;
      } else {
        result.push(c);
      }
    }
    return result.join('');
  });
  return processed.join('\n');
}
