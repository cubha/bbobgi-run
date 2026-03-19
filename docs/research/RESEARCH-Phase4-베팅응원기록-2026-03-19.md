# 팀 리서치 보고서 — Phase 4: 베팅/응원/기록 확장 기능

> 생성일: 2026-03-19
> 프로젝트: 뽑기런 (bbobgi-run)
> 리서치 깊이: 기본 (4개 에이전트)
> 참여 에이전트: 4명 (tech-researcher, architecture-researcher, market-researcher, team-lead/Context7)

---

## 1. 프로젝트 개요

- **목적**: 30초 관람형 파티게임 — 참가자 이름 입력 후 캐릭터들이 레이스로 경쟁, 1등/꼴등 뽑기
- **타겟**: 회식/모임/방송에서 벌칙자/당첨자 뽑기 용도, 모바일 우선
- **현재 상태**: Phase 1~3 완료 (경마, 구슬레이스, 파친코, 사다리타기 4개 게임 모드 + 결과공유 + 사운드)
- **핵심 요구사항**: Phase 4 — 베팅/응원/기록 등 확장 기능
- **기술 스택**: PixiJS v8 + Matter.js 0.20.0 + GSAP 3.14 + Howler.js 2.2 + Vite 8 + TypeScript strict

---

## 2. 기술 스택 리서치 (tech-researcher)

### 2-1. 실시간 멀티플레이어 통신

| 기술명 | 장점 | 단점 | 난이도 | 서버리스 | 추천도 | 출처 |
|---|---|---|---|---|---|---|
| **Supabase Realtime** | 동시접속 200(Free), DB와 통합, Vanilla TS SDK | Broadcast 지연 ~100ms, Free tier 제한 | 낮 | O | ★★★★★ | supabase.com |
| **Ably** | 전달 보장, 글로벌 엣지 <50ms, 6M msg/월 무료 | 외부 서비스 의존, SDK 추가 | 중 | O | ★★★★ | ably.com |
| **Socket.io** | 룸/네임스페이스 강력, 자동 재연결, 커뮤니티 성숙 | 서버 필요(Node.js), Free tier 없음 | 중 | X | ★★★ | socket.io |
| **PartyKit** | Cloudflare Workers 엣지, 상태 유지 WebSocket | 비교적 신생, 커뮤니티 소규모 | 중 | O | ★★★★ | partykit.io |
| **Firebase Realtime DB** | 구글 생태계 통합 | 동시접속 100 hard-limit(Free) | 낮 | O | ★★ | firebase.google.com |
| **WebRTC P2P** | 초저지연, 서버 비용 절약 | 시그널링 서버 필수, NAT 이슈 | 높 | X | ★★ | webrtc.org |

**최종 추천**: **Supabase Realtime** — 기록 저장(PostgreSQL)과 동일 SDK로 통합, 서버리스, Free tier 충분
**2순위**: **Ably** — 전달 보장이 중요한 경우 (베팅 정산 등)

### 2-2. 베팅 시스템

| 기술명 | 장점 | 단점 | 난이도 | 추천도 |
|---|---|---|---|---|
| **자체 Pari-mutuel 구현** | 외부 의존 없음, ~50줄 TS로 구현 | 직접 설계 필요 | 낮 | ★★★★★ |
| **고정 배당 (Fixed Odds)** | 더 단순 | 참가자 수 변동 시 불균형 | 최저 | ★★★ |

**최종 추천**: **자체 Pari-mutuel 알고리즘** — 총 베팅액 기반 동적 배당, GSAP 숫자 트윈 시각화

### 2-3. 응원/리액션

| 기술명 | 장점 | 단점 | 추천도 |
|---|---|---|---|
| **Supabase Broadcast 재사용** | 베팅 채널 공유, 추가 비용 0 | Broadcast 지연 | ★★★★★ |
| **별도 WebSocket** | 전용 채널, 저지연 | 복잡도 증가 | ★★★ |

**최종 추천**: Supabase Realtime Broadcast 채널 재사용 + 클라이언트 throttle(100ms/최대5개)

### 2-4. 게임 기록/통계

