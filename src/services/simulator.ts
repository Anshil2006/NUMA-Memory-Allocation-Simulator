import { AllocationStrategy, NumaNode, Process, SimulationResult, SimulationEvent } from "../types";

const BASE_LOCAL_LATENCY = 10;
const BASE_REMOTE_LATENCY = 50;

function generateDistanceMatrix(nodeCount: number): number[][] {
  const matrix: number[][] = [];
  const nodesPerSocket = 4;
  for (let i = 0; i < nodeCount; i++) {
    matrix[i] = [];
    const socketI = Math.floor(i / nodesPerSocket);
    for (let j = 0; j < nodeCount; j++) {
      const socketJ = Math.floor(j / nodesPerSocket);
      if (i === j) matrix[i][j] = 10; // Local
      else if (socketI === socketJ) {
        matrix[i][j] = 25; // Same socket, different node
      } else {
        // Different socket
        const dist = Math.abs(socketI - socketJ);
        matrix[i][j] = 50 + dist * 20;
      }
    }
  }
  return matrix;
}

export function runSimulation(
  nodeCount: number,
  memoryPerNode: number,
  processCount: number,
  strategy: AllocationStrategy
): SimulationResult {
  const startTime = performance.now();
  const distanceMatrix = generateDistanceMatrix(nodeCount);
  const events: SimulationEvent[] = [];
  
  const nodes: NumaNode[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: i,
    totalMemory: memoryPerNode,
    usedMemory: 0,
    cpuCount: 8,
    usedCores: 0,
    fragmentation: Math.random() * 0.1,
    bandwidthLimit: 10000, // 10 GB/s
    currentBandwidth: 0,
    socketId: Math.floor(i / 4),
    healthScore: 100,
  }));

  const processes: Process[] = [];
  let totalLatency = 0;
  let localAccessCount = 0;
  let remoteAccessCount = 0;

  const getMemoryRequired = () => Math.floor(Math.random() * (memoryPerNode / 8)) + 30;
  const getProcessType = (): Process["type"] => {
    const r = Math.random();
    if (r < 0.3) return "CPU-bound";
    if (r < 0.6) return "Memory-bound";
    return "Balanced";
  };

  for (let i = 0; i < processCount; i++) {
    const memoryRequired = getMemoryRequired();
    const processType = getProcessType();
    const priority: Process["priority"] = Math.random() > 0.8 ? "High" : Math.random() > 0.4 ? "Medium" : "Low";
    
    // Assign to node with least core usage
    const assignedNodeId = nodes.reduce((prev, curr) => 
      prev.usedCores <= curr.usedCores ? prev : curr
    ).id;
    
    nodes[assignedNodeId].usedCores++;
    
    let memoryNodeId = -1;

    switch (strategy) {
      case AllocationStrategy.AFFINITY_STRICT:
        if (!nodes[assignedNodeId].isMaintenanceMode && nodes[assignedNodeId].usedMemory + memoryRequired <= nodes[assignedNodeId].totalMemory) {
          memoryNodeId = assignedNodeId;
        } else {
          memoryNodeId = -1;
        }
        break;

      case AllocationStrategy.AI_OPTIMIZED:
      case AllocationStrategy.LOCALITY_AWARE:
        if (!nodes[assignedNodeId].isMaintenanceMode && nodes[assignedNodeId].usedMemory + memoryRequired <= nodes[assignedNodeId].totalMemory) {
          memoryNodeId = assignedNodeId;
        } else {
          const sortedNodes = [...nodes]
            .filter(n => !n.isMaintenanceMode)
            .sort((a, b) => 
              distanceMatrix[assignedNodeId][a.id] - distanceMatrix[assignedNodeId][b.id]
            );
          for (const node of sortedNodes) {
            if (node.usedMemory + memoryRequired <= node.totalMemory) {
              memoryNodeId = node.id;
              break;
            }
          }
        }
        break;

      case AllocationStrategy.INTERLEAVE:
        const startNode = i % nodeCount;
        for (let j = 0; j < nodeCount; j++) {
          const targetId = (startNode + j) % nodeCount;
          if (nodes[targetId].usedMemory + memoryRequired <= nodes[targetId].totalMemory) {
            memoryNodeId = targetId;
            break;
          }
        }
        break;

      case AllocationStrategy.ROUND_ROBIN:
        for (let j = 0; j < nodeCount; j++) {
          const targetNodeId = (i + j) % nodeCount;
          if (nodes[targetNodeId].usedMemory + memoryRequired <= nodes[targetNodeId].totalMemory) {
            memoryNodeId = targetNodeId;
            break;
          }
        }
        break;

      case AllocationStrategy.FIRST_FIT:
        for (let j = 0; j < nodeCount; j++) {
          if (nodes[j].usedMemory + memoryRequired <= nodes[j].totalMemory) {
            memoryNodeId = j;
            break;
          }
        }
        break;

      case AllocationStrategy.RANDOM:
        const availableNodes = nodes
          .filter((n) => n.usedMemory + memoryRequired <= n.totalMemory)
          .map((n) => n.id);
        if (availableNodes.length > 0) {
          memoryNodeId = availableNodes[Math.floor(Math.random() * availableNodes.length)];
        }
        break;
    }

    if (memoryNodeId !== -1) {
      nodes[memoryNodeId].usedMemory += memoryRequired;
      nodes[memoryNodeId].fragmentation = Math.min(1, nodes[memoryNodeId].fragmentation + 0.02);
      
      // Bandwidth usage based on type
      const bwUsage = processType === "Memory-bound" ? 500 : processType === "Balanced" ? 200 : 50;
      nodes[memoryNodeId].currentBandwidth += bwUsage;

      const isLocal = assignedNodeId === memoryNodeId;
      const latency = distanceMatrix[assignedNodeId][memoryNodeId];

      processes.push({
        id: i,
        memoryRequired,
        assignedNodeId,
        memoryNodeId,
        latency,
        isLocal,
        status: "running",
        type: processType,
        duration: Math.floor(Math.random() * 50) + 10,
        startTime: Date.now(),
        priority,
        affinityNodeId: strategy === AllocationStrategy.AFFINITY_STRICT ? assignedNodeId : undefined,
      });

      totalLatency += latency;
      if (isLocal) localAccessCount++;
      else remoteAccessCount++;

      events.push({
        timestamp: Date.now(),
        type: "allocation",
        message: `Process ${i} (${processType}) allocated ${memoryRequired}MB on Node ${memoryNodeId}`,
        nodeId: memoryNodeId,
        processId: i,
        severity: "info",
      });
    }
  }

  // Calculate initial health scores
  nodes.forEach(node => {
    const usage = node.usedMemory / node.totalMemory;
    node.healthScore = Math.max(0, 100 - (usage * 50) - (node.fragmentation * 50));
  });

  const endTime = performance.now();

  return {
    processes,
    nodes,
    averageLatency: processes.length > 0 ? totalLatency / processes.length : 0,
    totalLatency,
    localAccessCount,
    remoteAccessCount,
    strategy,
    executionTime: endTime - startTime,
    distanceMatrix,
    events,
    isPaused: false,
    currentTick: 0,
    performanceHistory: [],
  };
}

