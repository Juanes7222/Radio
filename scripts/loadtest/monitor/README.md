# VPS metric collector

`collect.sh` runs on the VPS, not on the operator machine. It samples once per
second and writes a CSV with one row per second:

```
ts,cpu_pct,rss_kb,mem_available_kb,mem_total_kb,net_rx_bytes,net_tx_bytes,restarts
```

`%CPU` is the percentage over the total number of cores, as reported by `ps`
for the process. `mem_available_kb / mem_total_kb` is the usable-memory
fraction (`free -k`, with `/proc/meminfo` as fallback). The network columns are
byte rates computed from the delta of `/proc/net/dev` between consecutive reads,
excluding `lo`; they are not `sar -n DEV 1`, which blocks and doubles the
interval inside the loop. `restarts` is the PM2 field of the process named
`radio-backend`, not `restart_count`. The script installs nothing.

## Start and stop

Get the PID and start the collector in the background before the load run:

```bash
pid=$(pm2 pid radio-backend)
bash scripts/loadtest/monitor/collect.sh "$pid" 900 reports/capacity.csv > /var/log/radio-collector.log 2>&1 &
echo $! > /tmp/radio-collector.pid
```

Stop it after the run:

```bash
kill "$(cat /tmp/radio-collector.pid)"
```

The collector runs on the same VPS it measures, so its own cost is part of the
sample. Report that cost with the result rather than treating the numbers as
free.

## Correlation

`correlate.mjs` reads one or more k6 JSON reports and the collector CSV, cuts
the CSV to the exact window between the first and the last k6 point, aggregates
both sources by minute, and writes a markdown table:

```powershell
node scripts/loadtest/monitor/correlate.mjs reports/capacity-origin.json reports/capacity-mixed-origin.json reports/capacity.csv reports/capacity.md
```

`K6_BASELINE_RESTARTS` sets the restart count observed before the window and
`K6_RTT_MEDIAN_MS` adds the RTT measured from the operator machine to the
report header. Saturation criteria are p95 > 2000 ms, errors > 5%, CPU > 85%
for two consecutive minutes, available memory < 10%, RPS not growing when the
stage advances, dropped iterations (generator saturated), and restarts above
the baseline.
