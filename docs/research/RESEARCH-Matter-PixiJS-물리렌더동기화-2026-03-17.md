# 리서치 보고서: Matter.js 0.20 + PixiJS v8 물리-렌더 동기화 & 구슬/파친코 물리 파라미터

> 생성일: 2026-03-17
> 프로젝트: 뽑기런 (bbobgi-run) — Phase 2 진입 준비
> 기반 자료: ANALYSIS-bbobgi-run-2026-03-16.md

---

## 1. 리서치 배경

Phase 1(경마 모드) 완료 후 Phase 2(물리 모드: MarbleRace + Pachinko) 진입에 앞서, Matter.js 0.20과 PixiJS v8의 통합 패턴, 구슬/파친코 물리 파라미터 튜닝 가이드를 조사한다.

기존 `PhysicsWorld.ts` 래퍼가 `createWall`, `createBall`, `createPin` 메서드를 제공하며, `update(delta)` 메서드가 `Engine.update(engine, delta * 16.667)` 방식으로 구현되어 있다.

---

## 2. 조사 결과

### 2-1. 물리-렌더 동기화 패턴

#### Fixed Timestep (권장)

Matter.js 0.20은 **고정 timestep만 공식 지원**한다. Runner 릴리스 노트에서 "non-fixed timestep 지원 제거"가 명시되었으며, 가변 delta 전달 시 충돌 터널링, 속도 이상 등 비결정적 동작이 발생한다 (Issue #332).

| 항목 | 값 | 비고 |
|---|---|---|
| 권장 delta | `1000 / 60` (≈16.667ms) | 고정값, 런타임 변경 금지 |
| 최소 delta | `1000 / 120` | 품질 향상, 성능 비용 |
| 고주사율 대응 | Runner가 프레임당 0~N회 업데이트 | PR #1254로 수정됨 |

#### PixiJS v8 Ticker + Matter.js 통합 구조

```typescript
import { UPDATE_PRIORITY } from 'pixi.js';

// ⚠️ Matter.Runner 사용 금지 — Ticker와 이중 루프 발생 (Issue #217)
app.ticker.add((ticker) => {
  // 1. 물리 업데이트 — 항상 고정 delta
  Matter.Engine.update(engine, 1000 / 60);

  // 2. 스프라이트 위치 동기화
  for (const obj of physicsObjects) {
    obj.sprite.x = obj.body.position.x;
    obj.sprite.y = obj.body.position.y;
    obj.sprite.rotation = obj.body.angle;
  }
}, undefined, UPDATE_PRIORITY.HIGH);
```

**핵심 규칙:**
- `Matter.Runner`와 `PixiJS Ticker`를 **절대 동시 사용 금지** — Engine.update 이중 호출로 물리 2배속
- Ticker callback에서 `ticker.deltaMS`를 Matter에 넘기지 않고 **항상 고정값 사용**
- PixiJS v8에서 콜백 파라미터는 `Ticker` 인스턴스: `ticker.deltaTime`(배율 ≈1.0) vs `ticker.deltaMS`(밀리초) 구분 필수

#### 현재 PhysicsWorld.ts 진단

```typescript
// 현재 코드
update(delta: number): void {
  Matter.Engine.update(this.engine, delta * 16.667);
}
```

- `delta`가 `ticker.deltaTime`(무차원 배율, 60fps에서 ≈1.0)이면 → `1.0 * 16.667 ≈ 16.667ms` → 실질적 고정 timestep **✅ 정상**
- `delta`가 `ticker.deltaMS`(실제 밀리초)이면 → 가변 timestep 전달 **❌ 위험**
- **권장 수정**: delta 파라미터 무시하고 내부에서 `1000/60` 고정값 사용

#### 보간(Interpolation) 판단

- 60fps 고정 루프에서 physics delta = 1000/60, render = 60fps이면 위상 차이 거의 없음
- 120Hz+ 디스플레이 타겟이 아니면 **보간 생략 가능**
- 뽑기런은 관람형 30초 게임이므로 보간 불필요

#### 좌표계 동기화

| 항목 | Matter.js | PixiJS v8 |
|---|---|---|
| 원점 | 좌상단 (0,0) | 좌상단 (0,0) |
| 바디 위치 | **중심점** 기준 | 기본 앵커 **좌상단** |
| 회전 단위 | 라디안 | 라디안 |

```typescript
// PixiJS Sprite 앵커를 반드시 중앙으로 설정
sprite.anchor.set(0.5, 0.5);  // 필수!
sprite.x = body.position.x;
sprite.y = body.position.y;
sprite.rotation = body.angle;
```

---

### 2-2. 구슬 레이스 트랙 설계

#### 트랙 구성 방식

| 방법 | API | 적합 용도 |
|---|---|---|
| 기울어진 직사각형 | `Bodies.rectangle(x, y, w, h, {isStatic:true, angle})` | 직선 경사로, 가이드 벽 **(권장)** |
| 사다리꼴 | `Bodies.trapezoid(x, y, w, h, slope)` | 슬로프 진입/출구 구간 |
| 정점 다각형 | `Bodies.fromVertices(x, y, vertices)` | 복잡한 곡선 (decomp.js 필요) |

**베스트 프랙티스**: 지그재그 트랙은 `Bodies.rectangle`을 좌우 교대 배치하는 것이 가장 안정적.

```typescript
// 지그재그 경사로 배치 패턴
const ramps = [
  Bodies.rectangle(cx - 80, 150, 400, 15, { isStatic: true, angle:  0.3 }),
  Bodies.rectangle(cx + 80, 250, 400, 15, { isStatic: true, angle: -0.3 }),
  Bodies.rectangle(cx - 80, 350, 400, 15, { isStatic: true, angle:  0.3 }),
  // ... 반복
];
```

#### 구슬 레이스 물리 파라미터

| 파라미터 | Matter.js 기본값 | 구슬 레이스 권장값 | 근거 |
|---|---|---|---|
| **공 restitution** | 0 | **0.3 ~ 0.5** | 살짝 튀되 에너지 손실로 30초 완주 |
| **공 friction** | 0.1 | **0.005 ~ 0.01** | 경사면에서 자연스러운 구름 |
| **공 frictionAir** | 0.01 | **0.005 ~ 0.008** | 50~80% 수준, 공기 저항 감소 |
| **공 frictionStatic** | 0.5 | **0.1** | 정지 마찰 감소, 즉시 구르기 |
| **공 density** | 0.001 | **0.001 ~ 0.002** | 기본값 유지 또는 약간 증가 |
| **벽 restitution** | 0 | **0.3** | 공과 조합시 `Math.max()` 적용 |
| **벽 friction** | 0.1 | **0.01** | 구름 마찰 최소화 |
| **gravity.y** | 1 | **1 ~ 1.5** | 30초 타임라인에 맞춰 조정 |

#### 구슬 간 충돌 안정성 팁

- 트랙 폭: 구슬 반경의 **최소 3배 이상** (구슬 8px → 트랙 폭 최소 50px)
- 10개 구슬 시: 와이드 트랙(70px+) 또는 멀티레인 구조
- `enableSleeping: false` 유지 (구슬 멈춤 방지)

---

### 2-3. 파친코/핀볼 핀 배치

#### 핀 배치 알고리즘 (지그재그 격자)

```typescript
for (let row = 0; row < rows; row++) {
  const offset = (row % 2 === 0) ? 0 : spacing / 2;
  const colsInRow = (row % 2 === 0) ? cols : cols - 1;
  for (let col = 0; col < colsInRow; col++) {
    const x = startX + offset + col * spacing;
    const y = startY + row * rowSpacing;
    pins.push(Bodies.circle(x, y, pinRadius, { isStatic: true, restitution: 1.0 }));
  }
}
```

#### 핀/공 수치 비교 (기존 구현 사례)

| 구현 사례 | 핀 반경 | 공 반경 | 행 수 | 열 수 | 수평 간격 | 수직 간격 |
|---|---|---|---|---|---|---|
| Phaser Pachinko (공식) | 3px | — | 8행 | 22~23열 교대 | 32px | 38px |
| Plinko Gist (800×600) | 5px | 8px | 10행 | 20열 교대 | 40px | 60px |
| Coding Train (600×700) | — | 10px | 9행 | 11열 교대 | ~55px | ~78px |

#### 뽑기런 권장값 (800×600 기준)

| 파라미터 | 핀 (static) | 공 (dynamic) |
|---|---|---|
| 반경 | **4~6px** | **8~10px** |
| restitution | **1.0** (완전 탄성) | **0.5 ~ 0.8** |
| friction | **0 ~ 0.005** | **0.005** |
| frictionAir | — | **0.01 ~ 0.02** |
| density | — | **0.001** (기본값) |

- 행: **8~12행**, 열: **15~20열** (교대 패턴)
- 수평 간격: 공 반경 × 5~6
- 수직 간격: 수평 간격 × 1.2~1.5
- `Math.max()` 규칙: 핀 restitution 1.0이면 공 값과 무관하게 항상 1.0 적용

#### 하단 슬롯

- 슬롯 폭 = (전체 너비 - 양쪽 여백) / 슬롯 수
- `isSensor: true` 바디로 충돌 이벤트만 감지하거나 얇은 정적 벽으로 구분

---

### 2-4. 30초 타임라인 카오스 이벤트

#### 중력 실시간 변경

```typescript
// 수평 중력 추가 (바람 효과)
engine.gravity.x = 0.3;
// 중력 약화
engine.gravity.y = 0.8;
// 중력 반전 (0.5~1초 후 복귀)
engine.gravity.y = -0.5;
```

**안전 범위**: `gravity.y` = **-2 ~ 3** (Issue #476: 낮은 중력에서 불안정)

#### 동적 장애물 추가/제거

```typescript
const obstacle = Bodies.rectangle(400, 300, 100, 20, { isStatic: true, restitution: 0.8 });
Composite.add(engine.world, obstacle);
// 일정 시간 후 제거
setTimeout(() => Composite.remove(engine.world, obstacle), 2000);
```

- 정적 바디는 solver에서 제외되므로 추가/제거가 안정적

#### 속도/힘 직접 조작

| 구분 | `Body.applyForce` | `Body.setVelocity` |
|---|---|---|
| 지속성 | 단일 업데이트만 적용 (매 프레임 호출) | 즉시 적용, 한 번만 호출 |
| 토크 | 위치에 따라 회전력 발생 | 선속도만 변경 |
| 안정성 | 안정적 | 터널링 주의 |
| 용도 | 바람, 지속 추진력 | 순간 가속, 충격 이벤트 |

#### ⚠️ 슬로우모션 주의사항

`engine.timing.timeScale` 동적 변경 시 **물리 불안정** (Issue #303, 미해결):
- 증상: 정지한 바디가 튀거나 에너지 부정확
- **권장**: GSAP 렌더 레이어에서만 슬로우모션 처리, 물리는 정상 속도 유지
- 대안: `Engine.update()` 호출 빈도를 줄여 물리적 슬로우모션 구현

#### 터널링 방지 (CCD 미지원)

1. 벽/트랙 두께: 공 반경의 **2배 이상**
2. `Engine.update()` delta: **16.666ms 이하** 유지
3. 서브스텝: 1프레임에 `Engine.update(engine, 1000/60/2)` × **2회 호출**
4. 속도 상한: `Math.min(speed, maxSpeed)` 패턴

---

### 2-5. Matter.js 0.20 성능 최적화

| 설정 | 기본값 | 뽑기런 권장 | 근거 |
|---|---|---|---|
| `positionIterations` | 6 | **6** (기본 유지) | ~20 바디에서 병목 아님 |
| `velocityIterations` | 4 | **4** (기본 유지) | 동일 |
| `constraintIterations` | 2 | **2** (기본 유지) | 동일 |
| `enableSleeping` | false | **false** | 레이스 게임이므로 바디 항상 동적, sleeping 버그 회피 (Issue #1077) |
| broadphase | Grid (기본) | **기본 유지** | 소규모에서 튜닝 불필요 |

- `World.add/clear` → **`Composite.add/clear` 사용** (World는 deprecated 별칭)

---

### 2-6. 메모리 정리 (씬 전환)

```typescript
// 1. 이벤트 리스너 먼저 제거 (중요: Engine.clear 이전)
Matter.Events.off(engine, 'beforeUpdate', onBeforeUpdate);
Matter.Events.off(engine, 'collisionStart', onCollision);

// 2. World 정리
Matter.World.clear(engine.world, false); // false = static도 제거

// 3. Engine 내부 상태 초기화
Matter.Engine.clear(engine);

// 4. Ticker에서 콜백 제거
app.ticker.remove(physicsUpdateFn);
```

---

## 3. 프로젝트 적합성 분석

### 호환성
- Matter.js 0.20.0 + PixiJS v8.17.0: 좌표계 동일(좌상단 원점), 회전 단위 동일(라디안)
- PhysicsWorld 래퍼가 이미 추상화 제공 → 직접 통합 비용 최소

### 도입 비용
- PhysicsWorld.update() 수정: 고정 timestep으로 변경 (1줄)
- Sprite anchor 중앙 설정 패턴 추가
- 기존 HorseRaceScene 패턴(30초 타임라인, 카운트다운, 카오스) 재활용 가능

### 아키텍처 정합성
- BaseScene 생명주기(init → update → destroy)와 물리 루프 자연스럽게 통합
- Observer 패턴 미완성 → Phase 2에서 이벤트 시스템 도입 필요
- GSAP 슬로우모션과 Matter.js timeScale 분리 필요 (렌더 vs 물리)

### PhysicsWorld.ts 수정 사항

| 항목 | 현재 | 수정 |
|---|---|---|
| `update(delta)` | `Engine.update(engine, delta * 16.667)` | `Engine.update(engine, 1000 / 60)` 고정 |
| `createBall` restitution | 0.6 | 모드별 분기 또는 options 오버라이드 |
| `destroy()` | `World.clear` + `Engine.clear` | 이벤트 리스너 제거 추가 |

---

## 4. 권장안

### 1순위: PhysicsWorld 고정 timestep + 지그재그 트랙 + 지그재그 핀 배치

- `Engine.update(engine, 1000/60)` 고정 delta
- 구슬 레이스: `Bodies.rectangle` 지그재그 경사로, 공 restitution 0.4 / friction 0.01
- 파친코: 홀짝 오프셋 핀 배치, 핀 restitution 1.0 / 공 restitution 0.5
- 카오스 이벤트: gravity.x/y 변경 + Composite.add 동적 장애물
- 슬로우모션: GSAP 렌더 레이어 전용 (물리 timeScale 변경 금지)

### 2순위: 서브스텝 고품질 모드

- `Engine.update(engine, 1000/120)` × 2회/프레임 → 터널링 완전 방지
- 10개 바디에서 성능 문제 없으나 복잡도 증가

### 주의사항

- `engine.timing.timeScale` 동적 변경 금지 (Issue #303 미해결 버그)
- Matter.Runner 사용 금지 (PixiJS Ticker와 이중 루프)
- `Bodies.fromVertices`는 decomp.js 의존성 추가 필요 — 단순 트랙에선 불필요

---

## 5. 출처

### 공식 문서
- [Matter.Engine API Docs 0.20.0](https://brm.io/matter-js/docs/classes/Engine.html)
- [Matter.Runner API Docs 0.20.0](https://brm.io/matter-js/docs/classes/Runner.html)
- [Matter.Body API Docs 0.20.0](https://brm.io/matter-js/docs/classes/Body.html)
- [Matter.Composite API Docs 0.20.0](https://brm.io/matter-js/docs/classes/Composite.html)
- [PixiJS v8 Ticker Guide](https://pixijs.com/8.x/guides/components/ticker)

### 구현 사례
- [Phaser Pachinko Example v3.85.0](https://phaser.io/examples/v3.85.0/physics/matterjs/view/pachinko)
- [Matter JS Plinko Gist](https://gist.github.com/aeternity1988/e183a4c49fa86352128625425383376d)
- [Plinko with Matter.js - Coding Train](https://thecodingtrain.com/challenges/62-plinko-with-matterjs/)
- [JavaScript Physics with Matter.js - Coder's Block](https://codersblock.com/blog/javascript-physics-with-matter-js/)
- [matter-pixi Integration](https://github.com/celsowhite/matter-pixi)
- [piximatters](https://github.com/KokoDoko/piximatters)

### GitHub Issues (알려진 버그/제약)
- [Issue #332 — Engine.update doesn't scale time correctly](https://github.com/liabru/matter-js/issues/332)
- [Issue #303 — timeScale physics instability](https://github.com/liabru/matter-js/issues/303)
- [Issue #702 — Timestep doesn't take refresh rate into account](https://github.com/liabru/matter-js/issues/702)
- [Issue #217 — Matter.JS and Pixi looping](https://github.com/liabru/matter-js/issues/217)
- [Issue #476 — Strange behaviour if gravity is low](https://github.com/liabru/matter-js/issues/476)
- [Issue #1077 — Sleeping collisionEnd spam](https://github.com/liabru/matter-js/issues/1077)
- [Issue #5 — CCD tunneling](https://github.com/liabru/matter-js/issues/5)

### 일반 참조
- [Fix Your Timestep! - Gaffer On Games](https://gafferongames.com/post/fix_your_timestep/)
- [Phaser Forum — Matter.js update loop discussion](https://phaser.discourse.group/t/question-about-matter-js-and-its-update-loop/4824)

---

> 이 보고서는 Claude Code `/research` 스킬로 자동 생성되었습니다.