| 기술명 | 장점 | 단점 | 추천도 |
|---|---|---|---|
| **Dexie.js (IndexedDB)** | 쿼리/인덱스/TypeScript 완벽, 오프라인 | 로컬 전용 | ★★★★★ |
| **Supabase PostgreSQL** | 크로스 디바이스, 글로벌 리더보드 | 네트워크 필요 | ★★★★ |
| **localStorage** | 가장 단순 | 5MB 제한, 쿼리 불가 | ★★ |
| **PlanetScale** | — | 2024년 Free tier 폐지 | ★ |

**최종 추천**: **Dexie.js** (로컬) + **Supabase** (클라우드 옵션) 하이브리드

### 통합 스택 추천

```
Supabase (@supabase/supabase-js) → Realtime + PostgreSQL
Dexie.js → IndexedDB 로컬 기록
Vanilla TypeScript Pari-mutuel → 베팅 계산
기존 PixiJS + GSAP → 리액션 오버레이 렌더링
```

---

## 3. 아키텍처 패턴 리서치 (architecture-researcher)

### 3-1. 호스트-게스트 멀티뷰어 아키텍처

| 패턴명 | 적합 시나리오 | 구현 복잡도 | 기존 호환성 | 출처 |
|---|---|---|---|---|
| **Broker 중재 패턴** | 룸코드 기반, 호스트-게스트 분리 | 중 | 높음 | party-box |
| **PartyKit 엣지** | 서버리스, 상태 유지 WebSocket | 낮 | 높음 | partykit.io |
| **WebRTC P2P** | 초저지연 | 높음 | 낮음 | webrtc.ventures |

**권장**: Broker 중재 WebSocket 패턴 (Jackbox 참조)
- 호스트 = Single Source of Truth (게임 상태)
- 호스트 → 브로커 → 게스트: 단방향 상태 스냅샷
- 게스트 → 브로커 → 호스트: 액션 이벤트만 (베팅, 응원)
- 룸 코드: 6자리 영숫자

```
[호스트 TV/PC]  ←WS→  [Broker (Supabase/PartyKit)]  ←WS→  [게스트 모바일 x N]
 GameApplication          RoomManager                       Mobile Web (베팅/응원 UI)
 + NetworkManager         (채널 관리)                        (별도 경량 HTML)
```

### 3-2. 베팅 시스템 설계

**권장**: Pari-mutuel + FSM (유한 상태 머신)

```
베팅 FSM: IDLE → OPEN → LOCKED → RESOLVING → SETTLED → IDLE
```

배당률 계산:
```
총 포인트풀 = 모든 베팅 합산
특정 플레이어 배당 = (총 포인트풀 × 0.9) / 해당 플레이어 베팅 합산
10% 하우스 컷 → 다음 판 보너스 풀로 이월
```

types.ts 확장 (최소 침습):
```typescript
interface BettingConfig {
  enabled: boolean;
  pointPool: Record<number, number>;  // playerId → 베팅 포인트
}
interface GameConfig {
  // 기존 필드 유지
  betting?: BettingConfig;  // optional 추가
}
```

### 3-3. 응원/리액션 시스템

**권장**: Object Pool + Priority Queue + Batch Flush

```
게스트 이모지 → NetworkManager → ReactionQueue (우선순위큐)
                                     ↓ (매 16ms, ticker)
                               BatchFlush (최대 10개/프레임)
                                     ↓
                           ReactionOverlay (PixiJS Container)
                           — Sprite Pool 재사용
                           — GSAP tween: float + fade
                           — 동시 활성 최대 50개
```

### 3-4. 기록/통계 데이터 모델

```typescript
interface GameRecord {
  id: string;            // crypto.randomUUID()
  timestamp: number;
  mode: GameMode;
  pickMode: PickMode;
  seed: number;          // 시드 기반 리플레이
  players: Player[];
  rankings: RankingEntry[];
  duration: number;
}

interface PlayerStats {
  name: string;
  gamesPlayed: number;
  wins: number;          // 1등 횟수
  losses: number;        // 꼴등 횟수
  winRate: number;
}
```

