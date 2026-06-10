import { invoke } from '@tauri-apps/api/core';
import { useOrchestratorStore } from '../stores/orchestratorStore';

export interface BackendMetrics {
    pending_bytes: number;
    oldest_pending_age_ms: number;
    events_per_second: number;
    bytes_per_second: number;
    emit_avg_ms: number;
    emit_max_ms: number;
}

export interface FrameBudgetViolations {
    over16ms: number;
    over33ms: number;
    over50ms: number;
}

export interface SessionMetrics {
    // Write Pipeline
    avgWriteKb: number;
    maxWriteKb: number;
    writesPerSec: number;
    
    // Render Latency
    renderAvgMs: number;
    renderP95Ms: number;
    renderP99Ms: number;
    renderMaxMs: number;
}

class TerminalMetricsCollector {
    private static instance: TerminalMetricsCollector;
    private tickerInterval: number | null = null;
    
    // Local buffers for sliding windows
    private writeQueueSizes: Record<string, number[]> = {};
    private renderLatencies: Record<string, number[]> = {};
    private writeCountsThisSec: Record<string, number> = {};
    private writeCountsSnapshot: Record<string, number> = {};
    
    // Frame health
    private frameViolations: Record<string, FrameBudgetViolations> = {};
    
    private lastRafTimes: Record<string, number> = {};
    
    // Visibility state pushed from UI
    private focusSessionId: string | null = null;

    private constructor() {
        // Automatically start in DEV mode
        if (import.meta.env.DEV) {
            (window as any).__terminalMetrics = this;
        }
    }

    public static getInstance(): TerminalMetricsCollector {
        if (!TerminalMetricsCollector.instance) {
            TerminalMetricsCollector.instance = new TerminalMetricsCollector();
        }
        return TerminalMetricsCollector.instance;
    }

    /**
     * Record the synchronous write payload size
     */
    public recordWrite(sessionId: string, bytes: number) {
        if (!this.writeQueueSizes[sessionId]) this.writeQueueSizes[sessionId] = [];
        this.writeQueueSizes[sessionId].push(bytes);
        if (this.writeQueueSizes[sessionId].length > 100) this.writeQueueSizes[sessionId].shift();
        
        this.writeCountsThisSec[sessionId] = (this.writeCountsThisSec[sessionId] || 0) + 1;
    }

    /**
     * Record the asynchronous WebGL render latency
     */
    public recordRenderLatency(sessionId: string, latencyMs: number) {
        if (!this.renderLatencies[sessionId]) this.renderLatencies[sessionId] = [];
        this.renderLatencies[sessionId].push(latencyMs);
        if (this.renderLatencies[sessionId].length > 100) this.renderLatencies[sessionId].shift();
    }

    /**
     * Track frame pacing directly from the terminal pane's requestAnimationFrame
     */
    public recordFrame(sessionId: string, now: number) {
        if (!this.frameViolations[sessionId]) {
            this.frameViolations[sessionId] = { over16ms: 0, over33ms: 0, over50ms: 0 };
            this.lastRafTimes[sessionId] = now;
            return;
        }
        
        const delta = now - this.lastRafTimes[sessionId];
        if (delta > 50) this.frameViolations[sessionId].over50ms++;
        else if (delta > 33) this.frameViolations[sessionId].over33ms++;
        else if (delta > 16.6) this.frameViolations[sessionId].over16ms++;
        
        this.lastRafTimes[sessionId] = now;
    }

    private getPercentile(arr: number[], p: number): number {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
            return sorted[base];
        }
    }

    public updateFocusSession(sessionId: string | null) {
        this.focusSessionId = sessionId;
    }

    public startConsoleTicker(intervalMs: number = 2000) {
        if (this.tickerInterval) clearInterval(this.tickerInterval);
        
        // Reset counts ticker
        setInterval(() => {
            for (const key of Object.keys(this.writeCountsThisSec)) {
                this.writeCountsSnapshot[key] = this.writeCountsThisSec[key];
                this.writeCountsThisSec[key] = 0;
            }
        }, 1000);

        this.tickerInterval = window.setInterval(async () => {
            try {
                // PULL MODEL: Request truth directly from Rust
                const backendMetrics: Record<string, BackendMetrics> = await invoke('get_terminal_metrics');
                
                // Get visibility stats from Orchestrator Store
                const storeState = useOrchestratorStore.getState();
                const terminals = storeState.terminals;
                
                let totalVisible = 0;
                let totalSuspended = 0;
                
                terminals.forEach(t => {
                    const isHidden = this.focusSessionId !== null && this.focusSessionId !== t.id;
                    if (isHidden) totalSuspended++;
                    else totalVisible++;
                });

                console.log(`[Terminal Health] Visible: ${totalVisible} | Suspended: ${totalSuspended}`);

                const tableData: any = {};

                for (const [sessionId, bm] of Object.entries(backendMetrics)) {
                    const lats = this.renderLatencies[sessionId] || [];
                    const writes = this.writeQueueSizes[sessionId] || [];
                    const frames = this.frameViolations[sessionId] || { over16ms: 0, over33ms: 0, over50ms: 0 };
                    
                    const avgWriteBytes = writes.length > 0 ? writes.reduce((a, b) => a + b, 0) / writes.length : 0;
                    const maxWriteBytes = writes.length > 0 ? Math.max(...writes) : 0;
                    
                    const isHidden = this.focusSessionId !== null && this.focusSessionId !== sessionId;

                    tableData[sessionId] = {
                        "Status": isHidden ? "Suspended" : "Visible",
                        "Queue KB": (bm.pending_bytes / 1024).toFixed(1),
                        "Queue Age ms": bm.oldest_pending_age_ms,
                        "Events/sec": bm.events_per_second,
                        "Bytes/sec": bm.bytes_per_second,
                        
                        "Avg Render ms": this.getPercentile(lats, 0.5).toFixed(1),
                        "P95 Render ms": this.getPercentile(lats, 0.95).toFixed(1),
                        "P99 Render ms": this.getPercentile(lats, 0.99).toFixed(1),
                        "Max Render ms": (lats.length > 0 ? Math.max(...lats) : 0).toFixed(1),
                        
                        "Avg Write KB": (avgWriteBytes / 1024).toFixed(1),
                        "Largest Write KB": (maxWriteBytes / 1024).toFixed(1),
                        
                        "Emit Avg ms": bm.emit_avg_ms.toFixed(2),
                        "Emit Max ms": bm.emit_max_ms.toFixed(2),
                        
                        "Frames >16ms": frames.over16ms,
                        "Frames >33ms": frames.over33ms,
                        "Frames >50ms": frames.over50ms,
                    };
                }

                if (Object.keys(tableData).length > 0) {
                    console.table(tableData);
                }
                
            } catch (err) {
                console.error("Failed to fetch terminal metrics", err);
            }
        }, intervalMs);
    }
    
    public stopConsoleTicker() {
        if (this.tickerInterval) {
            clearInterval(this.tickerInterval);
            this.tickerInterval = null;
        }
    }
}

export const terminalMetricsCollector = TerminalMetricsCollector.getInstance();
