-- Add the default-avatar colour solution name to every user.
--
-- Three steps so the column can be made NOT NULL on a table that already has
-- rows: add it nullable, assign a solution to each pre-existing user, then
-- enforce NOT NULL. New rows get their value from the app at registration
-- (CreateUserHandler -> pickAvatarColorName), so no database default is set.
--
-- The name list is inlined on purpose: a migration is a point-in-time snapshot
-- and must not depend on the current contents of AVATAR_COLOR_SOLUTIONS in
-- @video-meetings/shared, which may change later. It only has to be a subset of
-- the solutions that existed when this migration was written.

-- Step 1: add the column, nullable for now.
ALTER TABLE "User" ADD COLUMN "avatarColor" TEXT;

-- Step 2: give each existing user a random solution from the palette.
UPDATE "User"
SET "avatarColor" = (
  ARRAY[
    'red', 'orange', 'amber', 'green', 'teal',
    'blue', 'indigo', 'purple', 'pink', 'slate'
  ]
)[floor(random() * 10) + 1]
WHERE "avatarColor" IS NULL;

-- Step 3: now that every row has a value, enforce it.
ALTER TABLE "User" ALTER COLUMN "avatarColor" SET NOT NULL;
