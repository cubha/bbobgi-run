# 뽑기런 (bbobgi-run) Phase 2 분석 보고서

> 분석일: 2026-03-17
> 프로젝트: 뽑기런 (bbobgi-run) — 30초 관람형 파티게임
> 분석 관점: Phase 2 (물리 모드) 진행결과 종합 분석

---

## 1. 프로젝트 개요

### 목적 및 핵심 가치
참가자 이름을 입력하고 1등 뽑기/꼴등 뽑기를 선택하면, 캐릭터들이 레이스로 경쟁하여 결과를 결정하는 **관람형 파티게임**. 결과 자체보다 **과정의 긴장감과 관전 재미**가 핵심. 설치 없이 URL 하나로 즉시 접근, 모바일 우선.

### 기술 스택

| 분류 | 기술 | 현재 버전 | 최신 버전 | 상태 |
|---|---|---|---|---|
| 렌더링 | PixiJS | v8.17.0 | v8.16.0+ (2026-02) | ✅ 최신 |
| 물리 | Matter.js | 0.20.0 | 0.20.0 (2년+ 미업데이트) | ⚠️ 유지보수 정체 |
| 애니메이션 | GSAP | 3.14.2 | 3.14.2 | ✅ 최신 |
| 사운드 | Howler.js | 2.2.4 | 2.2.4 | ✅ 안정 |
| 번들러 | Vite | 8.x | 8.x | ✅ 최신 |
| 언어 | TypeScript | 5.9.3 | 5.9.x | ✅ 최신 |

### 현재 완성도

| Phase | 상태 | 내용 |
|---|---|---|
| **Phase 1 (MVP)** | ✅ 완료 | 경마 모드 + 코어 시스템 + UI/이펙트 + 반응형 |
| **Phase 2 (물리)** | ✅ 구현 완료 (미커밋) | MarbleRaceScene + PachinkoScene + Marble 엔티티 + PhysicsWorld 고도화 |
| **Phase 3 (사다리)** | ⏳ 대기 | LadderScene 스텁만 존재 |
| **Phase 4 (확장)** | ⏳ 대기 | 베팅/응원/기록 미착수 |

**Phase 2 변경 규모**: +1,174줄 / -24줄 (순 1,150줄 증가), 총 소스 4,272줄

---

## 2. 아키텍처 분석

### 구조 개요

```
src/ (4,272줄)
├── main.ts (65)              # 진입점, 씬 라우팅
├── types.ts (75)             # 공용 타입
├── core/ (358)               # 엔진 레이어
│   ├── Application.ts (82)   #   PixiJS 초기화 + managers 조합
│   ├── BaseScene.ts (44)     #   추상 씬 (Template Method)
│   ├── SceneManager.ts (40)  #   씬 전환 조율
│   ├── PhysicsWorld.ts (113) #   Matter.js 래퍼 ★Phase2 고도화
│   ├── SoundManager.ts (53)  #   Howler.js 래퍼
│   └── InputManager.ts (26)  #   포인터 입력
├── scenes/ (1,747)           # 비즈니스 로직
│   ├── MainMenuScene.ts (249)
│   ├── ResultScene.ts (355)
│   └── games/
│       ├── HorseRaceScene.ts (394)      # Phase 1
│       ├── MarbleRaceScene.ts (551)     # ★Phase 2 신규
│       ├── PachinkoScene.ts (592)       # ★Phase 2 신규
│       └── LadderScene.ts (28)          # 스텁
├── entities/ (280)
│   ├── Horse.ts (175)                   # Phase 1
│   └── Marble.ts (105)                  # ★Phase 2 신규
├── effects/ (321)
│   ├── CountdownEffect.ts (131)
│   ├── SlowMotionEffect.ts (50)
│   ├── ShakeEffect.ts (48)              # ★Phase 2 수정
│   ├── ChaosEffect.ts (40)
│   └── ConfettiEffect.ts (52)
├── ui/ (884)
│   ├── Button.ts (167)
│   ├── PickModeCard.ts (182)
│   ├── ModeCard.ts (185)
│   ├── NameInput.ts (255)
│   ├── DotGridBackground.ts (54)
│   └── SectionLabel.ts (40)
└── utils/ (126)
    ├── constants.ts (53)
    ├── random.ts (43)
    └── responsive.ts (30)
```

### 데이터 흐름

```
MainMenuScene (뽑기모드 → 게임모드 → 이름입력)
  ↓ GameConfig { mode, players, pickMode }
GameScene.setConfig() → init() → update(delta) 루프
  ↓ 30초 타임라인: countdown → racing → chaos → tension → slowmo → done
  ↓ GameResult { mode, rankings, seed, pickMode }
ResultScene.setResult() → pickMode 분기 연출 → "한 판 더?" 순환
```

### 사용 패턴

