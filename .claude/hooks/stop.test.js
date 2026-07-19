#!/usr/bin/env node
'use strict';

// Юнит-тесты чистых функций Ralph-хука. Запуск: `node .claude/hooks/stop.test.js`.
// Свой раннер, без jest: .claude/hooks не подключён к тестам репозитория.

const { decide, fill, selectActive, chainFromConfig } = require('./stop.js');

let pass = 0;
let fail = 0;
function eq(got, want, label) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} | ${label}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`,
  );
  ok ? pass++ : fail++;
}

const i = (n) => ({ number: n, title: `t${n}` });

console.log('--- selectActive: выбор активного milestone и суммарный прогресс ---');
eq(
  selectActive([
    { milestone: 'A', issues: [i(72), i(73)] },
    { milestone: 'B', issues: [i(80)] },
  ]),
  { activeMilestone: 'A', nextIssue: i(72), totalOpen: 3 },
  'первый непустой → активен A, next=72, сумма 3',
);
eq(
  selectActive([
    { milestone: 'A', issues: [] },
    { milestone: 'B', issues: [i(80), i(81)] },
  ]),
  { activeMilestone: 'B', nextIssue: i(80), totalOpen: 2 },
  'A пуст → переход к B, next=80, сумма 2',
);
eq(
  selectActive([
    { milestone: 'A', issues: [] },
    { milestone: 'B', issues: [] },
  ]),
  { activeMilestone: null, nextIssue: null, totalOpen: 0 },
  'всё закрыто → null/0 (сигнал к PR)',
);
eq(
  selectActive([{ milestone: 'Solo', issues: [i(5)] }]),
  { activeMilestone: 'Solo', nextIssue: i(5), totalOpen: 1 },
  'один milestone',
);
eq(selectActive([]), { activeMilestone: null, nextIssue: null, totalOpen: 0 }, 'пустая цепочка');

console.log('--- chainFromConfig: цепочка под любым ключом, массив или строка ---');
eq(chainFromConfig({ milestones: ['A', 'B'] }), ['A', 'B'], 'milestones массив');
eq(chainFromConfig({ milestone: ['A', 'B'] }), ['A', 'B'], 'milestone массив (не роняет хук)');
eq(chainFromConfig({ milestone: 'Solo' }), ['Solo'], 'milestone строка (обр. совместимость)');
eq(chainFromConfig({ milestones: 'Solo' }), ['Solo'], 'milestones строка');
eq(chainFromConfig({ milestones: ['A'], milestone: 'ign' }), ['A'], 'milestones главнее milestone');
eq(chainFromConfig({ milestone: '' }), [], 'пустая строка → []');
eq(chainFromConfig({}), [], 'нет ключей → []');
eq(
  chainFromConfig({ milestone: ['A', '', '  ', null, 'B'] }),
  ['A', 'B'],
  'пустые/null отсеиваются',
);

console.log('--- decide: стал/лимит/сессия/итерации ---');
const CAP = 1500000;
let s, d;
d = decide(null, false, 4, 1, 0, CAP);
eq(d, { kind: 'continue', iteration: 1 }, 'HITL старт → continue, iter 1');
s = { iteration: 1, openCount: 4 };
d = decide(s, true, 3, 1, 0, CAP);
eq(d, { kind: 'limit', iteration: 1 }, 'HITL: 1 задача в цепочке → limit');
s = { iteration: 1, openCount: 3 };
d = decide(s, false, 3, 1, 0, CAP);
eq(d, { kind: 'continue', iteration: 1 }, 'человек продолжил (hookActive=false) → сброс, continue');
s = { iteration: 1, openCount: 4 };
d = decide(s, true, 4, 5, 0, CAP);
eq(d, { kind: 'stall', iteration: 1 }, 'open не убавился → stall');
s = { iteration: 2, openCount: 9 };
d = decide(s, true, 8, 5, 1600000, CAP);
eq(d, { kind: 'session', iteration: 2 }, '1.6МБ ≥ 1.5МБ → session');
s = { iteration: 1, openCount: 9 };
d = decide(s, true, 8, 5, 50000, CAP);
eq(d, { kind: 'continue', iteration: 2 }, 'мало байт (пусть хоть тысячи строк) → не session');
s = { iteration: 99, openCount: 10 };
d = decide(s, true, 9, 0, 9000000, 0);
eq(d, { kind: 'continue', iteration: 100 }, 'оба лимита off → крутим');

console.log('--- fill: подстановка плейсхолдеров ---');
eq(fill('m={milestone} b={branch}', { milestone: 'M', branch: 'B' }), 'm=M b=B', 'оба ключа');
eq(
  fill('b={branch}', { milestone: 'M', branch: '' }),
  'b={branch}',
  'пустое значение не подставляется',
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
