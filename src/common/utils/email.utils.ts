export const personalizeEmailBody = (
    templateBody: string,
    recipientName: string,
    targetUsers: string[] = [],
): string => {
    if (!templateBody) return '';

    let personalizedBody = templateBody;

    // Replace {assesseename} with recipientName (Case-insensitive, global)
    const recipientNameRegex = /\{assesseename\}/gi;
    personalizedBody = personalizedBody.replace(recipientNameRegex, recipientName);

    // Replace {listofassessee} with comma-separated targetUsers (Case-insensitive, global)
    const targetListRegex = /\{listofassessee\}/gi;
    const targetListString = targetUsers && targetUsers.length > 0 ? targetUsers.join(', ') : '';
    personalizedBody = personalizedBody.replace(targetListRegex, targetListString);

    return personalizedBody;
};
