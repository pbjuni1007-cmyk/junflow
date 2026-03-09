export interface DAGNode {
  id: string;
  dependsOn: string[];
}

/**
 * 순환 참조 검출.
 * 순환이 있으면 순환에 포함된 노드 ID 배열 반환, 없으면 null.
 */
export function detectCycle(nodes: DAGNode[]): string[] | null {
  const nodeMap = new Map<string, DAGNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // WHITE=0, GRAY=1 (in-stack), BLACK=2 (done)
  const color = new Map<string, number>();
  const cycleNodes = new Set<string>();

  function dfs(id: string, stack: string[]): boolean {
    color.set(id, 1);
    stack.push(id);

    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependsOn) {
        const depColor = color.get(dep) ?? 0;
        if (depColor === 1) {
          // 순환 발견 - 스택에서 순환 구간 추출
          const cycleStart = stack.indexOf(dep);
          for (let i = cycleStart; i < stack.length; i++) {
            cycleNodes.add(stack[i]!);
          }
          cycleNodes.add(dep);
          return true;
        }
        if (depColor === 0 && nodeMap.has(dep)) {
          if (dfs(dep, stack)) {
            return true;
          }
        }
      }
    }

    stack.pop();
    color.set(id, 2);
    return false;
  }

  for (const node of nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      if (dfs(node.id, [])) {
        return Array.from(cycleNodes);
      }
    }
  }

  return null;
}

/**
 * 위상 정렬 → 레벨별 그룹화.
 * 같은 레벨의 노드는 병렬 실행 가능.
 * [[level0 nodes], [level1 nodes], ...]
 */
export function topologicalSort(nodes: DAGNode[]): string[][] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((n) => n.id));

  // 진입 차수(inDegree) 계산 - 존재하는 노드 의존성만 카운트
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    if (!inDegree.has(node.id)) {
      inDegree.set(node.id, 0);
    }
    for (const dep of node.dependsOn) {
      if (nodeIds.has(dep)) {
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // adjacency: dep -> [nodes that depend on dep]
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (nodeIds.has(dep)) {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(node.id);
      }
    }
  }

  const levels: string[][] = [];
  let current = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);

  while (current.length > 0) {
    levels.push([...current]);
    const next: string[] = [];
    for (const id of current) {
      for (const dependent of dependents.get(id) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          next.push(dependent);
        }
      }
    }
    current = next;
  }

  return levels;
}

/**
 * DAG 유효성 검증.
 */
export function validateDAG(nodes: DAGNode[]): { valid: boolean; errors: string[] } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const errors: string[] = [];

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodeIds.has(dep)) {
        errors.push(`Unknown dependency: ${dep} in ${node.id}.dependsOn`);
      }
    }
  }

  const cycle = detectCycle(nodes);
  if (cycle !== null) {
    errors.push(`Cycle detected involving nodes: ${cycle.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