| 패턴 | 적용 위치 | 설명 |
|---|---|---|
| **Template Method** | BaseScene | `init() → update(delta) → destroy()` 생명주기 |
| **Adapter/Wrapper** | PhysicsWorld, SoundManager | 외부 라이브러리 추상화 |
| **Strategy** | main.ts `createGameScene()` | 런타임 게임 모드 결정 (switch) |
| **Observer** | PhysicsWorld 콜리전 이벤트 | `onCollisionStart()` 콜백 |
| **Composite** | PixiJS Container 트리 | 렌더링 레이어 관리 |
| **State Machine** | 게임 씬 Phase 분기 | `RacePhase` enum + if 분기 |

### 평가

| 항목 | 평가 | 근거 |
|---|---|---|
| 레이어 분리 | **높음** | Core / Scenes / Entities / Effects / UI / Utils 명확 분리, 순환 의존성 없음 |
| 패턴 일관성 | **높음** | BaseScene Template Method, 30초 타임라인 공통화, PhysicsWorld 래퍼 일관 적용 |
| 확장성 | **높음** | 새 게임 모드 추가 시 switch 케이스 + Scene 클래스 1개 추가로 충분 |
| 테스트 가능성 | **낮음** | 테스트 프레임워크 미도입, 물리/랜덤 검증 불가 |

---

## 3. 코드 품질

### 강점

1. **PhysicsWorld 래퍼 설계**: Matter.js 완전 캡슐화, 고정 timestep(1000/60) 적용, 이벤트 핸들러 등록/해제 인프라, `destroy()` 시 메모리 정리 잘 구현
2. **Marble 엔티티**: Matter.js body ↔ PixiJS Container 동기화 패턴 깔끔, `sync()` 메서드로 위치/회전 자동 동기화
3. **SeededRandom**: Mulberry32 알고리즘으로 결정론적 난수 구현, 공정성/재현성 보장
4. **타입 안전성**: TypeScript strict mode, 공용 타입(types.ts)으로 중앙화, path alias 적극 활용
5. **이펙트 독립성**: 각 이펙트가 자체 생명주기(play/destroy) 관리, GSAP 타임라인 kill 보장

### 기술 부채

| # | 항목 | 심각도 | 위치 | 설명 |
|---|---|---|---|---|
| 1 | 씬 간 반복 코드 (DRY 위반) | 🟡 중 | HorseRace/MarbleRace/PachinkoScene | 카운트다운, 타이머바, Phase 라벨, SlowMotion/Shake/Chaos 초기화 30%+ 중복 |
| 2 | Phase 상태 머신 하드코딩 | 🟡 중 | 각 GameScene의 update() | if-elseif 분기로 Phase 전환, State 패턴 미적용 |
| 3 | parseInt 검증 부재 | 🟡 중 | PachinkoScene.ts:477 | `sensor.label.split('-')[1]` → NaN 가능성, 안전한 파싱 필요 |
| 4 | 물리 슬로우모션 불안정 | 🟡 중 | MarbleRace/PachinkoScene | `Math.random() < SLOWMO_RATE` 확률 기반 프레임 건너뛰기 → 비결정적 물리 |
| 5 | DOM 이벤트 리스너 누수 | 🟡 중 | NameInput.ts removeBtn | mouseover/mouseout/click 리스너 제거 로직 없음 |
| 6 | 마우스/포인터 이벤트 혼재 | 🟢 낮 | NameInput.ts | `mouseover/mouseout` 사용 → 터치 장치 미대응, `pointerover/pointerout` 권장 |
| 7 | Howler.js 에러 처리 없음 | 🟢 낮 | SoundManager.ts | 음원 로드 실패 시 사일런트 실패 |
| 8 | 테스트 코드 없음 | 🔴 높 | 프로젝트 전체 | 테스트 프레임워크 미도입, 0% 커버리지 |

### 보안 점검

- **XSS**: NameInput HTML overlay에서 사용자 입력 → DOM 직접 삽입하지 않고 `textContent` 사용 ✅
- **Injection**: sensor.label 파싱 시 검증 부족 (내부 생성값이므로 실제 위험 낮음)
- **전체 평가**: 브라우저 로컬 실행, 서버 통신 없음 → 보안 리스크 최소

### 성능 점검

| 지점 | 상태 | 설명 |
|---|---|---|
| 물리 엔진 | ✅ 양호 | ~20 바디 규모, 고정 timestep, enableSleeping:false |
| ConfettiEffect | ⚠️ 주의 | 45개 파티클 × 프레임당 3~4회 Math.random() |
| GSAP 타임라인 | ⚠️ 주의 | 씬 급전환 시 kill() 누락 가능성 |
| 렌더링 | ✅ 양호 | PixiJS v8 WebGPU/WebGL 자동 선택, 스프라이트 수 적절 |

---

## 4. 기술 트렌드 대비

### 스택 최신성

| 기술 | 현재 버전 | 최신 버전 | 상태 |
|---|---|---|---|
| PixiJS | v8.17.0 | v8.16.0+ | ✅ 최신 (v8.17.0은 최신 릴리스) |
| Matter.js | 0.20.0 | 0.20.0 | ⚠️ 2년+ 미업데이트, 유지보수 정체 |
| GSAP | 3.14.2 | 3.14.2 | ✅ 최신 |
| Howler.js | 2.2.4 | 2.2.4 | ✅ 안정 (장기 무변경이나 API 완성) |
| Vite | 8.x | 8.x | ✅ 최신 |
| TypeScript | 5.9.3 | 5.9.x | ✅ 최신 |

