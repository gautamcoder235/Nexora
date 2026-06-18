/**
 * Nexora — OSC 133 Block Parser
 *
 * Parses raw PTY byte streams (represented as UTF-8 strings) containing
 * OSC 133 shell integration markers.
 */
export interface BlockEvent {
  type: 'prompt-start' | 'command-start' | 'pre-exec' | 'command-done' | 'output';
  data?: string;
  exitCode?: number;
}

export class BlockParser {
  private buffer = '';

  /**
   * Parse a chunk of data from the PTY stream.
   * Returns a list of structured block events.
   */
  public parse(chunk: string): BlockEvent[] {
    this.buffer += chunk;
    const events: BlockEvent[] = [];

    while (this.buffer.length > 0) {
      // Find the next ESC character
      const escIdx = this.buffer.indexOf('\x1b');

      if (escIdx === -1) {
        // No escape sequences, the entire buffer is output
        events.push({ type: 'output', data: this.buffer });
        this.buffer = '';
        break;
      }

      // If there is leading text before the ESC, emit it as output
      if (escIdx > 0) {
        events.push({ type: 'output', data: this.buffer.slice(0, escIdx) });
        this.buffer = this.buffer.slice(escIdx);
      }

      // Check if we have a full OSC 133 sequence
      // OSC 133 sequences look like: \x1b]133;{code}[;{args}]\x07
      const oscPrefix = '\x1b]133;';
      if (!this.buffer.startsWith(oscPrefix)) {
        // It's some other escape sequence (e.g. cursor motion or color).
        // Find the next character that terminates an escape sequence (typically letters like m, H, J, etc.)
        // For simplicity and safe streaming, we look for the end of the CSI/OSC or next character.
        const terminatorIdx = this.findEscapeTerminator(this.buffer);
        if (terminatorIdx === -1) {
          // Sequence is cut off, wait for more data
          break;
        }

        // Emit the non-OSC 133 escape sequence as output data so xterm.js can render it
        const sequence = this.buffer.slice(0, terminatorIdx + 1);
        events.push({ type: 'output', data: sequence });
        this.buffer = this.buffer.slice(terminatorIdx + 1);
        continue;
      }

      // We have the OSC 133 prefix. Find the terminating BEL (\x07)
      const belIdx = this.buffer.indexOf('\x07');
      if (belIdx === -1) {
        // Sequence is incomplete, wait for more data
        break;
      }

      // Extract full OSC 133 payload: e.g. "A" or "D;0"
      const payload = this.buffer.slice(oscPrefix.length, belIdx);
      const fullSequence = this.buffer.slice(0, belIdx + 1);

      // Route based on OSC 133 codes
      if (payload === 'A') {
        events.push({ type: 'prompt-start' });
      } else if (payload === 'B') {
        events.push({ type: 'command-start' });
      } else if (payload === 'C') {
        events.push({ type: 'pre-exec' });
      } else if (payload.startsWith('D')) {
        // Done sequence: D;{exit_code} or D
        const parts = payload.split(';');
        const exitCode = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        events.push({ type: 'command-done', exitCode: isNaN(exitCode) ? 0 : exitCode });
      } else {
        // Unknown OSC 133 sequence, pass through
        events.push({ type: 'output', data: fullSequence });
      }

      // Advance buffer past the BEL
      this.buffer = this.buffer.slice(belIdx + 1);
    }

    return events;
  }

  /**
   * Helper to find the end of a non-OSC 133 escape sequence
   */
  private findEscapeTerminator(str: string): number {
    if (str.length < 2) return -1;

    // CSI sequences: ESC [ ... {letter}
    if (str[1] === '[') {
      for (let i = 2; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        // CSI parameters are bytes in range 0x30-0x3F, intermediate bytes 0x20-0x2F.
        // The final terminator byte is in range 0x40-0x7E (uppercase/lowercase letters or symbols).
        if (charCode >= 0x40 && charCode <= 0x7E) {
          return i;
        }
      }
      return -1;
    }

    // Standard 2-character escape sequence (e.g. ESC >, ESC =)
    return 1;
  }
}
