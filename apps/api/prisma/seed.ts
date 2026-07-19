import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seeds the fixed development account.
 *
 * Re-runnable on purpose, and it needs to be: the API e2e suite clears `user` between
 * tests (`prisma.user.deleteMany()` in the specs' `beforeEach`), so this account does
 * not survive a test run. Re-seed after one — `npm run db:seed -w @video-meetings/api`.
 * Nothing here is used by the tests themselves; they mint their own throwaway users.
 */
const TEST_EMAIL = 'test@mail.com';
const TEST_PASSWORD = 'Pasword1!';

// Matches BCRYPT_ROUNDS in src/auth/commands/handlers/register.handler.ts, so the hash
// this writes is indistinguishable from one produced by POST /auth/register.
const BCRYPT_ROUNDS = 10;

const prisma = new PrismaClient();

/** Sample meetings, so the account is worth opening rather than an empty screen. */
function sampleMeetings(userId: string) {
  const at = (day: number, hour: number) => new Date(Date.UTC(2026, 7, day, hour, 0, 0));
  return [
    {
      userId,
      title: 'Еженедельная синхронизация',
      description: 'Статус по задачам, блокеры, планы на неделю.',
      startTime: at(3, 9),
      endTime: at(3, 10),
    },
    {
      userId,
      title: 'Ретроспектива спринта',
      // No description: the meeting card renders differently without one.
      description: null,
      startTime: at(5, 14),
      endTime: at(5, 15),
    },
    {
      userId,
      title: 'Интервью с кандидатом',
      description: 'Техническая секция, 45 минут.',
      startTime: at(7, 11),
      endTime: at(7, 12),
    },
  ];
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  // Upsert, not create: re-running must not fail on the unique email. The hash is
  // rewritten each time so the password always matches what this file declares.
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash },
    // avatarColor is required; a fixed palette name (see AVATAR_COLOR_SOLUTIONS
    // in @video-meetings/shared) keeps the dev account's default avatar stable.
    // Only set on create — re-seeding leaves an existing account's colour alone.
    create: { email: TEST_EMAIL, passwordHash, avatarColor: 'blue' },
  });

  // Only the seed's own meetings are replaced, matched by title. A blanket
  // deleteMany on the user would also destroy meetings created by hand while
  // testing — and re-seeding is exactly what you do after an e2e run wipes the
  // account, so the command meant to restore it would quietly delete your work.
  const samples = sampleMeetings(user.id);
  await prisma.meeting.deleteMany({
    where: { userId: user.id, title: { in: samples.map((m) => m.title) } },
  });
  await prisma.meeting.createMany({ data: samples });

  const total = await prisma.meeting.count({ where: { userId: user.id } });
  console.log(
    `Seeded ${TEST_EMAIL} (password: ${TEST_PASSWORD}) with ${samples.length} sample meetings ` +
      `(${total} total on the account).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
