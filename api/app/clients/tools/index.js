const availableTools = require('./manifest.json');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const OpenWeather = require('./structured/OpenWeather');
const createYouTubeTools = require('./structured/YouTube');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const TavilySearchResults = require('./structured/TavilySearchResults');
const YouTubeTool = require('./structured/YouTube');
const MovieTickets = require('./structured/MovieTickets');
const BootcampUtils = require('./structured/BootcampUtils');
const HelpdeskUtils = require('./structured/HelpdeskUtils');
const FluxAPI = require('./structured/FluxAPI');

/** @type {Record<string, TPlugin | undefined>} */
const manifestToolMap = {};

/** @type {Array<TPlugin>} */
const toolkits = [];

availableTools.forEach((tool) => {
  manifestToolMap[tool.pluginKey] = tool;
  if (tool.toolkit === true) {
    toolkits.push(tool);
  }
});

module.exports = {
  toolkits,
  availableTools,
  manifestToolMap,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  YouTubeTool,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  createYouTubeTools,
  TavilySearchResults,
  MovieTickets,
  BootcampUtils,
  HelpdeskUtils,
};
