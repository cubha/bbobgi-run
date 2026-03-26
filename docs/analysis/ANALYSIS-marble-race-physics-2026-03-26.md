# 구슬레이스 물리 로직 분석 보고서

> 분석일: 2026-03-26
> 프로젝트: 뽑기런 (bbobgi-run)
> 분석 관점: 구슬레이스 물리 버그 — 벽 통과, 공 반대 방향 이동, 전반적 물리 로직 검토

---

## 1. 분석 대상 파일

| 파일 | 역할 |
|---|---|
| `src/scenes/games/MarbleRaceScene.ts` | 트랙 구성, 물리 루프, 이벤트 시스템 |
| `src/entities/Marble.ts` | 구슬 엔티티, 위치 동기화, 벽 클램핑 |
| `src/core/PhysicsWorld.ts` | Matter.js 래퍼, 고정 timestep, 서브스텝 |

---

## 2. 수치 기준값

```
TRACK.leftX  = 50,   TRACK.rightX = 340   → 트랙 폭 = 290px
TRACK.wallThick = 12, TRACK.rampThick = 14
cx = (50 + 340) / 2 = 195
구슬 반경 = 8px (직경 16px)
gravity = { x: 0, y: 0.6 }
서브스텝 = 2회 (dt = 8.33ms/step)
```

---

## 3. 치명적 버그 분석

### 🔴 버그 1: 좌우 벽 통과 — 3개의 복합 원인

#### 원인 1-A: 벽 두께(12px)가 고속 구슬보다 얇아 터널링 발생

```
wallThick = 12px
구슬 최대 속도: frictionAir=0.01, gravity=0.6 → 제한 없는 가속
1프레임 이동량: 속도 10px/step × 2substep = 20px/frame
→ 벽 두께(12px)보다 큼 → 터널링 가능
```

**위치:** `PhysicsWorld.ts:34` (subSteps=2), `PhysicsWorld.ts:83` (createBall 파라미터)
**RESEARCH 권장사항:** "벽/트랙 두께: 공 반경의 2배 이상" → 최소 16px, 안전값 20px+

#### 원인 1-B: outerBoundary 벽이 내부 벽과 6px 겹침 배치

```typescript
// MarbleRaceScene.ts:272~278
const outerLeft = PhysicsWorld.createWall(TRACK.leftX - BOUND_THICK/2, ...);
// 중심 x = 50 - 20 = 30, 폭 = 40
// 우측 가장자리 = 30 + 20 = 50px ← 내부 벽 중심과 정확히 일치

// 내부 벽: 중심 x=50, 폭=12 → 외측 가장자리 = 44px
// → outerBoundary(50px)와 내부 벽(44~56px) 사이 6px 겹침
```

**문제:** 두 정적 바디가 물리적으로 겹쳐 있으면, 구슬이 사이에 끼였을 때 impulse resolution이 충돌하여 구슬을 **외부로 사출**시킬 수 있다.

#### 원인 1-C: boundsMinX/MaxX 클램핑이 구슬 반경 미반영

```typescript
// MarbleRaceScene.ts:187~188
const boundsMinX = TRACK.leftX + TRACK.wallThick / 2 + 2;  // = 58
const boundsMaxX = TRACK.rightX - TRACK.wallThick / 2 - 2; // = 332
```

클램핑은 구슬 **중심** 기준이다. 벽 내면은 56px/334px. 구슬 중심이 58/332에서 클램핑되지만, 구슬 가장자리는 이미 58-8=50px(벽 중심)에 도달한 상태이다.

**올바른 값:** `boundsMinX = 56 + 8 = 64`, `boundsMaxX = 334 - 8 = 326`

---

### 🔴 버그 2: 공이 반대 방향으로 흘러감 — 2개의 독립 원인

#### Matter.js angle 방향 기준

```
Bodies.rectangle(x, y, w, h, { angle: θ })
  θ > 0 (양수): 시계방향(CW) → 왼쪽이 낮아짐 → 구슬이 왼쪽으로 흐름
  θ < 0 (음수): 반시계방향(CCW) → 오른쪽이 낮아짐 → 구슬이 오른쪽으로 흐름
```

#### 원인 2-A: buildWallGuides() angle 부호가 반대 — 구슬을 벽으로 밀어냄