export function toggleMaintenance(result: SimulationResult, nodeId: number): SimulationResult {
  const nodes = [...result.nodes];
  nodes[nodeId] = { ...nodes[nodeId], isMaintenanceMode: !nodes[nodeId].isMaintenanceMode };
  
  result.events.push({
    timestamp: Date.now(),
    type: "migration",
    message: `Node ${nodeId} ${nodes[nodeId].isMaintenanceMode ? "entered" : "exited"} maintenance mode`,
    nodeId,
    severity: "warning"
  });

  return { ...result, nodes };
}

export function advanceTick(result: SimulationResult): SimulationResult {
  const newResult = { ...result, currentTick: result.currentTick + 1 };
  const newProcesses = [...newResult.processes];
  const newNodes = [...newResult.nodes];
  const newEvents = [...newResult.events];

  let totalBandwidth = 0;
  let totalLatency = 0;
  let activeCount = 0;

  newProcesses.forEach(p => {
    if (p.status === "running") {
      p.duration -= 1;
      totalLatency += p.latency;
      activeCount++;
      if (p.duration <= 0) {
        p.status = "finished";
        // Release memory
        const node = newNodes.find(n => n.id === p.memoryNodeId);
        if (node) {
          node.usedMemory -= p.memoryRequired;
          node.usedCores -= 1;
          const bwUsage = p.type === "Memory-bound" ? 500 : p.type === "Balanced" ? 200 : 50;
          node.currentBandwidth = Math.max(0, node.currentBandwidth - bwUsage);
        }
        newEvents.push({
          timestamp: Date.now(),
          type: "completion",
          message: `Process #${p.id} completed on Node ${p.memoryNodeId}`,
          processId: p.id,
          severity: "info"
        });
      }
    }
  });

  // Update health scores and check for congestion
  newNodes.forEach(node => {
    const usage = node.usedMemory / node.totalMemory;
    const bwUsage = node.currentBandwidth / node.bandwidthLimit;
    node.healthScore = Math.max(0, 100 - (usage * 40) - (node.fragmentation * 40) - (bwUsage * 20));

    if (bwUsage > 0.9) {
      newEvents.push({
        timestamp: Date.now(),
        type: "congestion",
        message: `High bandwidth congestion on Node ${node.id}`,
        nodeId: node.id,
        severity: "warning"
      });
    }
    totalBandwidth += node.currentBandwidth;
  });

  const avgLatency = activeCount > 0 ? totalLatency / activeCount : 0;
  const newHistory = [...(result.performanceHistory || []), { 
    tick: newResult.currentTick, 
    avgLatency, 
    totalBandwidth 
  }].slice(-20);

  return {
    ...newResult,
    processes: newProcesses,
    nodes: newNodes,
    events: newEvents.slice(-50), // Keep last 50 events
    performanceHistory: newHistory
  };
}

