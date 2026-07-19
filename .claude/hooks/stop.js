#!/usr/bin/env node
'use strict';

/**
 * Stop hook: гонит Claude по открытым issues одного milestone, пока они не кончатся,
 * затем один раз открывает PR.
 *
 * Продолжение работы делается блокировкой остановки ({"decision":"block"}), а не запуском
 * `claude -p` из хука: дочерняя сессия унаследовала бы этот же хук и породила следующую —
 * рекурсия без дна, — а 10-минутный таймаут хука убил бы её на середине задачи.
 *
 * Circuit breaker: maxIterations из конфига ограничивает, сколько задач цикл берёт подряд
 * за один прогон. Дойдя до лимита, хук выпускает Claude и ждёт ручного «продолжай» —
 * это и есть режим Human-in-the-Loop (maxIterations: 1) и защита от выжигания токенов.
 *
 * Отдельный потолок платформы: Claude Code сам обрывает блокировку после 8 подряд.
 * Поднимается переменной CLAUDE_CODE_STOP_HOOK_BLOCK_CAP в env настроек.
 * MaxTurns (шаги внутри сессии) здесь неприменим — это флаг `claude -p`, а хук
 * не запускает сессию, а продолжает текущую; ограничивать нечего.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(PROJECT_DIR, '.claude', 'ralph.config.json');
const STATE_PATH = path.join(PROJECT_DIR, '.claude', '.ralph-state.json');

/** Выпустить Claude из цикла. `note` уходит в транскрипт, пользователю на глаза. */
function release(note) {
  if (note) process.stderr.write(`[ralph] ${note}\n`);
  process.exit(0);
}

/**
 * Заставить Claude продолжить.
 *
 * Два поля делают разное, и перепутать их — значит крутить цикл вхолостую:
 * reason видит только пользователь, а до модели доходит единственно
 * hookSpecificOutput.additionalContext — в нём и едет промпт.
 */
function keepGoing(note, prompt) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: note,
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: prompt,
      },
    }),
  );
  process.exit(0);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * gh без шелла: аргументы уходят в CreateProcess как есть, поэтому кириллица
 * в названии milestone не бьётся о кодировку cmd.exe.
 */
function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', cwd: PROJECT_DIR });
  if (r.error) return { ok: false, out: '', err: r.error.message };
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd: PROJECT_DIR });
  return { ok: !r.error && r.status === 0, out: r.error ? '' : (r.stdout || '').trim() };
}

/** Подставить {ключ} из конфига. Незаполненный placeholder уехал бы к Claude как есть. */
function fill(template, values) {
  return Object.entries(values).reduce(
    (acc, [key, value]) => (value ? acc.split(`{${key}}`).join(value) : acc),
    template,
  );
}

/**
 * Чистое решение цикла: продолжать или встать — и почему.
 * Вынесено из IO, чтобы тестировать без gh и файловой системы.
 *
 * Три предохранителя автономного цикла, каждый ловит свою беду:
 *  - stall   — задача не двигается (тесты вечно красные): issue не убавилось. Проблема №1.
 *  - limit   — взято maxIter задач за прогон: не выжечь токены пачкой задач. Проблема №2.
 *  - session — сессия распухла: пора начать свежую, пока агент не деградировал. Проблема №3.
 *
 * @param prev         прошлое состояние этой сессии (или null)
 * @param hookActive   hook.stop_hook_active — мы ли блокировали прошлую остановку
 * @param openCount    сколько issue открыто сейчас
 * @param maxIter      лимит задач за прогон (0 — без лимита)
 * @param sessionBytes размер транскрипта сессии в байтах
 * @param maxBytes     порог размера сессии в байтах (0 — без лимита)
 * @returns {kind:'continue'|'limit'|'stall'|'session', iteration}
 */
function decide(prev, hookActive, openCount, maxIter, sessionBytes, maxBytes) {
  // hookActive=false — начало отрезка (старт сессии или человек вмешался): счётчик с нуля.
  // В цепочке наших продолжений счётчик копится.
  const iteration = prev && hookActive ? prev.iteration || 0 : 0;

  // Буксование ловим только в своей цепочке: issue не убавилось с прошлого раза.
  if (hookActive && prev && openCount >= prev.openCount) {
    return { kind: 'stall', iteration };
  }
  // Сессия распухла — не начинаем новую задачу в замусоренном контексте.
  if (maxBytes > 0 && sessionBytes >= maxBytes) {
    return { kind: 'session', iteration };
  }
  // Взяли лимит задач за прогон — пауза до человека.
  if (maxIter > 0 && iteration >= maxIter) {
    return { kind: 'limit', iteration };
  }
  return { kind: 'continue', iteration: iteration + 1 };
}

