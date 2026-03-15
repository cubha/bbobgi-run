# 뽑기런 (bbobgi-run)

> 30초 관람형 파티게임 — "1등 뽑기" 또는 "꼴등 뽑기"를 레이스로 결정하는 브라우저 게임

## 프로젝트 개요

- **목적**: 참가자 이름을 입력하고 1등 뽑기/꼴등 뽑기를 선택하면, 캐릭터들이 레이스로 경쟁하여 결과를 결정하는 **관람형 파티게임**
- **타겟 사용자**: 친구 모임 (볼링/야구 후 벌칙/보상 결정), 유튜버/스트리머 방송용
- **핵심 가치**: 결과 자체보다 **과정의 긴장감과 관전 재미**가 본질
- **접근 방식**: 설치 없이 URL 하나로 즉시 접근, 모바일 우선

## 뽑기 모드 (PickMode)

게임 시작 전 사용자가 **뽑기 목적**을 선택한다:

| 모드 | 설명 | 결과 화면 |
|---|---|---|
| **1등 뽑기** | "누가 1등이냐!" — 보상/당첨자 결정 | 1등 시상식 (폭죽 + 팡파레) |
| **꼴등 뽑기** | "누가 쏘냐!" — 벌칙/지불자 결정 | 꼴등 벌칙 (낙뢰 + "당신이 쏩니다") |

## 게임 모드 (GameMode)

| # | 모드 | 특성 | 물리엔진 | 시간 |
|---|---|---|---|---|
| 1 | **경마 (Horse Racing)** | 횡스크롤 레이스, 랜덤 속도 변화 | 불필요 | 30초 |
| 2 | **구슬 레이스 (Marble Race)** | 물리 트랙 굴러내리기 | Matter.js | 30초 |
| 3 | **사다리타기** | 자동 생성 사다리, 라인 애니메이션 | 불필요 | ~20초 |
| 4 | **핀볼/파친코 (Pachinko)** | 공이 핀에 부딪히며 하강 | Matter.js | 20~30초 |

## 기술 스택

| 분류 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 렌더링 | PixiJS | v8.17.0+ | WebGPU 지원, `await app.init()` 패턴 |
| 물리 | Matter.js | 0.20.0 | 구슬/핀볼 모드 전용, PhysicsWorld 래퍼 통해 사용 |
| 애니메이션 | GSAP | 3.12+ | PixiJS 오브젝트 직접 트윈 |
| 사운드 | Howler.js | 2.2+ | SoundManager 래퍼 통해 사용 |
| 번들러 | Vite | 8.x | Vanilla TypeScript (React 없음) |
| 언어 | TypeScript | 5.9+ | strict mode, path alias |
| 예상 번들 | **~237KB** (gzipped) | | PixiJS 180 + Matter.js 30 + GSAP 20 + Howler 7 |

## 디렉토리 구조

```
src/
├── main.ts               # 진입점 — GameApplication 생성 + 씬 라우팅
├── types.ts              # 공용 타입 (PickMode, GameMode, Player, GameConfig 등)
│
├── core/                 # 게임 엔진 코어
│   ├── Application.ts    # PixiJS Application 래퍼 + 씬 매니저
│   ├── SceneManager.ts   # 씬 전환 (fade/slide 트랜지션)
│   ├── BaseScene.ts      # 추상 씬 클래스 (init/update/destroy)
│   ├── SoundManager.ts   # Howler.js 래퍼
│   ├── InputManager.ts   # 터치/클릭 통합 입력
│   └── PhysicsWorld.ts   # Matter.js 래퍼 (구슬/핀볼 공유)
│
├── scenes/               # 씬(화면) 단위
│   ├── MainMenuScene.ts  # 메인 화면 (모드 선택 + 이름 입력)
│   ├── ResultScene.ts    # 공통 결과 화면 (1등 시상식/꼴등 벌칙)
│   └── games/            # 게임별 씬
│       ├── HorseRaceScene.ts
│       ├── MarbleRaceScene.ts
│       ├── LadderScene.ts
│       └── PachinkoScene.ts
│
├── entities/             # 게임 오브젝트 (Horse, Marble, LadderLine 등)
├── effects/              # 연출/이펙트 (SlowMotion, ShakeEffect, Commentary 등)
├── ui/                   # UI 컴포넌트 (ModeCard, NameInput, Button 등)
└── utils/                # 유틸리티
    ├── random.ts         # 시드 기반 랜덤 (재현성/공정성)
    ├── responsive.ts     # 반응형 리사이즈
    └── constants.ts      # 게임 상수 (시간, 물리 값 등)
```

### Path Alias

| Alias | 경로 |
|---|---|
| `@/*` | `src/*` |
| `@core/*` | `src/core/*` |
| `@scenes/*` | `src/scenes/*` |
| `@entities/*` | `src/entities/*` |
| `@effects/*` | `src/effects/*` |
| `@ui/*` | `src/ui/*` |
| `@utils/*` | `src/utils/*` |

## 씬 전환 흐름

```
[MainMenuScene]
    ├── 1. 뽑기 모드 선택 (1등 뽑기 / 꼴등 뽑기)
    ├── 2. 게임 모드 선택 (경마 / 구슬 / 사다리 / 핀볼)
    ├── 3. 참가자 이름 입력 (2~10명)
    └── 4. "시작!" 버튼
         │
         ▼ { pickMode, gameMode, players }
[GameScene] → HorseRace / MarbleRace / Ladder / Pachinko
         │
         ▼ { pickMode, rankings }
[ResultScene] → pickMode에 따라 1등 시상식 or 꼴등 벌칙 → "한 판 더?" (이름 유지)
```

