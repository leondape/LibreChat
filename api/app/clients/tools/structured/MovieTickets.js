const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');
const { User } = require('~/models');
const axios = require('axios');

class MovieTickets extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'ticketing';
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

    this.userId = fields.userId;
    this.apiBaseUrl = 'https://ticketing.leoninestudios.ai/api';
  }

  async getUserEmail() {
    try {
      const user = await User.findById(this.userId);
      if (!user?.email) {
        throw new Error('User email not found. Please ensure you are logged in.');
      }
      return user.email;
    } catch (error) {
      logger.error('[MovieTickets] Error getting user email:', error);
      throw new Error('Could not retrieve user email. Please ensure you are logged in.');
    }
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
    try {
      const response = await axios.get(`${this.apiBaseUrl}/movies/available`);
      const movies = response.data;

      // Format the response to be more user-friendly
      const formattedMovies = movies.map((movie) => ({
        id: movie._id,
        title: movie.title,
        ticketLimit: movie.ticketLimit,
        isActive: movie.isActive,
        availableIn: {
          Germany: movie.germanTickets < movie.ticketLimit,
          Austria: movie.austriaTickets < movie.ticketLimit,
        },
      }));

      return JSON.stringify(
        {
          message: 'Available movies retrieved successfully',
          movies: formattedMovies,
        },
        null,
        2,
      );
    } catch (error) {
      logger.error('[MovieTickets] Error fetching movies:', error);
      return 'Failed to retrieve available movies. Please try again later.';
    }
  }

  async requestTickets({ country, movie_name, ticket_count }) {
    const email = await this.getUserEmail();

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
