import { envOr } from "./env";

function getLogsConfig() {
  return {
    azuracastContainer: envOr("DOCKER_CONTAINER_AZURACAST", "azuracast"),
    postgresContainer: envOr("DOCKER_CONTAINER_POSTGRES", envOr("DOCKER_CONTAINER_PG", "postgres")),
    pm2OutFile: envOr("PM2_OUT_FILE", "/var/log/pm2/radio-backend-out.log"),
    pm2ErrorFile: envOr("PM2_ERROR_FILE", "/var/log/pm2/radio-backend-error.log"),
    nginxAccessLog: envOr("NGINX_ACCESS_LOG", "/var/log/nginx/access.log"),
    nginxErrorLog: envOr("NGINX_ERROR_LOG", "/var/log/nginx/error.log"),
    postgresLogFile: envOr("POSTGRES_LOG_FILE", ""),
  };
}

// Export getters so values are read lazily after Infisical secrets are loaded.
// Also expose getLogsConfig for explicit runtime reads.
export const logsConfig = {
  get azuracastContainer() {
    return getLogsConfig().azuracastContainer;
  },
  get postgresContainer() {
    return getLogsConfig().postgresContainer;
  },
  get pm2OutFile() {
    return getLogsConfig().pm2OutFile;
  },
  get pm2ErrorFile() {
    return getLogsConfig().pm2ErrorFile;
  },
  get nginxAccessLog() {
    return getLogsConfig().nginxAccessLog;
  },
  get nginxErrorLog() {
    return getLogsConfig().nginxErrorLog;
  },
  get postgresLogFile() {
    return getLogsConfig().postgresLogFile;
  },
};

export { getLogsConfig };
