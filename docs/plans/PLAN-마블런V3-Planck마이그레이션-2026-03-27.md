# 구현 계획: Marble Run V3 재구현 — Planck.js + 도트 비주얼

> 작성일: 2026-03-27
> 기반 리서치: RESEARCH-마블런-물리엔진-곡선구현, RESEARCH-도트-고퀄리티-구현

## 배경

Matter.js의 근본 한계(ChainShape/Joint/Kinematic 없음)로 마블런 핵심 구조물(곡선 채널, 물레방아, 시소) 구현 불가.
Planck.js(Box2D TS 포트)로 전환하여 ChainShape 곡선 레일 + RevoluteJoint 회전 구조물을 구현한다.

## 영향 범위

- Matter.js 직접 사용 파일: 10개
- PhysicsWorld 래퍼 경유 파일: 19개
- 세그먼트 파일: 13개

---

## SubTask 분리 (8개, 4그룹)

### [그룹 1] 기반 인프라 (순차)

#### SubTask 1: Planck.js 설치 + PhysicsWorld.ts 재작성
- **파일**: `package.json`, `src/core/PhysicsWorld.ts`
- **내용**:
  - `npm i planck` 설치 (matter-js는 PachinkoScene 전환 전까지 유지)
  - PhysicsWorld.ts 전면 재작성
  - 외부 인터페이스 유지, 내부만 Planck.js로 교체
- **신규 API**:
  - `createChain(vertices, loop?)` — ChainShape 곡선 지형
  - `createRevoluteJoint(bodyA, bodyB, anchor, opts?)` — 회전축
  - `createPrismaticJoint(bodyA, bodyB, anchor, axis, opts?)` — 슬라이드
- **API 매핑**:

  | Matter.js | Planck.js |
  |---|---|
  | `Engine.create()` | `World({ gravity: Vec2(0, 9.8) })` |
  | `Bodies.circle()` | `body.createFixture(new Circle(r))` |
  | `Bodies.rectangle()` | `body.createFixture(new Box(w/2, h/2))` |
  | `Events.on('collisionStart')` | `world.on('begin-contact')` |
  | `body.position.x` | `body.getPosition().x` |
  | `Body.setVelocity()` | `body.setLinearVelocity()` |
  | `Body.setAngle()` | `body.setAngle()` |
  | `Body.applyForce()` | `body.applyForce(force, point)` |

- **주의**: Planck.js y축은 위가 +, PixiJS y축은 아래가 + → gravity `Vec2(0, 9.8)` (양수 = 아래)

#### SubTask 2: Marble.ts + MarbleProgress.ts 전환
- **파일**: `src/entities/Marble.ts`, `src/maps/MarbleProgress.ts`, `src/maps/types.ts`
- **내용**:
  - Matter.Body 타입 → Planck.Body 타입
  - `body.position.x/y` → `body.getPosition().x/y`
  - `Body.setVelocity()` → `body.setLinearVelocity()`
  - `Body.applyForce()` → `body.applyForce()`
  - `sync()` 메서드 내부 좌표 매핑 수정
  - types.ts에서 `import type Matter` → `import type * as planck`

---

### [그룹 2] 세그먼트 전환 (병렬 — 그룹 1 완료 후)

#### SubTask 3: 기존 세그먼트 7종 전환
- **파일**: `segments/BaseSegment.ts`, `RampSegment.ts`, `FunnelSegment.ts`, `BottleneckSegment.ts`, `SplitterSegment.ts`, `PinZoneSegment.ts`, `StaircaseSegment.ts`
- **핵심**: BaseSegment.addWall()/addPin() 내부를 Planck.js로 교체하면 하위 7종 대부분 자동 전환

#### SubTask 4: ChainShape 기반 곡선 세그먼트 재구현
- **파일**: `segments/CurvedChannelSegment.ts`, `segments/ChannelRampSegment.ts`, `segments/SpiralSegment.ts`
- **핵심**:
  - 기존 다각형 근사(수십 개 직선벽) → `ChainShape(vertices)` 단일 곡선
  - Ghost collision 자동 제거
  - ChannelRampSegment 범퍼 출구 문제 수정 (범퍼 높이 50%로 축소)

#### SubTask 5: 회전 구조물 Joint 기반 재구현
- **파일**: `segments/WheelLiftSegment.ts`, `segments/WindmillSegment.ts`
- **핵심**:
  - `setAngle()` 수동 → `RevoluteJoint({ enableMotor: true, motorSpeed })` 자동
  - `onBeforeUpdate` 이벤트 제거 → Joint가 자동 회전
  - destroy()에서 `Matter.Events.off` → Joint 제거로 단순화

---

### [그룹 3] 트랙 + 씬 통합 (순차 — 그룹 2 완료 후)

#### SubTask 6: TrackData V3 레이아웃 + TrackBuilder
- **파일**: `src/maps/TrackData.ts`, `src/maps/TrackBuilder.ts`
- **핵심**:
  - ChainShape 기반 곡선 레이아웃 재설계
  - 세그먼트 간 좌표 연결 정밀 계산
  - TrackBuilder에 Chain/Joint 생성 지원 추가
  - 어드벤처 코스: U턴 곡선 → 물레방아 → 나선 → 풍차 → 분기 → 결승

#### SubTask 7: MarbleRaceScene + PachinkoScene 전환
- **파일**: `src/scenes/games/MarbleRaceScene.ts`, `src/scenes/games/PachinkoScene.ts`
- **핵심**:
  - `collisionStart` → `begin-contact`
  - 물리 step, 카메라 추적, 끼임 감지 업데이트
  - out-of-bounds 체크 좌표 매핑
  - 카오스 이벤트 물리 로직 전환

---

### [그룹 4] 비주얼 업그레이드 (그룹 3 완료 후)

#### SubTask 8: 도트 비주얼 + pixi-filters 연출
- **파일**: `package.json`, `src/core/Application.ts`, `src/entities/Marble.ts`, `src/effects/ChaosEffect.ts`, `src/effects/SlowMotionEffect.ts`, `src/utils/constants.ts`
- **내용**:
  - `npm i pixi-filters` 설치
  - `TextureStyle.defaultOptions.scaleMode = 'nearest'` + `roundPixels: true` + CSS `pixelated`
  - 구슬: GlowFilter (1등 강조), OutlineFilter (전체)
  - 카오스: GlitchFilter + ShockwaveFilter
  - 포토피니시: RGBSplitFilter ± 2px + 줌인
  - 팔레트: PICO-8 16색 → DawnBringer 32색 확장
  - 구슬 트레일(잔상) 효과

---

## 실행 순서 & 의존성

```
SubTask 1 → SubTask 2 → SubTask 3,4,5 (병렬)
                              ↓
                         SubTask 6 → SubTask 7 → SubTask 8
```

| 순서 | SubTask | 검증 |
|---|---|---|
| 1 | PhysicsWorld 재작성 | verify.sh (tsc) |
| 2 | Marble + Progress | verify.sh (tsc) |
| 3 | 세그먼트 3,4,5 병렬 | verify.sh 통합 |
| 4 | TrackData + TrackBuilder | verify.sh |
| 5 | Scene 통합 | verify.sh + Playwright |
| 6 | 비주얼 | verify.sh + Playwright |

## 핵심 리스크

- Planck.js 좌표계(y-up) vs PixiJS(y-down) → gravity 부호 주의
- PachinkoScene도 Matter.js 사용 → 동시 전환 필수
- 기존 이벤트 로직(collision, stuck detection) 전면 재검증 필요
- Planck.js npm 주간 DL 610 (낮음) — 코드 품질은 높으나 커뮤니티 소규모
