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
| 2 | **구슬 레이스 (Marble Race)** | V5 어드벤처 코스 — 깔때기(SEC1)→플링코(SEC2-3)→분기FAST/SAFE(SEC4)→물레방아(SEC5)→카오스(SEC6)→분기VORTEX/SPRINT(SEC7)→파이널(SEC8) | Planck.js | 완주 기반 |
| 3 | **사다리타기** | 자동 생성 사다리, 라인 애니메이션 | 불필요 | ~20초 |
| 4 | **핀볼/파친코 (Pachinko)** | 공이 핀에 부딪히며 하강 | Planck.js | 20~30초 |

## 기술 스택

| 분류 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 렌더링 | PixiJS | v8.17.0+ | WebGPU 지원, `await app.init()` 패턴 |
| 물리 | Planck.js | 1.x | 구슬/핀볼 모드 전용, PhysicsWorld 래퍼 통해 사용 (Matter.js에서 전환) |
| 애니메이션 | GSAP | 3.12+ | PixiJS 오브젝트 직접 트윈 |
| 사운드 | Howler.js | 2.2+ | SoundManager 래퍼 통해 사용 |
| 로컬 DB | Dexie.js | 4.3+ | IndexedDB 래퍼 — 게임 기록/전적 저장 |
| 번들러 | Vite | 8.x | Vanilla TypeScript (React 없음) |
| 언어 | TypeScript | 5.9+ | strict mode, path alias |
| 예상 번들 | **~240KB** (gzipped) | | PixiJS 180 + Planck.js 20 + GSAP 20 + Howler 7 + Dexie 13 |

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
│   ├── PhysicsWorld.ts   # Planck.js 래퍼 (구슬/핀볼 공유)
│   ├── CameraController.ts # 구슬 레이스 카메라 (group/leader/free 모드)
│   └── RecordManager.ts  # Dexie.js 게임 기록 관리 (IndexedDB)
│
├── maps/                  # 트랙 맵 시스템
│   └── v5/                # 구슬 레이스 V5 어드벤처 코스
│       └── V5TrackBuilder.ts  # 좌표 기반 트랙 빌더 (createPipe/createPin/createWall, 8구간)
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
├── entities/             # 게임 오브젝트
│   ├── Horse.ts          # 말 엔티티 (갤럽 애니메이션, SeededRandom 속도)
│   └── Marble.ts         # 구슬 엔티티 (Planck.js body + PixiJS 동기화, finished/retired 상태)
│
├── effects/              # 연출/이펙트
│   ├── CountdownEffect.ts  # 3-2-1-출발 카운트다운
│   ├── SlowMotionEffect.ts # 결승 직전 슬로우모션 + 비네팅
│   ├── ShakeEffect.ts      # 화면 흔들림 (순위 역전 시)
│   ├── ChaosEffect.ts      # 카오스 이벤트 텍스트 연출
│   └── ConfettiEffect.ts   # 1등 축하 폭죽 파티클
│
├── ui/                   # UI 컴포넌트
│   ├── Button.ts           # 그래디언트 + 글로우 버튼
│   ├── PickModeCard.ts     # 뽑기 모드 선택 카드
│   ├── ModeCard.ts         # 게임 모드 선택 카드
│   ├── NameInput.ts        # 참가자 이름 입력 (HTML overlay, IME 지원)
│   ├── DotGridBackground.ts  # 도트 그리드 배경 패널
│   ├── SectionLabel.ts      # 섹션 라벨 (좌측 바 + 텍스트)
│   ├── StatsPanel.ts        # 전적 통계 패널 (ResultScene)
│   └── MiniMap.ts           # 구슬 레이스 미니맵 (뷰포트 + 구슬 위치)
│
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
| `@maps/*` | `src/maps/*` |
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
| **FSM** | `BettingManager.ts` | idle → open → locked → settled 베팅 상태 관리 |
| **Pari-mutuel** | `BettingManager.ts` | 총 베팅 풀을 승자에게 비례 분배하는 배당 정산 |

## 구현 로드맵

### Phase 1: MVP — 경마 모드 단독 ✅
- [x] 코어 시스템 구현 (Application, SceneManager, BaseScene)
- [x] MainMenuScene (모드 선택 UI + 이름 입력)
- [x] HorseRaceScene (횡스크롤, 랜덤 속도, 30초 루프)
- [x] ResultScene (pickMode 분기: 1등 시상식 / 꼴등 벌칙)
- [x] 반응형 + 모바일 터치
- [x] UI 컴포넌트 시스템 (Button, PickModeCard, ModeCard, NameInput)
- [x] 이펙트 시스템 (Countdown, SlowMotion, Shake, Chaos, Confetti)
- [x] Neon Game Show 디자인 테마 적용

### Phase 2: 물리 모드 추가 ✅
- [x] PhysicsWorld.ts (Planck.js 래퍼 — 4 sub-step CCD, bullet body, 센서 지원)
- [x] MarbleRaceScene (V3 어드벤처 코스 + 체크포인트 순위 + 완주 기반 종료)
- [x] PachinkoScene (핀 격자 10×12 + 슬롯 센서 + 순위 결정)
- [x] Marble 엔티티 (Planck.js body ↔ PixiJS Container 동기화, 더미 구슬 지원)
- [x] 공통 이펙트 시스템 (슬로우모션, 화면 흔들림, 카오스 이벤트)

