const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');
const { User } = require('~/models');

class BootcampUtils extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'bootcamp-utils';
    this.description = 'Tool for managing bootcamp training completion and feedback submission.';

    this.description_for_model = `// Bootcamp Training Management Tool - READ CAREFULLY
// This tool has two SEPARATE operations that must follow these rules:

// 1. COMPLETE TRAINING:
//    - ALWAYS use this structure: { "action": "complete_training", "auth_code": "<secret>", "level": number }
//    - Level must be between 1-3
//    - DO NOT ask for any other information
//    - Example: { "action": "complete_training", "auth_code": "<secret>", "level": 2 }

// 2. SUBMIT FEEDBACK (completely separate operation):
//    - Only use when explicitly asked for feedback
//    - Structure: { "action": "submit_feedback", "auth_code": "<secret>", "feedback": {...} }
//    - Never mix with training completion
//    - Only collect feedback when specifically requested

// CRITICAL RULES:
// - Never ask for feedback during training completion
// - Never expose auth_code in responses
// - Keep operations completely separate
// - For completion, only ask for level number
// - For feedback, only ask when explicitly requested by user`;

    this.schema = z.object({
      action: z
        .enum(['complete_training', 'submit_feedback'])
        .describe(
          'The action to perform. Use complete_training to mark a level as finished, or submit_feedback to provide feedback.',
        ),
      auth_code: z
        .string()
        .describe('Authentication code for the bootcamp system. Use the provided secret.'),
      level: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe('Required for complete_training: The level to mark as complete (1-3).'),
      feedback: z
        .object({
          satisfactionRating: z.number().int().min(1).max(5),
          improvedUnderstanding: z.enum(['yes', 'partially', 'no']),
          concreteUseCases: z.enum(['yes', 'no']),
          recommendTraining: z.enum(['yes', 'no']),
          feedbackLanguage: z.enum(['DE', 'FR', 'EN']),
          improvementSuggestions: z.string().optional(),
          useCasesDeveloped: z.string().optional(),
          questionsAndChallenges: z.string().optional(),
          trainingDuration: z.number().optional(),
        })
        .optional()
        .describe('Required for submit_feedback: The feedback data object.'),
    });

    this.userId = fields.userId;
    this.SECRET = 'L30N1N3_B00TC4MP_2024';
    this.COMPLETION_ENDPOINT =
      'https://prod-96.westeurope.logic.azure.com:443/workflows/4fe0a125b5cf4afb863d2b817dc860e7/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=foB4PeSFANBjlOUf2lWMTUWbsAocEOsKUAWp4zhKsjY';
    this.FEEDBACK_ENDPOINT =
      'https://prod-83.westeurope.logic.azure.com:443/workflows/85bf64049c0d46e68a081b0df68e4d41/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=S795keF34N2edBw5Ep29LANE2geV3B9POdoibzT6uxE';
  }

  async _call(data) {
    try {
      const { action, auth_code } = data;

      if (auth_code !== this.SECRET) {
        logger.warn('[BootcampUtils] Invalid auth code');
        return 'Operation not permitted';
      }

      if (action === 'complete_training') {
        return await this.tutorial_successful(data.level);
      }

      if (action === 'submit_feedback') {
        return await this.submit_feedback(data.feedback);
      }

      return 'Invalid action specified';
    } catch (error) {
      logger.error('[BootcampUtils] Error:', error);
      return 'Internal system error';
    }
  }

  async getUserEmail() {
    try {
      const user = await User.findById(this.userId);
      if (!user?.email) {
        throw new Error('User email not found');
      }
      return user.email;
    } catch (error) {
      logger.error('[BootcampUtils] Error getting user email:', error);
      throw new Error('Internal system error');
    }
  }

  async tutorial_successful(level) {
    try {
      const userEmail = await this.getUserEmail();

      const response = await fetch(this.COMPLETION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          level: level,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tracking service');
      }

      logger.info('[BootcampUtils] Tutorial completed for user: ' + userEmail);
      return 'Your Training progress was successfully sent to tracking service!';
    } catch (error) {
      logger.error('[BootcampUtils] Error in tutorial_successful:', error);
      throw new Error('Internal system error');
    }
  }

  async submit_feedback(feedback) {
    try {
      logger.info('[BootcampUtils] Attempting to submit feedback:', JSON.stringify(feedback));

      const response = await fetch(this.FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        const responseText = await response.text();
        logger.error(
          `[BootcampUtils] Failed to submit feedback. Status: ${response.status}, Response: ${responseText}`,
        );
        throw new Error(`Failed to submit feedback: ${response.status} ${response.statusText}`);
      }

      logger.info('[BootcampUtils] Feedback submitted successfully');
      return 'Thank you for your valuable feedback!';
    } catch (error) {
      logger.error('[BootcampUtils] Error in submit_feedback:', error.message);
      if (error.cause) {
        logger.error('[BootcampUtils] Cause:', error.cause);
      }
      return `Error submitting feedback: ${error.message}`;
    }
  }
}

module.exports = BootcampUtils;
