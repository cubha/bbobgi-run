# Claude Code 운영 규칙: 뽑기런 (bbobgi-run)

> 전역 공통 규칙은 `~/.claude/CLAUDE.md`를 따른다.
> 이 파일은 프로젝트 고유 내용만 기술한다.

## 기술 스택 (고정값 — 변경 금지)

| 분류 | 기술 | 비고 |
|---|---|---|
| 렌더링 | PixiJS v8 | async `app.init()` 패턴 필수 |
| 물리 | Matter.js 0.20.0 | PhysicsWorld.ts 래퍼 통해 사용 |
| 애니메이션 | GSAP 3.12+ | PixiJS 오브젝트 직접 트윈 |
| 사운드 | Howler.js 2.2+ | SoundManager.ts 래퍼 통해 사용 |
| 번들러 | Vite 8+ | Vanilla TypeScript (React 없음) |
| 언어 | TypeScript strict | path alias: `@/`, `@core/` 등 |

## 프로젝트 핵심 구조

```
src/
├── main.ts          # 진입점 — GameApplication 생성 + 씬 라우팅
├── types.ts         # 공용 타입 (PickMode, GameMode, Player, GameConfig 등)
├── core/            # 게임 엔진 코어 (Application, SceneManager, BaseScene 등)
├── scenes/          # 씬 (MainMenuScene, ResultScene, games/)
├── entities/        # 게임 오브젝트 (Horse, Marble, LadderLine 등)
├── effects/         # 연출/이펙트 (SlowMotion, ShakeEffect 등)
├── ui/              # UI 컴포넌트 (ModeCard, NameInput, Button 등)
└── utils/           # 유틸리티 (random, responsive, constants)
```

## 핵심 구현 원칙

- **PixiJS v8**: `new Application()` + `await app.init({...})` — 생성자에 옵션 전달 금지
- **씬 생명주기**: `BaseScene.init()` → `update(delta)` → `destroy()` — Template Method 패턴
- **물리 추상화**: Matter.js 직접 사용 금지 → `PhysicsWorld.ts` 래퍼를 통해서만
- **이름 입력**: Canvas 내 텍스트 입력 금지 → HTML input overlay (IME 이슈)
- **반응형**: `utils/responsive.ts`의 `calculateScale()` 사용
- **랜덤**: `utils/random.ts`의 `SeededRandom` 사용 (재현성/공정성)

## TypeScript 규칙

- `strict: true` 필수
- `noUnusedLocals`, `noUnusedParameters` 활성
- 사용하지 않는 매개변수는 `_` 접두사 (예: `_delta`)
- path alias 사용: `@core/BaseScene`, `@utils/constants` 등

## 게임 모드

| 모드 | 파일 | 물리엔진 | 시간 |
|---|---|---|---|
| 경마 | `HorseRaceScene.ts` | 불필요 | 30초 |
| 구슬 레이스 | `MarbleRaceScene.ts` | Matter.js | 30초 |
| 사다리타기 | `LadderScene.ts` | 불필요 | ~20초 |
| 핀볼/파친코 | `PachinkoScene.ts` | Matter.js | 20~30초 |

## 뽑기 모드 (PickMode)

사용자가 게임 시작 전 **1등 뽑기 / 꼴등 뽑기** 중 하나를 선택한다.

| PickMode | 값 | 결과 화면 강조 대상 |
|---|---|---|
| 1등 뽑기 | `'first'` | 1등 → 시상식 연출 (폭죽+팡파레) |
| 꼴등 뽑기 | `'last'` | 꼴등 → 벌칙 연출 (낙뢰+"당신이 쏩니다") |

- `types.ts`에 `PickMode: 'first' | 'last'` 정의
- `MainMenuScene`에서 뽑기 모드 선택 → 게임 모드 선택 → 이름 입력 순서
- `ResultScene`은 `pickMode`에 따라 연출 분기

## 씬 전환 흐름

```
MainMenuScene → (뽑기 모드 선택 → 게임 모드 선택 → 이름 입력 2~10명)
  ↓ SceneManager.transition(gameScene, { pickMode, gameMode, players })
GameScene (HorseRace | MarbleRace | Ladder | Pachinko)
  ↓ 게임 종료, rankings 전달
ResultScene({ pickMode, rankings }) → "한 판 더?" 시 MainMenuScene (이름 유지)
```

## 30초 게임 루프 (레이스형 공통)

```
[0~3초]   카운트다운 3-2-1 + 출발
[3~20초]  메인 레이스 (물리/랜덤, 근사 순위만 표시)
[20~25초] 카오스 이벤트 1회 (장애물/지형변화)
[25~28초] BGM 가속 + 순위 전체 공개
[28~30초] 슬로우모션 + 화면 진동
[30초]    최종 판정 → ResultScene 전환
```

- 사다리타기는 추첨형이므로 별도 ~20초 타임라인 적용

## 연출 시스템 규칙

- 공통 이펙트는 `effects/` 디렉토리에 독립 클래스로 구현
- 순위 변동/게임 종료 등은 Observer 패턴으로 이벤트 발행 → UI/이펙트가 구독
- 결과 연출: `pickMode`에 따라 분기
  - `'first'`: 1등 시상식 (폭죽+팡파레+"축하합니다!")
  - `'last'`: 꼴등 벌칙 (낙뢰+슬픈 트롬본+"당신이 쏩니다")
- 포토피니시 슬로우모션: 결승 직전 0.3x + 카메라 줌인
- 역전 시 화면 흔들림 (3위 이상 변동 시)

## 구현 순서 (필수 준수)

1. **Phase 1 (MVP)**: 경마 모드 단독 — 코어 + MainMenu + HorseRace + Result + 반응형
2. **Phase 2**: 물리 모드 — PhysicsWorld + MarbleRace + Pachinko + 이펙트 시스템
3. **Phase 3**: 사다리 + 사운드 + 결과 카드 (SNS 공유) + 리플레이
4. **Phase 4**: 베팅/응원/기록 등 확장 기능

> Phase 1 완료 전에 Phase 2 이후 코드 작성 금지

## 금지 사항

- React, Vue 등 프레임워크 도입 금지
- Matter.js 외 물리엔진 추가 금지 (Planck.js는 리스크 시에만)
- `any` 타입 사용 금지
- Canvas 내 텍스트 입력 구현 금지 (HTML overlay 사용)
- 게임 결과 조작 메커니즘 (아이템 편향, 규칙반전) 금지 — 순수 물리/랜덤만
- 플레이어 직접 조작 (연타, 클릭 타이밍 등) 구현 금지 — 관람형 유지
- 4모드 동시 개발 금지 — 구현 순서(Phase) 준수
