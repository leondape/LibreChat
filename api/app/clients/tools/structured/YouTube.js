const { Tool } = require('langchain/tools');
const { z } = require('zod');
const { youtube } = require('@googleapis/youtube');
const { YoutubeTranscript } = require('youtube-transcript');

class YouTubeTool extends Tool {
  constructor(fields) {
    super();
    this.name = 'youtube';
    this.apiKey = fields.YOUTUBE_API_KEY || this.getApiKey();
    this.description = `A tool for interacting with YouTube. Use this to search for videos, get video information, retrieve comments, and fetch video transcripts.
    Input should be a JSON object with 'action' and 'params' keys.
    Available actions:
    1. search_videos: Search for videos. Params: { query: string, maxResults?: number }
    2. get_video_info: Get information about a specific video. Params: { videoUrl: string }
    3. get_comments: Get comments for a video. Params: { videoUrl: string, maxResults?: number }
    4. get_video_transcript: Get the transcript of a video. Params: { videoUrl: string }`;
    this.schema = z.object({
      action: z.enum(['search_videos', 'get_video_info', 'get_comments', 'get_video_transcript']),
      params: z.object({
        query: z.string().optional(),
        videoUrl: z.string().optional(),
        maxResults: z.number().optional(),
      }),
    });
    this.youtubeClient = youtube({
      version: 'v3',
      auth: this.apiKey,
    });
  }

  getApiKey() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing YOUTUBE_API_KEY environment variable.');
    }
    return apiKey;
  }

  async _call(input) {
    try {
      const { action, params } = typeof input === 'string' ? JSON.parse(input) : input;

      switch (action) {
        case 'search_videos':
          return JSON.stringify(await this.searchVideos(params.query, params.maxResults));
        case 'get_video_info':
          return JSON.stringify(await this.getVideoInfo(params.videoUrl));
        case 'get_comments':
          return JSON.stringify(await this.getComments(params.videoUrl, params.maxResults));
        case 'get_video_transcript':
          return JSON.stringify(await this.getVideoTranscript(params.videoUrl));
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error('YouTube Tool Error:', error);
      return `Error: ${error.message}`;
    }
  }

  async searchVideos(query, maxResults = 5) {
    const response = await this.youtubeClient.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults,
    });

    return response.data.items.map((item) => ({
      title: item.snippet.title,
      description: item.snippet.description,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  }

  async getVideoInfo(videoUrl) {
    const videoId = this.extractVideoId(videoUrl);
    const response = await this.youtubeClient.videos.list({
      part: 'snippet,statistics',
      id: videoId,
    });

    const video = response.data.items[0];
    return {
      title: video.snippet.title,
      description: video.snippet.description,
      views: video.statistics.viewCount,
      likes: video.statistics.likeCount,
      comments: video.statistics.commentCount,
    };
  }

  async getComments(videoUrl, maxResults = 10) {
    const videoId = this.extractVideoId(videoUrl);
    const response = await this.youtubeClient.commentThreads.list({
      part: 'snippet',
      videoId: videoId,
      maxResults: maxResults,
    });

    return response.data.items.map((item) => ({
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      text: item.snippet.topLevelComment.snippet.textDisplay,
      likes: item.snippet.topLevelComment.snippet.likeCount,
    }));
  }

  async getVideoTranscript(videoUrl) {
    const videoId = this.extractVideoId(videoUrl);
    try {
      // Try to fetch English transcript
      try {
        const englishTranscript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        return {
          language: 'English',
          transcript: englishTranscript,
        };
      } catch (error) {
        console.log('English transcript not available, trying German...');
      }

      // If English is not available, try German
      try {
        const germanTranscript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'de' });
        return {
          language: 'German',
          transcript: germanTranscript,
        };
      } catch (error) {
        console.log('German transcript not available, fetching default transcript...');
      }

      // If neither English nor German is available, fetch the default transcript
      const defaultTranscript = await YoutubeTranscript.fetchTranscript(videoId);
      return {
        language: 'Unknown',
        transcript: defaultTranscript,
      };
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return {
        error: `Error fetching transcript: ${error.message}`,
      };
    }
  }

  extractVideoId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }
}

module.exports = YouTubeTool;
