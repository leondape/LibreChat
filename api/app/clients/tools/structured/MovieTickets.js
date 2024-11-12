const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

class MovieTickets extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'movie_database';
    this.description = `Use this tool to request movie tickets and get information about available movies.
    - You can request tickets for movies in Germany or Austria
    - The tool will automatically check eligibility based on the user's company email
    - The tool will verify ticket availability and user limits
    - You can also query available movies`;

    this.description_for_model = `// Use this tool to help users request movie tickets and get movie information.
    // The user's email is automatically retrieved from their account - do not ask for it.
    // For ticket requests, you need:
    // - Movie name (will be mapped to ID)
    // - Number of tickets
    // - Country (Germany or Austria)
    // Guidelines:
    // - Always verify the movie exists before requesting tickets
    // - Inform users about any limitations or availability issues
    // - Handle errors gracefully and provide clear feedback
    // - Never ask for the user's email, it's handled automatically`;

    this.schema = z.object({
      action: z.enum(['get_movies', 'request_tickets']),
      country: z.enum(['Germany', 'Austria']).optional(),
      movie_name: z.string().optional(),
      ticket_count: z.number().min(1).optional(),
    });

    // Get user email from the request context
    this.req = fields.req;
    this.user = fields.user;
  }

  getUserEmail() {
    // The email should be available in the user object from the request
    if (!this.user?.email) {
      throw new Error('User email not found in session. Please ensure you are logged in.');
    }
    console.log('User email:', this.user.email);
    return this.user.email;
  }

  async _call(data) {
    try {
      const { action } = data;

      switch (action) {
        case 'get_movies':
          return await this.getMovies();
        case 'request_tickets':
          return await this.requestTickets(data);
        default:
          return 'Invalid action specified';
      }
    } catch (error) {
      logger.error('[MovieTickets] Error:', error);
      return `Error processing request: ${error.message}`;
    }
  }

  async getMovies() {
    // TODO: Implement actual API call to get movies
    return JSON.stringify({
      message: 'Movie list will be fetched from backend',
      note: 'This is a placeholder response',
    });
  }

  async requestTickets({ country, movie_name, ticket_count }) {
    const email = this.getUserEmail();

    // TODO: Implement actual API call to request tickets
    return JSON.stringify({
      message: 'Ticket request will be processed by backend',
      details: {
        email,
        country,
        movie_name,
        ticket_count,
      },
      note: 'This is a placeholder response',
    });
  }
}

module.exports = MovieTickets;
