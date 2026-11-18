// Builds every service and connects them. main.js calls this once at boot.
// Everything degrades gracefully: with no Supabase configuration the auth facade reports
// "not set up", answers stay on the device, and progress stays in localStorage.
import { getClient, isConfigured, configProblem } from './supabase.js';
import { createAuthService } from './authService.js';
import { createRelationshipService } from './relationshipService.js';
import { createCloudAnswers } from './cloudAnswers.js';
import { createAnswerService } from './answerService.js';
import { createProgressSync } from './progressSync.js';
import { createClosingService } from './closingService.js';

export function createServices(app) {
  const { bus } = app;
  const auth = createAuthService({ bus, getClient, isConfigured, configProblem });
  const relationship = createRelationshipService({ bus, getClient, auth });
  auth.isPaired = () => relationship.state.status === 'active';
  const cloud = createCloudAnswers({ getClient, auth, relationship });
  const answers = createAnswerService({ bus, app, auth, relationship, cloud });
  const sync = createProgressSync({ bus, auth, relationship, progress: app.progress, getClient });
  const closing = createClosingService({ bus, auth, relationship, getClient });
  return { auth, relationship, answers, sync, closing };
}
