import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Tìm .env từ thư mục dist/ lên 1 cấp (tức là thư mục gốc project)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export interface TfsConfig {
  baseUrl: string;
  collection: string;
  pat?: string;
  username?: string;
  password?: string;
  userId: string;
  userDisplayName: string;
  defaultRepoId: string;
  defaultProjectId: string;
  defaultAssignedTo: string;
}

export interface AppConfig {
  tfs: TfsConfig;
  rulesFilePaths: string[];
}

function loadConfig(): AppConfig {
  const baseUrl = process.env.TFS_BASE_URL;
  if (!baseUrl) throw new Error('TFS_BASE_URL is required in environment variables');

  const collection = process.env.TFS_COLLECTION || 'DefaultCollection';
  const userId = process.env.TFS_USER_ID || '';
  const userDisplayName = process.env.TFS_USER_DISPLAY_NAME || '';
  const defaultRepoId = process.env.TFS_DEFAULT_REPO_ID || '';
  const defaultProjectId = process.env.TFS_DEFAULT_PROJECT_ID || '';
  const defaultAssignedTo = process.env.TFS_DEFAULT_ASSIGNED_TO || '';

  const pat = process.env.TFS_PAT;
  const username = process.env.TFS_USERNAME;
  const password = process.env.TFS_PASSWORD;

  if (!pat && !(username && password)) {
    console.warn('[Config] Warning: No authentication configured (TFS_PAT or TFS_USERNAME+TFS_PASSWORD)');
  }

  // Load rules file paths
  const rulesPathsRaw = process.env.RULES_FILE_PATHS || '';
  const rulesFilePaths = rulesPathsRaw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      if (!fs.existsSync(p)) {
        console.warn(`[Config] Rules file not found: ${p}`);
        return false;
      }
      return true;
    });

  return {
    tfs: {
      baseUrl,
      collection,
      pat,
      username,
      password,
      userId,
      userDisplayName,
      defaultRepoId,
      defaultProjectId,
      defaultAssignedTo,
    },
    rulesFilePaths,
  };
}

export const appConfig = loadConfig();
