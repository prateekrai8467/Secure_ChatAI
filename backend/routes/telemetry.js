import { Router } from 'express';
import { getTelemetryStats, listTelemetryEvents } from '../controllers/telemetryController.js';

const router = Router();

router.get('/stats', getTelemetryStats);
router.get('/events', listTelemetryEvents);

export default router;
