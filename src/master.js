"use strict";

const ADAPTERS = {
  opencode: require("./adapters/opencode"),
  hermes: require("./adapters/hermes"),
  openclaw: require("./adapters/openclaw"),
};

const OUTPUT_CONTRACT = [
  "Answer directly. No preamble, no restating the question.",
  "Be concrete: name real tools, commands, files, numbers and dates.",
  "Flag anything you are unsure about instead of inventing it.",
  "Stay under 400 words.",
].join(" ");

function buildBrief(laneId, lane, request) {
  return [
    `You are one lane of a multi-agent system working a single master instruction in parallel.`,
    `Your lane: ${lane.label || laneId}.`,
    `Your remit: ${lane.role}`,
    ``,
    `MASTER INSTRUCTION:`,
    request.trim(),
    ``,
    `Produce your lane's contribution only, in the remit above.`,
    OUTPUT_CONTRACT,
  ].join("\n");
}

function resolveLanes(config, requested) {
  const all = config.lanes || {};
  const ids = requested && requested.length
    ? requested.filter((r) => Object.prototype.hasOwnProperty.call(all, r))
    : Object.keys(all).filter((k) => all[k].enabled !== false);
  return ids.map((id) => ({ id, lane: all[id], adapter: ADAPTERS[id] }));
}

module.exports = { buildBrief, resolveLanes, ADAPTERS, OUTPUT_CONTRACT };