```typescript
// MarbleRaceScene.ts:334 — 왼쪽 가이드
angle: guideAngle  // = +0.20 → 시계방향 → 왼쪽 낮음 → 구슬이 왼쪽(벽 방향)으로 흐름 ❌

// MarbleRaceScene.ts:345 — 오른쪽 가이드
angle: -guideAngle  // = -0.20 → 반시계방향 → 오른쪽 낮음 → 구슬이 오른쪽(벽 방향)으로 흐름 ❌
```

**주석에는** "angled inward (positive angle pushes right toward center)"라고 되어 있으나, 실제 물리 동작은 반대이다.

```
현재 (잘못된):
  좌측 가이드 angle=+0.20 → 구슬을 왼쪽(벽)으로 유도 → 데드존 악화
  우측 가이드 angle=-0.20 → 구슬을 오른쪽(벽)으로 유도 → 데드존 악화

올바른 방향:
  좌측 가이드 angle=-0.20 → 구슬을 오른쪽(중앙)으로 유도
  우측 가이드 angle=+0.20 → 구슬을 왼쪽(중앙)으로 유도
```

이 가이드 레일이 Zone B~E(y=520~2200) 전구간에 140px 간격으로 13개씩(좌우 합계 26개) 배치되어 있으므로, **전체 트랙에 걸쳐** 구슬을 벽으로 밀어내는 효과가 누적된다. 이것이 "공이 계속 오른쪽으로 이동"하는 주된 원인이다.

#### 원인 2-B: Zone C→D 연결에서 지그재그 연속성 불일치

```
Zone A 램프 dir 패턴 (i%2===0 ? 1 : -1):
  angle: -0.18, +0.18, -0.20, +0.20  →  오른쪽, 왼쪽, 오른쪽, 왼쪽 ✅

Zone C 램프 dir 패턴 (i%2===0 ? 1 : -1):
  angle: -0.25, +0.25, -0.25  →  오른쪽, 왼쪽, 오른쪽

Zone D 램프 dir 패턴 (i%2===0 ? -1 : 1):
  angle: +0.30, -0.30, +0.35  →  왼쪽, 오른쪽, 왼쪽
```

Zone C 마지막(오른쪽)과 Zone D 첫번째(왼쪽)는 교대되지만, Zone 간 300px(1060→1360) 자유낙하 구간에서 벽 가이드(원인 2-A)가 구슬을 벽으로 밀어내 의도한 지그재그가 무너진다.

---

## 4. 추가 물리 로직 문제

### 🔴 C-1: 슬로우모션 시 물리 delta 축소 — Matter.js Issue #303 위반

```typescript
// MarbleRaceScene.ts:180~183
if (this.phase === 'slowmo') {
  this.physics.update(0.3);   // dt = 16.667 * 0.3 / 2 = 2.5ms
} else {
  this.physics.update();
}
```

RESEARCH 문서가 명시적으로 경고: "engine.timing.timeScale 동적 변경 시 물리 불안정 (Issue #303)". `deltaScale=0.3`은 엔진에 비정상적으로 작은 dt(2.5ms)를 전달하며, 이는 **충돌 해소 정밀도를 무너뜨려** 슬로우모션 구간에서 구슬이 경사면/벽을 뚫거나 갑자기 튀는 현상을 유발한다.

**RESEARCH 권장:** "GSAP 렌더 레이어에서만 슬로우모션 처리, 물리는 정상 속도 유지. 대안: Engine.update() 호출 빈도를 줄여 물리적 슬로우모션 구현."

---

### 🟡 I-1: Marble.sync()가 렌더 동기화 + 물리 조작을 혼합

```typescript
// Marble.ts:88~109
sync(boundsMinX?, boundsMaxX?): void {
  // 1. 벽 초과 시 물리 위치/속도 강제 변경
  if (pos.x < boundsMinX || pos.x > boundsMaxX) {
    Matter.Body.setPosition(this.body, { x: clampedX, y: pos.y });
    Matter.Body.setVelocity(this.body, { x: -vel.x * 0.3, y: vel.y });
  }
  // 2. 벽 근처 끼임 구제
  if (nearWall && Math.abs(vel.y) < 0.3 && Math.abs(vel.x) < 0.5) {
    Matter.Body.setVelocity(this.body, { x: nudgeX, y: 1.5 });
  }
  // 3. PixiJS 위치 동기화
  this.container.x = this.body.position.x;
  this.container.y = this.body.position.y;
}
```

