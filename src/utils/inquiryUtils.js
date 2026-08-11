export const getDeletedRatio = (inquiries) => {
  const deleted = inquiries.filter(i => i.classification === "deleted").length;
  const nonLinked = inquiries.filter(i => i.classification && i.classification !== "linked").length;
  return nonLinked > 0 ? Math.round((deleted / nonLinked) * 100) : 0;
};

export const isCompletedBureau = (list) => {
  return list.length > 0 && list.every(i => ["linked", "deleted"].includes(i.classification));
};

export const getInquiryDelta = (prev, current, clientId, adminId, date) => {
  return ["Experian", "TransUnion", "Equifax"].map((bureau) => {
    const curr = current[bureau.toLowerCase()] || [];
    const prevDeleted = new Set(
      (prev[bureau.toLowerCase()] || [])
        .filter(i => i.classification === "deleted")
        .map(i => JSON.stringify(i))
    );
    const newDeleted = curr.filter(i => i.classification === "deleted" && !prevDeleted.has(JSON.stringify(i)));
    return newDeleted.length > 0
      ? { client_id: clientId, admin_id: adminId, bureau, removed_count: newDeleted.length, log_date: date }
      : null;
  }).filter(Boolean);
};
