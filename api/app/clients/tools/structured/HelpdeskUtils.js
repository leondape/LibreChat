const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

class HelpdeskUtils extends Tool {
  constructor() {
    super();
    this.name = 'helpdesk-utils';
    this.description = 'Tool zur Erfassung und Übermittlung von Helpdesk-Feedback.';

    this.description_for_model = `// Helpdesk Feedback Tool - BITTE SORGFÄLTIG LESEN
// Nutze dieses Tool um Helpdesk-Feedback zu sammeln und zu übermitteln.

// ERFORDERLICHE STRUKTUR:
{
  "zufriedenheitMitHelpdesk": number,    // Bewertung 1-5
  "anliegenGeloest": "Ja" | "Nein",
  "kategorieDesAnliegens": string,       // Eine der vordefinierten Kategorien
  "erneuteNutzung": "ja" | "nein"
}

// KATEGORIEN (exakt so verwenden):
// - "Personalabteilung"
// - "Administratives"
// - "IT-Support"
// - "Kinoticket-Buchung"
// - "Fragen zur Produktion"

// OPTIONALE FELDER:
{
  "verbesserungsvorschlaege": string,    // Verbesserungsvorschläge/Kommentare
  "verbesserungsbereiche": string        // Verbesserungsbereiche (aus Chatverlauf)
}

// WICHTIG:
// - Großschreibung bei "Ja"/"Nein" beachten
// - Kleinschreibung bei "ja"/"nein" beachten
// - Kategorien exakt wie vorgegeben verwenden`;

    this.schema = z.object({
      zufriedenheitMitHelpdesk: z
        .number()
        .int()
        .min(1)
        .max(5)
        .describe('Zufriedenheit mit dem Helpdesk (1=niedrigste, 5=höchste Bewertung)'),
      anliegenGeloest: z.string().describe('Wurde das Anliegen gelöst? (Ja/Nein)'),
      kategorieDesAnliegens: z
        .string()
        .describe(
          'Kategorie des Anliegens (Personalabteilung, Administratives, IT-Support, Kinoticket-Buchung, Fragen zur Produktion)',
        ),
      erneuteNutzung: z.string().describe('Wirst du den Helpdesk erneut nutzen? (ja/nein)'),
      verbesserungsvorschlaege: z
        .string()
        .optional()
        .describe('Verbesserungsvorschläge oder Kommentare'),
      verbesserungsbereiche: z
        .string()
        .optional()
        .describe(
          'Bereiche, in denen der Helpdesk verbessert werden muss (automatisch aus Chatverlauf erstellt)',
        ),
    });

    this.FEEDBACK_ENDPOINT =
      'https://prod-217.westeurope.logic.azure.com:443/workflows/810562edd3b9412e8e398847621184f5/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=iJZMVsC1Pvxna_9yD_WG4qDTvvyMKbGUozYFgA1Ft64';
  }

  async _call(data) {
    try {
      return await this.submit_feedback(data);
    } catch (error) {
      logger.error('[HelpdeskUtils] Fehler:', error);
      return 'Interner Systemfehler';
    }
  }

  async submit_feedback(feedback) {
    try {
      logger.info('[HelpdeskUtils] Versuche Feedback zu übermitteln:', JSON.stringify(feedback));

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
          `[HelpdeskUtils] Feedback konnte nicht übermittelt werden. Status: ${response.status}, Antwort: ${responseText}`,
        );
        throw new Error('Feedback konnte nicht übermittelt werden');
      }

      logger.info('[HelpdeskUtils] Feedback erfolgreich übermittelt');
      return 'Vielen Dank für Ihr wertvolles Feedback!';
    } catch (error) {
      logger.error('[HelpdeskUtils] Fehler bei der Feedback-Übermittlung:', error);
      throw new Error('Interner Systemfehler');
    }
  }
}

module.exports = HelpdeskUtils;