/**
 * Размер транскрипта в байтах — прокси давления на контекст. Считаем байты, а не строки:
 * одно чтение файла весит как сотни коротких реплик, но в строках это всего +1, поэтому
 * счёт строк почти не связан с реальным заполнением окна (проверено на первом прогоне:
 * 686 строк = 2.15 МБ, ~540K токенов — окно давно переполнено, а по строкам «не дошли»).
 */
function transcriptBytes(transcriptPath) {
  if (!transcriptPath) return 0;
  try {
    return fs.statSync(transcriptPath).size;
  } catch {
    return 0;
  }
}

/**
 * Из цепочки milestone выбирает активный и следующую задачу, и считает прогресс.
 * Чистая функция — тестируется без gh.
 *
 * «Какую issue подать» и «есть ли прогресс» — две независимые величины:
 *  - активный milestone / следующая issue берутся из ПЕРВОГО непустого milestone;
 *  - totalOpen — сумма по ВСЕЙ цепочке, чтобы на стыке фаз (один опустел, следующий
 *    полон) счётчик не прыгал вверх и сталл-гард не срабатывал ложно.
 *
 * @param chain [{ milestone, issues:[{number,title}] }] — issues отсортированы по возрастанию
 * @returns {activeMilestone: string|null, nextIssue: object|null, totalOpen: number}
 */
function selectActive(chain) {
  let totalOpen = 0;
  let activeMilestone = null;
  let nextIssue = null;
  for (const entry of chain) {
    const issues = entry.issues || [];
    totalOpen += issues.length;
    if (activeMilestone === null && issues.length > 0) {
      activeMilestone = entry.milestone;
      nextIssue = issues[0];
    }
  }
  return { activeMilestone, nextIssue, totalOpen };
}

function readState(sessionId) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return s.sessionId === sessionId ? s : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
    /* состояние — оптимизация, не повод ронять хук */
  }
}