**리플레이**: 시드 기반 결정론적 재현 — `{ seed, players, mode, pickMode }` 만 저장 (~200 bytes/레코드)

### 3-5. 기존 아키텍처 통합 전략

**신규 Core 모듈 4개** (모두 optional):

| 모듈 | 역할 | Application 통합 |
|---|---|---|
| `NetworkManager` | WebSocket, 룸 관리 | `app.network?` |
| `BettingManager` | FSM, 포인트 계산, 정산 | `app.betting?` |
| `RecordManager` | IndexedDB CRUD, 통계 | `app.records` (항상) |
| `ReactionOverlay` | 이모지 파티클 렌더링 | `app.reactions?` |

**씬 흐름 확장** (기존 변경 없음, 레이어 추가):

```
MainMenuScene → (선택적 룸 생성) → GameScene → ResultScene
                                    + BettingManager 오버레이 (시작 전 베팅)
                                    + ReactionOverlay (게임 중 이모지)
                                    + RecordManager.save() (종료 시 저장)
```

### 전체 통합 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                   GameApplication                         │
│  ┌────────────┐ ┌────────────┐ ┌────────┐ ┌───────────┐ │
│  │SceneManager│ │SoundManager│ │InputMgr│ │RecordMgr  │ │  ← 기존 + 신규
│  └────────────┘ └────────────┘ └────────┘ └───────────┘ │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────┐     │
│  │NetworkManager│ │BettingManager│ │ReactionOverlay│     │  ← Phase 4 (optional)
│  └──────┬───────┘ └──────┬──────┘ └───────┬───────┘     │
└─────────┼────────────────┼────────────────┼──────────────┘
          │ WebSocket       │ FSM             │ PixiJS Container
          ▼                 ▼                 ▼
    ┌──────────┐    ┌──────────────┐   ┌──────────────┐
    │  Broker  │    │ BettingState │   │ Sprite Pool  │
    │ (Supabase│    │ IDLE→OPEN    │   │ (이모지)      │
    │ Realtime)│    │ →LOCKED      │   └──────────────┘
    └────┬─────┘    │ →SETTLED     │
         │          └──────────────┘
    ┌────▼──────────────────────────────┐
    │ 게스트 모바일 (Mobile Web)          │
    │ - BettingPanel (베팅 UI)           │
    │ - ReactionPanel (응원 UI)          │
    │ - 실시간 순위 표시                   │
    └───────────────────────────────────┘