## 핵심 디자인 패턴

| 패턴 | 적용 위치 | 설명 |
|---|---|---|
| **Scene Manager** | `SceneManager.ts` | 씬 로드/전환/제거 관리 |
| **Template Method** | `BaseScene.ts` | `init() → update(delta) → destroy()` 생명주기 |
| **Strategy** | `BaseRaceScene.ts` (예정) | 레이스형 게임 공통 로직 기반 클래스 |
| **Observer** | 이벤트 시스템 | 순위 변동/게임 종료 이벤트 발행 → UI/이펙트 구독 |
| **Factory** | `MainMenuScene.ts` | 선택된 모드에 따라 GameScene 인스턴스 생성 |

## 구현 로드맵

### Phase 1: MVP — 경마 모드 단독
- [ ] 코어 시스템 구현 (Application, SceneManager, BaseScene)
- [ ] MainMenuScene (모드 선택 UI + 이름 입력)
- [ ] HorseRaceScene (횡스크롤, 랜덤 속도, 30초 루프)
- [ ] ResultScene (pickMode 분기: 1등 시상식 / 꼴등 벌칙)
- [ ] 반응형 + 모바일 터치

### Phase 2: 물리 모드 추가
- [ ] PhysicsWorld.ts (Matter.js 래퍼)
- [ ] MarbleRaceScene (물리 트랙 + 구슬 충돌)
- [ ] PachinkoScene (핀 배치 + 공 하강)
- [ ] 공통 이펙트 시스템 (슬로우모션, 화면 흔들림, 실황 자막)

### Phase 3: 사다리 + 연출 강화
- [ ] LadderScene (사다리 생성 + 라인 추적 애니메이션)
- [ ] 사운드 시스템 (BGM + 효과음)
- [ ] 결과 카드 이미지 생성 (SNS 공유)
- [ ] 리플레이 기능

### Phase 4: 확장
- [ ] 베팅 시스템 ("누가 꼴등일까?" 예측)
- [ ] 응원 이펙트 (터치 시 이펙트, 결과 영향 없음)
- [ ] 연속 기록 / 명예의 전당 (로컬 저장)

## 30초 게임 루프 (레이스형 공통)

```
[0~3초]   시작 카운트다운 3-2-1 + 출발 팡파레
[3~20초]  메인 레이스 — 물리/랜덤 기반 경쟁, 근사 순위만 표시
[20~25초] 카오스 이벤트 1회 (랜덤 장애물/지형변화)
[25~28초] BGM 1.5x 가속 + 순위 전체 공개
[28~30초] 슬로우모션 0.7x + 화면 진동
[30초]    최종 판정 → 결과 연출
```

## 유의사항

### 핵심 원칙
- **관람형 게임**: 플레이어가 직접 조작하지 않음 (뽑기 선택 → 이름 입력 → 시작 → 관람 → 결과)
- **순수 물리/랜덤**: 게임 결과 조작 메커니즘 금지 (아이템 편향, 규칙반전 없음)
- **뽑기 모드 분기**: 1등 뽑기/꼴등 뽑기에 따라 결과 연출만 달라지고, 게임 로직은 동일
- **공정성 인식**: 시드값 표시 또는 "물리 시뮬레이션" 강조로 조작 의심 방지
- **모바일 우선**: 반응형 필수, 최소 터치 타겟 48x48dp

### 기술 제약
- PixiJS v8: `new Application()` + `await app.init({...})` — 생성자에 옵션 전달 금지
- Matter.js 직접 사용 금지 → `PhysicsWorld.ts` 래퍼를 통해서만
- Canvas 내 텍스트 입력 금지 → HTML input overlay (한글 IME 이슈)
- `any` 타입 사용 금지, `strict: true` 필수
- React/Vue 등 프레임워크 도입 금지

### 리스크
| 리스크 | 심각도 | 대응 |
|---|---|---|
| Matter.js 유지보수 정체 (2024-06~) | 중 | PhysicsWorld 래퍼로 추상화, Planck.js 폴백 대비 |
| 4모드 동시 개발 스코프 과다 | 높 | 경마부터 구현, 모드별 점진적 추가 |
| 사다리타기 30초 부족 | 중 | "빠른 추첨" 모드로 포지셔닝, 연출로 ~20초 확장 |

## 개발

```bash
# 의존성 설치
npm install

# 개발 서버 (http://localhost:5173)
npm run dev

# 빌드
npm run build

# 검증 (tsc + eslint + build)
bash verify.sh
```

## 참고 자료

- [Jelle's Marble Runs](https://jellesmarbleruns.com/) — 물리 구슬 레이스 레퍼런스
- [lazygyu 마블 룰렛](https://lazygyu.github.io/roulette/) — Box2D 웹 구슬 레이스
- [Horse Race Timer](https://horseracinggame.net/simulator) — 가상 경마 시뮬레이터
- [Gravity Picker](https://www.gravitypicker.com/) — 물리 기반 이름 뽑기
- [PixiJS v8 Docs](https://pixijs.com/8.x/guides)