function main() {
  let hook = {};
  try {
    hook = JSON.parse(readStdin()) || {};
  } catch {
    hook = {};
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return release(`конфиг не прочитан (${CONFIG_PATH}): ${e.message}`);
  }

  const branch = (config.branch || config.Branch || '').trim();
  const promptTemplate = (config.prompt || '').trim();
  const prTitle = (config.prTitle || '').trim();
  // 0 или отсутствие поля — без лимита (полностью автономный прогон).
  const maxIterations = Number(config.maxIterations) || 0;
  const maxSessionBytes = Number(config.maxSessionBytes) || 0;

  // Цепочка milestone: массив `milestones` главнее; иначе — одиночный `milestone`
  // (обратная совместимость). Пусто → цикл выключен.
  const milestoneChain = (
    Array.isArray(config.milestones) && config.milestones.length
      ? config.milestones
      : [config.milestone]
  )
    .map((m) => (m || '').trim())
    .filter(Boolean);

  if (!milestoneChain.length)
    return release('milestones/milestone в ralph.config.json пусты — цикл не запускается');
  if (!promptTemplate) return release('prompt в ralph.config.json пуст — нечего передать Claude');

  // Открытые issue по каждому milestone цепочки. gh отдаёт от новых к старым;
  // по возрастанию номера — это порядок плана.
  const chain = [];
  for (const m of milestoneChain) {
    const listed = gh([
      'issue',
      'list',
      '--milestone',
      m,
      '--state',
      'open',
      '--json',
      'number,title',
      '--limit',
      '100',
    ]);
    if (!listed.ok)
      return release(`gh issue list («${m}») не отработал: ${listed.err || 'нет вывода'}`);
    try {
      chain.push({
        milestone: m,
        issues: JSON.parse(listed.out).sort((a, b) => a.number - b.number),
      });
    } catch (e) {
      return release(`ответ gh («${m}») не разобран: ${e.message}`);
    }
  }

  const { activeMilestone, nextIssue, totalOpen } = selectActive(chain);

  if (totalOpen > 0) {
    const sessionId = hook.session_id || 'unknown';
    const prev = readState(sessionId);
    const sessionBytes = transcriptBytes(hook.transcript_path);
    // Прогресс меряется суммой по всей цепочке — на стыке milestone счётчик не прыгает.
    const d = decide(
      prev,
      hook.stop_hook_active,
      totalOpen,
      maxIterations,
      sessionBytes,
      maxSessionBytes,
    );
    const st = {
      sessionId,
      iteration: d.iteration,
      openCount: totalOpen,
      milestone: activeMilestone,
    };

    if (d.kind === 'stall') {
      return release(
        `открытых issues не убавилось (${totalOpen}) — Claude застрял, цикл остановлен`,
      );
    }

    if (d.kind === 'session') {
      writeState(st);
      const mb = (sessionBytes / 1048576).toFixed(1);
      const capMb = (maxSessionBytes / 1048576).toFixed(1);
      return release(
        `сессия разрослась (${mb} МБ ≥ maxSessionBytes=${capMb} МБ). ` +
          `Открытых ещё ${totalOpen}. Заверши сессию и запусти НОВУЮ — контекст сбросится, ` +
          `цикл продолжит с чистого листа.`,
      );
    }

    if (d.kind === 'limit') {
      writeState(st);
      return release(
        `взято задач за прогон: ${d.iteration} (лимит maxIterations=${maxIterations}). ` +
          `Открытых ещё ${totalOpen}. Скажи «продолжай», чтобы взять следующую.`,
      );
    }

    writeState(st);

    const filled = fill(promptTemplate, { milestone: activeMilestone, branch });
    const chained = milestoneChain.length > 1;

    const prompt = [
      filled,
      '',
      chained ? `Активный milestone: «${activeMilestone}».` : '',
      `Следующая по очереди: #${nextIssue.number} — ${nextIssue.title}`,
      chained
        ? `Открытых issues во всей цепочке осталось: ${totalOpen}.`
        : `Открытых issues в milestone осталось: ${totalOpen}.`,
      // Ветку дописываем, только если промпт про неё сам не сказал, — иначе
      // Claude получит одно и то же указание дважды.
      branch && !promptTemplate.includes('{branch}') ? `Работай в ветке ${branch}.` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const note = chained
      ? `Ralph: осталось ${totalOpen} issues, беру #${nextIssue.number} (${activeMilestone}) — ${nextIssue.title}`
      : `Ralph: осталось ${totalOpen} issues, беру #${nextIssue.number} — ${nextIssue.title}`;

    return keepGoing(note, prompt);
  }

  // Issues кончились во всей цепочке — один PR.
  if (!branch)
    return release(`во всех milestone цепочки открытых issues нет; ветка не задана — PR не создаю`);

  const current = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (current !== branch) {
    return release(`issues кончились, но HEAD на «${current}», а не на «${branch}» — PR не создаю`);
  }

  const existing = gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number']);
  if (existing.ok && existing.out && existing.out !== '[]') {
    return release(`PR для ветки ${branch} уже открыт — цикл завершён`);
  }

  const base = gh(['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
  const baseBranch = base.ok && base.out ? base.out : 'master';

  const ahead = git(['rev-list', '--count', `origin/${baseBranch}..HEAD`]).out;
  if (ahead === '0')
    return release(`в ветке ${branch} нет коммитов поверх ${baseBranch} — PR не создаю`);

  const pushed = spawnSync('git', ['push', '-u', 'origin', branch], {
    encoding: 'utf8',
    cwd: PROJECT_DIR,
  });
  if (pushed.status !== 0) return release(`git push не прошёл: ${(pushed.stderr || '').trim()}`);

  // Тело PR: секция на каждый milestone цепочки со списком его закрытых issue.
  const sections = milestoneChain.map((m) => {
    const closed = gh([
      'issue',
      'list',
      '--milestone',
      m,
      '--state',
      'closed',
      '--json',
      'number,title',
      '--limit',
      '100',
    ]);
    let list = '';
    if (closed.ok) {
      try {
        list = JSON.parse(closed.out)
          .sort((a, b) => a.number - b.number)
          .map((i) => `- #${i.number} — ${i.title}`)
          .join('\n');
      } catch {
        /* секция обойдётся без списка */
      }
    }
    return `## ${m}\n\n${list || '_(нет закрытых issue)_'}`;
  });

  // Заголовок: prTitle, иначе имя единственного milestone / имена через « + ».
  const title = prTitle || milestoneChain.join(' + ');

  const body = [
    milestoneChain.length > 1
      ? 'Все issues цепочки milestone закрыты.'
      : `Все issues milestone «${milestoneChain[0]}» закрыты.`,
    '',
    sections.join('\n\n'),
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');

  const created = gh([
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    branch,
    '--title',
    title,
    '--body',
    body,
  ]);
  if (!created.ok) return release(`gh pr create не отработал: ${created.err || 'нет вывода'}`);

  try {
    fs.unlinkSync(STATE_PATH);
  } catch {
    /* нечего убирать */
  }

  return release(`issues кончились, PR открыт: ${created.out}`);
}

// Запуск как хук — только когда файл вызван напрямую (`node stop.js`), а не require() из теста.
if (require.main === module) {
  main();
}

module.exports = { decide, fill, selectActive };
