# 뽑기런 (bbobgi-run) 분석 보고서

> 분석일: 2026-03-16
> 프로젝트: 뽑기런 (bbobgi-run)
> 분석 관점: Phase 1 완료 시점 전체 분석

---

## 1. 프로젝트 개요

### 목적 및 핵심 가치

30초 관람형 파티게임. 참가자 이름을 입력하고 "1등 뽑기" 또는 "꼴등 뽑기"를 선택하면 캐릭터들이 레이스로 경쟁해 결과를 결정한다. 볼링·야구 후 술/밥 벌칙 결정, 유튜버/스트리머 방송용 등 파티 상황에 특화된 관전 콘텐츠.

핵심 가치: "결과 자체"가 아닌 **과정의 긴장감과 관전 재미**. URL 하나로 설치 없이 즉시 접근, 모바일 우선.

### 기술 스택

| 분류 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 렌더링 | PixiJS | 8.17.0 | `async app.init()` 패턴 |
| 물리 | Matter.js | 0.20.0 | PhysicsWorld 래퍼 완성, 미연결 |
| 애니메이션 | GSAP | 3.14.2 | globalTimeline 조작 포함 |
| 사운드 | Howler.js | 2.2.4 | SoundManager 래퍼 완성, 미연결 |
| 번들러 | Vite | 8.0.0 | Vanilla TypeScript |
| 언어 | TypeScript | 5.9.3 | strict mode, path alias |

### 현재 완성도

| 기능 | 상태 | 비고 |
|---|---|---|
| 코어 엔진 (Application, SceneManager, BaseScene) | ✅ 완성 | |
| MainMenuScene (3섹션 단일 페이지) | ✅ 완성 | |
| HorseRaceScene (30초 5단계 타임라인) | ✅ 완성 | 카오스 연출만, 게임플레이 영향 없음 |
| ResultScene (pickMode 분기) | ✅ 완성 | 사운드 미연결 |
| UI 컴포넌트 6개 | ✅ 완성 | |
| 이펙트 5개 | ✅ 완성 | |
| 반응형 + 모바일 터치 | ✅ 완성 | |
| Neon Game Show 테마 | ✅ 완성 | |
| PhysicsWorld 래퍼 | ✅ 구조 완성 | 사용하는 씬 없음 |
| SoundManager 래퍼 | ✅ 구조 완성 | 씬에서 호출 없음 |
| MarbleRaceScene | ⏳ STUB | Phase 2 |
| PachinkoScene | ⏳ STUB | Phase 2 |
| LadderScene | ⏳ STUB | Phase 3 |
| 사운드 (BGM + 효과음) | ❌ 미구현 | Phase 3 |
| SNS 공유 / 결과 카드 | ❌ 미구현 | Phase 3 |
| 리플레이 / 기록 | ❌ 미구현 | Phase 4 |

---

## 2. 아키텍처 분석

### 구조 개요

```
src/ (29개 파일, ~2,400줄)
├── main.ts              — 부트스트래퍼 + createGameScene() 팩토리
├── types.ts             — 공용 도메인 타입 (PickMode, GameMode, Player...)
├── core/                — 게임 엔진 (6개)
├── scenes/              — 씬 (5개: Menu, Result, Horse[완성], Marble/Ladder/Pachinko[STUB])
├── entities/            — Horse (1개)
├── effects/             — 5개 이펙트
├── ui/                  — 6개 UI 컴포넌트
└── utils/               — constants, random, responsive
```

### 데이터 흐름

```
사용자 → MainMenuScene (뽑기모드/게임모드/이름 입력)
  → GameConfig { pickMode, gameMode, players, seed }
  → createGameScene(config) → HorseRaceScene
  → 30초 레이스 → GameResult { rankings }
  → ResultScene { pickMode, rankings }
  → "한 판 더?" → MainMenuScene (이름 유지)
```

### 사용 패턴

| 패턴 | 위치 | 설명 |
|---|---|---|
| Template Method | BaseScene | init → update → destroy 생명주기 |
| Factory | main.ts#createGameScene | 모드별 씬 인스턴스 생성 |
| Singleton | Application.ts#static create | async factory 패턴 |
| Strategy | PhysicsWorld | Matter.js 직접 의존성 추상화 |
| Observer | HorseRaceScene → ShakeEffect | 순위 변동 감지 (직접 호출, 이벤트 시스템 미구현) |

### 평가

| 항목 | 평가 | 근거 |
|---|---|---|
| 레이어 분리 | 높음 | core/scenes/entities/effects/ui/utils 명확 분리 |
| 패턴 일관성 | 높음 | PixiJS v8 async init, PhysicsWorld 래퍼, SeededRandom 일관 적용 |
| 확장성 | 보통 | 이펙트 시스템이 직접 호출 방식 (Observer 미완성) |
| 테스트 가능성 | 낮음 | 테스트 인프라 없음, 씬 레벨 유닛 테스트 불가 |

---

## 3. 코드 품질

### 강점

- TypeScript strict mode 100% 준수, `any` 타입 사용 없음
- `ResultScene`의 `tweens[]` 배열 패턴 — GSAP tween 추적/cleanup 우수
- `SeededRandom(Mulberry32)` — 결과 재현성 보장
- `constants.ts` 중앙 집중 — 타이밍/색상/레이아웃 일괄 관리
- `NameInput` HTML overlay — IME 이슈 정확히 회피
- `verify.sh` 4단계 자동 검증 (tsc + eslint + build + spec patterns)