**문제:**
- `sync()`는 물리 스텝 **이후**에 호출되는데, 다시 물리 상태를 변경하면 해당 프레임의 물리 결과가 무효화됨
- `nearWall` 구제 로직이 `checkStuckMarbles()`와 기능 **중복** — 두 시스템이 동시에 같은 구슬에 개입 가능
- RESEARCH의 "물리 업데이트 → 동기화" 순서 원칙 위반

---

### 🟡 I-2: 핀을 createPin() 대신 createBall()로 생성 — restitution 불일치

```typescript
// MarbleRaceScene.ts:448~454 — buildPinZone()
const pin = PhysicsWorld.createBall(pinX, pinY, TRACK.pinRadius, {
  isStatic: true,
  restitution: 0.55,   // ← RESEARCH 권장 1.0 미준수
});

// PhysicsWorld.ts:92~98 — createPin() (사용하지 않음)
static createPin(x, y, radius) {
  return Matter.Bodies.circle(x, y, radius, {
    isStatic: true,
    restitution: 1.0,   // 완전 탄성 (RESEARCH 권장)
  });
}
```

`createPin()` 유틸이 존재하나 미사용. restitution 0.55는 핀에서 에너지 손실을 유발하여 핀존에서 데드스톱 발생 가능.

---

### 🟡 I-3: setTimeout 핸들 미저장 — 씬 파괴 후 dangling 참조

```typescript
// MarbleRaceScene.ts:1015 (applyChaos), 917 (fireLastBooster), 931 (fireLeadLightning)
setTimeout(() => { ... }, 600);   // 핸들 미저장
setTimeout(() => { ... }, 1500);  // 핸들 미저장
setTimeout(() => { ... }, 1500);  // 핸들 미저장
```

`destroy()`에서 `dragResumeTimer`만 정리하고, 이 3개의 setTimeout은 취소 불가. 씬 빠른 전환 시 파괴된 객체 참조 위험.

---

### 🟡 I-4: 카오스 장애물 Graphics.destroy() 누락 — WebGL 리소스 누수

```typescript
// MarbleRaceScene.ts:1065~1068
for (const child of toRemove) this.trackContainer.removeChild(child);
// ← child.destroy() 호출 없음
```

`removeChild()`는 디스플레이 트리에서만 제거. GPU 텍스처/리소스는 명시적 `destroy()` 필요.

---

### 🟡 I-5: kick bump 반경 3px — 터널링 기준 미달

```typescript
// MarbleRaceScene.ts:406~411
const kickPin = PhysicsWorld.createBall(cx, y + 12, 3, { isStatic: true, ... });
```

반경 3px(직경 6px)은 구슬 직경(16px)의 37.5%. RESEARCH 기준 "벽 두께 ≥ 공 반경의 2배(16px)" 미달. 고속 낙하 시 관통 가능.

---

### 🟡 I-6: Level 3 텔레포트 착지 위치가 정적 바디 내부일 가능성

```typescript
// MarbleRaceScene.ts:1183~1189
const newX = cx + (Math.random() - 0.5) * 60;    // cx ± 30px
const newY = Math.max(TRACK.startY, pos.y - 50);  // 50px 위
Matter.Body.setPosition(marble.body, { x: newX, y: newY });
```

50px 위 위치가 정확히 램프/핀 내부일 경우, Matter.js가 정적 바디와 겹친 동적 바디를 폭발적 반발력으로 분리 → 예측 불가 속도 발생.

---

## 5. 물리 파라미터 평가

