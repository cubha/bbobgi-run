#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# verify.sh — 1등꼴등 게임 (first-last-game)
# tsc + eslint + build 검증
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { ((++PASS)); echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { ((++FAIL)); echo -e "${RED}[FAIL]${NC} $1"; }
warn() { ((++WARN)); echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "══════════════════════════════"
echo " verify.sh — first-last-game"
echo "══════════════════════════════"
echo ""

# ── 1. TypeScript ────────────────────────────
echo "── TypeScript ──"
if npx tsc --noEmit 2>&1; then
  pass "tsc --noEmit"
else
  fail "tsc --noEmit"
fi
echo ""

# ── 2. ESLint ────────────────────────────────
if [ "${1:-}" != "--ts-only" ]; then
  echo "── ESLint ──"
  if npx eslint src/ --max-warnings 0 2>&1; then
    pass "eslint src/"
  else
    fail "eslint src/"
  fi
  echo ""
fi

# ── 3. Build ─────────────────────────────────
echo "── Build ──"
if npx vite build 2>&1; then
  pass "vite build"
else
  fail "vite build"
fi
echo ""

# ── 4. Spec patterns ─────────────────────────
echo "── Spec Patterns ──"

# PixiJS v8: async init pattern
if grep -r "new Application()" src/ --include="*.ts" | grep -v "new Application();" | grep -v "import" > /dev/null 2>&1; then
  # Check if init() is called after
  if ! grep -r "app.init\|pixi.init\|\.init(" src/ --include="*.ts" > /dev/null 2>&1; then
    warn "PixiJS v8: Application() 후 init() 호출 확인 필요"
  else
    pass "PixiJS v8 async init 패턴"
  fi
else
  pass "PixiJS v8 async init 패턴"
fi

# Matter.js abstraction
if grep -rn "from 'matter-js'" src/ --include="*.ts" | grep -v "PhysicsWorld" > /dev/null 2>&1; then
  warn "Matter.js 직접 import 감지 — PhysicsWorld 래퍼를 통해 사용 권장"
else
  pass "Matter.js PhysicsWorld 추상화"
fi

# No any type
ANY_COUNT=$(grep -rn ": any" src/ --include="*.ts" | grep -v "node_modules" | wc -l || true)
if [ "$ANY_COUNT" -gt 0 ]; then
  warn "any 타입 ${ANY_COUNT}건 감지"
else
  pass "any 타입 없음"
fi

echo ""

# ── Summary ──────────────────────────────────
echo "══════════════════════════════"
echo -e " ${GREEN}PASS${NC}: $PASS  ${RED}FAIL${NC}: $FAIL  ${YELLOW}WARN${NC}: $WARN"
echo "══════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ FAIL${NC}"
  exit 1
else
  echo -e "${GREEN}✅ PASS${NC}"
  exit 0
fi
