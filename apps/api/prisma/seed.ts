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
    create: { email: TEST_EMAIL, passwordHash },
  });

  // Replaced rather than appended, so re-seeding leaves the same three meetings
  // instead of piling up duplicates. Cascade takes their files with them.
  await prisma.meeting.deleteMany({ where: { userId: user.id } });
  await prisma.meeting.createMany({ data: sampleMeetings(user.id) });

  const meetings = await prisma.meeting.count({ where: { userId: user.id } });
  console.log(`Seeded ${TEST_EMAIL} (password: ${TEST_PASSWORD}) with ${meetings} meetings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
