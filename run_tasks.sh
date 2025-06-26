#!/usr/bin/env bash
set -Euo pipefail          # エラー即終了 & 未定義変数検出
shopt -s lastpipe
source .env

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

TASK_FILE="tasks.json"
FAILED_FILE=".failed_tasks"
LOG_DIR="$ROOT/.logs"; mkdir -p "$LOG_DIR"

# options
ONLY_FAILED=0; PARALLEL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --only-failed) ONLY_FAILED=1 ;;
    --max-jobs) PARALLEL=$2; shift ;;
  esac; shift
done

# --- 自動コミット ---
discord_and_commit_and_push() {
   exit_status=$?

   # Discord 通知 (失敗時のみ)
   if [[ -s "$FAILED_FILE" ]]; then
     echo "Some tasks failed:"
     cat "$FAILED_FILE"
     if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
       fail_list=$(paste -sd "," "$FAILED_FILE")
       jq -n --arg content "@stepney141 Favorites Updater ‼️ Failed task(s): $fail_list" '{content:$content}' | curl -fSL -H "Content-Type: application/json" -d @- "$DISCORD_WEBHOOK_URL"
     fi
   fi

   set +e
   CURRENT_DATETIME=$(TZ=Asia/Tokyo date --iso-8601=minutes)
   git add -A
   git commit -m "auto-updated: $CURRENT_DATETIME" 2>/dev/null || true
   git push || true

   exit $exit_status
}
trap discord_and_commit_and_push EXIT

# 1) 読み込むタスクリスト
list_tasks() {
  local filter='.tasks[]'
  (( ONLY_FAILED )) && filter=".tasks[] | select(.name as $n | (input_filename==\"${FAILED_FILE}\" and (.tasks[]|.name==$n)))"
  jq -cr "$filter | @base64" "$TASK_FILE"
}

# 2) ベース64デコード→実行
run_job() {
  local encoded=$1
  local json ; json=$(echo "$encoded" | base64 -d)
  local name dir cmd
  name=$(jq -r '.name' <<<"$json")
  dir=$( jq -r '.dir'  <<<"$json")
  cmd=$( jq -r '.cmd'  <<<"$json")

  echo "[`date +%F' '%T`] start  $name"
  ( cd "$dir" && eval "$cmd" ) &> "$LOG_DIR/$name.log"
  if [[ $? -ne 0 ]]; then
     echo "$name" >> "$FAILED_FILE"
     return 1
  fi
  echo "[`date +%F' '%T`] done   $name"
}

export -f run_job
export LOG_DIR FAILED_FILE

: > "$FAILED_FILE"               # 失敗記録を初期化

MAX_PARALLEL=$(jq -r '.max_parallel // 4' "$TASK_FILE")
[[ -n "$PARALLEL" ]] && MAX_PARALLEL=$PARALLEL

# 3) 並列実行 (xargs -P)
list_tasks | xargs -I{} -P "$MAX_PARALLEL" bash -c 'run_job "$@"' _ {}
EXIT=$?

