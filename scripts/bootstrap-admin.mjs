#!/usr/bin/env node

import {
  AdministrationUserNotFoundError,
  AdministratorAlreadyExistsError,
  PostgresAdministrationRepository,
  createDatabaseClient,
  databaseConfigFromEnv,
} from '../packages/database/dist/index.js';

const [emailInput, ...reasonParts] = process.argv.slice(2);
const email = String(emailInput ?? '').trim();
const reason = reasonParts.join(' ').trim();

if (!email || !email.includes('@')) {
  console.error('Usage: pnpm admin:bootstrap -- <confirmed-email> <reason>');
  process.exit(1);
}
if (reason.length < 8 || reason.length > 500) {
  console.error('The bootstrap reason must be between 8 and 500 characters.');
  process.exit(1);
}

const database = createDatabaseClient(databaseConfigFromEnv());
try {
  const repository = new PostgresAdministrationRepository(database);
  await repository.bootstrapFirstAdministrator({ email, reason });
  const [local, domain = ''] = email.split('@');
  console.log(`Initial administrator provisioned for ${local.slice(0, 2)}***@${domain}.`);
} catch (error) {
  if (error instanceof AdministratorAlreadyExistsError || error instanceof AdministrationUserNotFoundError) {
    console.error(error.message);
  } else {
    console.error('Administrator bootstrap failed. No role was assigned.');
  }
  process.exitCode = 1;
} finally {
  await database.close();
}