```

---

## 4. 경쟁 분석 (market-researcher)

### 경쟁 제품 비교 매트릭스

| 제품 | 베팅/예측 | 응원/리액션 | 기록/통계 | 수익모델 | 핵심 강점 |
|---|---|---|---|---|---|
| **Jackbox Games** | 관객 투표 (결과 영향) | 관객 투표 참여 | 세션 내 점수만 | 유료 $29.99/팩 | 관객 10,000명, 룸코드 |
| **Twitch Predictions** | 채널포인트 베팅, 2지선다 | 채팅 배지 색상 구분 | 세션별 포인트 누적 | 무료 (플랫폼) | 예측 긴장감, 실시간 시각화 |
| **Kahoot!** | 없음 | 리더보드 드라마 | 세션 내 리더보드 | 프리미엄 구독 | 대규모 참여, 실시간 순위 |
| **Evolution Marble Race** | 실제 현금 베팅 (12초, 4.75:1) | 6색 마블 응원 | 없음 | 카지노 하우스 엣지 | TV쇼급 연출, 물리 트랙 |
| **Wheel of Names** | 없음 | 없음 | 없음 | 무료 (광고) | 초간단 URL 진입 |
| **Discord Activities** | 없음 | 이모지, 음성채팅 | 없음 | 무료 | 소셜 그래프 내장 |

### 시장 트렌드 핵심

1. **관람형 콘텐츠의 베팅화** — Evolution Marble Race(2025)가 물리 레이스 + 베팅 조합의 시장성 검증
2. **가상화폐 베팅의 표준화** — Twitch Predictions의 채널포인트 모델이 UX 표준
3. **관객 → 참여 관람** — Jackbox의 관객 투표가 결과에 영향을 미치는 패턴
4. **30초 내 완결** — 짧고 강한 긴장감 추구 (Evolution 12초 베팅 + 레이스)
5. **소셜 공유 바이럴** — Discord Activities의 소셜 그래프 확산

### 벤치마크 Best Practice 5개

| # | 참고 제품 | 적용 방안 |
|---|---|---|
| 1 | Twitch Predictions | "응원 코인" 가상 화폐 + 색상 배지 + 비율 배분 |
| 2 | Evolution Marble Race | 카운트다운 중 베팅 UI + "누가 얼마 벌었나" 정산 애니메이션 |
| 3 | Jackbox 관객 참여 | 응원 이펙트 (결과 조작 없이 연출로만 반영) |
| 4 | Kahoot 순위 드라마 | 레이스 중 중간 순위 공개 + 역전 시 베팅자 리액션 표시 |
| 5 | Gartic Phone 진입성 | 관전자 참여도 URL + 닉네임만으로 (계정 불필요) |

### 뽑기런 차별화 포지셔닝

**"30초 레이스 드라마 + 전원 참여 베팅"** — 경쟁 제품 어디에도 없는 조합:
- vs Wheel of Names: 연출/베팅 없음
- vs Twitch Predictions: 플랫폼 종속, 레이스 없음
- vs Evolution Marble Race: 카지노, 유료
- vs Jackbox: 유료, 설치 필요

**뽑기런만의 공백**: "아는 사람들끼리 + 무설치 URL + 레이스 관람 + 서로 베팅하는 파티 뽑기"

### 리텐션 전략

| 전략 | 근거 | 구현 방향 |
|---|---|---|
| 가상 포인트 누적 | Twitch — 포인트 잃기 싫어서 재방문 | 로컬 누적, 기기 이탈 시 초기화 |
| 전적 기록 "꼴등 왕" | 부끄러운 기록 → SNS 밈화 | 세션 누적 통계 + 공유 버튼 |
| 응원 경쟁 | 화면 피드백 즉시 | 실시간 이모지 오버레이 |
| "한 판 더" 마찰 최소화 | Gartic Phone 검증 | 이름 유지 + 원클릭 재시작 (이미 구현) |
| 시즌제 모드 | Jelle's Marble Runs 팬덤 | "이번 달 우리 팀 최강자" 집계 |

---

## 5. 라이브러리 최신 정보 (Context7 — 팀 리더 직접 조회)

### Supabase Realtime

- **Broadcast**: `channel.send({ type: 'broadcast', event: 'message_sent', payload: {...} })` — 서버 거치지 않고 클라이언트 간 직접 메시지 전달
- **Presence**: `channel.track({ user_id: myUserId })` — 접속 유저 실시간 추적, `presenceState()` 로 현재 접속자 목록 조회
- **채널 설정**: `broadcast.self: true` (자기 메시지 수신), `presence.enabled: true`, `private: true` (인증 필요)
- **Replay**: `broadcast.replay: { since: timestamp, limit: 10 }` — 재접속 시 놓친 메시지 재전송
- **TypeScript SDK**: `@supabase/supabase-js` — Vanilla TS 완전 호환

```typescript
// 채널 구독 + Broadcast 수신
const channel = supabase.channel('game-room-ABC123');
channel
  .on('broadcast', { event: 'bet_placed' }, (payload) => {
    console.log('New bet:', payload.payload);
  })
  .subscribe();