### Phase 3: 사다리 + 연출 강화 ✅
- [x] LadderScene (SeededRandom 사다리 생성 + GSAP 라인 트레이싱 애니메이션)
- [x] SoundManager 씬 연결 (BaseScene.setSound, 주요 이벤트 훅)
- [x] 결과 카드 공유 (Web Share API + clipboard fallback)
- [x] 리플레이 기능 (이름 유지 + MainMenuScene 복원)

### Phase 4: 기록/모드 개선 🔄
- [x] RecordManager — Dexie.js IndexedDB 게임 기록 자동 저장 + 전적 통계
- [x] StatsPanel — ResultScene 전적 통계 UI
- [x] 베팅 시스템 제거 — BettingManager / BettingPanel / BettingResultPanel 삭제
- [x] 경마: 오벌 트랙 재설계 (흙/잔디 텍스처, 출발 게이트, 레인 번호) + wipeout/nitro/reverse 랜덤 이벤트 시스템 + 진행도 기반 페이즈 전환 + 순위 패널 UI
- [x] 구슬 레이스 V3 어드벤처 코스 전면 리디자인 — 7개 구간 28개 세그먼트 + 체크포인트 진행도
- [x] Planck.js 물리엔진 마이그레이션 (Matter.js → Planck.js)
- [x] SegmentPort 인터페이스 + validateConnections 연결 검증 파이프라인
- [x] Stuck Detection 위치변위 감지 + 전진 리포지션 개선
- [x] 구간별 구조물 매칭 검증 단위테스트 (Playwright, 5/5 PASS)
- [x] 구슬 레이스 V5 좌표 기반 트랙 빌더 (V5TrackBuilder) — 8구간 어드벤처, 분기 2회, 카오스존
- [x] `createPipe` 통합 API — `direction: 'angled' | 'vertical' | 'curve'` + `color` prop
- [x] SEC1 깔때기+핀존 구현 (깔때기 수렴 → 12핀 격자 → 수직 통로)
- [x] SEC2 S-채널 3단 구현 (S자 방향 전환 채널, 9구슬 동시 수용, SEC3 입구 정합)
- [x] SEC3 플링코 보드 구현 (5행×5/4핀 배열, 중앙 50px 구멍 → SEC4 낙하)
- [ ] 사다리타기: 복잡한 구조 + 카오스 이벤트 시스템
- [ ] 파친코: 함정/변수 추가 + 단일 골 구조 + 공 개수 설정
- [ ] NetworkManager — Supabase Realtime 호스트-게스트 실시간 통신
- [ ] ReactionOverlay — 응원/리액션 이모지 오버레이 + 모바일 최적화

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
- Planck.js 직접 사용 금지 → `PhysicsWorld.ts` 래퍼를 통해서만
- Canvas 내 텍스트 입력 금지 → HTML input overlay (한글 IME 이슈)
- `any` 타입 사용 금지, `strict: true` 필수
- React/Vue 등 프레임워크 도입 금지

### 리스크
| 리스크 | 심각도 | 대응 |
|---|---|---|
| ~~Matter.js 유지보수 정체~~ | ~~중~~ | ~~해결: Planck.js로 전환 완료 (2026-03-27)~~ |
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

## 이슈 / 트러블슈팅

| 날짜 | 분류 | 증상 | 원인 | 해결 |
|---|---|---|---|---|
| 2026-03-28 | 버그 수정 | V3 트랙 전 구간에서 구슬 끼임 (완주 불가) | ChannelRampSegment `signedAngle = -angle * direction` 부호 반전으로 경사 방향이 설계와 반대 | `signedAngle = angle * direction`으로 수정 + noCeiling 옵션 + CurvedChannel 가이드벽 제거 + SEC4 출구 재정렬. 10명×10회 반복 100% 완주 달성 |
| 2026-03-24 | 버그 수정 | 구슬 레이스 첫 경로에서 구슬 전체 막힘 | 경사로 각도 부호 오류 — `angle = TRACK.rampAngle * direction`으로 구슬이 벽과 경사로 사이 10px 틈으로 몰림 (구슬 지름 16px) | `angle = -TRACK.rampAngle * direction`으로 수정, 40px 출구 방향으로 흘러내리도록 변경 |
| 2026-03-22 | 제거 | 베팅 시스템 오버엔지니어링 | 게임 목적(관람형 뽑기)과 불일치, 코드 복잡도 증가 | BettingManager / BettingPanel / BettingResultPanel 전체 삭제 |

> 새 이슈 발생 시 위 테이블에 행을 추가한다.

## 참고 자료

- [Jelle's Marble Runs](https://jellesmarbleruns.com/) — 물리 구슬 레이스 레퍼런스
- [lazygyu 마블 룰렛](https://lazygyu.github.io/roulette/) — Box2D 웹 구슬 레이스
- [Horse Race Timer](https://horseracinggame.net/simulator) — 가상 경마 시뮬레이터
- [Gravity Picker](https://www.gravitypicker.com/) — 물리 기반 이름 뽑기
- [PixiJS v8 Docs](https://pixijs.com/8.x/guides)
