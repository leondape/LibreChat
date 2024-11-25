const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

class HelpdeskUtils extends Tool {
  constructor() {
    super();
    this.name = 'helpdesk-utils';
    this.description = 'Internes Tool für Helpdesk-Feedback und Bewertungen.';

    this.description_for_model = `// Verwende dieses Tool um Helpdesk-Feedback zu sammeln und zu übermitteln
    // Guidelines:
    // - Sammle das Feedback auf konversationelle Art und Weise
    // - Alle erforderlichen Felder müssen ausgefüllt werden
    // - Optionale Felder werden nur gesendet, wenn sie auch angegeben wurden
    // - Keine Parameter-Details an den Benutzer weitergeben`;

    this.schema = z.object({
      zufriedenheitMitHelpdesk: z.number().int().min(1).max(5),
      anliegenGeloest: z.string(),
      kategorieDesAnliegens: z.string(),
      erneuteNutzung: z.string(),
      verbesserungsvorschlaege: z.string().optional(),
      verbesserungsbereiche: z.string().optional(),
    });

    this.FEEDBACK_ENDPOINT =
      'https://prod-217.westeurope.logic.azure.com:443/workflows/810562edd3b9412e8e398847621184f5/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=iJZMVsC1Pvxna_9yD_WG4qDTvvyMKbGUozYFgA1Ft64';
  }

  async _call(data) {
    try {
      return await this.submit_feedback(data);
    } catch (error) {
      logger.error('[HelpdeskUtils] Error:', error);
      return 'Interner Systemfehler';
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
        throw new Error('Feedback konnte nicht übermittelt werden');
      }

      logger.info('[HelpdeskUtils] Feedback erfolgreich übermittelt');
      return 'Vielen Dank für Ihr wertvolles Feedback!';
    } catch (error) {
      logger.error('[HelpdeskUtils] Error in submit_feedback:', error);
      throw new Error('Interner Systemfehler');
    }
  }
}

module.exports = HelpdeskUtils;
