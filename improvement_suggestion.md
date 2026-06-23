# Nexora — Future Improvement Suggestions

This document tracks high-impact feature enhancements, architectural suggestions, and premium additions for the Nexora orchestrator.

---

## 1. Interactive Multi-Agent Collaboration Sandbox

### Concept
A unified group chat playground allowing the user to converse with multiple agent profiles concurrently in a single sandbox thread.

### Key Details
- **Dynamic Tagging:** Direct specific prompts or queries to individual agents using `@Planner`, `@Coder`, and `@Reviewer`.
- **Peer-to-Peer Agent Discussion:** Agents can converse with each other in real-time inside the chat view to brainstorm technical solutions, delegate sub-tasks, and resolve syntax or validation errors together.
- **Real-time Swarm Graph Sync:** As the agents collaborate and shift workloads in the chat, their active node states, execution borders, and links update dynamically on the live Swarm Graph.

---

## 2. Live CSS Style Tweaker (Visual Editor)

### Concept
Expand the "Inspect Element" sidebar to include a simplified visual CSS editor, or dedicate a separate panel/tab in the browser window for visual editing.

### Key Details
- **Direct Manipulation:** Instead of just copying CSS selectors and properties, render interactive controls (sliders for padding/margin/font-size, color pickers for backgrounds/borders) that let you visually tweak layout styling on the page in real-time.
- **Dynamic DOM Integration:** Allow style modifications to inject dynamically into the active inspected element's inline style rules, updating the guest web page preview instantly.

---

## 3. Tab Hover Card Previews

### Concept
Hovering over any browser tab renders a small glassmorphic popover displaying a visual thumbnail snapshot of that page's last state, making tab navigation fluid and intuitive.

### Key Details
- **Visual Previews:** Smoothly fade in a thumbnail snapshot of the cached page when hovering over inactive tabs.
- **Glassmorphic Cards:** Style the popover overlay with glassmorphism backdrop blurs and subtle borders.

---

## 4. Workspace-Bound Tab Sessions

### Concept
Link your open tabs directly to your current active workspace.

### Key Details
- **Automatic Save & Restore:** When you switch workspaces, the browser automatically saves your current open tabs and restores the exact documentation links, local servers, and staging URLs associated with the new workspace.
- **Session Presets:** Provide the ability to snapshot and restore named tab groups within a project.

---

## 5. Dynamic Local Port Auto-Detect

### Concept
The browser monitors local developer servers spawned by PTY terminals (e.g., detecting if a Vite server is launched on port 5173) and shows a floating notification badge to open http://localhost:5173 in a new tab with one click.

### Key Details
- **Port Monitoring:** Detect output patterns in shell logs or listen to localhost port events.
- **Floating Badge:** Render a glassmorphic notification offering to open the detected local URL instantly.
