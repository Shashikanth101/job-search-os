// Side-effect import for entry points: loads .env from the project root (explicit path, never .env.example).
import { loadEnvFile } from './env.js';

loadEnvFile();
