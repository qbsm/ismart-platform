/**
 * Commit miner — анализирует историю коммитов sibling-deployments.
 *
 * MVP-классификация (см. docs/inventory/commit-baseline.md):
 *   - core-hotfix          — `fix:` коммит trogает файл из baseline manifest'а
 *   - recurring-topic      — один scope (`fix(seo)`) встретился в ≥2 deployments в окне
 *   - component-pattern    — коммит затрагивает templates/sections/{X}.twig или
 *                            assets/{css,js}/sections/{X}.{css,js} → группируется по section-имени;
 *                            если в ≥2 deployments одна и та же секция активно правится →
 *                            кандидат на extract в templates/components/ (см. memory
 *                            feedback-core-proposals-in-baseline).
 *   - convention-violation — subject не соответствует Conventional Commits regex
 *   - skipped              — `sync(baseline)` / `chore(deps)` (служебные, не findings)
 *
 * Что отложено: CORE-refactor (требует AST), Reusable feature (heuristic generic-имя),
 * Drift origin (требует git log --follow per drifted file), full keyword fallback для italy.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CONVENTIONAL_RE = /^(feat|fix|chore|docs|refactor|test|style|perf|build|ci|revert)(\([^)]+\))?!?: /;
const SCOPE_RE = /^([a-z]+)(?:\(([^)]+)\))?[!:]/;
const SINCE = '90 days ago';
const SKIP_SCOPES = new Set(['baseline', 'deps']);
const RECURRING_MIN_DEPLOYMENTS = 2;

/**
 * @param {string} platformDir - baseline директория (для manifest.json)
 * @param {Array<{slug:string, path:string}>} deployments
 */
export async function commitMiner(platformDir, deployments) {
  const manifestFiles = await loadManifestFiles(platformDir);
  const byDeployment = new Map();
  const findings = [];
  // section-name → Map<deployment, commitCount>
  const componentSections = new Map();

  for (const d of deployments) {
    const commits = collectCommits(d.path);
    byDeployment.set(d.slug, commits);

    let convViolations = 0;
    for (const c of commits) {
      if (c.skipped) continue;

      if (!c.conventional) {
        convViolations++;
        continue;
      }

      if (c.type === 'fix' && touchesCore(c.files, manifestFiles)) {
        findings.push({
          deployment: d.slug,
          type: 'core-hotfix',
          sha: c.sha.slice(0, 7),
          subject: c.subject,
          coreFiles: c.files.filter(f => manifestFiles.has(f)).slice(0, 3),
        });
      }

      // component-pattern: правки секций и компонентов фронта (Twig/CSS/JS)
      // группируются по имени секции → паттерн = ≥2 deployments на одну секцию.
      for (const sec of extractComponentSections(c.files)) {
        if (!componentSections.has(sec)) componentSections.set(sec, new Map());
        const m = componentSections.get(sec);
        m.set(d.slug, (m.get(d.slug) || 0) + 1);
      }
    }

    if (convViolations > 0) {
      findings.push({
        deployment: d.slug,
        type: 'convention-violation',
        count: convViolations,
        total: commits.filter(c => !c.skipped).length,
      });
    }
  }

  // Cross-deployment component-pattern: секция правится в ≥2 deployments.
  for (const [section, slugs] of componentSections) {
    if (slugs.size >= RECURRING_MIN_DEPLOYMENTS) {
      findings.push({
        type: 'component-pattern',
        section,
        deployments: [...slugs.keys()],
        counts: Object.fromEntries(slugs),
        total: [...slugs.values()].reduce((a, b) => a + b, 0),
      });
    }
  }

  // Кросс-deployment recurring topics: scope встречается в ≥2 разных deployments.
  const scopeMap = new Map(); // "fix(seo)" → Map<slug, count>
  for (const [slug, commits] of byDeployment) {
    for (const c of commits) {
      if (c.skipped || !c.conventional || !c.scope) continue;
      const key = `${c.type}(${c.scope})`;
      if (!scopeMap.has(key)) scopeMap.set(key, new Map());
      const m = scopeMap.get(key);
      m.set(slug, (m.get(slug) || 0) + 1);
    }
  }
  for (const [key, slugs] of scopeMap) {
    if (slugs.size >= RECURRING_MIN_DEPLOYMENTS) {
      findings.push({
        type: 'recurring-topic',
        scope: key,
        deployments: [...slugs.keys()],
        counts: Object.fromEntries(slugs),
        total: [...slugs.values()].reduce((a, b) => a + b, 0),
      });
    }
  }

  return findings;
}

/**
 * @param {string} path - deployment dir
 * @returns {Array<{sha:string, date:string, subject:string, type?:string, scope?:string|null, conventional:boolean, skipped:boolean, files:string[]}>}
 */
function collectCommits(path) {
  let raw;
  try {
    raw = execFileSync('git', [
      'log', `--since=${SINCE}`,
      '--name-only', '--no-merges',
      '--pretty=format:%x1fCOMMIT%x1f%H%x1f%aI%x1f%s',
    ], { cwd: path, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return [];
  }

  const commits = [];
  const chunks = raw.split('\x1fCOMMIT\x1f').filter(s => s.trim());
  for (const chunk of chunks) {
    const [meta, ...rest] = chunk.split('\n');
    const [sha, date, ...subjectParts] = meta.split('\x1f');
    const subject = subjectParts.join('\x1f');
    const files = rest.map(s => s.trim()).filter(Boolean);
    const m = subject.match(SCOPE_RE);
    const type = m?.[1];
    const scope = m?.[2] ?? null;
    const conventional = CONVENTIONAL_RE.test(subject);
    const skipped = scope ? SKIP_SCOPES.has(scope) : false;
    commits.push({ sha, date, subject, type, scope, conventional, skipped, files });
  }
  return commits;
}

async function loadManifestFiles(platformDir) {
  try {
    const data = JSON.parse(await readFile(join(platformDir, '.distill/manifest.json'), 'utf8'));
    return new Set(Object.keys(data.files || {}));
  } catch {
    return new Set();
  }
}

function touchesCore(files, manifestFiles) {
  if (manifestFiles.size === 0) return false;
  return files.some(f => manifestFiles.has(f));
}

/**
 * Извлекает имена секций/компонентов из списка изменённых файлов:
 *   templates/sections/intro.twig   → "intro"
 *   templates/components/card-news.twig → "card-news"
 *   assets/css/sections/intro.css   → "intro"
 *   assets/js/sections/intro.js     → "intro"
 *   assets/css/components/card-news.css → "card-news"
 *
 * Возвращает Set имён (один коммит — одно вхождение каждой секции).
 */
function extractComponentSections(files) {
  const sections = new Set();
  const re = /^(?:templates|assets\/css|assets\/js)\/(?:sections|components)\/([a-z0-9_-]+)\.(twig|css|js)$/i;
  for (const f of files) {
    const m = f.match(re);
    if (m) sections.add(m[1]);
  }
  return sections;
}