export function defragmentNode(result: SimulationResult, nodeId: number): SimulationResult {
  const node = result.nodes[nodeId];
  const oldFrag = node.fragmentation;
  node.fragmentation = Math.max(0, node.fragmentation - 0.3);
  
  result.events.push({
    timestamp: Date.now(),
    type: "defragmentation",
    message: `Node ${nodeId} defragmented. Fragmentation reduced from ${(oldFrag * 100).toFixed(1)}% to ${(node.fragmentation * 100).toFixed(1)}%`,
    nodeId,
    severity: "info",
  });

  return { ...result };
}

export function migrateProcess(
  result: SimulationResult,
  processId: number,
  targetNodeId: number
): SimulationResult {
  const process = result.processes.find(p => p.id === processId);
  if (!process) return result;

  const oldNodeId = process.memoryNodeId;
  const targetNode = result.nodes[targetNodeId];

  if (targetNode.usedMemory + process.memoryRequired > targetNode.totalMemory) {
    return result; // No space
  }

  // Update nodes
  result.nodes[oldNodeId].usedMemory -= process.memoryRequired;
  result.nodes[targetNodeId].usedMemory += process.memoryRequired;
  
  // Update bandwidth
  const bwUsage = process.type === "Memory-bound" ? 500 : process.type === "Balanced" ? 200 : 50;
  result.nodes[oldNodeId].currentBandwidth -= bwUsage;
  result.nodes[targetNodeId].currentBandwidth += bwUsage;

  // Update process
  process.memoryNodeId = targetNodeId;
  process.isLocal = process.assignedNodeId === targetNodeId;
  process.latency = result.distanceMatrix[process.assignedNodeId][targetNodeId];

  result.events.push({
    timestamp: Date.now(),
    type: "migration",
    message: `Process ${processId} migrated from Node ${oldNodeId} to Node ${targetNodeId}`,
    processId,
    nodeId: targetNodeId,
    severity: "info",
  });

  // Recalculate result stats
  let totalLatency = 0;
  let localCount = 0;
  let remoteCount = 0;

  result.processes.forEach(p => {
    totalLatency += p.latency;
    if (p.isLocal) localCount++;
    else remoteCount++;
  });

  return {
    ...result,
    averageLatency: totalLatency / result.processes.length,
    totalLatency,
    localAccessCount: localCount,
    remoteAccessCount: remoteCount,
  };
}
