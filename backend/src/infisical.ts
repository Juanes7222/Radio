import { InfisicalSDK } from "@infisical/sdk";

interface InfisicalOptions {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment?: string;
  siteUrl?: string;
  secretPath?: string;
}

interface InfisicalConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: string;
  siteUrl: string;
  secretPath: string;
}

function validateOptions(options: InfisicalOptions): InfisicalConfig {
  if (!options.clientId) {
    throw new Error("INFISICAL_CLIENT_ID is required");
  }
  if (!options.clientSecret) {
    throw new Error("INFISICAL_CLIENT_SECRET is required");
  }
  if (!options.projectId) {
    throw new Error("INFISICAL_PROJECT_ID is required");
  }
  return {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    projectId: options.projectId,
    environment: options.environment ?? "dev",
    siteUrl: options.siteUrl ?? "https://app.infisical.com",
    secretPath: options.secretPath ?? "/",
  };
}

async function loadInfisicalSecrets(
  options: InfisicalOptions
): Promise<Record<string, string>> {
  const config = validateOptions(options);

  const client = new InfisicalSDK({
    siteUrl: config.siteUrl,
  });

  await client.auth().universalAuth.login({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  const response = await client.secrets().listSecretsWithImports({
    environment: config.environment,
    projectId: config.projectId,
    secretPath: config.secretPath,
    viewSecretValue: true,
    expandSecretReferences: true,
  });

  const secrets: Record<string, string> = {};
  for (const secret of response) {
    secrets[secret.secretKey] = secret.secretValue;
  }

  return secrets;
}

function mergeWithLocalEnv(infisicalSecrets: Record<string, string>): void {
  let overridden = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(infisicalSecrets)) {
    const localValue = process.env[key];
    const isLocalEmpty = localValue === undefined || localValue === "";

    if (isLocalEmpty) {
      process.env[key] = value;
      overridden++;
    } else {
      skipped++;
      console.log(
        `[Infisical] Skipping ${key}: already defined locally`
      );
    }
  }

  console.log(
    `[Infisical] Merged ${overridden} secrets, skipped ${skipped} (already defined locally).`
  );
}

function getInfisicalConfigFromEnv(): InfisicalOptions | null {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId = process.env.INFISICAL_PROJECT_ID;

  if (!clientId || !clientSecret || !projectId) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    projectId,
    environment: process.env.INFISICAL_ENVIRONMENT,
    siteUrl: process.env.INFISICAL_SITE_URL,
    secretPath: process.env.INFISICAL_SECRET_PATH,
  };
}

export async function initializeInfisicalSecrets(): Promise<boolean> {
  const config = getInfisicalConfigFromEnv();
  if (!config) {
    return false;
  }

  try {
    const secrets = await loadInfisicalSecrets(config);
    mergeWithLocalEnv(secrets);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Infisical] WARNING: Failed to load secrets from Infisical. Falling back to local .env. Error: ${message}`
    );
    return false;
  }
}
