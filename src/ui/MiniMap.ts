import { Container, Graphics } from 'pixi.js';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '@utils/constants';

interface MarbleInfo {
  x: number;
  y: number;
  color: number;
  isDummy: boolean;
}

interface ViewBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const MINI_WIDTH = 60;
const MINI_HEIGHT = 200;
const MINI_X = DESIGN_WIDTH - 70;
const MINI_Y = DESIGN_HEIGHT - 220;

export class MiniMap {
  private container: Container;
  private bg: Graphics;
  private dynamicGfx: Graphics;
  private worldWidth: number;
  private worldHeight: number;

  constructor(parent: Container, worldWidth: number, worldHeight: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    this.container = new Container();
    this.container.x = MINI_X;
    this.container.y = MINI_Y;

    // 반투명 배경 + 테두리
    this.bg = new Graphics();
    this.bg
      .rect(0, 0, MINI_WIDTH, MINI_HEIGHT)
      .fill({ color: 0x000000, alpha: 0.5 })
      .rect(0, 0, MINI_WIDTH, MINI_HEIGHT)
      .stroke({ color: COLORS.textDim, width: 1 });
    this.container.addChild(this.bg);

    // 동적 요소 (구슬, 뷰포트, 피니시라인)
    this.dynamicGfx = new Graphics();
    this.container.addChild(this.dynamicGfx);

    parent.addChild(this.container);
  }

  update(
    marbles: MarbleInfo[],
    viewBounds: ViewBounds,
    finishY: number,
  ): void {
    const gfx = this.dynamicGfx;
    gfx.clear();

    const scaleX = MINI_WIDTH / this.worldWidth;
    const scaleY = MINI_HEIGHT / this.worldHeight;

    // 피니시라인
    const miniFinishY = finishY * scaleY;
    gfx
      .moveTo(0, miniFinishY)
      .lineTo(MINI_WIDTH, miniFinishY)
      .stroke({ color: COLORS.gold, width: 1, alpha: 0.8 });

    // 뷰포트 영역
    const vpX = viewBounds.left * scaleX;
    const vpY = viewBounds.top * scaleY;
    const vpW = (viewBounds.right - viewBounds.left) * scaleX;
    const vpH = (viewBounds.bottom - viewBounds.top) * scaleY;
    gfx
      .rect(
        Math.max(0, vpX),
        Math.max(0, vpY),
        Math.min(MINI_WIDTH, vpW),
        Math.min(MINI_HEIGHT, vpH),
      )
      .stroke({ color: COLORS.text, width: 1, alpha: 0.7 });

    // 구슬 위치
    for (const marble of marbles) {
      const mx = marble.x * scaleX;
      const my = marble.y * scaleY;
      const radius = marble.isDummy ? 1.5 : 2.5;
      gfx
        .circle(mx, my, radius)
        .fill({ color: marble.color, alpha: marble.isDummy ? 0.6 : 1 });
    }
  }

  destroy(): void {
    this.container.parent?.removeChild(this.container);
    this.dynamicGfx.destroy();
    this.bg.destroy();
    this.container.destroy();
  }
}