### 대안 기술 검토

| 현재 | 대안 | 전환 필요성 |
|---|---|---|
| Matter.js 0.20.0 | Planck.js | **낮음** — PhysicsWorld 래퍼가 추상화 제공, 현재 규모(~20 바디)에서 문제없음. 유지보수 정체가 심화되면 래퍼만 교체 |
| GSAP | PixiJS 내장 애니메이션 | **불필요** — GSAP이 타임라인/이징에서 압도적, 이미 안정적 |
| Howler.js | Web Audio API 직접 | **불필요** — 래퍼 통해 사용 중, 교체 비용 대비 이점 없음 |

### Matter.js 유지보수 정체 리스크 평가

- **현재 영향**: 없음 (0.20.0 API 안정적, 알려진 버그는 워크어라운드 적용)
- **PhysicsWorld 래퍼**: 완전 추상화 → 향후 Planck.js 전환 시 래퍼만 교체
- **대응 전략**: 현 상태 유지, Issue #303(timeScale 불안정) 등은 GSAP 레이어에서 슬로우모션 처리로 우회

---

## 5. Phase 2 구현 평가

### 신규 구현 파일

| 파일 | 줄 수 | 평가 |
|---|---|---|
| **MarbleRaceScene.ts** | 551줄 | 지그재그 물리 트랙, 30초 타임라인, 카오스(중력변경+장애물), 피니시 센서 — 완성도 높음 |
| **PachinkoScene.ts** | 592줄 | 핀 격자(10×12), 슬롯 센서, 순위 결정 — 완성도 높음 |
| **Marble.ts** | 105줄 | Matter.js body ↔ PixiJS Container 동기화 — 깔끔한 설계 |

### 변경 파일

| 파일 | 변경 내용 | 평가 |
|---|---|---|
| **PhysicsWorld.ts** | +77줄: `setGravity()`, `createSensor()`, 이벤트 핸들러 인프라 | ✅ 리서치 권장안 대로 고정 timestep 적용 |
| **ShakeEffect.ts** | +7줄: 코드 정리 | ✅ |
| **BaseScene.ts** | 2줄 변경 | ✅ 최소 변경 |
| **MainMenuScene.ts** | 1줄 변경 | ✅ 게임 모드 활성화 |

### Phase 2 아키텍처 정합성

- ✅ BaseScene Template Method 패턴 유지
- ✅ PhysicsWorld 래퍼 통한 Matter.js 사용 (직접 사용 없음)
- ✅ 30초 타임라인 공통 구조 재활용
- ✅ 기존 이펙트 시스템(Countdown, SlowMotion, Shake, Chaos) 재활용
- ✅ 고정 timestep(1000/60) 적용
- ⚠️ 씬 간 반복 코드 증가 (Phase 3에서 BaseRaceScene 추출 권장)

---

## 6. 개선 로드맵

### 즉시 개선 (Quick Win)

- [ ] PachinkoScene `parseInt()` 검증 강화 (`label.match(/slot-(\d+)/)?.[1]` 패턴)
- [ ] 물리 슬로우모션: `Math.random()` → 프레임 카운터 방식 변경 (결정론적)
- [ ] NameInput DOM 이벤트 리스너 정리 로직 추가
- [ ] NameInput `mouseover/mouseout` → `pointerover/pointerout` 변경

### 단기 개선 (1~2주)

- [ ] BaseRaceScene 공통 클래스 추출 (타이머, Phase 전환, 이펙트 초기화 통합)
- [ ] Vitest 도입 + SeededRandom, PhysicsWorld 유닛 테스트
- [ ] SoundManager 에러 핸들링 (onloaderror 콜백)
- [ ] 매직넘버 constants.ts 중앙화 확대

### 중장기 개선 (1개월+)

- [ ] Phase 상태 머신 → State 패턴 리팩터링
- [ ] 전역 이벤트 버스 도입 (Observer 패턴 체계화)
- [ ] GameTimer 추상화 (각 씬의 totalElapsed 관리 통합)
- [ ] E2E 테스트 (Playwright)

---

## 7. 리서치 출처

### 기술 스택 최신성
- [PixiJS v8.16.0 릴리스 (2026-02)](https://pixijs.com/blog/8.16.0)
- [PixiJS Releases](https://github.com/pixijs/pixijs/releases)
- [Matter.js npm](https://www.npmjs.com/package/matter-js) — 0.20.0, 2년+ 미업데이트
- [GSAP npm](https://www.npmjs.com/package/gsap) — 3.14.2 최신

### 프로젝트 내부 참조
- `docs/research/RESEARCH-Matter-PixiJS-물리렌더동기화-2026-03-17.md` — Matter.js + PixiJS 통합 패턴, 물리 파라미터 상세
- `docs/analysis/ANALYSIS-bbobgi-run-2026-03-16.md` — Phase 1 분석 보고서

---

> 이 보고서는 Claude Code `/analyze` 스킬로 자동 생성되었습니다.
