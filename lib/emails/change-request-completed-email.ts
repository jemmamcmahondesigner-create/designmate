export function changeRequestCompletedEmailHtml(input: {
  creatorName: string;
  reviewTitle: string;
  reviewUrl: string;
}) {
  const safeCreator = input.creatorName.trim() || "A team member";
  const safeTitle = input.reviewTitle.trim() || "Review";
  return `
    <p style="margin:0 0 12px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;color:#2e1c1c;">
      ${safeCreator} has marked your change request as completed on ${safeTitle}.
    </p>
    <p style="margin:0;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;">
      <a href="${input.reviewUrl}" style="color:#6b1e2e;font-weight:600;">View review</a>
    </p>
  `;
}
