import { parseArgs } from 'node:util';
import process from 'node:process';
import { parseRegistrationInput, sendRegistration } from './index.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'site-id': { type: 'string' }, 'company-id': { type: 'string' },
      domain: { type: 'string' }, environment: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  const input = parseRegistrationInput({
    siteId: values['site-id'], companyId: values['company-id'],
    domain: values.domain, environment: values.environment,
  });
  if (!values.apply) {
    process.stdout.write(`Dry run: ${JSON.stringify(input)}\n`);
    return;
  }
  const result = await sendRegistration(input, {
    apiUrl: process.env.LTM_REGISTER_API_URL ?? '',
    token: process.env.LTM_DEPLOY_TOKEN ?? '',
  });
  process.stdout.write(`${result.status}: ${result.siteId}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Registration failed'}\n`);
  process.exitCode = 1;
});
