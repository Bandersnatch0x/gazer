/**
 * 家谱树节点的渲染原语(GAME_REVIEW §10.5-6:视图归 D 流,原语由 C 提供)。
 *
 * 这里只有纯数据,不依赖 PixiJS,也不依赖 DOM:`node` 与 `edge` 返回的是
 * 「画什么、画在哪」,不是「怎么画」。D 流的 `panels.ts` 拿到这些对象后,
 * 用自己的绘图层(Pixi Graphics 或 DOM)把它们画出来。
 *
 * 坐标是树自己的本地整数坐标系:节点 (0,0) 在左上,x 向右,y 向下,与
 * 画布的等距坐标系无关。所有尺寸都是整数像素,遵守整数缩放红线。
 */

export interface ScreenPos {
  readonly x: number;
  readonly y: number;
}

/** 节点方框:12×12 整数像素,写死尺寸是为了让树在 320 宽的逻辑画布上排得下。 */
export const TREE_NODE_SIZE = 12;

/** 节点与文字之间的一格呼吸。 */
const LABEL_GAP = 2;

export interface TreeNodeDraw {
  readonly kind: "tree_node";
  /** 方框左上角,树本地坐标。 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 方框右缘中点;父边从这里出发。 */
  readonly right: ScreenPos;
  /** 方框左缘中点;父边接进这里。 */
  readonly left: ScreenPos;
  /**
   * 节点标签(名字或编号);null 表示未命名。标签画在方框右侧:
   * labelX/labelY 是文字基线锚点的推荐位置。
   */
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
  /** true = 这一代已经死了;画灰,但它学到的特质还在后代身上。 */
  readonly dead: boolean;
  /** true = 「习得特质已传承」标记:死亡节点的知识还活着的那一划。 */
  readonly inherited: boolean;
}

export interface TreeEdgeDraw {
  readonly kind: "tree_edge";
  readonly from: ScreenPos;
  readonly to: ScreenPos;
  /** 直角折线的拐点横坐标(三段式:出-横-竖-入),整数。 */
  readonly elbowX: number;
}

export interface TreeNodeOptions {
  readonly dead?: boolean;
  readonly inherited?: boolean;
}

/**
 * 建一个家谱树节点的绘制数据。
 *
 * 签名:`node(x, y, label?, options?)`。`x`/`y` 是方框左上角(整数);
 * `label` 是可选标签;`options.dead` 把节点画灰,`options.inherited`
 * 打上「特质已传承」标记——家谱树是这句话唯一可见的地方。
 *
 * 纯函数:同样的输入永远返回同样的数据,不碰任何全局状态。
 */
export function node(x: number, y: number, label: string | null = null, options: TreeNodeOptions = {}): TreeNodeDraw {
  const left = Math.round(x);
  const top = Math.round(y);
  return {
    kind: "tree_node",
    x: left,
    y: top,
    w: TREE_NODE_SIZE,
    h: TREE_NODE_SIZE,
    right: { x: left + TREE_NODE_SIZE, y: top + TREE_NODE_SIZE / 2 },
    left: { x: left, y: top + TREE_NODE_SIZE / 2 },
    label,
    labelX: left + TREE_NODE_SIZE + LABEL_GAP,
    labelY: top + TREE_NODE_SIZE / 2 + 2,
    dead: options.dead === true,
    inherited: options.inherited === true,
  };
}

/**
 * 建一条父→子边。`from`/`to` 通常是父节点的 `right` 与子节点的 `left`;
 * 边走直角折线(右出、横到中点、折下、接入),`elbowX` 是折点的横坐标。
 */
export function edge(from: ScreenPos, to: ScreenPos): TreeEdgeDraw {
  return {
    kind: "tree_edge",
    from: { x: Math.round(from.x), y: Math.round(from.y) },
    to: { x: Math.round(to.x), y: Math.round(to.y) },
    elbowX: Math.round((from.x + to.x) / 2),
  };
}
