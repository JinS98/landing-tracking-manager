export type RegistrationInput = {
  siteId: string;
  companyId: string;
  domain: string;
  environment: 'staging' | 'production';
};

export type RegistrationResult = RegistrationInput & { status: 'created' | 'existing' };

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

/** Client validation for operator feedback; the server must validate the same input again. */
export function parseRegistrationInput(raw: Record<string, unknown>): RegistrationInput {
  const siteId = text(raw.siteId, 'siteId');
  const companyId = text(raw.companyId, 'companyId');
  const domain = text(raw.domain, 'domain').toLowerCase();
  const environment = text(raw.environment, 'environment');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(siteId)) throw new Error('Invalid siteId');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(companyId)) throw new Error('Invalid companyId');
  if (domain.length > 253 || !/\.[a-z]{2,}$/.test(domain) ||
      !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Invalid domain');
  }
  if (environment !== 'staging' && environment !== 'production') throw new Error('Invalid environment');
  return { siteId, companyId, domain, environment };
}

export async function sendRegistration(
  input: RegistrationInput,
  options: { apiUrl: string; token: string; fetchImpl?: typeof fetch },
): Promise<RegistrationResult> {
  const url = new URL(options.apiUrl);
  if (url.protocol !== 'https:' || !url.pathname.endsWith('/internal/sites/register') ||
      url.username || url.password || url.search || url.hash) throw new Error('Invalid registration API URL');
  if (!options.token?.trim()) throw new Error('Deployment credential is required');
  const request = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await request(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
      });
      if (response.status === 200 || response.status === 201) {
        const result = await response.json() as RegistrationResult;
        if (result.siteId !== input.siteId || result.companyId !== input.companyId ||
            result.domain !== input.domain || result.environment !== input.environment ||
            !['created', 'existing'].includes(result.status)) {
          throw new Error('Invalid registration API response');
        }
        return result;
      }
      if (response.status < 500 || attempt === 1) throw new Error(`Registration API returned ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Registration API returned')) throw error;
      if (error instanceof Error && error.message === 'Invalid registration API response') throw error;
      if (attempt === 1) throw new Error('Registration request failed');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Registration request failed');
}