### 기술 부채

| # | 항목 | 심각도 | 위치 | 설명 |
|---|---|---|---|---|
| 1 | ShakeEffect destroy() 미구현 | 🔴 높음 | `effects/ShakeEffect.ts` | 진행 중 씬 전환 시 GSAP tween이 파괴된 Container를 계속 참조 |
| 2 | BaseScene.destroy() removeChildren() 한계 | 🔴 높음 | `core/BaseScene.ts:40` | `removeChildren()`은 PixiJS 오브젝트 destroy() 미전파 → GPU 버퍼 누수 |
| 3 | SlowMotionEffect globalTimeline 전역 변조 | 🟡 중간 | `effects/SlowMotionEffect.ts:15` | 씬 파괴 순서에 따라 timeScale 0.3 고착 가능 |
| 4 | MainMenuScene GSAP tween 미추적 | 🟡 중간 | `scenes/MainMenuScene.ts:243` | animateIn() + 자식 컴포넌트 hover/press tween 미cleanup |
| 5 | ConfettiEffect 파티클 미파괴 | 🟡 중간 | `effects/ConfettiEffect.ts:48` | tween kill 시 onComplete 미실행 → Graphics 오브젝트 부모에 잔류 |
| 6 | ChaosEffect 게임플레이 미연결 | 🟡 중간 | `scenes/games/HorseRaceScene.ts#applyChaos()` | 텍스트/흔들림만 있고 말 속도 변화 없음 |
| 7 | SoundManager 미연결 | 🟡 중간 | 모든 씬 | 어디에서도 sound.play() 호출 없음 |
| 8 | HorseRaceScene config non-null assertion | 🟢 낮음 | `HorseRaceScene.ts:132,269,344` | `this.config!` 패턴, strict 위반 |
| 9 | Horse.ts 폰트 하드코딩 | 🟢 낮음 | `entities/Horse.ts:39` | `constants.ts` FONT_BODY 상수 미사용 |
| 10 | NameInput 색상값 하드코딩 | 🟢 낮음 | `ui/NameInput.ts` | #ff2d55 등 COLORS 상수 미사용 |

### 보안 점검

해당 없음. 순수 클라이언트 게임, 서버 통신 없음, 사용자 입력은 이름 텍스트만 (XSS 위험 없음, DOM 직접 삽입 없음).

### 성능 점검

- **MainMenuScene 단일 페이지 레이아웃**: startButton이 y=770 고정 → 소형 기기(iPhone SE 등)에서 하단 잘림 가능성
- **파티클 Graphics 미해제**: ConfettiEffect 45개 파티클이 씬 교체 후 즉시 GPU 해제되지 않음 (세션 길어질수록 누적)

---

## 4. 기술 트렌드 대비

### 스택 최신성

| 기술 | 현재 버전 | 최신 버전 | 상태 |
|---|---|---|---|
| PixiJS | 8.17.0 | 8.x | ✅ 최신 |
| Matter.js | 0.20.0 | 0.20.0 | ⚠️ 2024-06 이후 유지보수 정체 |
| GSAP | 3.14.2 | 3.x | ✅ 최신 |
| Howler.js | 2.2.4 | 2.2.4 | ✅ 안정 |
| Vite | 8.0.0 | 8.x | ✅ 최신 |
| TypeScript | 5.9.3 | 5.x | ✅ 최신 |

### 대안 기술 검토

| 리스크 | 현재 대응 | 추가 고려사항 |
|---|---|---|
| Matter.js 유지보수 정체 | PhysicsWorld 래퍼로 추상화 완료 | 필요시 Planck.js/Rapier.js로 교체 용이 |
| PixiJS v8 WebGPU | 현재 WebGL fallback | v8 기본 WebGPU는 안정화 진행 중 |

---

## 5. 개선 로드맵

### 즉시 개선 (Quick Win — Phase 2 시작 전)

- [ ] `ShakeEffect.destroy()` 메서드 추가 (GSAP tween kill)
- [ ] `BaseScene.destroy()` → `container.destroy({ children: true })`로 변경
- [ ] `HorseRaceScene.applyChaos()` → 말 속도 실제 변화 로직 추가
- [ ] `MainMenuScene.destroy()` → `gsap.killTweensOf()` 추가

### 단기 개선 (Phase 2 — 물리 모드)

- [ ] MarbleRaceScene 구현 (PhysicsWorld + 구슬 엔티티 + 트랙)
- [ ] PachinkoScene 구현 (핀 배치 + 공 하강 + 슬롯)
- [ ] Observer 이벤트 시스템 도입 (씬 → 이펙트 직접 의존 제거)
- [ ] BaseRaceScene 공통 기반 클래스 추출 (HorseRace와 MarbleRace 공통 로직)

### 중장기 개선 (Phase 3~4)

- [ ] LadderScene 구현 (~20초 추첨형)
- [ ] SoundManager 연결 (BGM + 효과음 파일 추가)
- [ ] 결과 카드 이미지 생성 (Canvas → PNG, SNS 공유)
- [ ] 리플레이 기능 (seed 재사용)
- [ ] 반응형 레이아웃 개선 (MainMenuScene 소형 기기 대응)

---

## 6. 리서치 출처

- 기존 RESEARCH 파일 없음 (team-research 미실행)
- 분석은 코드베이스 직접 탐색 기반

---

> 이 보고서는 Claude Code `/analyze` 스킬로 자동 생성되었습니다.