| 파라미터 | 현재값 | RESEARCH 권장 | 평가 |
|---|---|---|---|
| gravity.y | 0.6 | 1 ~ 1.5 | ⚠️ 낮음 — 30초 완주 가능하나 가속 부족 |
| 구슬 restitution | 0.3 | 0.3 ~ 0.5 | ✅ 적절 |
| 구슬 friction | 0.08 | 0.005 ~ 0.01 | 🔴 **8~16배 높음** — 경사면에서 마찰로 정지 가능 |
| 구슬 frictionAir | 0.01 | 0.005 ~ 0.008 | ⚠️ 약간 높음 |
| 구슬 frictionStatic | 0.03 | 0.1 | ✅ 오히려 낮아 즉시 구르기에 유리 |
| 벽 두께 | 12px | ≥ 구슬 반경×2 = 16px | 🔴 **터널링 위험** |
| 서브스텝 | 2 | 2~4 | ⚠️ 벽 두께 12px 대비 부족 |
| positionIterations | 10 | 6 | ✅ 충분 |
| velocityIterations | 8 | 4 | ✅ 충분 |
| 핀 restitution | 0.55 | 1.0 | 🔴 미준수 |

**특히 `friction: 0.08`은** RESEARCH 권장값(0.005~0.01)의 8~16배로, 구슬이 경사면에서 충분히 미끄러지지 않아 끼임 현상의 근본 원인 중 하나이다.

---

## 6. 수정 우선순위 로드맵

### 즉시 수정 (Quick Win) — 벽 통과 + 반대 방향 해결

| # | 항목 | 파일:라인 | 수정 내용 |
|---|---|---|---|
| 1 | **벽 가이드 angle 반전** | MarbleRaceScene.ts:334,345 | 좌측 `guideAngle` → `-guideAngle`, 우측 `-guideAngle` → `guideAngle` |
| 2 | **boundsMinX/MaxX 구슬 반경 반영** | MarbleRaceScene.ts:187~188 | `leftX + wallThick/2 + radius + 2` / `rightX - wallThick/2 - radius - 2` |
| 3 | **벽 두께 증가** | MarbleRaceScene.ts:41 | `wallThick: 12` → `20` |
| 4 | **outerBoundary 겹침 해소** | MarbleRaceScene.ts:272~278 | outerLeft x를 `leftX - wallThick/2 - BOUND_THICK/2`로 수정 |
| 5 | **구슬 friction 감소** | PhysicsWorld.ts:84 | `friction: 0.08` → `0.01` |
| 6 | **핀 생성을 createPin()으로 교체** | MarbleRaceScene.ts:448 | `createBall(...)` → `createPin(pinX, pinY, TRACK.pinRadius)` |

### 단기 수정 (안정성 개선)

| # | 항목 | 파일:라인 | 수정 내용 |
|---|---|---|---|
| 7 | **슬로우모션 물리 분리** | MarbleRaceScene.ts:180~184 | delta 축소 대신 프레임 스킵 방식으로 변경 |
| 8 | **sync()에서 물리 조작 분리** | Marble.ts:88~109 | 물리 클램핑을 별도 메서드로 분리, 물리 스텝 **전**에 호출 |
| 9 | **setTimeout 핸들 관리** | MarbleRaceScene.ts:1015,917,931 | 핸들 배열 저장 + destroy()에서 일괄 clearTimeout |
| 10 | **카오스 장애물 destroy()** | MarbleRaceScene.ts:1067 | `removeChild(child)` 후 `child.destroy()` 추가 |
| 11 | **서브스텝 증가** | PhysicsWorld.ts:34 | `subSteps: 2` → `4` (벽 두께 20px 기준 충분) |

### 중장기 개선 (구조적)

| # | 항목 | 설명 |
|---|---|---|
| 12 | 텔레포트 안전 스폰 | Level 3 텔레포트 시 정적 바디와 겹치지 않는 위치 검증 |
| 13 | 속도 상한 제한 | `beforeUpdate` 이벤트에서 `Math.min(speed, maxSpeed)` 적용 |
| 14 | sync/stuck 책임 분리 | 벽 클램핑은 `beforeUpdate`에서, 끼임 구제는 전용 시스템으로 분리 |

---

## 7. 리서치 출처

- RESEARCH-Matter-PixiJS-물리렌더동기화-2026-03-17.md (프로젝트 내부)
- RESEARCH-구슬레이스-맵패턴-다양화-2026-03-24.md (프로젝트 내부)
- Matter.js Issue #303 — timeScale physics instability
- Matter.js Issue #332 — Engine.update doesn't scale time correctly
- Matter.js Issue #5 — CCD tunneling

---

> 이 보고서는 Claude Code `/analyze` 스킬로 자동 생성되었습니다.
