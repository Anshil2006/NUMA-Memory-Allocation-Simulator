# Changelog - NUMA Simulator Pro

All major feature enhancements and architectural updates implemented in this project.

## [v2.0.0] - 2026-04-15
### Added (16 Major Feature Commits)
1. **Strict Affinity Strategy**: New allocation logic that forces memory to stay on the local node, ensuring zero interconnect latency.
2. **Playback Controls**: Interactive Play, Pause, and Step-Forward buttons to control the simulation timeline.
3. **Tick-based Simulation Engine**: Processes now have dynamic lifecycles, completing and releasing resources over time.
4. **Visual Topology Map**: SVG-based system map showing CPU sockets, nodes, and high-speed interconnects (QPI/UPI).
5. **Latency Heatmap Matrix**: A grid visualization showing the precise latency (ms) between every pair of nodes.
6. **Node Health Scores**: Real-time performance metrics (0-100) based on fragmentation, memory load, and bandwidth.
7. **Stress Test Mode**: High-pressure workload generator to test system stability under extreme conditions.
8. **CSV Data Export**: Functionality to export process tables and simulation results for external analysis.
9. **Process Priority System**: Tiered priority (Low, Medium, High) affecting resource allocation and placement.
10. **Bandwidth Congestion Alerts**: Real-time detection and logging of bandwidth saturation (90%+ load).
11. **Interactive Tutorial**: Guided "Welcome" overlay for new users to understand NUMA concepts.
12. **Event Severity Levels**: Categorized logs (Info, Warning, Error) with distinct visual coding.
13. **Dynamic Process Lifecycles**: Real-time status tracking (Running, Waiting, Finished) with duration countdowns.
14. **Enhanced Strategy Descriptions**: Detailed technical documentation for all 7 allocation strategies in the UI.
15. **System Info Dashboard**: Hardware-level details including socket IDs and interconnect speeds.
16. **Refined UI Layout**: Optimized "Pro" dashboard with improved dark mode contrast and a "Reset to Defaults" feature.

### Technical Improvements
- Integrated **Google Gemini AI** for real-time optimization advice.
- Implemented `localStorage` persistence for all user settings.
- Added hierarchical latency modeling (Local < Same Socket < Remote Socket).
