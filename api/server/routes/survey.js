const express = require('express');
const {
  createSurveyNudgeHandler,
  createSurveyStatusHandler,
  createSurveySubmitHandler,
} = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.get(
  '/',
  createSurveyStatusHandler({
    getArmedSurveyFlight: db.getArmedSurveyFlight,
    hasSurveyResponse: db.hasSurveyResponse,
    getSurveyNudge: db.getSurveyNudge,
  }),
);
router.post(
  '/nudge',
  createSurveyNudgeHandler({
    getArmedSurveyFlight: db.getArmedSurveyFlight,
    hasSurveyResponse: db.hasSurveyResponse,
    recordSurveyNudge: db.recordSurveyNudge,
  }),
);
router.post(
  '/responses',
  createSurveySubmitHandler({
    getArmedSurveyFlight: db.getArmedSurveyFlight,
    hasSurveyResponse: db.hasSurveyResponse,
    createSurveyResponse: db.createSurveyResponse,
    getSurveyComparison: db.getSurveyComparison,
    getUserUsageSnapshot: db.getUserUsageSnapshot,
  }),
);

module.exports = router;
