const { Terminal } = require('@xterm/xterm');
const { performance } = require('perf_hooks');

// Generate 4KB chunk of mixed text and ANSI codes (typical of build output)
const generateChunk = (size) => {
    let out = '';
    const lines = size / 100;
    for (let i = 0; i < lines; i++) {
        out += `\x1b[32m[INFO]\x1b[0m Processing module ${i} ` + "A".repeat(50) + `\r\n`;
    }
    // Pad to exact size
    while (Buffer.byteLength(out, 'utf8') < size) {
        out += 'x';
    }
    return out.substring(0, size);
};

const CHUNK_4K = generateChunk(4096);
const CHUNK_64K = generateChunk(65536);

console.log("=== BENCHMARK: STRING CONCATENATION vs ARRAY JOIN ===");

// Simulate 1 second of 50MB/sec throughput (12,207 events of 4KB)
const NUM_CHUNKS = 12207;

let start = performance.now();
let writeQueue = '';
for (let i = 0; i < NUM_CHUNKS; i++) {
    writeQueue += CHUNK_4K;
}
let durationConcat = performance.now() - start;
console.log(`String Concatenation (12,207 * 4KB = 50MB): ${durationConcat.toFixed(2)} ms`);

start = performance.now();
const pendingChunks = [];
for (let i = 0; i < NUM_CHUNKS; i++) {
    pendingChunks.push(CHUNK_4K);
}
let writeQueueJoined = pendingChunks.join("");
let durationJoin = performance.now() - start;
console.log(`Array Join (12,207 * 4KB = 50MB): ${durationJoin.toFixed(2)} ms`);

console.log("\n=== BENCHMARK: XTERM ANSI PARSING COST ===");

const term = new Terminal({ allowProposedApi: true });
// Since we don't have a DOM, xterm won't actually render to WebGL/Canvas here, 
// which is PERFECT because we ONLY want to measure the synchronous CPU parsing phase!

let parsedBytes = 0;
let parseStart = performance.now();

// Write 10MB of chunks
const BATCH_SIZE = 2500; // 10MB total (4KB * 2500)
for (let i = 0; i < BATCH_SIZE; i++) {
    term.write(CHUNK_4K, () => { parsedBytes += 4096; });
}

let parseDuration = performance.now() - parseStart;
console.log(`term.write() Synchronous Parse Time (10MB payload): ${parseDuration.toFixed(2)} ms`);
console.log(`ANSI Parser Throughput: ${((10 * 1000) / parseDuration).toFixed(2)} MB/sec`);


console.log("\n=== BENCHMARK: IPC PAYLOAD SERIALIZATION ===");

// Simulate Tauri JSON serialization cost
const simulateIPC = (chunkSize, totalMB) => {
    const chunk = generateChunk(chunkSize);
    const numEvents = (totalMB * 1024 * 1024) / chunkSize;
    
    let ipcStart = performance.now();
    for (let i = 0; i < numEvents; i++) {
        // Tauri essentially JSON.stringifies the payload
        JSON.stringify({ sessionId: "term-1", data: chunk });
    }
    return performance.now() - ipcStart;
};

console.log(`IPC Serialization (50MB via 4KB chunks): ${simulateIPC(4096, 50).toFixed(2)} ms`);
console.log(`IPC Serialization (50MB via 64KB chunks): ${simulateIPC(65536, 50).toFixed(2)} ms`);

