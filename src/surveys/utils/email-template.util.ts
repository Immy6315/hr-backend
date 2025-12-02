/**
 * Parse and clean email template content from Communication sheet
 */
export function cleanEmailTemplate(rawContent: string): string {
    if (!rawContent) return '';
    return rawContent.trim();
}

/**
 * Replace template variables with actual values
 * Example: {assesseename} -> "John Doe"
 */
export function replaceTemplateVariables(
    template: string,
    variables: Record<string, string>,
): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value || '');
    }

    return result;
}

/**
 * Convert plain text to HTML with proper formatting
 */
export function textToHtml(text: string): string {
    if (!text) return '';

    return text
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return '<br/>';
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                return `<p><a href="${trimmed}">${trimmed}</a></p>`;
            }
            return `<p>${line}</p>`;
        })
        .join('\n');
}

/**
 * Parse communication templates from Excel row data
 */
export interface CommunicationTemplate {
    subject: string;
    text: string;
    html: string;
    description?: string;
}

export interface CommunicationTemplates {
    participantInvite?: CommunicationTemplate;
    respondentInvite?: CommunicationTemplate;
    respondentReminder?: CommunicationTemplate;
    respondentCancellation?: CommunicationTemplate;
}

export function parseCommunicationTemplates(sheetData: any[][]): CommunicationTemplates {
    const templates: CommunicationTemplates = {};
    let currentSection: keyof CommunicationTemplates | null = null;
    let currentSubject = '';
    let currentDescription = '';
    let currentBodyLines: string[] = [];

    // Helper to save current section
    const saveCurrentSection = () => {
        if (currentSection && currentBodyLines.length > 0) {
            const bodyText = currentBodyLines.join('\n').trim();
            templates[currentSection] = {
                subject: currentSubject,
                text: bodyText,
                html: '', // Not using HTML anymore
                description: currentDescription,
            };
        }
        // Reset for next section
        currentSubject = '';
        currentDescription = '';
        currentBodyLines = [];
    };

    for (const row of sheetData) {
        // Get the first cell content (assuming content is in the first column)
        const cellContent = row[0] ? String(row[0]).trim() : '';

        if (!cellContent) continue;

        // Check for Section Headers
        if (cellContent.includes('PARTICIPANT INVITE MAIL')) {
            saveCurrentSection();
            currentSection = 'participantInvite';
            continue;
        }
        if (cellContent.includes('RESPONDENT INVITE MAIL')) {
            saveCurrentSection();
            currentSection = 'respondentInvite';
            continue;
        }
        if (cellContent.includes('RESPONDENT REMINDER MAIL')) {
            saveCurrentSection();
            currentSection = 'respondentReminder';
            continue;
        }
        if (cellContent.includes('RESPONDENT CANCELLATION MAIL')) {
            saveCurrentSection();
            currentSection = 'respondentCancellation';
            continue;
        }

        // If we are in a section, parse content
        if (currentSection) {
            // Skip warning line
            if (cellContent.includes('PLEASE DO NOT CHANGE THE WORDS')) {
                continue;
            }

            // Check for Description (starts with "This message is sent to")
            if (cellContent.toLowerCase().startsWith('this message is sent to')) {
                currentDescription = cellContent;
                continue;
            }

            // Check for Subject
            if (cellContent.startsWith('SUBJECT :')) {
                currentSubject = cellContent.replace('SUBJECT :', '').trim();
                continue;
            }

            // Otherwise, it's body content
            currentBodyLines.push(cellContent);
        }
    }

    // Save the last section
    saveCurrentSection();

    return templates;
}
