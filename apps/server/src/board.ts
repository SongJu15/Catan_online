import type { Board, Hex, Vertex, Edge, TerrainType } from "@catan/shared";

// ============================================================
// 标准卡坦岛地形分布（19块六边形）
// ============================================================
const RESOURCE_TILES: TerrainType[] = [
  "wood", "wood", "wood", "wood",
  "brick", "brick", "brick",
  "sheep", "sheep", "sheep", "sheep",
  "wheat", "wheat", "wheat", "wheat",
  "ore", "ore", "ore",
  "desert",
];

// 标准骰子数字分布（18个数字，沙漠不分配）
const DICE_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// 每行的六边形数量
const ROW_SIZES = [3, 4, 5, 4, 3];

// 六边形大小（像素）
const HEX_SIZE = 72;

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
// 顶点坐标 key（用整数避免浮点误差）
// ============================================================
function vertexKey(x: number, y: number): string {
  return `${Math.round(x * 10)}_${Math.round(y * 10)}`;
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

  const hexes: Hex[] = [];
  const vertexMap = new Map<string, Vertex>(); // key: vertexKey
  const edgeMap = new Map<string, Edge>();     // key: "vA_vB" 排序后

  let hexIndex = 0;

  // 每行的水平偏移（pointy-top 六边形）
  // row 0: 3块，row 1: 4块，row 2: 5块，row 3: 4块，row 4: 3块
  const rowColOffsets = [-1, -1.5, -2, -1.5, -1];

  const canvasWidth = 800;
  const canvasHeight = 700;
  const originX = canvasWidth / 2;
  const originY = canvasHeight / 2;

  for (let row = 0; row < ROW_SIZES.length; row++) {
    const cols = ROW_SIZES[row];
    for (let col = 0; col < cols; col++) {
      const hexId = `h${hexIndex}`;
      const terrain = shuffledResources[hexIndex];
      const diceNumber = diceAssigned[hexIndex];
      hexIndex++;

      // 六边形中心坐标（pointy-top）
      const cx = originX + (rowColOffsets[row] + col) * Math.sqrt(3) * HEX_SIZE;
      const cy = originY + (row - 2) * 1.5 * HEX_SIZE;

      // pointy-top 六边形的 6 个顶点角度（从顶部开始，顺时针）
      const angles = [270, 330, 30, 90, 150, 210]; // 度
      const rawVertices = angles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return {
          x: cx + HEX_SIZE * Math.cos(rad),
          y: cy + HEX_SIZE * Math.sin(rad),
        };
      });

      // 注册顶点（去重）
      const vertexIds: string[] = [];
      for (const rv of rawVertices) {
        const vKey = vertexKey(rv.x, rv.y);
        if (!vertexMap.has(vKey)) {
          vertexMap.set(vKey, {
            id: `v${vertexMap.size}`,
            x: Math.round(rv.x * 10) / 10,
            y: Math.round(rv.y * 10) / 10,
            adjacentVertexIds: [],
            adjacentEdgeIds: [],
            adjacentHexIds: [],
          });
        }
        const v = vertexMap.get(vKey)!;
        if (!v.adjacentHexIds.includes(hexId)) {
          v.adjacentHexIds.push(hexId);
        }
        vertexIds.push(v.id);
      }

      // 注册边（去重）
      const edgeIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const vA = vertexIds[i];
        const vB = vertexIds[(i + 1) % 6];
        const eKey = [vA, vB].sort().join("_");
        if (!edgeMap.has(eKey)) {
          const vertA = [...vertexMap.values()].find((v) => v.id === vA)!;
          const vertB = [...vertexMap.values()].find((v) => v.id === vB)!;
          const edge: Edge = {
            id: `e${edgeMap.size}`,
            fromVertexId: vA,
            toVertexId: vB,
            x1: vertA.x,
            y1: vertA.y,
            x2: vertB.x,
            y2: vertB.y,
          };
          edgeMap.set(eKey, edge);
          // 更新顶点邻接
          if (!vertA.adjacentVertexIds.includes(vB)) vertA.adjacentVertexIds.push(vB);
          if (!vertB.adjacentVertexIds.includes(vA)) vertB.adjacentVertexIds.push(vA);
          if (!vertA.adjacentEdgeIds.includes(edge.id)) vertA.adjacentEdgeIds.push(edge.id);
          if (!vertB.adjacentEdgeIds.includes(edge.id)) vertB.adjacentEdgeIds.push(edge.id);
        }
        edgeIds.push(edgeMap.get(eKey)!.id);
      }

      hexes.push({
        id: hexId,
        x: Math.round(cx * 10) / 10,
        y: Math.round(cy * 10) / 10,
        terrain,
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