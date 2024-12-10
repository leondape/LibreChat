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
    // - Number of tickets
    // - Country (Germany or Austria)
    // - CRITICAL: Never query movie without having asked for country first!
    // - Movie ID. Use the ID provided by the get_movies tool. You will use this ID for ticket requests, the user will interact with the movie name.
    // Guidelines:
    // - Always verify the movie exists before requesting tickets
    // - Inform users about any limitations or availability issues
    // - Handle errors gracefully and provide clear feedback
    // - Never ask for the user's email, it's handled automatically`;

    this.schema = z.object({
      action: z.enum(['get_movies', 'request_tickets']),
      country: z.enum(['Germany', 'Austria']).optional(),
      movieName: z.string().optional(),
      ticket_count: z.number().min(1).optional(),
    });

    this.userId = fields.userId;
    // this.apiBaseUrl = 'https://ticketing.leoninestudios.ai/api';
    this.apiBaseUrl = process.env.L9_TICKETING_URL || 'http://localhost:3080/api';
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
      console.log('[MovieTickets] Fetching movies from:', `${this.apiBaseUrl}/movies/available`);

      const response = await axios.get(`${this.apiBaseUrl}/movies?available=true`);
      console.log('[MovieTickets] Movies response:', response.data);

      // Just return titles for display
      return JSON.stringify(
        {
          message: 'Available movies retrieved successfully',
          movies: response.data.map((movie) => ({
            title: movie.title,
            id: movie._id,
          })),
        },
        null,
        2,
      );
    } catch (error) {
      console.error('[MovieTickets] Error fetching movies:', error);
      return 'Failed to retrieve available movies. Please try again later.';
    }
  }

  async requestTickets({ country, movieName, ticket_count }) {
    try {
      console.log('[MovieTickets] Starting ticket request for movie:', movieName);

      // Get movie info using the correct endpoint
      const movieResponse = await axios.get(
        `${this.apiBaseUrl}/movies?available=true&title=${encodeURIComponent(movieName)}`,
      );
      console.log('[MovieTickets] Movie lookup response:', movieResponse.data);

      if (!movieResponse.data || movieResponse.data.length === 0) {
        return `Movie "${movieName}" not found or not available. Please check if the movie is still available.`;
      }

      const movie = movieResponse.data[0];
      const user = await User.findById(this.userId);
      const email = user.email;
      const name = (user.name?.includes(' ') ? user.name?.split(' ')[0] : user.name) || '';

      const ticketPayload = {
        userEmail: email,
        name,
        numberOfTickets: ticket_count,
        movieId: movie._id,
        country,
      };

      console.log('[MovieTickets] Sending ticket request:', {
        endpoint: `${this.apiBaseUrl}/email/send`,
        payload: ticketPayload,
      });

      const response = await axios.post(`${this.apiBaseUrl}/email/send`, ticketPayload);

      return JSON.stringify(
        {
          message: 'Ticket request processed successfully',
          details: {
            movie: movie.title,
            tickets: ticket_count,
            country,
            status: response.data,
          },
        },
        null,
        2,
      );
    } catch (error) {
      console.error('[MovieTickets] Request failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      // Updated error handling to match the API response structure
      if (error.response?.data?.message) {
        return error.response.data.message;
      } else if (error.response?.status === 404) {
        return 'Movie not found or service unavailable.';
      } else if (error.response?.status === 400) {
        return 'Invalid request. Please check your inputs.';
      } else {
        return 'An error occurred while processing your ticket request. Please try again later.';
      }
    }
  }
}

module.exports = MovieTickets;
