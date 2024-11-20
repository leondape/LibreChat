const availableTools = require('./manifest.json');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const TavilySearchResults = require('./structured/TavilySearchResults');
const YouTubeTool = require('./structured/YouTube');
const MovieTickets = require('./structured/MovieTickets');
const BootcampHelper = require('./structured/BootcampHelper');

module.exports = {
  availableTools,
  // Structured Tools
  DALLE3,
  StructuredSD,
  StructuredACS,
  YouTubeTool,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  MovieTickets,
  BootcampHelper,
};
