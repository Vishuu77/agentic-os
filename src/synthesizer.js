"use strict";

function synthesize(outcomes, config, request) {
  const ok = outcomes
    .filter((o) => o.status === "ok" && o.text && o.text.trim())
    .slice()
    .sort((a, b) => a.durationMs - b.durationMs);
  const failed = outcomes.filter((o) => o.status !== "ok");

  if (!ok.length) {
    return {
      deliverable: null,
      headline: "No lane returned an answer.",
      winner: null,
      corroboration: [],
      failures: failed.map((o) => ({ lane: o.laneId, status: o.status, error: o.error })),
    };
  }

  const winner = ok[0];
  const corroboration = ok.slice(1).map((o) => ({
    lane: o.laneId,
    durationMs: o.durationMs,
    text: o.text.trim(),
  }));

  const settings = (config && config.synthesis) || {};
  const minLanes = settings.minLanesForMerge || 2;
  const merge = ok.length >= minLanes;

  const parts = [];
  parts.push(`# ${request.trim()}`);
  parts.push("");
  parts.push(`_Fastest lane: ${winner.laneId} (${(winner.durationMs / 1000).toFixed(1)}s). `
    + `${ok.length}/${outcomes.length} lanes answered._`);
  parts.push("");
  parts.push("## Answer");
  parts.push("");
  parts.push(winner.text.trim());

  if (merge) {
    parts.push("");
    parts.push("## Cross-lane additions");
    parts.push("");
    for (const c of corroboration) {
      parts.push(`### ${c.lane} (${(c.durationMs / 1000).toFixed(1)}s)`);
      parts.push("");
      parts.push(c.text);
      parts.push("");
    }
  }

  if (failed.length) {
    parts.push("");
    parts.push("## Lanes that did not contribute");
    parts.push("");
    for (const f of failed) parts.push(`- \`${f.laneId}\` — ${f.status}: ${f.error}`);
  }

  return {
    deliverable: parts.join("\n"),
    headline: `${winner.laneId} answered in ${(winner.durationMs / 1000).toFixed(1)}s`,
    winner: winner.laneId,
    corroboration,
    failures: failed.map((o) => ({ lane: o.laneId, status: o.status, error: o.error })),
  };
}

module.exports = { synthesize };
