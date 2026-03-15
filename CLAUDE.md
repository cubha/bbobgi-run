# Claude Code 운영 규칙: 1등꼴등 게임

> 전역 공통 규칙은 `~/.claude/CLAUDE.md`를 따른다.
> 이 파일은 프로젝트 고유 내용만 기술한다.

## 기술 스택 (고정값 — 변경 금지)

| 분류 | 기술 | 비고 |
|---|---|---|
| 렌더링 | PixiJS v8 | async `app.init()` 패턴 필수 |
| 물리 | Matter.js 0.20.0 | PhysicsWorld.ts 래퍼 통해 사용 |
| 애니메이션 | GSAP 3.12+ | PixiJS 오브젝트 직접 트윈 |
| 사운드 | Howler.js 2.2+ | SoundManager.ts 래퍼 통해 사용 |
| 번들러 | Vite 6+ | Vanilla TypeScript (React 없음) |
| 언어 | TypeScript strict | path alias: `@/`, `@core/` 등 |

## 프로젝트 핵심 구조

```
src/
├── main.ts          # 진입점 — GameApplication 생성 + 씬 라우팅
├── types.ts         # 공용 타입 (GameMode, Player, GameConfig 등)
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

## 금지 사항

- React, Vue 등 프레임워크 도입 금지
- Matter.js 외 물리엔진 추가 금지 (Planck.js는 리스크 시에만)
- `any` 타입 사용 금지
- Canvas 내 텍스트 입력 구현 금지 (HTML overlay 사용)
- 게임 결과 조작 메커니즘 (아이템 편향, 규칙반전) 금지 — 순수 물리/랜덤만
