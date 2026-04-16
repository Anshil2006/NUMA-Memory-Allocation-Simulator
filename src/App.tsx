import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Cpu,
  Database,
  Activity,
  Settings,
  Play,
  RefreshCw,
  Info,
  ChevronRight,
  LayoutGrid,
  BarChart3,
  History,
} from "lucide-react";
import { AllocationStrategy, NumaNode, Process, SimulationResult } from "./types";
import { runSimulation, migrateProcess, defragmentNode, advanceTick, toggleMaintenance } from "./services/simulator";
import { cn } from "./lib/utils";
import { GoogleGenAI } from "@google/genai";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

export default function App() {
  const [nodeCount, setNodeCount] = useState(4);
  const [memoryPerNode, setMemoryPerNode] = useState(1024);
  const [processCount, setProcessCount] = useState(20);
  const [strategy, setStrategy] = useState<AllocationStrategy>(
    AllocationStrategy.LOCALITY_AWARE
  );
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [history, setHistory] = useState<SimulationResult[]>([]);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("All");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<keyof Process>("id");
  const [drillDownNode, setDrillDownNode] = useState<number | null>(null);

  // Load settings
  React.useEffect(() => {
    const saved = localStorage.getItem("numa-settings");
    if (saved) {
      const { nodeCount, memoryPerNode, processCount, strategy, isDarkMode } = JSON.parse(saved);
      setNodeCount(nodeCount);
      setMemoryPerNode(memoryPerNode);
      setProcessCount(processCount);
      setStrategy(strategy);
      setIsDarkMode(isDarkMode || false);
    }
  }, []);

  // Save settings
  React.useEffect(() => {
    localStorage.setItem("numa-settings", JSON.stringify({ nodeCount, memoryPerNode, processCount, strategy, isDarkMode }));
  }, [nodeCount, memoryPerNode, processCount, strategy, isDarkMode]);

  // Simulation Loop
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && result) {
      interval = setInterval(() => {
        setResult(prev => prev ? advanceTick(prev) : null);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, result]);

  const handleSimulate = () => {
    const newResult = runSimulation(
      nodeCount,
      memoryPerNode,
      processCount,
      strategy
    );
    setResult(newResult);
    setHistory((prev) => [newResult, ...prev].slice(0, 5));
    if (strategy === AllocationStrategy.AI_OPTIMIZED) {
      getAiAdvice(newResult);
    }
  };

  const handleScenario = (type: "Database" | "Compute" | "Balanced") => {
    let nc = 4, mpn = 1024, pc = 20, s = AllocationStrategy.LOCALITY_AWARE;
    if (type === "Database") {
      nc = 8; mpn = 4096; pc = 50; s = AllocationStrategy.INTERLEAVE;
    } else if (type === "Compute") {
      nc = 4; mpn = 512; pc = 100; s = AllocationStrategy.AFFINITY_STRICT;
    }
    setNodeCount(nc);
    setMemoryPerNode(mpn);
    setProcessCount(pc);
    setStrategy(s);
    
    const newResult = runSimulation(nc, mpn, pc, s);
    setResult(newResult);
    setHistory((prev) => [newResult, ...prev].slice(0, 5));
  };

  const handleToggleMaintenance = (nodeId: number) => {
    if (!result) return;
    setResult(toggleMaintenance({ ...result }, nodeId));
  };

  const handleExportCSV = () => {
    if (!result) return;
    const headers = ["ID", "Type", "CPU Node", "Memory Node", "Latency", "Status", "Priority"];
    const rows = result.processes.map(p => [
      p.id, p.type, p.assignedNodeId, p.memoryNodeId, p.latency, p.status, p.priority
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `numa_sim_${Date.now()}.csv`;
    a.click();
  };

  const handleStressTest = () => {
    if (!result) return;
    setIsPlaying(true);
    const interval = setInterval(() => {
      setResult(prev => {
        if (!prev) return null;
        const newSim = runSimulation(nodeCount, memoryPerNode, 5, strategy);
        return {
          ...prev,
          processes: [...prev.processes, ...newSim.processes].slice(-100),
          events: [...prev.events, ...newSim.events].slice(-50)
        };
      });
    }, 500);
    setTimeout(() => clearInterval(interval), 5000);
  };

  const getAiAdvice = async (simResult: SimulationResult) => {
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `Analyze this NUMA simulation result and provide 3 brief optimization tips. 
      Strategy: ${simResult.strategy}
      Avg Latency: ${simResult.averageLatency.toFixed(2)}ms
      Local Access: ${((simResult.localAccessCount / simResult.processes.length) * 100).toFixed(1)}%
      Nodes: ${simResult.nodes.length}
      Processes: ${simResult.processes.length}`;
      
      const res = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const advice = res.text || "No advice available at this time.";
      setResult(prev => prev ? { ...prev, aiAdvice: advice } : null);
    } catch (error) {
      console.error("AI Advice failed:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleMigrate = (processId: number, targetNodeId: number) => {
    if (!result) return;
    const newResult = migrateProcess({ ...result }, processId, targetNodeId);
    setResult(newResult);
  };

  const handleDefrag = (nodeId: number) => {
    if (!result) return;
    const newResult = defragmentNode({ ...result }, nodeId);
    setResult(newResult);
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.nodes.map((node) => ({
      name: `Node ${node.id}`,
      used: node.usedMemory,
      total: node.totalMemory,
      percentage: Math.round((node.usedMemory / node.totalMemory) * 100),
    }));
  }, [result]);

  const pieData = useMemo(() => {
    if (!result) return [];
    return [
      { name: "Local Access", value: result.localAccessCount },
      { name: "Remote Access", value: result.remoteAccessCount },
    ];
  }, [result]);

  const historyData = useMemo(() => {
    return history.map((h, i) => ({
      name: `Sim ${history.length - i}`,
      avgLatency: h.averageLatency,
      strategy: h.strategy,
    }));
  }, [history]);

  return (
    <div className={cn(
      "min-h-screen font-sans selection:bg-blue-100 transition-colors duration-300",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      {/* Header */}
      <header className={cn(
        "border-b px-6 py-4 sticky top-0 z-10 transition-colors",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-200">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                NUMA Simulator Pro
              </h1>
              <p className={cn("text-xs font-medium", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                Advanced Memory Topology & AI Optimization
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTutorial(true)}
              className={cn(
                "p-2 rounded-lg transition-all border",
                isDarkMode ? "bg-slate-800 border-slate-700 text-blue-400" : "bg-slate-100 border-slate-200 text-blue-600"
              )}
              title="Help / Tutorial"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "p-2 rounded-lg transition-all border",
                isDarkMode ? "bg-slate-800 border-slate-700 text-amber-400" : "bg-slate-100 border-slate-200 text-slate-600"
              )}
            >
              {isDarkMode ? <RefreshCw className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all border",
                compareMode 
                  ? "bg-amber-50 border-amber-200 text-amber-700 shadow-inner"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              {compareMode ? "Exit Compare" : "Compare Mode"}
            </button>
            <button
              onClick={handleSimulate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-md active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              Run Simulation
            </button>
          </div>
        </div>
      </header>

      {/* Tutorial Overlay */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
          <div className={cn(
            "max-w-2xl w-full p-8 rounded-3xl border shadow-2xl",
            isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          )}>
            <h2 className="text-3xl font-bold mb-4">Welcome to NUMA Pro</h2>
            <div className="space-y-4 text-sm leading-relaxed opacity-80">
              <p>This simulator helps you visualize Non-Uniform Memory Access architectures.</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Topology Map:</strong> See how nodes are grouped into sockets.</li>
                <li><strong>Latency Matrix:</strong> Understand the cost of remote memory access.</li>
                <li><strong>Health Scores:</strong> Monitor node performance based on fragmentation and load.</li>
                <li><strong>Stress Test:</strong> See how the system handles high-pressure workloads.</li>
                <li><strong>AI Advisor:</strong> Get real-time optimization tips from Gemini.</li>
              </ul>
            </div>
            <button 
              onClick={() => setShowTutorial(false)}
              className="mt-8 w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
            >
              Got it, let's explore!
            </button>
          </div>
        </div>
      )}

      {/* Node Drill-down Modal */}
      {drillDownNode !== null && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
          <div className={cn(
            "max-w-4xl w-full p-8 rounded-3xl border shadow-2xl",
            isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          )}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Node {drillDownNode} Breakdown</h2>
              <button 
                onClick={() => setDrillDownNode(null)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <RefreshCw className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Active Processes</p>
                <p className="text-2xl font-black text-blue-900">
                  {result.processes.filter(p => p.memoryNodeId === drillDownNode && p.status === "running").length}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Health Score</p>
                <p className="text-2xl font-black text-emerald-900">
                  {Math.round(result.nodes[drillDownNode].healthScore)}%
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <p className="text-xs font-bold text-amber-600 uppercase mb-1">Fragmentation</p>
                <p className="text-2xl font-black text-amber-900">
                  {Math.round(result.nodes[drillDownNode].fragmentation * 100)}%
                </p>
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 font-bold text-slate-400 uppercase text-[10px]">Process ID</th>
                    <th className="pb-2 font-bold text-slate-400 uppercase text-[10px]">Type</th>
                    <th className="pb-2 font-bold text-slate-400 uppercase text-[10px]">Memory</th>
                    <th className="pb-2 font-bold text-slate-400 uppercase text-[10px]">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {result.processes
                    .filter(p => p.memoryNodeId === drillDownNode && p.status === "running")
                    .map(p => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="py-2 font-mono text-xs">#{p.id}</td>
                      <td className="py-2 text-xs">{p.type}</td>
                      <td className="py-2 text-xs">{p.memoryRequired}MB</td>
                      <td className="py-2 text-xs font-bold text-blue-600">{p.latency}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Configuration */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Settings className="w-4 h-4" />
              <h2 className="font-bold text-sm uppercase tracking-wider">
                Configuration
              </h2>
              <button 
                onClick={() => {
                  setNodeCount(4);
                  setMemoryPerNode(1024);
                  setProcessCount(20);
                  setStrategy(AllocationStrategy.LOCALITY_AWARE);
                }}
                className="ml-auto text-[10px] font-bold text-blue-600 hover:underline"
              >
                Reset
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  NUMA Nodes
                </label>
                <input
                  type="range"
                  min="2"
                  max="16"
                  value={nodeCount}
                  onChange={(e) => setNodeCount(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between mt-1 text-[10px] font-bold text-slate-400">
                  <span>2</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {nodeCount} Nodes
                  </span>
                  <span>16</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Memory per Node (MB)
                </label>
                <select
                  value={memoryPerNode}
                  onChange={(e) => setMemoryPerNode(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value={512}>512 MB</option>
                  <option value={1024}>1024 MB</option>
                  <option value={2048}>2048 MB</option>
                  <option value={4096}>4096 MB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Process Count
                </label>
                <input
                  type="number"
                  value={processCount}
                  onChange={(e) => setProcessCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Allocation Strategy
                </label>
                <div className="space-y-2">
                  {Object.values(AllocationStrategy).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStrategy(s)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-all border",
                        strategy === s
                          ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold shadow-sm"
                          : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Scenarios Section */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <LayoutGrid className="w-4 h-4" />
              <h2 className="font-bold text-sm uppercase tracking-wider">
                Workload Scenarios
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => handleScenario("Database")}
                className="flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all"
              >
                <span>🗄️ Database Server</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button 
                onClick={() => handleScenario("Compute")}
                className="flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all"
              >
                <span>⚡ High Compute</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button 
                onClick={() => handleScenario("Balanced")}
                className="flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all"
              >
                <span>⚖️ Balanced Load</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </section>

          {/* Strategy Info */}
          <section className="bg-blue-600 p-5 rounded-2xl text-white shadow-xl shadow-blue-100">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Strategy Info
              </h3>
            </div>
            <p className="text-xs leading-relaxed opacity-90">
              {strategy === AllocationStrategy.LOCALITY_AWARE &&
                "Prioritizes memory allocation on the same node where the process is running to minimize latency."}
              {strategy === AllocationStrategy.ROUND_ROBIN &&
                "Distributes memory allocations evenly across all nodes to balance load, potentially increasing latency."}
              {strategy === AllocationStrategy.FIRST_FIT &&
                "Allocates memory on the first available node starting from Node 0, leading to node imbalance."}
              {strategy === AllocationStrategy.RANDOM &&
                "Allocates memory on a random node with sufficient capacity, resulting in unpredictable performance."}
              {strategy === AllocationStrategy.INTERLEAVE &&
                "Spreads memory pages across all nodes in a round-robin fashion to maximize bandwidth and balance load."}
              {strategy === AllocationStrategy.AFFINITY_STRICT &&
                "Forces memory allocation to the local node. Fails if local memory is exhausted, ensuring absolute minimum latency."}
              {strategy === AllocationStrategy.AI_OPTIMIZED &&
                "Uses AI-driven heuristics to dynamically place memory based on workload type and system state."}
            </p>
          </section>

          {/* Export Section */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Database className="w-4 h-4" />
              <h2 className="font-bold text-sm uppercase tracking-wider">
                Data Management
              </h2>
            </div>
            <button
              onClick={() => {
                if (!result) return;
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `numa-sim-${strategy.toLowerCase()}-${Date.now()}.json`;
                a.click();
              }}
              disabled={!result}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md"
            >
              <Database className="w-4 h-4" />
              Export Results
            </button>
          </section>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-9 space-y-6">
          {!result ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl h-[600px] flex flex-col items-center justify-center text-center p-12">
              <div className="bg-slate-100 p-6 rounded-full mb-6">
                <RefreshCw className="w-12 h-12 text-slate-300 animate-spin-slow" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Ready to Simulate
              </h2>
              <p className="text-slate-500 max-w-md mb-8">
                Configure your NUMA architecture on the left and run the
                simulation to analyze memory performance and latency.
              </p>
              <button
                onClick={handleSimulate}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
              >
                Start Simulation
              </button>
            </div>
          ) : (
            <>
              {/* Controls Section */}
              <div className={cn(
                "p-6 rounded-3xl border shadow-sm mb-6",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              )}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={cn(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all shadow-lg",
                        isPlaying 
                          ? "bg-rose-600 text-white shadow-rose-200" 
                          : "bg-emerald-600 text-white shadow-emerald-200"
                      )}
                    >
                      {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {isPlaying ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => setResult(prev => prev ? advanceTick(prev) : null)}
                      className={cn(
                        "p-2 rounded-xl border transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"
                      )}
                      title="Step Forward"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleStressTest}
                      className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold shadow-lg shadow-amber-200 text-xs"
                    >
                      Stress Test
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="px-4 py-2 bg-slate-700 text-white rounded-xl font-bold shadow-lg shadow-slate-200 text-xs"
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="text-sm font-mono opacity-60">
                    Tick: {result.currentTick}
                  </div>
                </div>
              </div>

              {/* AI Advisor Card */}
              {result?.aiAdvice && (
                <div className={cn(
                  "p-6 rounded-3xl border shadow-sm mb-6",
                  isDarkMode ? "bg-indigo-900/20 border-indigo-800" : "bg-indigo-50 border-indigo-100"
                )}>
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h3 className={cn("font-bold", isDarkMode ? "text-indigo-300" : "text-indigo-800")}>AI Optimization Advisor</h3>
                  </div>
                  <div className={cn("text-sm leading-relaxed", isDarkMode ? "text-indigo-200" : "text-indigo-700")}>
                    {result.aiAdvice.split('\n').map((line, i) => (
                      <p key={i} className="mb-2">{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance History Chart */}
              <div className={cn(
                "p-6 rounded-3xl border shadow-sm mb-6",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              )}>
                <div className="flex items-center gap-2 mb-6">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold">Real-time Performance Metrics</h3>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.performanceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} />
                      <XAxis dataKey="tick" stroke="#94a3b8" fontSize={10} />
                      <YAxis yAxisId="left" stroke="#3b82f6" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? "#0f172a" : "#fff",
                          borderColor: isDarkMode ? "#1e293b" : "#e2e8f0",
                          color: isDarkMode ? "#f1f5f9" : "#0f172a"
                        }} 
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Line yAxisId="left" type="monotone" dataKey="avgLatency" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg Latency (ms)" />
                      <Line yAxisId="right" type="monotone" dataKey="totalBandwidth" stroke="#10b981" strokeWidth={2} dot={false} name="Total BW (MB/s)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Advanced Visualizations Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                {/* Topology Map */}
                <div className={cn(
                  "lg:col-span-7 p-6 rounded-3xl border shadow-sm",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <div className="flex items-center gap-2 mb-6">
                    <LayoutGrid className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold">System Topology Map</h3>
                  </div>
                  <div className="relative h-[300px] flex items-center justify-center">
                    <svg width="100%" height="100%" viewBox="0 0 600 300">
                      {/* Sockets */}
                      {[0, 1].map(s => (
                        <g key={s}>
                          <rect 
                            x={50 + s * 300} y={50} width={200} height={200} 
                            rx={20} fill="none" stroke={isDarkMode ? "#334155" : "#e2e8f0"} 
                            strokeDasharray="5,5" 
                          />
                          <text x={150 + s * 300} y={40} textAnchor="middle" className="text-[10px] font-bold fill-slate-400 uppercase">Socket {s}</text>
                          
                          {/* Nodes in socket */}
                          {result.nodes.filter(n => n.socketId === s).map((n, idx) => {
                            const x = 100 + s * 300 + (idx % 2) * 100;
                            const y = 100 + Math.floor(idx / 2) * 100;
                            return (
                              <g key={n.id}>
                                <circle 
                                  cx={x} cy={y} r={30} 
                                  fill={n.healthScore > 80 ? "#10b981" : n.healthScore > 50 ? "#f59e0b" : "#ef4444"} 
                                  className="transition-all duration-500"
                                />
                                <text x={x} y={y+5} textAnchor="middle" className="text-[10px] font-black fill-white">N{n.id}</text>
                              </g>
                            );
                          })}
                        </g>
                      ))}
                      {/* Interconnects */}
                      <line x1={250} y1={150} x2={350} y2={150} stroke="#3b82f6" strokeWidth={4} strokeDasharray="10,5" />
                      <text x={300} y={140} textAnchor="middle" className="text-[8px] font-bold fill-blue-500 uppercase">QPI / UPI Interconnect</text>
                    </svg>
                  </div>
                </div>

                {/* Latency Matrix */}
                <div className={cn(
                  "lg:col-span-5 p-6 rounded-3xl border shadow-sm",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <div className="flex items-center gap-2 mb-6">
                    <Activity className="w-5 h-5 text-rose-600" />
                    <h3 className="font-bold">Latency Matrix (ms)</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <div className="bg-transparent" />
                    {result.nodes.slice(0, 4).map(n => (
                      <div key={n.id} className="text-[8px] font-bold text-center text-slate-400">N{n.id}</div>
                    ))}
                    {result.nodes.slice(0, 4).map((n1, i) => (
                      <React.Fragment key={i}>
                        <div className="text-[8px] font-bold text-slate-400 flex items-center">N{n1.id}</div>
                        {result.nodes.slice(0, 4).map((n2, j) => (
                          <div 
                            key={j} 
                            className={cn(
                              "aspect-square flex items-center justify-center text-[8px] font-bold rounded",
                              i === j ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {result.distanceMatrix[n1.id][n2.id]}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="mt-4 text-[10px] text-slate-400 italic">Showing first 4 nodes for clarity</p>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {compareMode && history.length > 1 && (
                  <div className="md:col-span-4 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-200 p-2 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-amber-700" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">Comparison Mode Active</h4>
                        <p className="text-xs text-amber-700">Comparing current run with previous simulation.</p>
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-amber-600 uppercase">Latency Delta</p>
                        <p className={cn(
                          "text-lg font-black",
                          result.averageLatency < history[1].averageLatency ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {result.averageLatency < history[1].averageLatency ? "-" : "+"}
                          {Math.abs(result.averageLatency - history[1].averageLatency).toFixed(1)}ms
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-amber-600 uppercase">Locality Delta</p>
                        <p className={cn(
                          "text-lg font-black",
                          (result.localAccessCount / result.processes.length) > (history[1].localAccessCount / history[1].processes.length) ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {((result.localAccessCount / result.processes.length) - (history[1].localAccessCount / history[1].processes.length) * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Avg Latency
                    </span>
                    <Activity className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      {result.averageLatency.toFixed(1)}
                    </span>
                    <span className="text-xs font-bold text-slate-400">ms</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Local Access
                    </span>
                    <LayoutGrid className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      {Math.round(
                        (result.localAccessCount / result.processes.length) * 100
                      )}
                    </span>
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Remote Access
                    </span>
                    <ChevronRight className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      {Math.round(
                        (result.remoteAccessCount / result.processes.length) * 100
                      )}
                    </span>
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Total Memory
                    </span>
                    <Database className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      {result.nodes.reduce((acc, n) => acc + n.usedMemory, 0)}
                    </span>
                    <span className="text-xs font-bold text-slate-400">MB</span>
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-slate-800">Node Utilization</h3>
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "#94a3b8" }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "#94a3b8" }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Bar
                          dataKey="used"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                          name="Used Memory (MB)"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-slate-800">Latency Distribution</h3>
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.processes.reduce((acc: any[], p) => {
                        const bin = Math.floor(p.latency / 10) * 10;
                        const existing = acc.find(b => b.range === `${bin}-${bin+10}ms`);
                        if (existing) existing.count++;
                        else acc.push({ range: `${bin}-${bin+10}ms`, count: 1, bin });
                        return acc;
                      }, []).sort((a, b) => a.bin - b.bin)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="range"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "#94a3b8" }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="#ef4444"
                          radius={[4, 4, 0, 0]}
                          name="Process Count"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Node Heatmap */}
              <div className={cn(
                "p-6 rounded-3xl border shadow-sm",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              )}>
                <div className="flex items-center gap-2 mb-6">
                  <LayoutGrid className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold">Node Memory Heatmap</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                  {result.nodes.map((node) => {
                    const usage = node.usedMemory / node.totalMemory;
                    const bwUsage = node.currentBandwidth / node.bandwidthLimit;
                    return (
                      <div
                        key={node.id}
                        className={cn(
                          "relative group p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md",
                          isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-100"
                        )}
                      >
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-inner"
                          style={{
                            backgroundColor: usage > 0.8 ? '#ef4444' : usage > 0.5 ? '#f59e0b' : '#10b981',
                            opacity: 0.3 + (usage * 0.7)
                          }}
                        >
                          {Math.round(usage * 100)}%
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Node {node.id}</span>
                        
                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-blue-500 transition-all" 
                            style={{ width: `${Math.min(100, bwUsage * 100)}%` }}
                          />
                        </div>

                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                          <div 
                            className={cn(
                              "h-full transition-all",
                              node.healthScore > 80 ? "bg-emerald-500" : node.healthScore > 50 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${node.healthScore}%` }}
                          />
                        </div>

                        <div className="flex gap-1 mt-2">
                          <button 
                            onClick={() => handleDefrag(node.id)}
                            className="text-[8px] font-bold text-blue-500 hover:underline"
                          >
                            Defrag
                          </button>
                          <button 
                            onClick={() => handleToggleMaintenance(node.id)}
                            className={cn(
                              "text-[8px] font-bold hover:underline",
                              node.isMaintenanceMode ? "text-emerald-500" : "text-rose-500"
                            )}
                          >
                            {node.isMaintenanceMode ? "Enable" : "Drain"}
                          </button>
                          <button 
                            onClick={() => setDrillDownNode(node.id)}
                            className="text-[8px] font-bold text-slate-400 hover:underline"
                          >
                            Details
                          </button>
                        </div>
                        
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-2xl">
                          <p className="font-bold mb-1">Node {node.id} (Socket {node.socketId})</p>
                          <div className="space-y-1 opacity-80">
                            <p>Used: {node.usedMemory}MB / {node.totalMemory}MB</p>
                            <p>Cores: {node.usedCores}/8</p>
                            <p>Frag: {(node.fragmentation * 100).toFixed(1)}%</p>
                            <p>BW: {node.currentBandwidth}MB/s</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* History & Event Log Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className={cn(
                  "lg:col-span-4 p-6 rounded-3xl border shadow-sm",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <div className="flex items-center gap-2 mb-6">
                    <History className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold">Event Log</h3>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {result.events.slice().reverse().map((event, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-xl border text-[10px] leading-tight",
                          isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-100"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "font-bold uppercase px-1.5 py-0.5 rounded",
                            event.type === "allocation" ? "bg-blue-100 text-blue-700" :
                            event.type === "migration" ? "bg-amber-100 text-amber-700" :
                            event.type === "defragmentation" ? "bg-emerald-100 text-emerald-700" :
                            "bg-slate-100 text-slate-700"
                          )}>
                            {event.type}
                          </span>
                          <span className="text-slate-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className={isDarkMode ? "text-slate-300" : "text-slate-600"}>{event.message}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cn(
                  "lg:col-span-8 p-6 rounded-3xl border shadow-sm overflow-hidden",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold">Process Details</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input 
                        type="text" 
                        placeholder="Search ID..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                          "text-[10px] px-3 py-1.5 rounded-lg border outline-none w-32",
                          isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200"
                        )}
                      />
                      {["All", "CPU-bound", "Memory-bound", "Balanced"].map(type => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-lg transition-all",
                            filterType === type 
                              ? "bg-blue-600 text-white" 
                              : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className={cn("border-b", isDarkMode ? "border-slate-800" : "border-slate-100")}>
                          <th 
                            className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest cursor-pointer hover:text-blue-500"
                            onClick={() => setSortField("id")}
                          >
                            ID
                          </th>
                          <th className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Type</th>
                          <th className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest">CPU Node</th>
                          <th className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Memory Node</th>
                          <th 
                            className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest cursor-pointer hover:text-blue-500"
                            onClick={() => setSortField("latency")}
                          >
                            Latency
                          </th>
                          <th className="pb-3 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.processes
                          .filter(p => (filterType === "All" || p.type === filterType) && p.id.toString().includes(searchQuery))
                          .sort((a, b) => {
                            if (sortField === "latency") return b.latency - a.latency;
                            return a.id - b.id;
                          })
                          .slice(0, 15)
                          .map((p) => (
                          <tr key={p.id} className={cn("border-b", isDarkMode ? "border-slate-800/50" : "border-slate-50")}>
                            <td className="py-3 font-mono text-xs text-slate-500">#{p.id}</td>
                            <td className="py-3">
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                p.type === "CPU-bound" ? "bg-purple-100 text-purple-700" :
                                p.type === "Memory-bound" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-700"
                              )}>
                                {p.type}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className={cn("px-2 py-1 rounded text-xs font-bold", isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600")}>
                                Node {p.assignedNodeId}
                              </span>
                            </td>
                            <td className="py-3">
                              <select
                                value={p.memoryNodeId}
                                onChange={(e) => handleMigrate(p.id, Number(e.target.value))}
                                className={cn(
                                  "px-2 py-1 rounded text-xs font-bold outline-none border-none cursor-pointer transition-colors",
                                  isDarkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                              >
                                {result.nodes.map(n => (
                                  <option key={n.id} value={n.id}>Node {n.id}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                p.priority === "High" ? "bg-rose-100 text-rose-700" :
                                p.priority === "Medium" ? "bg-amber-100 text-amber-700" :
                                "bg-slate-100 text-slate-700"
                              )}>
                                {p.priority}
                              </span>
                            </td>
                            <td className="py-3 font-bold text-blue-600">{p.latency}ms</td>
                            <td className="py-3">
                              <span className={cn(
                                "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter",
                                p.isLocal ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                              )}>
                                {p.isLocal ? "Local" : "Remote"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Educational Section */}
              <div className={cn(
                "p-8 rounded-3xl border shadow-sm",
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              )}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-blue-600 p-2 rounded-xl">
                    <Info className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold">Understanding NUMA Architecture</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <h4 className="font-bold text-blue-600">What is NUMA?</h4>
                    <p className={cn("text-sm leading-relaxed", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                      Non-Uniform Memory Access (NUMA) is a computer memory design used in multiprocessing, where the memory access time depends on the memory location relative to the processor.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-bold text-emerald-600">Local vs Remote</h4>
                    <p className={cn("text-sm leading-relaxed", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                      Accessing memory on the same node (Local) is significantly faster than accessing memory on a different node (Remote) via the interconnect (like QPI or UPI).
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-bold text-amber-600">Optimization Goal</h4>
                    <p className={cn("text-sm leading-relaxed", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                      The primary goal of a NUMA-aware scheduler is to keep data as close to the processing cores as possible to minimize latency and maximize bandwidth.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Background Decoration */}
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-50 translate-x-1/2 -translate-y-1/2" />
      <div className="fixed bottom-0 left-0 -z-10 w-[300px] h-[300px] bg-indigo-50 rounded-full blur-3xl opacity-50 -translate-x-1/2 translate-y-1/2" />
    </div>
  );
}
