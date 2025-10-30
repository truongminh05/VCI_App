export const toIsoDate = (d = new Date()) => d.toISOString().slice(0, 10);
export const formatHM = (d) => {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};
export const nowEpoch = () => Math.floor(Date.now() / 1000);
