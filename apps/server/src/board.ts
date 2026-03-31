import type { Board, Hex, Vertex, Edge, Port, PortType, TerrainType } from "@catan/shared";


// ============================================================
// 标准卡坦岛地形分布（18块六边形，不含沙漠）
// ============================================================
const RESOURCE_TILES: TerrainType[] = [
  "wood", "wood", "wood", "wood",
  "brick", "brick", "brick",
  "sheep", "sheep", "sheep", "sheep",
  "wheat", "wheat", "wheat", "wheat",
  "ore", "ore", "ore",
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
  // 沙漠固定在中央（索引9，第3行正中间），其余18块随机洗牌
  const shuffled18 = shuffle(RESOURCE_TILES);
  const shuffledResources: TerrainType[] = [
    ...shuffled18.slice(0, 9),
    "desert",
    ...shuffled18.slice(9),
  ];

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

  // ============================================================
  // 生成港口（固定位置，标准卡坦岛布局）
  // ============================================================
  function generatePorts(hexes: Hex[], vertices: Vertex[]): Port[] {
    // 标准卡坦岛有 9 个港口，固定分布在地图边缘
    // 每个港口定义：所在六边形 ID + 该六边形的哪两个顶点索引（0-5）+ 类型
    // pointy-top 顶点顺序：0=上, 1=右上, 2=右下, 3=下, 4=左下, 5=左上
    const PORT_DEFS: { hexIndex: number; vi1: number; vi2: number; type: PortType }[] = [
      // 上边
      { hexIndex: 0, vi1: 0, vi2: 5, type: "ore" },   // 左上角
      { hexIndex: 1, vi1: 0, vi2: 5, type: "any" },   // 上中左
      { hexIndex: 2, vi1: 0, vi2: 1, type: "any" },   // 上中右
      // 右边
      { hexIndex: 6, vi1: 1, vi2: 2, type: "sheep" }, // 右上
      { hexIndex: 11, vi1: 1, vi2: 2, type: "any" },  // 右中
      { hexIndex: 15, vi1: 2, vi2: 3, type: "brick" },// 右下
      // 下边
      { hexIndex: 18, vi1: 3, vi2: 4, type: "any" },  // 右下角
      { hexIndex: 17, vi1: 3, vi2: 4, type: "wheat" },// 下中右
      // 左边
      { hexIndex: 12, vi1: 4, vi2: 5, type: "wood" }, // 左中
      { hexIndex: 7, vi1: 4, vi2: 5, type: "any" },   // 左上
    ];

    const ports: Port[] = [];

    for (let i = 0; i < PORT_DEFS.length; i++) {
      const def = PORT_DEFS[i];
      const hex = hexes[def.hexIndex];
      if (!hex) continue;

      const vId1 = hex.vertexIds[def.vi1];
      const vId2 = hex.vertexIds[def.vi2];
      const v1 = vertices.find(v => v.id === vId1);
      const v2 = vertices.find(v => v.id === vId2);
      if (!v1 || !v2) continue;

      // 港口显示坐标：两个顶点中点，再向外偏移
      const midX = (v1.x + v2.x) / 2;
      const midY = (v1.y + v2.y) / 2;
      // 向远离六边形中心的方向偏移
      const dx = midX - hex.x;
      const dy = midY - hex.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const portX = Math.round((midX + (dx / len) * 28) * 10) / 10;
      const portY = Math.round((midY + (dy / len) * 28) * 10) / 10;

      ports.push({
        id: `port${i}`,
        type: def.type,
        x: portX,
        y: portY,
        vertexIds: [vId1, vId2],
      });
    }

    return ports;
  }

  const ports = generatePorts(hexes, [...vertexMap.values()]);
  return {
    hexes,
    vertices: [...vertexMap.values()],
    edges: [...edgeMap.values()],
    ports,
  };
}