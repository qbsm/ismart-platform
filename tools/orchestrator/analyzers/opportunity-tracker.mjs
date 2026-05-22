/**
 * Opportunity tracker — обновляет «Встречалось» для open opportunities на основе
 * findings других analyzer'ов через маркеры `<!-- tracks: <kind>[:<value>] -->`
 * в строках таблицы `docs/orchestrator/opportunities.md`.
 *
 * Поддерживаемые kinds:
 *   data-flow                 — соответствует любому data-flow finding
 *   pattern[:<kind>]          — pattern-detector finding (опц. фильтр по kind)
 *   commit[:<scope>]          — commit-miner recurring-topic (опц. фильтр по scope)
 *
 * Output: список { id, title, status, marker, found, deployments } —
 *   found  = сколько раз триггер встретился в текущем прогоне
 *   deployments = unique slugs которые задели finding'и
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROW_RE = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
const TRACKS_RE = /<!--\s*tracks:\s*([^>]+?)\s*-->/g;

/**
 * @param {string} platformDir
 * @param {{dataFlow?: any[], patterns?: any[], commits?: any[]}} analyzerResults
 */
export async function opportunityTracker(platformDir, analyzerResults) {
  const md = await safeRead(join(platformDir, 'docs/orchestrator/opportunities.md'));
  if (!md) return [];

  const rows = [];
  for (const line of md.split('\n')) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, idStr, title, status, _count, _where] = m;
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    const trackers = [...title.matchAll(TRACKS_RE)].map(x => x[1].trim());
    if (trackers.length === 0) continue;
    rows.push({ id, title: title.replace(TRACKS_RE, '').trim(), status, trackers });
  }

  const out = [];
  for (const row of rows) {
    const matched = matchFindings(row.trackers, analyzerResults);
    out.push({
      id: row.id,
      title: row.title,
      status: row.status,
      markers: row.trackers,
      found: matched.length,
      deployments: [...new Set(matched.map(m => m.deployment).filter(Boolean))],
    });
  }
  return out;
}

function matchFindings(trackers, results) {
  const matches = [];
  for (const tracker of trackers) {
    const [kindRaw, valueRaw] = tracker.split(':').map(s => s?.trim());
    const kind = kindRaw;
    const value = valueRaw || null;

    if (kind === 'data-flow' && Array.isArray(results.dataFlow)) {
      for (const f of results.dataFlow) {
        if (value && f.section !== value) continue;
        matches.push(f);
      }
    }
    if (kind === 'pattern' && Array.isArray(results.patterns)) {
      for (const f of results.patterns) {
        if (value && f.kind !== value) continue;
        matches.push(f);
      }
    }
    if (kind === 'commit' && Array.isArray(results.commits)) {
      for (const f of results.commits) {
        if (f.type !== 'recurring-topic') continue;
        if (value && f.scope !== value) continue;
        if (Array.isArray(f.deployments)) {
          for (const d of f.deployments) matches.push({ ...f, deployment: d });
        } else {
          matches.push(f);
        }
      }
    }
  }
  return matches;
}

async function safeRead(path) {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}
