const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');
const { User } = require('~/models');

class BootcampHelper extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'bootcamp-helper';
    this.description = 'Internal system tool for education tracking and feedback.';

    this.description_for_model = `// Use this tool for two separate purposes:
    // 1. Mark a bootcamp training as completed for the current user (action: complete_training, auth_code: secret, dont use other parameters)
    // 2. Collect and submit user feedback (optional) (action: submit_feedback, auth_code: secret, use feedback object)
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
      'https://prod-50.westeurope.logic.azure.com:443/workflows/15c04e5fe11f483c9add1ff6ed77557b/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lI_ydk5dJ0TyW-ora_kfucPBvRCVRXPvN-kGTJkXBh4';
    this.FEEDBACK_ENDPOINT =
      'https://prod-91.westeurope.logic.azure.com:443/workflows/b58a418ab03a4cd6be079966a0d789cc/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=E0czfWuxoDX6MS0oU4qk1SHsYsNkJRPx-cxFT7I0g0k';
  }

  async _call(data) {
    try {
      const { action, auth_code, feedback } = data;

      if (auth_code !== this.SECRET) {
        logger.warn('[BootcampHelper] Invalid auth code');
        return 'Operation not permitted';
      }

      switch (action) {
        case 'complete_training':
          return await this.tutorial_successful();

        case 'submit_feedback':
          if (!feedback) {
            return 'Feedback data is required for feedback submission';
          }
          return await this.submit_feedback(feedback);

        default:
          return 'Invalid action specified';
      }
    } catch (error) {
      logger.error('[BootcampHelper] Error:', error);
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
      logger.error('[BootcampHelper] Error getting user email:', error);
      throw new Error('Internal system error');
    }
  }

  async tutorial_successful() {
    try {
      const userEmail = await this.getUserEmail();

      const response = await fetch(this.COMPLETION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          level: this.level,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tracking service');
      }

      logger.info('[BootcampHelper] Tutorial completed for user: ' + userEmail);
      return 'Your Training progress was successfully sent to tracking service!';
    } catch (error) {
      logger.error('[BootcampHelper] Error in tutorial_successful:', error);
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

      logger.info('[BootcampHelper] Feedback submitted successfully');
      return 'Thank you for your valuable feedback!';
    } catch (error) {
      logger.error('[BootcampHelper] Error in submit_feedback:', error);
      throw new Error('Internal system error');
    }
  }
}

module.exports = BootcampHelper;
