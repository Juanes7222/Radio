#!/usr/bin/env bash
# Samples the radio-backend process and the VPS at 1 Hz during a load run.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: collect.sh <pid> <seconds> <output.csv>" >&2
  exit 2
fi

pid=$1
seconds=$2
output=$3

read_net() {
  awk -v sum_rx=0 -v sum_tx=0 '
    NR > 2 {
      interface = $1
      gsub(/:/, "", interface)
      if (interface != "lo") {
        sum_rx += $2
        sum_tx += $10
      }
    }
    END { printf "%d %d", sum_rx, sum_tx }
  ' /proc/net/dev
}

read_cpu_and_rss() {
  ps -p "$pid" -o %cpu= -o rss= | awk 'NR == 1 { printf "%s %s", $1, $2 }'
}

read_memory() {
  local total available
  read -r total available < <(free -k | awk '/^Mem:/ { if (NF >= 7) print $2, $7; else print $2, 0 }')
  if [ "${available:-0}" -eq 0 ]; then
    available=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
  fi
  printf '%s %s' "$total" "$available"
}

read_restarts() {
  pm2 jlist 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const list = JSON.parse(input);
        const processInfo = list.find((item) => item.name === "radio-backend");
        const restarts = processInfo?.pm2_env?.restarts;
        process.stdout.write(String(typeof restarts === "number" ? restarts : 0));
      } catch {
        process.stdout.write("0");
      }
    });
  '
}

printf 'ts,cpu_pct,rss_kb,mem_available_kb,mem_total_kb,net_rx_bytes,net_tx_bytes,restarts\n' > "$output"

read -r previous_rx previous_tx <<< "$(read_net)"
previous_time=$(date +%s)

for ((sample = 0; sample < seconds; sample++)); do
  current_time=$(date +%s)
  read -r current_rx current_tx <<< "$(read_net)"
  elapsed=$((current_time - previous_time))
  if [ "$elapsed" -lt 1 ]; then
    elapsed=1
  fi

  cpu_and_rss=$(read_cpu_and_rss || printf '0 0')
  read -r cpu rss <<< "$cpu_and_rss"
  memory=$(read_memory)
  read -r total available <<< "$memory"
  restarts=$(read_restarts)

  rates=$(awk -v rx="$current_rx" -v prx="$previous_rx" -v tx="$current_tx" -v ptx="$previous_tx" -v elapsed="$elapsed" \
    'BEGIN { printf "%d %d", (rx - prx) / elapsed < 0 ? 0 : (rx - prx) / elapsed, (tx - ptx) / elapsed < 0 ? 0 : (tx - ptx) / elapsed }')
  read -r rx_rate tx_rate <<< "$rates"

  printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$current_time" "$cpu" "$rss" "$available" "$total" "$rx_rate" "$tx_rate" "$restarts" >> "$output"

  previous_rx=$current_rx
  previous_tx=$current_tx
  previous_time=$current_time
  sleep 1
done