// Broadcast 전송
channel.send({
  type: 'broadcast',
  event: 'game_state',
  payload: { rankings: [...], timer: 15.3 },
});
```

### Socket.io (참고용)

- **룸 기반 브로드캐스팅**: `io.to("room-101").emit("foo", "bar")` — 특정 룸에만 이벤트 전송
- **네임스페이스 분리**: `io.of("/game")`, `io.of("/betting")` — 관심사별 채널 분리 가능
- **서버 필요**: Node.js 서버 필수 → 서버리스 우선 전략과 충돌

### PixiJS Particle Emitter (@pixi/particle-emitter)

- **Behavior 기반 설정**: alpha, scale, color, moveSpeed, rotation, spawnShape 등 독립 behavior 조합
- **텍스처 지원**: `textureSingle`, `textureRandom` — 이모지 텍스트를 Texture로 변환하여 파티클화 가능
- **성능**: `maxParticles: 1000`, `frequency: 0.001` 수준 → 이모지 리액션 50개 동시 활성에 충분
- **PixiJS v8 호환**: `@pixi/particle-emitter` 5.x — v8 호환 확인 필요 (v7 기준 예제가 대부분)

> **주의**: particle-emitter는 PixiJS v7 기준 예제가 많으므로, v8에서는 직접 PixiJS Container + GSAP tween으로 이모지 플로팅을 구현하는 것이 더 안전할 수 있음.

---

## 6. 종합 분석 및 권장안

### 크로스 분석 결과

| 교차 검증 항목 | 결과 |
|---|---|
| tech(Supabase) ↔ arch(Broker 패턴) | **호환** — Supabase Realtime이 Broker 역할 수행, 별도 서버 불필요 |
| tech(Pari-mutuel) ↔ arch(FSM) | **호환** — 자체 구현 FSM에 Pari-mutuel 로직 통합, 외부 의존 없음 |
| tech(Dexie.js) ↔ arch(RecordManager) | **호환** — Dexie.js가 IndexedDB 래핑, RecordManager 내부 구현 |
| market(Twitch 베팅 UX) ↔ arch(베팅 FSM) | **호환** — OPEN 상태에서 30초 타이머 + 색상 배지 UX 적용 가능 |
| market(차별화) ↔ tech(서버리스) | **호환** — 무설치/URL 접근성 + 서버리스로 인프라 부담 최소화 |
| market(리텐션) ↔ arch(시드 리플레이) | **호환** — 시드 기반 리플레이로 "명장면 공유" 기능 자연 확장 |

**모순/충돌 사항**: 없음 — 3개 에이전트의 권장안이 일관되게 수렴

### 기술 스택 권장안

| 카테고리 | 1순위 | 2순위 | 근거 |
|---|---|---|---|
| **실시간 통신** | Supabase Realtime | PartyKit | 서버리스, DB 통합, Free tier 200연결 |
| **베팅 엔진** | 자체 Pari-mutuel (TS) | 고정 배당 (간소화) | ~50줄, 외부 의존 없음, 동적 배당 |
| **응원 전송** | Supabase Broadcast | Ably | 베팅 채널 재사용, 비용 0 |
| **응원 렌더링** | PixiJS Container + GSAP | @pixi/particle-emitter | v8 호환 확실, 기존 스택 재사용 |
| **로컬 기록** | Dexie.js (IndexedDB) | localStorage | 쿼리/인덱스/TS 지원, 용량 무제한 |
| **클라우드 기록** | Supabase PostgreSQL | — | 동일 SDK, 글로벌 리더보드 가능 |

### 아키텍처 권장안

**핵심 원칙**: 기존 구조 변경 최소화 + optional 레이어 추가

- 신규 Core 모듈 4개: `NetworkManager`, `BettingManager`, `RecordManager`, `ReactionOverlay`
- 모든 멀티플레이어 기능은 optional — 로컬 단독 플레이도 그대로 동작
- 씬 흐름 변경 없음 — 기존 MainMenu → Game → Result 유지 + 오버레이 추가

### 구현 우선순위 (Phase 4 내 단계)

| 단계 | 기능 | 서버 필요 | 이유 |
|---|---|---|---|
| **4-1** | RecordManager + Dexie.js (로컬 기록/통계) | X | 서버 없이 즉시 구현, 독립적 |
| **4-2** | BettingManager (로컬 베팅) | X | 네트워크 없이 로컬 베팅부터 검증 |
| **4-3** | NetworkManager + Supabase Realtime | O | 4-1, 4-2 완료 후 네트워크 레이어 추가 |
| **4-4** | ReactionOverlay + 모바일 게스트 UI | O | NetworkManager 완료 후 연동 |

### 차별화 전략

**뽑기런 고유 포지셔닝**: "아는 사람들끼리 + 무설치 URL + 30초 레이스 관람 + 서로 베팅하는 파티 뽑기"

경쟁 제품 공백 공략:
- Wheel of Names보다 압도적 연출 (30초 드라마)
- Twitch Predictions보다 독립적 (플랫폼 비종속)
- Evolution Marble Race보다 가볍고 무료 (파티용)
- Jackbox보다 접근성 높음 (무설치, 무료)

### 리스크 및 주의사항

| 리스크 | 심각도 | 대응 방안 |
|---|---|---|
| Supabase Free tier 동시접속 200 제한 | 🟡 중 | 방당 30명 규모에서 충분, 대규모 이벤트 시 Pro 업그레이드 ($25/월) |
| PixiJS particle-emitter v8 호환 불확실 | 🟡 중 | 직접 Container + GSAP으로 이모지 플로팅 구현 (안전) |
| 모바일 게스트 UI 별도 개발 필요 | 🟡 중 | 경량 HTML 페이지, 기존 PixiJS 미사용 |
| Supabase Broadcast 지연 ~100ms | 🟢 낮 | 응원 이모지에는 무시 가능, 베팅 정산은 호스트 로컬 처리 |
| Dexie.js 크로스 디바이스 동기화 불가 | 🟢 낮 | Phase 4 후기에 Supabase DB 동기화 추가 가능 |
| 가상 포인트가 도박법 저촉 가능성 | 🟢 낮 | 실제 화폐 연동 없음, 세션 내 가상 포인트만 → 문제없음 |

---

## 7. 출처 통합

### 기술 스택
- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [Supabase Flutter Multiplayer Game 튜토리얼](https://supabase.com/blog/flutter-real-time-multiplayer-game)
- [Socket.IO Server API — Rooms](https://socket.io/docs/v4/server-api)
- [Ably — Design Patterns for Betting Apps](https://ably.com/blog/design-patterns-betting-apps)
- [PartyKit 공식 문서](https://docs.partykit.io/how-partykit-works/)
- [Dexie.js — IndexedDB Wrapper](https://dexie.org/)
- [PixiJS Particle Emitter](https://github.com/pixijs-userland/particle-emitter)

### 아키텍처
- [party-box — Jackbox 스타일 파티게임 프레임워크](https://github.com/hammre/party-box)
- [Parimutuel Betting — Wikipedia](https://en.wikipedia.org/wiki/Parimutuel_betting)
- [State Machines for JS Developers — OpenReplay](https://blog.openreplay.com/state-machines-for-javascript-developers-how-to-use-them-in-your-apps/)
- [Developing Your Own Replay System — Game Developer](https://www.gamedeveloper.com/programming/developing-your-own-replay-system)
- [W3C Games Roadmap — Data Storage](https://w3c.github.io/web-roadmaps/games/storage.html)
- [Real-Time Gaming Leaderboard — AlgoMaster](https://blog.algomaster.io/p/design-real-time-gaming-leaderboard)

### 경쟁 제품
- [Jackbox Audience Participation](https://www.jackboxgames.com/blog/how-audience-play-along-differs-in-each-jackbox-game)
- [Twitch Predictions 공식 블로그](https://blog.twitch.tv/en/2020/12/12/channel-points-predictions-let-your-viewers-guess-your-destiny/)
- [Evolution Marble Race Live 리뷰](https://www.livecasinocomparer.com/live-casino-software/evolution-live-casino-software/marble-race-live/)
- [Marble Races and Revenue Models — Medium](https://alexsanchezsastre.medium.com/marble-races-and-revenue-models-a5bf644b3677)
- [Kahoot Points System](https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work)
- [Discord Activities Launch](https://discord.com/blog/server-activities-games-voice-watch-together)

---

> 이 보고서는 Claude Code `/team-research` 스킬로 자동 생성되었습니다.
> 다음 단계: `/plan` 으로 Phase 4 SubTask 분리 → `/sh-dev-loop` 으로 구현 시작
