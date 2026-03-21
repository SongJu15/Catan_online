import type { Board, Hex, Vertex, Edge, ResourceType } from "@catan/shared";

// ============================================================
// 标准卡坦岛地形分布（19块六边形）
// ============================================================
const RESOURCE_TILES: ResourceType[] = [
  "wood", "wood", "wood", "wood",
  "brick", "brick", "brick",
  "sheep", "sheep", "sheep", "sheep",
  "wheat", "wheat", "wheat", "wheat",
  "ore", "ore", "ore",
  "desert",
];

// 标准骰子数字分布（沙漠不分配数字，用0占位）
const DICE_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// ============================================================
// 标准卡坦岛六边形行列布局（每行的列数）
// row 0: 3块, row 1: 4块, row 2: 5块, row 3: 4块, row 4: 3块
// ============================================================
const ROW_SIZES = [3, 4, 5, 4, 3];

// 每行起始的顶点偏移（用于计算顶点坐标）
const HEX_SIZE = 1; // 单位六边形大小

// ============================================================
// Fisher-Yates 洗牌
// ============================================================
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 生成棋盘
// ============================================================
export function generateBoard(): Board {
  const shuffledResources = shuffle(RESOURCE_TILES);

  // 分配骰子数字（跳过沙漠）
  const diceQueue = [...DICE_NUMBERS];
  const diceAssigned: number[] = shuffledResources.map((r) =>
    r === "desert" ? 0 : diceQueue.shift()!
  );

  // ---- 生成 Hex ----
  const hexes: Hex[] = [];
  const vertexMap = new Map<string, Vertex>(); // key: "col_row" 坐标
  const edgeMap = new Map<string, Edge>();     // key: "vA_vB" 排序后

  let hexIndex = 0;

  // 六边形顶点偏移（flat-top 六边形，6个顶点方向）
  // 使用 axial 坐标系，行列转换为像素坐标
  const rowOffsets = [
    { colStart: -1 },
    { colStart: -1.5 },
    { colStart: -2 },
    { colStart: -1.5 },
    { colStart: -1 },
  ];

  for (let row = 0; row < ROW_SIZES.length; row++) {
    const cols = ROW_SIZES[row];
    for (let col = 0; col < cols; col++) {
      const hexId = `h${hexIndex}`;
      const resource = shuffledResources[hexIndex];
      const diceNumber = diceAssigned[hexIndex];
      hexIndex++;

      // 六边形中心坐标（pointy-top）
      const cx = (rowOffsets[row].colStart + col) * Math.sqrt(3) * HEX_SIZE;
      const cy = (row - 2) * 1.5 * HEX_SIZE;

      // 6个顶点坐标（pointy-top 六边形）
      const angles = [30, 90, 150, 210, 270, 330];
      const vertexIds: string[] = [];
      const rawVertices: { x: number; y: number }[] = angles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return {
          x: Math.round((cx + HEX_SIZE * Math.cos(rad)) * 1000) / 1000,
          y: Math.round((cy + HEX_SIZE * Math.sin(rad)) * 1000) / 1000,
        };
      });

      for (const rv of rawVertices) {
        const vKey = `${rv.x}_${rv.y}`;
        if (!vertexMap.has(vKey)) {
          vertexMap.set(vKey, {
            id: `v${vertexMap.size}`,
            x: rv.x,
            y: rv.y,
            adjacentVertexIds: [],
            adjacentEdgeIds: [],
          });
        }
        vertexIds.push(vertexMap.get(vKey)!.id);
      }

      // 6条边
      const edgeIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const vA = vertexIds[i];
        const vB = vertexIds[(i + 1) % 6];
        const eKey = [vA, vB].sort().join("_");
        if (!edgeMap.has(eKey)) {
          const edge: Edge = {
            id: `e${edgeMap.size}`,
            fromVertexId: vA,
            toVertexId: vB,
          };
          edgeMap.set(eKey, edge);

          // 更新顶点的邻接信息
          const vertA = [...vertexMap.values()].find((v) => v.id === vA)!;
          const vertB = [...vertexMap.values()].find((v) => v.id === vB)!;
          if (!vertA.adjacentVertexIds.includes(vB)) vertA.adjacentVertexIds.push(vB);
          if (!vertB.adjacentVertexIds.includes(vA)) vertB.adjacentVertexIds.push(vA);
          if (!vertA.adjacentEdgeIds.includes(edge.id)) vertA.adjacentEdgeIds.push(edge.id);
          if (!vertB.adjacentEdgeIds.includes(edge.id)) vertB.adjacentEdgeIds.push(edge.id);
        }
        edgeIds.push(edgeMap.get(eKey)!.id);
      }

      hexes.push({
        id: hexId,
        resourceType: resource,
        diceNumber,
        vertexIds,
        edgeIds,
      });
    }
  }

  return {
    hexes,
    vertices: [...vertexMap.values()],
    edges: [...edgeMap.values()],
  };
}