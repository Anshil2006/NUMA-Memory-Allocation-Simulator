export enum AllocationStrategy {
  LOCALITY_AWARE = "Locality-aware",
  ROUND_ROBIN = "Round-robin",
  FIRST_FIT = "First-fit",
  RANDOM = "Random",
  INTERLEAVE = "Interleave",
  AI_OPTIMIZED = "AI-Optimized",
  AFFINITY_STRICT = "Strict Affinity",
}

export interface NumaNode {
  id: number;
  totalMemory: number;
  usedMemory: number;
  cpuCount: number;
  usedCores: number;
  fragmentation: number; // 0 to 1
  bandwidthLimit: number; // MB/s
  currentBandwidth: number;
  socketId: number;
  healthScore: number; // 0 to 100
  isMaintenanceMode?: boolean;
}

export interface Process {
  id: number;
  memoryRequired: number;
  assignedNodeId: number;
  memoryNodeId: number;
  latency: number;
  isLocal: boolean;
  status: "running" | "waiting" | "finished";
  type: "CPU-bound" | "Memory-bound" | "Balanced";
  duration: number; // Ticks remaining
  startTime: number;
  priority: "Low" | "Medium" | "High";
  affinityNodeId?: number;
}

export interface SimulationEvent {
  timestamp: number;
  type: "allocation" | "migration" | "defragmentation" | "failure" | "completion" | "congestion";
  message: string;
  nodeId?: number;
  processId?: number;
  severity: "info" | "warning" | "error";
}

export interface SimulationResult {
  processes: Process[];
  nodes: NumaNode[];
  averageLatency: number;
  totalLatency: number;
  localAccessCount: number;
  remoteAccessCount: number;
  strategy: AllocationStrategy;
  executionTime: number;
  distanceMatrix: number[][];
  events: SimulationEvent[];
  aiAdvice?: string;
  isPaused: boolean;
  currentTick: number;
  performanceHistory: { tick: number; avgLatency: number; totalBandwidth: number }[];
}
