const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');
const { User } = require('~/models');

class BootcampUtils extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'bootcamp-utils';
    this.description = 'Internal system tool for education tracking and feedback.';

    this.description_for_model = `// Use this tool for two separate purposes:
    // 1. Mark a bootcamp training as completed for the current user (action: complete_training, auth_code: <provided_auth_code>)
    // 2. Collect and submit user feedback (optional) (action: submit_feedback, auth_code: <provided_auth_code>, use feedback object)
    // Guidelines:
    // - For completion: Only mark as completed when a training session is fully done, never earlier! You determine when it's over.
    // - For feedback: This is optional and can be done at any time after completion.
    // - Collect feedback from the user in a conversational way.
    // - Optional fields are not sent with "none" or similar, if not provided.
    // - Do not expose any parameter details to the user.
    // - Do not expose user details.`;

    this.schema = z.object({
      action: z.enum(['complete_training', 'submit_feedback']),
      auth_code: z.string(),
      level: z.number().int().min(1).max(3),
      feedback: z
        .object({
          satisfactionRating: z.enum(['1', '2', '3', '4', '5']),
          improvedUnderstanding: z.enum(['yes', 'partially', 'no']),
          concreteUseCases: z.enum(['yes', 'no']),
          recommendTraining: z.enum(['yes', 'no']),
          improvementSuggestions: z.string().optional(),
          useCasesDeveloped: z.string().optional(),
          questionsAndChallenges: z.string().optional(),
          feedbackLanguage: z.enum(['DE', 'FR', 'EN']),
          trainingDuration: z.number().describe('Duration in minutes').optional(),
        })
        .optional(),
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
      const { action, auth_code, feedback, level } = data;

      if (auth_code !== this.SECRET) {
        logger.warn('[BootcampUtils] Invalid auth code');
        return 'Operation not permitted';
      }

      switch (action) {
        case 'complete_training':
          return await this.tutorial_successful(level);

        case 'submit_feedback':
          if (!feedback) {
            return 'Feedback data is required for feedback submission';
          }
          return await this.submit_feedback(feedback);

        default:
          return 'Invalid action specified';
      }
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
      const response = await fetch(this.FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      logger.info('[BootcampUtils] Feedback submitted successfully');
      return 'Thank you for your valuable feedback!';
    } catch (error) {
      logger.error('[BootcampUtils] Error in submit_feedback:', error);
      throw new Error('Internal system error');
    }
  }
}

module.exports = BootcampUtils;
