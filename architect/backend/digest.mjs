// ═══════════════════════════════════════════════════════════════
//  АРХИТЕКТОР — еженедельный дайджест обратной связи (FEEDBACK_SPEC.md,
//  шаг 5). Собирает статистику за 7 дней из raw_feedback_log /
//  classified_feedback / patterns и открывает GitHub Issue с чекбоксами
//  решений для владельца. Запускается GitHub Action (cron по понедельникам).
//  Без секретов — мягкий выход, чтобы cron не сыпал красным.
// ═══════════════════════════════════════════════════════════════
import pg from 'pg';
const { Pool } = pg;
const DB = process.env.DATABASE_URL, TOKEN = process.env.GITHUB_TOKEN, REPO = process.env.GITHUB_REPOSITORY;
if (!DB || !TOKEN || !REPO) {
  console.log(`SKIP: окружение не задано → DATABASE_URL=${!!DB} GITHUB_TOKEN=${!!TOKEN} GITHUB_REPOSITORY=${!!REPO}`);
  process.exit(0);
}
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
const has = async t => !!(await pool.query('SELECT to_regclass($1) r', [t])).rows[0].r;
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// Таблиц ещё нет (триаж ни разу не отработал) — дайджеста быть не может.
if (!(await has('raw_feedback_log'))) { console.log('Нет raw_feedback_log — нечего дайджестить'); await pool.end(); process.exit(0); }
const triaged = (await has('classified_feedback')) && (await has('patterns'));

const total = +(await q(`SELECT count(*) n FROM raw_feedback_log WHERE received_at > now() - interval '7 days'`))[0].n;
const byType   = triaged ? await q(`SELECT type, count(*) n FROM classified_feedback WHERE classified_at > now() - interval '7 days' GROUP BY type ORDER BY n DESC`) : [];
const critical = triaged ? await q(`SELECT c.feedback_id id, c.summary, c.module FROM classified_feedback c WHERE c.sentiment = 'critical' AND c.classified_at > now() - interval '7 days' ORDER BY c.feedback_id`) : [];
const fixed    = triaged ? await q(`SELECT id, summary, module, mention_count FROM patterns WHERE status = 'fixed' AND last_seen > now() - interval '7 days' ORDER BY mention_count DESC`) : [];
const open     = triaged ? await q(`SELECT id, summary, module, mention_count, priority, first_seen FROM patterns WHERE status = 'open' ORDER BY (priority = 'high') DESC, mention_count DESC, last_seen DESC LIMIT 15`) : [];
const backlog  = triaged ? +(await q(`SELECT count(*) n FROM raw_feedback_log r LEFT JOIN classified_feedback c ON c.feedback_id = r.id WHERE c.feedback_id IS NULL`))[0].n : total;
await pool.end();

if (!total && !open.length && !critical.length) { console.log('Неделя пуста — дайджест не нужен'); process.exit(0); }

const RU = { gratitude: 'благодарности', suggestion: 'предложения', bug: 'баги', ux_complaint: 'UX-жалобы', irrelevant: 'нерелевантное' };
const week = new Date().toISOString().slice(0, 10);
const L = [];
L.push(`Автосводка обратной связи за 7 дней до **${week}**. Источник: raw_feedback_log → AI-триаж.`);
L.push('');
L.push(`**Получено сообщений:** ${total}` + (byType.length ? ' · ' + byType.map(r => `${RU[r.type] || r.type}: ${r.n}`).join(' · ') : ''));
if (backlog) L.push(`**Ожидают триажа:** ${backlog}` + (triaged ? '' : ' (триаж ещё не запускался — проверь секреты Actions)'));
L.push('');
if (critical.length) {
  L.push('## 🔴 Критические баги');
  for (const c of critical) L.push(`- [ ] #${c.id} · \`${c.module}\` — ${c.summary}`);
  L.push('');
}
L.push('## ✅ Автоисправлено за неделю');
L.push(fixed.length ? fixed.map(p => `- паттерн ${p.id} · \`${p.module}\` — ${p.summary} (${p.mention_count} упом.)`).join('\n') : '_пока ничего — авто-фикс ещё не активирован_');
L.push('');
L.push('## 🟡 Требует решения владельца');
if (open.length) {
  L.push('Отметь чекбокс = «берём в работу»; закрой issue = «всё решено».');
  for (const p of open) L.push(`- [ ] паттерн ${p.id}${p.priority === 'high' ? ' **[HIGH]**' : ''} · \`${p.module}\` — ${p.summary} (${p.mention_count} упом., с ${String(p.first_seen).slice(0, 10)})`);
} else L.push('_открытых паттернов нет_');
L.push('');
L.push('## 📈 Тренды');
const high = open.filter(p => p.priority === 'high');
L.push(high.length ? `Паттернов с приоритетом high: **${high.length}** — ${high.map(p => p.id).join(', ')}. Это ≥3 упоминания за 72 часа: смотреть в первую очередь.` : 'Всплесков нет — ни один паттерн не набрал 3 упоминаний за 72 часа.');

const resp = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
  body: JSON.stringify({ title: `📬 Дайджест обратной связи — неделя до ${week}`, body: L.join('\n') }),
});
const issue = await resp.json();
if (!resp.ok) { console.error('GitHub Issues API:', issue.message || resp.status); process.exit(1); }
console.log(`✓ дайджест создан: ${issue.html_url}`);
